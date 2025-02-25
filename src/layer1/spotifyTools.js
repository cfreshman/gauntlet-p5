/**
 * Spotify Tools for Layer 1 (Primitives)
 * 
 * This module implements the deterministic tools for interacting with the Spotify API.
 * These tools provide direct access to Spotify API endpoints with guaranteed deterministic behavior.
 */

const spotifyClient = require('../utils/spotifyClient');
const logger = require('../utils/logger');
const { z } = require('zod');

/**
 * Register Spotify tools with an MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerSpotifyTools(server) {
  logger.info('Registering Spotify tools for Layer 1');
  
  // Search tool
  server.tool(
    "search-spotify",
    "Search for items on Spotify",
    {
      query: z.string(),
      types: z.union([
        z.string(),
        z.array(z.string())
      ]),
      limit: z.number().min(1).max(50).optional(),
      offset: z.number().min(0).optional(),
      market: z.string().optional()
    },
    async ({ query, types, limit = 20, offset = 0, market = null }) => {
      try {
        logger.debug('Searching Spotify', { query, types, limit, offset, market });
        
        const results = await spotifyClient.search(query, types, limit, offset, market);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error searching Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Get track tool
  server.tool(
    "get-track",
    "Get detailed information about a specific track",
    {
      trackId: z.string(),
      market: z.string().optional()
    },
    async ({ trackId, market = null }) => {
      try {
        logger.debug('Getting track from Spotify', { trackId, market });
        
        const track = await spotifyClient.getTrack(trackId, market);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(track, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting track from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Get audio features tool
  server.tool(
    "get-audio-features",
    "Get audio features for a specific track",
    {
      trackId: z.string()
    },
    async ({ trackId }) => {
      try {
        logger.debug('Getting audio features from Spotify', { trackId });
        
        const audioFeatures = await spotifyClient.getAudioFeatures(trackId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(audioFeatures, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting audio features from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Get playlist tool
  server.tool(
    "get-playlist",
    "Get details about a playlist",
    {
      playlistId: z.string(),
      fields: z.string().optional(),
      market: z.string().optional()
    },
    async ({ playlistId, fields = null, market = null }) => {
      try {
        logger.debug('Getting playlist from Spotify', { playlistId, fields, market });
        
        const playlist = await spotifyClient.getPlaylist(playlistId, fields, market);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(playlist, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting playlist from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Get playlist tracks tool
  server.tool(
    "get-playlist-tracks",
    "Get tracks in a playlist",
    {
      playlistId: z.string(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
      market: z.string().optional()
    },
    async ({ playlistId, limit = 20, offset = 0, market = null }) => {
      try {
        logger.debug('Getting playlist tracks from Spotify', { playlistId, limit, offset, market });
        
        const tracks = await spotifyClient.getPlaylistTracks(playlistId, limit, offset, market);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tracks, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting playlist tracks from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Create playlist tool
  server.tool(
    "create-playlist",
    "Create a new playlist",
    {
      userId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      public: z.boolean().optional(),
      collaborative: z.boolean().optional()
    },
    async ({ userId, name, description = null, public: isPublic = false, collaborative = false }) => {
      try {
        logger.debug('Creating playlist on Spotify', { userId, name, description, isPublic, collaborative });
        
        const playlist = await spotifyClient.createPlaylist(userId, name, description, isPublic, collaborative);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(playlist, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error creating playlist on Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Add tracks to playlist tool
  server.tool(
    "add-tracks-to-playlist",
    "Add tracks to a playlist",
    {
      playlistId: z.string(),
      trackUris: z.union([
        z.string(),
        z.array(z.string())
      ]),
      position: z.number().optional()
    },
    async ({ playlistId, trackUris, position = null }) => {
      try {
        logger.debug('Adding tracks to playlist on Spotify', { playlistId, trackUris, position });
        
        const result = await spotifyClient.addTracksToPlaylist(playlistId, trackUris, position);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error adding tracks to playlist on Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );
  
  logger.info('Spotify tools registered for Layer 1');
}

module.exports = {
  registerSpotifyTools
}; 