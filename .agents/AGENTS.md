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
- **Bundler**: esbuild (`main.tsx` -> `side-panel/dist/app.js`, `service-worker.ts` -> `dist/service-worker.js`, `content-script.ts` -> `dist/content-script.js`).
- **Components (`/extension/side-panel/components`)**:
  - `ChatView.tsx`: Main chat view orchestrating thread state, streaming, client tool execution, and layout.
  - `ChatInput.tsx`: Input capsule with tab attachment popup, selected tabs header, model picker, and submit actions.
  - `WelcomeScreen.tsx`: Greeting interface with page context badge and LLM-suggested prompts.
  - `PluginsScreen.tsx` & `PluginsSubscription.tsx`: MCP plugin configuration and live status updates.
- **Utilities (`/extension/side-panel/utils`)**:
  - `clientTools.ts`: Page context extraction (`getActiveTabPageContext`), screenshot capture (`captureScreenshot`), and client-side tool handlers.
  - `useThreads.ts`: Active thread CRUD and state management.

### 2. Cloudflare Worker Backend (`/worker`)
- **Framework**: Hono + Cloudflare Workers.
- **Bindings**:
  - `ChatAgent`: Durable Object managing conversational AI sessions & tool invocations.
  - `CACHE`: Cloudflare KV namespace for caching session data and prompt suggestions.
  - `DB`: Cloudflare D1 SQL database (`obot-db`).
  - `AI`: Cloudflare Workers AI model binding.
- **API Routes (`/worker/src/routes`)**:
  - `/api/suggestions`: POST route accepting `url`, `title`, and `pageText` to generate 3 tailored prompt suggestions using Workers AI.
  - `/api/auth`: Authentication endpoints integration (`BETTER_AUTH_URL`).

## Coding & Architectural Conventions

- **Page Context & Suggestions**:
  - Page context extraction must remain non-intrusive and non-blocking.
  - Always pass `url`, `title`, and `pageText` (from `getActiveTabPageContext()`) to `/api/suggestions` for deep context awareness.
- **UI & Design Aesthetics**:
  - Use Vanilla CSS in `extension/side-panel/style.css`.
  - Maintain glassmorphism aesthetics, subtle micro-animations (e.g. pulse indicators, shimmer glows), and dark-mode styling (`--bg-primary`, `--bg-secondary`, `--text-primary`, `--red`).
- **State Cleanup**:
  - Avoid leaving dead or unused `useRef` / `useState` hooks. Clean up unneeded tab mapping refs or redundant properties.
