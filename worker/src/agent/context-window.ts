import type { UIMessage } from "ai";
import {
  createCompactFunction,
  estimateMessageTokens,
  truncateOlderMessages,
  sanitizeToolPairs,
  type CompactResult,
} from "agents/experimental/memory/utils";
import { generateAIText } from "../utils/ai";

// ---------------------------------------------------------------------------
// Tunable defaults
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 30;
const TOKEN_THRESHOLD = 20_000;
const KEEP_RECENT = 6;
const MAX_TOOL_OUTPUT_CHARS = 400;
const MAX_TEXT_CHARS = 8_000;
const SOFT_TOKEN_LIMIT = 24_000;

// ---------------------------------------------------------------------------
// Types & Options
// ---------------------------------------------------------------------------

export interface BoundContextWindowOptions {
  /** Token threshold to trigger compaction (default: 20,000 tokens). */
  tokenThreshold?: number;
  /** Maximum number of raw messages before compaction is triggered (default: 30). */
  maxMessages?: number;
  /** Number of head messages to protect during compaction (default: 2). */
  protectHead?: number;
  /** Token budget for un-compacted recent tail messages (default: 16,000). */
  tailTokenBudget?: number;
  /** Minimum number of tail messages to protect (default: 6). */
  minTailMessages?: number;
  /** Cloudflare Workers AI binding (`env.AI`) for LLM compaction. */
  ai?: any;
  /** Custom summarize function for LLM compaction. */
  summarize?: (prompt: string) => Promise<string>;
  /** Number of recent messages kept verbatim for text/tool truncation (default: 6). */
  keepRecent?: number;
  /** Max chars for tool outputs in older messages (default: 400). */
  maxToolOutputChars?: number;
  /** Max chars for text parts in older messages (default: 8,000). */
  maxTextChars?: number;
  /** Soft token limit before emitting a warning (default: 24,000). */
  softTokenLimit?: number;
  /** SQLite query function for persisting compaction summaries (`this.sql.bind(this)`). */
  sql?: (strings: TemplateStringsArray, ...values: any[]) => any;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Estimate total tokens for an array of UIMessages using the agents SDK heuristic. */
export function estimateUIMessageTokens(messages: UIMessage[]): number {
  return estimateMessageTokens(messages as Parameters<typeof estimateMessageTokens>[0]);
}

/**
 * Bound the context window sent to the model each turn using the `agents`
 * SDK reference compaction algorithm (`createCompactFunction`).
 */
export async function boundContextWindow(
  messages: UIMessage[],
  opts: BoundContextWindowOptions = {}
): Promise<UIMessage[]> {
  const maxMessages = opts.maxMessages ?? MAX_MESSAGES;
  const tokenThreshold = opts.tokenThreshold ?? TOKEN_THRESHOLD;
  const keepRecent = opts.keepRecent ?? KEEP_RECENT;
  const maxToolOutputChars = opts.maxToolOutputChars ?? MAX_TOOL_OUTPUT_CHARS;
  const maxTextChars = opts.maxTextChars ?? MAX_TEXT_CHARS;
  const softTokenLimit = opts.softTokenLimit ?? SOFT_TOKEN_LIMIT;

  let current = messages;

  // Build compaction function using agents createCompactFunction
  const compactFn =
    opts.ai || opts.summarize
      ? createCompactFunction({
        protectHead: opts.protectHead ?? 2,
        tailTokenBudget: opts.tailTokenBudget ?? 16_000,
        minTailMessages: opts.minTailMessages ?? 6,
        summarize:
          opts.summarize ||
          ((prompt: string) => generateAIText({ binding: opts.ai, prompt })),
      })
      : undefined;

  // 1. LLM Compaction via createCompactFunction
  if (compactFn && (messages.length > maxMessages || estimateUIMessageTokens(messages) > tokenThreshold)) {
    const compactResult = await compactFn(messages as Parameters<typeof compactFn>[0]);
    if (compactResult) {
      const { fromMessageId, toMessageId, summary } = compactResult;
      const fromIdx = messages.findIndex((m) => m.id === fromMessageId);
      const toIdx = messages.findIndex((m) => m.id === toMessageId);

      if (fromIdx !== -1 && toIdx !== -1 && toIdx >= fromIdx) {
        const summaryContent = `[Conversation Summary]\n${summary}`;
        const summaryMsg: UIMessage = {
          id: `compaction_summary_${Date.now()}`,
          role: "assistant",
          parts: [{ type: "text", text: summaryContent }],
          content: summaryContent,
        } as unknown as UIMessage;

        const head = messages.slice(0, fromIdx);
        const tail = messages.slice(toIdx + 1);
        current = [...head, summaryMsg, ...tail];

        if (opts.sql) {
          try {
            await opts.sql`
              CREATE TABLE IF NOT EXISTS cf_context_summaries (
                id TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                from_message_id TEXT NOT NULL,
                to_message_id TEXT NOT NULL,
                updated_at INTEGER NOT NULL
              )
            `;
            await opts.sql`
              INSERT OR REPLACE INTO cf_context_summaries (id, summary, from_message_id, to_message_id, updated_at)
              VALUES ('summary', ${summary}, ${fromMessageId}, ${toMessageId}, ${Date.now()})
            `;
          } catch (err) {
            console.error("[ChatAgent:contextWindow] SQLite write error:", err);
          }
        }
      }
    }
  }

  // 2. Tool Pair Sanitization
  current = sanitizeToolPairs(current as Parameters<typeof sanitizeToolPairs>[0]) as unknown as UIMessage[];

  // 3. Older Message Truncation
  const truncated = truncateOlderMessages(
    current as Parameters<typeof truncateOlderMessages>[0],
    { keepRecent, maxToolOutputChars, maxTextChars }
  ) as UIMessage[];

  // 4. Soft Token Limit Logging
  const finalTokens = estimateUIMessageTokens(truncated);
  console.log(`[ChatAgent:contextWindow] history=${messages.length} → window=${truncated.length} estimatedTokens=${finalTokens}`);

  if (finalTokens > softTokenLimit) {
    console.warn(
      `[ChatAgent:contextWindow] estimated tokens (${finalTokens}) exceeds soft limit (${softTokenLimit}).`
    );
  }

  return truncated;
}




