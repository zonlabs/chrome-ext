import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boundContextWindow, estimateUIMessageTokens } from '../../src/agent/context-window';
import type { UIMessage } from 'ai';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTextMsg(id: string, role: 'user' | 'assistant' = 'user', text = 'hello'): UIMessage {
  return { id, role, parts: [{ type: 'text', text }], content: text } as unknown as UIMessage;
}

function buildConversation(count: number): UIMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeTextMsg(`msg-${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message content ${i}`)
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('boundContextWindow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    const ids = result.map(m => m.id);
    expect(ids).toContain('msg-0');
    expect(ids).toContain('msg-1');
    expect(ids).toContain('msg-49');
    expect(ids).not.toContain('msg-20');
  });

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
    const summaryMsgs = result.filter(m => m.id.startsWith('compaction_summary'));
    expect(summaryMsgs.length).toBe(1);
    expect((summaryMsgs[0]?.parts[0] as any).text).toContain('Synthetic conversation summary of dropped turns.');
  });

  it('strips nested [Conversation Summary] prefixes in recursive compaction', async () => {
    const msgs: UIMessage[] = [
      makeTextMsg('compaction_summary_old', 'user', '[Conversation Summary]\nOld summary content'),
      ...buildConversation(35),
    ];
    const mockSummarize = vi.fn().mockImplementation(async (prompt: string) => {
      expect(prompt).not.toContain('[Conversation Summary]');
      return 'New updated summary';
    });

    const result = await boundContextWindow(msgs, {
      maxMessages: 30,
      tokenThreshold: 100,
      protectHead: 2,
      tailTokenBudget: 50,
      minTailMessages: 2,
      summarize: mockSummarize,
    });

    const newSummaryMsg = result.find(m => m.id.startsWith('compaction_summary_') && m.id !== 'compaction_summary_old');
    expect(newSummaryMsg).toBeDefined();
    expect((newSummaryMsg?.parts[0] as any).text).toBe('[Conversation Summary]\nNew updated summary');
  });

  it('restores stored SQLite summary without splitting assistant tool call and tool result pairs', async () => {
    const toolCallMsg: UIMessage = {
      id: 'tool-call-msg',
      role: 'assistant',
      parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'call_1', toolName: 'test', args: {}, state: 'call' } }],
    } as unknown as UIMessage;

    const toolResultMsg: UIMessage = {
      id: 'tool-result-msg',
      role: 'user',
      parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'call_1', toolName: 'test', result: 'ok', state: 'result' } }],
    } as unknown as UIMessage;

    const msgs: UIMessage[] = [
      makeTextMsg('head-0', 'user', 'start'),
      toolCallMsg,
      toolResultMsg,
      ...buildConversation(35),
    ];

    const mockSql = vi.fn().mockResolvedValue([{ summary: 'Restored SQL summary' }]);

    const result = await boundContextWindow(msgs, {
      maxMessages: 30,
      tokenThreshold: 100,
      protectHead: 2,
      sql: mockSql as any,
    });

    const toolCallIdx = result.findIndex(m => m.id === 'tool-call-msg');
    const toolResultIdx = result.findIndex(m => m.id === 'tool-result-msg');
    const summaryIdx = result.findIndex(m => m.id === 'compaction_summary_persisted');

    expect(toolCallIdx).not.toBe(-1);
    expect(toolResultIdx).not.toBe(-1);
    expect(toolResultIdx).toBe(toolCallIdx + 1);
    expect(summaryIdx).not.toBe(toolCallIdx + 1);
  });

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

    expect((result[0].parts[0] as any).text.length).toBeLessThan(500);
  });

  it('leaves the last keepRecent messages untouched', async () => {
    const longText = 'b'.repeat(20_000);
    const msgs: UIMessage[] = [
      ...buildConversation(4),
      ...Array.from({ length: 6 }, (_, i) =>
        makeTextMsg('recent-' + i, 'user', longText)
      ),
    ];
    const result = await boundContextWindow(msgs, {
      maxMessages: 30,
      keepRecent: 6,
      maxTextChars: 400,
    });

    const lastMsg = result[result.length - 1];
    expect((lastMsg.parts[0] as any).text.length).toBe(20_000);
  });

  it('logs debug messages when debug option is true', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const msgs = buildConversation(10);
    await boundContextWindow(msgs, { debug: true });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('does not log when debug option is false', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const msgs = buildConversation(10);
    await boundContextWindow(msgs, { debug: false });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  describe('estimateUIMessageTokens', () => {
    it('returns 0 for empty array', () => {
      expect(estimateUIMessageTokens([])).toBe(0);
    });

    it('returns a positive number for non-empty messages', () => {
      const msgs = buildConversation(3);
      expect(estimateUIMessageTokens(msgs)).toBeGreaterThan(0);
    });

    it('increases with more messages', () => {
      const small = buildConversation(2);
      const large = buildConversation(10);
      expect(estimateUIMessageTokens(large)).toBeGreaterThan(estimateUIMessageTokens(small));
    });
  });
});
