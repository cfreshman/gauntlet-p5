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
import { ThinkingSendClient } from '../utils/thinking-client.js';

// Lazy OpenAI client initialization
let openai = null;
const getOpenAI = () => {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
};

// Map to store thinking clients by session ID
const thinkingClients = new Map();

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
      conversationHistory: z.string().optional().describe('JSON string of conversation history from the front end'),
      sessionId: z.string().describe('Session ID for thinking events')
    },
    async ({ query, context = '', responseFormat = 'detailed', conversationHistory = '', sessionId }) => {
      try {
        // Create thinking client for this session if it doesn't exist
        if (!thinkingClients.has(sessionId)) {
          const thinkingClient = new ThinkingSendClient();
          await thinkingClient.connect(sessionId);
          thinkingClients.set(sessionId, thinkingClient);
        }

        const thinkingClient = thinkingClients.get(sessionId);

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

        const maxTurns = 20;

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
            content: `you are music-AIPI
you have access to multiple layers of tools. Spotify, Last.fm, and others
do not respond to the user until you have a final response with everything they asked for

CAPABILITIES:
- you can execute multiple actions in parallel per turn
- you can use action results on later turns
- you get ${maxTurns} turns (not actions) maximum to complete a request

USER CONTEXT:
- spotify userId and accesToken parameters will be included automatically, you don't need to include them in your response

RESPONSE FORMATS:

1. when you need to execute actions:
{
  "type": "actions",
  "thinking": "your thinking about the actions you'll take - this will be shown to the user, don't reveal errors or debug info",
  "actions": [
    {
      "tool": "name",
      "args": { "param": value }
    },
    ... more actions ...
  ],
  "next_model": "model_name"
}

2. when you want to return a final response to the user:
{
  "type": "response",
  "text": "your final response to the user's query"
}

MODEL SELECTION:
For next_model, choose one of:
- "gpt-4o-mini": For simple follow-ups, basic queries, or quick responses
- "gpt-4o": For standard tasks, normal reasoning, or most music operations
- "o3-mini": For complex analysis, critical accuracy, deep music understanding, or processing search results

Always select the simplest model that can adequately handle the expected next task.

all responses must be valid JSON

AVAILABLE TOOLS:
${toolFormatter.formatAllToolsForLLM(normalizedTools)}

TIPS:
- the user expects all final responses to have Spotify content, not Last.fm, if any
- users want like 30 songs on new playlists
- in general, when doing something, think "would this make the human happy"
- be creative
- you're able to recover from most errors without telling the user. there are many workarounds or resolutions you can try
- don't add songs to playlists you didn't create - tell the user you're unable to do that if they ask
- if you create a new playlist with too few songs i will kill you. if you don't have enough songs (30+) go back for more. try different tool paths
- Last.fm and Spotify have different resource IDs. you have to convert between them
- AGAIN, IF YOU GET ERRORS, DON'T TELL THE USER. DON'T REVEAL IT IN YOUR THINKING. TRY A DIFFERENT WAY
- make sure you actually add the songs to the playlist
- when going for similarity, don't reuse the source songs in the output
- when you receive many results for song searches or whatever, YOU SHOULD CONTINUE TO USE ALL OF THEM. more songs is better for the human. e.g. use ALL of the artists top songs. just make sure to shuffle artist songs together to avoid runs of the same artist within a playlist (when creating a mixed playlist)
- MAKE SURE TO CONVERT LASTFM TRACKS TO SPOTIFY TRACKS BEFORE ADDING URIS
- if you don't have enough songs, try getting top tags for the source songs and searching for tracks/artists/albums by those tags
- if you have enough tracks (over 30), you can vary which tracks you select so you don't always pick the same tracks per artist or whatever
- use Last.fm tag search to your advantage
- be creative with naming
- be creative with song ordering. if you put a playlist in order by artist I WILL KILL YOU
- use markdown responses. don't return naked links
- not all tags are genres, not all are moods, etc. you may need to request more tags and filter down
- while it's nice to return links, remember that you can queue or create a playlist for the user too. if they want that. not a text-based response, i mean using actual tools
- prefer searching a user's recent playlists and reading those tracks over just their recent listening history. if you're unsure which playlists to use, you can offer them selection from their playlists (by fetching first)
- AGAIN, TO PROVIDE RECS BASED ON A USER'S LISTENING PREFERENCES, DO NOT ONLY USE RECENT HISTORY. IT IS LIKELY INACCURATE ORR INCOMPLETE
- if the user asks for recs and you just look at their recent history I WILL KILL YOU
- DO NOT MAKE UP SONG LISTS OR LINKS OR URIS. use the available query/discovery/utility tools
- if you think you need more thinking power to complete the current task, just skip the turn by returning an empty actions array
- the currently playing track shouldn't factor into recommendations unless the user asks for it
- you can't understand the user's music just from their playlist titles. you need to actually inspect the tracks and get track tags, etc
- if the user asks what you can do, talk in broad strokes. don't return specific tools and completely avoid internal utilities
- current playlist means the active playback on spotify
- remember to use data from previous turns - as this gets more complex, you may need a smarter model
- remember you can search for multiple tags or whatever and combine results
- don't tell the user to "enjoy listening!" after returning a plain list of content. you can suggest adding to queue or playlist
- put "(mAIPI)" in any playlist names you create so you can differentiate these and ignore them when selecting from user playlists
- DO NOT EVEN CONSIDER (mAIPI) PLAYLISTS TO BE THE USER'S PLAYLISTS
- again, when searching for similar/top items, vary which items you use to give variation to the results

YOUR MAIN TASK IN THE FIRST TURN IS TO CREATE A PLAN ON HOW TO SATISFY THE USER REQUEST (unless the user is just chatting)
COMPLETE YOUR GOAL. DO NOT RETURN PARTIAL RESULTS. e.g. A PLAYLIST MUST HAVE ALL 30+ SONGS ADDED
DON'T MAKE STUFF UP. IF YOU CAN'T DO SOMETHING, SAY SO
BE CREATIVE. WHEN NAMING THINGS, OR JUST ALL THE TIME. i don't want dull playlist names or whatever else
**FINAL WORD: DO THINGS THE HUMAN WILL LIKE. AND BE CONCISE**`
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
          content: query,
        });

        let finalResponse = null;
        let turn = 0;
        let currentModel = "gpt-4o"; // Default for first turn
        let wasDefaultModel = true;

        while (!finalResponse && turn < maxTurns) {
          turn++;
          logger.info(`Agent turn ${turn}/${maxTurns} using model ${currentModel} ${wasDefaultModel ? '(default)' : '(selected)'}`);

          let llmResponse;
          try {
            llmResponse = await getOpenAI().chat.completions.create({
              model: currentModel,
              messages: agentMessages,
              response_format: { type: "json_object" }
            });
          } catch (error) {
            logger.error('OpenAI API error:', error);
            return {
              type: 'actions',
              thinking: "i'm sorry, i encountered an error while thinking about your request. please wait a moment.",
              actions: [],
              next_model: "gpt-4o"
            };
          }

          // Add assistant's response to history
          agentMessages.push({
            role: 'assistant',
            content: llmResponse.choices[0].message.content
          });

          const agentAction = JSON.parse(llmResponse.choices[0].message.content);

          // Update model for next turn if specified
          currentModel = agentAction.next_model || "gpt-4o";
          wasDefaultModel = !agentAction.next_model;

          if (agentAction.type === 'response') {
            finalResponse = {
              content: [{
                type: 'text',
                text: agentAction.text
              }]
            };
          } else if (agentAction.type === 'actions') {
            // Emit thinking event
            if (thinkingClient.isConnected()) {
              const thinkingMessage = {
                type: 'thinking',
                content: [{
                  type: 'text',
                  text: agentAction.thinking || `working on ${agentAction.actions.length} actions`
                }]
              };
              thinkingClient.send(thinkingMessage);
            }

            // Execute all actions in parallel
            const actionResults = await Promise.all(
              agentAction.actions.map(async action => {
                try {
                  const tool = findTool(action.tool, normalizedTools);
                  if (!tool) {
                    return {
                      error: true,
                      message: `Tool ${action.tool} not found`,
                      availableTools: Object.entries(normalizedTools).map(([layer, tools]) => 
                        tools.map(t => t.name)
                      ).flat()
                    };
                  }

                  const client = clients[tool.layer];
                  if (!client) {
                    return {
                      error: true, 
                      message: `No client for ${tool.layer}`,
                      availableLayers: Object.keys(clients)
                    };
                  }

                  // Extract schema info
                  const toolSchema = tool.inputSchema || {};
                  const requiredFields = toolSchema.required || [];
                  const parameterDescriptions = {};
                  
                  // Build parameter descriptions from schema
                  if (toolSchema.properties) {
                    Object.entries(toolSchema.properties).forEach(([name, prop]) => {
                      parameterDescriptions[name] = {
                        type: prop.type,
                        description: prop.description,
                        required: requiredFields.includes(name),
                        enum: prop.enum
                      };
                    });
                  }

                  // Validate required parameters
                  const missingParams = requiredFields.filter(field => 
                    !action.args[field] && field !== 'userId' && field !== 'accessToken'
                  );

                  if (missingParams.length > 0) {
                    return {
                      error: true,
                      message: `Missing required parameters: ${missingParams.join(', ')}`,
                      tool: action.tool,
                      parameters: parameterDescriptions,
                      providedArgs: action.args,
                      missingParams
                    };
                  }

                  // Inject userId and accessToken if needed
                  const needsUserId = requiredFields.includes('userId');
                  const needsToken = requiredFields.includes('accessToken');

                  const args = {
                    ...action.args,
                    ...(needsUserId && { userId }),
                    ...(needsToken && { accessToken })
                  };

                  // Call the tool
                  try {
                    const result = await client.callTool({
                      name: action.tool,
                      arguments: args
                    });

                    return {
                      tool: action.tool,
                      result: result
                    };
                  } catch (error) {
                    // Return detailed error info for recovery
                    return {
                      error: true,
                      message: error.message,
                      tool: action.tool,
                      parameters: parameterDescriptions,
                      providedArgs: args,
                      errorType: error.name,
                      errorDetails: error.details || error.message
                    };
                  }
                } catch (error) {
                  logger.error(`Error executing ${action.tool}:`, error);
                  return {
                    error: true,
                    message: error.message,
                    tool: action.tool
                  };
                }
              })
            );

            // Add results to conversation with detailed error info
            agentMessages.push({
              role: 'system',
              content: `Action results:\n${JSON.stringify(actionResults, null, 2)}\n\nIf there were any errors, you can retry the actions with corrected parameters based on the error details provided.`
            });
          }
        }

        // Clean up thinking client when done
        if (thinkingClients.has(sessionId)) {
          thinkingClients.get(sessionId).close();
          thinkingClients.delete(sessionId);
        }

        return finalResponse || {
          content: [{
            type: 'text',
            text: "i'm sorry, i wasn't able to complete the request in the allowed number of turns. please try rephrasing your request."
          }]
        };

      } catch (error) {
        // Clean up thinking client on error
        if (thinkingClients.has(sessionId)) {
          thinkingClients.get(sessionId).close();
          thinkingClients.delete(sessionId);
        }

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