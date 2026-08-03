import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(async (msg: unknown) => ({ type: 'success', success: true, echo: msg })),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: { query: vi.fn(async () => []), sendMessage: vi.fn() },
  },
}));

import { browser } from 'wxt/browser';
import { sendMessage } from '../../lib/messages';
import { getTabs } from '../../lib/tabs';

const sendMessageMock = vi.mocked(browser.runtime.sendMessage);

beforeEach(() => {
  sendMessageMock.mockReset();
  sendMessageMock.mockImplementation(async (msg: unknown) => {
    if ((msg as { type?: string })?.type === 'tabs:get') {
      return { type: 'tabs', tabs: [{ tabId: 1, url: 'https://example.com', title: 'Example', active: true }] };
    }
    return { type: 'success', success: true, echo: msg };
  });
});

describe('runtime messages', () => {
  it('sendMessage forwards the payload to browser.runtime.sendMessage', async () => {
    const result = await sendMessage({ type: 'auth:snapshot' });

    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'auth:snapshot' });
    expect(result).toEqual({ type: 'success', success: true, echo: { type: 'auth:snapshot' } });
  });

  it('getTabs maps the tabs:get response into browser tab records', async () => {
    const tabs = await getTabs();

    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'tabs:get' });
    expect(tabs).toEqual([{ id: 1, url: 'https://example.com', title: 'Example', active: true }]);
  });

  it('getTabs returns an empty array when the response is not a tabs response', async () => {
    sendMessageMock.mockImplementation(async () => ({ type: 'success', success: true }));

    await expect(getTabs()).resolves.toEqual([]);
  });
});
