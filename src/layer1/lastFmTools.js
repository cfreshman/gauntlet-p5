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
  
  // get track info tool
  server.tool(
    "get-track-info",
    "get detailed information about a track using last.fm",
    {
      track: z.string().describe("the track name"),
      artist: z.string().describe("the artist name")
    },
    async ({ track, artist }) => {
      try {
        logger.debug('getting track info from last.fm', { track, artist });
        
        const results = await lastfmClient.getTrackInfo(track, artist);
        
        // Process response to include only essential fields
        const trackInfo = results.track ? {
          name: results.track.name,
          artist: results.track.artist?.name,
          album: results.track.album?.title,
          listeners: results.track.listeners,
          playcount: results.track.playcount
        } : null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: false,
                trackInfo: trackInfo || { name: track, artist }
              })
            }
          ]
        };
      } catch (error) {
        logger.error('error getting track info from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error.message,
                trackInfo: { name: track, artist }
              })
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
  
  logger.info('last.fm tools registered successfully');
}

export { registerLastFmTools }; 