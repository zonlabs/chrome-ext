import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const background = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
const authConfig = readFileSync(new URL('../../worker/src/utils/auth.ts', import.meta.url), 'utf8');
const workerIndex = readFileSync(new URL('../../worker/src/index.ts', import.meta.url), 'utf8');

describe('auth flow', () => {
  it('extension signs in through Better Auth native social endpoint', () => {
    expect(background).toMatch(/\/api\/auth\/sign-in\/social/);
    expect(background).toMatch(/idToken/);
    expect(background).toMatch(/set-auth-token/);
    expect(background).not.toMatch(/\/api\/auth\/google/);
  });

  it('Worker config enables Better Auth Google social provider', () => {
    expect(authConfig).toMatch(/socialProviders/);
    expect(authConfig).toMatch(/google:/);
  });

  it('Worker enables database-backed rate limiting and user bans', () => {
    expect(authConfig).toMatch(/rateLimit:/);
    expect(authConfig).toMatch(/storage: ['"]database['"]/);
    expect(authConfig).toMatch(/admin\(/);
    expect(workerIndex).toMatch(/getAuthSuccessHtml/);
    expect(workerIndex).not.toMatch(/routes\/auth/);
  });
});
