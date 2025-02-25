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
      track: z.string().describe("the track name"),
      artist: z.string().describe("the artist name"),
      limit: z.number().min(1).max(100).optional().describe("maximum number of similar tracks to return")
    },
    async ({ track, artist, limit = 20 }) => {
      try {
        logger.debug('getting similar tracks from last.fm', { track, artist, limit });
        
        const results = await lastfmClient.getSimilarTracks(track, artist, limit);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('error getting similar tracks from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `error: ${error.message}`
            }
          ]
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
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('error getting similar artists from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `error: ${error.message}`
            }
          ]
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
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('error getting top tracks for artist from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `error: ${error.message}`
            }
          ]
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
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('error getting track info from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `error: ${error.message}`
            }
          ]
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
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('error getting artist info from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `error: ${error.message}`
            }
          ]
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
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('error getting top tracks by tag from last.fm', { error: error.message });
        return {
          content: [
            {
              type: "text",
              text: `error: ${error.message}`
            }
          ]
        };
      }
    }
  );
  
  logger.info('last.fm tools registered successfully');
}

export { registerLastFmTools }; 