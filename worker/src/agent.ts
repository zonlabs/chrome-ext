import { AIChatAgent, OnChatMessageOptions, createToolsFromClientSchemas } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, pruneMessages, createUIMessageStreamResponse, toUIMessageStream, GenerateTextOnEndCallback, isStepCount, UIMessage, ToolSet, ModelMessage } from "ai";

import { McpProxy } from "./mcp-proxy";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

/** Model IDs whose 'vision' suffix implies image-in / text+image-out. */
const VISION_MODELS = new Set([
  '@cf/unum/uform-gen2-qwen-500m',
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/google/gemma-3-12b-it',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/moonshotai/kimi-k2.5',
  '@cf/moonshotai/kimi-k2.6',
]);

function modelHasVision(modelName: string): boolean {
  return VISION_MODELS.has(modelName) || modelName.includes('vision');
}

function buildSystemPrompt(modelName: string): string {
  const now = new Date();
  const dateStr = now.toUTCString();
  const visionNote = modelHasVision(modelName)
    ? `\n- A viewport screenshot is also attached as an image whenever the current page is accessible and your model supports vision.`
    : '';
  return `You are Obot, a helpful browser assistant.
Current Date and Time: ${dateStr} (${now.toISOString()}).

You are running on model: ${modelName}${modelHasVision(modelName) ? ' (vision-capable)' : ''}.

SCREEN CONTEXT:
Every user message may begin with an auto-injected <page_context> block containing:
- url: The active tab's URL
- title: The page title
- text: Extracted visible content (headings, interactive elements, inputs, paragraphs)

This context is automatically captured from the user's active browser tab. You do NOT need to call getActiveTabs, getTabContent, or captureScreenshot to see the current page — its context is already in the message.${visionNote}

The only available client-side tool is:
- getFocusedElementText: Read what the user is typing in a focused input field. Use this when you need to understand what the user is typing on the active page outside of their chat message.

For plugin operations, use the codemode tool to run JavaScript functions on the \`codemode\` object.`;
}

export class ChatAgent extends AIChatAgent<Env> {
  private _userId: string | null = null;

  async onStart() {
    if (this.name.startsWith('plugins-user')) {
      this.mcp.configureOAuthCallback({
        successRedirect: '/api/auth/callback'
      });
    }
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
      console.log("client tools :", clientTools)
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

      const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER });
      const codemode = createCodeTool({ tools: mcpTools, executor });
      const tools = { ...clientTools, codemode };

      let modelMessages = await convertToModelMessages(this.messages);

      // Inject auto-captured page context into the last user message (hidden from UI — sent via body).
      const pageContext = (_options?.body as any)?.pageContext as { url: string; title: string; text: string } | undefined;
      const screenshot = (_options?.body as any)?.screenshot as string | undefined;
      if (pageContext) {
        const contextText = `<page_context url="${pageContext.url}" title="${pageContext.title}">\n${pageContext.text}\n</page_context>`;
        for (let i = modelMessages.length - 1; i >= 0; i--) {
          const msg = modelMessages[i];
          if (msg.role !== 'user') continue;
          if (typeof msg.content === 'string') {
            msg.content = `${contextText}\n\n${msg.content}`;
          } else if (Array.isArray(msg.content)) {
            for (let j = msg.content.length - 1; j >= 0; j--) {
              const p = msg.content[j];
              if (p.type === 'text') {
                (p as { type: 'text'; text: string }).text = `${contextText}\n\n${(p as { type: 'text'; text: string }).text}`;
                break;
              }
            }
          }
          // Attach screenshot as image part if model supports vision
          if (screenshot && modelHasVision(modelName)) {
            if (typeof msg.content === 'string') {
              msg.content = [{ type: 'text' as const, text: msg.content }, { type: 'image' as const, image: screenshot }];
            } else if (Array.isArray(msg.content)) {
              (msg.content as unknown as Array<Record<string, unknown>>).push({ type: 'image', image: screenshot });
            }
          }
          break;
        }
      }

      // Strip image parts for text-only models to avoid provider errors.
      if (!modelHasVision(modelName)) {
        modelMessages = modelMessages.map(msg => {
          if (msg.role !== 'user' || typeof msg.content === 'string') return msg;
          const textParts = msg.content.filter(p => p.type !== 'image');
          if (textParts.length === 0) return { role: 'user' as const, content: '' };
          if (textParts.length === 1 && textParts[0].type === 'text') {
            return { role: 'user' as const, content: textParts[0].text };
          }
          return { role: 'user' as const, content: textParts };
        }) as ModelMessage[];
      }

      const result = streamText({
        model: workersai(modelName),
        system: buildSystemPrompt(modelName),
        messages: pruneMessages({
          messages: modelMessages,
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
