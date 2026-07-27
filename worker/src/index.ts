import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { routeAgentRequest } from 'agents';

import { ChatAgent } from './agent';
import { auth } from './utils/auth';
import authRoute from './routes/auth';
import threadsRoute from './routes/threads';
import suggestionsRoute from './routes/suggestions';
import faviconRoute from './routes/favicon';

export { ChatAgent };
export { CodemodeRuntime } from '@cloudflare/codemode';

const EXTENSION_ID = 'llihcpikannlnjolgcmbebnoihokiffn';
const ALLOWED_ORIGINS = new Set([
  `chrome-extension://${EXTENSION_ID}`,
  'https://api.linkos.in',
  'http://127.0.0.1:8787',
]);

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
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.route('/api', authRoute);

app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth(c.env).handler(c.req.raw);
});

app.route('/api', threadsRoute);
app.route('/api', suggestionsRoute);
app.route('/api', faviconRoute);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// OAuth success redirect — shown after completing MCP server authorization
app.get('/api/auth/callback', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorization Complete</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      background: #121214;
      color: #f4f4f5;
    }
    main {
      max-width: 420px;
      text-align: center;
    }
    .checkmark {
      width: 72px;
      height: 72px;
      margin: 0 auto 24px;
      position: relative;
    }
    .checkmark .badge {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 28px;
      height: 28px;
      background: #22c55e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid #121214;
    }
    .checkmark .badge svg {
      width: 16px;
      height: 16px;
    }
    h1 {
      margin-bottom: 12px;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.03em;
      color: #ffffff;
    }
    p {
      color: #a1a1aa;
      font-size: 15px;
      line-height: 1.6;
    }
    .hint {
      margin-top: 24px;
      color: #71717a;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <main>
    <div class="checkmark">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="100%" height="100%">
        <circle cx="75" cy="75" r="63" fill="#000000" stroke="#ffffff" stroke-width="14" />
        <circle cx="75" cy="75" r="30" fill="#e60000" />
        <circle cx="61" cy="61" r="9" fill="#ffffff" />
      </svg>
      <div class="badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 12l3 3 7-7"/>
        </svg>
      </div>
    </div>
    <h1>Authorization complete</h1>
    <p>The plugin has been connected successfully. Closing in <span id="countdown" style="font-weight: 600">3</span>s.</p>
  </main>
  <script>
    let secondsLeft = 3;
    const countdownEl = document.getElementById('countdown');
    const interval = setInterval(() => {
      secondsLeft--;
      if (countdownEl) {
        countdownEl.textContent = secondsLeft;
      }
      if (secondsLeft <= 0) {
        clearInterval(interval);
        window.close();
      }
    }, 1000);
    // Fallback close call
    setTimeout(() => {
      window.close();
    }, 3000);
  </script>
</body>
</html>`);
});

function corsify(response: Response, requestOrigin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', getCorsOrigin(requestOrigin));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': getCorsOrigin(origin),
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
