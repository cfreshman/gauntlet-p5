/**
 * Music Curation Tools (Layer 3)
 * 
 * This module provides expert-level music curation tools that build on Layer 1 and Layer 2 tools.
 */

const logger = require('../utils/logger');
const spotifyClient = require('../utils/spotifyClient');
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Register music curation tools with the server
 * @param {object} server - The server instance to register tools with
 * @param {object} layer1Server - The Layer 1 server instance
 * @param {object} layer2Server - The Layer 2 server instance
 */
function registerMusicCurationTools(server, layer1Server, layer2Server) {
  logger.info('Registering Music Curation Tools (Layer 3)...');

  // Register curate-personalized-collection tool
  server.tool(
    'curate-personalized-collection',
    'Creates a tailored music collection based on user preferences and context',
    {
      userId: {
        type: 'string',
        description: 'Spotify user ID to create the collection for'
      },
      theme: {
        type: 'string',
        description: 'Theme or purpose of the collection (e.g., "Workout Mix", "Study Session", "Road Trip")'
      },
      preferences: {
        type: 'object',
        description: 'User preferences for the collection',
        properties: {
          favoriteArtists: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of favorite artists'
          },
          favoriteGenres: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of favorite genres'
          },
          favoriteDecades: {
            type: 'array',
            items: { type: 'string' },
            description: 'Preferred decades (e.g., "1980s", "1990s")'
          },
          moodPreferences: {
            type: 'array',
            items: { type: 'string' },
            description: 'Preferred moods (e.g., "energetic", "relaxed", "melancholic")'
          },
          avoidArtists: {
            type: 'array',
            items: { type: 'string' },
            description: 'Artists to avoid'
          },
          avoidGenres: {
            type: 'array',
            items: { type: 'string' },
            description: 'Genres to avoid'
          }
        }
      },
      context: {
        type: 'object',
        description: 'Contextual information for the collection',
        properties: {
          timeOfDay: {
            type: 'string',
            description: 'Time of day (e.g., "morning", "evening")'
          },
          activity: {
            type: 'string',
            description: 'Activity context (e.g., "working", "relaxing", "exercising")'
          },
          location: {
            type: 'string',
            description: 'Location context (e.g., "home", "gym", "commuting")'
          },
          weather: {
            type: 'string',
            description: 'Weather context (e.g., "sunny", "rainy", "snowy")'
          },
          season: {
            type: 'string',
            description: 'Season context (e.g., "summer", "winter")'
          }
        }
      },
      size: {
        type: 'integer',
        description: 'Number of tracks in the collection',
        default: 25
      },
      createPlaylist: {
        type: 'boolean',
        description: 'Whether to create a Spotify playlist with the collection',
        default: true
      }
    },
    curatePersonalizedCollection
  );

  logger.info('Music Curation Tools registered successfully');
}

/**
 * Creates a tailored music collection based on user preferences and context
 * @param {object} params - The parameters for collection curation
 * @returns {Promise<object>} - The curated collection
 */
