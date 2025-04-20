import { z } from "zod";
import { initializeMcpApiHandler } from "../lib/mcp-api-handler";
import { NextApiRequest, NextApiResponse } from "next";
import { allToolSets } from "../lib/tool-sets";

interface Tool {
  handler: (args: any) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
  description: string;
}

interface ToolSet {
  tools: {
    [key: string]: Tool;
  };
}

// Define different tool sets for different API keys
const toolSets: Record<string, ToolSet> = {
  "1": {
    ...allToolSets.browser,
  },
  "2": {
    ...allToolSets.ai,
    ...allToolSets.data,
    ...allToolSets.filesystem,
    ...allToolSets.network,
  },
};

export const mcpHandler = initializeMcpApiHandler((server, apiKey) => {
  const toolSet = toolSets[apiKey];

  // Register tools based on the API key
  Object.entries(toolSet.tools).forEach(([name, tool]) => {
    if (name.includes("echo")) {
      server.tool(name, { message: z.string() }, tool.handler);
    } else {
      server.tool(name, {}, tool.handler);
    }
  });
});
