import { z } from 'zod';

function register(server, { client }) {
  // Dummy tool for now
  server.tool(
    "dummy",
    "Dummy tool to ensure server works",
    {
      input: z.string().optional()
    },
    async ({ input }) => {
      return {
        content: [{ type: "text", text: "ok" }]
      };
    }
  );
}

export default { register }; 