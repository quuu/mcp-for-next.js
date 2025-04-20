import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const origin = process.argv[2] || "https://mcp-on-vercel.vercel.app";

async function main() {
  console.log(process.env.TODOIST_API_TOKEN);
  const headers = {
    Authorization: `Bearer sk_gQBbMtW1AUUjPSz87R2g2BohAAm0Hd8jjvOswhB8ScxeJY0f84lykZGwyR3ZaDIJWgE06WwpciSVE9E7`,
  };

  const transport = new SSEClientTransport(
    new URL(
      `https://api.mcpverse.dev/api/mcp/sse?server_id=d4042ad2-779d-494f-8c40-fa077eca9c5c`
    ),
    {
      eventSourceInit: {
        fetch: (url, init) => fetch(
          url, { ...init, headers: { ...init?.headers, ...headers } }
        )
      },
      requestInit: {
        headers: headers,
      },
    }
  );

  const client = new Client(
    {
      name: "example-client",
      version: "0.0.1",
    },
   
  );


  await client.connect(transport);

  console.log("Connected", client.getServerCapabilities());

  const result = await client.listTools();
  console.log(result);
}

main();
