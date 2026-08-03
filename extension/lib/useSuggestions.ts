import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getJwt } from './auth';
import { fetchSuggestions } from './api/suggestions';
import { getActiveTabPageContext } from './page-context-client';
import { isRestrictedUrl } from './tabs';

const suggestionsCache = new Map<string, string[]>();
const callTimes: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  while (callTimes.length && now - callTimes[0] > 60000) callTimes.shift();
  if (callTimes.length >= 5) return true;
  callTimes.push(now);
  return false;
}

export function useSuggestions(url: string | null, enabled: boolean) {
  const debouncedUrl = useDebouncedValue(url, 500);
  const isRestricted = isRestrictedUrl(url) || isRestrictedUrl(debouncedUrl);

  const query = useQuery({
    queryKey: ['suggestions', debouncedUrl],
    queryFn: async () => {
      const targetUrl = debouncedUrl ?? '';
      if (isRestrictedUrl(targetUrl)) return [];
      if (isRateLimited()) {
        const cached = suggestionsCache.get(targetUrl);
        if (cached) return cached;
        throw new Error('suggestion-rate-limited');
      }
      const ctx = await getActiveTabPageContext();
      const token = await getJwt();
      if (!token) return [];
      const suggestions = await fetchSuggestions(targetUrl, ctx.title, ctx.text, token);
      suggestionsCache.set(targetUrl, suggestions);
      return suggestions;
    },
    enabled: !!debouncedUrl && !isRestricted && enabled,
    retry: false,
    staleTime: 0,
    placeholderData: () => suggestionsCache.get(debouncedUrl ?? ''),
  });

  return {
    suggestions: isRestricted ? [] : (query.data ?? []),
    isLoading: isRestricted ? false : query.isLoading,
  };
}
