/** Agent Skill Interface for Obot's Cloudflare Agent */
export interface AgentSkill {
  /** Unique skill identifier (e.g. 'browser-devtools') */
  id: string;
  /** Human-readable skill name */
  name: string;
  /** Description of what the skill enables */
  description: string;
  /** Skill category tag */
  category: 'browser' | 'search' | 'data' | 'memory' | 'custom';
  /** Trigger keywords or user intent tags */
  triggers: string[];
  /** System prompt instructions injected when skill is active */
  systemPromptSnippet: string;
  /** Whether the skill is enabled by default */
  enabledByDefault: boolean;
}
