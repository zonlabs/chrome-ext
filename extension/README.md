# Obot — Chrome Extension

Chrome extension side panel for the Obot AI assistant. Connects to the Obot Workers backend and provides a chat interface with MCP plugin management.

## Stack

- **UI**: React 19
- **Build**: esbuild
- **Icons**: lucide-react
- **Agent SDK**: [`agents`](https://www.npmjs.com/package/agents) — WebSocket DO connection
- **AI Chat**: [`@cloudflare/ai-chat`](https://www.npmjs.com/package/@cloudflare/ai-chat) — `useAgentChat` hook
- **OAuth**: Google Identity (Chrome identity API)

## Project Structure

```
extension/
|-- manifest.json          - Chrome extension manifest
|-- service-worker.ts      - Background service worker
|-- content-script.ts      - Page content script
|-- shared/                - Shared constants and types
`-- ui/
    |-- app/               - React entry point, root component, app tests
    |-- features/
    |   |-- chat/          - Chat components, thread hook, utilities, tests
    |   `-- plugins/       - Plugin components and agent-ID utility
    |-- shared/            - Cross-feature UI components
    |-- assets/
    |   |-- fonts/         - UI font assets
    |   `-- icons/         - Extension and model icons
    |-- style.css          - Global UI styles
    `-- index.html         - Extension UI HTML
```

## Architecture

Two [Durable Object connections](https://developers.cloudflare.com/agents/) via `useAgent`:

1. **Thread DO** (`ChatAgent`) — per-chat-thread DO for conversation + tool execution
2. **User DO** (`ChatAgent`, named `plugins-user-{userId}`) — shared MCP server state across all threads

`PluginsScreen` manages MCP servers on the user DO. `onChatMessage` on each thread DO wraps those tools via codemode for execution.

### Plugins

Built-in quick-connect plugins: Exa Search, Mem0, Apify, Consensus. Custom MCP servers can be added by URL. Supports OAuth-based MCP server authorization.

## Build

```bash
cd extension
npm run build       # Production bundle → connects to deployed worker
npm run watch       # Dev watch mode → connects to localhost:8788
```

`WORKER_URL` in `shared/constants.ts` switches based on `__BUILD_ENV__`:
- `build` sets `__BUILD_ENV__=production` → uses `https://api.linkos.in`
- `watch` leaves it undefined → uses `http://127.0.0.1:8788`

For local development, run the worker alongside:

```bash
# Terminal 1 — worker
cd worker && npm run dev    # wrangler dev on :8788

# Terminal 2 — extension
cd extension && npm run watch
```

## Load in Chrome

1. Run `npm run build`
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `extension/` directory
5. Pin the Obot icon and click to open the side panel

## Authentication

Google ID-token sign-in via `chrome.identity.launchWebAuthFlow`. The extension requests `openid`, `email`, and `profile` scopes, then sends the ID token to Better Auth. The user ID is used as the DO namespace for isolating MCP state.
