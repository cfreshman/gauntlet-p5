/**
 * Layer 1 Client for MCP
 * Handles data validation and transformation operations
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

class Layer1Client extends Client {
  /**
   * Create a new Layer 1 Client
   * @param {Object} options - Client options
   * @param {string} options.name - Client name
   * @param {string} options.version - Client version
   */
  constructor(options) {
    super(
      {
        name: options.name || 'aipi-layer1-client',
        version: options.version || '1.0.0'
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {}
        }
      }
    );
    
    console.log(`Initialized Layer 1 Client: ${options.name}`);
  }
}

export { Layer1Client }; 