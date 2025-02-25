/**
 * Music Discovery Tools (Layer 2)
 * 
 * This module provides intelligent music discovery tools that build on the Layer 1 Spotify API tools.
 */

const logger = require('../utils/logger');
const spotifyClient = require('../utils/spotifyClient');

/**
 * Register music discovery tools with the server
 * @param {object} server - The server instance to register tools with
 */
function registerMusicDiscoveryTools(server) {
  logger.info('Registering Music Discovery Tools (Layer 2)...');

  // Register discover-similar-music tool
  server.registerTool({
    name: 'discover-similar-music',
    description: 'Discovers music similar to provided tracks or artists',
    parameters: {
      type: 'object',
      required: ['seedType', 'seeds'],
      properties: {
        seedType: {
          type: 'string',
          enum: ['tracks', 'artists', 'genres', 'mixed'],
          description: 'Type of seeds to use for discovery'
        },
        seeds: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Array of seed IDs (track IDs, artist IDs, or genre names)'
        },
        limit: {
          type: 'integer',
          description: 'Number of tracks to return',
          default: 20
        },
        market: {
          type: 'string',
          description: 'Market code (e.g., "US")',
          default: 'US'
        },
        tunableTrackAttributes: {
          type: 'object',
          description: 'Tunable track attributes to target',
          properties: {
            minEnergy: {
              type: 'number',
              description: 'Minimum energy (0.0 to 1.0)'
            },
            maxEnergy: {
              type: 'number',
              description: 'Maximum energy (0.0 to 1.0)'
            },
            minDanceability: {
              type: 'number',
              description: 'Minimum danceability (0.0 to 1.0)'
            },
            maxDanceability: {
              type: 'number',
              description: 'Maximum danceability (0.0 to 1.0)'
            },
            minValence: {
              type: 'number',
              description: 'Minimum valence (0.0 to 1.0)'
            },
            maxValence: {
              type: 'number',
              description: 'Maximum valence (0.0 to 1.0)'
            },
            minTempo: {
              type: 'number',
              description: 'Minimum tempo in BPM'
            },
            maxTempo: {
              type: 'number',
              description: 'Maximum tempo in BPM'
            },
            minPopularity: {
              type: 'integer',
              description: 'Minimum popularity (0 to 100)'
            },
            maxPopularity: {
              type: 'integer',
              description: 'Maximum popularity (0 to 100)'
            }
          }
        },
        includeAudioFeatures: {
          type: 'boolean',
          description: 'Whether to include audio features in the response',
          default: false
        }
      }
    },
    handler: discoverSimilarMusic
  });

  logger.info('Music Discovery Tools registered successfully');
}

/**
 * Discovers music similar to provided tracks or artists
 * @param {object} params - The parameters for music discovery
 * @returns {Promise<object>} - The discovery results
 */
async function discoverSimilarMusic(params) {
  const { 
    seedType, 
    seeds, 
    limit = 20, 
    market = 'US',
    tunableTrackAttributes = {},
    includeAudioFeatures = false
  } = params;
  
  try {
    logger.info(`Discovering similar music using ${seedType} seeds`);
    
    // Validate seeds
    if (!seeds || seeds.length === 0) {
      throw new Error('At least one seed must be provided');
    }
    
    // Since we're having issues with the recommendations endpoint,
    // we'll use search as an alternative approach
    let tracks = [];
    let searchQuery = '';
    
    // Build search query based on seed type
    switch (seedType) {
      case 'artists':
        // For artists, we'll just use the artist ID directly in the search
        searchQuery = `artist:${seeds[0]}`;
        break;
        
      case 'tracks':
        // For tracks, we'll just use the track ID directly in the search
        searchQuery = `track:${seeds[0]}`;
        break;
        
      case 'genres':
        // Use the first genre as search query
        searchQuery = `genre:${seeds[0]}`;
        break;
        
      case 'mixed':
        // For mixed, we'll prioritize genres, then artists, then tracks
        if (seeds.some(seed => !seed.match(/^[a-zA-Z0-9]{22}$/))) {
          // If any seed doesn't look like an ID, assume it's a genre
          const genre = seeds.find(seed => !seed.match(/^[a-zA-Z0-9]{22}$/));
          searchQuery = `genre:${genre}`;
        } else {
          // Otherwise, treat the first seed as an artist ID
          searchQuery = `artist:${seeds[0]}`;
        }
        break;
        
      default:
        throw new Error(`Invalid seed type: ${seedType}`);
    }
    
    // Apply tunable track attributes to the search query if possible
    if (tunableTrackAttributes.minPopularity !== undefined) {
      // We can't directly filter by popularity in the search query,
      // but we'll handle this in post-processing
    }
    
    // Perform the search
    logger.info(`Searching with query: ${searchQuery}`);
    const searchResults = await spotifyClient.search(searchQuery, ['track'], Math.min(limit * 2, 50));
    
    if (!searchResults.tracks || searchResults.tracks.items.length === 0) {
      throw new Error('No similar tracks found');
    }
    
    // Process the search results
    tracks = searchResults.tracks.items;
    
    // Apply post-search filtering based on tunable track attributes
    if (tunableTrackAttributes.minPopularity !== undefined) {
      tracks = tracks.filter(track => track.popularity >= tunableTrackAttributes.minPopularity);
    }
    
    if (tunableTrackAttributes.maxPopularity !== undefined) {
      tracks = tracks.filter(track => track.popularity <= tunableTrackAttributes.maxPopularity);
    }
    
    // Limit the number of tracks
    tracks = tracks.slice(0, limit);
    
    logger.info(`Found ${tracks.length} similar tracks`);
    
    // Process the tracks
    const processedTracks = tracks.map(track => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map(artist => ({
        id: artist.id,
        name: artist.name
      })),
      album: {
        id: track.album.id,
        name: track.album.name,
        releaseDate: track.album.release_date
      },
      popularity: track.popularity,
      durationMs: track.duration_ms,
      explicit: track.explicit,
      uri: track.uri
    }));
    
    // Get audio features if requested
    let audioFeatures = null;
    if (includeAudioFeatures && processedTracks.length > 0) {
      try {
        const trackIds = processedTracks.map(track => track.id);
        audioFeatures = await spotifyClient.getSeveralAudioFeatures(trackIds);
        logger.info('Retrieved audio features for similar tracks');
      } catch (error) {
        logger.warn(`Could not retrieve audio features: ${error.message}`);
      }
    }
    
    // Construct the response
    const response = {
      seedType,
      seeds,
      tracks: processedTracks
    };
    
    // Add audio features if available
    if (audioFeatures && audioFeatures.audio_features) {
      response.audioFeatures = audioFeatures.audio_features;
    }
    
    // Add discovery insights
    response.insights = generateDiscoveryInsights(processedTracks, audioFeatures);
    
    return response;
    
  } catch (error) {
    logger.error(`Error discovering similar music: ${error.message}`);
    throw new Error(`Failed to discover similar music: ${error.message}`);
  }
}

