import { z } from "zod";
import { initializeMcpApiHandler } from "../lib/mcp-api-handler";

export const mcpHandler = initializeMcpApiHandler(
  (server) => {
    // Add more tools, resources, and prompts here
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
  },
  {
    capabilities: {
      tools: {
        echo2: {
          description: "Echo a message",
        },
        "fetch-bank-balances": {
          description: "Fetch bank balances",
        },
      },
    },
  }
);
