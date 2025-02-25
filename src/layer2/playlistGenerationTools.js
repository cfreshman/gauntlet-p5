/**
 * Playlist Generation Tools (Layer 2)
 * 
 * This module provides intelligent playlist generation tools that build on the Layer 1 Spotify API tools.
 */

import logger from '../utils/logger.js';
import spotifyClient from '../utils/spotifyClient.js';

/**
 * Register playlist generation tools with the server
 * @param {object} server - The server instance to register tools with
 */
function registerPlaylistGenerationTools(server) {
  logger.info('Registering Playlist Generation Tools (Layer 2)...');

  // Register generate-playlist tool
  server.tool(
    'generate-playlist',
    'Generates a playlist based on specified criteria',
    {
      name: {
        type: 'string',
        description: 'Name for the generated playlist'
      },
      description: {
        type: 'string',
        description: 'Description for the generated playlist'
      },
      criteria: {
        type: 'object',
        description: 'Criteria for selecting tracks'
      },
      trackCount: {
        type: 'number',
        description: 'Number of tracks to include in the playlist',
        default: 20
      },
      isPublic: {
        type: 'boolean',
        description: 'Whether the playlist should be public',
        default: false
      }
    },
    generatePlaylist
  );

  // Register enhance-playlist tool
  server.tool(
    'enhance-playlist',
    'Enhances an existing playlist with additional tracks that fit the theme',
    {
      playlistId: {
        type: 'string',
        description: 'Spotify ID of the playlist to enhance'
      },
      trackCount: {
        type: 'number',
        description: 'Number of tracks to add',
        default: 5
      },
      preserveOrder: {
        type: 'boolean',
        description: 'Whether to preserve the original order',
        default: true
      },
      diversify: {
        type: 'boolean',
        description: 'Whether to diversify the recommendations',
        default: false
      }
    },
    enhancePlaylist
  );

  logger.info('Playlist Generation Tools registered successfully');
}

/**
 * Generates a playlist based on specified criteria
 * @param {object} params - The parameters for playlist generation
 * @returns {Promise<object>} - The generated playlist
 */
async function generatePlaylist(params) {
  const { 
    name, 
    description = '', 
    criteria, 
    trackCount = 20, 
    isPublic = false 
  } = params;
  
  try {
    logger.info(`Generating playlist "${name}" with ${trackCount} tracks`);
    
    // Validate criteria
    validatePlaylistCriteria(criteria);
    
    // Get recommendations based on criteria
    const recommendations = await getRecommendations(criteria, trackCount);
    
    if (!recommendations.tracks || recommendations.tracks.length === 0) {
      throw new Error('No tracks found matching the criteria');
    }
    
    logger.info(`Found ${recommendations.tracks.length} tracks for playlist`);
    
    // Create a new playlist
    const playlist = await spotifyClient.createPlaylist(name, description, isPublic);
    
    // Add tracks to the playlist
    const trackUris = recommendations.tracks.map(track => track.uri);
    await spotifyClient.addTracksToPlaylist(playlist.id, trackUris);
    
    // Construct the response
    const response = {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        url: playlist.external_urls.spotify,
        trackCount: trackUris.length
      },
      tracks: recommendations.tracks.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => artist.name),
        album: track.album.name,
        uri: track.uri
      })),
      criteria: criteria
    };
    
    logger.info(`Playlist "${name}" (${playlist.id}) created successfully with ${trackUris.length} tracks`);
    return response;
    
  } catch (error) {
    logger.error(`Error generating playlist: ${error.message}`);
    throw new Error(`Failed to generate playlist: ${error.message}`);
  }
}

/**
 * Enhances an existing playlist with additional tracks
 * @param {object} params - The parameters for playlist enhancement
 * @returns {Promise<object>} - The enhanced playlist
 */
