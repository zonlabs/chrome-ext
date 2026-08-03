import { browser } from 'wxt/browser';
import { getActiveTabId } from './tabs';

function extractPageContextStandalone(): { url: string; title: string; text: string } {
  const isVisible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || (el as HTMLElement).hidden) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  };
  const parts: string[] = [];
  const title = document.title?.trim();
  if (title) parts.push(`Title: ${title}`);
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const hLines: string[] = [];
  for (const h of headings) {
    if (!isVisible(h)) continue;
    const level = h.tagName.toLowerCase();
    const text = (h as HTMLElement).innerText?.trim();
    if (text) hLines.push(`${'#'.repeat(parseInt(level[1]))} ${text}`);
  }
  if (hLines.length) parts.push(`\nHeadings:\n${hLines.join('\n')}`);
  const paragraphs = document.querySelectorAll('p, li, td, th, blockquote, figcaption');
  const pLines: string[] = [];
  for (const el of paragraphs) {
    if (!isVisible(el)) continue;
    const text = (el as HTMLElement).innerText?.trim();
    if (text && text.length > 10) pLines.push(text.slice(0, 500));
  }
  if (pLines.length) parts.push(`\nContent:\n${pLines.slice(0, 40).join('\n')}`);
  return {
    url: window.location.href,
    title: document.title?.trim() || '',
    text: parts.join('\n').slice(0, 4000),
  };
}

export async function requestPageContext(tabId: number): Promise<{ url: string; title: string; text: string } | null> {
  try {
    const res = await browser.tabs.sendMessage(tabId, { type: 'get:pageContext' });
    return (res as { data?: { url: string; title: string; text: string } } | undefined)?.data ?? null;
  } catch {
    return null;
  }
}

export async function requestFocusedElement(tabId: number): Promise<{ text: string; placeholder: string; tag: string; selector: string } | null> {
  try {
    const res = await browser.tabs.sendMessage(tabId, { type: 'get:focusedElement' });
    return (res as { data?: { text: string; placeholder: string; tag: string; selector: string } } | undefined)?.data ?? null;
  } catch {
    return null;
  }
}

export async function getActiveTabPageContext(): Promise<{ url: string; title: string; text: string }> {
  const tabId = await getActiveTabId();
  if (tabId === undefined) return { url: '', title: '', text: '' };
  const ctx = await requestPageContext(tabId);
  if (ctx) return ctx;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: extractPageContextStandalone,
    });
    if (results?.[0]?.result) return results[0].result as { url: string; title: string; text: string };
  } catch {}
  return { url: '', title: '', text: '' };
}

export async function getFocusedElementText(): Promise<string> {
  const tabId = await getActiveTabId();
  if (tabId === undefined) return '';
  const info = await requestFocusedElement(tabId);
  return info?.text ?? '';
}
