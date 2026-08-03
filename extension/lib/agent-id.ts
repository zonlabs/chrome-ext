import type { PremiumUser } from './types';

export function sanitizeAgentIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getPluginsAgentId(user: PremiumUser | null | undefined): string {
  const userId = user?.id ? String(user.id) : '';
  return userId ? `user-${sanitizeAgentIdPart(userId)}` : '';
}
