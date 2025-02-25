/**
 * Layer 1 (Primitives) MCP Server Implementation
 * 
 * This file implements the deterministic MCP server for Layer 1,
 * which provides access to primitive operations with guaranteed deterministic behavior.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import logger from '../utils/logger.js';
import { MCPBoundaryError } from '../utils/errors.js';
import { registerSpotifyTools } from '../layer1/spotifyTools.js';
import { registerLastFmTools } from '../layer1/lastFmTools.js';

/**
 * Layer 1 MCP Server
 * Provides deterministic tools and resources for the (AI)PI system
 */
class Layer1Server {
  /**
   * Create a new Layer 1 MCP Server
   * @param {Object} options - Server configuration options
   */
  constructor(options = {}) {
    this.server = new McpServer({
      name: options.name || 'aipi-layer1-server',
      version: options.version || '1.0.0'
    });
    
    // Create express app
    this.app = express();
    this.app.use(cors());
    
    // Track current transport
    this.transport = null;
    
    // Register tools
    registerSpotifyTools(this.server);
    registerLastFmTools(this.server);
    this.registerDefaultTools();
    this.registerDefaultResources();
    
    // Set up endpoints
    this.setupEndpoints();
    
    logger.info('Layer 1 MCP Server initialized');
  }
  
  /**
   * Register the default tools for Layer 1
   * These tools provide deterministic operations
   */
  registerDefaultTools() {
    // Example tool: Data validation
    this.server.tool(
      "validate-data",
      "Validate data against a schema",
      {
        schema: z.object({
          type: z.string(),
          properties: z.record(z.any())
        }),
        data: z.any()
      },
      async ({ schema, data }) => {
        try {
          logger.debug('Validating data against schema', { schemaType: schema.type });
          
          // Simple validation logic based on schema type
          let isValid = false;
          let errors = [];
          
          switch (schema.type) {
            case 'string':
              isValid = typeof data === 'string';
              if (!isValid) errors.push('Expected string value');
              break;
            case 'number':
              isValid = typeof data === 'number';
              if (!isValid) errors.push('Expected number value');
              break;
            case 'boolean':
              isValid = typeof data === 'boolean';
              if (!isValid) errors.push('Expected boolean value');
              break;
            case 'object':
              isValid = typeof data === 'object' && data !== null;
              if (!isValid) errors.push('Expected object value');
              break;
            case 'array':
              isValid = Array.isArray(data);
              if (!isValid) errors.push('Expected array value');
              break;
            default:
              errors.push(`Unsupported schema type: ${schema.type}`);
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  isValid,
                  errors: errors.length > 0 ? errors : undefined
                })
              }
            ]
          };
        } catch (error) {
          logger.error('Error validating data', { error: error.message });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  isValid: false,
                  errors: [error.message]
                })
              }
            ],
            isError: true
          };
        }
      }
    );
    
    // Example tool: Data transformation
    this.server.tool(
      "transform-data",
      "Transform data from one format to another",
      {
        sourceFormat: z.string(),
        targetFormat: z.string(),
        data: z.string()
      },
      async ({ sourceFormat, targetFormat, data }) => {
        try {
          logger.debug('Transforming data', { sourceFormat, targetFormat });
          
          // Simple transformation logic
          let result;
          
          // JSON to CSV example
          if (sourceFormat === 'json' && targetFormat === 'csv') {
            const jsonData = JSON.parse(data);
            
            if (!Array.isArray(jsonData)) {
              throw new Error('JSON data must be an array of objects for CSV conversion');
            }
            
            // Extract headers from the first object
            const headers = Object.keys(jsonData[0]);
            
            // Create CSV rows
            const csvRows = [
              headers.join(','),
              ...jsonData.map(row => 
                headers.map(header => {
                  const value = row[header];
                  // Handle values with commas by quoting them
                  return typeof value === 'string' && value.includes(',') 
                    ? `"${value}"` 
                    : String(value);
                }).join(',')
              )
            ];
            
            result = csvRows.join('\n');
          } 
          // CSV to JSON example
          else if (sourceFormat === 'csv' && targetFormat === 'json') {
            const rows = data.split('\n');
            const headers = rows[0].split(',');
            
            const jsonData = rows.slice(1).map(row => {
              const values = row.split(',');
              return headers.reduce((obj, header, index) => {
                obj[header] = values[index];
                return obj;
              }, {});
            });
            
            result = JSON.stringify(jsonData, null, 2);
          }
          else {
            throw new Error(`Unsupported transformation: ${sourceFormat} to ${targetFormat}`);
          }
          
          return {
            content: [
              {
                type: "text",
                text: result
              }
            ]
          };
        } catch (error) {
          logger.error('Error transforming data', { error: error.message });
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
    
    logger.info('Default Layer 1 tools registered');
  }
  
  /**
   * Register the default resources for Layer 1
   * These resources provide access to deterministic data
   */
  registerDefaultResources() {
    // Example: System information resource
    this.server.resource(
      "system-info",
      "Get system information",
      "system://info",
      async (uri) => {
        try {
          logger.debug('Fetching system information');
          
          const systemInfo = {
            name: 'AIPI Server System',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString(),
            nodejs: {
              version: process.version,
              platform: process.platform,
              arch: process.arch
            }
          };
          
          return {
            contents: [
              {
                uri: uri.href,
                text: JSON.stringify(systemInfo, null, 2)
              }
            ]
          };
        } catch (error) {
          logger.error('Error fetching system information', { error: error.message });
          throw error;
        }
      }
    );
    
    logger.info('Default Layer 1 resources registered');
  }
  
  /**
   * Set up endpoints for the server
   */
  setupEndpoints() {
    // Add SSE endpoint
    this.app.get('/sse', (req, res) => {
      this.transport = new SSEServerTransport('/messages', res);
      this.server.connect(this.transport);
    });

    // Add POST endpoint for client-to-server messages
    this.app.post('/messages', express.json(), (req, res) => {
      if (this.transport) {
        this.transport.handlePostMessage(req, res);
      } else {
        res.status(400).json({ error: 'No active SSE connection' });
      }
    });

    // Add health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }
  
  /**
   * Start the server
   * @param {number} port - The port to listen on
   * @returns {Promise<void>} A promise that resolves when the server is started
   */
  async start(port = 3001) {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        logger.info(`Layer 1 server listening on port ${port}`);
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

export { Layer1Server }; 