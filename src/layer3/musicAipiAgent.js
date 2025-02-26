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
        // Parse conversation history
        let history = [];
        try {
          history = conversationHistory ? JSON.parse(conversationHistory) : [];
        } catch (error) {
          logger.warn('Failed to parse conversation history', { error: error.message });
        }

        // Get available tools
        const tools = {
          layer1: await clients.layer1?.listTools().catch(() => ({ tools: [] })) || { tools: [] },
          layer2: await clients.layer2?.listTools().catch(() => ({ tools: [] })) || { tools: [] }
        };

        // Log tools for debugging
        logger.info(`Tools from layer1: ${tools.layer1.tools?.length || 0} tools`);
        logger.info(`Tools from layer2: ${tools.layer2.tools?.length || 0} tools`);

        const normalizedTools = {
          layer1: tools.layer1.tools || [],
          layer2: tools.layer2.tools || []
        };

        // Check if we have any tools
        const totalTools = Object.values(normalizedTools).reduce((sum, arr) => sum + arr.length, 0);
        if (totalTools === 0) {
          logger.warn('No tools available from any layer');
          return {
            content: [
              {
                type: "text",
                text: "i'm sorry, i'm still initializing and don't have access to any tools yet. please try again in a moment."
              }
            ],
            isError: true,
            unready: true
          };
        }

        const maxTurns = 10;

        // Extract userId from context
        const auth = context.split('\n')[0];
        const [_, authValue] = auth ? auth.split('Bearer ') : [];
        const [userId, accessToken, refreshToken, expirationTime] = authValue ? authValue.split(':') : [];

        if (!userId || !accessToken || !refreshToken || !expirationTime) {
          return {
            content: [{
              type: "text",
              text: "i'm sorry, i need authentication to access spotify. please log in first."
            }],
            isError: true
          };
        }

        logger.debug('Extracted auth info:', { userId, tokenStart: accessToken.substring(0, 10) + '...' });

        // Start agent loop
        const agentMessages = [
          {
            role: 'system',
            content: `you are music-aipi, a helpful assistant for music discovery and control. you have access to various tools to help fulfill user requests.

CAPABILITIES:
- you can plan and execute multiple actions in parallel
- you can use tool results to plan additional actions - you get ${maxTurns} turns maximum to complete a request
- you can generate natural language responses

USER CONTEXT:
- spotify user id: ${userId}
- spotify access token: ${accessToken}
- when calling tools that require userId or accessToken, use these values

RESPONSE FORMATS:

1. When you need to execute actions:
{
  "type": "actions",
  "actions": [
    {
      "tool": "tool-name",
      "args": { "param1": "value1" }
    },
    ...more actions...
  ]
}

2. When you want to respond to the user:
{
  "type": "response",
  "text": "your response in lowercase"
}

RULES:
- all responses must be valid JSON
- text responses must be lowercase, EXCEPT for proper nouns (e.g. artist names, album titles, song names, etc.) which should be capitalized
- plan efficient parallel actions when possible
- use exact parameter names from tool descriptions - for example, if a tool requires "artist", do not use "artist_name"
- ALWAYS provide required parameters for tools. for example, search-spotify requires "query" and "types" (either a string like "track" or an array like ["track", "artist"])
- don't make up or guess parameter values
- you should try to return Spotify artist/track/etc links - real ones from an API
- follow through till the end of a request. it may take multiple steps. you may have to search for a song and then play it, through separate APIs. e.g. search-spotify -> start-resume-playback

AVAILABLE TOOLS:
${toolFormatter.formatAllToolsForLLM(normalizedTools)}`
          }
        ];

        // Add relevant history
        if (history.length > 0) {
          history.forEach(m => {
            agentMessages.push({
              role: m.role,
              content: m.content
            });
          });
        }

        // Add current query with context
        agentMessages.push({
          role: 'user',
          content: `${context ? context + "\n" : ""}${query}`
        });

        let finalResponse = null;
        let turn = 0;

        while (!finalResponse && turn < maxTurns) {
          turn++;
          logger.info(`Agent turn ${turn}/${maxTurns}`);

          const llmResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: agentMessages,
            temperature: 0.7,
            response_format: { type: "json_object" }
          });

          // Add assistant's response to history
          agentMessages.push({
            role: 'assistant',
            content: llmResponse.choices[0].message.content
          });

          const agentAction = JSON.parse(llmResponse.choices[0].message.content);

          if (agentAction.type === 'response') {
            finalResponse = {
              content: [{
                type: 'text',
                text: agentAction.text
              }]
            };
          } else if (agentAction.type === 'actions') {
            // Execute all actions in parallel
            const actionResults = await Promise.all(
              agentAction.actions.map(async action => {
                try {
                  const tool = findTool(action.tool, normalizedTools);
                  if (!tool) {
                    return `Error: Tool ${action.tool} not found`;
                  }

                  const client = clients[tool.layer];
                  if (!client) {
                    return `Error: No client for ${tool.layer}`;
                  }

                  // Inject userId into tool arguments if the tool requires it
                  const toolSchema = tool.inputSchema || {};
                  logger.debug('Raw tool schema:', toolSchema);
                  
                  // Extract required fields from JSON Schema
                  const requiredFields = toolSchema.required || [];
                  const needsUserId = requiredFields.includes('userId');
                  const needsToken = requiredFields.includes('accessToken');

                  logger.debug('Tool parameters:', {
                    tool: action.tool,
                    schema: toolSchema,
                    requiredFields,
                    needsUserId,
                    needsToken,
                    originalArgs: action.args
                  });

                  const args = {
                    ...action.args,
                    ...(needsUserId && { userId }),
                    ...(needsToken && { accessToken })
                  };

                  logger.debug('Final tool arguments:', {
                    tool: action.tool,
                    args,
                    userId
                  });

                  const result = await client.callTool({
                    name: action.tool,
                    arguments: args
                  });

                  return {
                    tool: action.tool,
                    result: result
                  };
                } catch (error) {
                  logger.error(`Error executing ${action.tool}:`, error);
                  return `Error executing ${action.tool}: ${error.message}`;
                }
              })
            );

            // Add results to conversation
            agentMessages.push({
              role: 'system',
              content: `Action results:\n${JSON.stringify(actionResults, null, 2)}`
            });
          }
        }

        return finalResponse || {
          content: [{
            type: 'text',
            text: "i'm sorry, i wasn't able to complete the request in the allowed number of turns. please try rephrasing your request."
          }]
        };

      } catch (error) {
        logger.error('Error in music-aipi-agent:', error);
        return {
          content: [{
            type: 'text',
            text: "i'm sorry, i encountered an error while processing your request. please try again in a moment."
          }]
        };
      }
    }
  );

  logger.info('Generic AIPI Agent registered successfully');
}

/**
 * Find a tool by name in the available tools
 */
function findTool(toolName, tools) {
  const layer1Tool = tools.layer1?.find(t => t.name === toolName);
  if (layer1Tool) {
    logger.debug('Found tool in layer1:', layer1Tool);
    return { 
      ...layer1Tool,
      layer: 'layer1',
      parameters: layer1Tool.parameters || {}
    };
  }
  
  const layer2Tool = tools.layer2?.find(t => t.name === toolName);
  if (layer2Tool) {
    logger.debug('Found tool in layer2:', layer2Tool);
    return { 
      ...layer2Tool,
      layer: 'layer2',
      parameters: layer2Tool.parameters || {}
    };
  }
  
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

export { registerMusicAipiAgent }; 