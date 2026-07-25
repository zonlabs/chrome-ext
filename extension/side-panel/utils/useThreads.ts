import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

/** A single chat thread with its metadata. */
export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
}

import { WORKER_URL, LS_THREADS, LS_ACTIVE } from '../../shared/constants';

function readLocalThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(LS_THREADS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalThreads(threads: ChatThread[]) {
  localStorage.setItem(LS_THREADS, JSON.stringify(threads));
}

function readLocalActiveId(): string {
  const saved = localStorage.getItem(LS_ACTIVE);
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(LS_ACTIVE, id);
  return id;
}

async function getJwt(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'jwt:get' }, (response) => {
      resolve(response?.jwt ?? null);
    });
  });
}

async function apiFetch(path: string, options?: RequestInit) {
  const jwt = await getJwt();
  return fetch(`${WORKER_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

/** React hook for managing chat threads with localStorage persistence and server sync. */
export function useThreads(persist: boolean = true) {
  const [threads, setThreads] = useState<ChatThread[]>(() => persist ? readLocalThreads() : []);
  const [activeThreadId, setActiveThreadIdState] = useState<string>(persist ? readLocalActiveId() : crypto.randomUUID());

  const didSyncRef = useRef(false);

  useEffect(() => {
    if (!persist) return;
    setThreads(prev => prev.length === 0 ? readLocalThreads() : prev);
    if (didSyncRef.current) return;
    didSyncRef.current = true;

    apiFetch('/threads')
      .then(r => r.ok ? r.json() : { threads: [] })
      .then(({ threads: remote }: { threads: ChatThread[] }) => {
        if (!remote || remote.length === 0) return;
        setThreads(local => {
          const remoteIds = new Set(remote.map(t => t.id));
          const localOnly = local.filter(t => !remoteIds.has(t.id));
          const merged = [...remote, ...localOnly];
          merged.sort((a, b) => b.createdAt - a.createdAt);
          writeLocalThreads(merged);
          return merged;
        });
      })
      .catch(() => {});
  }, [persist]);

  const activeThreadTitle = useMemo(() => {
    const found = threads.find(t => t.id === activeThreadId);
    return found ? found.title : '';
  }, [threads, activeThreadId]);

  const setActiveThreadId = useCallback((id: string) => {
    setActiveThreadIdState(id);
    if (persist) localStorage.setItem(LS_ACTIVE, id);
  }, [persist]);

  const syncUpsert = useCallback((thread: ChatThread) => {
    apiFetch('/threads', {
      method: 'POST',
      body: JSON.stringify(thread),
    }).catch(() => {});
  }, []);

  const syncDelete = useCallback((id: string) => {
    apiFetch(`/threads/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const ensureThreadEntry = useCallback(() => {
    setThreads(prev => {
      const exists = prev.some(t => t.id === activeThreadId);
      if (exists) return prev;
      const thread: ChatThread = { id: activeThreadId, title: 'New Chat', createdAt: Date.now() };
      const updated = [thread, ...prev];
      if (persist) {
        writeLocalThreads(updated);
        syncUpsert(thread);
      }
      return updated;
    });
  }, [activeThreadId, syncUpsert, persist]);

  const updateActiveThreadTitle = useCallback((promptText: string) => {
    setThreads(prev => {
      const idx = prev.findIndex(t => t.id === activeThreadId);
      if (idx === -1) return prev;
      if (prev[idx].title !== 'New Chat') return prev;
      const truncated = promptText.length > 35 ? promptText.slice(0, 32) + '...' : promptText;
      const next = { ...prev[idx], title: truncated };
      const updated = [...prev];
      updated[idx] = next;
      if (persist) {
        writeLocalThreads(updated);
        syncUpsert(next);
      }
      return updated;
    });
  }, [activeThreadId, syncUpsert, persist]);

  const handleNewChat = useCallback(() => {
    const newId = crypto.randomUUID();
    setActiveThreadIdState(newId);
    if (persist) localStorage.setItem(LS_ACTIVE, newId);
  }, [persist]);

  const handleDeleteThread = useCallback((id: string) => {
    setThreads(prev => {
      const updated = prev.filter(t => t.id !== id);
      if (persist) writeLocalThreads(updated);
      if (id === activeThreadId) {
        const nextId = updated.length > 0 ? updated[0].id : crypto.randomUUID();
        setTimeout(() => setActiveThreadId(nextId), 0);
      }
      return updated;
    });
    if (persist) syncDelete(id);
  }, [activeThreadId, setActiveThreadId, syncDelete, persist]);

  return {
    threads,
    activeThreadId,
    setActiveThreadId,
    activeThreadTitle,
    updateActiveThreadTitle,
    handleNewChat,
    handleDeleteThread,
    ensureThreadEntry,
  };
}
