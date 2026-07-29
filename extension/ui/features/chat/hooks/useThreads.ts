import { useCallback, useEffect, useMemo, useState } from 'react';
import { LS_ACTIVE, LS_THREADS, WORKER_URL } from '../../../../shared/constants';

export interface ChatThread { id: string; title: string; createdAt: number; }
type AuthSnapshot = { jwt: string | null };
const THREAD_STATE_VERSION = 'obot_server_threads_v1';

function readAuthSnapshot(): Promise<AuthSnapshot> {
  return new Promise(resolve => chrome.runtime.sendMessage({ type: 'auth:snapshot' }, response => resolve({ jwt: response?.jwt ?? null })));
}
function clearLegacyThreadState() {
  if (localStorage.getItem(THREAD_STATE_VERSION)) return;
  localStorage.removeItem(LS_THREADS); localStorage.removeItem(LS_ACTIVE); localStorage.setItem(THREAD_STATE_VERSION, '1');
}
export function useThreads(enabled: boolean, onAuthLost: () => void) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    const { jwt } = await readAuthSnapshot();
    if (!jwt) { onAuthLost(); throw new Error('Your session has expired. Please sign in again.'); }
    const response = await fetch(`${WORKER_URL}/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, ...(options?.headers ?? {}) } });
    if (response.status === 401) { chrome.runtime.sendMessage({ type: 'auth:clear' }); onAuthLost(); throw new Error('Your session has expired. Please sign in again.'); }
    return response;
  }, [onAuthLost]);
  useEffect(() => {
    clearLegacyThreadState();
    if (!enabled) { setThreads([]); setActiveThreadId(null); return; }
    let disposed = false;
    void apiFetch('/threads').then(async response => { if (!response.ok) throw new Error('Unable to load chat history.'); const { threads: remote } = await response.json() as { threads: ChatThread[] }; if (!disposed) setThreads(remote); }).catch(() => {});
    return () => { disposed = true; };
  }, [enabled, apiFetch]);
  const createThread = useCallback(async () => {
    const response = await apiFetch('/threads', { method: 'POST', body: JSON.stringify({ title: 'New Chat' }) });
    if (!response.ok) throw new Error('Unable to create a chat.');
    const { thread } = await response.json() as { thread: ChatThread }; setThreads(previous => [thread, ...previous]); setActiveThreadId(thread.id); return thread;
  }, [apiFetch]);
  const updateActiveThreadTitle = useCallback(async (title: string) => {
    if (!activeThreadId) return; const current = threads.find(thread => thread.id === activeThreadId);
    if (!current || current.title !== 'New Chat') return;
    const nextTitle = title.length > 35 ? `${title.slice(0, 32)}...` : title;
    const response = await apiFetch(`/threads/${activeThreadId}`, { method: 'PATCH', body: JSON.stringify({ title: nextTitle }) });
    if (response.ok) setThreads(previous => previous.map(thread => thread.id === activeThreadId ? { ...thread, title: nextTitle } : thread));
  }, [activeThreadId, apiFetch, threads]);
  const handleDeleteThread = useCallback(async (id: string) => {
    const response = await apiFetch(`/threads/${id}`, { method: 'DELETE' }); if (!response.ok) return;
    setThreads(previous => previous.filter(thread => thread.id !== id)); if (activeThreadId === id) setActiveThreadId(null);
  }, [activeThreadId, apiFetch]);
  const activeThreadTitle = useMemo(() => threads.find(thread => thread.id === activeThreadId)?.title ?? '', [threads, activeThreadId]);
  return { threads, activeThreadId, setActiveThreadId, activeThreadTitle, createThread, updateActiveThreadTitle, handleNewChat: () => setActiveThreadId(null), handleDeleteThread };
}