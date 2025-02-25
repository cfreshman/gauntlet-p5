/**
 * MCP Client Utility
 * 
 * this module provides a unified client for interacting with all three MCP layers.
 * it handles connections, tool discovery, and tool execution.
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const logger = require('./logger');

// try to load SSE client transport
let SSEClientTransport;
try {
  const sseModule = require('@modelcontextprotocol/sdk/client/sse.js');
  SSEClientTransport = sseModule.SSEClientTransport;
  logger.debug('SSEClientTransport loaded successfully for MCP client');
} catch (error) {
  logger.debug('SSEClientTransport not available for MCP client:', error.message);
}

// try to load StdioClientTransport as fallback
let StdioClientTransport;
try {
  const stdioModule = require('@modelcontextprotocol/sdk/client/stdio.js');
  StdioClientTransport = stdioModule.StdioClientTransport;
  logger.debug('StdioClientTransport loaded successfully for MCP client');
} catch (error) {
  logger.debug('StdioClientTransport not available for MCP client:', error.message);
}

// MCP layer server URLs
const MCP_SERVERS = {
  layer1: process.env.MCP_LAYER1_URL || 'http://localhost:3001',
  layer2: process.env.MCP_LAYER2_URL || 'http://localhost:3002',
  layer3: process.env.MCP_LAYER3_URL || 'http://localhost:3003'
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
      // initialize layer 1 client
      await this.initializeLayer('layer1');
      
      // initialize layer 2 client
      await this.initializeLayer('layer2');
      
      // initialize layer 3 client
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
    try {
      logger.debug(`initializing ${layer} client...`);
      
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
      
      // create transport
      let transport;
      const endpoint = `${MCP_SERVERS[layer]}/mcp/events`;
      
      if (SSEClientTransport) {
        transport = new SSEClientTransport({ endpoint });
      } else if (StdioClientTransport) {
        const layerNum = layer.replace('layer', '');
        transport = new StdioClientTransport({
          command: 'node',
          args: ['--no-deprecation', 'src/mcp/demo.js', layerNum],
          cwd: process.cwd()
        });
      } else {
        throw new Error('no transport available for MCP client');
      }
      
      // connect to server
      await this.clients[layer].connect(transport);
      this.connected[layer] = true;
      logger.info(`${layer} client connected successfully`);
      
      // fetch available tools
      await this.refreshTools(layer);
    } catch (error) {
      logger.error(`error initializing ${layer} client:`, error.message);
      this.connected[layer] = false;
    }
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
}

// create singleton instance
const mcpClient = new McpClient();

module.exports = mcpClient; 