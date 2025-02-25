/**
 * Last.fm Music Discovery Tools (Layer 2)
 * 
 * This module provides intelligent music discovery tools using the Last.fm API.
 */

const logger = require('../utils/logger');
const lastfmClient = require('../utils/lastfmClient');
const spotifyClient = require('../utils/spotifyClient');
const { z } = require('zod');

/**
 * Register Last.fm music discovery tools with the server
 * @param {object} server - The server instance to register tools with
 */
function registerLastfmDiscoveryTools(server) {
  logger.info('Registering Last.fm Music Discovery Tools (Layer 2)...');

  // Register discover-similar-tracks tool
  server.tool(
    'discover-similar-tracks',
    'Discovers tracks similar to a specified track using Last.fm',
    {
      trackName: z.string().describe('Name of the track to find similar tracks for'),
      artistName: z.string().describe('Name of the artist of the track'),
      limit: z.number().int().min(1).max(100).default(20).describe('Number of similar tracks to return'),
      findOnSpotify: z.boolean().default(true).describe('Whether to find the tracks on Spotify')
    },
    discoverSimilarTracks
  );

  // Register discover-similar-artists tool
  server.tool(
    'discover-similar-artists',
    'Discovers artists similar to a specified artist using Last.fm',
    {
      artistName: z.string().describe('Name of the artist to find similar artists for'),
      limit: z.number().int().min(1).max(100).default(5).describe('Number of similar artists to return'),
      includeTopTracks: z.boolean().default(true).describe('Whether to include top tracks for each artist')
    },
    discoverSimilarArtists
  );

  // Register discover-by-tag tool
  server.tool(
    'discover-by-tag',
    'Discovers music by tag/genre using Last.fm',
    {
      tag: z.string().describe('Tag/genre to discover music by'),
      type: z.enum(['tracks', 'artists', 'albums']).default('tracks').describe('Type of content to discover'),
      limit: z.number().int().min(1).max(100).default(5).describe('Number of items to return'),
      findOnSpotify: z.boolean().default(true).describe('Whether to find the items on Spotify (for tracks)')
    },
    discoverByTag
  );

  logger.info('Last.fm Music Discovery Tools registered successfully');
}

/**
 * Discovers tracks similar to a specified track using Last.fm
 * @param {object} params - The parameters for track discovery
 * @returns {Promise<object>} - The discovery results
 */
