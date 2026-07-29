import { AITool } from '@cloudflare/ai-chat/react';
import { ClientToolsContext } from '../../shared/types';

/** Helper to check if a URL is restricted by browser security policy (e.g. chrome://, chrome-extension://). */
function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('view-source:')
  );
}

/** Clean URL for matching (removes trailing slashes). */
function cleanUrl(u: string): string {
  try {
    const parsed = new URL(u);
    let pathname = parsed.pathname;
    if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return String(u || '').toLowerCase().replace(/\/$/, '');
  }
}

/** Extract URL string from raw input object if model nested parameters. */
function extractUrlString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('www.')) {
      return val;
    }
    if (val.startsWith('{')) {
      try { return extractUrlString(JSON.parse(val)); } catch { /* ignore */ }
    }
    return val;
  }
  if (typeof val === 'object') {
    if (typeof val.url === 'string') return extractUrlString(val.url);
    if (typeof val.href === 'string') return extractUrlString(val.href);
    if (typeof val.value === 'string') return extractUrlString(val.value);
    for (const k of Object.keys(val)) {
      const res = extractUrlString(val[k]);
      if (res.startsWith('http://') || res.startsWith('https://')) return res;
    }
  }
  return '';
}

/** Upload a base64 screenshot to the worker and return a public URL. */
async function uploadScreenshot(dataUrl: string): Promise<string> {
  const res = await fetch(`https://api.linkos.in/api/screenshot/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!res.ok) throw new Error(`Screenshot upload failed: ${res.status}`);
  const { url } = await res.json();
  return url;
}

function isExpectedScreenshotPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("'activeTab' permission is not in effect")
    || message.includes('Missing host permission')
    || message.includes('Cannot capture a page with URL');
}

/** Capture a screenshot of the visible browser tab. Returns null when Chrome has not granted tab access. */
export async function captureScreenshot(): Promise<string | null> {
  try {
    return await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
  } catch (error) {
    if (!isExpectedScreenshotPermissionError(error)) {
      console.error('[captureScreenshot] Error:', error);
    }
    return null;
  }
}

/** Get the active focused element's text/placeholder/tag from the current tab. Returns null on failure or if nothing focused. */
export async function getFocusedElementText(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || isRestrictedUrl(tab.url)) return null;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = document.activeElement;
        if (!el || !(el instanceof HTMLElement)) return null;
        const tag = el.tagName.toLowerCase();
        const isInput = tag === 'input' || tag === 'textarea' || el.isContentEditable;
        if (!isInput) return null;
        const value = ((el as HTMLInputElement).value ?? el.textContent ?? '').slice(0, 5000);
        if (!value) return null;
        return value;
      },
    });
    if (results?.[0]?.result) return results[0].result as string;
    return null;
  } catch (e) {
    console.error('[getFocusedElementText] Error:', e);
    return null;
  }
}

/** Get structured page context (URL, title, cleaned text) from the active tab. Returns null on failure or restricted URL. */
export async function getActiveTabPageContext(): Promise<{ url: string; title: string; text: string } | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || isRestrictedUrl(tab.url)) return null;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        function isVisible(el: Element): boolean {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || (el as HTMLElement).hidden) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return true;
        }
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
        const interactive = document.querySelectorAll('a, button, [role="button"]');
        const iLines: string[] = [];
        const seen = new Set<string>();
        for (const el of interactive) {
          if (!isVisible(el)) continue;
          const text = (el as HTMLElement).innerText?.trim() || (el as HTMLElement).ariaLabel || '';
          if (!text || seen.has(text)) continue;
          seen.add(text);
          const href = (el as HTMLAnchorElement).href || '';
          let hrefOut = '';
          if (href && el.tagName.toLowerCase() === 'a') {
            try { hrefOut = ` → ${new URL(href).pathname}`; } catch { hrefOut = ''; }
          }
          iLines.push(`  [${el.tagName.toLowerCase()}] ${text}${hrefOut}`);
        }
        if (iLines.length) parts.push(`\nInteractive Elements:\n${iLines.join('\n')}`);
        const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]');
        const inLines: string[] = [];
        for (const el of inputs) {
          if (!isVisible(el)) continue;
          const label = document.querySelector(`label[for="${(el as HTMLElement).id}"]`)?.textContent?.trim()
            || (el as HTMLInputElement).placeholder || (el as HTMLElement).ariaLabel || '';
          const value = (el as HTMLInputElement).value?.trim() || '';
          if (label) inLines.push(`  [${el.tagName.toLowerCase()}] ${label}${value ? ` = "${value}"` : ''}`);
        }
        if (inLines.length) parts.push(`\nInputs:\n${inLines.join('\n')}`);
        const paras = document.querySelectorAll('p, li, td, th, blockquote');
        const pLines: string[] = [];
        for (const el of paras) {
          if (!isVisible(el)) continue;
          const text = (el as HTMLElement).innerText?.trim();
          if (text && text.length > 10) pLines.push(text.slice(0, 500));
        }
        if (pLines.length) parts.push(`\nContent:\n${pLines.slice(0, 40).join('\n')}`);
        return { url: window.location.href, title: document.title || '', text: parts.join('\n').slice(0, 4000) };
      },
    });

    if (results?.[0]?.result) return results[0].result as { url: string; title: string; text: string };
    return null;
  } catch (e) {
    console.error('[getActiveTabPageContext] Error:', e);
    return null;
  }
}

/** Build the set of client-side tools available to the AI. */
export function createClientTools(context: ClientToolsContext): Record<string, AITool<any, any>> {
  return {
    // getTabContent: {
    //   description: 'Get the visible text content of a selected tab by its URL.',
    //   parameters: {
    //     type: 'object',
    //     properties: {
    //       url: { type: 'string', description: 'The full URL of the tab to read' },
    //       offset: { type: 'number', description: 'The character offset to start reading from (defaults to 0).' },
    //     },
    //     required: ['url'],
    //   },
    //   execute: async (input: unknown) => {
    //     const targetUrl = extractUrlString(input);
    //     const offset = Number((input as any)?.offset) || 0;

    //     if (!targetUrl) {
    //       return 'Invalid or missing URL parameter. Please specify a valid web tab URL.';
    //     }

    //     if (isRestrictedUrl(targetUrl)) {
    //       return 'Cannot read internal browser pages (such as chrome:// settings or extension pages).';
    //     }

    //     try {
    //       const tabs = await chrome.tabs.query({});
    //       const targetClean = cleanUrl(targetUrl);

    //       const tab = tabs.find(t => t.url && !isRestrictedUrl(t.url) && cleanUrl(t.url) === targetClean) ||
    //                   tabs.find(t => t.url && !isRestrictedUrl(t.url) && (t.url.includes(targetUrl) || targetUrl.includes(t.url)));

    //       if (!tab?.id) {
    //         return 'Tab not found.';
    //       }

    //       const results = await chrome.scripting.executeScript({
    //         target: { tabId: tab.id },
    //         func: () => document.body?.innerText || '',
    //       });

    //       if (results && results[0]) {
    //         const fullText = (results[0].result || '').replace(/\s+/g, ' ').trim();
    //         const totalLength = fullText.length;
    //         const chunk = fullText.slice(offset, offset + 1200);

    //         return {
    //           content: chunk || 'No content available at this offset',
    //           offset: offset,
    //           length: chunk.length,
    //           totalLength: totalLength,
    //           hasMore: offset + chunk.length < totalLength,
    //         };
    //       }
    //       return 'No content available';
    //     } catch (e) {
    //       console.error('[getTabContent] Error:', e);
    //       return `Error: ${e instanceof Error ? e.message : String(e)}`;
    //     }
    //   },
    // },
    // getActiveTabs: {
    //   description: "Get the URL and title of currently active or user-attached web page tabs.",
    //   parameters: {
    //     type: 'object',
    //     properties: {},
    //   },
    //   execute: async () => {
    //     try {
    //       const allTabs = await chrome.tabs.query({});

    //       // Filter active tab for valid non-restricted URLs
    //       const activeList = allTabs
    //         .filter(t => t.active && t.url && !isRestrictedUrl(t.url))
    //         .map(t => ({
    //           url: t.url!,
    //           title: t.title || '',
    //           type: 'active',
    //         }));

    //       // Filter user-attached tabs from sidebar selection
    //       const selectedList = context.getSelectedTabs()
    //         .filter(t => t.url && !isRestrictedUrl(t.url))
    //         .map(t => ({
    //           url: t.url,
    //           title: t.title || '',
    //           type: 'selected',
    //         }));

    //       const combined: { url: string; title: string; type: string }[] = [];
    //       const seen = new Set<string>();

    //       for (const item of activeList) {
    //         seen.add(item.url);
    //         combined.push(item);
    //       }

    //       for (const item of selectedList) {
    //         if (seen.has(item.url)) {
    //           const existing = combined.find(x => x.url === item.url);
    //           if (existing) existing.type = 'active & selected';
    //         } else {
    //           seen.add(item.url);
    //           combined.push(item);
    //         }
    //       }

    //       return combined;
    //     } catch (e) {
    //       console.error('[getActiveTabs] Error:', e);
    //       return `Error: ${e instanceof Error ? e.message : String(e)}`;
    //     }
    //   },
    // },
    // captureScreenshot: {
    //   description: 'Capture a screenshot of the current browser viewport. Returns a data URL (base64 JPEG).',
    //   parameters: {
    //     type: 'object',
    //     properties: {},
    //   },
    //   execute: async () => {
    //     const dataUrl = await captureScreenshot();
    //     if (dataUrl) return { screenshot: dataUrl, format: 'jpeg' };
    //     return 'Failed to capture screenshot (possibly a restricted page).';
    //   },
    // },
    getFocusedElementText: {
      description: 'Get the text value of the currently focused input field on the active tab (input, textarea, contenteditable div). Returns the raw text content, or a message if nothing is focused.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const text = await getFocusedElementText();
        return text ?? 'No focused input element found on this page.';
      },
    },
  };
}
