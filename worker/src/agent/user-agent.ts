import { Agent, callable } from "agents";

/**
 * UserAgent is the top-level Durable Object managing per-user state,
 * MCP plugin connections, user preferences, and sub-agent authorization gates.
 */
export class UserAgent extends Agent<Env> {
  override async onStart() {
    this.mcp.configureOAuthCallback({
      successRedirect: '/api/auth/callback',
    });
  }

  /** User ID accessed from framework props or instance name (user-<userId>). */
  get userId(): string {
    return (this as any).props?.userId || (this.name.startsWith('user-') ? this.name.slice(5) : this.name);
  }

  @callable()
  async listMcpToolDescriptors(timeoutMs?: number, serverFilter?: string[]) {
    return (this.mcp as any).listToolDescriptors(timeoutMs, serverFilter);
  }

  @callable()
  async callMcpTool(serverId: string, name: string, args: Record<string, unknown>) {
    return (this.mcp as any).callTool(serverId, { name, arguments: args });
  }

  /**
   * Access gate callback invoked before a WebSocket connection is upgraded to a sub-agent.
   */
  override async onBeforeSubAgent(
    request: Request,
    child: { className: string; name: string }
  ): Promise<void | Response | Request> {
    console.log(`[UserAgent:${this.name}] Forwarding to sub-agent: className=${child.className}, name=${child.name}`);
    return request;
  }
}
