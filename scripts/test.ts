import { Gateway } from "@/utils/Gateway";

const origins = [
  "https://mcp-for-next-js.vercel.app",
  "https://mcp-for-next-js-beta.vercel.app",
];

async function main() {
  const gateway = new Gateway();

  await gateway.connectToServers(origins);

  const tools = await gateway.listTools();

  console.log("Tools from all servers:", tools);
}

main();
