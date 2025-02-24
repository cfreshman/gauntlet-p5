/**
 * MCP Run All Script
 * 
 * This script runs all three MCP layers simultaneously on different ports.
 * It allows for testing the complete layered architecture in one command.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { spawn } = require('child_process');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const logger = require('../utils/logger');
const { Layer1Server, Layer2Server, Layer3Server } = require('./index');

// Check if express is available
let express, cors, SSEServerTransport;
try {
  express = require('express');
  cors = require('cors');
  SSEServerTransport = require('@modelcontextprotocol/sdk/server/sse.js').SSEServerTransport;
} catch (error) {
  logger.warn('Express, CORS, or SSEServerTransport not available. Will only run stdio servers.', { error: error.message });
}

// Port configuration
const ports = {
  layer1: 3001,
  layer2: 3002,
  layer3: 3003
};

/**
 * Create and start an Express server for a specific MCP layer
 * @param {string} layerName - The name of the layer (layer1, layer2, layer3)
 * @param {McpServer} mcpServer - The MCP server instance
 * @param {number} port - The port to run the server on
 */
function startExpressServer(layerName, mcpServer, port) {
  if (!express || !cors || !SSEServerTransport) {
    logger.warn(`Cannot start ${layerName} Express server: required dependencies not available`);
    return;
  }

  try {
    const app = express();
    
    // Configure middleware
    app.use(cors());
    app.use(express.json());
    
    // Set up SSE endpoint
    app.get('/mcp/events', async (req, res) => {
      try {
        logger.info(`${layerName}: New SSE connection established`);
        const transport = new SSEServerTransport('/mcp/messages', res);
        await mcpServer.connect(transport);
      } catch (error) {
        logger.error(`${layerName}: Error in SSE connection:`, error);
        res.status(500).end();
      }
    });
    
    // Set up message endpoint
    app.post('/mcp/messages', express.json(), async (req, res) => {
      try {
        // Note: In a production environment, you would need to route messages
        // to the correct transport instance. This is a simplified implementation.
        res.status(200).json({ status: 'ok' });
      } catch (error) {
        logger.error(`${layerName}: Error handling message:`, error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        layer: layerName,
        timestamp: new Date().toISOString() 
      });
    });
    
    // Start the server
    app.listen(port, () => {
      logger.info(`${layerName} MCP Server running on http://localhost:${port}`);
      logger.info(`${layerName} MCP Events: http://localhost:${port}/mcp/events`);
      logger.info(`${layerName} MCP Messages: http://localhost:${port}/mcp/messages`);
    });
  } catch (error) {
    logger.error(`Error starting ${layerName} Express server:`, error);
  }
}

/**
 * Main function to run all MCP layers
 */
async function main() {
  try {
    logger.info('Starting all MCP layers');
    
    // Initialize Layer 1 server
    logger.info('Initializing Layer 1 MCP Server');
    const layer1Server = new Layer1Server({
      name: 'aipi-layer1-server',
      version: '1.0.0'
    });
    
    // Initialize Layer 2 server with reference to Layer 1
    logger.info('Initializing Layer 2 MCP Server');
    const layer2Server = new Layer2Server({
      name: 'aipi-layer2-server',
      version: '1.0.0',
      layer1Server
    });
    
    // Initialize Layer 3 server with reference to Layer 2
    logger.info('Initializing Layer 3 MCP Server');
    const layer3Server = new Layer3Server({
      name: 'aipi-layer3-server',
      version: '1.0.0',
      layer2Server
    });
    
    // Start Express servers for each layer if dependencies are available
    if (express && cors && SSEServerTransport) {
      logger.info('Starting Express servers for MCP layers');
      startExpressServer('Layer 1', layer1Server.getServer(), ports.layer1);
      startExpressServer('Layer 2', layer2Server.getServer(), ports.layer2);
      startExpressServer('Layer 3', layer3Server.getServer(), ports.layer3);
    } else {
      logger.info('Skipping Express servers due to missing dependencies');
    }
    
    // Start stdio versions in separate processes
    logger.info('Starting stdio versions of MCP servers');
    
    const processes = [];
    
    try {
      const layer1Process = spawn('node', ['src/mcp/demo.js', '1'], {
        stdio: 'inherit'
      });
      processes.push(layer1Process);
      
      const layer2Process = spawn('node', ['src/mcp/demo.js', '2'], {
        stdio: 'inherit'
      });
      processes.push(layer2Process);
      
      const layer3Process = spawn('node', ['src/mcp/demo.js', '3'], {
        stdio: 'inherit'
      });
      processes.push(layer3Process);
    } catch (error) {
      logger.error('Error starting stdio servers:', error);
    }
    
    // Handle process termination
    process.on('SIGINT', () => {
      logger.info('Terminating all MCP servers');
      processes.forEach(proc => {
        try {
          if (proc && !proc.killed) {
            proc.kill();
          }
        } catch (error) {
          logger.error('Error killing process:', error);
        }
      });
      process.exit(0);
    });
    
    logger.info('All MCP layers are running');
    logger.info('Press Ctrl+C to exit');
  } catch (error) {
    logger.error('Error running MCP layers', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error in main', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = { main }; 