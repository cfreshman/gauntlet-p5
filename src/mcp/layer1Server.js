/**
 * Layer 1 (Primitives) MCP Server Implementation
 * 
 * This file implements the deterministic MCP server for Layer 1,
 * which provides access to primitive operations with guaranteed deterministic behavior.
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const logger = require('../utils/logger');
const { MCPBoundaryError } = require('../utils/errors');

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
    
    this.registerDefaultTools();
    this.registerDefaultResources();
    
    logger.info(`Layer 1 MCP Server initialized`);
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
   * Connect the server to a transport
   * @param {Object} transport - The transport to connect to
   * @returns {Promise<void>}
   */
  async connect(transport) {
    try {
      await this.server.connect(transport);
      logger.info('Layer 1 MCP Server connected to transport');
    } catch (error) {
      logger.error('Error connecting Layer 1 MCP Server', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Get the underlying MCP server instance
   * @returns {McpServer} - The MCP server instance
   */
  getServer() {
    return this.server;
  }
}

module.exports = Layer1Server; 