async function discoverSimilarTracks(params) {
  const { 
    trackName, 
    artistName, 
    limit = 20,
    findOnSpotify = true
  } = params;
  
  try {
    logger.info(`Discovering tracks similar to "${trackName}" by "${artistName}"`);
    
    // Get similar tracks from Last.fm
    const similarTracksResponse = await lastfmClient.getSimilarTracks(trackName, artistName, limit);
    
    if (!similarTracksResponse.similartracks || !similarTracksResponse.similartracks.track || similarTracksResponse.similartracks.track.length === 0) {
      throw new Error('No similar tracks found');
    }
    
    const similarTracks = similarTracksResponse.similartracks.track;
    logger.info(`Found ${similarTracks.length} similar tracks on Last.fm`);
    
    // Process the tracks
    let processedTracks = similarTracks.map(track => ({
      name: track.name,
      artist: track.artist.name,
      match: parseFloat(track.match) * 10, // Convert match score to percentage
      url: track.url,
      images: track.image ? track.image.reduce((acc, img) => {
        acc[img.size] = img['#text'];
        return acc;
      }, {}) : {}
    }));
    
    // Find tracks on Spotify if requested
    if (findOnSpotify) {
      processedTracks = await findTracksOnSpotify(processedTracks);
    }
    
    // Generate insights
    const insights = generateDiscoveryInsights(processedTracks);
    
    // Construct the response
    const response = {
      sourceTrack: {
        name: trackName,
        artist: artistName
      },
      similarTracks: processedTracks,
      insights
    };
    
    // Return in MCP format
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
    
  } catch (error) {
    logger.error(`Error discovering similar tracks: ${error.message}`);
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

/**
 * Discovers artists similar to a specified artist using Last.fm
 * @param {object} params - The parameters for artist discovery
 * @returns {Promise<object>} - The discovery results
 */
async function discoverSimilarArtists(params) {
  const { 
    artistName, 
    limit = 5,
    includeTopTracks = false
  } = params;
  
  try {
    logger.info(`Discovering artists similar to "${artistName}"`);
    
    // Enforce a reasonable limit
    const actualLimit = Math.min(limit, 10); // Cap at 10 max
    
    // Get similar artists from Last.fm
    const similarArtistsResponse = await lastfmClient.getSimilarArtists(artistName, actualLimit);
    
    if (!similarArtistsResponse.similarartists || !similarArtistsResponse.similarartists.artist || similarArtistsResponse.similarartists.artist.length === 0) {
      throw new Error('No similar artists found');
    }
    
    const similarArtists = similarArtistsResponse.similarartists.artist;
    logger.info(`Found ${similarArtists.length} similar artists on Last.fm`);
    
    // Process the artists
    let processedArtists = await Promise.all(similarArtists.map(async (artist) => {
      const artistData = {
        name: artist.name,
        match: parseFloat(artist.match) * 10, // Convert match score to percentage
        url: artist.url,
        images: artist.image ? artist.image.reduce((acc, img) => {
          acc[img.size] = img['#text'];
          return acc;
        }, {}) : {}
      };
      
      // Include top tracks if requested
      if (includeTopTracks) {
        try {
          const topTracksResponse = await lastfmClient.getArtistTopTracks(artist.name, 5); // Limit to 5 top tracks
          if (topTracksResponse.toptracks && topTracksResponse.toptracks.track) {
            artistData.topTracks = topTracksResponse.toptracks.track.map(track => ({
              name: track.name,
              listeners: parseInt(track.listeners, 10),
              url: track.url
            }));
          }
        } catch (error) {
          logger.debug(`Could not get top tracks for ${artist.name}: ${error.message}`);
          artistData.topTracks = [];
        }
      }
      
      return artistData;
    }));
    
    // Generate insights
    const insights = {
      summary: `Discovered ${processedArtists.length} artists similar to ${artistName}.`,
      matchDistribution: {
        high: processedArtists.filter(artist => artist.match >= 70).length,
        medium: processedArtists.filter(artist => artist.match >= 40 && artist.match < 70).length,
        low: processedArtists.filter(artist => artist.match < 40).length
      }
    };
    
    // Construct the response
    const response = {
      sourceArtist: artistName,
      similarArtists: processedArtists,
      insights
    };
    
    // Return in MCP format
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
    
  } catch (error) {
    logger.error(`Error discovering similar artists: ${error.message}`);
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

/**
 * Discovers top tracks for a specified tag/genre using Last.fm
 * @param {object} params - The parameters for tag-based discovery
 * @returns {Promise<object>} - The discovery results
 */
async function discoverByTag(params) {
  const { 
    tag, 
    type = 'tracks',
    limit = 5, // Default to 5 instead of 20
    findOnSpotify = true
  } = params;
  
  try {
    logger.info(`Discovering top ${type} for tag "${tag}"`);
    
    // Enforce a reasonable limit
    const actualLimit = Math.min(limit, 10); // Cap at 10 max
    
    // Get top tracks by tag from Last.fm
    const topTracksResponse = await lastfmClient.getTopTracksByTag(tag, actualLimit);
    
    if (!topTracksResponse.tracks || !topTracksResponse.tracks.track || topTracksResponse.tracks.track.length === 0) {
      throw new Error(`No tracks found for tag "${tag}"`);
    }
    
    const topTracks = topTracksResponse.tracks.track;
    logger.info(`Found ${topTracks.length} top tracks for tag "${tag}" on Last.fm`);
    
    // Process the tracks
    let processedTracks = topTracks.map(track => ({
      name: track.name,
      artist: track.artist.name,
      rank: parseInt(track['@attr']?.rank || '0', 10),
      url: track.url,
      images: track.image ? track.image.reduce((acc, img) => {
        acc[img.size] = img['#text'];
        return acc;
      }, {}) : {}
    }));
    
    // Find tracks on Spotify if requested
    if (findOnSpotify) {
      processedTracks = await findTracksOnSpotify(processedTracks);
    }
    
    // Generate insights
    const insights = {
      summary: `Discovered ${processedTracks.length} top tracks for the "${tag}" tag.`,
      topArtists: findTopArtists(processedTracks)
    };
    
    // Construct the response
    const response = {
      tag,
      tracks: processedTracks,
      insights
    };
    
    // Return in MCP format
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
    
  } catch (error) {
    logger.error(`Error discovering tracks by tag: ${error.message}`);
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

/**
 * Find tracks on Spotify based on track name and artist
 * @param {Array} tracks - Array of tracks with name and artist
 * @returns {Promise<Array>} - Tracks with Spotify information
 */
async function findTracksOnSpotify(tracks) {
  const tracksWithSpotify = await Promise.all(tracks.map(async (track) => {
    try {
      // Search for the track on Spotify
      const query = `${track.name} ${track.artist}`;
      const searchResults = await spotifyClient.search(query, ['track'], 1);
      
      if (searchResults.tracks && searchResults.tracks.items.length > 0) {
        const spotifyTrack = searchResults.tracks.items[0];
        
        // Add Spotify information to the track
        return {
          ...track,
          spotify: {
            id: spotifyTrack.id,
            uri: spotifyTrack.uri,
            popularity: spotifyTrack.popularity,
            previewUrl: spotifyTrack.preview_url,
            externalUrl: spotifyTrack.external_urls.spotify,
            album: {
              id: spotifyTrack.album.id,
              name: spotifyTrack.album.name,
              images: spotifyTrack.album.images
            }
          }
        };
      }
      
      // Return the original track if not found on Spotify
      return {
        ...track,
        spotify: null
      };
    } catch (error) {
      logger.debug(`Could not find "${track.name}" by "${track.artist}" on Spotify: ${error.message}`);
      
      // Return the original track if there's an error
      return {
        ...track,
        spotify: null
      };
    }
  }));
  
  return tracksWithSpotify;
}

/**
 * Generate insights from discovered tracks
 * @param {Array} tracks - Array of track objects
 * @returns {Object} - Insights object
 */
function generateDiscoveryInsights(tracks) {
  const insights = {
    summary: `Discovered ${tracks.length} tracks.`,
    topArtists: findTopArtists(tracks),
    spotifyAvailability: {
      available: tracks.filter(track => track.spotify).length,
      unavailable: tracks.filter(track => !track.spotify).length,
      percentage: Math.round((tracks.filter(track => track.spotify).length / tracks.length) * 100)
    }
  };
  
  // Add popularity insights if Spotify data is available
  const tracksWithPopularity = tracks.filter(track => track.spotify && track.spotify.popularity);
  
  if (tracksWithPopularity.length > 0) {
    const popularityValues = tracksWithPopularity.map(track => track.spotify.popularity);
    
    insights.popularityRange = {
      min: Math.min(...popularityValues),
      max: Math.max(...popularityValues),
      average: Math.round(popularityValues.reduce((sum, val) => sum + val, 0) / popularityValues.length)
    };
  }
  
  return insights;
}

/**
 * Find top artists from a list of tracks
 * @param {Array} tracks - Array of track objects
 * @returns {Array} - Array of top artists with counts
 */
function findTopArtists(tracks) {
  const artistCounts = {};
  
  tracks.forEach(track => {
    const artistName = track.artist;
    if (!artistCounts[artistName]) {
      artistCounts[artistName] = {
        name: artistName,
        count: 0
      };
    }
    artistCounts[artistName].count++;
  });
  
  return Object.values(artistCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

module.exports = {
  registerLastfmDiscoveryTools
}; 