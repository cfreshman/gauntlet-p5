/**
 * Last.fm Tools for Layer 1 (Primitives)
 * 
 * this module implements the deterministic tools for interacting with the last.fm api.
 * these tools provide direct access to last.fm api endpoints with guaranteed deterministic behavior.
 */

import lastfmClient from '../utils/lastfmClient.js';
import logger from '../utils/logger.js';
import { z } from 'zod';

/**
 * register last.fm tools with an mcp server
 * @param {mcpserver} server - the mcp server instance
 */
function registerLastFmTools(server) {
  logger.info('registering last.fm tools for layer 1');
  
  // get similar tracks tool
  server.tool(
    "get-similar-tracks",
    "get tracks similar to a specified track using last.fm",
    {
      track: z.string().describe("the track name to fetch similar tracks for"),
      artist: z.string().describe("the artist name to fetch similar tracks for"), 
      limit: z.number().min(1).max(100).optional().describe("maximum number of similar tracks to return (max 100)"),
      autocorrect: z.number().min(0).max(1).optional().default(1).describe("transform misspelled artist/track names into correct names")
    },
    async ({ track, artist, limit = 100, autocorrect = 1 }) => {
      try {
        logger.debug('getting similar tracks from last.fm', { track, artist, limit, autocorrect });
        
        const results = await lastfmClient.getSimilarTracks(track, artist, limit, autocorrect);
        
        // Handle Last.fm error responses
        if (results.error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: true,
                  code: results.error,
                  message: results.message,
                  sourceTrack: { name: track, artist }
                })
              }
            ],
            isError: true
          };
        }

        // Handle case where track/artist doesn't exist
        if (!results.similartracks || !results.similartracks.track) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: false,
                  message: "No similar tracks found - track or artist may not exist",
                  sourceTrack: { name: track, artist },
                  similarTracks: []
                })
              }
            ]
          };
        }

        // Process and validate each track - only keep essential fields
        const processedTracks = results.similartracks.track
          .filter(track => track && track.name && track.artist && track.artist.name)
          .map(track => ({
            name: track.name,
            artist: track.artist.name,
            // Only include album if it exists
            ...(track.album?.title && { album: track.album.title })
          }));

        // Return processed results
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                sourceTrack: { 
                  name: results.similartracks?.["@attr"]?.subject || track,
                  artist: results.similartracks?.["@attr"]?.artist || artist
                },
                similarTracks: processedTracks,
                totalResults: processedTracks.length
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting similar tracks from last.fm', { 
          error: error.message,
          track,
          artist,
          limit
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                sourceTrack: { name: track, artist },
                similarTracks: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // get similar artists tool
  server.tool(
    "get-similar-artists",
    "get artists similar to a specified artist using last.fm",
    {
      artist: z.string().describe("the artist name"),
      limit: z.number().min(1).max(100).optional().describe("maximum number of similar artists to return")
    },
    async ({ artist, limit = 20 }) => {
      try {
        logger.debug('getting similar artists from last.fm', { artist, limit });
        
        const results = await lastfmClient.getSimilarArtists(artist, limit);
        
        // Process response to only include artist names
        const similarArtists = results.similarartists?.artist
          ?.filter(a => a.name)
          .map(a => ({ name: a.name })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                sourceArtist: artist,
                similarArtists,
                totalResults: similarArtists.length
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting similar artists from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                sourceArtist: artist,
                similarArtists: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // get artist top tracks tool
  server.tool(
    "get-artist-top-tracks",
    "get top tracks for an artist using last.fm",
    {
      artist: z.string().describe("the artist name"),
      limit: z.number().min(1).max(100).optional().describe("maximum number of tracks to return")
    },
    async ({ artist, limit = 20 }) => {
      try {
        logger.debug('getting top tracks for artist from last.fm', { artist, limit });
        
        const results = await lastfmClient.getArtistTopTracks(artist, limit);
        
        // Process response to only include track names
        const topTracks = results.toptracks?.track
          ?.filter(t => t.name)
          .map(t => ({
            name: t.name,
            artist: artist,
            album: t.album?.name || t.album?.title
          })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                artist,
                topTracks,
                totalResults: topTracks.length
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting top tracks for artist from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                artist,
                topTracks: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Search tracks tool
  server.tool(
    "search-tracks",
    "Search for tracks on Last.fm",
    {
      query: z.string().describe("Search query"),
      limit: z.number().min(1).max(100).optional().describe("Maximum number of results"),
      page: z.number().min(1).optional().describe("Page number")
    },
    async ({ query, limit, page }) => {
      try {
        logger.debug('Searching tracks on Last.fm', { query, limit, page });
        
        const results = await lastfmClient.searchTracks(query, limit, page);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error searching tracks on Last.fm', { error: error.message });
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

  // Get track top tags tool
  server.tool(
    "get-track-top-tags",
    "Get top tags for a track on Last.fm",
    {
      track: z.string().describe("Track name"),
      artist: z.string().describe("Artist name"),
      autocorrect: z.number().min(0).max(1).optional().describe("Whether to autocorrect names")
    },
    async ({ track, artist, autocorrect }) => {
      try {
        logger.debug('Getting track top tags from Last.fm', { track, artist });
        
        const results = await lastfmClient.getTrackTopTags(track, artist, autocorrect);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Error getting track top tags from Last.fm', { error: error.message });
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

  // get artist info tool
  server.tool(
    "get-artist-info",
    "get detailed information about an artist using last.fm",
    {
      artist: z.string().describe("the artist name")
    },
    async ({ artist }) => {
      try {
        logger.debug('getting artist info from last.fm', { artist });
        
        const results = await lastfmClient.getArtistInfo(artist);
        
        // Process response to include only essential fields
        const artistInfo = results.artist ? {
          name: results.artist.name,
          listeners: results.artist.stats?.listeners,
          playcount: results.artist.stats?.playcount,
          tags: results.artist.tags?.tag?.map(t => t.name) || []
        } : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                artistInfo: artistInfo || { name: artist }
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting artist info from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                artistInfo: { name: artist }
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // get top tracks by tag tool
  server.tool(
    "get-top-tracks-by-tag",
    "get top tracks for a specific tag (genre) using last.fm",
    {
      tag: z.string().describe("the tag name (genre)"),
      limit: z.number().min(1).max(100).optional().describe("maximum number of tracks to return")
    },
    async ({ tag, limit = 20 }) => {
      try {
        logger.debug('getting top tracks by tag from last.fm', { tag, limit });
        
        const results = await lastfmClient.getTopTracksByTag(tag, limit);
        
        // Process response to only include track and artist names
        const topTracks = results.tracks?.track
          ?.filter(t => t.name && t.artist?.name)
          .map(t => ({
            name: t.name,
            artist: t.artist.name,
            album: t.album?.name || t.album?.title
          })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                tag,
                topTracks,
                totalResults: topTracks.length
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting top tracks by tag from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                tag,
                topTracks: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Get chart top tracks tool
  server.tool(
    "get-chart-top-tracks",
    "get current top tracks from last.fm charts",
    {
      limit: z.number().min(1).max(100).optional().describe("maximum number of tracks to return")
    },
    async ({ limit = 50 }) => {
      try {
        logger.debug('getting chart top tracks from last.fm', { limit });
        
        const results = await lastfmClient.getChartTopTracks(limit);
        
        // Process response to include track info
        const tracks = results.tracks?.track?.map(t => ({
          name: t.name,
          artist: t.artist.name,
          listeners: parseInt(t.listeners, 10),
          playcount: parseInt(t.playcount, 10)
        })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                tracks,
                totalResults: tracks.length
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting chart top tracks from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                tracks: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );

  // Get similar tags tool
  server.tool(
    "get-similar-tags",
    "get tags similar to a specified tag using last.fm",
    {
      tag: z.string().describe("the tag to find similar tags for")
    },
    async ({ tag }) => {
      try {
        logger.debug('getting similar tags from last.fm', { tag });
        
        const results = await lastfmClient.getTagSimilar(tag);
        
        // Process response to include tag names and match scores
        const similarTags = results.similartags?.tag?.map(t => ({
          name: t.name,
          match: parseFloat(t.match)
        })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                tag,
                similarTags
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting similar tags from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                tag,
                similarTags: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  
  // Get tag top artists tool
  server.tool(
    "get-tag-top-artists",
    "get top artists for a specific tag/genre using last.fm",
    {
      tag: z.string().describe("the tag name (genre)"),
      limit: z.number().min(1).max(100).optional().describe("maximum number of artists to return")
    },
    async ({ tag, limit = 50 }) => {
      try {
        logger.debug('getting top artists by tag from last.fm', { tag, limit });
        
        const results = await lastfmClient.getTagTopArtists(tag, limit);
        
        // Process response to include artist info
        const artists = results.topartists?.artist?.map(a => ({
          name: a.name,
          listeners: parseInt(a.listeners, 10),
          url: a.url
        })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                tag,
                artists,
                totalResults: artists.length
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting top artists by tag from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                tag,
                artists: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );

  // Get tag top albums tool
  server.tool(
    "get-tag-top-albums",
    "get top albums for a specific tag/genre using last.fm",
    {
      tag: z.string().describe("the tag name (genre)"),
      limit: z.number().min(1).max(100).optional().describe("maximum number of albums to return")
    },
    async ({ tag, limit = 50 }) => {
      try {
        logger.debug('getting top albums by tag from last.fm', { tag, limit });
        
        const results = await lastfmClient.getTagTopAlbums(tag, limit);
        
        // Process response to include album info
        const albums = results.albums?.album?.map(a => ({
          name: a.name,
          artist: a.artist.name,
          listeners: parseInt(a.listeners, 10),
          url: a.url
        })) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                tag,
                albums,
                totalResults: albums.length
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting top albums by tag from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                tag,
                albums: []
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  
  logger.info('last.fm tools registered successfully');
}

export { registerLastFmTools }; 