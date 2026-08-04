import { browser } from 'wxt/browser';
import type { PremiumUser, Tab } from './types';

export type ExtMessage =
  | { type: 'tabs:get' }
  | { type: 'auth:snapshot' }
  | { type: 'auth:clear' }
  | { type: 'auth:signin' }
  | { type: 'auth:signout' }
  | { type: 'sidePanel:open'; tabId: number };

export type ExtResponse =
  | { type: 'tabs'; tabs: Tab[] }
  | { type: 'authSnapshot'; jwt?: string; user?: PremiumUser }
  | { type: 'authError'; user?: PremiumUser; error?: string }
  | { type: 'success'; success: boolean };

export type TabBroadcast =
  | { type: 'tab:activated'; tabId: number }
  | { type: 'tab:updated'; tabId: number; url: string };

export type PageContextRequest =
  | { type: 'get:pageContext' }
  | { type: 'get:focusedElement' };

export type ContentScriptBroadcast =
  | { type: 'selection:changed'; text: string };

export async function sendMessage<T extends ExtMessage>(message: T): Promise<ExtResponse> {
  return browser.runtime.sendMessage(message);
}
