/**
 * MCP Demo Script
 * 
 * This script demonstrates how to use the MCP servers
 * across the different layers of the (AI)PI system.
 */
// load punycode hook to intercept all punycode imports
require('../utils/punycode-hook');

require('dotenv').config({ path: __dirname + '/../.env' });
const { Layer1Server, Layer2Server, Layer3Server } = require('./index');
const logger = require('../utils/logger');

// Check if StdioServerTransport is available
let StdioServerTransport;
try {
  const stdioModule = require('@modelcontextprotocol/sdk/server/stdio.js');
  StdioServerTransport = stdioModule.StdioServerTransport;
  logger.info('StdioServerTransport loaded successfully');
} catch (error) {
  logger.error('StdioServerTransport not available:', error.message);
  process.exit(1);
}

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
  logger.info('Initializing Layer 2 MCP Server');
  
  // Define Layer 1 endpoint (would be used in a real distributed setup)
  const layer1Endpoint = 'http://localhost:3001/mcp/events';
  
  // Initialize Layer 2 server with Layer 1 endpoint
  const layer2Server = new Layer2Server({
    name: 'aipi-layer2-demo',
    version: '1.0.0',
    layer1Endpoint
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
  logger.info('Initializing Layer 3 MCP Server');
  
  // Define Layer 1 and Layer 2 endpoints (would be used in a real distributed setup)
  const layer1Endpoint = 'http://localhost:3001/mcp/events';
  const layer2Endpoint = 'http://localhost:3002/mcp/events';
  
  // Initialize Layer 3 server with Layer 2 and Layer 1 endpoints
  const layer3Server = new Layer3Server({
    name: 'aipi-layer3-demo',
    version: '1.0.0',
    layer2Endpoint,
    layer1Endpoint
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