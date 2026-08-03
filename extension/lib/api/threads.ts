import { clearAuth } from '../auth';
import { ApiError, apiFetch } from './client';

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
}

async function authedFetch<T>(
  path: string,
  init?: RequestInit & { token?: string; auth?: boolean },
): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearAuth();
    }
    throw error;
  }
}

export async function listThreads(): Promise<ChatThread[]> {
  const data = await authedFetch<{ threads: ChatThread[] }>('/api/threads');
  return data.threads;
}

export async function createThread(): Promise<ChatThread> {
  const data = await authedFetch<{ thread: ChatThread }>('/api/threads', {
    method: 'POST',
    body: JSON.stringify({ title: 'New Chat' }),
  });
  return data.thread;
}

export async function renameThread(id: string, title: string): Promise<ChatThread> {
  const nextTitle = title.length > 35 ? `${title.slice(0, 32)}...` : title;
  const data = await authedFetch<ChatThread | { thread: ChatThread }>(`/api/threads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: nextTitle }),
  });
  return 'thread' in data ? data.thread : data;
}

export async function deleteThread(id: string): Promise<void> {
  await authedFetch<unknown>(`/api/threads/${id}`, { method: 'DELETE' });
}
