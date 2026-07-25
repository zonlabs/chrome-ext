export function sanitizeAgentIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getPluginsAgentId(user: any): string {
  const userId = user?.id ? String(user.id) : '';
  return userId ? `plugins-user-${sanitizeAgentIdPart(userId)}` : '';
}
