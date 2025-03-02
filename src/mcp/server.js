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

const PORT = process.env.MCP_PORT || 5907;
const REQUEST_TIMEOUT = 600000; // 10 minutes

async function startServer() {
  // Setup HTTP/WS server
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Add health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Create promise to wait for server to be ready
  const serverReady = new Promise((resolve, reject) => {
    const httpServer = app.listen(PORT, () => {
      logger.info(`music-aipi-server listening on port ${PORT}`);
      resolve(httpServer);
    });
    httpServer.on('error', reject);
  });

  // Wait for server to be ready
  const httpServer = await serverReady;

  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer });

  // Create reflective client instance (but don't connect yet)
  const reflectiveClient = new Client({
    name: 'music-aipi-reflective-client',
    version: '1.0.0'
  }, {
    capabilities: {
      prompts: {},
      resources: {},
      tools: {}
    },
    requestTimeout: REQUEST_TIMEOUT
  });

  // Handle external client connections
  wss.on('connection', async (ws) => {
    logger.info('New client connection received');
    
    // Create new transport for this connection
    const transport = new WebSocketServerTransport(ws);
    await transport.start();
    
    // Create new server instance for this connection
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

    // Register tools for this connection
    logger.info('Registering Layer 1 tools...');
    layer1Tools.register(server, { client: reflectiveClient });

    logger.info('Registering Layer 2 tools...');
    layer2Tools.register(server, { client: reflectiveClient });

    logger.info('Registering Layer 3 tools...');
    layer3Tools.register(server, { client: reflectiveClient });

    // Connect transport to server instance
    await server.connect(transport);
    logger.info('Client connected successfully');

    // Clean up when connection closes
    ws.on('close', () => {
      logger.info('Client disconnected, cleaning up');
      transport.close();
    });
  });

  // Now connect the reflective client after handler is set up
  const reflectiveWs = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);

    reflectiveWs.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });

    reflectiveWs.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const reflectiveTransport = new WebSocketClientTransport(reflectiveWs);
  await reflectiveTransport.start();
  await reflectiveClient.connect(reflectiveTransport);

  // Handle process termination
  process.on('SIGINT', () => {
    logger.info('Shutting down server...');
    reflectiveWs.close();
    reflectiveTransport.close();
    httpServer.close();
    process.exit(0);
  });

  return { httpServer, wss, reflectiveClient };
}

export { startServer }; 