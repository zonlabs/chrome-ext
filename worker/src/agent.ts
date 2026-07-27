import { AIChatAgent, OnChatMessageOptions, createToolsFromClientSchemas } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, pruneMessages, createUIMessageStreamResponse, toUIMessageStream, GenerateTextOnEndCallback, isStepCount, UIMessage, ToolSet } from "ai";

import { Env } from "./db/schema";
import { McpProxy } from "./mcp-proxy";
import { SkillRegistry, parseSkillMarkdown } from "./skills/registry";

import { AgentSkill } from "./skills/types";

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

export class ChatAgent extends AIChatAgent<Env> {
  private _userId: string | null = null;
  private _skillRegistry = new SkillRegistry();

  async onStart() {
    if (this.name.startsWith('plugins-user')) {
      this.mcp.configureOAuthCallback({
        successRedirect: '/api/auth/callback'
      });
    }
    console.log(`[ChatAgent:${this.name}] Initializing ChatAgent onStart. Loading saved skills from DO storage...`);
    const savedSkills = await this.ctx.storage.get<AgentSkill[]>("custom_skills");
    if (savedSkills && Array.isArray(savedSkills)) {
      console.log(`[ChatAgent:${this.name}] Loaded ${savedSkills.length} saved skills from DO storage:`, savedSkills.map(s => s.name));
      for (const skill of savedSkills) {
        this._skillRegistry.addSkill(skill);
      }
    } else {
      console.log(`[ChatAgent:${this.name}] No saved skills found in DO storage.`);
    }
  }

  @callable()
  listSkills() {
    const skills = this._skillRegistry.getAllSkills();
    console.log(`[ChatAgent:${this.name}] listSkills called, returning ${skills.length} skills:`, skills.map(s => s.name));
    return skills;
  }

  @callable()
  async addSkill(skill: AgentSkill): Promise<{ success: boolean; skill?: AgentSkill; error?: string }> {
    try {
      console.log(`[ChatAgent:${this.name}] addSkill called for:`, skill.name, skill.id);
      if (!skill.id || !skill.name || !skill.systemPromptSnippet) {
        return { success: false, error: 'Skill id, name, and systemPromptSnippet are required.' };
      }
      this._skillRegistry.addSkill(skill);
      await this.ctx.storage.put("custom_skills", this._skillRegistry.getAllSkills());
      console.log(`[ChatAgent:${this.name}] Successfully saved skill "${skill.name}" to DO storage.`);
      return { success: true, skill };
    } catch (err) {
      console.error(`[ChatAgent:${this.name}] addSkill error:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  @callable()
  async removeSkill(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[ChatAgent:${this.name}] removeSkill called for id: "${id}"`);
      this._skillRegistry.removeSkill(id);
      await this.ctx.storage.put("custom_skills", this._skillRegistry.getAllSkills());
      console.log(`[ChatAgent:${this.name}] Successfully removed skill "${id}" from DO storage.`);
      return { success: true };
    } catch (err) {
      console.error(`[ChatAgent:${this.name}] removeSkill error:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  @callable()
  async importSkillFromCommand(commandStr: string): Promise<{ success: boolean; skill?: AgentSkill; error?: string }> {
    try {
      console.log(`[ChatAgent:${this.name}] importSkillFromCommand received command: "${commandStr}"`);
      let rawCmd = commandStr.trim();
      if (rawCmd.startsWith("npx skills add ")) {
        rawCmd = rawCmd.replace("npx skills add ", "").trim();
      }

      let skillName = "";
      const skillParamMatch = rawCmd.match(/--skill\s+([^\s]+)/);
      if (skillParamMatch) {
        skillName = skillParamMatch[1];
        rawCmd = rawCmd.replace(/--skill\s+[^\s]+/, "").trim();
      }

      let repoUrl = rawCmd.trim();
      if (!skillName) {
        const parts = repoUrl.replace(/\/$/, '').split('/');
        skillName = parts[parts.length - 1] || 'custom-skill';
      }

      let rawUrlsToTry: string[] = [];
      if (repoUrl.includes("github.com")) {
        const ghMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/[^\/]+\/(.+))?/);
        if (ghMatch) {
          const owner = ghMatch[1];
          const repo = ghMatch[2].replace(/\.git$/, '');
          const subPath = ghMatch[3] ? ghMatch[3].replace(/\/$/, '') + '/' : '';

          rawUrlsToTry = [
            `https://raw.githubusercontent.com/${owner}/${repo}/main/${subPath}SKILL.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/${subPath}README.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/${subPath}SKILL.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/${subPath}README.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}/SKILL.md`,
          ];
        }
      } else {
        rawUrlsToTry = [repoUrl];
      }

