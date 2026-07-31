import { GOOGLE_CLIENT_ID, WORKER_URL } from './shared/constants';

// Track active tab changes and notify runtime
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.runtime.sendMessage({ type: 'tab:activated', tabId: activeInfo.tabId }).catch(() => {});
});

// Track tab navigation/updates and notify runtime if active tab URL updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    chrome.runtime.sendMessage({ type: 'tab:updated', tabId, url: changeInfo.url }).catch(() => {});
  }
});

// Open side panel on toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id! });
});

// Handle messages from side panel
chrome.runtime.onMessage.addListener((
  message: any,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) => {
  if (message.type === 'tabs:get') {
    chrome.tabs.query({}, (allTabs) => {
      const tabs = allTabs
        .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('about:'))
        .map(t => ({
          url: t.url!,
          title: t.title || t.url!,
          tabId: t.id,
          active: t.active,
        }));
      sendResponse({ tabs });
    });
  } else if (message.type === 'config:get') {
    sendResponse({ workerUrl: WORKER_URL });
  } else if (message.type === 'auth:snapshot') {
    chrome.storage.local.get(['jwt', 'user'], (result) => {
      sendResponse({ jwt: result.jwt ?? null, user: result.user ?? null });
    });
  } else if (message.type === 'auth:clear') {
    chrome.storage.local.remove(['jwt', 'user']).then(() => {
      sendResponse({ success: true });
    });
  } else if (message.type === 'jwt:get') {
    chrome.storage.local.get('jwt', (result) => {
      sendResponse({ jwt: result.jwt ?? null });
    });
  } else if (message.type === 'auth:signin') {
    handleSignIn().then(sendResponse);
  } else if (message.type === 'auth:signout') {
    handleSignOut().then(sendResponse);
  } else if (message.type === 'auth:status') {
    checkAuthStatus().then(sendResponse);
  } else if (message.type === 'sidePanel:open') {
    const tabId = message.tabId as number;
    if (tabId) chrome.sidePanel.open({ tabId });
    sendResponse({ success: true });
  }
  return true;
});

async function handleSignIn(): Promise<{ user: any } | { error: string }> {
  try {
    const redirectUri = chrome.identity.getRedirectURL('google');
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.search = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: 'id_token',
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      nonce,
      state,
    }).toString();

    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: googleAuthUrl.toString(),
      interactive: true,
    });
    if (!redirectUrl) return { error: 'Google sign-in failed' };

    const fragment = new URL(redirectUrl).hash.slice(1);
    const tokenParams = new URLSearchParams(fragment);
    if (tokenParams.get('state') !== state) return { error: 'Google sign-in state mismatch' };

    const idToken = tokenParams.get('id_token');
    if (!idToken) return { error: 'Google did not return an ID token' };

    const res = await fetch(`${WORKER_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        idToken: { token: idToken, nonce },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error?.message || data.error || 'Sign-in failed' };

    const sessionToken = res.headers.get('set-auth-token') || data.token;
    if (!sessionToken || !data.user) return { error: 'Better Auth returned an incomplete session' };

    const user = {
      ...data.user,
      picture: data.user.picture || data.user.image || null,
    };
    await chrome.storage.local.set({ jwt: sessionToken, user });
    return { user };
  } catch {
    return { error: 'Sign-in cancelled or failed' };
  }
}

async function handleSignOut(): Promise<{ success: boolean }> {
  const { jwt } = await chrome.storage.local.get('jwt');
  if (jwt) {
    await fetch(`${WORKER_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({}),
    }).catch(() => {});
  }
  await chrome.storage.local.remove(['jwt', 'user']);
  return { success: true };
}
async function checkAuthStatus(): Promise<{ user: any }> {
  const { user } = await chrome.storage.local.get('user');
  return { user: user || null };
}
