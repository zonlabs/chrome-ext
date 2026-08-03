import { browser } from 'wxt/browser';
import { GOOGLE_CLIENT_ID, WORKER_URL } from '../lib/constants';
import type { ExtMessage, TabBroadcast } from '../lib/messages';

export default defineBackground(() => {
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.runtime.sendMessage({ type: 'tab:activated', tabId }).catch(() => {});
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url) {
      void browser.runtime.sendMessage({ type: 'tab:updated', tabId, url: changeInfo.url }).catch(() => {});
    }
  });

  browser.action.onClicked.addListener((tab) => {
    void browser.sidePanel.open({ tabId: tab.id! });
  });

  browser.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
    if (message.type === 'tabs:get') {
      browser.tabs.query({}).then((allTabs) => {
        const tabs = allTabs
          .filter((t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('about:'))
          .map((t) => ({
            url: t.url!,
            title: t.title || t.url!,
            tabId: t.id,
            active: t.active,
          }));
        sendResponse({ type: 'tabs', tabs });
      });
    } else if (message.type === 'auth:snapshot') {
      browser.storage.local.get(['jwt', 'user']).then((result) => {
        sendResponse({ type: 'authSnapshot', jwt: result.jwt ?? null, user: result.user ?? null });
      });
    } else if (message.type === 'auth:clear') {
      browser.storage.local.remove(['jwt', 'user']).then(() => {
        sendResponse({ type: 'success', success: true });
      });
    } else if (message.type === 'auth:signin') {
      handleSignIn().then((result) => sendResponse({ type: 'authError', ...result }));
    } else if (message.type === 'auth:signout') {
      handleSignOut().then((result) => sendResponse({ type: 'success', ...result }));
    } else if (message.type === 'sidePanel:open') {
      if (message.tabId) {
        browser.sidePanel.open({ tabId: message.tabId }).then(() => sendResponse({ type: 'success', success: true }));
      } else {
        sendResponse({ type: 'success', success: true });
      }
    }
    return true;
  });
});

async function handleSignIn(): Promise<{ user: any } | { error: string }> {
  try {
    const redirectUri = browser.identity.getRedirectURL('google');
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

    const redirectUrl = await browser.identity.launchWebAuthFlow({
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
    await browser.storage.local.set({ jwt: sessionToken, user });
    return { user };
  } catch {
    return { error: 'Sign-in cancelled or failed' };
  }
}

async function handleSignOut(): Promise<{ success: boolean }> {
  const { jwt } = await browser.storage.local.get('jwt');
  if (jwt) {
    await fetch(`${WORKER_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({}),
    }).catch(() => {});
  }
  await browser.storage.local.remove(['jwt', 'user']);
  return { success: true };
}
