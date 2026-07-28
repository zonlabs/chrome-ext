import { ModelMessage } from "ai";
import { supportsVision } from "./models";

/**
 * Structure representing auto-captured browser tab context.
 */
export interface PageContext {
  url: string;
  title: string;
  text: string;
}

/**
 * Extracts the user's initial prompt text from the messages array during the first conversation turn.
 *
 * @param messages - Array of raw agent messages.
 * @returns The concatenated user message text on turn 1, or an empty string on subsequent turns.
 */
export function extractFirstUserMessage(
  messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>
): string {
  const isFirstTurn = messages.length <= 2;
  if (!isFirstTurn) return '';

  return messages
    .filter(m => m.role === 'user')
    .flatMap(m => m.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text'))
    .map(p => p.text)
    .join('')
    .trim();
}

/**
 * Prepares model messages by injecting auto-captured page context XML into the prompt,
 * attaching viewport screenshots for vision models, and pruning image parts for text-only models.
 *
 * @param initialMessages - Converted model messages array.
 * @param optionsBody - Optional request payload body containing pageContext and screenshot data.
 * @param modelName - The target model name.
 * @returns Transformed model messages ready for model inference.
 */
export function prepareModelMessages(
  initialMessages: ModelMessage[],
  optionsBody: Record<string, unknown> | undefined,
  modelName: string
): ModelMessage[] {
  let modelMessages = [...initialMessages];
  const pageContext = optionsBody?.pageContext as PageContext | undefined;
  const screenshot = optionsBody?.screenshot as string | undefined;

  // Inject auto-captured page context into the last user message
  if (pageContext) {
    const contextText = `<page_context url="${pageContext.url}" title="${pageContext.title}">\n${pageContext.text}\n</page_context>`;
    for (let i = modelMessages.length - 1; i >= 0; i--) {
      const msg = modelMessages[i];
      if (msg.role !== 'user') continue;
      if (typeof msg.content === 'string') {
        msg.content = `${contextText}\n\n${msg.content}`;
      } else if (Array.isArray(msg.content)) {
        for (let j = msg.content.length - 1; j >= 0; j--) {
          const p = msg.content[j];
          if (p.type === 'text') {
            (p as { type: 'text'; text: string }).text = `${contextText}\n\n${(p as { type: 'text'; text: string }).text}`;
            break;
          }
        }
      }
      // Attach screenshot as image part if model supports vision
      if (screenshot && supportsVision(modelName)) {
        if (typeof msg.content === 'string') {
          msg.content = [{ type: 'text' as const, text: msg.content }, { type: 'image' as const, image: screenshot }];
        } else if (Array.isArray(msg.content)) {
          (msg.content as unknown as Array<Record<string, unknown>>).push({ type: 'image', image: screenshot });
        }
      }
      break;
    }
  }

  // Strip image parts for text-only models to avoid provider errors
  if (!supportsVision(modelName)) {
    modelMessages = modelMessages.map(msg => {
      if (msg.role !== 'user' || typeof msg.content === 'string') return msg;
      const textParts = msg.content.filter(p => p.type !== 'image');
      if (textParts.length === 0) return { role: 'user' as const, content: '' };
      if (textParts.length === 1 && textParts[0].type === 'text') {
        return { role: 'user' as const, content: textParts[0].text };
      }
      return { role: 'user' as const, content: textParts };
    }) as ModelMessage[];
  }

  return modelMessages;
}

/**
 * Asynchronously generates a short title for the chat session using Workers AI
 * and broadcasts it to connected WebSocket clients.
 *
 * @param aiBinding - Cloudflare Workers AI binding instance (`env.AI`).
 * @param userMessage - The initial prompt from the user.
 * @param broadcast - Callback function to send WebSocket message frames.
 */
export async function generateChatTitle(
  aiBinding: any,
  userMessage: string,
  broadcast: (data: string) => void
): Promise<void> {
  if (!userMessage) return;

  try {
    const res: any = await aiBinding.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: 'Generate a concise title (max 6 words) for a chat based on the user\'s first message. Reply with ONLY the title — no quotes, no punctuation, no explanation.' },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 15,
      temperature: 0.3,
    });
    const title = (res.response?.trim() || 'New Chat').replace(/^["']|["']$/g, '') || 'New Chat';
    broadcast(JSON.stringify({ type: 'chat:title', title }));
  } catch {
    // Title generation failed — keep default "New Chat"
  }
}
