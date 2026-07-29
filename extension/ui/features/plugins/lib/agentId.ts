/** Replace non-alphanumeric chars with underscores for safe agent IDs. */
export function sanitizeAgentIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Build a deterministic agent ID scoped to the given user for plugin routing. */
export function getPluginsAgentId(user: any): string {
  const userId = user?.id ? String(user.id) : '';
  return userId ? `plugins-user-${sanitizeAgentIdPart(userId)}` : '';
}
