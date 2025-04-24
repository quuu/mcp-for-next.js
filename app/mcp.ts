import { z } from "zod";
import { initializeMcpApiHandler } from "../lib/mcp-api-handler";
import { registerTodoistTools } from "@/mcp-servers/todoist";
import { registerFetchTools } from "@/mcp-servers/fetch";
import { registerHackerNewsTools } from "@/mcp-servers/hacker-news";
import { registerClearThoughtTools } from "@/mcp-servers/clear-thought";
import { registerBrowserbaseTools } from "@/mcp-servers/browserbase";
import { registerShadcnTools } from "@/mcp-servers/shadcn";
export const mcpHandler = initializeMcpApiHandler(
  (server) => {
    registerTodoistTools(server);
    registerFetchTools(server);
    registerHackerNewsTools(server);
    registerClearThoughtTools(server);
    registerBrowserbaseTools(server);
    registerShadcnTools(server);

    // Add more tools, resources, and prompts here
    server.tool(
      "echo",
      "Returns the message you give it",
      { message: z.string() },
      async ({ message }) => ({
        content: [{ type: "text", text: `Tool echo: ${message}` }],
      })
    );
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
