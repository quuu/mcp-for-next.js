import { experimental_createMCPClient, generateText } from "ai";
import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";

export async function GET() {
  let client;

  let result = {};
  try {
    // Alternatively, you can connect to a Server-Sent Events (SSE) MCP server:
    client = await experimental_createMCPClient({
      transport: {
        type: "sse",
        url: "http://localhost:3000/sse?id=1234",
      },
    });

    const toolSetOne = await client.tools();
    const tools = {
      ...toolSetOne,
    };

    // console.log(tools);
    const response = await generateText({
      model: openai("gpt-4o"),
      tools,
      toolChoice: "required",
      messages: [
        {
          role: "user",
          content: "What are things i need to do today?",
        },
      ],
    });
    result = response;
  } catch (error) {
    console.error(error);
  } finally {
    if (client) await client.close();
  }

  return NextResponse.json(result);
}
