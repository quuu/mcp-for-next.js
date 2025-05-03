import { z } from "zod";
import { initializeMcpApiHandler } from "../lib/mcp-api-handler";

export const mcpHandler = initializeMcpApiHandler(
  (server) => {
    server.tool(
      "random_number",
      { min: z.number().optional(), max: z.number().optional() },
      async ({ min, max }) => {
        console.log("Invoking");
        const randomNumber =
          Math.floor(Math.random() * (max ?? 100)) + (min ?? 0);
        return {
          content: [{ type: "text", text: `Random number: ${randomNumber}` }],
        };
      }
    );
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
        echo: {
          description: "Echo a message",
        },
      },
    },
  }
);
