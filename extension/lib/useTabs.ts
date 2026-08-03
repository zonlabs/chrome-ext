import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTabs, onTabBroadcast } from './tabs';
import { queryClient } from './query-client';

export function useTabs() {
  const query = useQuery({ queryKey: ['tabs'], queryFn: getTabs, staleTime: 10_000 });

  useEffect(
    () =>
      onTabBroadcast(() => {
        void queryClient.invalidateQueries({ queryKey: ['tabs'] });
      }),
    [],
  );

  return { tabs: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}
