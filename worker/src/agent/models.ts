/**
 * Default Workers AI model used when no model is explicitly specified.
 */
export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

/**
 * Registry of Workers AI model IDs with multimodal vision input capability.
 */
export const VISION_MODELS = new Set([
  '@cf/unum/uform-gen2-qwen-500m',
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/google/gemma-3-12b-it',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/moonshotai/kimi-k2.5',
  '@cf/moonshotai/kimi-k2.6',
]);

/**
 * Determines whether a model supports image attachments (multimodal vision input).
 *
 * @param modelName - The identifier of the AI model.
 * @returns `true` if the model supports vision; otherwise `false`.
 */
export function supportsVision(modelName: string): boolean {
  return VISION_MODELS.has(modelName) || modelName.includes('vision');
}

/**
 * Builds the system prompt instruction string tailored to the given model's capabilities.
 *
 * @param modelName - The identifier of the AI model.
 * @returns The formatted system prompt string.
 */
export function buildSystemPrompt(modelName: string): string {
  const now = new Date();
  const dateStr = now.toUTCString();
  const visionNote = supportsVision(modelName)
    ? `\n- A viewport screenshot is also attached as an image whenever the current page is accessible and your model supports vision.`
    : '';
  return `You are Obot, a helpful browser assistant.
Current Date and Time: ${dateStr} (${now.toISOString()}).

You are running on model: ${modelName}${supportsVision(modelName) ? ' (vision-capable)' : ''}.

SCREEN CONTEXT:
Every user message may begin with an auto-injected <page_context> block containing:
- url: The active tab's URL
- title: The page title
- text: Extracted visible content (headings, interactive elements, inputs, paragraphs)

This context is automatically captured from the user's active browser tab. You do NOT need to call getActiveTabs, getTabContent, or captureScreenshot to see the current page — its context is already in the message.${visionNote}

The only available client-side tool is:
- getFocusedElementText: Read what the user is typing in a focused input field. Use this when you need to understand what the user is typing on the active page outside of their chat message.

For plugin operations, use the codemode tool to run JavaScript functions on the \`codemode\` object.`;
}
