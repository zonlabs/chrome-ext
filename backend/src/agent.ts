import { AIChatAgent, OnChatMessageOptions, createToolsFromClientSchemas } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, pruneMessages, createUIMessageStreamResponse, toUIMessageStream, GenerateTextOnEndCallback, isStepCount, UIMessage, ToolSet } from "ai";

import { Env } from "./db/schema";
import { McpProxy } from "./mcp-proxy";

const DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
function buildSystemPrompt(): string {
  return "You are Obot, a helpful assistant embedded in the user's browser. " +
    "Tools available: getActiveTabs (list open tabs), getTabContent (read page content by URL, supports offset pagination — next offset = current offset + returned length). " +
    "Always call getTabContent on the active tab URL when the user asks for information about the current page. " +
    "You can access connected plugins through codemode. " +
    "Use the tools available to you to help the user.";
}

export class ChatAgent extends AIChatAgent<Env> {
  private _userId: string | null = null;

  async onStart() {
  }

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/callback")) {
      try {
        await this.mcp.handleCallbackRequest(request);
        return Response.redirect(`${url.origin}/`, 302);
      } catch (err) {
        return new Response(`Callback failed: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
      }
    }
    return new Response("Not found", { status: 404 });
  }

  @callable()
  listPlugins() {
    return this.getMcpServers();
  }

  @callable()
  async addPlugin(name: string, url: string): Promise<{
    success: boolean;
    requiresAuth: boolean;
    authUrl?: string;
    serverId?: string;
    error?: string;
  }> {
    try {
      const result = await this.addMcpServer(name, url);
      if (result.state === 'authenticating') {
        return { success: true, requiresAuth: true, authUrl: result.authUrl, serverId: result.id };
      }
      return { success: true, requiresAuth: false, serverId: result.id };
    } catch (err) {
      return { success: false, requiresAuth: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  @callable()
  async removePlugin(serverId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.removeMcpServer(serverId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Return MCP tool descriptors for all connected servers on this DO.
   * Called by McpProxy in child chat DOs via DO-to-DO RPC.
   * NOT @callable() — only for child DO communication, not browser access.
   */
  async listMcpToolDescriptors(timeoutMs = 10_000, serverFilter?: string[]): Promise<unknown[]> {
    console.log(`[listMcpToolDescriptors] name=${this.name}, timeout=${timeoutMs}ms`);

    try {
      await (this.mcp as any).restoreConnectionsFromStorage(this.name);
    } catch (err) {
      console.warn(`[listMcpToolDescriptors] restoreConnectionsFromStorage error:`, err);
    }

    const servers = this.getMcpServers();
    const serverStates = Object.entries(servers.servers).map(([id, s]) => `${id}=${(s as any).state}`).join(', ');
    console.log(`[listMcpToolDescriptors] servers: ${serverStates}`);

    await this.mcp.waitForConnections({ timeout: timeoutMs });

    const filter = serverFilter && serverFilter.length > 0 ? { serverId: serverFilter } : undefined;
    const allTools = this.mcp.listTools(filter);
    console.log(`[listMcpToolDescriptors] returning ${allTools.length} tools${filter ? ` (filtered to ${serverFilter!.length} servers)` : ''}`);
    return allTools;
  }

  /**
   * Execute an MCP tool on a connected server.
   * Called by McpProxy in child chat DOs via DO-to-DO RPC.
   * NOT @callable() — only for child DO communication.
   */
  async callMcpTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return await this.mcp.callTool({ arguments: args, name, serverId });
  }

  async onChatMessage(
    _onFinish: GenerateTextOnEndCallback,
    _options?: OnChatMessageOptions
  ) {
    this._userId = (_options?.body?.userId as string) || null;

    const workersai = createWorkersAI({ binding: this.env.AI });
    const modelName = (_options?.body?.model as string) || DEFAULT_MODEL;

    const isFirstTurn = this.messages.length <= 2;
    const userMessage = isFirstTurn
      ? this.messages
        .filter(m => m.role === 'user')
        .flatMap(m => m.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text'))
        .map(p => p.text)
        .join('')
        .trim()
      : '';

    try {
      const clientTools = _options?.clientTools?.length ? createToolsFromClientSchemas(_options.clientTools) : {};

      const pluginsAgentId = _options?.body?.pluginsAgentId as string | undefined;
      const enabledPlugins = _options?.body?.enabledPlugins as string[] | undefined;

      let mcpTools: ToolSet = {};
      if (pluginsAgentId) {
        try {
          const sharedMcp = new McpProxy(() =>
            Promise.resolve(this.env.ChatAgent.get(this.env.ChatAgent.idFromName(pluginsAgentId)))
          );
          mcpTools = await sharedMcp.getAITools(5_000, enabledPlugins);
        } catch (err) {
          console.error("[ChatAgent] Failed to get tools from plugins DO:", err);
        }
      }

      const tools = { ...clientTools, ...mcpTools };

      const result = streamText({
        model: workersai(modelName),
        system: buildSystemPrompt(),
        messages: pruneMessages({
          messages: await convertToModelMessages(this.messages),
          toolCalls: "before-last-2-messages",
        }),
        tools,
        maxOutputTokens: 1024,
        temperature: 0.3,
        stopWhen: isStepCount(10),
        onFinish: async (event) => {
          _onFinish?.(event);

          if (userMessage) {
            try {
              const res: any = await this.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
                messages: [
                  { role: 'system', content: 'Generate a concise title (max 6 words) for a chat based on the user\'s first message. Reply with ONLY the title — no quotes, no punctuation, no explanation.' },
                  { role: 'user', content: userMessage },
                ],
                max_tokens: 15,
                temperature: 0.3,
              });
              const title = (res.response?.trim() || 'New Chat').replace(/^[\"']|[\"']$/g, '') || 'New Chat';
              this.broadcast(JSON.stringify({ type: 'chat:title', title }));
            } catch {
              // Title generation failed — keep default "New Chat"
            }
          }
        },
      });

      return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
      });
    } catch (err) {
      const msg = `Error with model "${modelName}": ${err instanceof Error ? err.message : String(err)}`;
      console.error('[ChatAgent]', msg);
      return new Response(msg, { status: 500 });
    }
  }

  override async persistMessages(
    messages: UIMessage[],
    excludeBroadcastIds?: string[],
    options?: { _deleteStaleRows?: boolean }
  ): Promise<void> {
    if (!this._userId) {
      await super.persistMessages(messages, excludeBroadcastIds, options);
      this.sql`DELETE FROM cf_ai_chat_agent_messages`;
      (this as any)._persistedMessageCache?.clear();
      return;
    }

    const clientIds = new Set(messages.map(m => m.id));
    const staleIds = this.messages
      .map(m => m.id)
      .filter(id => !clientIds.has(id));

    if (staleIds.length > 0) {
      for (const id of staleIds) {
        this.sql`DELETE FROM cf_ai_chat_agent_messages WHERE id = ${id}`;
        (this as any)._persistedMessageCache?.delete(id);
      }
    }

    await super.persistMessages(messages, excludeBroadcastIds, options);
  }
}
