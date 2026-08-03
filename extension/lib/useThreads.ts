import { useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError } from './api/client';
import { createThread, deleteThread, listThreads, renameThread } from './api/threads';
import type { ChatThread } from './api/threads';
import { queryClient } from './query-client';

export function useThreads(enabled: boolean, onAuthLost: () => void) {
  const query = useQuery({ queryKey: ['threads'], queryFn: listThreads, enabled });

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) onAuthLost();
    },
    [onAuthLost],
  );

  const createMutation = useMutation({
    mutationFn: createThread,
    onSuccess: (thread) => {
      queryClient.setQueryData<ChatThread[]>(['threads'], (prev) => [thread, ...(prev ?? [])]);
    },
    onError: handleError,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameThread(id, title),
    onSuccess: (updated) => {
      queryClient.setQueryData<ChatThread[]>(['threads'], (prev) => (prev ?? []).map((t) => (t.id === updated.id ? updated : t)));
    },
    onError: handleError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteThread,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ChatThread[]>(['threads'], (prev) => (prev ?? []).filter((t) => t.id !== id));
    },
    onError: handleError,
  });

  return {
    threads: query.data ?? [],
    isLoading: query.isLoading,
    createThread: createMutation.mutateAsync,
    updateActiveThreadTitle: renameMutation.mutateAsync,
    handleDeleteThread: deleteMutation.mutateAsync,
  };
}
