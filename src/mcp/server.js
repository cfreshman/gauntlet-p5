import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketServerTransport, WebSocketClientTransport } from '../utils/ws-transport.js';
import express from 'express';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import cors from 'cors';
import logger from '../utils/logger.js';

// Import all tools
import layer1Tools from './layer1.js';
import layer2Tools from './layer2.js';
import layer3Tools from './layer3.js';

const PORT = process.env.MCP_PORT || 3100;
const REQUEST_TIMEOUT = 600000; // 10 minutes

async function startServer() {
  // Create MCP server
  const server = new McpServer({
    name: 'music-aipi-server',
    version: '1.0.0'
  }, {
    capabilities: {
      prompts: {},
      resources: {},
      tools: {}
    },
    requestTimeout: REQUEST_TIMEOUT
  });

  // Setup HTTP/WS server
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Add health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Register all tools at startup
  logger.info('Registering Layer 1 tools...');
  layer1Tools.register(server);

  logger.info('Registering Layer 2 tools...');
  layer2Tools.register(server, { client: null });

  logger.info('Registering Layer 3 tools...');
  layer3Tools.register(server, { client: null });

  // Start HTTP server
  const httpServer = app.listen(PORT, () => {
    logger.info(`music-aipi-server listening on port ${PORT}`);
  });

  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer });

  // Handle external client connections
  wss.on('connection', async (ws) => {
    logger.info('New client connection received');
    
    // Create new transport for this connection
    const transport = new WebSocketServerTransport(ws);
    await transport.start();
    
    // Each connection gets its own server instance to maintain separate transports
    const clientServer = new McpServer({
      name: 'music-aipi-server',
      version: '1.0.0'
    }, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {}
      },
      requestTimeout: REQUEST_TIMEOUT
    });

    // Register tools for this client
    logger.info('Registering Layer 1 tools...');
    layer1Tools.register(clientServer);

    logger.info('Registering Layer 2 tools...');
    layer2Tools.register(clientServer, { client: null });

    logger.info('Registering Layer 3 tools...');
    layer3Tools.register(clientServer, { client: null });

    // Connect transport to client's server instance
    clientServer.connect(transport);

    logger.info('Client connected successfully');

    // Clean up when connection closes
    ws.on('close', () => {
      logger.info('Client disconnected, cleaning up');
      transport.close();
    });
  });

  // Handle process termination
  process.on('SIGINT', () => {
    logger.info('Shutting down server...');
    httpServer.close();
    process.exit(0);
  });

  return { server, httpServer, wss };
}

export { startServer }; 