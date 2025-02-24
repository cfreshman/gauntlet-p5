/**
 * MCP Demo Script
 * 
 * This script demonstrates how to use the MCP servers
 * across the different layers of the (AI)PI system.
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { Layer1Server, Layer2Server, Layer3Server } = require('./index');
const logger = require('../utils/logger');

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
  
  const layer1Server = new Layer1Server({
    name: 'aipi-layer1-demo',
    version: '1.0.0'
  });
  
  const transport = new StdioServerTransport();
  
  logger.info('Connecting Layer 1 MCP Server to stdio transport');
  await layer1Server.connect(transport);
  
  logger.info('Layer 1 MCP Server is running. Press Ctrl+C to exit.');
}

/**
 * Run the Layer 2 (Agentic) MCP server demo
 */
async function runLayer2Demo() {
  logger.info('Initializing Layer 1 and Layer 2 MCP Servers');
  
  // Initialize Layer 1 server (but don't connect it)
  const layer1Server = new Layer1Server({
    name: 'aipi-layer1-demo',
    version: '1.0.0'
  });
  
  // Initialize Layer 2 server with reference to Layer 1
  const layer2Server = new Layer2Server({
    name: 'aipi-layer2-demo',
    version: '1.0.0',
    layer1Server
  });
  
  const transport = new StdioServerTransport();
  
  logger.info('Connecting Layer 2 MCP Server to stdio transport');
  await layer2Server.connect(transport);
  
  logger.info('Layer 2 MCP Server is running. Press Ctrl+C to exit.');
}

/**
 * Run the Layer 3 (Expert) MCP server demo
 */
async function runLayer3Demo() {
  logger.info('Initializing Layer 1, Layer 2, and Layer 3 MCP Servers');
  
  // Initialize Layer 1 server (but don't connect it)
  const layer1Server = new Layer1Server({
    name: 'aipi-layer1-demo',
    version: '1.0.0'
  });
  
  // Initialize Layer 2 server with reference to Layer 1 (but don't connect it)
  const layer2Server = new Layer2Server({
    name: 'aipi-layer2-demo',
    version: '1.0.0',
    layer1Server
  });
  
  // Initialize Layer 3 server with reference to Layer 2
  const layer3Server = new Layer3Server({
    name: 'aipi-layer3-demo',
    version: '1.0.0',
    layer2Server
  });
  
  const transport = new StdioServerTransport();
  
  logger.info('Connecting Layer 3 MCP Server to stdio transport');
  await layer3Server.connect(transport);
  
  logger.info('Layer 3 MCP Server is running. Press Ctrl+C to exit.');
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error in main', { error: error.message });
    process.exit(1);
  });
}

module.exports = { main }; 