/**
 * Spotify Tools for Layer 1 (Primitives)
 * 
 * This module implements the deterministic tools for interacting with the Spotify API.
 * These tools provide direct access to Spotify API endpoints with guaranteed deterministic behavior.
 */

import spotifyClient from '../utils/spotifyClient.js';
import logger from '../utils/logger.js';
import { z } from 'zod';

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
        
        // Process results to only include essential fields
        const processed = {};
        
        if (results.tracks) {
          processed.tracks = {
            items: results.tracks.items.map(track => ({
              name: track.name,
              uri: track.uri,
              href: track.external_urls.spotify,
              artists: track.artists.map(artist => ({
                name: artist.name,
                uri: artist.uri,
                href: artist.external_urls.spotify
              })),
              album: {
                name: track.album.name,
                uri: track.album.uri,
                href: track.album.external_urls.spotify
              }
            })),
            total: results.tracks.total
          };
        }
        
        if (results.artists) {
          processed.artists = {
            items: results.artists.items.map(artist => ({
              name: artist.name,
              uri: artist.uri,
              href: artist.external_urls.spotify
            })),
            total: results.artists.total
          };
        }
        
        if (results.albums) {
          processed.albums = {
            items: results.albums.items.map(album => ({
              name: album.name,
              uri: album.uri,
              href: album.external_urls.spotify,
              artists: album.artists.map(artist => ({
                name: artist.name,
                uri: artist.uri,
                href: artist.external_urls.spotify
              }))
            })),
            total: results.albums.total
          };
        }
        
        if (results.playlists) {
          processed.playlists = {
            items: results.playlists.items.map(playlist => ({
              name: playlist.name,
              uri: playlist.uri,
              href: playlist.external_urls.spotify,
              owner: {
                id: playlist.owner.id,
                name: playlist.owner.display_name
              }
            })),
            total: results.playlists.total
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error searching Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
        
        // Process track to only include essential fields
        const processed = {
          name: track.name,
          uri: track.uri,
          href: track.external_urls.spotify,
          artists: track.artists.map(artist => ({
            name: artist.name,
            uri: artist.uri,
            href: artist.external_urls.spotify
          })),
          album: {
            name: track.album.name,
            uri: track.album.uri,
            href: track.external_urls.spotify
          },
          duration_ms: track.duration_ms,
          explicit: track.explicit
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting track from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
      market: z.string().optional(),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ playlistId, fields = null, market = null, userId, accessToken }) => {
      try {
        logger.debug('Getting playlist from Spotify', { playlistId, fields, market });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const playlist = await spotifyClient.getPlaylist(playlistId, fields, market, userId);
        
        // Process playlist to only include essential fields
        const processed = {
          name: playlist.name,
          uri: playlist.uri,
          href: playlist.external_urls.spotify,
          description: playlist.description,
          owner: {
            id: playlist.owner.id,
            name: playlist.owner.display_name
          },
          tracks: {
            total: playlist.tracks.total,
            items: playlist.tracks.items?.map(item => ({
              added_at: item.added_at,
              track: {
                name: item.track.name,
                uri: item.track.uri,
                href: item.track.external_urls.spotify,
                artists: item.track.artists.map(artist => ({
                  name: artist.name,
                  uri: artist.uri,
                  href: artist.external_urls.spotify
                })),
                album: {
                  name: item.track.album.name,
                  uri: item.track.album.uri,
                  href: item.track.album.external_urls.spotify
                }
              }
            })) || []
          }
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting playlist from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
      market: z.string().optional(),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ playlistId, limit = 20, offset = 0, market = null, userId, accessToken }) => {
      try {
        logger.debug('Getting playlist tracks from Spotify', { playlistId, limit, offset, market });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const tracks = await spotifyClient.getPlaylistTracks(playlistId, limit, offset, market, userId);
        
        // Process tracks to only include essential fields
        const processed = {
          total: tracks.total,
          items: tracks.items.map(item => ({
            added_at: item.added_at,
            track: {
              name: item.track.name,
              uri: item.track.uri,
              href: item.track.external_urls.spotify,
              artists: item.track.artists.map(artist => ({
                name: artist.name,
                uri: artist.uri,
                href: artist.external_urls.spotify
              })),
              album: {
                name: item.track.album.name,
                uri: item.track.album.uri,
                href: item.track.album.external_urls.spotify
              }
            }
          }))
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting playlist tracks from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token"),
      name: z.string(),
      description: z.string().optional(),
      public: z.boolean().optional(),
      collaborative: z.boolean().optional()
    },
    async ({ userId, accessToken, name, description = null, public: isPublic = false, collaborative = false }) => {
      try {
        logger.debug('Creating playlist on Spotify', { userId, name, description, isPublic, collaborative });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const playlist = await spotifyClient.createPlaylist(userId, name, description, isPublic, collaborative);
        
        // Process playlist to only include essential fields
        const processed = {
          name: playlist.name,
          uri: playlist.uri,
          href: playlist.external_urls.spotify,
          description: playlist.description,
          owner: {
            id: playlist.owner.id,
            name: playlist.owner.display_name
          }
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error creating playlist on Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
      position: z.number().optional(),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ playlistId, trackUris, position = null, userId, accessToken }) => {
      try {
        logger.debug('Adding tracks to playlist on Spotify', { playlistId, trackUris, position });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.addTracksToPlaylist(playlistId, trackUris, position, userId);
        
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
  
  // Start/Resume playback tool
  server.tool(
    "start-resume-playback",
    "Start or resume playback on the user's active device. To play specific content, either contextUri or uris must be provided. Without either, this will resume current playback.",
    {
      deviceId: z.string().optional().describe("Spotify device ID to play on"),
      contextUri: z.string().optional().describe("Spotify URI of album/playlist/artist to play (required if playing a context)"),
      uris: z.array(z.string()).optional().describe("Array of Spotify track URIs to play (required if playing specific tracks)"),
      offset: z.object({
        position: z.number().optional(),
        uri: z.string().optional()
      }).optional().describe("Starting position (position or uri) - only valid with contextUri or uris"),
      positionMs: z.number().optional().describe("Position in milliseconds to start playback from"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ deviceId = null, contextUri = null, uris = null, offset = null, positionMs = null, userId, accessToken }) => {
      try {
        logger.debug('Starting/resuming playback', { deviceId, contextUri, uris, offset, positionMs });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.startPlayback(deviceId, contextUri, uris, offset, positionMs, userId);
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
  
  // Get playback state tool
  server.tool(
    "get-playback-state",
    "Get information about the user's current playback state",
    {
      market: z.string().optional().describe("An ISO 3166-1 alpha-2 country code"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ market = null, userId, accessToken }) => {
      try {
        logger.debug('Getting playback state from Spotify', { market });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const state = await spotifyClient.getPlaybackState(userId);
        
        // Process state to only include essential fields
        const processed = state ? {
          is_playing: state.is_playing,
          progress_ms: state.progress_ms,
          context: state.context ? {
            type: state.context.type,
            uri: state.context.uri,
            href: state.context.external_urls?.spotify
          } : null,
          item: state.item ? {
            name: state.item.name,
            uri: state.item.uri,
            href: state.item.external_urls?.spotify,
            duration_ms: state.item.duration_ms,
            explicit: state.item.explicit,
            artists: state.item.artists.map(artist => ({
              name: artist.name,
              uri: artist.uri,
              href: artist.external_urls?.spotify
            })),
            album: {
              name: state.item.album.name,
              uri: state.item.album.uri,
              href: state.item.album.external_urls?.spotify,
              images: state.item.album.images
            }
          } : null,
          device: state.device ? {
            id: state.device.id,
            name: state.device.name,
            type: state.device.type,
            is_active: state.device.is_active,
            volume_percent: state.device.volume_percent,
            supports_volume: state.device.supports_volume
          } : null,
          repeat_state: state.repeat_state,
          shuffle_state: state.shuffle_state
        } : null;
        
        // If we have a context, fetch its name
        if (processed?.context) {
          try {
            const contextId = processed.context.uri.split(':').pop();
            const contextType = processed.context.type;
            
            let contextResponse;
            if (contextType === 'playlist') {
              contextResponse = await spotifyClient.makeRequest('GET', `/playlists/${contextId}`, {}, null, userId);
              processed.context.name = contextResponse.name;
            } else if (contextType === 'album') {
              contextResponse = await spotifyClient.makeRequest('GET', `/albums/${contextId}`, {}, null, userId);
              processed.context.name = contextResponse.name;
            } else if (contextType === 'artist') {
              contextResponse = await spotifyClient.makeRequest('GET', `/artists/${contextId}`, {}, null, userId);
              processed.context.name = contextResponse.name;
            }
          } catch (error) {
            logger.warn('Error fetching context name:', error.message);
          }
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting playback state from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
    {
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ userId, accessToken }) => {
      try {
        logger.debug('Getting available devices from Spotify');
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const devices = await spotifyClient.getAvailableDevices(userId);
        
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
      market: z.string().optional().describe("An ISO 3166-1 alpha-2 country code"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ market = null, userId, accessToken }) => {
      try {
        logger.debug('Getting currently playing track from Spotify', { market });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const track = await spotifyClient.getCurrentlyPlaying(userId);
        
        // Process track to only include essential fields
        const processed = track ? {
          is_playing: track.is_playing,
          progress_ms: track.progress_ms,
          item: track.item ? {
            name: track.item.name,
            uri: track.item.uri,
            href: track.item.external_urls.spotify,
            duration_ms: track.item.duration_ms,
            artists: track.item.artists.map(artist => ({
              name: artist.name,
              uri: artist.uri,
              href: artist.external_urls.spotify
            })),
            album: {
              name: track.item.album.name,
              uri: track.item.album.uri,
              href: track.item.album.external_urls.spotify
            }
          } : null
        } : null;
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting currently playing track from Spotify', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
      after: z.number().optional().describe("Return tracks after this Unix timestamp in milliseconds"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ limit = 20, before = null, after = null, userId, accessToken }) => {
      try {
        logger.debug('Getting recently played tracks', { limit, before, after });

        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const tracks = await spotifyClient.getRecentlyPlayedTracks(limit, before, after, userId);
        
        // Process tracks to only include essential fields
        const processed = {
          items: tracks.items.map(item => ({
            played_at: item.played_at,
            track: {
              name: item.track.name,
              uri: item.track.uri,
              href: item.track.external_urls.spotify,
              artists: item.track.artists.map(artist => ({
                name: artist.name,
                uri: artist.uri,
                href: artist.external_urls.spotify
              })),
              album: {
                name: item.track.album.name,
                uri: item.track.album.uri,
                href: item.track.album.external_urls.spotify
              }
            }
          }))
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(processed)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting recently played tracks', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message
              })
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
    {
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ userId, accessToken }) => {
      try {
        logger.debug('Getting queue from Spotify');
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const queue = await spotifyClient.getQueue(userId);
        
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
      deviceId: z.string().optional().describe("Spotify device ID"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ uri, deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Adding item to queue', { uri, deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.addToQueue(uri, deviceId, userId);
        
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
  
  // Transfer playback tool
  server.tool(
    "transfer-playback",
    "Transfer playback to a different device",
    {
      deviceIds: z.union([
        z.string(),
        z.array(z.string())
      ]).describe("Spotify device ID(s) to transfer playback to"),
      play: z.boolean().optional().describe("Whether to ensure playback happens on the new device"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ deviceIds, play = false, userId, accessToken }) => {
      try {
        logger.debug('Transferring playback to device', { deviceIds, play });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.transferPlayback(deviceIds, play, userId);
        
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
  
  // Pause playback tool
  server.tool(
    "pause-playback",
    "Pause playback on the user's active device",
    {
      deviceId: z.string().optional().describe("Spotify device ID to pause on"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Pausing playback', { deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.pausePlayback(deviceId, userId);
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
      deviceId: z.string().optional().describe("Spotify device ID"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Skipping to next track', { deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.skipToNext(deviceId, userId);
        
        // Handle both JSON and non-JSON responses
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
      deviceId: z.string().optional().describe("Spotify device ID"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Skipping to previous track', { deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.skipToPrevious(deviceId, userId);
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
      deviceId: z.string().optional().describe("Spotify device ID"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ positionMs, deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Seeking to position', { positionMs, deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.seekToPosition(positionMs, deviceId, userId);
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
      deviceId: z.string().optional().describe("Spotify device ID"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ state, deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Setting repeat mode', { state, deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.setRepeatMode(state, deviceId, userId);
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
      deviceId: z.string().optional().describe("Spotify device ID"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ volumePercent, deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Setting playback volume', { volumePercent, deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.setPlaybackVolume(volumePercent, deviceId, userId);
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
      deviceId: z.string().optional().describe("Spotify device ID"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ state, deviceId = null, userId, accessToken }) => {
      try {
        logger.debug('Toggling playback shuffle', { state, deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.togglePlaybackShuffle(state, deviceId, userId);
        
        return {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? '{"success": true}' : JSON.stringify({ success: true }, null, 2)
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
  
  // Get user's playlists tool
  server.tool(
    "get-user-playlists",
    "Get a list of the user's playlists",
    {
      limit: z.number().min(1).max(50).optional().describe("Maximum number of playlists to return (default: 20)"),
      offset: z.number().min(0).optional().describe("The index of the first playlist to return"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ limit = 20, offset = 0, userId, accessToken }) => {
      try {
        logger.debug('Getting user playlists from Spotify', { limit, offset });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const playlists = await spotifyClient.makeRequest('GET', '/me/playlists', { limit, offset }, null, userId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(playlists, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting user playlists from Spotify', { error: error.message });
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

  // Search user's playlists tool
  server.tool(
    "search-user-playlists",
    "Search through the user's playlists by name",
    {
      query: z.string().describe("Search query to match against playlist names"),
      limit: z.number().min(1).max(50).optional().describe("Maximum number of playlists to return (default: 20)"),
      offset: z.number().min(0).optional().describe("The index of the first playlist to return"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ query, limit = 20, offset = 0, userId, accessToken }) => {
      try {
        logger.debug('Searching user playlists', { query });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        // Get initial page of playlists
        const response = await spotifyClient.makeRequest('GET', '/me/playlists', { limit: 50, offset: 0 }, null, userId);
        
        // Filter playlists by query
        const queryLower = query.toLowerCase();
        const matchingPlaylists = response.items.filter(playlist => 
          playlist.name.toLowerCase().includes(queryLower)
        );
        
        // If we found enough matches or there are no more playlists, return results
        if (matchingPlaylists.length >= limit || !response.next) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  total: matchingPlaylists.length,
                  playlists: matchingPlaylists.slice(offset, offset + limit)
                }, null, 2)
              }
            ]
          };
        }
        
        // Otherwise, get one more page
        const nextResponse = await spotifyClient.makeRequest('GET', '/me/playlists', { limit: 50, offset: 50 }, null, userId);
        const nextMatches = nextResponse.items.filter(playlist => 
          playlist.name.toLowerCase().includes(queryLower)
        );
        
        matchingPlaylists.push(...nextMatches);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total: matchingPlaylists.length,
                playlists: matchingPlaylists.slice(offset, offset + limit)
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error searching user playlists', { error: error.message });
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
  
  logger.info('Spotify tools registered successfully');
}

export { registerSpotifyTools }; 