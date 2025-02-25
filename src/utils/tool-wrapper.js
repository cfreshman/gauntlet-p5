import logger from './logger.js';

/**
 * Wraps an MCP server's tool registration to add logging
 * @param {McpServer} server - The MCP server instance
 * @param {string} layerName - The name of the layer (e.g., 'Layer 1')
 */
export function wrapToolRegistration(server, layerName) {
  const originalTool = server.tool.bind(server);
  server.tool = (name, description, schema, handler) => {
    // Log when a tool is registered
    logger.info(`[${layerName}] Registering tool: ${name}`, {
      description,
      schema: JSON.stringify(schema),
      timestamp: new Date().toISOString()
    });

    return originalTool(name, description, schema, async (args) => {
      // Log when a tool is called
      logger.info(`[${layerName}] Tool called: ${name}`, {
        args: JSON.stringify(args),
        timestamp: new Date().toISOString()
      });

      try {
        const result = await handler(args);
        // Log tool completion with more details
        logger.info(`[${layerName}] Tool completed: ${name}`, {
          success: !result.isError,
          hasContent: !!result.content,
          contentLength: result.content?.length,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        // Log tool errors
        logger.error(`[${layerName}] Tool error: ${name}`, {
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    });
  };
} 