/**
 * MCP (Model Context Protocol) Module
 * 
 * This module exports the necessary components for implementing
 * the Model Context Protocol across the different layers of the (AI)PI system.
 */

// load punycode hook to intercept all punycode imports
require('../utils/punycode-hook');

// Re-export the SDK components we'll use
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod'); // Zod is used for schema validation in the MCP SDK

// Export our layer-specific implementations
const Layer1Server = require('./layer1Server');
const Layer2Server = require('./layer2Server');
const Layer3Server = require('./layer3Server');

module.exports = {
  // SDK exports
  McpServer,
  StdioServerTransport,
  z,
  
  // Layer implementations
  Layer1Server,
  Layer2Server,
  Layer3Server
}; 