async function curatePersonalizedCollection(params) {
  const { 
    userId, 
    theme, 
    preferences, 
    context = {}, 
    collectionSize = 20, 
    createPlaylist = true,
    includeAnalysis = true
  } = params;
  
  try {
    logger.info(`Curating personalized collection "${theme}" for user ${userId}`);
    
    // Step 1: Analyze the request and generate a curation strategy
    const curationStrategy = await generateCurationStrategy(theme, preferences, context);
    logger.info('Generated curation strategy');
    
    // Step 2: Search for seed artists and tracks based on preferences
    const seeds = await findSeedsFromPreferences(preferences);
    logger.info(`Found ${seeds.artists.length} seed artists and ${seeds.tracks.length} seed tracks`);
    
    // Step 3: Create multiple playlists with different criteria based on the strategy
    const subCollections = await createSubCollections(curationStrategy, seeds, collectionSize);
    logger.info(`Created ${subCollections.length} sub-collections with a total of ${subCollections.reduce((sum, sc) => sum + sc.tracks.length, 0)} tracks`);
    
    // Step 4: Combine and refine the tracks from sub-collections
    const refinedCollection = await refineCollection(subCollections, curationStrategy, collectionSize, preferences);
    logger.info(`Refined collection to ${refinedCollection.length} tracks`);
    
    // Step 5: Create a playlist if requested
    let playlist = null;
    if (createPlaylist) {
      playlist = await createCollectionPlaylist(userId, theme, curationStrategy.description, refinedCollection);
      logger.info(`Created playlist "${theme}" (${playlist.id}) with ${refinedCollection.length} tracks`);
    }
    
    // Step 6: Generate analysis if requested
    let analysis = null;
    if (includeAnalysis) {
      analysis = await analyzeCollection(refinedCollection, theme, preferences, context);
      logger.info('Generated collection analysis');
    }
    
    // Construct the response
    const response = {
      collection: {
        theme,
        trackCount: refinedCollection.length,
        strategy: curationStrategy,
        tracks: refinedCollection.map(track => ({
          id: track.id,
          name: track.name,
          artists: track.artists.map(artist => artist.name),
          album: track.album.name,
          uri: track.uri
        }))
      }
    };
    
    // Add playlist information if created
    if (playlist) {
      response.playlist = {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        url: playlist.external_urls.spotify
      };
    }
    
    // Add analysis if requested
    if (analysis) {
      response.analysis = analysis;
    }
    
    logger.info(`Personalized collection "${theme}" curated successfully`);
    return response;
    
  } catch (error) {
    logger.error(`Error curating personalized collection: ${error.message}`);
    throw new Error(`Failed to curate personalized collection: ${error.message}`);
  }
}

/**
 * Generates a curation strategy based on theme, preferences, and context
 * @param {string} theme - The theme of the collection
 * @param {object} preferences - User preferences
 * @param {object} context - Additional context
 * @returns {Promise<object>} - The curation strategy
 */
