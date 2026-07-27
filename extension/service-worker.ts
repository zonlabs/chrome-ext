import { ProductData, CanvasState } from './shared/types';

import { WORKER_URL } from './shared/constants';

let canvas: CanvasState = { tabs: {}, activeTabId: null };

async function saveCanvas(): Promise<void> {
  await chrome.storage.session.set({ canvas });
}

async function loadCanvas(): Promise<void> {
  const stored = await chrome.storage.session.get('canvas');
  if (stored.canvas) canvas = stored.canvas as CanvasState;
}

// Restore canvas from session storage on startup
const ready = loadCanvas().then(() => { updateBadge(); console.log('[SW] Canvas restored from storage:', Object.keys(canvas.tabs).length, 'tabs'); });

// Track active tab
chrome.tabs.onActivated.addListener((activeInfo) => {
  canvas.activeTabId = activeInfo.tabId;
});

// Remove product data when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete canvas.tabs[tabId];
  saveCanvas().then(() => {
    updateBadge();
    chrome.runtime.sendMessage({ type: 'canvas:updated' }).catch(() => {});
  });
});

// Listen for product data from content script
chrome.runtime.onMessage.addListener((
  message: any,
  sender: chrome.runtime.MessageSender
) => {
  if (message.type === 'product:detected' && sender.tab?.id) {
    const tabId = sender.tab.id;
    console.log('[SW] Received product:detected from tab', tabId, message.data?.name);
    ready.then(() => {
      canvas.tabs[tabId] = message.data as ProductData;
      saveCanvas().then(() => {
        updateBadge();
        chrome.runtime.sendMessage({ type: 'canvas:updated' }).catch(() => {});
      });
      console.log('[SW] Canvas now has', Object.keys(canvas.tabs).length, 'products');
    });
  }
});

// Open side panel on toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id! });
});

// Handle messages from side panel
chrome.runtime.onMessage.addListener((
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) => {
  ready.then(() => {
    if (message.type === 'canvas:get') {
      chrome.tabs.query({}, (allTabs) => {
        const tabs = allTabs
          .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('about:'))
          .map(t => ({
            url: t.url!,
            title: t.title || t.url!,
            tabId: t.id,
            active: t.active,
            product: canvas.tabs[t.id!] || null,
          }));
        sendResponse({ tabs });
      });
      console.log('[SW] canvas:get returning', Object.keys(canvas.tabs).length, 'tabs with products');
    } else if (message.type === 'canvas:remove') {
      const url = message.url as string;
      for (const [tid, p] of Object.entries(canvas.tabs)) {
        if (p.url === url) { delete canvas.tabs[Number(tid)]; break; }
      }
      saveCanvas();
      updateBadge();
      console.log('[SW] canvas:remove — canvas now has', Object.keys(canvas.tabs).length, 'products');
      sendResponse({ success: true });
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
  });
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


function updateBadge(): void {
  const count = Object.keys(canvas.tabs).length;
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

