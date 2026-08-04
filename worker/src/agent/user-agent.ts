import { Agent, callable } from "agents";

/**
 * UserAgent is the top-level Durable Object managing per-user state,
 * MCP plugin connections, user preferences, and sub-agent authorization gates.
 */
export class UserAgent extends Agent<Env> {
  /**
   * Initializes the Durable Object on startup and configures the OAuth success redirect.
   * Called on every DO wake — ensures `handleMcpOAuthCallback` can complete the code
   * exchange and redirect correctly even after a cold start.
   */
  override async onStart() {
    this.mcp.configureOAuthCallback({
      successRedirect: '/api/auth/callback',
    });
  }

  /**
   * Access gate callback invoked before a WebSocket connection is upgraded to a sub-agent.
   * Validates access permissions before frames flow directly to the child ChatAgent.
   *
   * @param request - Incoming HTTP Request object.
   * @param child - Object containing target sub-agent class name and instance ID.
   * @returns The original request to authorize, or a Response to reject.
   */
  override async onBeforeSubAgent(
    request: Request,
    child: { className: string; name: string }
  ): Promise<void | Response | Request> {
    console.log(`[UserAgent:${this.name}] Authorizing sub-agent: className=${child.className}, name=${child.name}`);
    return request;
  }

  /**
   * Lists all connected MCP servers on this agent.
   *
   * @returns Object describing current MCP servers and their connection states.
   */
  @callable()
  listPlugins() {
    return (this as any).getMcpServers();
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
      const result = await (this as any).addMcpServer(name, url);
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
      await (this as any).removeMcpServer(serverId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Returns MCP tool descriptors for all connected servers on this DO.
   * Called by `McpProxy` in child ChatAgent DOs via DO-to-DO RPC.
   *
   * @param timeoutMs - Connection wait timeout in milliseconds.
   * @param serverFilter - Optional array of server IDs to filter tools.
   * @returns Array of raw tool descriptor objects.
   */
  @callable()
  async listMcpToolDescriptors(timeoutMs = 10_000, serverFilter?: string[]): Promise<unknown[]> {
    const servers = (this as any).getMcpServers().servers;
    if (Object.keys(servers).length === 0) {
      return [];
    }
    await this.mcp.waitForConnections({ timeout: timeoutMs });
    const filter = serverFilter && serverFilter.length > 0 ? { serverId: serverFilter } : undefined;
    return (this.mcp as any).listTools(filter);
  }

  /**
   * Executes an MCP tool on a connected server.
   * Called by `McpProxy` in child ChatAgent DOs via DO-to-DO RPC.
   *
   * @param serverId - ID of the target MCP server.
   * @param name - Name of the tool function to call.
   * @param args - Object arguments passed to the tool.
   * @returns Tool execution result.
   */
  @callable()
  async callMcpTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return await (this.mcp as any).callTool({ arguments: args, name, serverId });
  }
}
