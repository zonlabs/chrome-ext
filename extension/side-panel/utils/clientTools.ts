import { AITool } from '@cloudflare/ai-chat/react';
import { ClientToolsContext } from '../../shared/types';

/** Build the set of client-side tools (getTabContent, getActiveTabs) available to the AI. */
export function createClientTools(context: ClientToolsContext): Record<string, AITool<any, any>> {
  return {
    getTabContent: {
      description: 'Get the visible text content of a selected tab by its URL. Use this to read product details, reviews, or any page info from tabs the user has shared.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL of the tab to read' },
          offset: { type: 'number', description: 'The character offset to start reading from (defaults to 0). Use this to paginate and read long pages in chunks.' },
        },
        required: ['url'],
      },
      execute: async (input: unknown) => {
        console.log('[getTabContent] execute called with input:', input);
        const { url, offset = 0 } = input as { url: string; offset?: number };
        console.log('[getTabContent] url:', url, 'offset:', offset);
        
        const cleanUrl = (u: string) => {
          try {
            const parsed = new URL(u);
            let pathname = parsed.pathname;
            if (pathname.endsWith('/')) {
              pathname = pathname.slice(0, -1);
            }
            return `${parsed.protocol}//${parsed.host}${pathname}`;
          } catch {
            return u.toLowerCase().replace(/\/$/, '');
          }
        };

        try {
          const tabs = await chrome.tabs.query({});
          console.log('[getTabContent] tabs found:', tabs.length, 'looking for:', url);
          
          const targetClean = cleanUrl(url);
          let tab = tabs.find(t => t.url && cleanUrl(t.url) === targetClean);
          if (!tab && url) {
            tab = tabs.find(t => t.url && (t.url.includes(url) || url.includes(t.url)));
          }

          console.log('[getTabContent] matched tab:', tab?.id, tab?.url);
          if (!tab?.id) {
            return 'Tab not found';
          }

          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              return document.body?.innerText || '';
            }
          });

          if (results && results[0]) {
            const fullText = (results[0].result || '').replace(/\s+/g, ' ').trim();
            const totalLength = fullText.length;
            const chunk = fullText.slice(offset, offset + 2500);
            console.log('[getTabContent] executeScript total len:', totalLength, 'sliced chunk len:', chunk.length);
            
            return {
              content: chunk || 'No content available at this offset',
              offset: offset,
              length: chunk.length,
              totalLength: totalLength,
              hasMore: offset + chunk.length < totalLength
            };
          }
          return 'No content available';
        } catch (e) {
          console.error('[getTabContent] Error:', e);
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    },
    getActiveTabs: {
      description: "Get the URL, title, and selection state of the user's currently active tabs (focused across windows) and any tabs the user has explicitly selected/attached in the sidebar.",
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        console.log('[getActiveTabs] execute called');
        try {
          // 1. Get active tabs across all windows
          const activeChromeTabs = await chrome.tabs.query({ active: true });
          const activeList = activeChromeTabs
            .filter(t => t.url)
            .map(t => ({
              url: t.url!,
              title: t.title || '',
              type: 'active'
            }));

          // 2. Get user selected/attached tabs from context
          const selectedList = context.getSelectedTabs().map(t => ({
            url: t.url,
            title: t.title || '',
            type: 'selected'
          }));

          // 3. Combine and deduplicate by URL
          const combined: { url: string; title: string; type: string }[] = [];
          const seen = new Set<string>();

          // Add active tabs first
          for (const item of activeList) {
            seen.add(item.url);
            combined.push(item);
          }

          // Add selected tabs (if not already added, otherwise mark as both)
          for (const item of selectedList) {
            if (seen.has(item.url)) {
              // Update type to show it is both
              const existing = combined.find(x => x.url === item.url);
              if (existing) {
                existing.type = 'active & selected';
              }
            } else {
              seen.add(item.url);
              combined.push(item);
            }
          }

          console.log('[getActiveTabs] combined list:', combined);
          return combined;
        } catch (e) {
          console.error('[getActiveTabs] Error:', e);
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    },
  };
}
