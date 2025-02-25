/**
 * MCP (Model Context Protocol) Module
 * 
 * This module exports the necessary components for implementing
 * the Model Context Protocol across the different layers of the (AI)PI system.
 */

// Import punycode hook to intercept all punycode imports
import '../utils/punycode-hook.js';

// Import the SDK components we'll use
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod'; // Zod is used for schema validation in the MCP SDK

// Import our layer-specific implementations
import { Layer1Server } from './layer1Server.js';
import { Layer2Server } from './layer2Server.js';
import { Layer3Server } from './layer3Server.js';

// Export everything
export {
  // SDK exports
  McpServer,
  StdioServerTransport,
  z,
  
  // Layer implementations
  Layer1Server,
  Layer2Server,
  Layer3Server
}; 