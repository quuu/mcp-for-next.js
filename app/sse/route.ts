import { createServerResponseAdapter } from "@/lib/server-response-adapter";
import { mcpHandler } from "../mcp";

export const maxDuration = 60;

export async function GET(req: Request) {
  // Extract client ID from URL parameters
  const url = new URL(req.url);
  const clientId = url.searchParams.get('id');
  
  console.log(`SSE connection requested with client ID: ${clientId || 'undefined'}`);
  
  // Pass the original request to the MCP handler with the ID parameter
  return createServerResponseAdapter(req.signal, (res) => {
    mcpHandler(req, res, clientId ?? undefined);
  });
}
