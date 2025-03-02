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
    "Direct text search for items on Spotify. This performs exact text matching against track/artist/album names - it is NOT a semantic/similarity search and will not find 'similar' items. For best results with tracks, use format: track:songname artist:artistname",
    {
      query: z.string().describe("Text to search for. For tracks, use format: track:songname artist:artistname. This is an exact text match, not a semantic search"),
      types: z.array(z.enum(['track', 'artist', 'album', 'playlist'])).describe("What to search for: track, artist, album, or playlist"),
      limit: z.number().min(1).max(50).optional().describe("Maximum number of results"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
      market: z.string().optional().describe("Market code (ISO 3166-1 alpha-2)")
    },
    async ({ query, types, limit = 20, offset = 0, market = 'US' }) => {
      try {
        logger.debug('Searching Spotify', { query, types, limit, offset, market });
        
        // Convert types to array if it's a string
        const typesArray = typeof types === 'string' ? [types] : types;
        
        const results = await spotifyClient.search(query, typesArray, limit, offset, market);
        if (!results) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: true, message: "No results found" })
              }
            ],
            isError: true
          };
        }
        
        // Process results to only include essential fields
        const processed = {};
        
        if (results.tracks?.items) {
          processed.tracks = {
            items: results.tracks.items.map(track => ({
              name: track?.name || 'Unknown Track',
              uri: track?.uri,
              href: track?.external_urls?.spotify,
              artists: track?.artists?.map(artist => ({
                name: artist?.name || 'Unknown Artist',
                uri: artist?.uri,
                href: artist?.external_urls?.spotify
              })) || [],
              album: track?.album ? {
                name: track.album.name || 'Unknown Album',
                uri: track.album.uri,
                href: track.album.external_urls?.spotify
              } : null
            })).filter(t => t.uri && t.name !== 'Unknown Track'),
            total: results.tracks.total || 0
          };
        }
        
        if (results.artists?.items) {
          processed.artists = {
            items: results.artists.items.map(artist => ({
              name: artist?.name || 'Unknown Artist',
              uri: artist?.uri,
              href: artist?.external_urls?.spotify
            })).filter(a => a.uri && a.name !== 'Unknown Artist'),
            total: results.artists.total || 0
          };
        }
        
        if (results.albums?.items) {
          processed.albums = {
            items: results.albums.items.map(album => ({
              name: album?.name || 'Unknown Album',
              uri: album?.uri,
              href: album?.external_urls?.spotify,
              artists: album?.artists?.map(artist => ({
                name: artist?.name || 'Unknown Artist',
                uri: artist?.uri,
                href: artist?.external_urls?.spotify
              })) || []
            })).filter(a => a.uri && a.name !== 'Unknown Album'),
            total: results.albums.total || 0
          };
        }
        
        if (results.playlists?.items) {
          processed.playlists = {
            items: results.playlists.items.map(playlist => ({
              name: playlist?.name || 'Unknown Playlist',
              uri: playlist?.uri,
              href: playlist?.external_urls?.spotify,
              owner: playlist?.owner ? {
                id: playlist.owner.id,
                name: playlist.owner.display_name || 'Unknown User'
              } : null
            })).filter(p => p.uri && p.name !== 'Unknown Playlist'),
            total: results.playlists.total || 0
          };
        }
        
        // Check if we actually found any valid results
        const hasResults = Object.values(processed).some(type => type?.items?.length > 0);
        if (!hasResults) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: true, message: "No valid results found" })
              }
            ],
            isError: true
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
  
  // Targeted search tool
  server.tool(
    "search-spotify-targeted",
    "Precise text search for a specific item on Spotify. This performs exact text matching - it is NOT a semantic/similarity search and will not find 'similar' items. PREFER THIS OVER search-spotify when you need exactly one result (e.g., finding a specific track, artist, album, or playlist). Returns only the best exact text match. The type parameter is always required, even if the query includes a type: prefix.",
    {
      query: z.string().describe("The search query. For tracks, you can use format: track:songname artist:artistname, but the type parameter is still required. This is an exact text match, not a semantic search"),
      type: z.enum(['track', 'artist', 'album', 'playlist']).describe("The type of item to search for. Required even if query includes a type: prefix"),
      market: z.string().optional().describe("Market code (ISO 3166-1 alpha-2)")
    },
    async ({ query, type, market = 'US' }) => {
      try {
        // Format query properly based on type
        let formattedQuery = query;
        if (type === 'track') {
          // Extract artist name if present
          const artistMatch = query.match(/artist:([^:]+)/i);
          const artist = artistMatch ? artistMatch[1].trim() : '';
          
          // Remove the artist: prefix from the query
          let trackName = query.replace(/artist:[^:]+/i, '').trim();
          
          // Remove track: prefix if present
          trackName = trackName.replace(/^track:/i, '').trim();
          
          // Build proper query
          formattedQuery = `${trackName}${artist ? ` artist:"${artist}"` : ''}`;
        } else {
          // Remove any type: prefix
          formattedQuery = formattedQuery.replace(new RegExp(`^${type}:`, 'i'), '').trim();
          formattedQuery = `${type}:"${formattedQuery}"`;
        }
        
        logger.debug('Targeted Spotify search', { query: formattedQuery, type, market });
        
        const results = await spotifyClient.search(formattedQuery, [type], 1, 0, market);
        if (!results) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ result: null, message: "No results found" })
              }
            ]
          };
        }
        
        // Get the first result if any
        const items = results[`${type}s`]?.items || [];
        const result = items[0];
        
        if (!result) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ result: null, message: "No matches found" })
              }
            ]
          };
        }
        
        // Process the result based on type
        let processed;
        try {
          switch (type) {
            case 'track':
              if (!result.name || !result.uri) throw new Error("Invalid track data");
              processed = {
                name: result.name,
                uri: result.uri,
                href: result.external_urls?.spotify,
                artists: result.artists?.map(artist => ({
                  name: artist?.name || 'Unknown Artist',
                  uri: artist?.uri,
                  href: artist?.external_urls?.spotify
                })) || [],
                album: result.album ? {
                  name: result.album.name || 'Unknown Album',
                  uri: result.album.uri,
                  href: result.album.external_urls?.spotify
                } : null,
                duration_ms: result.duration_ms,
                popularity: result.popularity
              };
              break;
              
            case 'artist':
              if (!result.name || !result.uri) throw new Error("Invalid artist data");
              processed = {
                name: result.name,
                uri: result.uri,
                href: result.external_urls?.spotify,
                genres: result.genres || [],
                popularity: result.popularity
              };
              break;
              
            case 'album':
              if (!result.name || !result.uri) throw new Error("Invalid album data");
              processed = {
                name: result.name,
                uri: result.uri,
                href: result.external_urls?.spotify,
                artists: result.artists?.map(artist => ({
                  name: artist?.name || 'Unknown Artist',
                  uri: artist?.uri,
                  href: artist?.external_urls?.spotify
                })) || [],
                release_date: result.release_date,
                total_tracks: result.total_tracks
              };
              break;
              
            case 'playlist':
              if (!result.name || !result.uri) throw new Error("Invalid playlist data");
              processed = {
                name: result.name,
                uri: result.uri,
                href: result.external_urls?.spotify,
                owner: result.owner ? {
                  id: result.owner.id,
                  name: result.owner.display_name || 'Unknown User'
                } : null,
                tracks: {
                  total: result.tracks?.total || 0
                }
              };
              break;
          }
        } catch (error) {
          logger.error('Error processing search result:', error);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ 
                  result: null, 
                  message: "Found a result but it was missing required data",
                  error: error.message 
                })
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: processed })
            }
          ]
        };
      } catch (error) {
        logger.error('Error in targeted Spotify search', { error: error.message });
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
  
  /**
   * Calculate a confidence score for how well the result matches the query
   * @param {string} query - The search query
   * @param {object} result - The search result
   * @returns {number} - Confidence score between 0 and 1
   */
  function calculateConfidence(query, result) {
    // Remove type qualifier from query
    const cleanQuery = query.replace(/^(track:|artist:|album:|playlist:)/i, '').toLowerCase();
    const terms = cleanQuery.split(/\s+/);
    
    // Get relevant text from result to match against
    const textToMatch = [
      result.name,
      ...(result.artists ? result.artists.map(a => a.name) : []),
      result.album?.name
    ].filter(Boolean).join(' ').toLowerCase();
    
    // Calculate what percentage of query terms appear in the result
    const matchedTerms = terms.filter(term => textToMatch.includes(term));
    return matchedTerms.length / terms.length;
  }
  
  // Convert Last.fm to Spotify tool
  server.tool(
    "convert-lastfm-to-spotify",
    "Convert Last.fm links to Spotify links",
    {
      artist: z.string().describe("The name of the artist"),
      track: z.string().optional().describe("The name of the track (optional)")
    },
    async ({ artist, track }) => {
      try {
        logger.info('Converting Last.fm to Spotify', { artist, track });
        
        // Use search to find the artist/track
        let searchQuery = artist;
        if (track) {
          searchQuery = `${track} artist:${artist}`;
        }
        
        const types = track ? ['track'] : ['artist'];
        const results = await spotifyClient.search(searchQuery, types, 1);
        
        // Extract the Spotify URL from the search result
        let spotifyUrl = null;
        let spotifyData = null;
        
        if (track && results.tracks && results.tracks.items && results.tracks.items.length > 0) {
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
                  artist: artist,
                  track: track || null
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
                  artist: artist,
                  track: track || null
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
    "Get track details by exact Spotify track ID (not URI). Returns basic track metadata like name, artists, album.",
    {
      trackId: z.string().describe("The Spotify track ID (22 character string, not the full URI)"),
      market: z.string().optional().describe("Market code (ISO 3166-1 alpha-2)")
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
  
  // Get playlist tool
  server.tool(
    "get-playlist",
    "Get playlist details by exact Spotify playlist ID. Returns metadata and tracks in the playlist.",
    {
      playlist: z.string().describe("The Spotify playlist ID (not URI)"),
      fields: z.string().optional().describe("Comma-separated list of fields to return"),
      market: z.string().optional().describe("Market code (ISO 3166-1 alpha-2)"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ playlist, fields = null, market = null, userId, accessToken }) => {
      try {
        logger.debug('Getting playlist from Spotify', { playlist, fields, market });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const result = await spotifyClient.getPlaylist(playlist, fields, market, userId);
        
        // Process playlist to only include essential fields
        const processed = {
          name: result.name,
          uri: result.uri,
          href: result.external_urls.spotify,
          description: result.description,
          owner: {
            id: result.owner.id,
            name: result.owner.display_name
          },
          tracks: {
            total: result.tracks.total,
            items: result.tracks.items?.map(item => ({
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
      playlist: z.string().describe("The Spotify playlist ID (not URI)"),
      limit: z.number().min(1).max(100).optional().describe("Maximum number of tracks to return"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
      market: z.string().optional().describe("Market code (ISO 3166-1 alpha-2)"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ playlist, limit = 20, offset = 0, market = null, userId, accessToken }) => {
      try {
        logger.debug('Getting playlist tracks from Spotify', { playlist, limit, offset, market });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        const tracks = await spotifyClient.getPlaylistTracks(playlist, limit, offset, market, userId);
        
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
    "Add tracks to a playlist by their Spotify track URIs or IDs. Accepts either format: full URI (spotify:track:abc123) or just ID (abc123).",
    {
      playlist: z.string().describe("The Spotify playlist ID (not URI)"),
      tracks: z.union([
        z.string(),
        z.array(z.string())
      ]).describe("Track URI(s) or ID(s) to add. Can be full URIs (spotify:track:abc123) or just IDs (abc123)"),
      position: z.number().optional().describe("Position to insert tracks (0-based index)"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ playlist, tracks, position = null, userId, accessToken }) => {
      try {
        logger.debug('Adding tracks to playlist on Spotify', { playlist, tracks, position });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });

        // Normalize to array
        const uriArray = Array.isArray(tracks) ? tracks : [tracks];
        
        // Validate URIs
        const validatedUris = uriArray.map(uri => {
          // If it's already a full URI, validate format
          if (uri.startsWith('spotify:track:')) {
            const id = uri.split(':')[2];
            if (!/^[0-9A-Za-z]{22}$/.test(id)) {
              throw new Error(`Invalid Spotify track ID in URI: ${uri}`);
            }
            return uri;
          }
          
          // If it's just an ID, validate and convert to URI
          if (/^[0-9A-Za-z]{22}$/.test(uri)) {
            return `spotify:track:${uri}`;
          }
          
          throw new Error(`Invalid Spotify track URI or ID: ${uri}`);
        });
        
        const result = await spotifyClient.addTracksToPlaylist(playlist, validatedUris, position, userId);
        
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
  
  // Add to queue tool
  server.tool(
    "add-to-queue",
    "Add tracks to the end of user's playback queue. Only accepts track URIs/IDs - cannot queue playlists/albums/artists directly.",
    {
      tracks: z.union([
        z.string(),
        z.array(z.string())
      ]).describe("Track URI(s) or ID(s) to add. Can be full URIs (spotify:track:abc123) or just IDs (abc123). MUST be tracks - cannot queue playlists/albums/artists."),
      deviceId: z.string().optional().describe("Optional Spotify device ID. If not provided, uses active device"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ tracks, deviceId, userId, accessToken }) => {
      try {
        logger.debug('Adding track(s) to queue', { tracks, deviceId });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000
        });

        // Normalize to array
        const uriArray = Array.isArray(tracks) ? tracks : [tracks];
        
        // Validate and normalize URIs
        const validatedUris = uriArray.map(uri => {
          // If it's already a full URI, validate format
          if (uri.startsWith('spotify:track:')) {
            const id = uri.split(':')[2];
            if (!/^[0-9A-Za-z]{22}$/.test(id)) {
              throw new Error(`Invalid Spotify track ID in URI: ${uri}`);
            }
            return uri;
          }
          
          // If it's just an ID, validate and convert to URI
          if (/^[0-9A-Za-z]{22}$/.test(uri)) {
            return `spotify:track:${uri}`;
          }
          
          throw new Error(`Invalid Spotify track URI or ID: ${uri}. Note: Cannot queue playlists/albums/artists - only individual tracks.`);
        });
        
        await spotifyClient.addToQueue(validatedUris, deviceId, userId);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error adding tracks to queue', { error: error.message });
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
    "Get the user's current playback queue. Returns currently playing track and upcoming tracks in queue.",
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
    "Pause playback on specified device or active device if none specified.",
    {
      deviceId: z.string().optional().describe("Optional Spotify device ID. If not provided, uses active device"),
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
    "skip-next",
    "Skip forward in queue by specified number of tracks. Skips one track if count not specified.",
    {
      deviceId: z.string().optional().describe("Optional Spotify device ID. If not provided, uses active device"),
      count: z.number().min(1).optional().describe("Number of tracks to skip. Defaults to 1 if not specified"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ deviceId, count, userId, accessToken }) => {
      try {
        logger.debug('Skipping to next track(s)', { deviceId, count });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000
        });
        
        await spotifyClient.skipToNext(deviceId, userId, count);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error skipping to next', { error: error.message });
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
    "skip-previous",
    "Skip backward in queue by specified number of tracks. Skips one track if count not specified.",
    {
      deviceId: z.string().optional().describe("Optional Spotify device ID. If not provided, uses active device"),
      count: z.number().min(1).optional().describe("Number of tracks to skip. Defaults to 1 if not specified"),
      userId: z.string().describe("User ID for user-specific tokens"),
      accessToken: z.string().describe("Spotify access token")
    },
    async ({ deviceId, count, userId, accessToken }) => {
      try {
        logger.debug('Skipping to previous track(s)', { deviceId, count });
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000
        });
        
        await spotifyClient.skipToPrevious(deviceId, userId, count);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true }, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error skipping to previous', { error: error.message });
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