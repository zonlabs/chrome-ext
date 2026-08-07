import type { UIMessage } from "ai";
import {
  createCompactFunction,
  estimateMessageTokens,
  truncateOlderMessages,
  sanitizeToolPairs,
  isCompactionMessage,
} from "agents/experimental/memory/utils";
import { generateAIText, type WorkersAIBinding } from "../utils/ai";

// ---------------------------------------------------------------------------
// Tunable defaults
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 30;
const TOKEN_THRESHOLD = 20_000;
const KEEP_RECENT = 6;
const MAX_TOOL_OUTPUT_CHARS = 400;
const MAX_TEXT_CHARS = 8_000;
const SOFT_TOKEN_LIMIT = 16_000;

// ---------------------------------------------------------------------------
// Types & Options
// ---------------------------------------------------------------------------

export type SqlQueryFunction = (strings: TemplateStringsArray, ...values: any[]) => any;

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
  ai?: WorkersAIBinding | any;
  /** Custom summarize function for LLM compaction. */
  summarize?: (prompt: string) => Promise<string>;
  /** Number of recent messages kept verbatim for text/tool truncation (default: 6). */
  keepRecent?: number;
  /** Max chars for tool outputs in older messages (default: 400). */
  maxToolOutputChars?: number;
  /** Max chars for text parts in older messages (default: 8,000). */
  maxTextChars?: number;
  /** Soft token limit before emitting a warning (default: 16,000). */
  softTokenLimit?: number;
  /** Enable verbose console logging (default: false). */
  debug?: boolean;
  /** SQLite query function for persisting compaction summaries (`this.sql.bind(this)`). */
  sql?: SqlQueryFunction;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Estimate total tokens for an array of UIMessages using the agents SDK heuristic. */
export function estimateUIMessageTokens(messages: UIMessage[]): number {
  return estimateMessageTokens(messages as Parameters<typeof estimateMessageTokens>[0]);
}

function hasToolCalls(msg?: UIMessage): boolean {
  if (!msg || msg.role !== "assistant") return false;
  return (msg.parts || []).some(
    (p: any) =>
      p.type === "tool-invocation" ||
      p.type === "tool-call" ||
      !!p.toolInvocation ||
      !!p.toolCall
  );
}

function isToolResult(msg?: UIMessage): boolean {
  if (!msg) return false;
  return (msg.parts || []).some(
    (p: any) =>
      p.type === "tool-result" ||
      (p.type === "tool-invocation" && (p.toolInvocation?.state === "result" || p.toolInvocation?.result !== undefined))
  );
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
  const debug = opts.debug ?? false;

  let current = [...messages];
  const isOverThreshold = current.length > maxMessages || estimateUIMessageTokens(current) > tokenThreshold;

  // 0. Restore stored summary from SQLite if threshold reached and not already in active context
  if (opts.sql && isOverThreshold && !current.some((m) => isCompactionMessage(m as Parameters<typeof isCompactionMessage>[0]))) {
    try {
      const rows = await opts.sql`SELECT summary FROM cf_context_summaries WHERE id = 'summary' LIMIT 1`;
      if (rows && rows.length > 0 && rows[0]?.summary) {
        const storedSummary = String(rows[0].summary).replace(/^\[Conversation Summary\]\s*/gi, "").trim();
        const summaryContent = `[Conversation Summary]\n${storedSummary}`;
        const storedSummaryMsg: UIMessage = {
          id: `compaction_summary_persisted`,
          role: "user",
          parts: [{ type: "text", text: summaryContent }],
        } as unknown as UIMessage;

        let headCount = Math.min(opts.protectHead ?? 2, current.length);
        while (
          headCount > 0 &&
          headCount < current.length &&
          hasToolCalls(current[headCount - 1]) &&
          isToolResult(current[headCount])
        ) {
          headCount++;
        }

        current = [
          ...current.slice(0, headCount),
          storedSummaryMsg,
          ...current.slice(headCount),
        ];
        // Ensure tool-call / tool-result pairs are not split by the inserted summary
        current = sanitizeToolPairs(current as Parameters<typeof sanitizeToolPairs>[0]) as unknown as UIMessage[];
      }
    } catch {
      // Table doesn't exist yet
    }
  }

  // Build compaction function using agents createCompactFunction
  const compactFn =
    opts.ai || opts.summarize
      ? createCompactFunction({
          protectHead: opts.protectHead ?? 2,
          tailTokenBudget: opts.tailTokenBudget ?? 16_000,
          minTailMessages: opts.minTailMessages ?? 6,
          summarize: async (prompt: string) => {
            // Strip any nested [Conversation Summary] markers from LLM prompt
            const cleanPrompt = prompt.replace(/\[Conversation Summary\]\s*/gi, "");
            if (opts.summarize) {
              return opts.summarize(cleanPrompt);
            }
            return generateAIText({ binding: opts.ai!, prompt: cleanPrompt });
          },
        })
      : undefined;

  // 1. LLM Compaction via createCompactFunction
  if (compactFn && isOverThreshold) {
    const compactResult = await compactFn(current as Parameters<typeof compactFn>[0]);
    if (compactResult) {
      const { fromMessageId, toMessageId, summary } = compactResult;
      const fromIdx = current.findIndex((m) => m.id === fromMessageId);
      const toIdx = current.findIndex((m) => m.id === toMessageId);

      if (fromIdx !== -1 && toIdx !== -1 && toIdx >= fromIdx) {
        const cleanSummary = summary.replace(/^\[Conversation Summary\]\s*/gi, "").trim();
        const summaryContent = `[Conversation Summary]\n${cleanSummary}`;
        const summaryMsg: UIMessage = {
          id: `compaction_summary_${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: summaryContent }],
        } as unknown as UIMessage;

        const head = current.slice(0, fromIdx);
        const tail = current.slice(toIdx + 1);
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
              VALUES ('summary', ${cleanSummary}, ${fromMessageId}, ${toMessageId}, ${Date.now()})
            `;
          } catch (err) {
            if (debug) console.error("[ChatAgent:contextWindow] SQLite write error:", err);
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

  // 4. Soft Token Limit Logging (gated behind debug flag)
  if (debug) {
    const finalTokens = estimateUIMessageTokens(truncated);
    console.log(`[ChatAgent:contextWindow] history=${messages.length} → window=${truncated.length} estimatedTokens=${finalTokens}`);

    if (finalTokens > softTokenLimit) {
      console.warn(
        `[ChatAgent:contextWindow] estimated tokens (${finalTokens}) exceeds soft limit (${softTokenLimit}).`
      );
    }
  }

  return truncated;
}




