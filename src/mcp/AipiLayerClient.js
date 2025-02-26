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
      const response = await client.listTools();
      const tools = response.tools || response;
      if (!Array.isArray(tools)) {
        logger.error(`Received invalid tools format from ${layerName}:`, response);
        return;
      }
      this.tools[layerName] = tools;
      logger.info(`${this.name}: Refreshed tools for ${layerName}, found ${tools.length} tools`);
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
      try {
        await this.connectToLayer(layerName, config);
      } catch (error) {
        logger.error(`Failed to connect to ${layerName}:`, error);
      }
    }
    
    // Log available tools after connecting
    logger.info('Available tools after startup:', this.tools);
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
      // Ensure tools is an array before using find
      if (!Array.isArray(tools)) {
        logger.warn(`Tools for ${layer} is not an array:`, tools);
        continue;
      }
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        return { ...tool, layer };
      }
    }
    return null;
  }

  /**
   * Get the client for a specific tool
   * @param {string} toolName - Name of the tool
   * @returns {Promise<Client|null>} - The client that has the tool, or null if not found
   */
  async getClientForTool(toolName) {
    // Refresh tools first to ensure we have latest
    await Promise.all(
      Object.entries(this.layerServers).map(([layer]) => 
        this.refreshTools(layer).catch(err => 
          logger.error(`Error refreshing tools for ${layer}:`, err)
        )
      )
    );

    const tool = this.findTool(toolName);
    if (!tool) {
      logger.warn(`No tool found with name: ${toolName}`);
      return null;
    }

    const client = this.clients[tool.layer];
    if (!client) {
      logger.warn(`No client found for layer: ${tool.layer}`);
      return null;
    }

    return client;
  }

  /**
   * Call a tool
   * @param {Object} params - Parameters for the tool call
   * @param {string} params.name - Name of the tool to call
   * @param {Object} params.arguments - Arguments for the tool
   */
  async callTool(params) {
    const { name: toolName } = params;
    logger.info(`AipiLayerClient.callTool ${toolName}`, params.arguments);

    const client = await this.getClientForTool(toolName);
    if (!client) {
      throw new Error(`No client found for tool: ${toolName}`);
    }

    // Pass the entire object to the SDK's callTool
    const result = await client.callTool(params);

    return result;
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