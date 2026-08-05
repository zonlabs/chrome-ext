import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export const DEFAULT_FAST_MODEL = "@cf/meta/llama-3.2-3b-instruct";

export interface GenerateAITextOptions {
  /** Cloudflare Workers AI binding instance (env.AI). */
  binding: any;
  /** Prompt text to generate completion for. */
  prompt: string;
  /** Model identifier (defaults to @cf/meta/llama-3.2-3b-instruct). */
  model?: string;
  /** Optional system prompt instruction. */
  system?: string;
  /** Maximum tokens for output completion (default: 1024). */
  maxTokens?: number;
  /** Sampling temperature (default: 0.3). */
  temperature?: number;
}

/**
 * Executes a text completion call using AI SDK generateText with Cloudflare Workers AI.
 *
 * @param options - Generation options including Workers AI binding, model, prompt, and parameters.
 * @returns The trimmed output text string.
 */
export async function generateAIText(options: GenerateAITextOptions): Promise<string> {
  const modelName = options.model || DEFAULT_FAST_MODEL;
  const workersai = createWorkersAI({ binding: options.binding });

  const { text } = await generateText({
    model: workersai(modelName),
    system: options.system,
    prompt: options.prompt,
    maxOutputTokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
  });

  return text.trim();
}
