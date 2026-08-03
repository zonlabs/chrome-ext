import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(new URL('../../../features/chat/components/ChatView.tsx', import.meta.url), 'utf8');

describe('ChatView deprecations', () => {
  it('ChatView uses onToolCall instead of deprecated automatic tool resolution', () => {
    expect(source).not.toMatch(/experimental_automaticToolResolution/);
    expect(source).toMatch(/onToolCall/);
  });
});
