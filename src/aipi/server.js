import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketServerTransport, WebSocketClientTransport } from '../utils/ws-transport.js';
import express from 'express';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import cors from 'cors';
import logger from '../utils/logger.js';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiPath } from '../utils/openapi-generator.js';

// Import all tools
import layer1Tools from './layer1.js';
import layer2Tools from './layer2.js';
import layer3Tools from './layer3.js';

const PORT = process.env.MCP_PORT || 5907;
const REQUEST_TIMEOUT = 600000; // 10 minutes

// Base OpenAPI spec
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'music-AIPI API',
    version: '1.0.0',
    description: 'music-AIPI is a conversational music interface powered by AI, Spotify, and Last.fm',
    license: {
      name: 'MIT'
    }
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Local development server'
    }
  ],
  paths: {}
};

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

  // Create MCP server instance for HTTP tool calls
  const httpToolServer = new McpServer({
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

  // Store registered tools and update OpenAPI spec
  const registeredTools = [];
  httpToolServer.tool = (name, description, parameters, handler) => {
    const tool = { name, description, parameters, handler };
    registeredTools.push(tool);

    // Add to OpenAPI spec
    openApiSpec.paths[`/tools/${name}`] = generateOpenApiPath(name, description, parameters);

    return tool;
  };

  // Register tools for HTTP endpoints
  logger.info('Registering Layer 1 tools for HTTP...');
  layer1Tools.register(httpToolServer, { client: reflectiveClient });
  logger.info('Registering Layer 2 tools for HTTP...');
  layer2Tools.register(httpToolServer, { client: reflectiveClient });
  logger.info('Registering Layer 3 tools for HTTP...');
  layer3Tools.register(httpToolServer, { client: reflectiveClient });

  // Serve OpenAPI documentation
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  
  // Serve raw OpenAPI spec
  app.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openApiSpec);
  });

  // Tool execution endpoint
  app.post('/tools/:toolName', async (req, res) => {
    const { toolName } = req.params;
    const args = req.body;

    try {
      logger.info(`HTTP tool call: ${toolName}`, { args });

      // Find the tool
      const tool = registeredTools.find(t => t.name === toolName);
      if (!tool) {
        logger.warn(`Tool ${toolName} not found`);
        return res.status(404).json({
          error: true,
          message: `Tool ${toolName} not found`
        });
      }

      // Execute the tool
      const result = await tool.handler(args);
      
      // Parse the content text as JSON if possible
      if (result.content?.[0]?.type === 'text') {
        try {
          const parsed = JSON.parse(result.content[0].text);
          return res.json(parsed);
        } catch (e) {
          // If not JSON, return the text as is
          return res.json(result.content[0]);
        }
      }

      return res.json(result);
    } catch (error) {
      logger.error(`Error executing tool ${toolName}:`, error);
      return res.status(400).json({
        error: true,
        message: error.message
      });
    }
  });

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