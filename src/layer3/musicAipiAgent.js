/**
 * Music AIPI Agent (Layer 3)
 * 
 * This module provides an enhanced process-query tool that can handle all music-related requests,
 * including calling other tools and ensuring Spotify links are used.
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

// Define an empty chat history array if it doesn't exist in the global scope
const chatHistory = [];

/**
 * Register the enhanced process-query tool with the server
 * @param {object} server - The server instance to register tools with
 * @param {object} layer1Client - The Layer 1 client instance (may be null initially)
 * @param {object} layer2Client - The Layer 2 client instance (may be null initially)
 */
function registerMusicAipiAgent(server, layer1Client, layer2Client) {
  logger.info('Registering Music AIPI Agent (Layer 3)...');

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

  // Register our enhanced version of the process-query tool
  server.tool(
    'music-aipi-agent',
    'Process a natural language query and generate a response with music discovery capabilities',
    {
      query: z.string().describe('The user query to process'),
      context: z.string().optional().describe('Additional context information'),
      responseFormat: z.enum(['concise', 'detailed', 'technical', 'simple']).optional().describe('Format of the response')
    },
    async ({ query, context = '', responseFormat = 'detailed' }) => {
      try {
        logger.debug('Processing music query', { queryLength: query.length, responseFormat });
        
        // Initialize MCP client if not already initialized
        if (!mcpClient.initialized) {
          logger.info('Initializing MCP client from music-aipi-agent...');
          await mcpClient.initialize();
        }
        
        // Log the client status
        logger.info('Using MCP client for music-aipi-agent:', {
          layer1ClientAvailable: mcpClient.connected.layer1,
          layer2ClientAvailable: mcpClient.connected.layer2,
          layer3ClientAvailable: mcpClient.connected.layer3
        });
        
        // Determine if this is a music discovery request
        const isMusicDiscovery = await isMusicDiscoveryRequest(query);
        
        if (isMusicDiscovery) {
          logger.debug('Handling as music discovery request');
          return await handleMusicDiscovery(query, mcpClient);
        } else {
          logger.debug('Handling as general query');
          return await handleGeneralQuery(query, context, responseFormat);
        }
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

  logger.info('Music AIPI Agent registered successfully');
}

/**
 * Determine if a query is a music discovery request
 * @param {string} query - The user query
 * @returns {Promise<boolean>} - Whether the query is a music discovery request
 */
async function isMusicDiscoveryRequest(query) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a classifier that determines if a query is related to music discovery. Respond with 'true' or 'false'."
        },
        { 
          role: "user", 
          content: `Is this query related to music discovery, finding songs, artists, or playlists? Query: "${query}"`
        }
      ],
      temperature: 0.1,
      max_tokens: 10
    });
    
    const result = response.choices[0].message.content.trim().toLowerCase();
    return result === 'true';
  } catch (error) {
    logger.error('Error classifying query', { error: error.message });
    // Default to false if classification fails
    return false;
  }
}

/**
 * Handle a music discovery request
 * @param {string} query - The user query
 * @param {object} mcpClient - The MCP client
 * @returns {Promise<object>} - The response
 */
