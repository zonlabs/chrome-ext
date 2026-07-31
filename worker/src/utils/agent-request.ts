import { routeAgentRequest } from 'agents';
import { checkAuth, checkAgentAccess } from './auth';
import { corsify } from './cors';

const AGENT_ROUTE_PREFIX = '/agents/';
const USER_ID_HEADER = 'x-authenticated-user-id';

/**
 * Authenticates and authorizes an incoming agent request.
 * Returns the authenticated request (with the user ID header attached) or an error Response.
 */
async function authorizeAgentRequest(
  request: Request,
  env: Env
): Promise<{ request: Request; userId: string } | Response> {
  const session = await checkAuth(request, env);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const accessError = await checkAgentAccess(request, session.user.id, env);
  if (accessError) return accessError;

  const headers = new Headers(request.headers);
  headers.delete(USER_ID_HEADER);
  headers.set(USER_ID_HEADER, session.user.id);

  return { request: new Request(request, { headers }), userId: session.user.id };
}

/**
 * Forwards a request to the agent runtime and normalizes the response:
 * WebSocket upgrades (101) pass through untouched, everything else gets CORS
 * headers, and routing errors become JSON 500 responses.
 * Returns null when the agent runtime did not handle the request.
 */
async function routeToAgent(
  request: Request,
  env: Env,
  origin: string | null,
  userId?: string
): Promise<Response | null> {
  try {
    const agentResponse = await routeAgentRequest(request, env, {
      props: userId ? { userId } : undefined,
    });
    if (!agentResponse) return null;
    return agentResponse.status === 101 ? agentResponse : corsify(agentResponse, origin);
  } catch (err) {
    console.error('[routeAgentRequest ERROR]', err);
    return corsify(
      new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 }),
      origin
    );
  }
}

function isAgentRequest(request: Request): boolean {
  return request.url.includes(AGENT_ROUTE_PREFIX);
}

/** OAuth callback redirects carry no session header; the agent DO validates its own state token. */
function isOAuthCallback(request: Request): boolean {
  return new URL(request.url).pathname.endsWith('/callback');
}

/**
 * Handles requests destined for agents (the /agents/* route space).
 * Returns a Response for agent requests, or null when the request should fall through to the Hono app.
 */
export async function handleAgentRequest(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response | null> {
  if (!isAgentRequest(request)) return null;

  if (isOAuthCallback(request)) {
    return routeToAgent(request, env, origin);
  }

  const authorized = await authorizeAgentRequest(request, env);
  if (authorized instanceof Response) return corsify(authorized, origin);

  return routeToAgent(authorized.request, env, origin, authorized.userId);
}
