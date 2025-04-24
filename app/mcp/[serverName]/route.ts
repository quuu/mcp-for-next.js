import { createServerResponseAdapter } from "@/lib/server-response-adapter";
import { mcpHandler } from "@/app/mcp";

export const maxDuration = 60;

const handler = (
  req: Request,
  { params }: { params: { serverName: string } }
) => {
  return createServerResponseAdapter(req.signal, (res) => {
    mcpHandler(req, res, params.serverName);
  });
};

export { handler as GET };
export { handler as POST };
export { handler as DELETE };
