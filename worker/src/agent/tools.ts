import { createToolsFromClientSchemas, OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { ToolSet } from "ai";
import { McpProxy } from "../mcp-proxy";

/**
 * Resolves all tools available for an AI chat session.
 * Combines client-side schemas, remote MCP server tools fetched via `McpProxy`,
 * and dynamic JavaScript execution capabilities provided by CodeMode.
 *
 * @param options - Chat message execution options provided by the framework.
 * @param env - Worker environment bindings.
 * @returns Combined toolset object ready for Vercel AI SDK `streamText`.
 */
export async function resolveAgentTools(
  options: OnChatMessageOptions | undefined,
  env: Env
): Promise<ToolSet> {
  const clientTools = options?.clientTools?.length
    ? createToolsFromClientSchemas(options.clientTools)
    : {};
  console.log("client tools :", clientTools);

  const pluginsAgentId = options?.body?.pluginsAgentId as string | undefined;
  const enabledPlugins = options?.body?.enabledPlugins as string[] | undefined;

  let mcpTools: ToolSet = {};
  if (pluginsAgentId) {
    try {
      const sharedMcp = new McpProxy(() =>
        Promise.resolve(env.ChatAgent.get(env.ChatAgent.idFromName(pluginsAgentId)))
      );
      mcpTools = await sharedMcp.getAITools(5_000, enabledPlugins);
    } catch (err) {
      console.error("[ChatAgent] Failed to get tools from plugins DO:", err);
    }
  }

  const executor = new DynamicWorkerExecutor({ loader: env.LOADER });
  const codemode = createCodeTool({ tools: mcpTools, executor });

  return { ...clientTools, codemode };
}
