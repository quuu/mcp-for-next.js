import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class MCPClient {
  private client: Client;
  constructor() {
    this.client = new Client(
      {
        name: "example-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      }
    );
  }

  async connect(origin: string) {
    const transport = new SSEClientTransport(new URL(`${origin}`));
    console.log("Connecting to", origin);
    await this.client.connect(transport);
  }

  async listTools() {
    return this.client.listTools();
  }

  getClient() {
    return this.client;
  }
}
