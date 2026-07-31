# Obot — Worker

Cloudflare Workers backend for the Obot AI assistant. Auth (Better Auth + Google sign-in), a per-user / per-thread agent mesh over Durable Objects, MCP plugin hosting, and rate-limited REST APIs for the Chrome extension.

## Stack

- **Framework**: [Hono](https://hono.dev/) — routes, middleware, CORS
- **Auth**: [Better Auth](https://www.better-auth.com/) (`better-auth`, `@better-auth/infra`) with the Drizzle adapter
- **AI Chat**: [`@cloudflare/ai-chat`](https://www.npmjs.com/package/@cloudflare/ai-chat) (`AIChatAgent`), built on [`agents`](https://www.npmjs.com/package/agents) (`Agent`, Durable Objects)
- **AI runtime**: [`ai`](https://www.npmjs.com/package/ai) (Vercel AI SDK) + [`workers-ai-provider`](https://www.npmjs.com/package/workers-ai-provider) → Workers AI
- **Code execution**: [`@cloudflare/codemode`](https://www.npmjs.com/package/@cloudflare/codemode) (`CodemodeRuntime`)
- **Database**: D1 (SQLite) via [drizzle-orm](https://www.npmjs.com/package/drizzle-orm)
- **MCP**: [`mcp`](https://www.npmjs.com/package/mcp) server management on `UserAgent` (standard + OAuth)

## How it fits together

Two Durable Object classes form a **parent → sub-agent** hierarchy. One `UserAgent` exists per signed-in user; each chat thread spawns a `ChatAgent` underneath it.

```
                        User (signed in via Better Auth)
                                   │
                                   ▼
                ┌──────────────────────────────┐
                │   UserAgent  (Durable Object) │   one per user  (user-<userId>)
                │                              │
                │   per-user state:            │
                │   • MCP plugin connections   │   addPlugin / removePlugin / listPlugins
                │   • user settings/context    │
                │   • sub-agent access gate    │   onBeforeSubAgent
                │                              │
                │   callables the extension    │
                │   can invoke:                │
                │   • listMcpToolDescriptors   │
                │   • callMcpTool              │
                └──────────────────────────────┘
                       │            │
          is the parent of its sub-agents
                       │            │
                       ▼            ▼
        ┌──────────────────┐   ┌──────────────────┐
        │  ChatAgent (DO)  │   │  ChatAgent (DO)  │  one per thread
        │  thread A        │   │  thread B        │  (sub-agents of UserAgent)
        └──────────────────┘   └──────────────────┘
```

- **`UserAgent`** is the long-lived per-user agent. It owns the MCP servers (plugins), the OAuth flow for MCP connections, and user-level state. It is the parent that chat threads hang off of.
- **`ChatAgent`** is the per-thread chat agent. Each conversation is its own DO instance. It does the actual LLM streaming and calls back into its parent `UserAgent` to get MCP tools.

## Request flow

```
fetch(request, env)  ── index.ts
│
├─ OPTIONS  ──────────────────────────────→ preflightResponse(origin)      [CORS]
│
├─ /agents/*  (WebSocket, chat + plugins) → handleAgentRequest()            [agent-request.ts]
│    │
│    ├─ checkAuth()          → 401 if no valid Better Auth session
│    ├─ checkAgentAccess()   → 403 if agent/thread doesn't belong to user
│    ├─ stamp x-authenticated-user-id (client value removed first)
│    │
│    └─ routeAgentRequest()  → wakes the Durable Object
│         │
│         ├─ /agents/user-agent/user-<id>            → UserAgent   (plugins/MCP)
│         ├─ /agents/user-agent/user-<id>/sub/chat-agent/<threadId> → ChatAgent (chat)
│         └─ .../callback  (OAuth/MCP)               → routed unauthenticated;
│                                                      the DO validates its own state token
│
└─ otherwise → Hono app
     ├─ /api/auth/*        → auth(env).handler(...)      Better Auth endpoints
     ├─ /api/threads       → requireAuth + rate limit    thread CRUD (KV-backed)
     ├─ /api/suggestions   → requireAuth + rate limit    AI prompt suggestions
     ├─ /api/favicon       → favicon proxy
     └─ /api/health        → health check
```

Step by step:

1. **CORS preflight** — `OPTIONS` is answered by `preflightResponse()`; the extension origin and `https://api.linkos.in` are allowed.
2. **Agent routes** (`/agents/*`) — intercepted by `handleAgentRequest()` in `src/utils/agent-request.ts`, which authenticates, authorizes ownership, then proxies to the Durable Object via `routeAgentRequest`. OAuth/MCP callback URLs bypass the session check and are handed to the DO, which validates its own state token.
3. **Hono app** — everything else falls through to the Hono router.

## The agent mesh

### UserAgent (`src/agent/user-agent.ts`)

The per-user parent DO (instance `user-<userId>`). Responsibilities:

- **MCP plugin hosting** — owns every MCP connection for the user. Exposes `@callable` methods the extension invokes:
  - `listPlugins()` — connected MCP servers
  - `addPlugin(name, url)` — connect an MCP server (OAuth flow when the server requires it)
  - `removePlugin(serverId)` — disconnect a server
  - `listMcpToolDescriptors(timeoutMs, serverFilter?)` — MCP tools as descriptors
  - `callMcpTool(serverId, name, args)` — invoke a tool
- **MCP OAuth** — `onStart()` configures the OAuth callback to redirect to `/api/auth/callback` after a server's code exchange.
- **Sub-agent gate** — `onBeforeSubAgent(request, child)` is invoked before a connection is upgraded to a child `ChatAgent` (currently logs; the worker-side `checkAgentAccess` is the enforced gate).

### ChatAgent (`src/agent/chat.ts`)

The per-thread child DO (instance `chat-agent/<threadId>`, sub-agent of the user's `UserAgent`). Responsibilities:

- **LLM streaming** — `onChatMessage()` streams a Workers AI response via the Vercel AI SDK (`streamText` with `workersai(model)`, model from the request or the default `@cf/meta/llama-3.1-8b-instruct-fp8-fast`), with a model-specific system prompt, message pruning, and a step cap.
- **Tool resolution** — resolves plugin tools from its parent `UserAgent` via `McpProxy` (`src/mcp-proxy.ts`), which turns the parent's MCP tool descriptors into AI SDK tools (`tool_<serverId>_<name>`). Codemode is exposed through the `CodemodeRuntime` export.
- **Persistence** — messages persist to the DO's SQLite storage; a title is auto-generated per message via a second Workers AI call and broadcast on `onFinish`.

### How tools flow to the model

```
ChatAgent.onChatMessage
   │
   ├─ McpProxy.getAITools() ──→ parent UserAgent.listMcpToolDescriptors()
   │                                │
   │                                └─→ MCP server (plugin)
   │
   └─ streamText({ model, tools, messages, ... })   → Workers AI
```

The model never talks to MCP servers directly — `ChatAgent` asks its parent `UserAgent`, which owns the connections.

## Auth (`src/utils/auth.ts`)

All authentication lives in one module:

- **`auth(env)`** — the Better Auth instance: Drizzle adapter over D1 (`user`, `session`, `account`, `verification`, `rateLimit`), plugins `bearer()` + `admin()` + `dash()`, Google social provider (enabled when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set), database-backed rate limiting (100 req/60s globally, 5 req/60s on `/sign-in/social`), and a `user` model with a `plan` additional field.
- **`requireAuth(c, next)`** — Hono middleware used by REST routes. Resolves the session from the request's `Authorization` header and stores `userId` in the context; returns `401 { error: 'Unauthorized' }` when no valid session exists.
- **`checkAuth(request, env)`** — same session resolution for agent (WebSocket) routes. Reads `Authorization` or a `token`/`auth_token`/`authorization` query param.
- **`checkAgentAccess(request, userId, env)`** — ownership guard for `/agents/*`:
  - `user-agent/{instance}` requires `instance === user-<userId>` (else `403`).
  - `chat-agent/{threadId}` and `user-agent/.../sub/chat-agent/{threadId}` require the thread to belong to the user (`verifyThreadOwnership`).
- **`verifyThreadOwnership(env, userId, threadId)`** — checks the user's thread list in KV (`threads:{userId}`).

When authorization passes, the worker stamps `x-authenticated-user-id` on the request so the Durable Object can trust it; any client-supplied value is removed first.

## Middleware

| Middleware | Source | Applies to |
|---|---|---|
| CORS (`corsOptions`) | `src/utils/cors.ts` | `/*` (Hono app) |
| `rateLimitMiddleware` | `src/utils/rate-limit.ts` | `/api/threads` (120/min), `/api/suggestions` (30/min) |
| `requireAuth` | `src/utils/auth.ts` | `/api/threads`, `/api/suggestions` |

The rate limiter is a fixed-window counter persisted in the D1 `rateLimit` table (atomic upsert keyed by route + client IP), returning `429` with a `retry-after` header on overflow. Better Auth separately rate-limits `/api/auth/*` endpoints.

`/api/favicon` is intentionally neither rate-limited nor auth-guarded.

## Routes

| Route | Method | Auth | Rate limit | Description |
|---|---|---|---|---|
| `/api/auth/callback` | GET | — | — | OAuth/MCP success page |
| `/api/auth/*` | POST/GET | Better Auth | 100/min (5/min social) | sign-in/social, session, admin, dash |
| `/api/threads` | GET | `requireAuth` | 120/min | List user threads |
| `/api/threads` | POST | `requireAuth` | 120/min | Create thread |
| `/api/threads/:id` | PATCH/DELETE | `requireAuth` | 120/min | Rename / delete thread |
| `/api/suggestions` | POST | `requireAuth` | 30/min | AI prompt suggestions for the active tab |
| `/api/favicon?hostname=` | GET | — | — | Favicon proxy (KV-cached) |
| `/api/health` | GET | — | — | Health check |

## Storage

- **D1 `agent-db`** (`DB`) — auth tables + `rateLimit` counters. Schema in `src/db/schema.ts`; migrations are generated with Drizzle and applied with `wrangler d1 migrations apply`.
- **KV `CACHE`** — per-user thread lists (`threads:<userId>`, 1-year TTL) and favicon caching.
- **Durable Object SQLite** — per-thread chat message history.

## Setup

```bash
cp .dev.vars.example .dev.vars   # BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
npm install
```

Set these authentication values (either in `.dev.vars` locally or as `wrangler secret`s in production):

- `BETTER_AUTH_SECRET` — signing secret for Better Auth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth (ID already set in `wrangler.jsonc`)

Register the extension callback URL in Google Cloud Console: `https://llihcpikannlnjolgcmbebnoihokiffn.chromiumapp.org/google`.

Apply database migrations:

```bash
npm run migrate    # wrangler d1 migrations apply agent-db
```

Set `ADMIN_USER_IDS` (a comma-separated list of Better Auth user IDs) if you want admin access without editing the `role` column manually.

Required bindings (configured in `wrangler.jsonc`):

- `DB` — D1 database (`agent-db`)
- `CACHE` — KV namespace (thread lists, favicon cache)
- `AI` — Workers AI binding
- `ChatAgent` / `UserAgent` — Durable Object bindings
- `LOADER` — Worker loader for codemode

## Development

```bash
cd worker
npm run dev            # wrangler dev
npm run migrate        # apply D1 migrations
npm run db:generate    # regenerate migrations from schema (drizzle-kit generate)
npm run types          # regenerate env.d.ts from wrangler.jsonc
```

## Deploy

```bash
npm run deploy         # wrangler deploy
```
