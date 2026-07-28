import { AIChatAgent, OnChatMessageOptions, createToolsFromClientSchemas } from "@cloudflare/ai-chat";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, pruneMessages, createUIMessageStreamResponse, toUIMessageStream, GenerateTextOnEndCallback, isStepCount, UIMessage, ToolSet } from "ai";

import { Env } from "../db/schema";
import { McpProxy } from "../mcp-proxy";
import { SkillRegistry } from "../skills/registry";
import { AgentSkill } from "../skills/types";
import { Orchestrator } from "./Orchestrator";

const DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

function buildSystemPrompt(skillsSnippet = ""): string {
  return "You are Obot, a helpful assistant embedded in the user's browser. " +
    "Tools available:\n" +
    "- getActiveTabs (list open tabs)\n" +
    "- getTabContent (read page content by URL, supports offset pagination — next offset = current offset + returned length)\n" +
    "Always call getTabContent on the active tab URL when the user asks for information about the current page. " +
    "For plugin operations (search, database queries, etc.), use the codemode tool to write JavaScript " +
    "that calls the available functions on the `codemode` object." +
    skillsSnippet;
}

/**
 * Child Chat Thread Sub-Agent
 * Represents an individual chat thread with isolated SQLite storage.
 * Workspace skills and plugins are fetched dynamically from the parent Orchestrator.
 */
export class ChatAgent extends AIChatAgent<Env> {
  private _userId: string | null = null;

  async onChatMessage(
    _onFinish: GenerateTextOnEndCallback,
    _options?: OnChatMessageOptions
  ) {
    this._userId = (_options?.body?.userId as string) || null;

    console.log(`[ChatAgent:${this.name}] 🤖 Sub-Agent Hierarchy Identity:`, {
      selfPath: this.selfPath,
      parentPath: this.parentPath,
      isSubAgent: (this.parentPath?.length ?? 0) > 0,
    });

    this.broadcast(JSON.stringify({
      type: 'subagent:active',
      subAgent: 'ChatAgent',
      parent: 'Orchestrator',
      threadId: this.name,
    }));

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
      let activeSkillsRegistry = new SkillRegistry();
      let targetPluginsDO: any = null;

      // 1. Try parent Orchestrator stub via parentAgent RPC
      try {
        const parentOrchestrator = await this.parentAgent(Orchestrator);
        if (parentOrchestrator) {
          targetPluginsDO = parentOrchestrator;
          const parentSkills = await parentOrchestrator.listSkills();
          if (Array.isArray(parentSkills) && parentSkills.length > 0) {
            activeSkillsRegistry = new SkillRegistry(parentSkills);
          }
        }
      } catch (err) {
        console.log(`[ChatAgent:${this.name}] parentAgent lookup skipped/failed, checking fallback pluginsAgentId...`);
      }

      // 2. Fallback to pluginsAgentId if direct parent is not present
      if (!targetPluginsDO && pluginsAgentId) {
        try {
          const fallbackDO: any = (this.env as any).Orchestrator
            ? (this.env as any).Orchestrator.get((this.env as any).Orchestrator.idFromName(pluginsAgentId))
            : (this.env as any).ChatAgent.get((this.env as any).ChatAgent.idFromName(pluginsAgentId));

          targetPluginsDO = fallbackDO;

          if (pluginsAgentId !== this.name) {
            const remoteSkills = await fallbackDO.listSkills() as AgentSkill[];
            if (Array.isArray(remoteSkills)) {
              activeSkillsRegistry = new SkillRegistry(remoteSkills);
            }
          }
        } catch (err) {
          console.error("[ChatAgent] Failed to resolve fallback plugins DO:", err);
        }
      }

      // 3. Fetch MCP tools from the target plugins DO
      if (targetPluginsDO) {
        try {
          const sharedMcp = new McpProxy(() => Promise.resolve(targetPluginsDO));
          mcpTools = await sharedMcp.getAITools(5_000, enabledPlugins);
          console.log(`[ChatAgent:${this.name}] Fetched ${Object.keys(mcpTools).length} MCP tools from target DO`);
        } catch (mcpErr) {
          console.error("[ChatAgent] Failed to fetch MCP tools:", mcpErr);
        }
      }

      const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER });
      const codemode = createCodeTool({ tools: mcpTools, executor });
      const skillTools = activeSkillsRegistry.getTools();
      const tools = { ...clientTools, ...skillTools, codemode };

      console.log(`[ChatAgent:${this.name}] Registered active tools for streaming:`, {
        clientToolNames: Object.keys(clientTools),
        skillToolNames: Object.keys(skillTools),
        mcpToolNames: Object.keys(mcpTools),
        allToolNames: Object.keys(tools),
      });

      const enabledSkills = _options?.body?.enabledSkills as string[] | undefined;
      const skillsSnippet = activeSkillsRegistry.getSkillsPromptSnippet(enabledSkills, userMessage);

      const result = streamText({
        model: workersai(modelName),
        system: buildSystemPrompt(skillsSnippet),
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
              // Title generation failed
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
