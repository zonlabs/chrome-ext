import { OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, pruneMessages, createUIMessageStreamResponse, toUIMessageStream, GenerateTextOnEndCallback, isStepCount, UIMessage } from "ai";

import { McpAgent } from "./agent/mcp-agent";
import { DEFAULT_MODEL, buildSystemPrompt } from "./agent/models";
import { extractFirstUserMessage, prepareModelMessages, generateChatTitle } from "./agent/messages";
import { resolveAgentTools } from "./agent/tools";

/**
 * Primary Durable Object class handling conversational AI thread state,
 * streaming LLM completions, message context enrichment, and persistence.
 *
 * Extends {@link McpAgent} to inherit MCP plugin management and RPC tool capabilities.
 */
export class ChatAgent extends McpAgent<Env> {
  private _userId: string | null = null;

  /**
   * Primary message handler invoked when a chat message stream is requested by the client.
   *
   * @param _onFinish - Callback executed when text streaming completes.
   * @param _options - Request options containing user ID, model choice, page context, and client schemas.
   * @returns HTTP Response containing UI message stream.
   */
  async onChatMessage(
    _onFinish: GenerateTextOnEndCallback,
    _options?: OnChatMessageOptions
  ) {
    this._userId = (_options?.body?.userId as string) || null;

    const workersai = createWorkersAI({ binding: this.env.AI });
    const modelName = (_options?.body?.model as string) || DEFAULT_MODEL;

    const userMessage = extractFirstUserMessage(this.messages);

    try {
      const tools = await resolveAgentTools(_options, this.env);
      const rawModelMessages = await convertToModelMessages(this.messages);
      const modelMessages = prepareModelMessages(rawModelMessages, _options?.body as Record<string, unknown>, modelName);

      const result = streamText({
        model: workersai(modelName),
        system: buildSystemPrompt(modelName),
        messages: pruneMessages({
          messages: modelMessages,
          toolCalls: "before-last-2-messages",
        }),
        tools,
        maxOutputTokens: 1024,
        temperature: 0.3,
        stopWhen: isStepCount(10),
        onFinish: async (event) => {
          _onFinish?.(event);
          await generateChatTitle(this.env.AI, userMessage, (data) => this.broadcast(data));
        },
      });

      return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
      });
    } catch (err) {
      const msg = `Error with model "${modelName}": ${err instanceof Error ? err.message : String(err)}`;
      console.error('[ChatAgent]', msg);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * Overrides SQLite message persistence behavior to ensure unauthenticated threads
   * or deleted client message IDs are properly cleaned up in Cloudflare D1 storage.
   *
   * @param messages - Complete list of current thread messages.
   * @param excludeBroadcastIds - Message IDs to omit from WebSocket broadcast.
   * @param options - Additional framework persistence flags.
   */
  override async persistMessages(
    messages: UIMessage[],
    excludeBroadcastIds?: string[],
    options?: { _deleteStaleRows?: boolean }
  ): Promise<void> {
    if (!this._userId) {
      await super.persistMessages(messages, excludeBroadcastIds, options);
      this.sql`DELETE FROM cf_ai_chat_agent_messages`;
      (this as any)._persistedMessageCache?.clear();
      return;
    }

    const clientIds = new Set(messages.map(m => m.id));
    const staleIds = this.messages
      .map(m => m.id)
      .filter(id => !clientIds.has(id));

    if (staleIds.length > 0) {
      for (const id of staleIds) {
        this.sql`DELETE FROM cf_ai_chat_agent_messages WHERE id = ${id}`;
        (this as any)._persistedMessageCache?.delete(id);
      }
    }

    await super.persistMessages(messages, excludeBroadcastIds, options);
  }
}
