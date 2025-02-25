/**
 * Message Processor for Music AIPI
 * 
 * Processes user messages and returns responses for the web client.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const logger = require('../utils/logger');
const mcpClient = require('../utils/mcp-client');
const toolFormatter = require('../utils/tool-formatter');

// Chat history for context (stored per user in a real implementation)
const chatHistory = [];

// Debug information
const debugInfo = {
  lastToolCall: '',
  lastResponse: '',
  lastToolResult: null
};

/**
 * Process a user message and return a response
 * @param {string} userInput - The user's message
 * @returns {Promise<string>} - The assistant's response
 */
async function processUserMessage(userInput) {
  console.log('=== Processing user message ===');
  console.log(`Input: "${userInput}"`);
  console.log(`Chat history length: ${chatHistory.length}`);
  logger.info(`Processing user message: ${userInput}`);
  
  // Add user message to chat history
  chatHistory.push({
    role: 'user',
    content: userInput
  });
  
  try {
    // Initialize MCP client if not already initialized
    if (!mcpClient.initialized) {
      console.log('Initializing MCP client...');
      await mcpClient.initialize();
    }
    
    // Generate and store tool descriptions for debugging
    await generateToolDescriptions();
    
    // Special case for testing Layer 1 and Layer 2 clients directly
    if (userInput.toLowerCase().includes('test layer1') || userInput.toLowerCase().includes('test layer 1')) {
      return await testLayer1Client();
    }
    
    if (userInput.toLowerCase().includes('test layer2') || userInput.toLowerCase().includes('test layer 2')) {
      return await testLayer2Client();
    }
    
    // Use the music-aipi-agent tool from Layer 3
    const toolName = 'music-aipi-agent';
    const toolArgs = { query: userInput };
    
    // Store the tool call for debugging
    debugInfo.lastToolCall = `${toolName} from layer3 with args: ${JSON.stringify(toolArgs)}`;
    
    console.log(`Calling tool: ${toolName} with args:`, toolArgs);
    
    try {
      // Call the music-aipi-agent tool
      const toolResult = await mcpClient.callTool(toolName, toolArgs);
      debugInfo.lastToolResult = toolResult;
      
      // Extract the response from the tool result
      let response = extractResponseFromToolResult(toolResult);
      
      // Store the response for debugging
      debugInfo.lastResponse = response;
      
      // Add assistant response to chat history
      chatHistory.push({
        role: 'assistant',
        content: response
      });
      
      console.log('=== Message processing complete ===');
      return response;
    } catch (error) {
      console.error(`Error calling tool ${toolName}:`, error);
      
      // If tool call fails, use a fallback response
      const fallbackResponse = "i'm sorry, i couldn't process your request. could you try asking in a different way?";
      
      // Log the error for debugging
      logger.error(`Tool call error for ${toolName}:`, { 
        error: error.message, 
        args: toolArgs,
        userInput
      });
      
      // Add fallback response to chat history
      chatHistory.push({
        role: 'assistant',
        content: fallbackResponse
      });
      
      console.log('=== Message processing failed ===');
      return fallbackResponse;
    }
  } catch (error) {
    console.error('Error in processUserMessage:', error);
    
    // Handle errors gracefully
    const errorResponse = `i'm sorry, i encountered an error while processing your request: ${error.message}. could you try rephrasing or asking something else?`;
    logger.error(`Error processing message: ${error.message}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: errorResponse
    });
    
    console.log('=== Message processing failed ===');
    return errorResponse;
  }
}

/**
 * Extract a user-friendly response from the tool result
 * @param {object} toolResult - The result from the tool
 * @returns {string} - A user-friendly response
 */
function extractResponseFromToolResult(toolResult) {
  console.log('Extracting response from tool result:', toolResult);
  
  // Default response if extraction fails
  let response = "i found some information for you, but i'm having trouble formatting it. could you try asking in a different way?";
  
  // Extract the content from the tool result
  if (toolResult && toolResult.content && Array.isArray(toolResult.content)) {
    // Process each content item
    toolResult.content.forEach(item => {
      if (item.type === 'text') {
        // Use the text content as the response
        response = item.text;
      }
    });
  } else if (typeof toolResult === 'string') {
    // If the tool result is a string, use it directly
    response = toolResult;
  }
  
  return response;
}

/**
 * Test the Layer 1 client directly
 * @returns {Promise<string>} - The test result
 */
async function testLayer1Client() {
  try {
    console.log('Testing Layer 1 client directly...');
    
    // Get the Layer 1 client
    const layer1Client = mcpClient.clients.layer1;
    
    if (!layer1Client) {
      return "Layer 1 client is not available";
    }
    
    // List available tools
    const tools = await layer1Client.listTools();
    console.log(`Layer 1 has ${tools.tools.length} tools available`);
    
    // Test get-similar-artists tool
    if (tools.tools.some(tool => tool.name === 'get-similar-artists')) {
      console.log('Testing get-similar-artists tool...');
      
      const result = await layer1Client.callTool({
        name: 'get-similar-artists',
        arguments: {
          artist: 'Radiohead',
          limit: 3
        }
      });
      
      console.log('get-similar-artists result:', result);
      
      return `Layer 1 test successful! Found ${tools.tools.length} tools and called get-similar-artists.`;
    } else {
      return `Layer 1 has ${tools.tools.length} tools, but get-similar-artists is not available.`;
    }
  } catch (error) {
    console.error('Error testing Layer 1 client:', error);
    return `Error testing Layer 1 client: ${error.message}`;
  }
}

/**
 * Test the Layer 2 client directly
 * @returns {Promise<string>} - The test result
 */
async function testLayer2Client() {
  try {
    console.log('Testing Layer 2 client directly...');
    
    // Get the Layer 2 client
    const layer2Client = mcpClient.clients.layer2;
    
    if (!layer2Client) {
      return "Layer 2 client is not available";
    }
    
    // List available tools
    const tools = await layer2Client.listTools();
    console.log(`Layer 2 has ${tools.tools.length} tools available`);
    
    // Test discover-similar-artists tool
    if (tools.tools.some(tool => tool.name === 'discover-similar-artists')) {
      console.log('Testing discover-similar-artists tool...');
      
      const result = await layer2Client.callTool({
        name: 'discover-similar-artists',
        arguments: {
          artistName: 'Radiohead',
          limit: 3
        }
      });
      
      console.log('discover-similar-artists result:', result);
      
      return `Layer 2 test successful! Found ${tools.tools.length} tools and called discover-similar-artists.`;
    } else {
      return `Layer 2 has ${tools.tools.length} tools, but discover-similar-artists is not available.`;
    }
  } catch (error) {
    console.error('Error testing Layer 2 client:', error);
    return `Error testing Layer 2 client: ${error.message}`;
  }
}

/**
 * Get the debug information
 * @returns {Object} - Debug information
 */
function getDebugInfo() {
  console.log('Debug info requested:', {
    toolCall: debugInfo.lastToolCall,
    responseLength: debugInfo.lastResponse ? debugInfo.lastResponse.length : 0,
    hasToolDescriptions: !!debugInfo.toolDescriptions
  });
  return { ...debugInfo };
}

/**
 * Generate and store tool descriptions for debugging
 * @returns {Promise<string>} - The formatted tool descriptions
 */
async function generateToolDescriptions() {
  try {
    console.log('Generating tool descriptions for debugging...');
    
    const allTools = mcpClient.getAllTools();
    
    // Format tools as JSON for LLM prompting
    const toolsDescription = toolFormatter.formatAllToolsForLLM(allTools, {
      header: "Available tools:\n"
    });
    
    // Store in global scope for debug logs
    global.lastToolDescriptions = toolsDescription;
    console.log('Tool descriptions generated and stored in global.lastToolDescriptions');
    
    // Also store in debugInfo
    debugInfo.toolDescriptions = toolsDescription;
    
    return toolsDescription;
  } catch (error) {
    console.error('Error generating tool descriptions:', error);
    return "Error generating tool descriptions: " + error.message;
  }
}

/**
 * Generates a system prompt with available tools
 * @returns {Promise<string>} - The system prompt
 */
async function generateSystemPrompt() {
  try {
    // Initialize MCP client if not already initialized
    if (!mcpClient.initialized) {
      await mcpClient.initialize();
    }
    
    const allTools = mcpClient.getAllTools();
    
    // Format tools as JSON for LLM prompting
    const toolsDescription = toolFormatter.formatAllToolsForLLM(allTools, {
      header: "Available tools:\n"
    });
    
    // Store in global scope for debug logs
    global.lastToolDescriptions = toolsDescription;
    console.log('Tool descriptions generated and stored in global.lastToolDescriptions');
    
    // Construct the system prompt
    const systemPrompt = `You are music-aipi, a helpful assistant for music discovery and information.
You can answer questions about music, artists, songs, genres, and more.
You can also help users discover new music based on their preferences.

IMPORTANT GUIDELINES:
1. Format your responses in lowercase to match the aesthetic of the music-aipi system
2. Make your responses conversational and engaging
3. When you don't know something, admit it rather than making up information
4. Use the available tools to get information when needed

${toolsDescription}

When using tools, follow these rules:
1. Analyze the user query carefully to determine if a tool is needed
2. Select the most appropriate tool for the query
3. Extract all necessary parameters from the user query
4. Use the EXACT parameter names as specified in the tool descriptions
5. If the query doesn't contain enough information for required parameters, ask the user for clarification
6. Present the tool results in a helpful and conversational way`;

    return systemPrompt;
  } catch (error) {
    logger.error('Error generating system prompt', { error: error.message });
    return 'You are music-aipi, a helpful assistant for music discovery and information.';
  }
}

module.exports = {
  processUserMessage,
  getDebugInfo,
  generateSystemPrompt
}; 