/**
 * Generates insights about the discovered tracks
 * @param {Array} tracks - The discovered tracks
 * @param {object} audioFeatures - Audio features for the tracks (optional)
 * @returns {object} - Discovery insights
 */
function generateDiscoveryInsights(tracks, audioFeatures) {
  const insights = {
    summary: `Discovered ${tracks.length} similar tracks based on your seeds.`,
    topArtists: [],
    popularityRange: {
      min: 100,
      max: 0,
      average: 0
    },
    explicitContent: {
      count: 0,
      percentage: 0
    }
  };
  
  // Calculate popularity stats
  let totalPopularity = 0;
  tracks.forEach(track => {
    totalPopularity += track.popularity;
    insights.popularityRange.min = Math.min(insights.popularityRange.min, track.popularity);
    insights.popularityRange.max = Math.max(insights.popularityRange.max, track.popularity);
    
    if (track.explicit) {
      insights.explicitContent.count++;
    }
  });
  
  insights.popularityRange.average = Math.round(totalPopularity / tracks.length);
  insights.explicitContent.percentage = Math.round((insights.explicitContent.count / tracks.length) * 100);
  
  // Find top artists
  const artistCounts = {};
  tracks.forEach(track => {
    track.artists.forEach(artist => {
      if (!artistCounts[artist.id]) {
        artistCounts[artist.id] = {
          id: artist.id,
          name: artist.name,
          count: 0
        };
      }
      artistCounts[artist.id].count++;
    });
  });
  
  insights.topArtists = Object.values(artistCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Add audio feature insights if available
  if (audioFeatures && audioFeatures.audio_features) {
    const features = audioFeatures.audio_features.filter(f => f !== null);
    
    if (features.length > 0) {
      insights.audioFeatures = {
        energy: calculateAverageFeature(features, 'energy'),
        danceability: calculateAverageFeature(features, 'danceability'),
        valence: calculateAverageFeature(features, 'valence'),
        tempo: calculateAverageFeature(features, 'tempo')
      };
      
      // Add mood description based on valence and energy
      const avgValence = insights.audioFeatures.valence.average;
      const avgEnergy = insights.audioFeatures.energy.average;
      
      if (avgValence > 0.7 && avgEnergy > 0.7) {
        insights.mood = "Euphoric and energetic";
      } else if (avgValence > 0.7 && avgEnergy <= 0.7) {
        insights.mood = "Happy and relaxed";
      } else if (avgValence <= 0.3 && avgEnergy > 0.7) {
        insights.mood = "Intense and dark";
      } else if (avgValence <= 0.3 && avgEnergy <= 0.3) {
        insights.mood = "Melancholic and calm";
      } else if (avgEnergy > 0.7) {
        insights.mood = "Energetic";
      } else if (avgValence > 0.7) {
        insights.mood = "Positive";
      } else if (avgValence < 0.3) {
        insights.mood = "Somber";
      } else if (avgEnergy < 0.3) {
        insights.mood = "Relaxed";
      } else {
        insights.mood = "Balanced";
      }
    }
  }
  
  return insights;
}

/**
 * Calculates average, min, and max for an audio feature
 * @param {Array} features - Array of audio features
 * @param {string} featureName - Name of the feature to calculate
 * @returns {object} - Feature statistics
 */
function calculateAverageFeature(features, featureName) {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  
  features.forEach(feature => {
    if (feature && feature[featureName] !== undefined) {
      const value = feature[featureName];
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  });
  
  const average = sum / features.length;
  
  return {
    average: featureName === 'tempo' ? Math.round(average) : Number(average.toFixed(2)),
    min: featureName === 'tempo' ? Math.round(min) : Number(min.toFixed(2)),
    max: featureName === 'tempo' ? Math.round(max) : Number(max.toFixed(2))
  };
}

module.exports = {
  registerMusicDiscoveryTools
}; 