import { auth } from './auth';

/**
 * Authenticates an incoming request for agent routes by inspecting
 * the Authorization header or the token query parameter.
 */
export async function checkAuth(request: Request, env: Env) {
  let token = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!token) {
    try {
      const url = new URL(request.url);
      const queryToken =
        url.searchParams.get('token') ||
        url.searchParams.get('auth_token') ||
        url.searchParams.get('authorization');
      if (queryToken) token = `Bearer ${queryToken.trim()}`;
    } catch {
      // Ignore URL parse errors
    }
  }

  if (!token) return null;

  try {
    const headers = new Headers();
    headers.set('Authorization', token);
    const session = await auth(env).api.getSession({ headers });
    return session?.user ? session : null;
  } catch (err) {
    console.error('[checkAuth error]', err);
    return null;
  }
}

/**
 * Verifies whether the authenticated user owns the requested agent instance.
 */
export async function checkAgentAccess(
  request: Request,
  userId: string,
  env: Env
): Promise<Response | null> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    // /agents/{agent-name}/{instance-name}
    if (parts[0] !== 'agents' || parts.length < 3) {
      return null;
    }

    const agentName = parts[1].toLowerCase();
    const instanceName = parts[2];

    if (agentName === 'user-agent' || agentName === 'useragent') {
      if (instanceName !== `user-${userId}`) {
        return new Response("Forbidden: Cannot access another user's agent", { status: 403 });
      }

      // Check sub-agent thread ownership if path is /agents/user-agent/.../sub/chat-agent/{threadId}
      if (parts.length >= 6 && parts[3] === 'sub') {
        const subAgentName = parts[4].toLowerCase();
        const subInstanceName = parts[5];
        if (subAgentName === 'chat-agent' || subAgentName === 'chatagent') {
          const isOwner = await verifyThreadOwnership(env, userId, subInstanceName);
          if (!isOwner) {
            return new Response('Forbidden: Thread not owned by user', { status: 403 });
          }
        }
      }
    } else if (agentName === 'chat-agent' || agentName === 'chatagent') {
      const isOwner = await verifyThreadOwnership(env, userId, instanceName);
      if (!isOwner) {
        return new Response('Forbidden: Thread not owned by user', { status: 403 });
      }
    }

    return null;
  } catch (err) {
    console.error('[checkAgentAccess error]', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Checks KV storage to verify if a thread ID belongs to the specified user.
 */
export async function verifyThreadOwnership(
  env: Env,
  userId: string,
  threadId: string
): Promise<boolean> {
  try {
    const raw = await env.CACHE.get(`threads:${userId}`);
    if (!raw) return false;
    const threads = JSON.parse(raw) as Array<{ id: string }>;
    return Array.isArray(threads) && threads.some((t) => t && t.id === threadId);
  } catch {
    return false;
  }
}
