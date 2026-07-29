<p align="center">
  <img src="extension/ui/assets/icons/icon.svg" width="128" height="128" alt="Obot Logo" />
</p>

<h1 align="center">Obot</h1>

<p align="center">
  <strong>AI assistant browser extension and backend built with Cloudflare Workers, Durable Objects, and React.</strong>
</p>

<p align="center">
  <a href="https://github.com/zonlabs/obot/releases/latest"><img src="https://img.shields.io/badge/Extension%20Release-v0.1.0-blue?logo=github" alt="Extension Release v0.1.0" /></a>
  <img src="https://img.shields.io/badge/Extension-Chrome-blue.svg?logo=googlechrome&logoColor=white" alt="Chrome Extension" />
  <img src="https://img.shields.io/badge/Backend-Cloudflare_Workers-orange.svg?logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/UI-React_19-blue.svg?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Database-Cloudflare_D1-orange.svg?logo=cloudflare&logoColor=white" alt="Cloudflare D1" />
</p>

Obot is a full-stack AI assistant consisting of a **Chrome Extension Side Panel** (frontend) and a **Cloudflare Workers** backend. It uses Cloudflare **Durable Objects**, **Workers AI**, and the **Model Context Protocol (MCP)** to provide real-time chat and tool-calling capabilities.

---

### 📦 Latest Extension Release

You can download pre-built, ready-to-install extension bundles directly from **[GitHub Releases](https://github.com/zonlabs/obot/releases/latest)**:
- Download the `obot-extension-v*.zip` asset from the latest release.
- Unzip/extract the file on your computer.
- Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.

## ✨ Key Features

- **Chrome Extension**: React-based panel that lets you chat, ask questions about your active tab, and summarize page content.
- **Model Context Protocol (MCP)**: Integrates with external APIs (such as Exa Search, Mem0, Apify, and custom self-hosted MCP servers) using the MCP standard.
- **Durable Objects Architecture**: Manages stateful chat sessions as Durable Objects over persistent WebSocket connections.
- **Cloudflare Workers AI**: Uses open-source LLMs (Llama 3.2, Gemma 2B, Qwen, GLM, GPT-OSS) hosted on Cloudflare's platform.
- **Dynamic Code Execution**: Uses `@cloudflare/codemode` to generate and run JavaScript that orchestrates MCP plugin actions.
- **OAuth 2.0**: Uses Google Identity to authenticate users and persist configuration state across sessions.


## 🚀 Quick Start

This repository is set up as a monorepo containing both the extension and worker backend.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-cli/) (for Cloudflare deployment)
- A Cloudflare account with D1 and KV enabled

### 1. Backend Setup (Worker)

Navigate to the `worker/` directory and configure the environment:

```bash
cd worker
cp .dev.vars.example .dev.vars
```

Add your credentials (such as Google OAuth keys, AI provider secrets, etc.) to `.dev.vars`.

Run D1 database migrations to initialize the schema:

```bash
npm run migrate
```

Start the local worker dev server:

```bash
npm run dev
```

### 2. Frontend Setup (Extension)

To build the extension for **local development** (connecting to `http://127.0.0.1:8787`):

```bash
npm run build:ext:dev
```

To build the extension for **production** (connecting to your Cloudflare Worker URL):

```bash
npm run build:ext
```

Alternatively, you can run `npm run dev:ext` to watch for local changes to the side panel.

### 3. Load the Extension in Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle the **Developer mode** switch in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `extension/` folder inside this repository.
5. Click the Extensions puzzle icon in the toolbar, pin **Obot**, and click it to open the side panel.

---

## 💻 Workspace Command Reference

You can run these scripts from the **root directory** to orchestrate the entire project:

| Command | Action |
|---|---|
| `npm run dev:worker` | Starts wrangler local development server for the backend (`http://127.0.0.1:8787`) |
| `npm run dev:ext` | Watches for local changes to the Chrome extension side panel |
| `npm run build:ext` | Builds the Chrome extension for production (`https://api.linkos.in`) |
| `npm run build:ext:dev` | Builds the Chrome extension for local dev (`http://127.0.0.1:8787`) |
| `npm run build:worker` | Deploys the worker backend directly to Cloudflare |
| `npm run migrate` | Runs the initial D1 schema migrations for the database |

---

## 🛡️ Architecture & Tech Stack

### Frontend Stack
* **React 19 & Lucide Icons** for the side panel UI.
* **esbuild** for asset bundling.
* **`agents` SDK & `@cloudflare/ai-chat`** to manage persistent WebSocket connections directly to Cloudflare Durable Objects.

### Backend Stack
* **Hono Framework** for routing, OAuth flow, and API endpoints.
* **Durable Objects (`ChatAgent`)** to host stateful, persistent chat threads and manage active MCP plugins per-user.
* **Workers AI & D1 (SQLite)** for database operations, session storage, and LLM inference.
