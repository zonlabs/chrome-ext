import { apiFetch } from './client';

export async function fetchSuggestions(url: string, title: string, pageText: string, token: string): Promise<string[]> {
  const data = await apiFetch<{ suggestions: string[] }>('/api/suggestions', {
    method: 'POST',
    token,
    body: JSON.stringify({ url, title, pageText }),
  });
  return data.suggestions;
}
