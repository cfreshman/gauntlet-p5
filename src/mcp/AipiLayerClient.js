import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import WebSocket from 'ws';
import { WebSocketClientTransport } from '../utils/ws-transport.js';
import logger from '../utils/logger.js';

class AipiLayerClient {
  /**
   * Create a new AIPI Layer Client
   * @param {Object} options - Client configuration options
   * @param {string} options.name - Client name (e.g. 'aipi-layer2-client')
   * @param {Object} options.layerServers - Map of layer names to connection configs
   */
  constructor(options) {
    this.name = options.name;
    this.layerServers = options.layerServers || {};

    // Initialize layer clients
    this.clients = {};
    this.tools = {};
  }

  /**
   * Connect to a layer server with retries
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
          
          // Create client
          const client = new Client(
            {
              name: `${this.name}-to-${layerName}`,
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
          
          // Store client and fetch tools
          this.clients[layerName] = client;
          await this.refreshTools(layerName);
          
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
   * Refresh tools for a layer
   * @param {string} layerName - The layer to refresh tools for
   */
  async refreshTools(layerName) {
    const client = this.clients[layerName];
    if (!client) {
      logger.warn(`Cannot refresh tools for ${layerName}: no client`);
      return;
    }

    try {
      const tools = await client.listTools();
      this.tools[layerName] = tools;
      logger.info(`${this.name}: Refreshed tools for ${layerName}`);
    } catch (error) {
      logger.error(`${this.name}: Error refreshing tools for ${layerName}:`, error);
    }
  }

  /**
   * Start the client
   */
  async start() {
    // Connect to layer servers
    for (const [layerName, config] of Object.entries(this.layerServers)) {
      await this.connectToLayer(layerName, config);
    }
  }

  /**
   * Get all available tools
   */
  getAllTools() {
    return this.tools;
  }

  /**
   * Find a tool by name
   * @param {string} toolName - Name of the tool to find
   */
  findTool(toolName) {
    for (const [layer, tools] of Object.entries(this.tools)) {
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        return { ...tool, layer };
      }
    }
    return null;
  }

  /**
   * Call a tool
   * @param {string} toolName - Name of the tool to call
   * @param {Object} args - Arguments for the tool
   */
  async callTool(toolName, args) {
    const tool = this.findTool(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const client = this.clients[tool.layer];
    if (!client) {
      throw new Error(`No client for layer ${tool.layer}`);
    }

    return await client.callTool(toolName, args);
  }

  /**
   * Check if fully connected to all configured layers
   */
  isFullyConnected() {
    return Object.keys(this.layerServers).every(layer => 
      this.clients[layer] && this.tools[layer]
    );
  }
}

export default AipiLayerClient; 