async function handleMusicDiscovery(query, mcpClient) {
  try {
    // Create a call tree for debugging
    const callTree = {
      initialQuery: query,
      timestamp: new Date().toISOString(),
      steps: []
    };
    
    // Add detailed logging about client state during execution
    logger.info('Music discovery request received', { 
      query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
      layer1ClientAvailable: mcpClient.connected.layer1,
      layer2ClientAvailable: mcpClient.connected.layer2
    });
    
    // Add client state to call tree
    callTree.steps.push({
      step: 'initialize',
      clientState: {
        layer1Available: mcpClient.connected.layer1,
        layer2Available: mcpClient.connected.layer2,
        layer3Available: mcpClient.connected.layer3
      },
      timestamp: new Date().toISOString()
    });
    
    // Check if clients are available
    if (!mcpClient.connected.layer1 && !mcpClient.connected.layer2) {
      logger.warn('Neither Layer 1 nor Layer 2 clients are available for music discovery');
      
      // Add client unavailable step to call tree
      callTree.steps.push({
        step: 'client_unavailable',
        error: 'Neither Layer 1 nor Layer 2 clients are available for music discovery',
        timestamp: new Date().toISOString()
      });
      
      // Store the call tree in global scope for debugging
      global.lastCallTree = callTree;
      
      return await handleGeneralQuery(query, 'Note: Music discovery features are limited because the necessary clients are not available.', 'detailed');
    }

    // Determine which tool to use for the music discovery request
    callTree.steps.push({
      step: 'select_tool',
      timestamp: new Date().toISOString()
    });
    
    const toolSelection = await selectMusicDiscoveryTool(query);
    logger.info('Selected tool:', toolSelection);
    
    // Add tool selection to call tree
    callTree.steps[callTree.steps.length - 1].toolSelection = toolSelection;
    
    // Add tool descriptions to call tree for debugging
    if (global.lastToolDescriptions) {
      callTree.toolDescriptions = global.lastToolDescriptions;
    }
    
    if (!toolSelection.toolName) {
      // Add tool selection failure to call tree
      callTree.steps.push({
        step: 'tool_selection_failed',
        timestamp: new Date().toISOString()
      });
      
      // Store the call tree in global scope for debugging
      global.lastCallTree = callTree;
      
      return await handleGeneralQuery(query, '', 'detailed');
    }
    
    const { toolName, args } = toolSelection;
    
    // Call the selected tool
    let toolResult;
    try {
      // Add tool call step to call tree
      callTree.steps.push({
        step: 'call_tool',
        toolName,
        args,
        timestamp: new Date().toISOString()
      });
      
      // Get the layer information from the tool info
      const toolInfo = mcpClient.findTool(toolName);
      if (!toolInfo) {
        const error = `Tool ${toolName} not found in available tools`;
        
        // Add tool not found error to call tree
        callTree.steps[callTree.steps.length - 1].error = error;
        
        // Store the call tree in global scope for debugging
        global.lastCallTree = callTree;
        
        throw new Error(error);
      }
      
      // Add layer info to call tree
      callTree.steps[callTree.steps.length - 1].layer = toolInfo.layer;
      
      logger.info(`Calling ${toolInfo.layer} tool: ${toolName}`, { args });
      toolResult = await mcpClient.callTool(toolName, args);
      logger.info(`${toolName} call successful`);
      
      // Add tool result to call tree
      callTree.steps[callTree.steps.length - 1].result = toolResult;
    } catch (error) {
      logger.error(`Error calling ${toolName}:`, error.message);
      
      // Add error to call tree
      callTree.steps[callTree.steps.length - 1].error = error.message;
      
      // Store the call tree in global scope for debugging
      global.lastCallTree = callTree;
      
      throw error;
    }
    
    // Process the tool result to ensure Spotify links are used
    callTree.steps.push({
      step: 'process_tool_result',
      timestamp: new Date().toISOString()
    });
    
    const processedResult = await processToolResult(toolResult, query);
    
    // Add processed result to call tree
    callTree.steps[callTree.steps.length - 1].processedResult = processedResult;
    
    // Store the complete call tree in global scope for debugging
    global.lastCallTree = callTree;
    
    // Make the call tree available in the response for debugging
    return {
      content: [
        {
          type: "text",
          text: processedResult
        }
      ],
      callTree: callTree
    };
  } catch (error) {
    logger.error('Error handling music discovery', { error: error.message });
    
    // Create a call tree for error case if it doesn't exist
    if (!global.lastCallTree) {
      global.lastCallTree = {
        initialQuery: query,
        timestamp: new Date().toISOString(),
        steps: [
          {
            step: 'error',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          }
        ]
      };
    }
    
    // Provide a more helpful error message
    let errorMessage = `i'm sorry, i encountered an error while discovering music: ${error.message}`;
    
    // If it's a client availability issue, suggest using general music knowledge instead
    if (error.message.includes('client not available') || error.message.includes('tool not found')) {
      errorMessage = "i'm sorry, i'm currently unable to access my music discovery tools. would you like me to tell you about this music based on my general knowledge instead?";
    }
    
    return {
      content: [
        {
          type: "text",
          text: errorMessage
        }
      ],
      isError: true,
      callTree: global.lastCallTree
    };
  }
}

/**
 * Select the appropriate tool for a music discovery request
 * @param {string} query - The user query
 * @returns {Promise<object>} - The selected tool and arguments
 */
