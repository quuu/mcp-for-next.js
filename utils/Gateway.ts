import { MCPClient } from "./Client";

export class Gateway {
  private mcpClients: MCPClient[] = [];
  constructor() {}

  async connectToServers(servers: string[], appendSse = true) {
    for (const server of servers) {
      const mcpClient = new MCPClient();
      await mcpClient.connect(`${server}${appendSse ? "/sse" : ""}`);
      this.mcpClients.push(mcpClient);
    }
  }

  async listTools() {
    const tools = [];
    for (const mcpClient of this.mcpClients) {
      const clientTools = await mcpClient.listTools();
      tools.push(...clientTools.tools);
    }
    return tools;
  }
}
