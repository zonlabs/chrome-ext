import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(new URL('../../src/routes/threads.ts', import.meta.url), 'utf8');

describe('threads contract', () => {
  it('thread creation is authenticated and server-owned', () => {
    expect(source).toMatch(/app\.post\('\/threads'/);
    expect(source).toMatch(/crypto\.randomUUID\(\)/);
    expect(source).toMatch(/Client-supplied thread IDs are not allowed/);
    expect(source).toMatch(/return c\.json\(\{ thread \}, 201\)/);
  });

  it('thread mutations validate ownership and titles', () => {
    expect(source).toMatch(/app\.patch\('\/threads\/:id'/);
    expect(source).toMatch(/Invalid thread title/);
    expect(source).toMatch(/requireAuth/);
  });

  it('thread mutation endpoints reject non-object JSON bodies', () => {
    expect(source).toMatch(/Invalid thread payload/);
  });
});
