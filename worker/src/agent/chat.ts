import { AIChatAgent, OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, pruneMessages, createUIMessageStreamResponse, toUIMessageStream, GenerateTextOnEndCallback, isStepCount, UIMessage } from "ai";

import { DEFAULT_MODEL, buildSystemPrompt } from "./models";
import { extractFirstUserMessage, prepareModelMessages, generateChatTitle } from "./messages";
import { boundContextWindow } from "./context-window";
import { resolveAgentTools } from "./tools";
import { generateAIText } from "../utils/ai";

/**
 * Chat thread Durable Object handling conversational AI state,
 * streaming LLM completions, message context enrichment, and persistence.
 *
 * Extends {@link AIChatAgent} directly — MCP plugin management lives in
 * the parent {@link UserAgent} DO; ChatAgent only handles chat.
 */
export class ChatAgent extends AIChatAgent<Env> {
  /**
   * MCP connections are managed in the parent {@link UserAgent} DO via {@link McpProxy}.
   * Disable the AIChatAgent's automatic MCP wait (default: 10s) on this DO
   * since it has none — otherwise every message blocks for the full timeout.
   */
  override waitForMcpConnections = false;

  /** User ID derived from the parent UserAgent hierarchy (e.g. UserAgent named "user-<id>"). */
  private get userId(): string | null {
    const parentName = this.parentPath?.at(0)?.name;
    return parentName?.startsWith('user-') ? parentName.slice(5) : null;
  }

  /** Parent UserAgent instance name for MCP tool proxying. */
  private get pluginsAgentId(): string | undefined {
    return this.parentPath?.at(0)?.name;
  }

  /**
   * Handles incoming HTTP requests to this DO.
   * The AIChatAgent wrapper handles `/get-messages`; this catch-all
   * prevents the base Agent warning for root-path requests from
   * sub-agent forwarding or agent health checks.
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return new Response("OK", { status: 200 });
    }
    return super.onRequest(request);
  }

  /**
   * Primary message handler invoked when a chat message stream is requested by the client.
   */
  async onChatMessage(
    _onFinish: GenerateTextOnEndCallback,
    _options?: OnChatMessageOptions
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const modelName = (_options?.body?.model as string) || DEFAULT_MODEL;

    const userMessage = extractFirstUserMessage(this.messages);

    try {
      const tools = await resolveAgentTools(_options, this.env, this.pluginsAgentId);
      // Bound and compact context window before conversion using Hermes-style
      // compaction with generateAIText helper.
      const boundedMessages = await boundContextWindow(this.messages, {
        ai: this.env.AI,
        sql: this.sql.bind(this),
      });
      if (boundedMessages.length !== this.messages.length || boundedMessages.some((m, idx) => m.id !== this.messages[idx]?.id)) {
        this.messages = boundedMessages;
      }
      const rawModelMessages = await convertToModelMessages(boundedMessages);
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

      const response = createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
          onError: (error) => {
            const raw = error instanceof Error ? error.message : String(error);
            const jsonMatch = raw.match(/\{.*"message"\s*:\s*".*?\".*\}/s);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.message) return parsed.message;
              } catch {}
            }
            return raw;
          },
        }),
      });
      return response;
    } catch (err) {
      const msg = `Error with model "${modelName}": ${err instanceof Error ? err.message : String(err)}`;
      console.error('[ChatAgent]', msg);
      return new Response(msg, { status: 500 });
    }
  }

  /**
   * Overrides SQLite message persistence behavior to ensure unauthenticated threads
   * or deleted client message IDs are properly cleaned up in Cloudflare D1 storage.
   */
  override async persistMessages(
    messages: UIMessage[],
    excludeBroadcastIds?: string[],
    options?: { _deleteStaleRows?: boolean }
  ): Promise<void> {
    if (!this.userId) {
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