async function generateCurationStrategy(theme, preferences, context) {
  try {
    // Prepare the prompt for the LLM
    const prompt = `
      Create a music curation strategy for a collection with the theme "${theme}".
      
      User preferences:
      - Favorite artists: ${preferences.favoriteArtists ? preferences.favoriteArtists.join(', ') : 'Not specified'}
      - Favorite genres: ${preferences.favoriteGenres ? preferences.favoriteGenres.join(', ') : 'Not specified'}
      - Favorite decades: ${preferences.favoriteDecades ? preferences.favoriteDecades.join(', ') : 'Not specified'}
      - Mood preferences: ${preferences.moodPreferences ? preferences.moodPreferences.join(', ') : 'Not specified'}
      - Avoid artists: ${preferences.avoidArtists ? preferences.avoidArtists.join(', ') : 'Not specified'}
      - Avoid genres: ${preferences.avoidGenres ? preferences.avoidGenres.join(', ') : 'Not specified'}
      
      Context:
      - Time of day: ${context.timeOfDay || 'Not specified'}
      - Activity: ${context.activity || 'Not specified'}
      - Location: ${context.location || 'Not specified'}
      - Weather: ${context.weather || 'Not specified'}
      - Season: ${context.season || 'Not specified'}
      
      Create a detailed strategy that includes:
      1. A brief description of the collection's purpose and feel
      2. 3-5 distinct musical sections or moods to include
      3. Specific audio features to target for each section (energy, valence, tempo, etc.)
      4. Artist and genre recommendations that match the theme
      5. Any special considerations based on the context
      
      Format your response as a JSON object with the following structure:
      {
        "description": "Brief description of the collection",
        "sections": [
          {
            "name": "Section name",
            "description": "Section description",
            "proportion": 0.3, // Proportion of the collection (should sum to 1.0)
            "targetFeatures": {
              "energy": 0.7,
              "valence": 0.6,
              "tempo": 120,
              "danceability": 0.5,
              "acousticness": 0.2
            },
            "recommendedGenres": ["genre1", "genre2"],
            "recommendedArtistTypes": ["Description of artist type 1", "Description of artist type 2"]
          }
        ],
        "overallMood": "Description of the overall mood",
        "specialConsiderations": ["Consideration 1", "Consideration 2"]
      }
    `;
    
    // Call the OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a music curation expert with deep knowledge of music theory, genres, artists, and emotional impact of music. Your task is to create detailed music curation strategies.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    });
    
    // Parse the response
    const strategy = JSON.parse(response.choices[0].message.content);
    
    // Validate the strategy
    if (!strategy.description || !strategy.sections || !Array.isArray(strategy.sections)) {
      throw new Error('Invalid curation strategy generated');
    }
    
    return strategy;
  } catch (error) {
    logger.error(`Error generating curation strategy: ${error.message}`);
    
    // Fallback strategy if the API call fails
    return {
      description: `A personalized collection based on the theme "${theme}" with user's preferences in mind.`,
      sections: [
        {
          name: 'Energetic Start',
          description: 'Upbeat tracks to set the mood',
          proportion: 0.3,
          targetFeatures: {
            energy: 0.8,
            valence: 0.7,
            tempo: 120,
            danceability: 0.7,
            acousticness: 0.2
          },
          recommendedGenres: preferences.favoriteGenres || ['pop', 'rock'],
          recommendedArtistTypes: ['Popular mainstream artists', 'Upbeat energetic performers']
        },
        {
          name: 'Core Experience',
          description: 'The main section that captures the essence of the theme',
          proportion: 0.5,
          targetFeatures: {
            energy: 0.6,
            valence: 0.6,
            tempo: 110,
            danceability: 0.6,
            acousticness: 0.4
          },
          recommendedGenres: preferences.favoriteGenres || ['pop', 'indie'],
          recommendedArtistTypes: ['Artists similar to user favorites', 'Genre-defining artists']
        },
        {
          name: 'Wind Down',
          description: 'More relaxed tracks to conclude the collection',
          proportion: 0.2,
          targetFeatures: {
            energy: 0.4,
            valence: 0.5,
            tempo: 90,
            danceability: 0.4,
            acousticness: 0.6
          },
          recommendedGenres: preferences.favoriteGenres || ['indie', 'chill'],
          recommendedArtistTypes: ['Mellower artists', 'Acoustic performers']
        }
      ],
      overallMood: preferences.moodPreferences ? preferences.moodPreferences.join(', ') : 'Balanced and engaging',
      specialConsiderations: [
        'Include a mix of familiar and discovery tracks',
        'Ensure smooth transitions between energy levels'
      ]
    };
  }
}

/**
 * Finds seed artists and tracks based on user preferences
 * @param {object} preferences - User preferences
 * @returns {Promise<object>} - Seed artists and tracks
 */
async function findSeedsFromPreferences(preferences) {
  const seeds = {
    artists: [],
    tracks: []
  };
  
  try {
    // Search for artists based on favorite artists
    if (preferences.favoriteArtists && preferences.favoriteArtists.length > 0) {
      for (const artistName of preferences.favoriteArtists.slice(0, 3)) {
        const results = await spotifyClient.search(artistName, ['artist'], 1);
        if (results.artists && results.artists.items.length > 0) {
          seeds.artists.push(results.artists.items[0]);
        }
      }
    }
    
    // Search for tracks based on favorite tracks
    if (preferences.favoriteDecades && preferences.favoriteDecades.length > 0) {
      for (const decade of preferences.favoriteDecades.slice(0, 2)) {
        const results = await spotifyClient.search(`year:${decade}`, ['track'], 2);
        if (results.tracks && results.tracks.items.length > 0) {
          seeds.tracks.push(...results.tracks.items);
        }
      }
    }
    
    // If we don't have enough seeds, search for tracks based on favorite genres
    if (seeds.artists.length === 0 && seeds.tracks.length === 0 && preferences.favoriteGenres && preferences.favoriteGenres.length > 0) {
      for (const genre of preferences.favoriteGenres.slice(0, 2)) {
        const results = await spotifyClient.search(`genre:${genre}`, ['track'], 2);
        if (results.tracks && results.tracks.items.length > 0) {
          seeds.tracks.push(...results.tracks.items);
        }
      }
    }
    
    return seeds;
  } catch (error) {
    logger.error(`Error finding seeds from preferences: ${error.message}`);
    throw error;
  }
}

