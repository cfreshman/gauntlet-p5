/**
 * MCP Demo Script
 * 
 * This script demonstrates how to use the MCP servers
 * across the different layers of the (AI)PI system.
 */

import '../utils/punycode-hook.js';
import { config } from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { AipiLayerServer } from './index.js';
import logger from '../utils/logger.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: __dirname + '/../.env' });

/**
 * Main function to run the demo
 */
async function main() {
  try {
    // Determine which layer to run based on command line argument
    const layer = process.argv[2] || '1';
    
    logger.info(`Starting MCP demo for Layer ${layer}`);
    
    switch (layer) {
      case '1':
        await runLayer1Demo();
        break;
      case '2':
        await runLayer2Demo();
        break;
      case '3':
        await runLayer3Demo();
        break;
      default:
        logger.error(`Invalid layer: ${layer}. Please specify 1, 2, or 3.`);
        process.exit(1);
    }
  } catch (error) {
    logger.error('Error running MCP demo', { error: error.message });
    process.exit(1);
  }
}

/**
 * Run the Layer 1 (Primitives) MCP server demo
 */
async function runLayer1Demo() {
  logger.info('Initializing Layer 1 MCP Server');
  
  const server = new AipiLayerServer({
    name: 'aipi-layer1-demo',
    port: 3001,
    wsPort: 3011,
    tools: {}
  });
  
  const transport = new StdioServerTransport();
  
  logger.info('Connecting Layer 1 MCP Server to stdio transport');
  await server.getServer().connect(transport);
  
  logger.info('Layer 1 MCP Server is running. Press Ctrl+C to exit.');
}

/**
 * Run the Layer 2 (Agentic) MCP server demo
 */
async function runLayer2Demo() {
  logger.info('Initializing Layer 2 MCP Server');
  
  const server = new AipiLayerServer({
    name: 'aipi-layer2-demo',
    port: 3002,
    wsPort: 3012,
    useOpenAI: true,
    tools: {},
    layerClients: {
      layer1: {
        port: 3001,
        wsPort: 3011
      }
    }
  });
  
  const transport = new StdioServerTransport();
  
  logger.info('Connecting Layer 2 MCP Server to stdio transport');
  await server.getServer().connect(transport);
  
  logger.info('Layer 2 MCP Server is running. Press Ctrl+C to exit.');
}

/**
 * Run the Layer 3 (Expert) MCP server demo
 */
async function runLayer3Demo() {
  logger.info('Initializing Layer 3 MCP Server');
  
  const server = new AipiLayerServer({
    name: 'aipi-layer3-demo',
    port: 3003,
    wsPort: 3013,
    useOpenAI: true,
    tools: {},
    layerClients: {
      layer2: {
        port: 3002,
        wsPort: 3012
      },
      layer1: {
        port: 3001,
        wsPort: 3011
      }
    }
  });
  
  const transport = new StdioServerTransport();
  
  logger.info('Connecting Layer 3 MCP Server to stdio transport');
  await server.getServer().connect(transport);
  
  logger.info('Layer 3 MCP Server is running. Press Ctrl+C to exit.');
}

// Run the main function if this is the main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    logger.error('Unhandled error in main', { error: error.message });
    process.exit(1);
  });
}

export { main }; 