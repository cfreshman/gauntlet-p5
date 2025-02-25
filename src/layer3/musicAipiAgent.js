/**
 * Generic AIPI Agent (Layer 3)
 * 
 * This module provides a generic conversational agent that can handle any request
 * by dynamically discovering and using available tools.
 */

const logger = require('../utils/logger');
const { OpenAI } = require('openai');
const { z } = require('zod');
const mcpClient = require('../utils/mcp-client');
const toolFormatter = require('../utils/tool-formatter');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Register the generic agent with the server
 * @param {object} server - The server instance to register tools with
 * @param {object} layer1Client - The Layer 1 client instance (may be null initially)
 * @param {object} layer2Client - The Layer 2 client instance (may be null initially)
 */
function registerMusicAipiAgent(server, layer1Client, layer2Client) {
  logger.info('Registering Generic AIPI Agent (Layer 3)...');

  // Debug the client status
  logger.info('Initial Layer 1 client status:', { 
    available: !!layer1Client,
    connected: layer1Client ? 'Yes (checking tools)' : 'No'
  });
  
  logger.info('Initial Layer 2 client status:', { 
    available: !!layer2Client,
    connected: layer2Client ? 'Yes (checking tools)' : 'No'
  });

  // Check if the server has a tools property and if process-query is already registered
  try {
    // Try to unregister the existing process-query tool if it exists
    if (server._tools && server._tools['process-query']) {
      logger.info('Unregistering existing process-query tool');
      delete server._tools['process-query'];
    }
  } catch (error) {
    logger.warn('Could not unregister existing process-query tool:', error.message);
  }

  // Register our generic agent tool
  server.tool(
    'music-aipi-agent',
    'Process a natural language query and generate a response using available tools',
    {
      query: z.string().describe('The user query to process'),
      context: z.string().optional().describe('Additional context information'),
      responseFormat: z.enum(['concise', 'detailed', 'technical', 'simple']).optional().describe('Format of the response'),
      conversationHistory: z.string().optional().describe('JSON string of conversation history from the front end')
    },
    async ({ query, context = '', responseFormat = 'detailed', conversationHistory = '' }) => {
      try {
        logger.debug('Processing user query', { queryLength: query.length, responseFormat });
        
        // Initialize MCP client if not already initialized
        if (!mcpClient.initialized) {
          logger.info('Initializing MCP client from generic agent...');
          await mcpClient.initialize();
        }
        
        // Parse conversation history if provided
        let parsedHistory = [];
        if (conversationHistory) {
          try {
            parsedHistory = JSON.parse(conversationHistory);
            logger.info('Using conversation history from front end', { historyLength: parsedHistory.length });
          } catch (error) {
            logger.warn('Failed to parse conversation history', { error: error.message });
          }
        }
        
        // Log the client status
        logger.info('Using MCP client for generic agent:', {
          layer1ClientAvailable: mcpClient.connected.layer1,
          layer2ClientAvailable: mcpClient.connected.layer2,
          layer3ClientAvailable: mcpClient.connected.layer3
        });
        
        // Handle the query using the generic approach
        return await handleQuery({ 
          query, 
          context, 
          responseFormat, 
          chatHistory: parsedHistory, 
          mcpClient 
        });
      } catch (error) {
        logger.error('Error processing query', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `i'm sorry, i encountered an error while processing your request: ${error.message}. could you try rephrasing or asking something else?`
            }
          ],
          isError: true
        };
      }
    }
  );

  logger.info('Generic AIPI Agent registered successfully');
}

/**
 * Handle a user query using available tools
 * @param {object} params - Parameters for handling the query
 * @returns {Promise<object>} - The response
 */
