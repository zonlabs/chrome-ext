import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../../ui/app/App.tsx', import.meta.url), 'utf8');

test('plugins modal uses a stable per-user agent id', () => {
  assert.match(source, /import \{ getPluginsAgentId \} from '\.\.\/features\/plugins\/lib\/agentId'/);
  assert.match(source, /const pluginsAgentId = useMemo\(\(\) => getPluginsAgentId\(user\), \[user\?\.id\]\);/);
  assert.doesNotMatch(source, /<PluginsModal\s+agentId=\{activeThreadId\}/);
  assert.doesNotMatch(source, /const PLUGINS_AGENT_ID = 'plugins';/);
  assert.doesNotMatch(source, /plugins-install-/);
  assert.doesNotMatch(source, /PLUGINS_AGENT_ID_STORAGE_KEY/);
  assert.doesNotMatch(source, /\[App\] MCP update received/);
});