async function enhancePlaylist(params) {
  const { 
    playlistId, 
    trackCount = 5, 
    preserveOrder = true, 
    diversify = false 
  } = params;
  
  try {
    logger.info(`Enhancing playlist ${playlistId} with ${trackCount} tracks`);
    
    // Get the existing playlist
    const playlist = await spotifyClient.getPlaylist(playlistId);
    
    // Get the existing tracks
    const existingTracks = await spotifyClient.getPlaylistTracks(playlistId);
    
    if (!existingTracks.items || existingTracks.items.length === 0) {
      throw new Error('Playlist has no tracks to analyze for enhancement');
    }
    
    logger.info(`Analyzing ${existingTracks.items.length} existing tracks in playlist`);
    
    // Extract track IDs and URIs
    const existingTrackIds = existingTracks.items.map(item => item.track.id);
    const existingTrackUris = existingTracks.items.map(item => item.track.uri);
    
    // Analyze the existing tracks to determine enhancement criteria
    let enhancementCriteria;
    
    if (preserveOrder) {
      // Analyze audio features of existing tracks to determine style
      enhancementCriteria = await analyzePlaylistStyle(existingTrackIds, diversify);
    } else {
      // Use provided criteria directly
      enhancementCriteria = {
        seed_artists: existingTrackIds,
        seed_tracks: existingTrackIds,
        seed_genres: existingTrackIds,
        target_energy: 0.5,
        target_danceability: 0.5,
        target_valence: 0.5,
        target_tempo: 120,
        target_acousticness: 0.5,
        target_instrumentalness: 0.5,
        min_popularity: 0
      };
    }
    
    // Select seed tracks from the playlist
    if (!enhancementCriteria.seed_tracks) {
      enhancementCriteria.seed_tracks = selectSeedTracks(existingTrackIds);
    }
    
    // Get recommendations based on the enhancement criteria
    const recommendations = await getRecommendations(enhancementCriteria, trackCount * 2);
    
    if (!recommendations.tracks || recommendations.tracks.length === 0) {
      throw new Error('No tracks found matching the enhancement criteria');
    }
    
    // Filter out tracks that are already in the playlist
    const newTracks = recommendations.tracks.filter(track => 
      !existingTrackUris.includes(track.uri)
    ).slice(0, trackCount);
    
    if (newTracks.length === 0) {
      throw new Error('All recommended tracks are already in the playlist');
    }
    
    logger.info(`Adding ${newTracks.length} new tracks to playlist`);
    
    // Add the new tracks to the playlist
    const newTrackUris = newTracks.map(track => track.uri);
    await spotifyClient.addTracksToPlaylist(playlistId, newTrackUris);
    
    // Construct the response
    const response = {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        url: playlist.external_urls.spotify,
        originalTrackCount: existingTracks.items.length,
        addedTrackCount: newTracks.length,
        newTrackCount: existingTracks.items.length + newTracks.length
      },
      addedTracks: newTracks.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => artist.name),
        album: track.album.name,
        uri: track.uri
      })),
      enhancementCriteria
    };
    
    logger.info(`Playlist ${playlistId} enhanced successfully with ${newTracks.length} tracks`);
    return response;
    
  } catch (error) {
    logger.error(`Error enhancing playlist: ${error.message}`);
    throw new Error(`Failed to enhance playlist: ${error.message}`);
  }
}

/**
 * Validates the playlist generation criteria
 * @param {object} criteria - The criteria to validate
 * @throws {Error} If the criteria are invalid
 */
function validatePlaylistCriteria(criteria) {
  // Check if at least one seed type is provided
  const hasSeeds = (
    (criteria.seed_artists && criteria.seed_artists.length > 0) ||
    (criteria.seed_tracks && criteria.seed_tracks.length > 0) ||
    (criteria.seed_genres && criteria.seed_genres.length > 0)
  );
  
  if (!hasSeeds) {
    throw new Error('At least one seed artist, track, or genre must be provided');
  }
  
  // Check seed limits (Spotify API allows up to 5 seed values in total)
  const seedCount = (
    (criteria.seed_artists ? criteria.seed_artists.length : 0) +
    (criteria.seed_tracks ? criteria.seed_tracks.length : 0) +
    (criteria.seed_genres ? criteria.seed_genres.length : 0)
  );
  
  if (seedCount > 5) {
    throw new Error('Maximum of 5 seeds (artists + tracks + genres) allowed');
  }
  
  // Validate numeric ranges
  const numericParams = [
    'target_energy', 'target_danceability', 'target_valence',
    'target_acousticness', 'target_instrumentalness'
  ];
  
  numericParams.forEach(param => {
    if (criteria[param] !== undefined) {
      if (criteria[param] < 0 || criteria[param] > 1) {
        throw new Error(`${param} must be between 0.0 and 1.0`);
      }
    }
  });
  
  if (criteria.min_popularity !== undefined) {
    if (criteria.min_popularity < 0 || criteria.min_popularity > 100) {
      throw new Error('min_popularity must be between 0 and 100');
    }
  }
}

