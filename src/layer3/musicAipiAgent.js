/**
 * Generic AIPI Agent (Layer 3)
 * 
 * This module provides a generic conversational agent that can handle any request
 * by dynamically discovering and using available tools.
 */

import logger from '../utils/logger.js';
import { OpenAI } from 'openai';
import { z } from 'zod';
import toolFormatter from '../utils/tool-formatter.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Register the generic agent with the server
 * @param {object} server - The server instance to register tools with
 * @param {object} clients - The clients object containing layer clients
 */
function registerMusicAipiAgent(server, clients) {
  logger.info('Registering Generic AIPI Agent (Layer 3)...');

  // Register the agent immediately
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
      // Check if clients are connected
      if (!clients.layer1 || !clients.layer2) {
        return {
          content: [
            {
              type: "text",
              text: "service is starting up, please try again in a moment..."
            }
          ],
          isError: true,
          unready: true
        };
      }

      try {
        logger.debug('Processing user query', { queryLength: query.length, responseFormat });
        
        // Parse conversation history if provided
        let parsedHistory = [];
        if (conversationHistory) {
          try {
            parsedHistory = JSON.parse(conversationHistory);
          } catch (error) {
            logger.warn('Failed to parse conversation history', { error: error.message });
          }
        }
        
        // Handle the query using available tools
        return await handleQuery({ 
          query, 
          context, 
          responseFormat, 
          chatHistory: parsedHistory,
          clients
        });
      } catch (error) {
        logger.error('Error processing query', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `i'm sorry, i encountered an error while processing your request. could you try rephrasing or asking something else?`
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
 */
async function handleQuery(params) {
  const { query, context = '', responseFormat = 'detailed', chatHistory = [], clients } = params;
  
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
    const { toolName, toolArgs } = await selectTool(query, clients);
    
    if (!toolName) {
      // If no tool was selected, handle as a general query
      return await handleGeneralQuery(query, context, responseFormat, chatHistory, clients);
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
    const toolInfo = findTool(toolName, clients);
    if (!toolInfo) {
      logger.error(`Tool ${toolName} not found`);
      return {
        content: [
          {
            type: "text",
            text: `i couldn't find the right tool to handle your request. could you try asking in a different way?`
          }
        ],
        isError: true
      };
    }
    
    // Call the selected tool
    logger.info(`Calling tool ${toolName} from layer ${toolInfo.layer}`);
    const toolResult = await callTool(toolName, toolArgs, clients);
    
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
      clients,
      responseFormat
    });
    
    // Format response for web client
    let response;
    if (Array.isArray(processedResult.content)) {
      response = processedResult.content;
    } else if (typeof processedResult.content === 'string') {
      response = [{
        type: "text",
        text: processedResult.content
      }];
    } else {
      response = [{
        type: "text",
        text: "i'm sorry, i received an invalid response format. please try again."
      }];
    }
    
    // Add any additional context from tool result
    if (toolResult.context) {
      response.push({
        type: "context",
        data: toolResult.context
      });
    }
    
    // Add any Spotify playback controls if relevant
    if (toolResult.playback) {
      response.push({
        type: "playback",
        data: toolResult.playback
      });
    }
    
    // Store the call tree for debugging
    global.lastCallTree = clientState.callTree;
    
    return {
      content: response,
      isError: false
    };
  } catch (error) {
    logger.error('Error in handleQuery:', { 
      error: error.message,
      query,
      context
    });
    
    return {
      content: [
        {
          type: "text",
          text: `i'm sorry, something went wrong while handling your request. please try again in a moment.`
        }
      ],
      isError: true
    };
  }
}

/**
 * Find a tool by name across all layer clients
 */
function findTool(toolName, clients) {
  // Check layer 1
  const layer1Tools = clients.layer1.getTools();
  const layer1Tool = layer1Tools.find(t => t.name === toolName);
  if (layer1Tool) return { ...layer1Tool, layer: 1 };

  // Check layer 2
  const layer2Tools = clients.layer2.getTools();
  const layer2Tool = layer2Tools.find(t => t.name === toolName);
  if (layer2Tool) return { ...layer2Tool, layer: 2 };

  return null;
}

/**
 * Call a tool using the appropriate layer client
 */
async function callTool(toolName, args, clients) {
  const tool = findTool(toolName, clients);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  const client = tool.layer === 1 ? clients.layer1 : clients.layer2;
  return await client.callTool(toolName, args);
}

/**
 * Get all available tools from layer clients
 */
function getAllTools(clients) {
  return {
    layer1: clients.layer1.getTools() || [],
    layer2: clients.layer2.getTools() || []
  };
}

/**
 * Format tools for LLM consumption
 */
async function formatToolsForLLM(clients) {
  const allTools = getAllTools(clients);
  let formatted = "Available tools:\n\n";

  // Format Layer 1 tools
  if (allTools.layer1.length) {
    formatted += "Layer 1 (Music Service Tools):\n";
    allTools.layer1.forEach(tool => {
      formatted += `- ${tool.name}: ${tool.description}\n`;
    });
    formatted += "\n";
  }

  // Format Layer 2 tools
  if (allTools.layer2.length) {
    formatted += "Layer 2 (Music Intelligence Tools):\n";
    allTools.layer2.forEach(tool => {
      formatted += `- ${tool.name}: ${tool.description}\n`;
    });
  }

  return formatted;
}

/**
 * Select the appropriate tool for a query
 */
async function selectTool(query, clients) {
  try {
    // Format tools for LLM
    const toolsFormatted = await formatToolsForLLM(clients);
    
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
    const toolInfo = findTool(toolName, clients);
    
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
 */
async function processToolResult(params) {
  const { toolName, toolResult, chatHistory, clients, responseFormat = 'detailed' } = params;
  
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
    
    // Format tools for LLM
    const toolsFormatted = await formatToolsForLLM(clients);
    
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
 */
async function handleGeneralQuery(query, context, responseFormat, chatHistory, clients) {
  try {
    logger.info(`Handling general query: "${query}"`);
    
    // Convert chat history to the format expected by OpenAI
    const messages = chatHistory.map(msg => {
      return {
        role: msg.role,
        content: msg.content
      };
    });
    
    // Format tools for LLM
    const toolsFormatted = await formatToolsForLLM(clients);
    
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
    messages.unshift({ role: "system", content: systemPrompt });
    
    // Add conversation history as actual messages
    if (chatHistory && chatHistory.length > 0) {
      // Add each message from the history to the messages array
      chatHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
      
      logger.info('Added conversation history to messages in handleGeneralQuery', { 
        historyLength: chatHistory.length 
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

export { registerMusicAipiAgent }; 