import { createMcpHandler } from "@vercel/mcp-adapter";
import type { NextRequest } from "next/server";
import { z } from "zod";

const handler = async (
  req: NextRequest,
  { params }: { params: Promise<{ p: string; t: string }> }
) => {
  const { p, t } = await params;

  return createMcpHandler(
    (server) => {
      server.tool(
        "roll_dice",
        "Rolls an N-sided die",
        { sides: z.number().int().min(2) },
        async ({ sides }) => {
          const value = 1 + Math.floor(Math.random() * sides);
          return {
            content: [{ type: "text", text: `🎲 You rolled a ${value}!` }],
          };
        }
      );
    },
    {
      capabilities: {
        tools: {
          roll_dice: {
            description: "Roll a dice",
          },
        },
      },
    },
    {
      redisUrl: process.env.REDIS_URL,
      basePath: `/dynamic/${p}/`,
      verboseLogs: true,
      maxDuration: 60,
    }
  )(req);
};
export { handler as GET, handler as POST, handler as DELETE };
