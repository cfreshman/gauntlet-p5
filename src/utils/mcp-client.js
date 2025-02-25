/**
 * MCP Client Utility
 * 
 * this module provides a unified client for interacting with all three MCP layers.
 * it handles connections, tool discovery, and tool execution.
 */

import logger from './logger.js';
import toolFormatter from './tool-formatter.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import WebSocket from 'ws';
import { WebSocketClientTransport } from './ws-transport.js';

// MCP layer server URLs
const MCP_SERVERS = {
  layer1: process.env.MCP_LAYER1_URL || 'ws://localhost:3011',
  layer2: process.env.MCP_LAYER2_URL || 'ws://localhost:3012',
  layer3: process.env.MCP_LAYER3_URL || 'ws://localhost:3013'
};

class McpClient {
  constructor() {
    this.clients = {
      layer1: null,
      layer2: null,
      layer3: null
    };
    
    this.tools = {
      layer1: [],
      layer2: [],
      layer3: []
    };
    
    this.connected = {
      layer1: false,
      layer2: false,
      layer3: false
    };
    
    this.initialized = false;
  }
  
  /**
   * initialize connections to all MCP layers
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      logger.debug('MCP client already initialized');
      return;
    }
    
    logger.info('initializing MCP client connections...');
    
    try {
      await this.initializeLayer('layer1');
      await this.initializeLayer('layer2');
      await this.initializeLayer('layer3');
      
      this.initialized = true;
      logger.info('MCP client initialization complete');
    } catch (error) {
      logger.error('error initializing MCP client:', error.message);
      throw error;
    }
  }
  
  /**
   * initialize a specific layer client
   * @param {string} layer - the layer to initialize ('layer1', 'layer2', or 'layer3')
   * @returns {Promise<void>}
   */
  async initializeLayer(layer) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds between retries
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`initializing ${layer} client (attempt ${attempt}/${maxRetries})...`);
        
        // create client
        this.clients[layer] = new Client(
          {
            name: `web-client-to-${layer}`,
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
        const ws = new WebSocket(MCP_SERVERS[layer]);
        
        // Wait for connection
        await new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });
        
        // Create transport
        const transport = new WebSocketClientTransport(ws);

        // Connect with timeout
        await Promise.race([
          this.clients[layer].connect(transport),
          new Promise((_, reject) => setTimeout(() => 
            reject(new Error(`Connection timeout after 10s for ${layer}`)), 10000))
        ]);

        logger.info(`${layer} client connected successfully`);
        this.connected[layer] = true;

        // Fetch available tools
        await this.refreshTools(layer);
        return;

      } catch (error) {
        logger.error(`error initializing ${layer} client (attempt ${attempt}/${maxRetries}):`, error);
        this.connected[layer] = false;
        
        if (attempt < maxRetries) {
          logger.info(`retrying ${layer} connection in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    logger.error(`failed to initialize ${layer} client after ${maxRetries} attempts`);
  }
  
  /**
   * refresh the list of available tools for a layer
   * @param {string} layer - the layer to refresh tools for
   * @returns {Promise<Array>} - the list of tools
   */
  async refreshTools(layer) {
    if (!this.connected[layer]) {
      logger.debug(`cannot refresh tools for ${layer}: not connected`);
      return [];
    }
    
    try {
      const response = await this.clients[layer].listTools();
      this.tools[layer] = response.tools;
      logger.info(`fetched ${this.tools[layer].length} tools from ${layer}`);
      return this.tools[layer];
    } catch (error) {
      logger.error(`error fetching tools from ${layer}:`, error.message);
      return [];
    }
  }
  
  /**
   * get all available tools across all layers
   * @returns {Object} - tools organized by layer
   */
  getAllTools() {
    return this.tools;
  }
  
  /**
   * find a tool by name across all layers
   * @param {string} toolName - the name of the tool to find
   * @returns {Object|null} - the tool object and its layer, or null if not found
   */
  findTool(toolName) {
    for (const layer of ['layer1', 'layer2', 'layer3']) {
      const tool = this.tools[layer].find(t => t.name === toolName);
      if (tool) {
        return { layer, tool };
      }
    }
    return null;
  }
  
  /**
   * call a tool by name
   * @param {string} toolName - the name of the tool to call
   * @param {Object} args - the arguments to pass to the tool
   * @returns {Promise<Object>} - the result of the tool call
   */
  async callTool(toolName, args) {
    const toolInfo = this.findTool(toolName);
    
    if (!toolInfo) {
      throw new Error(`tool not found: ${toolName}`);
    }
    
    const { layer, tool } = toolInfo;
    
    if (!this.connected[layer]) {
      throw new Error(`cannot call tool ${toolName}: ${layer} not connected`);
    }
    
    logger.info(`calling ${toolName} on ${layer} with args:`, args);
    
    try {
      const result = await this.clients[layer].callTool({
        name: toolName,
        arguments: args
      });
      
      logger.info(`${toolName} call successful`);
      return result;
    } catch (error) {
      logger.error(`error calling ${toolName}:`, error.message);
      throw error;
    }
  }
  
  /**
   * check if all layers are connected
   * @returns {boolean} - true if all layers are connected
   */
  isFullyConnected() {
    return this.connected.layer1 && this.connected.layer2 && this.connected.layer3;
  }
  
  /**
   * get connection status for all layers
   * @returns {Object} - connection status by layer
   */
  getConnectionStatus() {
    return this.connected;
  }
  
  /**
   * format all tools for LLM consumption
   * @param {Object} options - formatting options
   * @returns {string} - formatted tools description
   */
  async formatAllToolsForLLM(options = {}) {
    try {
      // ensure we have the latest tools
      await this.refreshAllTools();
      
      // use the tool formatter utility
      return toolFormatter.formatAllToolsForLLM(this.tools, options);
    } catch (error) {
      logger.error('error formatting tools for LLM:', error.message);
      return "Error: Could not format tools for LLM";
    }
  }
  
  /**
   * refresh tools for all connected layers
   * @returns {Promise<void>}
   */
  async refreshAllTools() {
    const refreshPromises = [];
    
    for (const layer of ['layer1', 'layer2', 'layer3']) {
      if (this.connected[layer]) {
        refreshPromises.push(this.refreshTools(layer));
      }
    }
    
    await Promise.all(refreshPromises);
    logger.info('refreshed tools for all connected layers');
  }
}

// create singleton instance
const mcpClient = new McpClient();

export default mcpClient; 