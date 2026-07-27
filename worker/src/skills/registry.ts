import { tool, ToolSet } from 'ai';
import { z } from 'zod';
import { AgentSkill } from './types';

export class SkillRegistry {
  private skillsMap: Map<string, AgentSkill>;

  constructor(initialSkills: AgentSkill[] = []) {
    this.skillsMap = new Map();
    for (const skill of initialSkills) {
      this.skillsMap.set(skill.id, skill);
    }
  }

  /** Return all registered skills */
  getAllSkills(): AgentSkill[] {
    return Array.from(this.skillsMap.values());
  }

  /** Retrieve a skill by ID */
  getSkill(id: string): AgentSkill | undefined {
    return this.skillsMap.get(id);
  }

  /** Register or update a skill */
  addSkill(skill: AgentSkill): void {
    this.skillsMap.set(skill.id, skill);
  }

  /** Remove a skill by ID */
  removeSkill(id: string): boolean {
    return this.skillsMap.delete(id);
  }

  /** Match user prompt against skill trigger keywords */
  matchSkills(userPrompt: string): AgentSkill[] {
    const lower = userPrompt.toLowerCase();
    return this.getAllSkills().filter(skill => 
      skill.triggers.some(trigger => lower.includes(trigger.toLowerCase()))
    );
  }

  /** Generate catalog prompt for available skills */
  getCatalogPrompt(): string {
    const all = this.getAllSkills();
    if (all.length === 0) return '';
    const catalog = all.map(s => `- ${s.name} (${s.id}): ${s.description}`).join('\n');
    return `\n\nAvailable Skills Catalog:\nWhen a user task matches one of the skills below, use the activate_skill tool with its name before proceeding.\n${catalog}\n`;
  }

  /** Build AI SDK tools for skill activation */
  getTools(): ToolSet {
    const allSkills = this.getAllSkills();
    if (allSkills.length === 0) return {};

    return {
      activate_skill: tool({
        description: "Activate a skill by name. Use this when the user's task matches one of the available skills in the catalog.",
        inputSchema: z.object({
          name: z.string().describe("The name or id of the skill to activate")
        }),
        execute: async ({ name }: { name: string }) => {
          console.log(`[SkillRegistry] activate_skill tool invoked by model for: "${name}"`);
          const skill = this.getSkill(name) || allSkills.find(s => s.name.toLowerCase() === name.toLowerCase() || s.id.toLowerCase() === name.toLowerCase());
          if (!skill) {
            console.warn(`[SkillRegistry] Skill "${name}" not found in registry. Available:`, allSkills.map(s => s.name));
            return `Skill "${name}" not found. Available skills: ${allSkills.map(s => s.name).join(', ')}`;
          }
          console.log(`[SkillRegistry] Successfully activated skill: "${skill.name}" (${skill.id})`);
          return `[Activated Skill: ${skill.name}]\n<skill_content name="${skill.name}">\n${skill.systemPromptSnippet}\n</skill_content>`;
        }
      })
    };
  }

  /** Generate aggregated system prompt snippet for active skills */
  getSkillsPromptSnippet(activeSkillIds?: string[], userPrompt?: string): string {
    let activeSkills: AgentSkill[] = [];

    if (activeSkillIds && activeSkillIds.length > 0) {
      activeSkills = activeSkillIds
        .map(id => this.getSkill(id))
        .filter((s): s is AgentSkill => s !== undefined);
    } else if (userPrompt) {
      activeSkills = this.matchSkills(userPrompt);
    } else {
      activeSkills = this.getAllSkills().filter(s => s.enabledByDefault);
    }

    const catalog = this.getCatalogPrompt();
    if (activeSkills.length === 0) return catalog;

    return catalog + "\n--- Active Agent Skills ---\n" +
      activeSkills.map(s => s.systemPromptSnippet).join("\n\n") +
      "\n---------------------------\n";
  }
}

/** Parse frontmatter and body from a SKILL.md document */
export function parseSkillMarkdown(md: string, defaultId: string): AgentSkill {
  let name = defaultId;
  let description = `Dynamically imported skill (${defaultId})`;
  let triggers: string[] = [defaultId];
  let body = md;

  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const frontmatter = fmMatch[1];
    body = fmMatch[2];

    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');

    const descMatch = frontmatter.match(/description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');

    const triggersMatch = frontmatter.match(/triggers:\s*\n((?:\s*-\s*.+\r?\n?)+)/);
    if (triggersMatch) {
      triggers = triggersMatch[1]
        .split('\n')
        .map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
  }

  return {
    id: 'custom-' + defaultId.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: name || defaultId,
    description: description,
    category: 'custom',
    triggers: triggers.length > 0 ? triggers : [defaultId],
    systemPromptSnippet: body.trim(),
    enabledByDefault: true,
  };
}
