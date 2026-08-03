import { browser } from 'wxt/browser';
import { sendMessage, type TabBroadcast } from './messages';

export interface BrowserTab {
  id: number;
  url?: string;
  title?: string;
  active?: boolean;
}

export async function getTabs(): Promise<BrowserTab[]> {
  const response = await sendMessage({ type: 'tabs:get' });
  if (response.type !== 'tabs') return [];
  return response.tabs.map((tab) => ({ id: tab.tabId ?? 0, url: tab.url, title: tab.title, active: tab.active }));
}

export async function getActiveTab(): Promise<BrowserTab | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return undefined;
  return { id: tab.id ?? 0, url: tab.url, title: tab.title, active: tab.active };
}

export async function getActiveTabId(): Promise<number | undefined> {
  return (await getActiveTab())?.id;
}

export async function openSidePanel(tabId?: number): Promise<void> {
  const id = tabId ?? (await getActiveTabId());
  if (!id) return;
  await sendMessage({ type: 'sidePanel:open', tabId: id });
}

function isTabBroadcast(message: unknown): message is TabBroadcast {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;
  const type = (message as { type: string }).type;
  return type === 'tab:activated' || type === 'tab:updated';
}

export function isRestrictedUrl(url?: string | null): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://')
  );
}

export function onTabBroadcast(handler: (msg: TabBroadcast) => void): () => void {
  const listener = (message: unknown) => {
    if (isTabBroadcast(message)) handler(message);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
