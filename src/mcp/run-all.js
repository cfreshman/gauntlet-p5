/**
 * MCP Run All Script
 * 
 * This script runs all three MCP layers simultaneously on different ports.
 */

import '../utils/punycode-hook.js';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { Layer1Server, Layer2Server, Layer3Server } from './index.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: __dirname + '/../.env' });

/**
 * Create and start an MCP server for a specific layer
 */
async function startMcpServer(layerName, LayerServerClass, port, config = {}) {
  // Create MCP server instance
  const mcpServer = new LayerServerClass({
    name: `aipi-${layerName}-server`,
    version: '1.0.0',
    port,
    ...config
  });

  // Start the server
  await mcpServer.start();
  logger.info(`${layerName} server started successfully`);

  return mcpServer;
}

/**
 * Main function to run MCP layers
 */
async function main() {
  try {
    // Check if a specific layer was requested
    const requestedLayer = process.argv[2];
    
    if (requestedLayer) {
      // Run only the requested layer
      switch (requestedLayer) {
        case 'layer1':
          await startMcpServer('layer1', Layer1Server, 3001);
          break;
        case 'layer2':
          await startMcpServer('layer2', Layer2Server, 3002);
          break;
        case 'layer3':
          await startMcpServer('layer3', Layer3Server, 3003);
          break;
        default:
          throw new Error(`Invalid layer: ${requestedLayer}`);
      }
      return;
    }

    // Otherwise run all layers
    logger.info('Starting all MCP layers');

    // Start Layer 1
    try {
      const layer1Server = await startMcpServer('layer1', Layer1Server, 3001);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error('Failed to start Layer 1 server:', {
        message: error.message || error.toString(),
        stack: error.stack,
        details: error
      });
      throw error;
    }

    // Start Layer 2
    try {
      const layer2Server = await startMcpServer('layer2', Layer2Server, 3002);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error('Failed to start Layer 2 server:', {
        message: error.message || error.toString(),
        stack: error.stack,
        details: error
      });
      throw error;
    }

    // Start Layer 3
    try {
      const layer3Server = await startMcpServer('layer3', Layer3Server, 3003);
    } catch (error) {
      logger.error('Failed to start Layer 3 server:', {
        message: error.message || error.toString(),
        stack: error.stack,
        details: error
      });
      throw error;
    }

    // Handle process termination
    process.on('SIGINT', () => {
      logger.info('Terminating all MCP servers');
      process.exit(0);
    });

    logger.info('All MCP layers are running');
    logger.info('Press Ctrl+C to exit');
  } catch (error) {
    logger.error('Error running MCP layers:', {
      message: error.message || error.toString(),
      stack: error.stack,
      details: error
    });
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    logger.error('Unhandled error in main:', {
      message: error.message || error.toString(),
      stack: error.stack,
      details: error
    });
    process.exit(1);
  });
}

export { main }; 