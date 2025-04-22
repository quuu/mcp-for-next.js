// filepath: /Users/qua/projects/mcp-for-next.js/app/mcp-stateless/route.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NextRequest, NextResponse } from "next/server";
import { registerTodoistTools } from "@/lib/todoist";
import { registerExaTools } from "@/lib/exa/registerTools";
import { z } from "zod";

// Configure response timeout (in seconds)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Initialize stateless MCP server
const server = new McpServer({
  name: "mcp-next-stateless-server",
  version: "0.1.0",
});

// Register tools from your existing implementations
registerTodoistTools(server);
registerExaTools(server);

// Add simple built-in tools (copied from your mcp.ts)
server.tool("echo2", { message: z.string() }, async ({ message }) => ({
  content: [{ type: "text", text: `Tool echo: ${message}` }],
}));

server.tool("fetch-bank-balances", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: "Tool fetch-bank-balances: 1000",
      },
    ],
  };
});

// Handle the JSON-RPC request directly
async function handleJsonRpcRequest(request: any) {
  console.log("Handling JSON-RPC request:", request);

  // Basic JSON-RPC request validation
  if (!request.jsonrpc || request.jsonrpc !== "2.0" || !request.method) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: "Invalid Request",
      },
      id: request.id || null,
    };
  }

  try {
    // Use the MCP protocol methods directly
    if (request.method === "tools/list") {
      // For tools/list, we need to return the registered tools
      // Since we don't have direct access to the list, we'll create a static response
      // based on the tools we've registered
      return {
        jsonrpc: "2.0",
        result: {
          tools: [
            {
              name: "todoist_create_task",
              description:
                "Create a new task in Todoist with optional description, due date, and priority",
              inputSchema: {
                type: "object",
                properties: {
                  content: {
                    type: "string",
                    description: "The content/title of the task",
                  },
                  description: {
                    type: "string",
                    description: "Detailed description of the task (optional)",
                  },
                  due_string: {
                    type: "string",
                    description:
                      "Natural language due date like 'tomorrow', 'next Monday', 'Jan 23' (optional)",
                  },
                  priority: {
                    type: "number",
                    description:
                      "Task priority from 1 (normal) to 4 (urgent) (optional)",
                    enum: [1, 2, 3, 4],
                  },
                },
                required: ["content"],
              },
            },
            {
              name: "todoist_get_tasks",
              description:
                "Get a list of tasks from Todoist with various filters",
              inputSchema: {
                type: "object",
                properties: {
                  project_id: {
                    type: "string",
                    description: "Filter tasks by project ID (optional)",
                  },
                  filter: {
                    type: "string",
                    description:
                      "Natural language filter like 'today', 'tomorrow', 'next week' (optional)",
                  },
                  priority: {
                    type: "number",
                    description: "Filter by priority level (1-4) (optional)",
                    enum: [1, 2, 3, 4],
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of tasks to return (optional)",
                    default: 10,
                  },
                },
              },
            },
            {
              name: "echo2",
              description: "Echo a message",
              inputSchema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "Message to echo",
                  },
                },
                required: ["message"],
              },
            },
            {
              name: "fetch-bank-balances",
              description: "Fetch bank balances",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
            // Exa tools would be listed here - adding a placeholder for web_search
            {
              name: "web_search",
              description: "Search the web using Exa AI",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search query",
                  },
                  numResults: {
                    type: "number",
                    description:
                      "Number of search results to return (default: 5)",
                  },
                },
                required: ["query"],
              },
            },
          ],
        },
        id: request.id,
      };
    } else if (request.method === "tools/call") {
      if (!request.params || !request.params.name) {
        return {
          jsonrpc: "2.0",
          error: {
            code: -32602,
            message: "Invalid params: missing tool name",
          },
          id: request.id,
        };
      }

      const { name, arguments: args } = request.params;

      // Manually route to the appropriate tool
      // This is a simplified version - in a real implementation, you would want to
      // map this to your registered tools dynamically
      let result;

      if (name === "echo2" && args && args.message) {
        result = {
          content: [{ type: "text", text: `Tool echo: ${args.message}` }],
        };
      } else if (name === "fetch-bank-balances") {
        result = {
          content: [{ type: "text", text: "Tool fetch-bank-balances: 1000" }],
        };
      } else if (name.startsWith("todoist_")) {
        // For Todoist tools, return a placeholder response
        // In a real implementation, this would call your actual tool functions
        result = {
          content: [
            {
              type: "text",
              text: `Todoist tool ${name} was called with args: ${JSON.stringify(
                args
              )}. This is a stateless implementation.`,
            },
          ],
        };
      } else if (name.startsWith("web_search") || name.includes("exa")) {
        // For Exa tools, return a placeholder response
        result = {
          content: [
            {
              type: "text",
              text: `Exa tool ${name} was called with args: ${JSON.stringify(
                args
              )}. This is a stateless implementation.`,
            },
          ],
        };
      } else {
        return {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: `Tool not found: ${name}`,
          },
          id: request.id,
        };
      }

      return {
        jsonrpc: "2.0",
        result,
        id: request.id,
      };
    } else {
      return {
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
        id: request.id,
      };
    }
  } catch (error) {
    console.error("Error handling JSON-RPC request:", error);
    return {
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: `Internal server error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      id: request.id || null,
    };
  }
}

// Handler for POST requests
export async function POST(request: NextRequest) {
  console.log("Received MCP stateless request");

  try {
    // Parse the JSON body
    const body = await request.json();
    // Handle as a JSON-RPC request
    const response = await handleJsonRpcRequest(body);

    // Return the response
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in MCP stateless endpoint:", error);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: "Parse error",
        },
        id: null,
      },
      { status: 400 }
    );
  }
}

// Handler for GET requests (method not allowed)
export async function GET(request: NextRequest) {
  console.log("Received GET MCP stateless request");
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed",
      },
      id: null,
    },
    { status: 405 }
  );
}

// Handler for DELETE requests (method not allowed)
export async function DELETE(request: NextRequest) {
  console.log("Received DELETE MCP stateless request");
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed",
      },
      id: null,
    },
    { status: 405 }
  );
}
