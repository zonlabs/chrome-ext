import { browser } from 'wxt/browser';
import type { PremiumUser, Tab } from './types';

export type ExtMessage =
  | { type: 'tabs:get' }
  | { type: 'config:get' }
  | { type: 'auth:snapshot' }
  | { type: 'auth:clear' }
  | { type: 'jwt:get' }
  | { type: 'auth:signin' }
  | { type: 'auth:signout' }
  | { type: 'auth:status' }
  | { type: 'sidePanel:open'; tabId: number };

export type ExtResponse =
  | { tabs: Tab[] }
  | { workerUrl: string }
  | { jwt?: string; user?: PremiumUser }
  | { jwt?: string }
  | { user?: PremiumUser }
  | { user?: PremiumUser; error?: string }
  | { success: boolean };

export type TabBroadcast =
  | { type: 'tab:activated'; tabId: number }
  | { type: 'tab:updated'; tabId: number; url: string };

export type PageContextRequest =
  | { type: 'get:pageContext' }
  | { type: 'get:focusedElement' };

export async function sendMessage<T extends ExtMessage>(message: T): Promise<ExtResponse> {
  return browser.runtime.sendMessage(message);
}