async function handleQuery(params) {
  const { query, context = '', responseFormat = 'detailed', chatHistory = [], mcpClient } = params;
  
  try {
    logger.info(`Processing user query: "${query}"`);
    
    // Initialize client state for debugging
    const clientState = {
      query,
      chatHistory,
      callTree: {
        initialQuery: query,
        timestamp: new Date().toISOString(),
        steps: []
      }
    };
    
    // Select the appropriate tool for the query
    const { toolName, toolArgs } = await selectTool(query, mcpClient);
    
    if (!toolName) {
      // If no tool was selected, handle as a general query
      return await handleGeneralQuery(query, context, responseFormat, chatHistory);
    }
    
    // Log the selected tool
    logger.info(`Selected tool: ${toolName}`, { args: toolArgs });
    
    // Add tool selection to call tree
    clientState.callTree.steps.push({
      type: 'tool_selection',
      toolName,
      toolArgs,
      timestamp: new Date().toISOString()
    });
    
    // Find the tool info to get the layer
    const toolInfo = mcpClient.findTool(toolName);
    if (!toolInfo) {
      logger.error(`Tool ${toolName} not found`);
      return {
        content: [
          {
            type: "text",
            text: `I couldn't find the tool "${toolName}" to process your request. Please try again with a different query.`
          }
        ],
        isError: true
      };
    }
    
    // Call the selected tool
    logger.info(`Calling tool ${toolName} from layer ${toolInfo.layer}`);
    const toolResult = await mcpClient.callTool(toolName, toolArgs);
    
    // Add tool result to call tree
    clientState.callTree.steps.push({
      type: 'tool_result',
      toolName,
      result: toolResult,
      timestamp: new Date().toISOString()
    });
    
    // Process the tool result
    const processedResult = await processToolResult({
      toolName,
      toolResult,
      chatHistory,
      mcpClient,
      responseFormat
    });
    
    // Add processed result to call tree
    clientState.callTree.steps.push({
      type: 'processed_result',
      result: processedResult,
      timestamp: new Date().toISOString()
    });
    
    // Store the call tree in a global variable for debugging
    global.lastCallTree = clientState.callTree;
    
    // Return the processed result with the call tree for debugging
    return {
      ...processedResult,
      debug: {
        callTree: clientState.callTree
      }
    };
    
  } catch (error) {
    logger.error(`Error handling query: ${error.message}`);
    return {
      content: [
        {
          type: "text",
          text: `I encountered an error while processing your request: ${error.message}. Please try again or ask a different question.`
        }
      ],
      isError: true,
      debug: {
        callTree: global.lastCallTree || {
          error: error.message,
          stack: error.stack
        }
      }
    };
  }
}

/**
 * Select the appropriate tool for a query
 * @param {string} query - The user query
 * @param {object} mcpClient - The MCP client
 * @returns {Promise<object>} - The selected tool and arguments
 */
async function selectTool(query, mcpClient) {
  try {
    // Fetch available tools from all layers
    const allTools = await mcpClient.getAllTools();
    const layer1Tools = allTools.filter(tool => tool.layer === 1);
    const layer2Tools = allTools.filter(tool => tool.layer === 2);
    
    // Log tool counts for debugging
    logger.debug(`Available tools - Layer 1: ${layer1Tools.length}, Layer 2: ${layer2Tools.length}, Layer 3: ${allTools.length - layer1Tools.length - layer2Tools.length}`);
    
    // Format tools for LLM
    const toolsFormatted = await mcpClient.formatAllToolsForLLM();
    
    // Create messages array for LLM
    const messages = [
      {
        role: 'system',
        content: `You are a tool selector for an AI assistant. Your task is to analyze a user query and select the most appropriate tool to handle it.

IMPORTANT INSTRUCTIONS:
1. Select ONLY ONE tool that best matches the user's query and intent
2. Return your response in JSON format with 'toolName' and 'toolArgs' fields
3. For 'toolArgs', include ONLY the parameters required by the selected tool
4. Use EXACT parameter names as specified in the tool descriptions
5. Extract all necessary information from the user query to fill the tool parameters
6. If you cannot determine which tool to use or the query doesn't seem to require a specific tool, return null for toolName

${toolsFormatted}

RESPONSE FORMAT:
{
  "toolName": "name-of-selected-tool",
  "toolArgs": {
    "param1": "value1",
    "param2": "value2"
  }
}

User query: "${query}"`
      }
    ];
    
    // Call LLM to select tool
    const llmResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    // Parse the response
    const responseContent = llmResponse.choices[0].message.content;
    let parsedResponse;
    
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (error) {
      logger.error(`Error parsing LLM response: ${error.message}`);
      return { toolName: null, toolArgs: {} };
    }
    
    const { toolName, toolArgs } = parsedResponse;
    
    // Validate the selected tool
    if (!toolName) {
      logger.info('No tool selected by LLM, will handle as general query');
      return { toolName: null, toolArgs: {} };
    }
    
    // Find the tool in available tools
    const toolInfo = mcpClient.findTool(toolName);
    
    if (!toolInfo) {
      logger.warn(`Selected tool ${toolName} not found in available tools`);
      return { toolName: null, toolArgs: {} };
    }
    
    // Log the final tool selection
    logger.info(`Selected tool: ${toolName}`, { args: toolArgs });
    
    return { toolName, toolArgs: toolArgs || {} };
    
  } catch (error) {
    logger.error(`Error selecting tool: ${error.message}`);
    return { toolName: null, toolArgs: {} };
  }
}

/**
 * Process the result of a tool call and generate a response
 * @param {object} params - Parameters for processing the tool result
 * @returns {Promise<object>} - The processed result
 */
