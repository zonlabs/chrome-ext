import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage: vi.fn(async () => ({ type: 'authSnapshot', jwt: 'token' })) } },
}));

import { ApiError } from '../../lib/api/client';
import { listThreads, createThread, renameThread, deleteThread } from '../../lib/api/threads';
import { WORKER_URL } from '../../lib/constants';
import { browser } from 'wxt/browser';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api threads', () => {
  it('listThreads GETs /api/threads with the bearer token and returns the threads array', async () => {
    const threads = [{ id: 't1', title: 'Chat', createdAt: 1 }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ threads }), { status: 200 }));

    const result = await listThreads();

    expect(result).toEqual(threads);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WORKER_URL}/api/threads`);
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token');
  });

  it('createThread POSTs a New Chat thread and returns the created thread', async () => {
    const thread = { id: 't2', title: 'New Chat', createdAt: 1 };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ thread }), { status: 200 }));

    const result = await createThread();

    expect(result).toEqual(thread);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WORKER_URL}/api/threads`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'New Chat' });
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('renameThread PATCHes the thread and truncates long titles to 32 chars plus ellipsis', async () => {
    const thread = { id: 't1', title: 'x', createdAt: 1 };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ thread }), { status: 200 }));

    const longTitle = 'a'.repeat(40);
    const result = await renameThread('1', longTitle);

    expect(result).toEqual(thread);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WORKER_URL}/api/threads/1`);
    expect(init?.method).toBe('PATCH');
    const body = JSON.parse(String(init?.body));
    expect(body.title).toBe(`${'a'.repeat(32)}...`);
    expect(body.title).not.toBe(longTitle);
  });

  it('renameThread keeps short titles unchanged', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ thread: { id: 't1', title: 'short', createdAt: 1 } }), { status: 200 }));

    await renameThread('1', 'short');

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body)).title).toBe('short');
  });

  it('deleteThread DELETEs the thread', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await deleteThread('1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WORKER_URL}/api/threads/1`);
    expect(init?.method).toBe('DELETE');
  });

  it('throws ApiError with status 401 and clears the stored auth on a 401', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    const error = await listThreads().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    const clearAuthCalled = vi
      .mocked(browser.runtime.sendMessage)
      .mock.calls.some(([msg]) => (msg as { type?: string })?.type === 'auth:clear');
    expect(clearAuthCalled).toBe(true);
  });
});
