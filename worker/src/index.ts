import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { routeAgentRequest } from 'agents';
import { getAuthSuccessHtml } from './templates/authSuccess';

import { ChatAgent } from './agent';
import { McpAgent } from './agent/mcp-agent';
import { auth } from './utils/auth';
import threadsRoute from './routes/threads';
import suggestionsRoute from './routes/suggestions';
import faviconRoute from './routes/favicon';

export { ChatAgent, McpAgent };
export { CodemodeRuntime } from '@cloudflare/codemode';

const EXTENSION_ID = 'llihcpikannlnjolgcmbebnoihokiffn';
const ALLOWED_ORIGINS = new Set([
  `chrome-extension://${EXTENSION_ID}`,
  'https://api.linkos.in',
  'http://127.0.0.1:8787',
]);

/**
 * Returns the appropriate CORS origin header value based on the incoming request origin.
 */
function getCorsOrigin(requestOrigin: string | null): string {
  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
    return requestOrigin;
  }
  return `chrome-extension://${EXTENSION_ID}`;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  '/*',
  cors({
    origin: (origin) => (origin && ALLOWED_ORIGINS.has(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['set-auth-token'],
  })
);

app.get('/api/auth/callback', (c) => {
  return c.html(getAuthSuccessHtml());
});

app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth(c.env).handler(c.req.raw);
});

app.route('/api', threadsRoute);
app.route('/api', suggestionsRoute);
app.route('/api', faviconRoute);

app.get('/api/health', (c) => c.json({ status: 'ok' }));


/**
 * Attaches CORS headers to a Cloudflare Worker Response object.
 */
function corsify(response: Response, requestOrigin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', getCorsOrigin(requestOrigin));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  /**
   * Main fetch entry point for the Cloudflare Worker.
   * Intercepts agent requests via `routeAgentRequest` and delegates remaining HTTP requests to Hono.
   */
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': getCorsOrigin(origin),
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      const agentResponse = await routeAgentRequest(request, env);
      if (agentResponse) {
        return agentResponse.status === 101 ? agentResponse : corsify(agentResponse, origin);
      }
    } catch (err) {
      console.error('[routeAgentRequest ERROR]', err);
      return corsify(
        new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 }),
        origin
      );
    }

    return app.fetch(request, env);
  },
};
