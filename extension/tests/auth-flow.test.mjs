import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceWorker = readFileSync(new URL('../service-worker.ts', import.meta.url), 'utf8');
const authConfig = readFileSync(new URL('../../worker/src/utils/auth.ts', import.meta.url), 'utf8');
const workerIndex = readFileSync(new URL('../../worker/src/index.ts', import.meta.url), 'utf8');

test('extension signs in through Better Auth native social endpoint', () => {
  assert.match(serviceWorker, /\/api\/auth\/sign-in\/social/);
  assert.match(serviceWorker, /idToken/);
  assert.match(serviceWorker, /set-auth-token/);
  assert.doesNotMatch(serviceWorker, /\/api\/auth\/google/);
});

test('Worker config enables Better Auth Google social provider', () => {
  assert.match(authConfig, /socialProviders/);
  assert.match(authConfig, /google:/);
});

test('Worker enables database-backed rate limiting and user bans', () => {
  assert.match(authConfig, /rateLimit:/);
  assert.match(authConfig, /storage: ['\"']database['\"']/);
  assert.match(authConfig, /admin\(/);
  assert.match(workerIndex, /getAuthSuccessHtml/);
  assert.doesNotMatch(workerIndex, /routes\/auth/);
});