/**
 * Creates sub-collections based on the curation strategy
 * @param {object} strategy - The curation strategy
 * @param {object} seeds - Seed artists and tracks
 * @param {number} totalSize - Total size of the collection
 * @returns {Promise<Array>} - Array of sub-collections
 */
async function createSubCollections(strategy, seeds, totalSize) {
  const subCollections = [];
  
  try {
    // Create a sub-collection for each section in the strategy
    for (const section of strategy.sections) {
      // Calculate the number of tracks for this section
      const sectionSize = Math.max(1, Math.round(totalSize * section.proportion));
      
      // Prepare seed artists and tracks
      const seedArtistIds = seeds.artists.slice(0, 2).map(artist => artist.id);
      const seedTrackIds = seeds.tracks.slice(0, 2).map(track => track.id);
      
      // Prepare criteria for recommendations
      const criteria = {
        seed_artists: seedArtistIds.length > 0 ? seedArtistIds : undefined,
        seed_tracks: seedTrackIds.length > 0 ? seedTrackIds : undefined,
        seed_genres: section.recommendedGenres && section.recommendedGenres.length > 0 
          ? section.recommendedGenres.slice(0, 2) 
          : undefined,
        target_energy: section.targetFeatures.energy,
        target_danceability: section.targetFeatures.danceability,
        target_valence: section.targetFeatures.valence,
        target_tempo: section.targetFeatures.tempo,
        target_acousticness: section.targetFeatures.acousticness
      };
      
      // Ensure we have at least one type of seed
      if (!criteria.seed_artists && !criteria.seed_tracks && !criteria.seed_genres) {
        criteria.seed_genres = ['pop', 'rock'];
      }
      
      // Get recommendations
      const recommendations = await spotifyClient.getRecommendations({
        ...criteria,
        limit: sectionSize * 2 // Get more than needed for filtering
      });
      
      if (recommendations.tracks && recommendations.tracks.length > 0) {
        subCollections.push({
          section: section.name,
          description: section.description,
          targetFeatures: section.targetFeatures,
          tracks: recommendations.tracks.slice(0, sectionSize)
        });
      }
    }
    
    return subCollections;
  } catch (error) {
    logger.error(`Error creating sub-collections: ${error.message}`);
    throw error;
  }
}

/**
 * Refines the collection by combining and filtering tracks from sub-collections
 * @param {Array} subCollections - Array of sub-collections
 * @param {object} strategy - The curation strategy
 * @param {number} targetSize - Target size of the collection
 * @param {object} preferences - User preferences
 * @returns {Promise<Array>} - Refined collection of tracks
 */
async function refineCollection(subCollections, strategy, targetSize, preferences) {
  try {
    // Combine all tracks from sub-collections
    let allTracks = [];
    subCollections.forEach(subCollection => {
      allTracks = allTracks.concat(subCollection.tracks);
    });
    
    // Filter out explicit tracks if requested
    if (preferences.excludeExplicit) {
      allTracks = allTracks.filter(track => !track.explicit);
    }
    
    // Remove duplicate tracks
    const uniqueTracks = [];
    const trackIds = new Set();
    
    allTracks.forEach(track => {
      if (!trackIds.has(track.id)) {
        trackIds.add(track.id);
        uniqueTracks.push(track);
      }
    });
    
    // If we have more tracks than needed, prioritize based on strategy
    if (uniqueTracks.length > targetSize) {
      // Get audio features for all tracks
      const trackFeatures = await Promise.all(
        uniqueTracks.map(track => spotifyClient.getAudioFeatures(track.id))
      );
      
      // Score tracks based on how well they match the strategy
      const scoredTracks = uniqueTracks.map((track, index) => {
        const features = trackFeatures[index];
        let score = 0;
        
        // Find which section this track best fits
        strategy.sections.forEach(section => {
          const sectionScore = calculateFeatureMatchScore(features, section.targetFeatures);
          if (sectionScore > score) {
            score = sectionScore;
          }
        });
        
        return { track, score };
      });
      
      // Sort by score (descending) and take the top tracks
      scoredTracks.sort((a, b) => b.score - a.score);
      return scoredTracks.slice(0, targetSize).map(item => item.track);
    }
    
    return uniqueTracks;
  } catch (error) {
    logger.error(`Error refining collection: ${error.message}`);
    throw error;
  }
}

