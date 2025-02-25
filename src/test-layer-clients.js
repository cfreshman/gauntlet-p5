/**
 * Test script for Layer 1 and Layer 2 clients
 * 
 * This script directly tests the Layer 1 and Layer 2 clients to see if they can call tools.
 */

require('dotenv').config();
const logger = require('./utils/logger');

// Layer endpoints
const layer1Endpoint = 'http://localhost:3001/mcp/events';
const layer2Endpoint = 'http://localhost:3002/mcp/events';

/**
 * Initialize a client for a specific layer
 * @param {string} layerName - The name of the layer ('layer1' or 'layer2')
 * @param {string} endpoint - The endpoint URL for the layer
 * @returns {Promise<Client>} - The initialized client
 */
async function initializeClient(layerName, endpoint) {
  try {
    logger.info(`Initializing ${layerName} client...`);
    
    // Dynamically import the required modules
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
    
    // Create client
    const client = new Client(
      {
        name: `test-client-to-${layerName}`,
        version: '1.0.0'
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {}
        }
      }
    );
    
    // Create transport
    const transport = new SSEClientTransport({ endpoint });
    
    // Connect to server
    await client.connect(transport);
    logger.info(`${layerName} client connected successfully`);
    
    return client;
  } catch (error) {
    logger.error(`Error initializing ${layerName} client:`, error.message);
    throw error;
  }
}

/**
 * Test a specific tool on a client
 * @param {Client} client - The client to use
 * @param {string} layerName - The name of the layer ('layer1' or 'layer2')
 * @param {string} toolName - The name of the tool to test
 * @param {object} args - The arguments for the tool
 * @returns {Promise<object>} - The result of the tool call
 */
async function testTool(client, layerName, toolName, args) {
  try {
    logger.info(`Testing ${layerName} tool: ${toolName} with args:`, args);
    
    // List available tools
    const tools = await client.listTools();
    logger.info(`${layerName} has ${tools.tools.length} tools available`);
    
    // Check if the tool exists
    const toolExists = tools.tools.some(tool => tool.name === toolName);
    if (!toolExists) {
      logger.error(`Tool ${toolName} not found in ${layerName}`);
      return null;
    }
    
    // Call the tool
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    
    logger.info(`${layerName} tool ${toolName} call successful`);
    return result;
  } catch (error) {
    logger.error(`Error testing ${layerName} tool ${toolName}:`, error.message);
    throw error;
  }
}

/**
 * Main function to run the tests
 */
async function main() {
  try {
    // Initialize Layer 1 client
    const layer1Client = await initializeClient('layer1', layer1Endpoint);
    
    // Test Layer 1 tool
    const layer1Result = await testTool(layer1Client, 'layer1', 'get-similar-artists', {
      artist: 'Radiohead',
      limit: 3
    });
    
    if (layer1Result) {
      logger.info('Layer 1 result:', JSON.stringify(layer1Result, null, 2));
    }
    
    // Initialize Layer 2 client
    const layer2Client = await initializeClient('layer2', layer2Endpoint);
    
    // Test Layer 2 tool
    const layer2Result = await testTool(layer2Client, 'layer2', 'discover-similar-artists', {
      artistName: 'Radiohead',
      limit: 3
    });
    
    if (layer2Result) {
      logger.info('Layer 2 result:', JSON.stringify(layer2Result, null, 2));
    }
    
    logger.info('All tests completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error in main function:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  logger.error('Unhandled error:', error.message);
  process.exit(1);
}); 