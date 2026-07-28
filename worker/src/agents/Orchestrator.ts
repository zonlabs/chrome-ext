import { Agent, callable, SubAgentStub } from "agents";
import { Env } from "../db/schema";
import { SkillRegistry, parseSkillMarkdown } from "../skills/registry";
import { AgentSkill } from "../skills/types";
import type { ChatAgent } from "./ChatAgent";

/**
 * Top-Level Parent Agent (User Workspace Orchestrator)
 * Coordinates user-scoped plugins, custom skills, and child chat sessions.
 */
export class Orchestrator extends Agent<Env> {
  private _skillRegistry = new SkillRegistry();

  override async onStart(): Promise<void> {
    if (this.name.startsWith('plugins-user')) {
      (this.mcp as any).configureOAuthCallback({
        successRedirect: '/api/auth/callback'
      });
    }
    console.log(`[Orchestrator:${this.name}] Initializing onStart. Loading saved skills...`);
    const savedSkills = await this.ctx.storage.get<AgentSkill[]>("custom_skills");
    if (savedSkills && Array.isArray(savedSkills)) {
      console.log(`[Orchestrator:${this.name}] Loaded ${savedSkills.length} saved skills:`, savedSkills.map(s => s.name));
      for (const skill of savedSkills) {
        this._skillRegistry.addSkill(skill);
      }
    } else {
      console.log(`[Orchestrator:${this.name}] No saved skills found in DO storage.`);
    }
  }

  @callable()
  listSkills(): AgentSkill[] {
    const skills = this._skillRegistry.getAllSkills();
    console.log(`[Orchestrator:${this.name}] listSkills called, returning ${skills.length} skills:`, skills.map(s => s.name));
    return skills;
  }

  @callable()
  async addSkill(skill: AgentSkill): Promise<{ success: boolean; skill?: AgentSkill; error?: string }> {
    try {
      console.log(`[Orchestrator:${this.name}] addSkill called for:`, skill.name, skill.id);
      if (!skill.id || !skill.name || !skill.systemPromptSnippet) {
        return { success: false, error: 'Skill id, name, and systemPromptSnippet are required.' };
      }
      this._skillRegistry.addSkill(skill);
      await this.ctx.storage.put("custom_skills", this._skillRegistry.getAllSkills());
      console.log(`[Orchestrator:${this.name}] Saved skill "${skill.name}" to storage.`);
      return { success: true, skill };
    } catch (err) {
      console.error(`[Orchestrator:${this.name}] addSkill error:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  @callable()
  async removeSkill(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[Orchestrator:${this.name}] removeSkill called for id: "${id}"`);
      this._skillRegistry.removeSkill(id);
      await this.ctx.storage.put("custom_skills", this._skillRegistry.getAllSkills());
      return { success: true };
    } catch (err) {
      console.error(`[Orchestrator:${this.name}] removeSkill error:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  @callable()
  async importSkillFromCommand(commandStr: string): Promise<{ success: boolean; skill?: AgentSkill; error?: string }> {
    try {
      console.log(`[Orchestrator:${this.name}] importSkillFromCommand received command: "${commandStr}"`);
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

      let mdText = "";
      for (const targetUrl of rawUrlsToTry) {
        try {
          const res = await fetch(targetUrl);
          if (res.ok) {
            mdText = await res.text();
            break;
          }
        } catch (fetchErr) {
          console.warn(`[Orchestrator:${this.name}] Fetch failed for ${targetUrl}:`, fetchErr);
        }
      }

      if (!mdText) {
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
      this._skillRegistry.addSkill(importedSkill);
      await this.ctx.storage.put("custom_skills", this._skillRegistry.getAllSkills());

      return { success: true, skill: importedSkill };
    } catch (err) {
      console.error(`[Orchestrator:${this.name}] importSkillFromCommand error:`, err);
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

  async listMcpToolDescriptors(timeoutMs = 10_000, serverFilter?: string[]): Promise<unknown[]> {
    try {
      await (this.mcp as any).restoreConnectionsFromStorage(this.name);
    } catch (err) {
      console.warn(`[listMcpToolDescriptors] restoreConnectionsFromStorage error:`, err);
    }

    await this.mcp.waitForConnections({ timeout: timeoutMs });
    const filter = serverFilter && serverFilter.length > 0 ? { serverId: serverFilter } : undefined;
    return this.mcp.listTools(filter);
  }

  async callMcpTool(serverId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    return await this.mcp.callTool({ arguments: args, name, serverId });
  }

  /** Spawn or retrieve a ChatAgent sub-agent for a specific chat thread */
  async getChatThread(threadId: string): Promise<SubAgentStub<ChatAgent>> {
    return await this.subAgent<ChatAgent>("ChatAgent" as any, threadId);
  }
}
