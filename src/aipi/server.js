import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import express from 'express';
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
      url: process.env.NODE_ENV === 'production' ? 'https://music-aipi.com' : `http://localhost:${PORT}`,
      description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Local development server'
    }
  ],
  paths: {}
};

// Store active connections
const connections = new Map();

async function startServer() {
  const app = express();
  app.use(cors());

  // Create reflective client instance but don't connect yet
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

  // Add health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  let httpServer;
  await new Promise((resolve, reject) => {
    httpServer = app.listen(PORT, () => {
      logger.info(`MCP server listening on port ${PORT}`);
      resolve();
    });
  });

  const reflectiveTransport = new SSEClientTransport(new URL(`http://localhost:${PORT}/sse`));

  // Handle SSE connections
  app.get('/sse', async (req, res) => {
    logger.info('New SSE connection received');
    
    // Create unique messages endpoint for this connection
    const connectionId = Math.random().toString(36).slice(2);
    const messagesPath = `/messages/${connectionId}`;
    
    // Create new server instance for this connection
    logger.info('Creating MCP instance for connection...');
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

    layer1Tools.register(server, { client: reflectiveClient });
    layer2Tools.register(server, { client: reflectiveClient });
    layer3Tools.register(server, { client: reflectiveClient });

    // Create new transport for this connection
    const transport = new SSEServerTransport(messagesPath, res);

    // Store connection info
    connections.set(connectionId, { server, transport });

    // Connect transport to server instance
    await server.connect(transport);
    logger.info('Client connected successfully');

    // Handle cleanup on close
    transport.onclose = () => {
      logger.info(`Client ${connectionId} disconnected, cleaning up`);
      connections.delete(connectionId);
    };
  });

  // Handle client messages
  app.post('/messages/:id', (req, res) => {
    logger.info('Received message from client');
    const connectionId = req.params.id;
    const connection = connections.get(connectionId);
    
    if (!connection) {
      return res.status(400).json({ error: 'No active SSE connection found' });
    }

    try {
      connection.transport.handlePostMessage(req, res);
    } catch (error) {
      logger.error('Error handling POST message:', error);
      return res.status(500).json({ error: 'Failed to handle POST message' });
    }
  });

  // Tool execution endpoint - needs JSON
  app.post('/tools/:toolName', express.json(), async (req, res) => {
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

  // Now that server is set up, connect the reflective client
  await reflectiveClient.connect(reflectiveTransport);
  logger.info('Reflective client connected successfully');

  // Handle process termination
  process.on('SIGINT', () => {
    logger.info('Shutting down server...');
    reflectiveTransport.close();
    httpServer.close();
    process.exit(0);
  });

  return { httpServer, server: httpToolServer, reflectiveClient };
}

export { startServer }; 