import { Gateway } from "@/utils/Gateway";

const origins = [
  "https://mcp-for-next-js.vercel.app",
  "https://mcp-for-next-js-beta.vercel.app",
];

const sse = [
  "https://api.mcpverse.dev/api/mcp/sse?server_id=d4042ad2-779d-494f-8c40-fa077eca9c5c",
];
async function main() {
  const gateway = new Gateway();

  await gateway.connectToServers(origins);

  await gateway.connectToServers(sse, false);
  const tools = await gateway.listTools();

  console.log("Tools from all servers:", tools);
}

main();
