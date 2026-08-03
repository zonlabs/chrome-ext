import { sendMessage } from './messages';
import type { PremiumUser } from './types';

export async function getJwt(): Promise<string | undefined> {
  const response = await sendMessage({ type: 'auth:snapshot' });
  return response.type === 'authSnapshot' ? response.jwt ?? undefined : undefined;
}

export async function getAuthUser(): Promise<PremiumUser | undefined> {
  const response = await sendMessage({ type: 'auth:snapshot' });
  return response.type === 'authSnapshot' ? response.user ?? undefined : undefined;
}

export async function clearAuth(): Promise<void> {
  await sendMessage({ type: 'auth:clear' });
}

export async function signIn(): Promise<PremiumUser | null> {
  const response = await sendMessage({ type: 'auth:signin' });
  if (response.type !== 'authError' || response.error) return null;
  return response.user ?? null;
}

export async function signOut(): Promise<void> {
  await sendMessage({ type: 'auth:signout' });
}
