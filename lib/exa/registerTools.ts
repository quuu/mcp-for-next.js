// filepath: /Users/qua/projects/mcp-for-next.js/lib/exa/registerTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// import { log } from "./utils/logger;

// Import all tool definitions
import { toolRegistry } from "./tools/index";

/**
 * Registers Exa tools with an MCP server based on provided configuration
 *
 * @param server - The MCP server instance
 * @param options - Configuration options for tool registration
 * @returns Array of registered tool IDs
 */
export function registerExaTools(
  server: McpServer,
  options: {
    specificTools?: Set<string> | null; // If provided, only register these specific tools
  } = {}
): string[] {
  const { specificTools } = options;
  const registeredTools: string[] = [];

  // Validate that EXA_API_KEY is available (except for when listing tools)
  const API_KEY = process.env.EXA_API_KEY;
  if (!API_KEY) {
    throw new Error("EXA_API_KEY environment variable is required");
  }

  // Register tools based on specifications
  Object.entries(toolRegistry).forEach(([toolId, tool]) => {
    // If specific tools were provided, only enable those.
    // Otherwise, enable all tools marked as enabled by default
    const shouldRegister =
      specificTools && specificTools.size > 0
        ? specificTools.has(toolId)
        : tool.enabled;

    if (shouldRegister) {
      server.tool(tool.name, tool.schema, async (args) => {
        try {
          return await tool.handler(args, {});
        } catch (error) {
          //   log(
          //     `Error in tool ${toolId}: ${
          //       error instanceof Error ? error.message : String(error)
          //     }`
          //   );
          return {
            content: [
              {
                type: "text",
                text: `Error in ${tool.name}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            isError: true,
          };
        }
      });
      registeredTools.push(toolId);
    }
  });

  //   log(
  //     `Registered ${registeredTools.length} Exa tools: ${registeredTools.join(
  //       ", "
  //     )}`
  //   );
  return registeredTools;
}

/**
 * Lists all available Exa tools
 *
 * @returns Array of tool information objects
 */
export function listExaTools(): Array<{
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}> {
  return Object.entries(toolRegistry).map(([id, tool]) => ({
    id,
    name: tool.name,
    description: tool.description,
    enabled: tool.enabled,
  }));
}
