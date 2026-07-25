import type { ToolSet } from "ai";
import { z } from "zod";
import type { ChatAgent } from "./agent";


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
  #stubPromise?: Promise<DurableObjectStub<ChatAgent>>;

  constructor(
    private getParent: () => Promise<DurableObjectStub<ChatAgent>>
  ) {}

  private parent(): Promise<DurableObjectStub<ChatAgent>> {
    this.#stubPromise ??= this.getParent();
    return this.#stubPromise;
  }

  async getAITools(timeoutMs = 5_000, serverFilter?: string[]): Promise<ToolSet> {
    console.log(`[McpProxy] getAITools called, timeoutMs=${timeoutMs}`);

    const parent = await this.parent();
    console.log(`[McpProxy] got parent stub, calling listMcpToolDescriptors...`);

    const descriptors = await parent.listMcpToolDescriptors(timeoutMs, serverFilter) as unknown as McpToolDescriptor[];

    console.log(`[McpProxy] listMcpToolDescriptors returned ${descriptors.length} items`);
    if (descriptors.length === 0) {
      console.log(`[McpProxy] WARNING: 0 descriptors — tools won't be available`);
    } else {
      descriptors.forEach(d => console.log(`[McpProxy] descriptor: serverId=${d.serverId} name=${d.name} hasInputSchema=${!!d.inputSchema}`));
    }

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
              console.log(`[McpProxy] execute: serverId=${serverId} name=${name}`);
              const stub = await this.parent();
              console.log(`[McpProxy] calling callMcpTool(${serverId}, ${name})`);
              const result = await stub.callMcpTool(
                serverId,
                name,
                args as Record<string, unknown>
              );
              console.log(`[McpProxy] callMcpTool result isError=${(result as any).isError}`);
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
