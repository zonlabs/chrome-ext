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
  },
});
