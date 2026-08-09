import { createToolsFromClientSchemas, OnChatMessageOptions } from "@cloudflare/ai-chat";
import { toolSetConnector } from "@cloudflare/codemode/ai";
import { createCodemodeRuntime, DynamicWorkerExecutor } from "@cloudflare/codemode";
import { ToolSet } from "ai";
import { McpProxy } from "../mcp-proxy";

/**
 * Resolves all tools available for an AI chat session.
 * Combines client-side schemas, remote MCP server tools fetched via `McpProxy`,
 * and dynamic JavaScript execution capabilities provided by CodeMode.
 *
 * @param options - Chat message execution options provided by the framework.
 * @param env - Worker environment bindings.
 * @param pluginsAgentId - Server-derived plugins agent ID (e.g. user-<userId>).
 * @returns Combined toolset object ready for Vercel AI SDK `streamText`.
 */
export async function resolveAgentTools(
  options: OnChatMessageOptions | undefined,
  ctx: DurableObjectState,
  env: Env,
  pluginsAgentId?: string
): Promise<ToolSet> {
  const clientTools = options?.clientTools?.length
    ? createToolsFromClientSchemas(options.clientTools)
    : {};

  const enabledPlugins = options?.body?.enabledPlugins as string[] | undefined;

  let mcpTools: ToolSet = {};
  if (pluginsAgentId) {
    try {
      const agentNs = (env as any).UserAgent;
      const sharedMcp = new McpProxy(() =>
        Promise.resolve(agentNs.get(agentNs.idFromName(pluginsAgentId)))
      );
      mcpTools = await sharedMcp.getAITools(5_000, enabledPlugins);
    } catch (err) {
      console.error("[ChatAgent] Failed to get tools from UserAgent DO:", err);
    }
  }

  const executor = new DynamicWorkerExecutor({ loader: env.LOADER });
  const runtime = createCodemodeRuntime({
    ctx,
    executor,
    connectors: [
      toolSetConnector(ctx, {
        name: "mcp",
        tools: mcpTools,
        instructions:
          "Connected MCP/plugin tools. When the task is clear, use one codemode script: search with codemode.search(query), inspect the best path with codemode.describe(path) when needed, then call the selected mcp.* method and return the final value. Return objects directly or log JSON.stringify(value, null, 2); raw object logs appear as [object Object].",
      }),
    ],
  });
  const codemode = runtime.tool({
    connectorHints: {
      mcp: "Connected MCP/plugin tools. Use codemode.search(), codemode.describe(), then call mcp.<method>(args). Return objects directly or stringify diagnostic logs.",
    },
  });

  return { ...clientTools, codemode };
}
