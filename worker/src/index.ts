import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { routeAgentRequest } from 'agents';
import { Env } from './db/schema';
import { ChatAgent } from './agent';
import chatRoute from './routes/chat';
// import extractRoute from './routes/extract';
// import priceHistoryRoute from './routes/price-history';
// import couponsRoute from './routes/coupons';
// import matchRoute from './routes/match';
import authRoute from './routes/auth';
import threadsRoute from './routes/threads';
import suggestionsRoute from './routes/suggestions';
import faviconRoute from './routes/favicon';

export { ChatAgent };

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: ['chrome-extension://*'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.route('/api', chatRoute);
// app.route('/api', extractRoute);
// app.route('/api', priceHistoryRoute);
// app.route('/api', couponsRoute);
// app.route('/api', matchRoute);
app.route('/api', authRoute);
app.route('/api', threadsRoute);
app.route('/api', suggestionsRoute);
app.route('/api', faviconRoute);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// OAuth success redirect — shown after completing MCP server authorization
app.get('/', (c) => {
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
      background: #f8fafc;
      color: #0f172a;
    }
    main {
      max-width: 420px;
      text-align: center;
    }
    .status-icon {
      width: 40px;
      height: 40px;
      margin: 0 auto 20px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #dcfce7;
      color: #15803d;
      font-size: 22px;
      font-weight: 700;
      line-height: 1;
    }
    h1 {
      margin-bottom: 10px;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: -0.03em;
    }
    p {
      color: #475569;
      font-size: 15px;
      line-height: 1.6;
    }
    strong {
      color: #0f172a;
      font-weight: 600;
    }
    .hint {
      margin-top: 18px;
      color: #64748b;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main>
    <div class="status-icon" aria-hidden="true">&#10003;</div>
    <h1>Authorization complete</h1>
    <p>The plugin has been connected successfully. You can close this tab and continue where you left off.</p>
    <p class="hint">This tab will close automatically in a few seconds.</p>
  </main>
  <script>
    if (window.opener) setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`);
});

function corsify(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
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
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) {
      if (agentResponse.status !== 101) {
        return corsify(agentResponse);
      }
      return agentResponse;
    }
    return app.fetch(request, env);
  },
};

