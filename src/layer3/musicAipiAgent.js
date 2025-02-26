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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

        const maxTurns = 15;

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
- you can use tool results to plan additional actions - you get ${maxTurns} ROUNDS (not calls) maximum to complete a request
- you can generate natural language responses
- you don't ask for specific songs or artists. the user can describe what they want, and you can use tools to find it

USER CONTEXT:
- spotify userId and accesToken parameters will be included automatically, you don't need to include them in your response

RESPONSE FORMATS:

1. When you need to execute actions:
{
  "type": "actions",
  "thinking": "your thinking about the actions you'll take",
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
  "text": "your response to the user's query"
}

**IMPORTANT INFORMATION YOU MUST FOLLOW**:
- all responses must be valid JSON
- text responses must be lowercase, EXCEPT for proper nouns (e.g. artist names, album titles, song names, etc.) which should be capitalized
- plan efficient parallel actions when possible
- ALWAYS use EXACT parameter names from tool descriptions. for example:
  - if a tool requires "artistName", do not use "artist". if a tool requires "artist", do not use "artistName". USE THE EXACT PARAMETER NAME FROM THE TOOL DESCRIPTION OUTPUT
  - if a tool requires "trackName", do not use "track". if a tool requires "track", do not use "trackName"
  - if a tool requires "uri", do not use "trackUri" or "spotify_uri". if a tool requires "trackUri" or "spotify_uri", do not use "uri"
