/**
 * Tool Formatter Utility
 * 
 * Formats MCP tools for LLM consumption
 */

/**
 * Format all tools from all layers for LLM consumption
 * @param {Object} tools - Tools organized by layer
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted tools description
 */
function formatAllToolsForLLM(tools, options = {}) {
  const { header = '' } = options;
  let output = header;
  
  for (const [layer, layerTools] of Object.entries(tools)) {
    if (layerTools.length > 0) {
      output += `\n${layer} tools:\n`;
      output += layerTools.map(tool => formatTool(tool)).join('\n\n');
      output += '\n';
    }
  }
  
  return output;
}

/**
 * Format a single tool for LLM consumption
 * @param {Object} tool - Tool object
 * @returns {string} - Formatted tool description
 */
function formatTool(tool) {
  let output = `${tool.name}:\n`;
  output += `  description: ${tool.description}\n`;
  
  if (tool.parameters && Object.keys(tool.parameters).length > 0) {
    output += '  parameters:\n';
    for (const [name, param] of Object.entries(tool.parameters)) {
      output += `    ${name}: ${param.type}${param.required ? ' (required)' : ''}\n`;
      if (param.description) {
        output += `      ${param.description}\n`;
      }
    }
  }
  
  return output;
}

export default {
  formatAllToolsForLLM,
  formatTool
}; 