async function selectMusicDiscoveryTool(query) {
  try {
    // Fetch available tools from all layers
    const allTools = mcpClient.getAllTools();
    logger.info('Available tools for tool selection:', {
      layer1Count: allTools.layer1?.length || 0,
      layer2Count: allTools.layer2?.length || 0,
      layer3Count: allTools.layer3?.length || 0
    });
    
    // Format tools as JSON for LLM prompting
    const toolsDescription = toolFormatter.formatAllToolsForLLM(allTools, {
      header: "AVAILABLE TOOLS:\n\n"
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: `You are a tool selector for music discovery. Select the most appropriate tool and provide its arguments.
${toolsDescription}

IMPORTANT: Make sure to provide all required arguments for the selected tool.
Analyze the user query carefully to extract the necessary parameters.
If the query doesn't contain enough information for required parameters, make reasonable inferences.

CRITICAL: You MUST use the EXACT parameter names as specified in the tool descriptions.
DO NOT convert camelCase parameter names to snake_case or any other format.
For example, if a parameter is named "lowerCapped", you must use "lowerCapped" and NOT "lower_capped".

If you're uncertain which tool will best answer the query, recommend using the "parallel_tools" action
in the processToolResult function that will be called next, rather than picking just one tool here.

Respond in JSON format with the following structure:
{
  "toolName": "name-of-selected-tool",
  "args": {
    "param1": "value1",
    "param2": "value2"
  }
}`
        },
        { 
          role: "user", 
          content: `Select the most appropriate tool for this query: "${query}"`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    // Validate that the selected tool exists
    const toolInfo = mcpClient.findTool(result.toolName);
    if (!toolInfo) {
      logger.warn(`Selected tool ${result.toolName} not found in available tools`);
      return { toolName: null };
    }
    
    // Add the layer information from toolInfo
    result.layer = toolInfo.layer;
    
    // Extract required parameters from the tool schema
    const requiredParams = [];
    if (toolInfo.tool._schema && toolInfo.tool._schema.arguments && toolInfo.tool._schema.arguments.shape) {
      const params = toolInfo.tool._schema.arguments.shape;
      Object.keys(params).forEach(paramName => {
        const param = params[paramName];
        if (!param.isOptional) {
          requiredParams.push(paramName);
        }
      });
    }
    
    // Check if all required parameters are provided
    const missingParams = requiredParams.filter(param => !result.args[param]);
    if (missingParams.length > 0) {
      logger.warn(`Missing required parameters for ${result.toolName}: ${missingParams.join(', ')}`);
      
      // Try to extract missing parameters from the query
      missingParams.forEach(param => {
        // Extract artist name
        if (param === 'artist' || param === 'artistName') {
          const artistMatch = query.match(/similar to (the artist )?([^?.,]+)/i);
          if (artistMatch && artistMatch[2]) {
            result.args[param] = artistMatch[2].trim();
            logger.info(`Extracted ${param} from query: ${result.args[param]}`);
          }
        }
        
        // Extract track name
        if (param === 'track' || param === 'trackName') {
          const trackMatch = query.match(/song|track ([^?.,]+) by/i);
          if (trackMatch && trackMatch[1]) {
            result.args[param] = trackMatch[1].trim();
            logger.info(`Extracted ${param} from query: ${result.args[param]}`);
          }
        }
      });
      
      // Check again if all required parameters are provided
      const stillMissingParams = requiredParams.filter(param => !result.args[param]);
      if (stillMissingParams.length > 0) {
        logger.warn(`Still missing required parameters after extraction: ${stillMissingParams.join(', ')}`);
        return { toolName: null };
      }
    }
    
    logger.info('Final tool selection:', { 
      toolName: result.toolName, 
      layer: result.layer, 
      args: result.args 
    });
    
    return result;
  } catch (error) {
    logger.error('Error selecting music discovery tool', { error: error.message });
    return { toolName: null };
  }
}

/**
 * Process a tool result to ensure Spotify links are used
 * @param {object} toolResult - The result from the tool
 * @param {string} query - The original user query
 * @returns {Promise<string>} - The processed result
 */
async function processToolResult(toolResult, query) {
  try {
    // Extract the content from the tool result
    let resultContent = '';
    
    if (toolResult && toolResult.content && Array.isArray(toolResult.content)) {
      toolResult.content.forEach(item => {
        if (item.type === 'text') {
          resultContent += item.text;
        }
      });
    } else if (typeof toolResult === 'string') {
      resultContent = toolResult;
    }
    
    // Create a context string that includes previous interactions
    // This allows the process-query tool to maintain context between interactions
    let contextString = '';
    if (chatHistory && chatHistory.length > 0) {
      // Include up to the last 5 interactions (10 messages) for context
      const relevantHistory = chatHistory.slice(-10);
      contextString = relevantHistory.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n\n');
      
      contextString = `Previous conversation:\n${contextString}\n\n`;
    }
    
    // Fetch available tools from all layers
    const allTools = mcpClient.getAllTools();
    logger.info('Available tools for conversation loop:', {
      layer1Count: allTools.layer1?.length || 0,
      layer2Count: allTools.layer2?.length || 0,
      layer3Count: allTools.layer3?.length || 0
    });
    
    // Format tools as JSON for LLM prompting
    const toolsDescription = toolFormatter.formatAllToolsForLLM(allTools, {
      header: "Available tools:\n"
    });
    
    // Implement a conversation loop with the LLM
    const messages = [
      { 
        role: "system", 
        content: `You are a helpful music discovery assistant. Your task is to process music discovery results and present them to the user.

Important guidelines:
1. Format the response in lowercase to match the aesthetic of the music-aipi system
2. Make the response conversational and engaging
3. Include ALL relevant information - do not truncate or summarize the results
4. You have access to tools that can help you get information. Use them when needed.
5. DO NOT make up Spotify links. If you need a Spotify link, use an appropriate tool.

CRITICAL: When using tools, you MUST use the EXACT parameter names as specified in the tool descriptions.
DO NOT convert camelCase parameter names to snake_case or any other format.
For example, if a parameter is named "lowerCapped", you must use "lowerCapped" and NOT "lower_capped".
Do not mix up the tool parameters. For example, one may be 'artist' or 'artistName' or 'artist_name' - but the tools will not work if you get it wrong. Use what is specified in the tool descriptions.

IMPORTANT: If you're uncertain which tool will have the best data, use the "parallel_tools" action to query multiple tools simultaneously. This is especially useful for:
- Finding information across different music services
- Getting both artist information and track recommendations
- Comparing results from different discovery methods
- Ensuring comprehensive coverage of the user's request

RESPONSE FORMAT:
You must respond in JSON format with one of these structures:

1. To use a single tool:
{
  "action": "tool",
  "tool_name": "name-of-tool",
  "tool_args": {
    "param1": "value1",
    "param2": "value2"
  }
}

2. To use multiple tools in parallel:
{
  "action": "parallel_tools",
  "tools": [
    {
      "tool_name": "name-of-tool-1",
      "tool_args": {
        "param1": "value1",
        "param2": "value2"
      }
    },
    {
      "tool_name": "name-of-tool-2",
      "tool_args": {
        "param1": "value1",
        "param2": "value2"
      }
    }
  ]
}

3. To provide a final response:
{
  "action": "output",
  "text": "your final response text here"
}

${toolsDescription}

IMPORTANT: You are responsible for extracting all necessary parameters from the user query. Analyze the query carefully to identify artists, tracks, genres, or any other relevant information needed for tool calls.

Original user query: "${query}"`
      },
      { 
        role: "user", 
        content: `User query: "${query}"
Raw music discovery results:
${resultContent}

Process this data and provide a helpful response. Use tools as needed to get Spotify links or additional information. Make sure to extract all necessary parameters from the user query.`
      }
    ];
    
    // Maximum number of conversation turns
    const maxTurns = 5;
    let currentTurn = 0;
    let finalResponse = null;
    
    while (currentTurn < maxTurns && !finalResponse) {
      currentTurn++;
      logger.info(`Processing turn ${currentTurn} of conversation loop`);
      
      // Call the LLM
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });
      
      const assistantMessage = response.choices[0].message.content;
      
      try {
        // Parse the JSON response
        const parsedResponse = JSON.parse(assistantMessage);
        
        // Check if this is a final response
        if (parsedResponse.action === 'output') {
          finalResponse = parsedResponse.text;
          logger.info('Final response received');
          break;
        }
        
        // Check if this is a single tool call
        if (parsedResponse.action === 'tool') {
          const toolName = parsedResponse.tool_name;
          const toolArgs = parsedResponse.tool_args || {};
          
          if (toolName) {
            logger.info(`Tool call requested: ${toolName}`, toolArgs);
            
            // Find the tool in available tools
            const toolInfo = mcpClient.findTool(toolName);
            
            if (toolInfo) {
              logger.info(`Found tool ${toolName} in ${toolInfo.layer}`);
              
              // Validate required parameters
              let missingParams = [];
              if (toolInfo.tool._schema && toolInfo.tool._schema.arguments && toolInfo.tool._schema.arguments.shape) {
                const params = toolInfo.tool._schema.arguments.shape;
                Object.keys(params).forEach(paramName => {
                  const param = params[paramName];
                  if (!param.isOptional && !toolArgs[paramName]) {
                    missingParams.push(paramName);
                  }
                });
              }
              
              if (missingParams.length > 0) {
                logger.warn(`Missing required parameters for ${toolName}: ${missingParams.join(', ')}`);
                
                messages.push({ role: "assistant", content: assistantMessage });
                messages.push({ 
                  role: "user", 
                  content: `Error: Missing required parameters for tool ${toolName}: ${missingParams.join(', ')}. Please extract these parameters from the user query: "${query}" and provide all required parameters.`
                });
                continue;
              }
              
              try {
                // Call the tool
                const toolResult = await mcpClient.callTool(toolName, toolArgs);
                let toolResponse = '';
                
                if (toolResult && toolResult.content && Array.isArray(toolResult.content)) {
                  toolResult.content.forEach(item => {
                    if (item.type === 'text') {
                      toolResponse += item.text;
                    }
                  });
                }
                
                // Add the tool response to the conversation
                messages.push({ role: "assistant", content: assistantMessage });
                messages.push({ 
                  role: "user", 
                  content: `Tool response for ${toolName}:\n${toolResponse}\n\nContinue processing the results.`
                });
              } catch (error) {
                logger.error(`Error calling tool ${toolName}:`, error.message);
                
                // Inform the LLM about the error
                messages.push({ role: "assistant", content: assistantMessage });
                messages.push({ 
                  role: "user", 
                  content: `Error calling tool ${toolName}: ${error.message}\n\nPlease try again with different parameters or try a different approach. Original user query: "${query}"`
                });
              }
            } else {
              logger.warn(`Tool ${toolName} not found in available tools`);
              
              messages.push({ role: "assistant", content: assistantMessage });
              messages.push({ 
                role: "user", 
                content: `Error: Tool "${toolName}" not found in available tools. Please use one of the available tools or provide a final response.`
              });
            }
          } else {
            logger.warn('No tool name provided in tool call');
            
            messages.push({ role: "assistant", content: assistantMessage });
            messages.push({ 
              role: "user", 
              content: `Error: No tool name provided. Please specify a tool name or provide a final response.`
            });
          }
        }
        // Check if this is a parallel tool call
        else if (parsedResponse.action === 'parallel_tools') {
          const tools = parsedResponse.tools || [];
          
          if (tools.length > 0) {
            logger.info(`Parallel tool calls requested: ${tools.length} tools`);
            
            // Validate all tools first
            const validTools = [];
            const invalidTools = [];
            const missingParamsTools = [];
            
            for (const toolRequest of tools) {
              const toolName = toolRequest.tool_name;
              const toolArgs = toolRequest.tool_args || {};
              const toolInfo = mcpClient.findTool(toolName);
              
              if (!toolInfo) {
                invalidTools.push(toolName);
                continue;
              }
              
              // Validate required parameters
              let missingParams = [];
              if (toolInfo.tool._schema && toolInfo.tool._schema.arguments && toolInfo.tool._schema.arguments.shape) {
                const params = toolInfo.tool._schema.arguments.shape;
                Object.keys(params).forEach(paramName => {
                  const param = params[paramName];
                  if (!param.isOptional && !toolArgs[paramName]) {
                    missingParams.push(paramName);
                  }
                });
              }
              
              if (missingParams.length > 0) {
                missingParamsTools.push({
                  tool_name: toolName,
                  missing: missingParams
                });
              } else {
                validTools.push({
                  ...toolRequest,
                  layer: toolInfo.layer
                });
              }
            }
            
            if (invalidTools.length > 0 || missingParamsTools.length > 0) {
              let errorMessage = '';
              
              if (invalidTools.length > 0) {
                errorMessage += `The following tools were not found: ${invalidTools.join(', ')}. `;
              }
              
              if (missingParamsTools.length > 0) {
                errorMessage += 'The following tools have missing required parameters: ';
                missingParamsTools.forEach(tool => {
                  errorMessage += `${tool.tool_name} (missing: ${tool.missing.join(', ')}), `;
                });
                errorMessage = errorMessage.slice(0, -2) + '.';
              }
              
              messages.push({ role: "assistant", content: assistantMessage });
              messages.push({ 
                role: "user", 
                content: `Error: ${errorMessage} Please extract these parameters from the user query: "${query}" and provide all required parameters, or provide a final response.`
              });
              continue;
            }
            
            // Execute all valid tools in parallel
            const toolPromises = validTools.map(async (toolRequest) => {
              const { tool_name, tool_args, layer } = toolRequest;
              
              try {
                logger.info(`Calling tool ${tool_name} from ${layer}`, tool_args);
                const result = await mcpClient.callTool(tool_name, tool_args);
                
                let toolResponse = '';
                if (result && result.content && Array.isArray(result.content)) {
                  result.content.forEach(item => {
                    if (item.type === 'text') {
                      toolResponse += item.text;
                    }
                  });
                }
                
                return {
                  tool_name,
                  success: true,
                  response: toolResponse
                };
              } catch (error) {
                logger.error(`Error calling tool ${tool_name}:`, error.message);
                
                return {
                  tool_name,
                  success: false,
                  error: error.message
                };
              }
            });
            
            // Wait for all tool calls to complete
            const toolResults = await Promise.all(toolPromises);
            
            // Add all tool responses to the conversation in sequence
            messages.push({ role: "assistant", content: assistantMessage });
            
            for (const result of toolResults) {
              if (result.success) {
                messages.push({ 
                  role: "user", 
                  content: `Tool response for ${result.tool_name}:\n${result.response}`
                });
              } else {
                messages.push({ 
                  role: "user", 
                  content: `Error calling tool ${result.tool_name}: ${result.error}`
                });
              }
            }
            
            // Add a final message to continue processing
            messages.push({ 
              role: "user", 
              content: `All tool responses have been provided. Please continue processing the results.`
            });
          } else {
            logger.warn('No tools provided in parallel_tools action');
            
            messages.push({ role: "assistant", content: assistantMessage });
            messages.push({ 
              role: "user", 
              content: `Error: No tools provided in parallel_tools action. Please specify at least one tool or provide a final response.`
            });
          }
        } else if (parsedResponse.action !== 'output') {
          // Invalid action
          logger.warn(`Invalid action: ${parsedResponse.action}`);
          
          messages.push({ role: "assistant", content: assistantMessage });
          messages.push({ 
            role: "user", 
            content: `Error: Invalid action "${parsedResponse.action}". Please use "tool", "parallel_tools", or "output".`
          });
        }
      } catch (parseError) {
        logger.error('Error parsing JSON response:', parseError.message);
        
        messages.push({ role: "assistant", content: assistantMessage });
        messages.push({ 
          role: "user", 
          content: `Error: Could not parse your response as JSON. Please provide a valid JSON response with either a tool call or final output.`
        });
      }
    }
    
    // If we reached max turns without a final response, use the last message or raw results
    if (!finalResponse) {
      logger.warn(`Reached maximum turns (${maxTurns}) without a final response`);
      finalResponse = `here's what i found for "${query}": ${resultContent}`;
    }
    
    return finalResponse;
  } catch (error) {
    logger.error('Error processing tool result', { error: error.message, stack: error.stack });
    
    // Make sure resultContent is defined in this scope
    let resultContent = '';
    if (toolResult && toolResult.content && Array.isArray(toolResult.content)) {
      toolResult.content.forEach(item => {
        if (item.type === 'text') {
          resultContent += item.text;
        }
      });
    } else if (typeof toolResult === 'string') {
      resultContent = toolResult;
    }
    
    // Final fallback - return the raw results instead of a summary
    return `here's what i found for "${query}": ${resultContent}`;
  }
}

/**
 * Handle a general query
 * @param {string} query - The user query
 * @param {string} context - Additional context
 * @param {string} responseFormat - Format of the response
 * @returns {Promise<object>} - The response
 */
async function handleGeneralQuery(query, context, responseFormat) {
  try {
    // Construct system prompt based on response format
    let systemPrompt;
    switch (responseFormat) {
      case 'concise':
        systemPrompt = "You are a helpful music assistant that provides concise, to-the-point answers.";
        break;
      case 'detailed':
        systemPrompt = "You are a helpful music assistant that provides detailed, comprehensive answers.";
        break;
      case 'technical':
        systemPrompt = "You are a helpful music assistant that provides technical, precise answers with relevant details.";
        break;
      case 'simple':
        systemPrompt = "You are a helpful music assistant that provides simple, easy-to-understand answers without technical jargon.";
        break;
      default:
        systemPrompt = "You are a helpful music assistant.";
    }
    
    // Add lowercase aesthetic instruction
    systemPrompt += " Your responses should be in lowercase to match the aesthetic of the music-aipi system.";
    
    // Prepare user prompt with context if provided
    const userPrompt = context 
      ? `Context information:\n${context}\n\nQuery: ${query}`
      : query;
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
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