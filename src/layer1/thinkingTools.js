/**
 * Thinking Tools for Layer 1 (Primitives)
 * 
 * Basic tools for thought echoing and context building.
 */

import { z } from 'zod';
import logger from '../utils/logger.js';

/**
 * Register thinking tools with an MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerThinkingTools(server) {
  logger.info('Registering thinking tools for Layer 1');

  // Echo tool for building context
  server.tool(
    "echo",
    "Echo text back to think over multiple turns. It's like a <thinking> tag - send your best thoughts and plans and whatever else you'd like to remember here",
    {
      text: z.string().describe("The text to echo back")
    },
    async ({ text }) => {
      try {
        logger.debug('Echoing text', { textLength: text.length });
        
        return {
          content: [
            {
              type: "text",
              text
            }
          ]
        };
      } catch (error) {
        logger.error('Error in echo', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  logger.info('Thinking tools registered successfully');
}

export { registerThinkingTools }; 