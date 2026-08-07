import type { AITool } from '@cloudflare/ai-chat/react';
import type { ClientToolsContext } from '../../../lib/types';
import { browser } from 'wxt/browser';
import { getFocusedElementText } from '../../../lib/page-context-client';

function isExpectedScreenshotPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("'activeTab' permission is not in effect") ||
    message.includes('Missing host permission') ||
    message.includes('Cannot capture a page with URL')
  );
}

export async function captureScreenshot(): Promise<string | null> {
  try {
    return await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
  } catch (error) {
    if (!isExpectedScreenshotPermissionError(error)) {
      console.error('[captureScreenshot] Error:', error);
    }
    return null;
  }
}

export function createClientTools(context: ClientToolsContext): Record<string, AITool<any, any>> {
  return {
    getFocusedElementText: {
      description:
        'Get the text value of the currently focused input field on the active tab (input, textarea, contenteditable div). Returns the raw text content, or a message if nothing is focused.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const text = await getFocusedElementText();
        return text || 'No focused input element found on this page.';
      },
    },
  };
}
