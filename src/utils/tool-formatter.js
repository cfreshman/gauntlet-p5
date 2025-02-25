/**
 * Tool Formatter Utility
 * 
 * Provides functions to transform raw tool specifications into JSON format
 * for LLM prompting.
 */

const logger = require('./logger');

/**
 * Format all tools from multiple layers into a JSON string for LLM prompting
 * @param {Object} allTools - Object containing tools organized by layer
 * @param {Object} options - Formatting options
 * @param {string} options.header - Header text to prepend (default: "AVAILABLE TOOLS:\n\n")
 * @returns {string} - Formatted tools description with JSON
 */
function formatAllToolsForLLM(allTools, options = {}) {
  const {
    header = "AVAILABLE TOOLS:\n\n"
  } = options;
  
  let toolsDescription = header;
  
  // Process each layer
  ['layer1', 'layer2', 'layer3'].forEach(layer => {
    if (allTools[layer] && allTools[layer].length > 0) {
      toolsDescription += `${layer.toUpperCase()} TOOLS:\n`;
      
      // Convert tools to a simplified JSON representation
      const simplifiedTools = allTools[layer].map(simplifyToolForLLM);
      toolsDescription += JSON.stringify(simplifiedTools, null, 2);
      toolsDescription += "\n\n";
    }
  });
  
  return toolsDescription;
}

/**
 * Simplify a tool object for LLM consumption by removing unnecessary properties
 * and keeping only the essential information
 * @param {Object} tool - The tool specification object
 * @returns {Object} - Simplified tool object
 */
function simplifyToolForLLM(tool) {
  // Create a simplified representation with just the essential properties
  const simplified = {
    name: tool.name,
    description: tool.description
  };
  
  // Add inputSchema if available (for parameters)
  if (tool.inputSchema) {
    simplified.parameters = tool.inputSchema;
  } else if (tool._schema && tool._schema.arguments) {
    // For Zod schemas, create a simplified representation
    const params = {};
    try {
      const shape = tool._schema.arguments.shape || {};
      Object.keys(shape).forEach(paramName => {
        const param = shape[paramName];
        params[paramName] = {
          type: param._def?.typeName || 'unknown',
          description: param.description || '',
          required: !param.isOptional
        };
      });
      simplified.parameters = params;
    } catch (err) {
      logger.error('Error processing Zod schema:', err);
      simplified.parameters = { error: 'Failed to process parameters' };
    }
  }
  
  // Add outputSchema if available (for response format)
  if (tool.outputSchema) {
    simplified.returns = tool.outputSchema;
  } else if (tool._schema && tool._schema.returns) {
    // For Zod schemas, create a simplified representation
    try {
      const returnDef = tool._schema.returns;
      simplified.returns = {
        type: returnDef._def?.typeName || 'unknown',
        description: returnDef.description || ''
      };
    } catch (err) {
      logger.error('Error processing Zod return schema:', err);
      simplified.returns = { error: 'Failed to process return type' };
    }
  }
  
  return simplified;
}

module.exports = {
  formatAllToolsForLLM,
  simplifyToolForLLM
}; 