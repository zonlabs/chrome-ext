import type { ToolSet } from "ai";
import { z } from "zod";
import type { UserAgent } from "./agent/user-agent";

export interface McpToolDescriptor {
  name: string;
  serverId: string;
  description?: string;
  title?: string;
  annotations?: { title?: string };
  inputSchema?: unknown;
  outputSchema?: unknown;
  [key: string]: unknown;
}

export class McpProxy {
  #stubPromise?: Promise<DurableObjectStub<UserAgent>>;

  constructor(
    private getParent: () => Promise<DurableObjectStub<UserAgent>>
  ) {}

  private parent(): Promise<DurableObjectStub<UserAgent>> {
    this.#stubPromise ??= this.getParent();
    return this.#stubPromise;
  }

  async getAITools(timeoutMs = 5_000, serverFilter?: string[]): Promise<ToolSet> {
    const parent = await this.parent();
    const descriptors = (await (parent as any).listMcpToolDescriptors(timeoutMs, serverFilter)) as unknown as McpToolDescriptor[];

    const entries: [string, ToolSet[string]][] = [];
    for (const descriptor of descriptors) {
      try {
        const toolKey = `tool_${descriptor.serverId.replace(/-/g, "")}_${descriptor.name}`;
        const { serverId, name, inputSchema } = descriptor;
        const title = descriptor.title ??
          (descriptor.annotations as { title?: string } | undefined)?.title;

        entries.push([
          toolKey,
          {
            description: descriptor.description,
            title,
            inputSchema: inputSchema
              ? z.fromJSONSchema(inputSchema as Parameters<typeof z.fromJSONSchema>[0])
              : z.fromJSONSchema({ type: "object" }),
            execute: async (args) => {
              const stub = await this.parent();
              const result = await (stub as any).callMcpTool(
                serverId,
                name,
                args as Record<string, unknown>
              );
              if ((result as any).isError) {
                const content = (result as any).content as Array<{ type: string; text?: string }> | undefined;
                const firstText = content?.[0];
                const message = firstText?.type === "text" && firstText.text
                  ? firstText.text
                  : "Tool call failed";
                throw new Error(message);
              }
              return result;
            }
          }
        ]);
      } catch (err) {
        console.warn(`[McpProxy] Skipping tool "${descriptor.name}" from "${descriptor.serverId}": ${err}`);
      }
    }

    return Object.fromEntries(entries);
  }
}
