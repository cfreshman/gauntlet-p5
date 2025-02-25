/**
 * Custom error classes for the MCP system
 */

/**
 * Error thrown when MCP layer boundaries are violated
 */
export class MCPBoundaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MCPBoundaryError';
  }
}

export default {
  MCPBoundaryError
}; 