/**
 * Calculates a score for how well a track's features match target features
 * @param {object} features - Track audio features
 * @param {object} targetFeatures - Target audio features
 * @returns {number} - Match score (0-1)
 */
function calculateFeatureMatchScore(features, targetFeatures) {
  if (!features) return 0;
  
  const weights = {
    energy: 0.25,
    valence: 0.2,
    danceability: 0.2,
    acousticness: 0.15,
    tempo: 0.1
  };
  
  let totalScore = 0;
  let totalWeight = 0;
  
  // Calculate score for each feature
  Object.keys(weights).forEach(feature => {
    if (features[feature] !== undefined && targetFeatures[feature] !== undefined) {
      const weight = weights[feature];
      let featureScore;
      
      // Special handling for tempo
      if (feature === 'tempo') {
        // Normalize tempo difference (within 20 BPM is considered good)
        const tempoDiff = Math.abs(features.tempo - targetFeatures.tempo) / 20;
        featureScore = Math.max(0, 1 - tempoDiff);
      } else {
        // For other features, calculate the difference directly
        featureScore = 1 - Math.abs(features[feature] - targetFeatures[feature]);
      }
      
      totalScore += featureScore * weight;
      totalWeight += weight;
    }
  });
  
  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * Creates a Spotify playlist with the curated collection
 * @param {string} userId - Spotify user ID
 * @param {string} theme - Collection theme
 * @param {string} description - Collection description
 * @param {Array} tracks - Collection tracks
 * @returns {Promise<object>} - Created playlist
 */
async function createCollectionPlaylist(userId, theme, description, tracks) {
  try {
    // Create the playlist
    const playlist = await spotifyClient.createPlaylist(
      userId,
      `${theme} - Curated Collection`,
      description,
      true
    );
    
    // Add tracks to the playlist
    const trackUris = tracks.map(track => track.uri);
    await spotifyClient.addTracksToPlaylist(playlist.id, trackUris);
    
    return playlist;
  } catch (error) {
    logger.error(`Error creating collection playlist: ${error.message}`);
    throw error;
  }
}

/**
 * Analyzes the curated collection
 * @param {Array} tracks - Collection tracks
 * @param {string} theme - Collection theme
 * @param {object} preferences - User preferences
 * @param {object} context - Additional context
 * @returns {Promise<object>} - Collection analysis
 */
async function analyzeCollection(tracks, theme, preferences, context) {
  try {
    // Get audio features for all tracks
    const trackFeatures = await Promise.all(
      tracks.map(track => spotifyClient.getAudioFeatures(track.id))
    );
    
    // Calculate average features
    const averageFeatures = trackFeatures.reduce((acc, features) => {
      if (!features) return acc;
      
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
    
    const calculateAverage = values => 
      values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    
    // Extract artist and genre information
    const artists = new Map();
    tracks.forEach(track => {
      track.artists.forEach(artist => {
        const count = artists.get(artist.name) || 0;
        artists.set(artist.name, count + 1);
      });
    });
    
    // Sort artists by frequency
    const topArtists = Array.from(artists.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
    // Generate analysis using LLM
    const analysisPrompt = `
      Analyze this music collection with the theme "${theme}".
      
      Collection statistics:
      - Number of tracks: ${tracks.length}
      - Average energy: ${calculateAverage(averageFeatures.energy).toFixed(2)}
      - Average danceability: ${calculateAverage(averageFeatures.danceability).toFixed(2)}
      - Average valence (positivity): ${calculateAverage(averageFeatures.valence).toFixed(2)}
      - Average acousticness: ${calculateAverage(averageFeatures.acousticness).toFixed(2)}
      - Average tempo: ${calculateAverage(averageFeatures.tempo).toFixed(0)} BPM
      
      Top artists in the collection:
      ${topArtists.map(artist => `- ${artist.name} (${artist.count} tracks)`).join('\n')}
      
      User preferences:
      - Favorite artists: ${preferences.favoriteArtists ? preferences.favoriteArtists.join(', ') : 'Not specified'}
      - Favorite genres: ${preferences.favoriteGenres ? preferences.favoriteGenres.join(', ') : 'Not specified'}
      - Mood preferences: ${preferences.moodPreferences ? preferences.moodPreferences.join(', ') : 'Not specified'}
      
      Context:
      - Time of day: ${context.timeOfDay || 'Not specified'}
      - Activity: ${context.activity || 'Not specified'}
      - Location: ${context.location || 'Not specified'}
      - Weather: ${context.weather || 'Not specified'}
      - Season: ${context.season || 'Not specified'}
      
      Provide a detailed analysis of this collection, including:
      1. Overall mood and energy profile
      2. How well it matches the theme and user preferences
      3. Listening context recommendations (when and where to listen)
      4. Musical journey through the collection
      5. Standout characteristics
      
      Format your response as a JSON object with the following structure:
      {
        "overallProfile": "Description of the collection's overall profile",
        "themeAlignment": "Analysis of how well the collection aligns with the theme",
        "preferenceAlignment": "Analysis of how well the collection aligns with user preferences",
        "listeningContexts": ["Context 1", "Context 2", "Context 3"],
        "musicalJourney": "Description of the musical journey through the collection",
        "standoutCharacteristics": ["Characteristic 1", "Characteristic 2", "Characteristic 3"],
        "recommendedListeningApproach": "Recommended way to experience the collection"
      }
    `;
    
    try {
      // Call the OpenAI API
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a music analysis expert with deep knowledge of music theory, genres, artists, and emotional impact of music. Your task is to provide insightful analysis of music collections.' },
          { role: 'user', content: analysisPrompt }
        ],
        response_format: { type: 'json_object' }
      });
      
      // Parse the response
      const analysis = JSON.parse(response.choices[0].message.content);
      
      // Add statistical information
      analysis.statistics = {
        trackCount: tracks.length,
        averageFeatures: {
          energy: calculateAverage(averageFeatures.energy),
          danceability: calculateAverage(averageFeatures.danceability),
          valence: calculateAverage(averageFeatures.valence),
          acousticness: calculateAverage(averageFeatures.acousticness),
          instrumentalness: calculateAverage(averageFeatures.instrumentalness),
          tempo: calculateAverage(averageFeatures.tempo)
        },
        topArtists
      };
      
      return analysis;
    } catch (error) {
      logger.error(`Error generating collection analysis with LLM: ${error.message}`);
      
      // Fallback analysis
      return {
        overallProfile: `A collection based on the theme "${theme}" with a balanced mix of energy and mood.`,
        themeAlignment: "The collection aims to capture the essence of the theme through a variety of tracks.",
        preferenceAlignment: "The collection incorporates the user's preferences where possible.",
        listeningContexts: [
          context.timeOfDay || "General listening",
          context.location || "Any location",
          context.activity || "Any activity"
        ],
        musicalJourney: "The collection offers a journey through different energy levels and moods.",
        standoutCharacteristics: [
          `Average energy level of ${calculateAverage(averageFeatures.energy).toFixed(2)}`,
          `Average tempo of ${calculateAverage(averageFeatures.tempo).toFixed(0)} BPM`,
          topArtists.length > 0 ? `Features ${topArtists[0].name} prominently` : "Diverse artist selection"
        ],
        recommendedListeningApproach: "Listen from start to finish for the best experience.",
        statistics: {
          trackCount: tracks.length,
          averageFeatures: {
            energy: calculateAverage(averageFeatures.energy),
            danceability: calculateAverage(averageFeatures.danceability),
            valence: calculateAverage(averageFeatures.valence),
            acousticness: calculateAverage(averageFeatures.acousticness),
            instrumentalness: calculateAverage(averageFeatures.instrumentalness),
            tempo: calculateAverage(averageFeatures.tempo)
          },
          topArtists
        }
      };
    }
  } catch (error) {
    logger.error(`Error analyzing collection: ${error.message}`);
    throw error;
  }
}

module.exports = {
  registerMusicCurationTools
}; 