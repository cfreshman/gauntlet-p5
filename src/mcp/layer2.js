import AipiLayerServer from './AipiLayerServer.js';
import { z } from 'zod';

/**
 * Layer 2 Server
 * 
 * This server provides agentic tools that combine LLM capabilities with Layer 1 primitives.
 * Currently empty until we design better tools.
 */
class Layer2Server extends AipiLayerServer {
  constructor() {
    super({
      name: 'aipi-layer2-server',
      port: 3002,
      wsPort: 3012,
      useOpenAI: true,
      tools: {
        dummy: (server) => {
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
      },
      layerClients: {
        layer1: {
          port: 3001,
          wsPort: 3011
        }
      }
    });
  }
}

export default new Layer2Server(); 