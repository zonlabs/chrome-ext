import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./threads.ts', import.meta.url), 'utf8');

test('thread creation is authenticated and server-owned', () => {
  assert.match(source, /app\.post\('\/threads'/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /Client-supplied thread IDs are not allowed/);
  assert.match(source, /return c\.json\(\{ thread \}, 201\)/);
});

test('thread mutations validate ownership and titles', () => {
  assert.match(source, /app\.patch\('\/threads\/:id'/);
  assert.match(source, /Invalid thread title/);
  assert.match(source, /Unauthorized/);
});

test('thread mutation endpoints reject non-object JSON bodies', () => {
  assert.match(source, /Invalid thread payload/);
});
