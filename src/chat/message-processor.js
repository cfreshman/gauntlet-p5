/**
 * Message Processor for Music AIPI
 * 
 * Processes user messages and returns responses for the web client.
 */

import { config } from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: __dirname + '/../.env' });

import logger from '../utils/logger.js';
import mcpClient from '../utils/mcp-client.js';
import toolFormatter from '../utils/tool-formatter.js';

// Chat history stored per user
const userChatHistories = new Map();

// Debug information
const debugInfo = {
  lastToolCall: '',
  lastResponse: '',
  lastToolResult: null
};

/**
 * Process a user message and return a response
 * @param {string} userInput - The user's message
 * @param {string} userId - The user's ID
 * @returns {Promise<string>} - The assistant's response
 */
async function processUserMessage(userInput, userId) {
  console.log('=== Processing user message ===');
  console.log(`Input: "${userInput}" from user: ${userId}`);
  
  // Get or initialize chat history for this user
  if (!userChatHistories.has(userId)) {
    userChatHistories.set(userId, []);
  }
  const chatHistory = userChatHistories.get(userId);
  console.log(`Chat history length for user ${userId}: ${chatHistory.length}`);
  logger.info(`Processing user message: ${userInput} for user: ${userId}`);
  
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
    
    // Use the music-aipi-agent tool from Layer 3
    const toolName = 'music-aipi-agent';
    const toolArgs = { 
      query: userInput,
      // Pass the chat history to the agent
      conversationHistory: JSON.stringify(chatHistory),
      // Format response for web client
      responseFormat: 'concise'
    };
    
    // Store the tool call for debugging
    debugInfo.lastToolCall = `${toolName} from layer3 with args: ${JSON.stringify(toolArgs)}`;
    
    console.log(`Calling tool: ${toolName} with args:`, toolArgs);
    
    try {
      // Call the music-aipi-agent tool
      const toolResult = await mcpClient.callTool(toolName, toolArgs);
      debugInfo.lastToolResult = toolResult;
      
      // Check if service is not ready
      if (toolResult.unready) {
        return toolResult.content[0].text;
      }
      
      // Extract the response from the tool result
      let response = extractResponseFromToolResult(toolResult);
      
      // Store the response for debugging
      debugInfo.lastResponse = response;
      
      // Add assistant response to chat history
      chatHistory.push({
        role: 'assistant',
        content: response
      });
      
      // Trim chat history if it gets too long (keep last 50 messages)
      if (chatHistory.length > 50) {
        chatHistory.splice(0, chatHistory.length - 50);
      }
      
      console.log('=== Message processing complete ===');
      return response;
    } catch (error) {
      logger.error(`Tool call error for ${toolName}:`, { 
        error: error.message, 
        args: toolArgs,
        userInput,
        userId
      });
      
      // Add error response to chat history
      const errorMessage = `i'm sorry, i encountered an error while processing your request. could you try rephrasing or asking something else?`;
      
      chatHistory.push({
        role: 'assistant',
        content: errorMessage
      });
      
      return errorMessage;
    }
  } catch (error) {
    logger.error('Error in message processing:', { 
      error: error.message,
      userInput,
      userId
    });
    
    const errorMessage = `i'm sorry, something went wrong. please try again in a moment.`;
    
    chatHistory.push({
      role: 'assistant',
      content: errorMessage
    });
    
    return errorMessage;
  }
}

/**
 * Extract a user-friendly response from the tool result
 * @param {object} toolResult - The result from the tool
 * @returns {string} - A user-friendly response
 */
function extractResponseFromToolResult(toolResult) {
  console.log('Raw tool result:', JSON.stringify(toolResult, null, 2));
  
  // If the result is a string, return it directly
  if (typeof toolResult === 'string') {
    return toolResult;
  }
  
  // If the result has a content array
  if (toolResult && toolResult.content && Array.isArray(toolResult.content)) {
    // Join all text content
    const textContent = toolResult.content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'text') return item.text;
        if (item.text) return item.text;
        return '';
      })
      .filter(text => text)
      .join('\n');
      
    if (textContent) return textContent;
  }
  
  // If the result has a direct content property
  if (toolResult && toolResult.content) {
    if (typeof toolResult.content === 'string') {
      return toolResult.content;
    }
    if (typeof toolResult.content === 'object' && toolResult.content.text) {
      return toolResult.content.text;
    }
  }
  
  // If we have a text property directly
  if (toolResult && toolResult.text) {
    return toolResult.text;
  }
  
  console.log('Could not extract response from tool result');
  return "i'm having trouble understanding that. could you try asking in a different way?";
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

export {
  processUserMessage,
  getDebugInfo,
  generateSystemPrompt
}; 