async function processToolResult(params) {
  const { toolName, toolResult, chatHistory, mcpClient, responseFormat = 'detailed' } = params;
  
  try {
    // Extract content from the tool result
    let content = '';
    if (Array.isArray(toolResult.content)) {
      content = toolResult.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    } else if (typeof toolResult.content === 'string') {
      content = toolResult.content;
    }
    
    // Create context from chat history
    const context = chatHistory.slice(-10).map(msg => {
      return {
        role: msg.role,
        content: msg.content
      };
    });
    
    // Get available tools
    const allTools = await mcpClient.getAllTools();
    const layer1Tools = allTools.filter(tool => tool.layer === 1);
    const layer2Tools = allTools.filter(tool => tool.layer === 2);
    
    // Log tool counts for debugging
    logger.debug(`Available tools - Layer 1: ${layer1Tools.length}, Layer 2: ${layer2Tools.length}, Layer 3: ${allTools.length - layer1Tools.length - layer2Tools.length}`);
    
    // Format tools for LLM
    const toolsFormatted = await mcpClient.formatAllToolsForLLM();
    
    // Determine the appropriate system message based on response format
    let systemContent;
    switch (responseFormat) {
      case 'concise':
        systemContent = "You are a helpful assistant that provides concise, to-the-point answers.";
        break;
      case 'detailed':
        systemContent = "You are a helpful assistant that provides detailed, comprehensive answers.";
        break;
      case 'technical':
        systemContent = "You are a helpful assistant that provides technical, precise answers with relevant details.";
        break;
      case 'simple':
        systemContent = "You are a helpful assistant that provides simple, easy-to-understand answers without technical jargon.";
        break;
      default:
        systemContent = "You are a helpful assistant.";
    }
    
    // Add lowercase aesthetic instruction
    systemContent += " Your responses should be in lowercase to match the aesthetic of the system.";
    
    // Create messages array for LLM
    const messages = [
      {
        role: 'system',
        content: `${systemContent}

You have access to various tools that can help you fulfill user requests. If the current result doesn't fully address the user's query, you can suggest using additional tools.

${toolsFormatted}

The result of your previous tool call (${toolName}) is:
${content}`
      },
      ...context
    ];
    
    // Log conversation history for debugging
    logger.debug(`Adding ${context.length} messages from conversation history`);
    
    // Call LLM to generate response
    const llmResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });
    
    // Return the LLM response in the correct format for MCP
    return {
      content: [
        {
          type: "text",
          text: llmResponse.choices[0].message.content
        }
      ]
    };
    
  } catch (error) {
    logger.error(`Error processing tool result: ${error.message}`);
    return {
      content: [
        {
          type: "text",
          text: `I encountered an error while processing the results: ${error.message}. Please try again or ask a different question.`
        }
      ],
      isError: true
    };
  }
}

/**
 * Handle a general query without using specific tools
 * @param {string} query - The user query
 * @param {string} context - Additional context
 * @param {string} responseFormat - Format of the response
 * @param {array} conversationHistory - The conversation history from the front end
 * @returns {Promise<object>} - The response
 */
async function handleGeneralQuery(query, context, responseFormat, conversationHistory = []) {
  try {
    // Construct system prompt based on response format
    let systemPrompt;
    switch (responseFormat) {
      case 'concise':
        systemPrompt = "You are a helpful assistant that provides concise, to-the-point answers.";
        break;
      case 'detailed':
        systemPrompt = "You are a helpful assistant that provides detailed, comprehensive answers.";
        break;
      case 'technical':
        systemPrompt = "You are a helpful assistant that provides technical, precise answers with relevant details.";
        break;
      case 'simple':
        systemPrompt = "You are a helpful assistant that provides simple, easy-to-understand answers without technical jargon.";
        break;
      default:
        systemPrompt = "You are a helpful assistant.";
    }
    
    // Add lowercase aesthetic instruction
    systemPrompt += " Your responses should be in lowercase to match the aesthetic of the system.";
    
    // Start with the system message
    let messages = [{ role: "system", content: systemPrompt }];
    
    // Add conversation history as actual messages
    if (conversationHistory && conversationHistory.length > 0) {
      // Add each message from the history to the messages array
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
      
      logger.info('Added conversation history to messages in handleGeneralQuery', { 
        historyLength: conversationHistory.length 
      });
    }
    
    // Add the current query
    messages.push({ 
      role: "user", 
      content: context ? `${context}\n\n${query}` : query 
    });
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      temperature: 0.7,
      max_tokens: 4000
    });
    
    const result = response.choices[0].message.content;
    
    return {
      content: [
        {
          type: "text",
          text: result
        }
      ]
    };
  } catch (error) {
    logger.error('Error handling general query', { error: error.message });
    return {
      content: [
        {
          type: "text",
          text: `i'm sorry, i encountered an error while processing your request: ${error.message}. could you try rephrasing or asking something else?`
        }
      ],
      isError: true
    };
  }
}

module.exports = {
  registerMusicAipiAgent
}; 