# Obot Workspace Guidelines & Agent Rules

## Development & Build Commands

- **Extension Development Build**: Always use `npm run build:ext:dev` when building the extension for development instead of `npm run build:ext`.
- **Extension Watch Mode**: Run `npm run dev:ext` (runs `cd extension && npm run watch`).
- **Worker Local Development**: Run `npm run dev:worker` or `cd worker && npx wrangler dev`.
- **Worker Deployment**: Run `npm run build:worker` or `cd worker && npx wrangler deploy`.
- **Database Migrations**: Run `npm run migrate` to apply D1 database schema changes.

## Repository Architecture

### 1. Chrome Extension (`/extension`)
- **Framework**: React 19 + TypeScript.
- **Bundler**: esbuild (`ui/app/main.tsx` -> `ui/dist/app.js`, `service-worker.ts` -> `dist/service-worker.js`, `content-script.ts` -> `dist/content-script.js`).
- **Components (`/extension/ui/features/chat/components`)**:
  - `ChatView.tsx`: Main chat view orchestrating thread state, streaming, client tool execution, and layout.
  - `ChatInput.tsx`: Input capsule with tab attachment popup, selected tabs header, model picker, and submit actions.
  - `WelcomeScreen.tsx`: Greeting interface with page context badge and LLM-suggested prompts.
  - `PluginsScreen.tsx` & `PluginsSubscription.tsx`: MCP plugin configuration and live status updates.
- **Utilities (`/extension/ui/features/chat`)**:
  - `clientTools.ts`: Page context extraction (`getActiveTabPageContext`), screenshot capture (`captureScreenshot`), and client-side tool handlers.
  - `useThreads.ts`: Active thread CRUD and state management.

### 2. Cloudflare Worker Backend (`/worker`)
- **Framework**: Hono + Cloudflare Workers.
- **Bindings**:
  - `ChatAgent`: Durable Object managing conversational AI sessions & tool invocations.
  - `CACHE`: Cloudflare KV namespace for caching session data and prompt suggestions.
  - `DB`: Cloudflare D1 SQL database (`agent-db`).
  - `AI`: Cloudflare Workers AI model binding.
- **API Routes (`/worker/src/routes`)**:
  - `/api/suggestions`: POST route accepting `url`, `title`, and `pageText` to generate 3 tailored prompt suggestions using Workers AI.
  - `/api/auth`: Authentication endpoints integration (`BETTER_AUTH_URL`).

## Coding & Architectural Conventions

- **Page Context & Suggestions**:
  - Page context extraction must remain non-intrusive and non-blocking.
  - Always pass `url`, `title`, and `pageText` (from `getActiveTabPageContext()`) to `/api/suggestions` for deep context awareness.
- **UI & Design Aesthetics**:
  - Use Vanilla CSS in `extension/ui/style.css`.
  - Maintain glassmorphism aesthetics, subtle micro-animations (e.g. pulse indicators, shimmer glows), and dark-mode styling (`--bg-primary`, `--bg-secondary`, `--text-primary`, `--red`).
- **State Cleanup**:
  - Avoid leaving dead or unused `useRef` / `useState` hooks. Clean up unneeded tab mapping refs or redundant properties.

## TypeScript & Code Quality Standards

### Duck Typing / Structural Typing
- TypeScript is structurally typed — prefer interfaces over type aliases for object shapes that describe contracts.
- Accept the broadest shape that satisfies the contract, not the narrowest. If a function only reads `{ text: string }`, accept that, not the full message type.
- Avoid `any` — use `unknown` + type guards when the shape is truly unknown, or narrow with proper runtime validation.
- Use branded types (`type UserId = string & { __brand: 'UserId' }`) for primitive-typed IDs to prevent accidental mixups at the type level.

### Code Readability
- Name things by *what they do*, not *how*: prefer `getActivePlugins()` over `filterEnabledMcpServers()`.
- Keep functions small and single-purpose. If a function needs a comment explaining "part 2" or "step 3", extract those steps.
- Avoid deep nesting — early-return guard clauses over if/else chains. Use optional chaining (`?.`) and nullish coalescing (`??`).
- Destructure at the top of the function, not inline.
- Import only what you use; keep imports grouped (built-in → packages → local).

### Best Practices
- Prefer `const` over `let` — immutable bindings are easier to reason about.
- Use `ReadonlyArray<T>` / `readonly` for parameters that should not be mutated.
- Async: prefer `Promise.all` for independent parallel work; never `await` inside a loop body — map to promises then `Promise.all`.
- Error handling: throw typed errors, not `new Error(string)`. Catch with specific type checks, not blanket handlers.
- Avoid magic numbers and inline strings — extract to named constants at the top of the module.
- Tests: every exported function should have a unit test; every bug fix should include a regression test.