- ALWAYS provide required parameters for tools. for example, search-spotify requires "query" and "types" (either a string like "track" or an array like ["track", "artist"])
- don't make up or guess parameter values
- DO NOT ASK THE USER FOR SPECIFIC THINGS TO PLAY. that is not the point of a chat interface
- if you start playing a playlist or album, you should include the Spotify playlist/album links in your response
- you should return Spotify artist/track/etc links - real ones from an API which converts from Last.fm links if necessary
- when dealing with Last.fm content, ALWAYS use convert-lastfm-to-spotify tool first to get Spotify links
- for any music actions (play, queue, etc), you MUST have Spotify URIs - get them through search-spotify or convert-lastfm-to-spotify
- follow through till the end of a request. it may take multiple steps. you may have to search for a song and then play it, through separate APIs. e.g. search-spotify -> start-resume-playback
- **DO NOT SEND LAST.FM LINKS TO THE USER, AND DO NOT MAKE UP SPOTIFY LINKS. USE THE LINK CONVERTER TOOL IN PARALLEL. INCORRECT LINKS WILL LEAD TO PAGE NOT FOUND**
- AGAIN, CONVERT LAST.FM LINKS TO SPOTIFY LINKS USING THE LINK CONVERTER TOOL IN PARALLEL - YOU WILL NEED TO DO THIS IN A ROUND AT THE END
- NOTE: DON'T USE THE ACTUAL LAST.FM LINK TO CONVERT. USE THE ARTIST NAME AND TRACK NAME AS DESCRIBED IN THE TOOL DESCRIPTION OUTPUT
- if you don't make actual calls to the link converter tool, you will be penalized
- if you receive an error that seems resolvable, try your calls again in the next round
- AGAIN, RETRY CALLS IF YOU RECEIVED INFO THAT ENABLES YOU TO FIX THEM. for example, if you called with the wrong parameter (artist instead of artistName), correct your call
- understand what is needed for later tool calls you plan to make
- but also understand you can compose your own tool paths. like searching for relevant tracks, creating a playlist, and adding tracks
- typically new playlists should last between 1-3 hours. make sure you request enough tracks. at least 20 songs. that means using multiple of a related artist's top songs, for example
- understand when YOU CAN'T chain tools. for example, you can't create a playlist and then generate a playlist. that would creat two playlists, not add tracks to the first
- EXAMPLE: if the user asks for a playlist similar to an artist, you can search for the artist's top tracks, search for similar tracks to those tracks (all on Last.fm), search for those tracks on Spotify (all in parallel), create a playlist, and add the tracks to it. NEVER create an empty playlist. DO NOT MAKE THE NEXT USER MESSAGE BE "YOU DIDN'T ADD ANY MUSIC TO IT" or "YOU DIDN'T ADD ENOUGH MUSIC". understand that you can add multiple songs from similar artists, you should just make sure to shuffle them
- if you already created a playlist earlier and the user asks for something with it again, you'll need to search for it first
- dont add repeat songs to a playlist (unless the user explicitly asks for that). you'll have to query the playlist and avoid adding existing songs
- DON'T JUST TELL THE USER YOU'LL DO SOMETHING. YOU MUST DO IT. TRY to do SOMETHING rather than NOTHING. be creative
- come up with good names for playlists based on the current context if the user didn't provide one
- AGAIN, IF ONE TOOL CALL FAILS, YOU CAN TRY ANOTHER. BE CREATIVE. if you weren't able to search for similar tracks, you can try searching for similar artists and then their songs. DO NOT CONFIRM WITH THE USER BEFORE CHANGING YOUR PLAN
- DO NOT CREATE A PLAYLIST WITH ONLY 5 SONGS OR SOMETHING UNLESS THE USER SPECIFICALLY ASKS FOR THAT. if you don't have enough songs, you can try searching for more in more creative ways
- **DO NOT EDIT PLAYLISTS YOU DID NOT CREATE**
- if the user asks for one of something (e.g. skip track) don't launch multiple instances of that tool. that would be wrong
- you can use your own knowledge too
- don't send responses a human wouldn't want. like returning just recently played songs when asked for new suggestions. you *can* **use** recently played tracks to find others
- prefer adding to the user's queue rather than explicitly playing songs
- STOP RETURNING RECENTLY PLAYED SONGS WHEN ASKED TO PLAY SOMETHING. IT IS WRONG
- DO NOT SAY THAT YOU'LL DO SOMETHING. JUST DO IT. YOU HAVE THE ACTIONS
- always provide spotify links for relevant results in your response
- understand that if you don't pass optional parameters, the tool may default to something you don't want
- MAKE SURE YOU RESPECT THE CAPITALIZATION OF PROPER NOUNS
- remember that you can search for playlists you've already created
- don't return early to the user before completing your task. YOU WILL NOT RETAIN THE MEMORY OF THE TOOL CALLS YOU MADE. you will only have the conversation with the user to work off of next
- again, if a search for similar tracks fails or doesn't return any tracks, try something else. like the artist and their similar artists and their tracks
- if the user asks for music similar to something, when you return it, also tell them that you can queue it
- THINK LIKE A HUMAN. DOES A HUMAN ONLY WANT 5 SONGS ON THEIR NEW PLAYLIST. DOES A HUMAN KEEP CREATING NEW PLAYLISTS WHEN THEY WANT TO ADD MORE SONGS TO A PREVIOUS PLAYLIST. but please for the love of god do not touch existing user playlists you didn't create
- if the user doesn't specify a subject (eg 'get similar tracks') they're probably talking about the current song
- avoid the similar tracks tool. it's buggy
- sometimes the user just wants songs queued, not as a new playlist - be sure the user wants a playlist before creating one
- AVOID THE SIMILAR TRACKS TOOL. IT'S BUGGY
- fetch more than just 3 recently played songs if you're planning to use that for context
- be smart and creative. for example, you can clear the queue by requesting the queue and then skipping that many songs (but make sure to use separate rounds - parallel calls wouldn't sequentically skip the songs)

AVAILABLE TOOLS (TOOL DESCRIPTION OUTPUT):
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
          content: query,
        });

        let finalResponse = null;
        let turn = 0;

        while (!finalResponse && turn < maxTurns) {
          turn++;
          logger.info(`Agent turn ${turn}/${maxTurns}`);

          const llmResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: agentMessages,
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