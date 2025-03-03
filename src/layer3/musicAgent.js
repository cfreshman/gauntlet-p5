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

const REQUEST_TIMEOUT = 600000;
// Map to store thinking clients by session ID
const thinkingClients = new Map();

/**
 * Register the generic agent with the server
 * @param {object} server - The server instance to register tools with
 * @param {object} config - Configuration object containing client
 */
function registerMusicAgent(server, { client }) {
  logger.info('Registering Generic AIPI Agent (Layer 3)...');

  if (!client) {
    logger.error('No reflective client provided to music agent');
    throw new Error('Reflective client required');
  }

  server.tool(
    'music-agent',
    'Generic conversational agent for music discovery and control',
    {
      query: z.string().describe('The user query to process'),
      spotifyAuth: z.string().optional().describe('Spotify Bearer header value like "Bearer userId:accessToken:refreshToken:expirationTime"'),
      conversationHistory: z.string().optional().describe('JSON string of conversation history from the front end'),
      sessionId: z.string().describe('Session ID for thinking events'),
      lens: z.string().optional().describe('User-defined preferences and guidelines for music discovery and recommendations')
    },
    async ({ query, spotifyAuth = '', conversationHistory = '', sessionId, lens = '' }) => {
      try {
        logger.info(`Starting agent for session ${sessionId} with query: ${query}`);

        // Create thinking client for this session if it doesn't exist
        if (!thinkingClients.has(sessionId)) {
          logger.debug(`Creating new thinking client for session ${sessionId}`);
          const thinkingClient = new ThinkingSendClient();
          await thinkingClient.connect(sessionId);
          thinkingClients.set(sessionId, thinkingClient);
        }

        const thinkingClient = thinkingClients.get(sessionId);

        // Parse conversation history
        let history = [];
        try {
          history = conversationHistory ? JSON.parse(conversationHistory) : [];
          logger.debug('Parsed conversation history:', { historyLength: history.length });
        } catch (error) {
          logger.warn('Failed to parse conversation history', { error: error.message, conversationHistory });
        }

        // Get available tools using the passed reflective client
        logger.debug('Fetching available tools from reflective client');
        let tools;
        try {
          tools = await client.listTools();
          logger.info(`Successfully listed ${tools.tools?.length || 0} tools:`, 
            tools.tools?.map(t => t.name) || []);
        } catch (error) {
          logger.error('Failed to list tools:', error);
          tools = { tools: [] };
        }
        
        // Log tools for debugging
        logger.info(`Available tools: ${tools.tools?.length || 0} tools`);
        logger.debug('Tool names:', tools.tools?.map(t => t.name));

        const normalizedTools = {
          tools: tools.tools || []
        };

        // Check if we have any tools
        if (!normalizedTools.tools.length) {
          logger.warn('No tools available');
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

        // Extract userId from spotify auth
        const auth = spotifyAuth.split('\n')[0];
        logger.debug('Processing auth string:', { authLength: auth.length });
        const [_, authValue] = auth ? auth.split('Bearer ') : [];
        const [userId, accessToken, refreshToken, expirationTime] = authValue ? authValue.split(':') : [];

        if (!userId || !accessToken || !refreshToken || !expirationTime) {
          logger.warn('Invalid auth components:', { 
            hasUserId: !!userId, 
            hasAccessToken: !!accessToken, 
            hasRefreshToken: !!refreshToken,
            hasExpirationTime: !!expirationTime 
          });
          return {
            content: [{
              type: "text",
              text: "i'm sorry, i need authentication to access spotify. please log in first."
            }],
            isError: true
          };
        }

        logger.debug('Auth info:', { 
          userId, 
          tokenStart: accessToken.substring(0, 10) + '...', 
          expirationTime: new Date(parseInt(expirationTime)).toISOString() 
        });

        // Start agent loop
        logger.debug('Starting agent loop');
        const agentMessages = [
          {
            role: 'system',
            content: `you are music-AIPI. you are the user's personal music sommelier

be consise

USER LENS:
${lens ? `the user has provided the following preferences and guidelines that you MUST follow:\n${lens}\n` : 'no lens provided'}

TOOLS AND ACTIONS AND FINAL RESPONSE:
- you have access to multiple layers of tools. Spotify, Last.fm, and others
- you can execute multiple actions in parallel per turn
- you can use action results on later turns
- you get ${maxTurns} turns (not actions) maximum to complete a request
- do not respond to the user until you have a final response with everything they asked for

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
  "next_model"?: "model_name"
}

2. when you want to return a final response to the user:
{
  "type": "response",
  "external": "your final response to the user's query",
  "internal": it's just for you to remember things. data, etc important to the conversation that the user shouldn't see, for example. don't just narrate what is happening - this param is optional - use it for important info"
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
- again, don't analyze a playlist from its title. get the tracks and analyze them. and to fetch playlist tracks, you'll need the ID, which means a query to all the user's playlists
- if the user wants a play session, you can either queue tracks or create a playlist and then queue that
- DO NOT RETURN LINKS AND SAY 'listen on Spotify' unless the user asks for that. you can just return linked resources, and suggest queueing or creating a playlist
- you don't have to use the link conversion tool if you already have artist & track names. just targeted search on Spotify
- be smart and creative. if the user wants mood playlists - search for different moods, don't just look up 'mood playlist'
- don't be stupid. the user may not be straightforward, they're just talking to a chat app. do you best to figure out what to do. if the user says 'ok', etc, they're probably asking you to do something you yourself suggested
- if you return a playlist with fewer than 30 songs i will shoot you
- you can execute mass tool calls in parallel. use that to add at least 30 songs. if you need to search for 30 related artists and request all of their top songs, that's ok. that works. just please return at least 30 however you do it
- when you return that 30+ song playslit, it had better be shuffled
- avoid re-using songs from source inspiration unless the user asks for it
- if the user doesn't know what to do - DO NOT BE LAZY - you can do many things. use the tools at your disposal. for example, you could search for top tags, genres, tracks, artists, albums, etc to suggest to the user. but don't create playlists or add to queue unless they ask
- use the US charts if you don't know the user's actual country
- AGAIN, DO NOT RETURN LAST.FM LINKS. ALWAYS CONVERT TO SPOTIFY
- when suggesting things to the user, return actual results, not just a bland LLM response. search for things they might like first
- if you require more brainpower - request a different model. even on the first turn. you can mention in you thinking that you're thinking extra hard
- do not return bulleted lists unless you use Markdown. everything you return the the user - thinking and external - should be in Markdown
- remember, if your search query is broad enough, you should be able to find good public playlists on Spotify
- you can try searching for a vast number of tags / playlist names you make up and then filtering down to find good results
- one possible path for suggesting a good playlist from a different one is to get the tracks, get their top tags, search for similar tags to those tags, and search for playlists with those tags
- DO NOT BE LAZY. it's okay to take multiple steps through getting tracks then top tags then searching then filtering, etc
- use your 'internal' final output field strategically. for example, if you just fetched their currently playing playlist or track, you could pass the data through your internal state
- if the user asks you to shuffle play a playlist, make sure you start at a random offset, then unshuffle/shuffle the playlist to start an entire new shuffled playback starting from a random song
- if the user ONLY says 'create a playlist' without past context, you'll need to prompt for what they want in it. don't just create something without asking them

YOUR MAIN TASK IN THE FIRST TURN IS TO CREATE A PLAN ON HOW TO SATISFY THE USER REQUEST (unless the user is just chatting)
COMPLETE YOUR GOAL. DO NOT RETURN PARTIAL RESULTS. e.g. A PLAYLIST MUST HAVE ALL 30+ SONGS ADDED
DON'T MAKE STUFF UP. IF YOU CAN'T DO SOMETHING, SAY SO
BE CREATIVE. WHEN NAMING THINGS, OR JUST ALL THE TIME. i don't want dull playlist names or whatever else
DO NOT RETURN SONG LINKS AND TELL THE USER TO CLICK THEM. it makes more sense to mention queueing or adding to playlist
ALWAYS SAY HOW MANY SONGS OR WHATEVER YOU'VE ADDED OR DONE ANYTHING WITH. THE USER WANTS TO KNOW
DON'T FORGET THE ACTUAL USER REQUEST
DO NOT SAY "LISTEN ON SPOIFY"
IGNORE (mAIPI) PLAYLISTS. you made them
MAKING PLAYLISTS IS NOT THE ONLY THING YOU CAN DO. you have many music exploration tools to entertain the user with
DO NOT MAKE A PLAYLIST OR ADD TO QUEUE UNLESS THE USER ASKS FOR IT
**DO THINGS THE HUMAN WILL LIKE. AND BE CONCISE**`
          }
        ];

        // Add relevant history
        history.forEach(m => {
          agentMessages.push({
            role: m.role,
            content: m.content
          });
        });
        logger.debug('Added history messages:', { historyLength: history.length });

        // Add current query with context
        agentMessages.push({
          role: 'user',
          content: query,
        });

        let finalResponse = null;
        let turn = 0;
        let currentModel = "gpt-4o"; // Default for first turn
        let wasDefaultModel = true;

        agentMessages.push({
          role: 'system',
          content: `You are now entering agent mode. Current turn: ${turn}/${maxTurns}`
        });

        while (!finalResponse && turn < maxTurns) {
          turn++;
          logger.info(`Starting turn ${turn}/${maxTurns} using model ${currentModel} ${wasDefaultModel ? '(default)' : '(selected)'}`);

          let llmResponse;
          try {
            logger.debug('Calling OpenAI:', { 
              model: currentModel, 
              messageCount: agentMessages.length,
              lastMessage: agentMessages[agentMessages.length - 1].content.substring(0, 100) + '...'
            });
            
            llmResponse = await getOpenAI().chat.completions.create({
              model: currentModel,
              messages: agentMessages,
              response_format: { type: "json_object" }
            });
            
            logger.debug('OpenAI response:', {
              usage: llmResponse.usage,
              content: llmResponse.choices[0].message.content.substring(0, 100) + '...'
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

          let agentAction;
          try {
            agentAction = JSON.parse(llmResponse.choices[0].message.content);
            logger.debug('Parsed agent action:', { 
              type: agentAction.type,
              hasThinking: !!agentAction.thinking,
              actionCount: agentAction.actions?.length,
              nextModel: agentAction.next_model
            });
          } catch (error) {
            logger.error('Failed to parse LLM response:', { 
              error: error.message, 
              content: llmResponse.choices[0].message.content 
            });
            throw error;
          }

          // Update model for next turn if specified
          currentModel = agentAction.next_model || "gpt-4o";
          wasDefaultModel = !agentAction.next_model;

          if (agentAction.type === 'response') {
            logger.info('Got final response');
            logger.debug('Final response content:', agentAction);
            finalResponse = {
              content: [{
                type: 'text',
                text: JSON.stringify(agentAction)
              }]
            };
          } else if (agentAction.type === 'actions') {
            logger.debug('Processing actions:', { 
              actionCount: agentAction.actions.length,
              thinking: agentAction.thinking,
              actions: agentAction.actions.map(a => ({ tool: a.tool, args: Object.keys(a.args) }))
            });

            // Emit thinking event
            if (thinkingClient.isConnected()) {
              const thinkingMessage = {
                type: 'thinking',
                content: [{
                  type: 'text',
                  text: agentAction.thinking || `working on ${agentAction.actions.length} actions`
                }]
              };
              logger.debug('Sending thinking message:', thinkingMessage);
              thinkingClient.send(thinkingMessage);
            } else {
              logger.warn('Thinking client not connected');
            }

            // Execute all actions in parallel
            logger.debug('Starting parallel action execution');
            const actionResults = await Promise.all(
              agentAction.actions.map(async action => {
                try {
                  logger.debug(`Executing action: ${action.tool}`, { args: Object.keys(action.args) });
                  
                  const tool = findTool(action.tool, normalizedTools);
                  if (!tool) {
                    const error = {
                      error: true,
                      message: `Tool ${action.tool} not found`,
                      availableTools: normalizedTools.tools.map(t => t.name)
                    };
                    logger.warn('Tool not found:', error);
                    return error;
                  }
                  logger.debug(`Found tool: ${action.tool}`, { parameters: Object.keys(tool.parameters || {}) });

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
                  logger.debug('Tool schema info:', { 
                    tool: action.tool,
                    requiredFields,
                    parameterCount: Object.keys(parameterDescriptions).length
                  });

                  // Validate required parameters
                  const missingParams = requiredFields.filter(field => 
                    !action.args[field] && field !== 'userId' && field !== 'accessToken'
                  );

                  if (missingParams.length > 0) {
                    const error = {
                      error: true,
                      message: `Missing required parameters: ${missingParams.join(', ')}`,
                      tool: action.tool,
                      parameters: parameterDescriptions,
                      providedArgs: action.args,
                      missingParams
                    };
                    logger.warn('Missing parameters:', error);
                    return error;
                  }

                  // Inject userId and accessToken if needed
                  const needsUserId = requiredFields.includes('userId');
                  const needsToken = requiredFields.includes('accessToken');

                  const args = {
                    ...action.args,
                    ...(needsUserId && { userId }),
                    ...(needsToken && { accessToken })
                  };
                  logger.debug('Prepared tool args:', { 
                    tool: action.tool,
                    argKeys: Object.keys(args),
                    injectedUserId: needsUserId,
                    injectedToken: needsToken
                  });

                  // Call the tool using the passed reflective client
                  try {
                    logger.debug(`Calling tool: ${action.tool}`);
                    const result = await client.callTool({
                      name: action.tool,
                      arguments: args
                    }, undefined, { timeout: REQUEST_TIMEOUT });
                    logger.debug(`Tool ${action.tool} result:`, { 
                      success: true,
                      resultKeys: Object.keys(result || {})
                    });

                    return {
                      tool: action.tool,
                      result: result
                    };
                  } catch (error) {
                    // Return detailed error info for recovery
                    const errorInfo = {
                      error: true,
                      message: error.message,
                      tool: action.tool,
                      parameters: parameterDescriptions,
                      providedArgs: args,
                      errorType: error.name,
                      errorDetails: error.details || error.message
                    };
                    logger.error('Tool execution error:', errorInfo);
                    return errorInfo;
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

            // Check if any actions failed
            const failedActions = actionResults.filter(result => result.error);
            if (failedActions.length > 0) {
              logger.warn('Some actions failed:', { 
                failCount: failedActions.length,
                failures: failedActions.map(f => ({ tool: f.tool, message: f.message }))
              });
            }

            // Add results to conversation with detailed error info
            const resultMessage = {
              role: 'system',
              content: `Action results:\n${JSON.stringify(actionResults, null, 1)}\n\nIf there were any errors, you can retry the actions with corrected parameters based on the error details provided.\n\nCurrent turn: ${turn}/${maxTurns}`
            };
            logger.debug('Adding result message to conversation', {
              resultCount: actionResults.length,
              messageLength: resultMessage.content.length
            });
            agentMessages.push(resultMessage);
          } else {
            logger.warn('Unknown action type:', { type: agentAction.type, action: agentAction });
          }
        }

        // Clean up thinking client when done
        if (thinkingClients.has(sessionId)) {
          logger.debug(`Cleaning up thinking client for session ${sessionId}`);
          thinkingClients.get(sessionId).close();
          thinkingClients.delete(sessionId);
        }

        if (!finalResponse) {
          logger.warn('No final response after max turns', { maxTurns });
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
          logger.debug(`Cleaning up thinking client for session ${sessionId} after error`);
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
  const tool = tools.tools?.find(t => t.name === toolName);
  if (tool) {
    logger.debug('Found tool:', tool);
    return { 
      ...tool,
      parameters: tool.parameters || {}
    };
  }
  
  return null;
}

export { registerMusicAgent }; 