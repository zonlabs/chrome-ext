import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";

/**
 * Base Durable Object class managing Model Context Protocol (MCP) server lifecycle,
 * OAuth callback configurations, plugin subscriptions, and cross-DO RPC invocations.
 *
 * @template Env - Worker environment bindings constraint.
 */
export class McpAgent<Env extends Cloudflare.Env = Cloudflare.Env> extends AIChatAgent<Env> {
  /**
   * Initializes the Durable Object on startup and configures OAuth handlers for plugin sessions.
   */
  async onStart() {
    if (this.name.startsWith('plugins-user')) {
      this.mcp.configureOAuthCallback({
        successRedirect: '/api/auth/callback',
      });
    }
  }

  /**
   * Lists all connected MCP servers on this agent.
   *
   * @returns Object describing current MCP servers and their connection states.
   */
  @callable()
  listPlugins() {
    return this.getMcpServers();
  }

  /**
   * Adds a new MCP server connection.
   *
   * @param name - User-defined display name for the plugin.
   * @param url - SSE/HTTP endpoint of the MCP server.
   * @returns Result status containing connection outcome or OAuth authentication URL.
   */
  @callable()
  async addPlugin(name: string, url: string): Promise<{
    success: boolean;
    requiresAuth: boolean;
    authUrl?: string;
    serverId?: string;
    error?: string;
  }> {
    try {
      const result = await this.addMcpServer(name, url);
      if (result.state === 'authenticating') {
        return { success: true, requiresAuth: true, authUrl: result.authUrl, serverId: result.id };
      }
      return { success: true, requiresAuth: false, serverId: result.id };
    } catch (err) {
      return { success: false, requiresAuth: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Disconnects and removes an existing MCP server.
   *
   * @param serverId - Unique ID of the MCP server to remove.
   * @returns Operation success flag and optional error message.
   */
  @callable()
  async removePlugin(serverId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.removeMcpServer(serverId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Returns MCP tool descriptors for all connected servers on this DO.
   * Called by `McpProxy` in child chat DOs via DO-to-DO RPC.
   *
   * @param timeoutMs - Connection wait timeout in milliseconds.
   * @param serverFilter - Optional array of server IDs to filter tools.
   * @returns Array of raw tool descriptor objects.
   */
  async listMcpToolDescriptors(timeoutMs = 10_000, serverFilter?: string[]): Promise<unknown[]> {
    console.log(`[listMcpToolDescriptors] name=${this.name}, timeout=${timeoutMs}ms`);

    try {
      await (this.mcp as any).restoreConnectionsFromStorage(this.name);
    } catch (err) {
      console.warn(`[listMcpToolDescriptors] restoreConnectionsFromStorage error:`, err);
    }

    const servers = this.getMcpServers();
    const serverStates = Object.entries(servers.servers).map(([id, s]) => `${id}=${(s as any).state}`).join(', ');
    console.log(`[listMcpToolDescriptors] servers: ${serverStates}`);

    await this.mcp.waitForConnections({ timeout: timeoutMs });

    const filter = serverFilter && serverFilter.length > 0 ? { serverId: serverFilter } : undefined;
    const allTools = this.mcp.listTools(filter);
    console.log(`[listMcpToolDescriptors] returning ${allTools.length} tools${filter ? ` (filtered to ${serverFilter!.length} servers)` : ''}`);
    return allTools;
  }

  /**
   * Executes an MCP tool on a connected server.
   * Called by `McpProxy` in child chat DOs via DO-to-DO RPC.
   *
   * @param serverId - ID of the target MCP server.
   * @param name - Name of the tool function to call.
   * @param args - Object arguments passed to the tool.
   * @returns Tool execution result.
   */
  async callMcpTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return await this.mcp.callTool({ arguments: args, name, serverId });
  }
}
