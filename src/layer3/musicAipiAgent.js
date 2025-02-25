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
 * @param {object} clients - The connected layer clients
 */
function registerMusicAipiAgent(server, clients) {
  logger.info('Registering Generic AIPI Agent (Layer 3)...');

  // Register the agent immediately
  server.tool(
    'music-aipi-agent',
    'Generic conversational agent for music discovery and control',
    {
      query: z.string().describe('The user query to process'),
      context: z.string().optional().describe('Additional context information'),
      responseFormat: z.enum(['concise', 'detailed', 'technical', 'simple']).optional().describe('Format of the response'),
      conversationHistory: z.string().optional().describe('JSON string of conversation history from the front end')
    },
    async ({ query, context = '', responseFormat = 'detailed', conversationHistory = '' }) => {
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
        
        // Get tools from all layers using passed in clients
        const tools = {
          layer1: await clients.layer1?.listTools().catch(() => ({ tools: [] })) || { tools: [] },
          layer2: await clients.layer2?.listTools().catch(() => ({ tools: [] })) || { tools: [] }
        };

        // Log tools for debugging
        logger.info(`Tools from layer1: ${tools.layer1.tools?.length || 0} tools`);
        logger.info(`Tools from layer2: ${tools.layer2.tools?.length || 0} tools`);

        // Normalize tools format
        const normalizedTools = {
          layer1: tools.layer1.tools || [],
          layer2: tools.layer2.tools || []
        };

        // Check if we have any tools at all
        const totalTools = Object.values(normalizedTools).reduce((sum, arr) => sum + arr.length, 0);
        if (totalTools === 0) {
          logger.warn('No tools available from any layer');
          return {
            content: [
              {
                type: "text",
                text: "i'm sorry, i'm still initializing and don't have access to any tools yet. please try again in a moment."
              }
            ]
          };
        }
        
        // Handle the query using available tools
        return await handleQuery({ 
          query, 
          context, 
          responseFormat, 
          chatHistory: parsedHistory,
          tools: normalizedTools,
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
  const { query, context = '', responseFormat = 'detailed', chatHistory = [], tools, clients } = params;

  try {
    // Select appropriate tool for the query
    const { toolName, toolArgs } = await selectTool(query, tools);
    
    // If no tool was selected, handle as a general query
    if (!toolName) {
      return await handleGeneralQuery(query, context, responseFormat, chatHistory, tools);
    }
    
    // Find which layer has this tool
    const tool = findTool(toolName, tools);
    if (!tool) {
      throw new Error(`Selected tool ${toolName} not found in available tools`);
    }
    
    // Call the tool using the appropriate client
    let toolResult;
    if (tool.layer === 'layer1' && clients.layer1) {
      toolResult = await clients.layer1.callTool({
        name: toolName,
        arguments: toolArgs
      });
    } else if (tool.layer === 'layer2' && clients.layer2) {
      toolResult = await clients.layer2.callTool({
        name: toolName,
        arguments: toolArgs
      });
    } else {
      throw new Error(`No client available for ${tool.layer}`);
    }
    
    // Process the tool result
    const processedResult = await processToolResult({
      toolName,
      toolResult,
      chatHistory,
      tools,
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
 * Find a tool by name in the available tools
 */
function findTool(toolName, tools) {
  // First check Layer 1
  const layer1Tool = tools.layer1?.find(t => t.name === toolName);
  if (layer1Tool) return { ...layer1Tool, layer: 'layer1' };
  
  // Then Layer 2
  const layer2Tool = tools.layer2?.find(t => t.name === toolName);
  if (layer2Tool) return { ...layer2Tool, layer: 'layer2' };
  
  return null;
}

/**
 * Format tools for LLM consumption
 */
function formatToolsForLLM(tools) {
  let formatted = "Available tools:\n\n";
  
  // Combine and format all tools
  const allTools = [
    ...(tools.layer1 || []),
    ...(tools.layer2 || []),
    ...(tools.layer3 || [])
  ];
  
  allTools.forEach(tool => {
    formatted += `Tool: ${tool.name}\n`;
    formatted += `Description: ${tool.description}\n`;
    
    if (tool.parameters) {
      formatted += "Parameters:\n";
      Object.entries(tool.parameters).forEach(([name, param]) => {
        formatted += `  - ${name}: ${param.type}${param.optional ? ' (optional)' : ''}\n`;
        if (param.description) formatted += `    Description: ${param.description}\n`;
      });
    }
    formatted += "\n";
  });
  
  return formatted;
}

/**
 * Select the appropriate tool for a query
 */
async function selectTool(query, tools) {
  try {
    // Format tools for LLM
    const toolsFormatted = formatToolsForLLM(tools);
    
    // Create messages array for LLM
    const messages = [
      {
        role: 'system',
        content: `you are a tool selector for a music interface. your task is to analyze a user query and select the most appropriate tool to handle it.

IMPORTANT INSTRUCTIONS:
1. select ONLY ONE tool that best matches the user's query and intent
2. return your response in JSON format with 'toolName' and 'toolArgs' fields
3. for 'toolArgs', include ONLY the parameters required by the selected tool
4. use EXACT parameter names as specified in the tool descriptions
5. extract all necessary information from the user query to fill the tool parameters
6. if a required parameter is missing from the query, return null for toolName
7. if the query doesn't seem to require a specific tool, return null for toolName
8. do not make up or guess parameter values - if you're not sure, return null

${toolsFormatted}

User query: "${query}"`
      }
    ];
    
    // Call LLM to select tool
    const llmResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
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
    const toolInfo = findTool(toolName, tools);
    
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
  const { toolName, toolResult, chatHistory, tools, responseFormat = 'detailed' } = params;
  
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
    const toolsFormatted = formatToolsForLLM(tools);
    
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
      model: "gpt-4",
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
async function handleGeneralQuery(query, context, responseFormat, chatHistory, tools) {
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
    const toolsFormatted = formatToolsForLLM(tools);
    
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
      model: "gpt-4",
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