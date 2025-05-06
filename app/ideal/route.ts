import createMcpHandler from "@/pkg/createMcpHandler";

const handler = createMcpHandler((server) => {
  server.tool(
    "add_number",
    "Adds two numbers together",
    {
      a: z.number(),
      b: z.number(),
    },
    async ({ a, b }) => ({
      content: [{ type: "text", text: `Tool add_number: ${a + b}` }],
    })
  );
});

export { handler as GET };
export { handler as POST };
export { handler as DELETE };
