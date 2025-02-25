/**
 * Test script for the tool-formatter utility
 * 
 * This script tests the tool-formatter utility with real tool objects
 * to ensure it correctly formats the tools as JSON for LLM prompting.
 */

const mcpClient = require('./mcp-client');
const toolFormatter = require('./tool-formatter');
const logger = require('./logger');

/**
 * Main function to test the tool formatter
 */
async function main() {
  try {
    // Initialize MCP client
    console.log('Initializing MCP client...');
    await mcpClient.initialize();
    console.log('MCP client initialized');
    
    // Get tools from all layers
    const allTools = mcpClient.getAllTools();
    
    // Test with a tool from Layer 1 (JSON Schema format)
    if (allTools.layer1 && allTools.layer1.length > 0) {
      const layer1Tool = allTools.layer1[0];
      console.log('\n=== LAYER 1 TOOL (JSON Schema) ===');
      console.log('Raw tool object:');
      console.log(JSON.stringify(layer1Tool, null, 2));
      
      console.log('\nSimplified tool:');
      const simplifiedTool = toolFormatter.simplifyToolForLLM(layer1Tool);
      console.log(JSON.stringify(simplifiedTool, null, 2));
    }
    
    // Test with a tool from Layer 2 (if available)
    if (allTools.layer2 && allTools.layer2.length > 0) {
      const layer2Tool = allTools.layer2[0];
      console.log('\n=== LAYER 2 TOOL ===');
      console.log('Raw tool object:');
      console.log(JSON.stringify(layer2Tool, null, 2));
      
      console.log('\nSimplified tool:');
      const simplifiedTool = toolFormatter.simplifyToolForLLM(layer2Tool);
      console.log(JSON.stringify(simplifiedTool, null, 2));
    }
    
    // Test with a tool from Layer 3 (if available)
    if (allTools.layer3 && allTools.layer3.length > 0) {
      const layer3Tool = allTools.layer3[0];
      console.log('\n=== LAYER 3 TOOL ===');
      console.log('Raw tool object:');
      console.log(JSON.stringify(layer3Tool, null, 2));
      
      console.log('\nSimplified tool:');
      const simplifiedTool = toolFormatter.simplifyToolForLLM(layer3Tool);
      console.log(JSON.stringify(simplifiedTool, null, 2));
    }
    
    // Test formatting all tools
    console.log('\n=== ALL TOOLS FORMATTED ===');
    const allToolsFormatted = toolFormatter.formatAllToolsForLLM(allTools);
    console.log(allToolsFormatted);
    
    console.log('\nTool formatter test completed successfully');
  } catch (error) {
    console.error('Error testing tool formatter:', error);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
}); 