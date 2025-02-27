import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { WebSocketServerTransport, WebSocketClientTransport } from '../utils/ws-transport.js';
import logger from '../utils/logger.js';
import OpenAI from 'openai';

// Constants
const REQUEST_TIMEOUT = 600000; // 10 minutes timeout

class AipiLayerServer {
  /**
   * Create a new AIPI Layer Server
   * @param {Object} options - Server configuration options
   * @param {string} options.name - Server name (e.g. 'aipi-layer1-server')
   * @param {number} options.port - HTTP port to listen on
   * @param {number} options.wsPort - WebSocket port to listen on
   * @param {Object} options.tools - Map of tool registration functions
   * @param {Object} options.layerClients - Map of layer names to connection configs
   */
  constructor(options) {
    this.name = options.name;
    this.port = options.port;
    this.wsPort = options.wsPort;
    this.tools = options.tools || {};
    this.layerClients = options.layerClients || {};
    this.useOpenAI = options.useOpenAI || false;

    // Create MCP server
    this.server = new McpServer({
      name: this.name,
      version: '1.0.0'
    }, {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {}
      },
      requestTimeout: REQUEST_TIMEOUT
    });

    // Create express app
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Create WebSocket server
    this.wss = null;
    
    // Track current transport
    this.transport = null;

    // Initialize layer clients
    this.clients = {};
    
    // Set up endpoints
    this.setupEndpoints();
  }

  /**
   * Get OpenAI instance, initializing it if needed
   */
  async getOpenAI() {
    if (!this.useOpenAI) return null;
    
    if (!this.openai) {
      const OpenAI = (await import('openai')).default;
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    
    return this.openai;
  }

  /**
   * Connect to a layer client with retries
   * @param {string} layerName - Name of the layer to connect to
   * @param {Object} config - Connection configuration
   */
  async connectToLayer(layerName, config) {
    const maxRetries = 5;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`${this.name}: Checking ${layerName} health (attempt ${attempt}/${maxRetries})...`);
        const healthResponse = await fetch(`http://localhost:${config.port}/health`);
        const health = await healthResponse.json();

        if (health.status === 'ok') {
          logger.info(`${this.name}: ${layerName} is ready, connecting...`);
          
          // Create client with matching timeout
          const client = new Client(
            {
              name: `${this.name}-to-${layerName}-client`,
              version: '1.0.0'
            },
            {
              capabilities: {
                prompts: {},
                resources: {},
                tools: {}
              },
              requestTimeout: REQUEST_TIMEOUT // Add timeout to match server
            }
          );

          // Create WebSocket connection
          const ws = new WebSocket(`ws://localhost:${config.wsPort}`);
          
          // Wait for connection
          await new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
          });

          // Create transport and connect
          const transport = new WebSocketClientTransport(ws);
          await client.connect(transport);
          
          this.clients[layerName] = client;
          logger.info(`${this.name}: Connected to ${layerName}`);
          return true;
        }
      } catch (error) {
        logger.error(`${this.name}: ${layerName} not ready (${error.message}), retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    throw new Error(`Failed to connect to ${layerName} after max retries`);
  }

  /**
   * Set up HTTP and WebSocket endpoints
   */
  setupEndpoints() {
    // Create WebSocket server
    this.wss = new WebSocketServer({ port: this.wsPort });

    this.wss.on('connection', (ws) => {
      logger.info(`${this.name}: WebSocket connection received`);

      // Create transport and connect
      logger.info(`${this.name}: Creating WebSocket transport`);
      this.transport = new WebSocketServerTransport(ws);
      
      logger.info(`${this.name}: Connecting transport to server`);
      this.server.connect(this.transport);

      // Handle client disconnect
      ws.on('close', () => {
        logger.info(`${this.name}: Client disconnected`);
        this.transport = null;
      });

      logger.info(`${this.name}: WebSocket connection established`);
    });

    // Add health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok'
      });
    });
  }

  /**
   * Start the server
   */
  async start() {
    // Connect to layer clients first
    for (const [layerName, config] of Object.entries(this.layerClients)) {
      await this.connectToLayer(layerName, config);
    }

    // Register tools after clients are connected
    for (const [name, register] of Object.entries(this.tools)) {
      logger.info(`${this.name}: Registering ${name} tools...`);
      register(this.server, this.clients);
      logger.info(`${this.name}: ${name} tools registered successfully`);
    }

    // Verify tools are available from each client
    for (const [layerName, client] of Object.entries(this.clients)) {
      try {
        const tools = await client.listTools();
        logger.info(`${this.name}: ${layerName} has ${tools.tools?.length || 0} tools available`);
      } catch (error) {
        logger.error(`${this.name}: Failed to list tools from ${layerName}:`, error);
      }
    }

    // Start HTTP server
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        logger.info(`${this.name} HTTP server listening on port ${this.port}`);
        logger.info(`${this.name} WebSocket server listening on port ${this.wsPort}`);
        resolve();
      });
    });
  }

  /**
   * Get the underlying MCP server instance
   * @returns {McpServer} The MCP server instance
   */
  getServer() {
    return this.server;
  }
}

export default AipiLayerServer; 