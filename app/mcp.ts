import { z } from "zod";
import { initializeMcpApiHandler } from "../lib/mcp-api-handler";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

export const mcpHandler = initializeMcpApiHandler(
  (server) => {
    server.tool(
      "start-notification-stream",
      "Starts sending periodic notifications for testing resumability",
      {
        interval: z
          .number()
          .describe("Interval in milliseconds between notifications")
          .default(100),
        count: z
          .number()
          .describe("Number of notifications to send (0 for 100)")
          .default(10),
      },
      async (
        { interval, count },
        { sendNotification }
      ): Promise<CallToolResult> => {
        // In a stateless environment, we should not start long-running processes
        // Just return immediately with a message instead of actually running notifications
        return {
          content: [
            {
              type: "text",
              text: `In stateless mode, notifications are simulated. Would send ${
                count || "unlimited"
              } notifications every ${interval}ms if this were stateful.`,
            },
          ],
        };
      }
    );

    server.tool(
      "random-uuid",
      "Returns a random UUID",
      {},
      async (): Promise<CallToolResult> => {
        return {
          content: [
            {
              type: "text",
              text: crypto.randomUUID(),
            },
          ],
        };
      }
    );

    // Create a simple resource at a fixed URI
    server.resource(
      "greeting-resource",
      "https://example.com/greetings/default",
      { mimeType: "text/plain" },
      async (): Promise<ReadResourceResult> => {
        return {
          contents: [
            {
              uri: "https://example.com/greetings/default",
              text: "Hello, world!",
            },
          ],
        };
      }
    );
    // Add more tools, resources, and prompts here
    server.tool("echo", { message: z.string() }, async ({ message }) => ({
      content: [{ type: "text", text: `Tool echo: ${message}` }],
    }));
  },
  {
    capabilities: {
      tools: {
        echo: {
          description: "Echo a message",
        },
      },
    },
  }
);