/**
 * Gets track recommendations based on criteria
 * @param {object} criteria - The criteria for recommendations
 * @param {number} limit - Maximum number of tracks to return
 * @returns {Promise<object>} - The recommendations
 */
async function getRecommendations(criteria, limit) {
  // Prepare parameters for the recommendations API
  const params = {
    limit: Math.min(limit, 100), // Spotify API limit is 100
    ...criteria
  };
  
  // Get recommendations from Spotify API
  return await spotifyClient.getRecommendations(params);
}

/**
 * Analyzes the style of a playlist based on its tracks
 * @param {string[]} trackIds - Array of track IDs in the playlist
 * @param {boolean} diversify - Whether to diversify recommendations
 * @returns {Promise<object>} - Style criteria for the playlist
 */
async function analyzePlaylistStyle(trackIds, diversify = false) {
  // Get audio features for all tracks
  const audioFeatures = await Promise.all(
    trackIds.slice(0, 100).map(trackId => spotifyClient.getAudioFeatures(trackId))
  );
  
  // Calculate average values for key features
  const averages = audioFeatures.reduce((acc, features) => {
    acc.energy.push(features.energy);
    acc.danceability.push(features.danceability);
    acc.valence.push(features.valence);
    acc.acousticness.push(features.acousticness);
    acc.instrumentalness.push(features.instrumentalness);
    acc.tempo.push(features.tempo);
    return acc;
  }, {
    energy: [],
    danceability: [],
    valence: [],
    acousticness: [],
    instrumentalness: [],
    tempo: []
  });
  
  // Calculate the average for each feature
  const calculateAverage = values => values.reduce((sum, val) => sum + val, 0) / values.length;
  
  const style = {
    target_energy: calculateAverage(averages.energy),
    target_danceability: calculateAverage(averages.danceability),
    target_valence: calculateAverage(averages.valence),
    target_acousticness: calculateAverage(averages.acousticness),
    target_instrumentalness: calculateAverage(averages.instrumentalness),
    target_tempo: calculateAverage(averages.tempo)
  };
  
  // If diversify is true, adjust the targets to introduce variety
  if (diversify) {
    // Adjust energy and valence in the opposite direction of the average
    // This creates variety while still respecting the overall style
    if (style.target_energy > 0.5) {
      style.target_energy = Math.max(0.3, style.target_energy - 0.2);
    } else {
      style.target_energy = Math.min(0.8, style.target_energy + 0.2);
    }
    
    if (style.target_valence > 0.5) {
      style.target_valence = Math.max(0.3, style.target_valence - 0.2);
    } else {
      style.target_valence = Math.min(0.8, style.target_valence + 0.2);
    }
  }
  
  return style;
}

/**
 * Selects seed tracks from a list of track IDs
 * @param {string[]} trackIds - Array of track IDs
 * @returns {string[]} - Selected seed track IDs
 */
function selectSeedTracks(trackIds) {
  // Select up to 2 random tracks as seeds
  const seedCount = Math.min(2, trackIds.length);
  const seeds = [];
  
  // Create a copy of the array to avoid modifying the original
  const availableTracks = [...trackIds];
  
  for (let i = 0; i < seedCount; i++) {
    const randomIndex = Math.floor(Math.random() * availableTracks.length);
    seeds.push(availableTracks[randomIndex]);
    availableTracks.splice(randomIndex, 1);
  }
  
  return seeds;
}

export { registerPlaylistGenerationTools }; 