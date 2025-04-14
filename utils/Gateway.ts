import { MCPClient } from "./Client";

export class Gateway {
  private mcpClients: MCPClient[] = [];
  constructor() {}

  async connectToServers(servers: string[]) {
    for (const server of servers) {
      const mcpClient = new MCPClient();
      await mcpClient.connect(server);
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
