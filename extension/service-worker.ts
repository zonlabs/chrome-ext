import { WORKER_URL } from './shared/constants';

// Track active tab changes and notify runtime
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.runtime.sendMessage({ type: 'tab:activated', tabId: activeInfo.tabId }).catch(() => {});
});

// Track tab navigation/updates and notify runtime if active tab updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === 'complete' || changeInfo.url || changeInfo.title)) {
    chrome.runtime.sendMessage({ type: 'tab:updated', tabId, changeInfo }).catch(() => {});
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
    const { token } = await chrome.identity.getAuthToken({ interactive: true });
    if (!token) return { error: 'Sign-in failed' };
    const res = await fetch(`${WORKER_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      await chrome.identity.removeCachedAuthToken({ token });
      const err = await res.json();
      return { error: err.error || 'Sign-in failed' };
    }

    const data = await res.json();
    await chrome.storage.local.set({ jwt: data.token, user: data.user });
    return { user: data.user };
  } catch (err) {
    return { error: 'Sign-in cancelled or failed' };
  }
}

async function handleSignOut(): Promise<{ success: boolean }> {
  // JWT is stateless — just discard it locally. No server call needed.
  await chrome.storage.local.remove(['jwt', 'user']);
  // Revoke the Chrome identity token
  const authResult = await new Promise<{ token?: string }>((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (t) => resolve({ token: t.token }));
  });
  if (authResult.token) {
    await chrome.identity.removeCachedAuthToken({ token: authResult.token });
  }
  return { success: true };
}

async function checkAuthStatus(): Promise<{ user: any }> {
  const { user } = await chrome.storage.local.get('user');
  return { user: user || null };
}