      console.log(`[ChatAgent:${this.name}] Fetching raw skill content from candidates:`, rawUrlsToTry);
      let mdText = "";
      for (const targetUrl of rawUrlsToTry) {
        try {
          console.log(`[ChatAgent:${this.name}] Trying URL: ${targetUrl}`);
          const res = await fetch(targetUrl);
          if (res.ok) {
            mdText = await res.text();
            console.log(`[ChatAgent:${this.name}] Successfully fetched ${mdText.length} bytes from ${targetUrl}`);
            break;
          }
        } catch (fetchErr) {
          console.warn(`[ChatAgent:${this.name}] Fetch failed for ${targetUrl}:`, fetchErr);
        }
      }

      if (!mdText) {
        console.warn(`[ChatAgent:${this.name}] Could not fetch remote SKILL.md. Falling back to default generated skill prompt.`);
        mdText = `---
name: ${skillName}
description: Skill imported from ${repoUrl}
triggers:
  - ${skillName}
---

### Skill: ${skillName}
Automatically imported from ${repoUrl}.
When user asks about ${skillName}, apply instructions from this repository.`;
      }

      const importedSkill = parseSkillMarkdown(mdText, skillName);
      console.log(`[ChatAgent:${this.name}] Parsed skill: "${importedSkill.name}" (${importedSkill.id}) triggers:`, importedSkill.triggers);
      this._skillRegistry.addSkill(importedSkill);

      await this.ctx.storage.put("custom_skills", this._skillRegistry.getAllSkills());
      console.log(`[ChatAgent:${this.name}] Imported skill "${importedSkill.name}" saved to DO storage.`);

      return { success: true, skill: importedSkill };
    } catch (err) {
      console.error(`[ChatAgent:${this.name}] importSkillFromCommand error:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
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

      const pluginsAgentId = _options?.body?.pluginsAgentId as string | undefined;
      const enabledPlugins = _options?.body?.enabledPlugins as string[] | undefined;

      let mcpTools: ToolSet = {};
      let activeSkillsRegistry = this._skillRegistry;

      if (pluginsAgentId) {
        try {
          const pluginsDO = this.env.ChatAgent.get(this.env.ChatAgent.idFromName(pluginsAgentId));
          if (pluginsAgentId !== this.name) {
            const remoteSkills = await pluginsDO.listSkills() as AgentSkill[];
            console.log(`[ChatAgent:${this.name}] Fetched ${remoteSkills?.length ?? 0} skills from plugins DO (${pluginsAgentId}):`, remoteSkills?.map(s => s.name));
            if (Array.isArray(remoteSkills)) {
              activeSkillsRegistry = new SkillRegistry(remoteSkills);
            }
          }
          const sharedMcp = new McpProxy(() => Promise.resolve(pluginsDO));
          mcpTools = await sharedMcp.getAITools(5_000, enabledPlugins);
        } catch (err) {
          console.error("[ChatAgent] Failed to fetch tools/skills from plugins DO:", err);
        }
      }

      const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER });
      const codemode = createCodeTool({ tools: mcpTools, executor });
      const skillTools = activeSkillsRegistry.getTools();
      const tools = { ...clientTools, ...skillTools, codemode };

      const enabledSkills = _options?.body?.enabledSkills as string[] | undefined;
      const skillsSnippet = activeSkillsRegistry.getSkillsPromptSnippet(enabledSkills, userMessage);
      console.log(`[ChatAgent:${this.name}] onChatMessage active tools:`, Object.keys(tools));
      if (skillsSnippet) {
        console.log(`[ChatAgent:${this.name}] Injected system prompt skills snippet:\n${skillsSnippet}`);
      }

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
