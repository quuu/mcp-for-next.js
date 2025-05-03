import { openai } from "@ai-sdk/openai";
import { experimental_createMCPClient, streamText } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const clientOne = await experimental_createMCPClient({
    transport: {
      type: "sse",
      url: "http://localhost:3000/sse",
    },
  });

  const toolSetOne = await clientOne.tools();

  const result = streamText({
    model: openai("gpt-4o"),
    system: "You are a helpful assistant.",
    messages,
    toolChoice: "required",
    tools: toolSetOne,
  });

  //   await clientOne.close();
  return result.toDataStreamResponse();
}
