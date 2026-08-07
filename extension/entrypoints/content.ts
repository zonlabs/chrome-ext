import { browser } from 'wxt/browser';
import type { PageContextRequest } from '../lib/messages';
import { getFocusedElementInfo, getPageContext } from '../lib/page-context';

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    browser.runtime.onMessage.addListener((message: PageContextRequest, _sender, sendResponse) => {
      if (message.type === 'get:focusedElement') {
        sendResponse({ data: getFocusedElementInfo() ?? { text: '', placeholder: '', tag: '', selector: '' } });
        return true;
      }
      if (message.type === 'get:pageContext') {
        sendResponse({ data: getPageContext() });
        return true;
      }
      return false;
    });

    // Broadcast selected text to the side panel whenever the user selects or deselects text
    let selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleSelectionChange = () => {
      if (selectionDebounceTimer) clearTimeout(selectionDebounceTimer);
      selectionDebounceTimer = setTimeout(() => {
        const text = window.getSelection()?.toString().trim() ?? '';
        browser.runtime.sendMessage({ type: 'selection:changed', text }).catch(() => { });
      }, 100);
    };

    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('selectionchange', handleSelectionChange);
  },
});
