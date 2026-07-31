# Obot — Worker

Cloudflare Workers backend (worker) for the Obot AI assistant.

## Stack

- **Framework**: [Hono](https://hono.dev/) — routes, middleware, CORS
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **AI Chat**: [`@cloudflare/ai-chat`](https://www.npmjs.com/package/@cloudflare/ai-chat) (`AIChatAgent`)
- **Code execution**: [`@cloudflare/codemode`](https://www.npmjs.com/package/@cloudflare/codemode) (`DynamicWorkerExecutor`)
- **LLM provider**: [`workers-ai-provider`](https://www.npmjs.com/package/workers-ai-provider) + Workers AI
- **Database**: D1 (SQLite) with Durable Objects for chat sessions
- **MCP**: MCP server management via `AIChatAgent.mcp` (standard + OAuth)

## Architecture

```
index.ts (fetch handler)
├── routeAgentRequest → ChatAgent DO (WebSocket chat)
└── Hono app
    ├── /api/chat        — REST chat endpoints
    ├── /api/auth        — Google OAuth
    ├── /api/threads     — Chat thread CRUD
    ├── /api/suggestions — Prompt suggestions
    ├── /api/favicon     — Domain favicon proxy
    └── /                — OAuth success page
```

### Durable Objects

**`ChatAgent`** (`src/agent/chat.ts`) — per-thread Durable Object extending `AIChatAgent`. Each chat thread is its own DO instance. Manages MCP servers directly via `this.addMcpServer()` / `this.removeMcpServer()`.

Callable methods exposed to the Chrome extension:
- `addPlugin(name, url)` — Connect an MCP server (returns `{ success, requiresAuth, authUrl, serverId }`)
- `removePlugin(serverId)` — Disconnect an MCP server
- `listPlugins()` — List connected MCP servers

### MCP Tools + Codemode

In `onChatMessage()`, plugin/server-side MCP tools are wrapped with `createCodeTool({ tools, executor })` using `DynamicWorkerExecutor`. The AI receives a single `codemode` tool and writes JavaScript to call plugin functions, rather than exposing raw MCP tools directly.

System prompt instructs the model to use `codemode` for plugin operations.

### Routes

| Route | Method | Description |
|---|---|---|
| `/api/chat/:threadId` | POST | Send a message or get history |
| `/api/auth/sign-in/social` | POST | Better Auth Google sign-in |
| `/api/auth/callback/google` | GET | Better Auth Google callback |
| `/api/auth/admin/ban-user` | POST | Admin-only user ban |
| `/api/auth/admin/unban-user` | POST | Admin-only user unban |
| `/api/threads` | GET | List user threads |
| `/api/threads` | POST | Create thread |
| `/api/threads/:id` | DELETE | Delete thread |
| `/api/suggestions` | GET | Prompt suggestions |
| `/api/favicon?hostname=` | GET | Favicon proxy (cached in KV) |
| `/api/auth/callback` | GET | MCP OAuth success page |

## Setup

```bash
cp .dev.vars.example .dev.vars   # Add secrets (AUTH_SECRET, etc.)
```

Set these authentication values before deploying:
- `GOOGLE_CLIENT_ID` — configured in `wrangler.jsonc`
- `GOOGLE_CLIENT_SECRET` — set with `wrangler secret put GOOGLE_CLIENT_SECRET`

Register the extension callback URL in Google Cloud Console: `https://llihcpikannlnjolgcmbebnoihokiffn.chromiumapp.org/google`.

Apply the auth-control migration before enabling production traffic:

```bash
npm run migrate
```

Set `ADMIN_USER_IDS` to a comma-separated list of Better Auth user IDs if you want admin access without changing the role column manually.

Required bindings (configured in `wrangler.jsonc`):
- `DB` — D1 database
- `CACHE` — KV namespace for favicon cache
- `AI` — Workers AI binding
- `ChatAgent` — Durable Object binding
- `LOADER` — Worker loader for codemode

## Development

```bash
cd worker
npm run dev            # wrangler dev
npm run migrate        # D1 migrations
```

## Deploy

```bash
npm run deploy         # wrangler deploy
```
