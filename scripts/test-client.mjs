import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const origins = [
  "https://mcp-for-next-js.vercel.app",
  "https://mcp-for-next-js-beta.vercel.app",
];

async function main() {
  const client = new Client(
    {
      name: "example-client",
      version: "1.0.0",
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    }
  );

  async function connectToServer(origin) {
    const transport = new SSEClientTransport(new URL(`${origin}/sse`));
    console.log("Connecting to", origin);
    await client.connect(transport);
  }

  // connectToServer("https://mcp-for-next-js-beta.vercel.app/");
  await Promise.all(
    origins.map(async (origin) => {
      await connectToServer(origin);
    })
  );

  const result = await client.listTools();
  console.log(result);
  client.close();
}

main();
