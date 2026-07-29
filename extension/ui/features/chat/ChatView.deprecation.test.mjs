import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./components/ChatView.tsx', import.meta.url), 'utf8');

test('ChatView uses onToolCall instead of deprecated automatic tool resolution', () => {
  assert.doesNotMatch(source, /experimental_automaticToolResolution/);
  assert.match(source, /onToolCall/);
});
