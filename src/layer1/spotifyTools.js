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
    async ({ query, types, limit = 20, offset = 0, market = 'US' }) => {
      try {
        logger.debug('Searching Spotify', { query, types, limit, offset, market });
        
        // Convert types to array if it's a string
        const typesArray = typeof types === 'string' ? [types] : types;
        
        const results = await spotifyClient.search(query, typesArray, limit, offset, market);
        
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
  
  // Convert Last.fm to Spotify tool
  server.tool(
    "convert-lastfm-to-spotify",
    "Convert Last.fm links to Spotify links",
    {
      artistName: z.string().describe("The name of the artist"),
      trackName: z.string().optional().describe("The name of the track (optional)")
    },
    async ({ artistName, trackName }) => {
      try {
        logger.info('Converting Last.fm to Spotify', { artistName, trackName });
        
        // Use search to find the artist/track
        let searchQuery = artistName;
        if (trackName) {
          searchQuery = `${trackName} artist:${artistName}`;
        }
        
        const types = trackName ? ['track'] : ['artist'];
        const results = await spotifyClient.search(searchQuery, types, 1);
        
        // Extract the Spotify URL from the search result
        let spotifyUrl = null;
        let spotifyData = null;
        
        if (trackName && results.tracks && results.tracks.items && results.tracks.items.length > 0) {
          spotifyUrl = results.tracks.items[0].external_urls.spotify;
          spotifyData = results.tracks.items[0];
        } else if (results.artists && results.artists.items && results.artists.items.length > 0) {
          spotifyUrl = results.artists.items[0].external_urls.spotify;
          spotifyData = results.artists.items[0];
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                lastfm: {
                  artist: artistName,
                  track: trackName || null
                },
                spotify: {
                  url: spotifyUrl,
                  data: spotifyData
                }
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error converting Last.fm to Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                lastfm: {
                  artist: artistName,
                  track: trackName || null
                },
                spotify: {
                  url: null,
                  error: error.message
                }
              }, null, 2)
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
  
  // Player API tools
  
  // Get playback state tool
  server.tool(
    "get-playback-state",
    "Get information about the user's current playback state",
    {
      market: z.string().optional().describe("An ISO 3166-1 alpha-2 country code")
    },
    async ({ market = null }) => {
      try {
        logger.debug('Getting playback state from Spotify', { market });
        
        const state = await spotifyClient.getPlaybackState(market);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(state, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting playback state from Spotify', { error: error.message });
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
  
  // Get available devices tool
  server.tool(
    "get-available-devices",
    "Get the user's available Spotify Connect devices",
    {},
    async () => {
      try {
        logger.debug('Getting available devices from Spotify');
        
        const devices = await spotifyClient.getAvailableDevices();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(devices, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting available devices from Spotify', { error: error.message });
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
  
  // Get currently playing track tool
  server.tool(
    "get-currently-playing-track",
    "Get the user's currently playing track",
    {
      market: z.string().optional().describe("An ISO 3166-1 alpha-2 country code")
    },
    async ({ market = null }) => {
      try {
        logger.debug('Getting currently playing track from Spotify', { market });
        
        const track = await spotifyClient.getCurrentlyPlayingTrack(market);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(track, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting currently playing track from Spotify', { error: error.message });
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
  
  // Transfer playback tool
  server.tool(
    "transfer-playback",
    "Transfer playback to a different device",
    {
      deviceIds: z.union([
        z.string(),
        z.array(z.string())
      ]).describe("Spotify device ID(s) to transfer playback to"),
      play: z.boolean().optional().describe("Whether to ensure playback happens on the new device")
    },
    async ({ deviceIds, play = false }) => {
      try {
        logger.debug('Transferring playback to device', { deviceIds, play });
        
        const result = await spotifyClient.transferPlayback(deviceIds, play);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error transferring playback', { error: error.message });
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
  
  // Start/resume playback tool
  server.tool(
    "start-resume-playback",
    "Start or resume playback on the user's active device",
    {
      deviceId: z.string().optional().describe("Spotify device ID to play on"),
      contextUri: z.string().optional().describe("Spotify URI of the context to play (album, artist, playlist)"),
      uris: z.array(z.string()).optional().describe("Array of Spotify track URIs to play"),
      offset: z.object({
        position: z.number().optional(),
        uri: z.string().optional()
      }).optional().describe("Offset in the context"),
      positionMs: z.number().optional().describe("Position in the track (in milliseconds)")
    },
    async ({ deviceId = null, contextUri = null, uris = null, offset = null, positionMs = null }) => {
      try {
        logger.debug('Starting/resuming playback', { deviceId, contextUri, uris, offset, positionMs });
        
        const result = await spotifyClient.startResumePlayback(deviceId, contextUri, uris, offset, positionMs);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error starting/resuming playback', { error: error.message });
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
  
  // Pause playback tool
  server.tool(
    "pause-playback",
    "Pause playback on the user's active device",
    {
      deviceId: z.string().optional().describe("Spotify device ID to pause on")
    },
    async ({ deviceId = null }) => {
      try {
        logger.debug('Pausing playback', { deviceId });
        
        const result = await spotifyClient.pausePlayback(deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error pausing playback', { error: error.message });
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
  
  // Skip to next tool
  server.tool(
    "skip-to-next",
    "Skip to the next track in the queue",
    {
      deviceId: z.string().optional().describe("Spotify device ID")
    },
    async ({ deviceId = null }) => {
      try {
        logger.debug('Skipping to next track', { deviceId });
        
        const result = await spotifyClient.skipToNext(deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error skipping to next track', { error: error.message });
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
  
  // Skip to previous tool
  server.tool(
    "skip-to-previous",
    "Skip to the previous track in the queue",
    {
      deviceId: z.string().optional().describe("Spotify device ID")
    },
    async ({ deviceId = null }) => {
      try {
        logger.debug('Skipping to previous track', { deviceId });
        
        const result = await spotifyClient.skipToPrevious(deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error skipping to previous track', { error: error.message });
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
  
  // Seek to position tool
  server.tool(
    "seek-to-position",
    "Seek to a position in the currently playing track",
    {
      positionMs: z.number().describe("Position in milliseconds to seek to"),
      deviceId: z.string().optional().describe("Spotify device ID")
    },
    async ({ positionMs, deviceId = null }) => {
      try {
        logger.debug('Seeking to position', { positionMs, deviceId });
        
        const result = await spotifyClient.seekToPosition(positionMs, deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error seeking to position', { error: error.message });
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
  
  // Set repeat mode tool
  server.tool(
    "set-repeat-mode",
    "Set the repeat mode for the user's playback",
    {
      state: z.enum(['track', 'context', 'off']).describe("Repeat mode: 'track', 'context', or 'off'"),
      deviceId: z.string().optional().describe("Spotify device ID")
    },
    async ({ state, deviceId = null }) => {
      try {
        logger.debug('Setting repeat mode', { state, deviceId });
        
        const result = await spotifyClient.setRepeatMode(state, deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error setting repeat mode', { error: error.message });
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
  
  // Set playback volume tool
  server.tool(
    "set-playback-volume",
    "Set the volume for the user's playback",
    {
      volumePercent: z.number().min(0).max(100).describe("Volume percentage (0-100)"),
      deviceId: z.string().optional().describe("Spotify device ID")
    },
    async ({ volumePercent, deviceId = null }) => {
      try {
        logger.debug('Setting playback volume', { volumePercent, deviceId });
        
        const result = await spotifyClient.setPlaybackVolume(volumePercent, deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error setting playback volume', { error: error.message });
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
  
  // Toggle playback shuffle tool
  server.tool(
    "toggle-playback-shuffle",
    "Toggle shuffle mode for the user's playback",
    {
      state: z.boolean().describe("Shuffle state (true or false)"),
      deviceId: z.string().optional().describe("Spotify device ID")
    },
    async ({ state, deviceId = null }) => {
      try {
        logger.debug('Toggling playback shuffle', { state, deviceId });
        
        const result = await spotifyClient.togglePlaybackShuffle(state, deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error toggling playback shuffle', { error: error.message });
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
  
  // Get recently played tracks tool
  server.tool(
    "get-recently-played-tracks",
    "Get the user's recently played tracks",
    {
      limit: z.number().min(1).max(50).optional().describe("Number of tracks to return (default: 20)"),
      before: z.number().optional().describe("Return tracks before this Unix timestamp in milliseconds"),
      after: z.number().optional().describe("Return tracks after this Unix timestamp in milliseconds")
    },
    async ({ limit = 20, before = null, after = null }) => {
      try {
        logger.debug('Getting recently played tracks', { limit, before, after });
        
        const tracks = await spotifyClient.getRecentlyPlayedTracks(limit, before, after);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tracks, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting recently played tracks', { error: error.message });
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
  
  // Get queue tool
  server.tool(
    "get-queue",
    "Get the user's queue",
    {},
    async () => {
      try {
        logger.debug('Getting queue from Spotify');
        
        const queue = await spotifyClient.getQueue();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(queue, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting queue from Spotify', { error: error.message });
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
  
  // Add to queue tool
  server.tool(
    "add-to-queue",
    "Add an item to the end of the user's queue",
    {
      uri: z.string().describe("Spotify URI of the item to add"),
      deviceId: z.string().optional().describe("Spotify device ID")
    },
    async ({ uri, deviceId = null }) => {
      try {
        logger.debug('Adding item to queue', { uri, deviceId });
        
        const result = await spotifyClient.addToQueue(uri, deviceId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result || { success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error adding item to queue', { error: error.message });
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