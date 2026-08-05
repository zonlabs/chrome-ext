import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boundContextWindow, estimateUIMessageTokens } from './context-window';
import type { UIMessage } from 'ai';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTextMsg(id: string, role: 'user' | 'assistant' = 'user', text = 'hello'): UIMessage {
  return { id, role, parts: [{ type: 'text', text }], content: text } as unknown as UIMessage;
}

function makeToolCallMsg(id: string): UIMessage {
  return {
    id, role: 'assistant',
    parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName: 'search', state: 'call', args: {} } }],
    content: '',
  } as unknown as UIMessage;
}

function makeToolResultMsg(id: string, output: string): UIMessage {
  return {
    id, role: 'tool',
    parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName: 'search', state: 'result', args: {}, result: output } }],
    content: '',
  } as unknown as UIMessage;
}

function buildConversation(n: number): UIMessage[] {
  return Array.from({ length: n }, (_, i) =>
    makeTextMsg('msg-' + i, i % 2 === 0 ? 'user' : 'assistant', 'message ' + i)
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('boundContextWindow', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns unchanged when history is within MAX_MESSAGES', async () => {
    const msgs = buildConversation(10);
    const result = await boundContextWindow(msgs, { maxMessages: 30 });
    expect(result.length).toBe(10);
  });

  it('does not mutate the original array', async () => {
    const msgs = buildConversation(40);
    const original = msgs.map(m => m.id);
    await boundContextWindow(msgs, { maxMessages: 30 });
    expect(msgs.map(m => m.id)).toEqual(original);
  });

  it('compacts messages when history exceeds limit', async () => {
    const msgs = buildConversation(50);
    const mockSummarize = vi.fn().mockResolvedValue('Summary');
    const result = await boundContextWindow(msgs, {
      maxMessages: 30,
      tokenThreshold: 100,
      protectHead: 2,
      tailTokenBudget: 50,
      minTailMessages: 2,
      summarize: mockSummarize,
    });
    expect(result.length).toBeLessThan(50);
    expect(result[result.length - 1].id).toBe('msg-49');
  });

  // Pass 2: LLM Compaction
  it('inserts a synthetic summary message when summarize option is provided', async () => {
    const msgs = buildConversation(40);
    const mockSummarize = vi.fn().mockResolvedValue('Synthetic conversation summary of dropped turns.');

    const result = await boundContextWindow(msgs, {
      maxMessages: 30,
      tokenThreshold: 100,
      protectHead: 2,
      tailTokenBudget: 50,
      minTailMessages: 2,
      summarize: mockSummarize,
    });

    expect(mockSummarize).toHaveBeenCalled();
    const summaryMsg = result.find(m => m.id.startsWith('compaction_summary'));
    expect(summaryMsg).toBeDefined();
    expect((summaryMsg as any).content).toContain('Synthetic conversation summary of dropped turns.');
  });

  // Pass 3: truncation
  it('truncates large text in older messages', async () => {
    const longText = 'a'.repeat(20_000);
    const msgs: UIMessage[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeTextMsg('old-' + i, i % 2 === 0 ? 'user' : 'assistant', longText)
      ),
      ...buildConversation(6),
    ];
    const result = await boundContextWindow(msgs, {
      maxMessages: 30,
      keepRecent: 6,
      maxTextChars: 400,
    });
    expect(JSON.stringify(result).length).toBeLessThan(JSON.stringify(msgs).length);
  });

  it('leaves the last keepRecent messages untouched', async () => {
    const uniqueText = 'UNIQUE_' + 'y'.repeat(500);
    const msgs: UIMessage[] = [...buildConversation(20), makeTextMsg('recent', 'user', uniqueText)];
    const result = await boundContextWindow(msgs, { maxMessages: 30, keepRecent: 6, maxTextChars: 100 });
    const found = result.find(m => m.id === 'recent');
    expect(found).toBeDefined();
    const textPart = (found!.parts as any[]).find((p: any) => p.type === 'text');
    if (textPart) expect(textPart.text).toBe(uniqueText);
  });

  // Pass 4: soft token limit
  it('emits console.warn when estimated tokens exceed soft limit', async () => {
    const longText = 'word '.repeat(500);
    const msgs = Array.from({ length: 30 }, (_, i) =>
      makeTextMsg('m-' + i, i % 2 === 0 ? 'user' : 'assistant', longText)
    );
    await boundContextWindow(msgs, { maxMessages: 30, softTokenLimit: 100 });
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not warn when tokens are below soft limit', async () => {
    const msgs = buildConversation(5);
    await boundContextWindow(msgs, { maxMessages: 30, softTokenLimit: 100_000 });
    expect(console.warn).not.toHaveBeenCalled();
  });

  describe('estimateUIMessageTokens', () => {
    it('returns 0 for empty array', () => {
      expect(estimateUIMessageTokens([])).toBe(0);
    });

    it('returns a positive number for non-empty messages', () => {
      expect(estimateUIMessageTokens(buildConversation(5))).toBeGreaterThan(0);
    });

    it('increases with more messages', () => {
      expect(estimateUIMessageTokens(buildConversation(30)))
        .toBeGreaterThan(estimateUIMessageTokens(buildConversation(3)));
    });
  });
});
