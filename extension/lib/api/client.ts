import { getJwt } from '../auth';
import { WORKER_URL } from '../constants';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { token?: string; auth?: boolean },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let token = init?.token;
  if (token === undefined && init?.auth !== false) {
    token = await getJwt();
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(WORKER_URL + path, { ...init, headers });

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    let message = fallback;
    try {
      message = extractErrorMessage(await response.json(), fallback);
    } catch {
      message = fallback;
    }
    throw new ApiError(message, response.status);
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
