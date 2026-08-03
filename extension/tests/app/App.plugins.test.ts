import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(new URL('../../entrypoints/sidepanel/App.tsx', import.meta.url), 'utf8');

describe('plugins', () => {
  it('plugins screen uses a stable per-user agent id', () => {
    expect(source).toMatch(/import \{ getPluginsAgentId \} from '\.\.\/\.\.\/lib\/agent-id'/);
    expect(source).toMatch(/getPluginsAgentId\(user\)/);
    expect(source).not.toMatch(/<PluginsModal\s+agentId=\{activeThreadId\}/);
    expect(source).not.toMatch(/<PluginsScreen\s+agentId=\{activeThreadId\}/);
    expect(source).not.toMatch(/getPluginsAgentId\([^)]*activeThreadId/);
    expect(source).not.toMatch(/const PLUGINS_AGENT_ID = 'plugins';/);
    expect(source).not.toMatch(/plugins-install-/);
    expect(source).not.toMatch(/PLUGINS_AGENT_ID_STORAGE_KEY/);
    expect(source).not.toMatch(/\[App\] MCP update received/);
  });
});
