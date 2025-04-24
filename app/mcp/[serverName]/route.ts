import { createServerResponseAdapter } from "@/lib/server-response-adapter";
import { mcpHandler } from "@/app/mcp";

export const maxDuration = 60;

const handler = async (
  req: Request,
  { params }: { params: Promise<{ serverName: string }> }
) => {
  const { serverName } = await params;
  return createServerResponseAdapter(req.signal, (res) => {
    mcpHandler(req, res, serverName);
  });
};

export { handler as GET };
export { handler as POST };
export { handler as DELETE };
