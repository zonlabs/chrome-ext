import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAuthSuccessHtml } from './templates/authSuccess';

import { ChatAgent } from './agent/chat';
import { UserAgent } from './agent/user-agent';
import { auth } from './utils/auth';
import { corsOptions, preflightResponse } from './utils/cors';
import { handleAgentRequest } from './utils/agent-request';
import threadsRoute from './routes/threads';
import suggestionsRoute from './routes/suggestions';
import faviconRoute from './routes/favicon';

export { ChatAgent, UserAgent };
export { CodemodeRuntime } from '@cloudflare/codemode';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors(corsOptions));

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

export default {
  /**
   * Main fetch entry point for the Cloudflare Worker.
   * Handles CORS preflight, routes agent requests, and delegates everything else to the Hono app.
   */
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return preflightResponse(origin);
    }

    const agentResponse = await handleAgentRequest(request, env, origin);
    if (agentResponse) {
      return agentResponse;
    }

    return app.fetch(request, env);
  },
};
