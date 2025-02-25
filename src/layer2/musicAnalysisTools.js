/**
 * Music Analysis Tools (Layer 2)
 * 
 * This module provides intelligent music analysis tools that build on the Layer 1 Spotify API tools.
 */

import logger from '../utils/logger.js';
import spotifyClient from '../utils/spotifyClient.js';

/**
 * Register music analysis tools with the server
 * @param {object} server - The server instance to register tools with
 */
function registerMusicAnalysisTools(server) {
  logger.info('Registering Music Analysis Tools (Layer 2)...');

  // Register analyze-track-features tool
  server.tool(
    'analyze-track-features',
    'Analyzes audio features of a track and provides detailed insights',
    {
      trackId: {
        type: 'string',
        description: 'The Spotify ID of the track to analyze'
      },
      includeTrackDetails: {
        type: 'boolean',
        description: 'Whether to include basic track details in the response',
        default: true
      }
    },
    analyzeTrackFeatures
  );

  // Register compare-tracks tool
  server.tool(
    'compare-tracks',
    'Compares multiple tracks based on their audio features',
    {
      trackIds: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of Spotify track IDs to compare (2-5 tracks recommended)'
      },
      aspects: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['energy', 'danceability', 'valence', 'tempo', 'acousticness', 'instrumentalness', 'all']
        },
        description: 'Specific aspects to compare (defaults to all)',
        default: ['all']
      }
    },
    compareTracks
  );

  logger.info('Music Analysis Tools registered successfully');
}

/**
 * Analyzes audio features of a track and provides detailed insights
 * @param {object} params - The parameters for the analysis
 * @param {string} params.trackId - The Spotify ID of the track to analyze
 * @param {boolean} params.includeTrackDetails - Whether to include basic track details
 * @returns {Promise<object>} - The analysis results
 */
async function analyzeTrackFeatures(params) {
  const { trackId, includeTrackDetails = true } = params;
  
  try {
    logger.info(`Analyzing audio features for track: ${trackId}`);
    
    // Get audio features from Spotify API
    const audioFeatures = await spotifyClient.getAudioFeatures(trackId);
    
    // Get track details if requested
    let trackDetails = null;
    if (includeTrackDetails) {
      trackDetails = await spotifyClient.getTrack(trackId);
    }
    
    // Analyze the audio features
    const analysis = {
      summary: generateFeatureSummary(audioFeatures),
      mood: analyzeMood(audioFeatures),
      energyAnalysis: analyzeEnergy(audioFeatures),
      danceabilityAnalysis: analyzeDanceability(audioFeatures),
      musicalAttributes: analyzeMusicalAttributes(audioFeatures),
      recommendations: generateRecommendations(audioFeatures)
    };
    
    // Construct the response
    const response = {
      trackId,
      analysis,
      rawFeatures: audioFeatures
    };
    
    // Add track details if requested
    if (includeTrackDetails && trackDetails) {
      response.trackDetails = {
        name: trackDetails.name,
        artists: trackDetails.artists.map(artist => artist.name),
        album: trackDetails.album.name,
        releaseDate: trackDetails.album.release_date,
        popularity: trackDetails.popularity,
        durationMs: trackDetails.duration_ms,
        explicit: trackDetails.explicit
      };
    }
    
    logger.info(`Analysis completed for track: ${trackId}`);
    return response;
    
  } catch (error) {
    logger.error(`Error analyzing track features: ${error.message}`);
    throw new Error(`Failed to analyze track features: ${error.message}`);
  }
}

/**
 * Compares multiple tracks based on their audio features
 * @param {object} params - The parameters for the comparison
 * @param {string[]} params.trackIds - Array of Spotify track IDs to compare
 * @param {string[]} params.aspects - Specific aspects to compare
 * @returns {Promise<object>} - The comparison results
 */
async function compareTracks(params) {
  const { trackIds, aspects = ['all'] } = params;
  
  try {
    logger.info(`Comparing ${trackIds.length} tracks`);
    
    if (trackIds.length < 2) {
      throw new Error('At least 2 tracks are required for comparison');
    }
    
    // Get track details and audio features for all tracks
    const tracksData = await Promise.all(
      trackIds.map(async (trackId) => {
        const [track, audioFeatures] = await Promise.all([
          spotifyClient.getTrack(trackId),
          spotifyClient.getAudioFeatures(trackId)
        ]);
        
        return {
          id: trackId,
          name: track.name,
          artists: track.artists.map(artist => artist.name).join(', '),
          album: track.album.name,
          features: audioFeatures
        };
      })
    );
    
    // Determine which aspects to compare
    const aspectsToCompare = aspects.includes('all') 
      ? ['energy', 'danceability', 'valence', 'tempo', 'acousticness', 'instrumentalness', 'speechiness', 'liveness']
      : aspects;
    
    // Generate comparisons for each aspect
    const comparisons = {};
    aspectsToCompare.forEach(aspect => {
      comparisons[aspect] = compareAspect(tracksData, aspect);
    });
    
    // Generate overall comparison summary
    const summary = generateComparisonSummary(tracksData, aspectsToCompare);
    
    // Construct the response
    const response = {
      tracks: tracksData.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists
      })),
      comparisons,
      summary
    };
    
    logger.info(`Comparison completed for ${trackIds.length} tracks`);
    return response;
    
  } catch (error) {
    logger.error(`Error comparing tracks: ${error.message}`);
    throw new Error(`Failed to compare tracks: ${error.message}`);
  }
}

/**
 * Generates a summary of the audio features
 * @param {object} features - The audio features
 * @returns {string} - A summary of the features
 */
function generateFeatureSummary(features) {
  const summaries = [];
  
  // Energy description
  if (features.energy > 0.8) {
    summaries.push("This track is very energetic and intense.");
  } else if (features.energy > 0.6) {
    summaries.push("This track has a good amount of energy.");
  } else if (features.energy > 0.4) {
    summaries.push("This track has moderate energy.");
  } else {
    summaries.push("This track has low energy and is more calm and relaxed.");
  }
  
  // Danceability description
  if (features.danceability > 0.8) {
    summaries.push("It's highly danceable with a strong, steady rhythm.");
  } else if (features.danceability > 0.6) {
    summaries.push("It has good danceability with a consistent rhythm.");
  } else if (features.danceability > 0.4) {
    summaries.push("It has moderate danceability.");
  } else {
    summaries.push("It's not particularly danceable, with a less predictable rhythm.");
  }
  
  // Valence (positivity) description
  if (features.valence > 0.8) {
    summaries.push("The track sounds very positive, happy, and uplifting.");
  } else if (features.valence > 0.6) {
    summaries.push("The track has a positive and cheerful sound.");
  } else if (features.valence > 0.4) {
    summaries.push("The track has a neutral emotional tone.");
  } else if (features.valence > 0.2) {
    summaries.push("The track sounds somewhat melancholic or sad.");
  } else {
    summaries.push("The track sounds very negative, sad, or angry.");
  }
  
  // Acousticness description
  if (features.acousticness > 0.8) {
    summaries.push("It's a highly acoustic track with minimal electronic elements.");
  } else if (features.acousticness > 0.5) {
    summaries.push("It has significant acoustic elements.");
  } else if (features.acousticness > 0.2) {
    summaries.push("It has some acoustic elements but is more electronic.");
  } else {
    summaries.push("It's primarily electronic with few acoustic elements.");
  }
  
  // Tempo description
  if (features.tempo > 160) {
    summaries.push(`With a very fast tempo of ${Math.round(features.tempo)} BPM, it's energetic and driving.`);
  } else if (features.tempo > 120) {
    summaries.push(`With a fast tempo of ${Math.round(features.tempo)} BPM, it maintains a quick pace.`);
  } else if (features.tempo > 90) {
    summaries.push(`With a moderate tempo of ${Math.round(features.tempo)} BPM, it has a comfortable pace.`);
  } else if (features.tempo > 70) {
    summaries.push(`With a relaxed tempo of ${Math.round(features.tempo)} BPM, it has a laid-back feel.`);
  } else {
    summaries.push(`With a slow tempo of ${Math.round(features.tempo)} BPM, it has a very relaxed pace.`);
  }
  
  return summaries.join(' ');
}

/**
 * Analyzes the mood of a track based on its audio features
 * @param {object} features - The audio features
 * @returns {object} - Mood analysis
 */
function analyzeMood(features) {
  // Calculate mood metrics
  const happiness = features.valence;
  const intensity = (features.energy + features.loudness / -60) / 2;
  const relaxation = (features.acousticness + (1 - features.energy) + (1 - features.tempo / 200)) / 3;
  
  // Determine primary mood
  let primaryMood;
  let moodDescription;
  
  if (happiness > 0.7 && intensity > 0.7) {
    primaryMood = "Euphoric";
    moodDescription = "This track has an exhilarating, joyful energy that's likely to elevate the listener's mood significantly.";
  } else if (happiness > 0.7 && relaxation > 0.7) {
    primaryMood = "Peaceful Joy";
    moodDescription = "This track conveys a sense of contented happiness and tranquility.";
  } else if (happiness > 0.7) {
    primaryMood = "Happy";
    moodDescription = "This track has a positive emotional tone that's likely to induce feelings of happiness.";
  } else if (happiness < 0.3 && intensity > 0.7) {
    primaryMood = "Angry/Intense";
    moodDescription = "This track has an intense, possibly aggressive energy with a negative emotional tone.";
  } else if (happiness < 0.3 && relaxation > 0.7) {
    primaryMood = "Melancholic";
    moodDescription = "This track has a sad, reflective quality with a relaxed atmosphere.";
  } else if (happiness < 0.3) {
    primaryMood = "Sad";
    moodDescription = "This track has a negative emotional tone that may evoke feelings of sadness.";
  } else if (intensity > 0.7) {
    primaryMood = "Energetic";
    moodDescription = "This track has a high-energy feel that's stimulating and driving.";
  } else if (relaxation > 0.7) {
    primaryMood = "Relaxed";
    moodDescription = "This track has a calming, soothing quality that promotes relaxation.";
  } else {
    primaryMood = "Neutral";
    moodDescription = "This track has a balanced emotional tone without strong mood indicators.";
  }
  
  return {
    primaryMood,
    moodDescription,
    moodMetrics: {
      happiness: Math.round(happiness * 100),
      intensity: Math.round(intensity * 100),
      relaxation: Math.round(relaxation * 100)
    }
  };
}

/**
 * Analyzes the energy characteristics of a track
 * @param {object} features - The audio features
 * @returns {object} - Energy analysis
 */
function analyzeEnergy(features) {
  let energyProfile;
  let energyDescription;
  
  if (features.energy > 0.8 && features.loudness > -5) {
    energyProfile = "Explosive";
    energyDescription = "This track has extremely high energy with powerful, loud sections that create an intense listening experience.";
  } else if (features.energy > 0.8) {
    energyProfile = "High Energy";
    energyDescription = "This track maintains high energy throughout, creating an exciting and stimulating atmosphere.";
  } else if (features.energy > 0.6) {
    energyProfile = "Energetic";
    energyDescription = "This track has good energy that keeps the listener engaged without being overwhelming.";
  } else if (features.energy > 0.4) {
    energyProfile = "Moderate";
    energyDescription = "This track has a balanced energy level that's neither too intense nor too relaxed.";
  } else if (features.energy > 0.2) {
    energyProfile = "Relaxed";
    energyDescription = "This track has a laid-back energy profile that creates a calm atmosphere.";
  } else {
    energyProfile = "Subdued";
    energyDescription = "This track has very low energy, creating a quiet, possibly intimate listening experience.";
  }
  
  return {
    energyProfile,
    energyDescription,
    energyComponents: {
      energy: features.energy,
      loudness: features.loudness,
      tempo: features.tempo
    }
  };
}

/**
 * Analyzes the danceability characteristics of a track
 * @param {object} features - The audio features
 * @returns {object} - Danceability analysis
 */
function analyzeDanceability(features) {
  let danceProfile;
  let danceDescription;
  
  if (features.danceability > 0.8 && features.tempo > 100 && features.tempo < 130) {
    danceProfile = "Club Anthem";
    danceDescription = "This track is extremely danceable with an ideal tempo for club dancing, featuring a strong, consistent beat.";
  } else if (features.danceability > 0.8) {
    danceProfile = "Highly Danceable";
    danceDescription = "This track has excellent danceability with a strong rhythmic structure that makes it easy to move to.";
  } else if (features.danceability > 0.6) {
    danceProfile = "Danceable";
    danceDescription = "This track has good danceability with a consistent rhythm that encourages movement.";
  } else if (features.danceability > 0.4) {
    danceProfile = "Moderately Danceable";
    danceDescription = "This track has some danceable elements but may not have a consistent enough rhythm for continuous dancing.";
  } else if (features.danceability > 0.2) {
    danceProfile = "Limited Danceability";
    danceDescription = "This track has limited danceability with an irregular rhythm that makes it challenging to dance to.";
  } else {
    danceProfile = "Not Danceable";
    danceDescription = "This track is not designed for dancing, with an unpredictable or complex rhythmic structure.";
  }
  
  return {
    danceProfile,
    danceDescription,
    danceComponents: {
      danceability: features.danceability,
      tempo: features.tempo,
      timeSignature: features.time_signature
    }
  };
}

/**
 * Analyzes the musical attributes of a track
 * @param {object} features - The audio features
 * @returns {object} - Musical attributes analysis
 */
function analyzeMusicalAttributes(features) {
  // Determine key name
  const keyNames = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"];
  const keyName = features.key >= 0 ? keyNames[features.key] : "Unknown";
  
  // Determine mode name
  const modeName = features.mode === 1 ? "Major" : "Minor";
  
  // Analyze instrumentalness
  let instrumentalProfile;
  if (features.instrumentalness > 0.8) {
    instrumentalProfile = "Instrumental (no vocals)";
  } else if (features.instrumentalness > 0.5) {
    instrumentalProfile = "Primarily instrumental with minimal vocals";
  } else if (features.instrumentalness > 0.2) {
    instrumentalProfile = "Mix of instrumental and vocal elements";
  } else {
    instrumentalProfile = "Vocal-focused with instrumental backing";
  }
  
  // Analyze speechiness
  let speechProfile;
  if (features.speechiness > 0.66) {
    speechProfile = "Spoken word or talk show";
  } else if (features.speechiness > 0.33) {
    speechProfile = "Music with spoken elements (like rap)";
  } else {
    speechProfile = "Music without spoken words";
  }
  
  return {
    key: {
      name: keyName,
      mode: modeName,
      fullName: `${keyName} ${modeName}`
    },
    structure: {
      timeSignature: `${features.time_signature}/4`,
      tempo: `${Math.round(features.tempo)} BPM`
    },
    soundProfile: {
      instrumentalness: instrumentalProfile,
      speechiness: speechProfile,
      acousticness: `${Math.round(features.acousticness * 100)}% acoustic`,
      liveness: features.liveness > 0.8 ? "Likely recorded at a live performance" : "Likely a studio recording"
    }
  };
}

/**
 * Generates recommendations based on audio features
 * @param {object} features - The audio features
 * @returns {object} - Recommendations
 */
function generateRecommendations(features) {
  const recommendations = {
    listeningContext: [],
    similarFeatures: []
  };
  
  // Listening context recommendations
  if (features.energy > 0.8 && features.tempo > 120) {
    recommendations.listeningContext.push("Workout or exercise");
    recommendations.listeningContext.push("Party or celebration");
  }
  
  if (features.energy < 0.4 && features.acousticness > 0.6) {
    recommendations.listeningContext.push("Relaxation or meditation");
    recommendations.listeningContext.push("Reading or studying");
  }
  
  if (features.valence > 0.7 && features.energy > 0.6) {
    recommendations.listeningContext.push("Morning motivation");
    recommendations.listeningContext.push("Social gatherings");
  }
  
  if (features.valence < 0.3 && features.tempo < 100) {
    recommendations.listeningContext.push("Reflective moments");
    recommendations.listeningContext.push("Rainy day listening");
  }
  
  if (features.danceability > 0.7) {
    recommendations.listeningContext.push("Dancing or movement");
  }
  
  // If no specific contexts were identified
  if (recommendations.listeningContext.length === 0) {
    recommendations.listeningContext.push("General listening");
    recommendations.listeningContext.push("Background music");
  }
  
  // Similar features to look for
  recommendations.similarFeatures.push(`Energy: ${Math.round(features.energy * 100)}%`);
  recommendations.similarFeatures.push(`Valence: ${Math.round(features.valence * 100)}%`);
  recommendations.similarFeatures.push(`Tempo: Around ${Math.round(features.tempo)} BPM`);
  
  if (features.acousticness > 0.5) {
    recommendations.similarFeatures.push("Acoustic instrumentation");
  }
  
  if (features.instrumentalness > 0.5) {
    recommendations.similarFeatures.push("Instrumental tracks");
  }
  
  return recommendations;
}

/**
 * Compares a specific aspect across multiple tracks
 * @param {Array} tracksData - Array of track data objects
 * @param {string} aspect - The aspect to compare
 * @returns {object} - Comparison results for the aspect
 */
function compareAspect(tracksData, aspect) {
  // Extract the relevant feature values for each track
  const values = tracksData.map(track => ({
    id: track.id,
    name: track.name,
    value: track.features[aspect]
  }));
  
  // Sort by the feature value
  values.sort((a, b) => b.value - a.value);
  
  // Calculate average and range
  const average = values.reduce((sum, item) => sum + item.value, 0) / values.length;
  const highest = values[0];
  const lowest = values[values.length - 1];
  const range = highest.value - lowest.value;
  
  // Generate description based on the aspect
  let description;
  switch (aspect) {
    case 'energy':
      description = `The tracks range from ${Math.round(lowest.value * 100)}% energy ("${lowest.name}") to ${Math.round(highest.value * 100)}% energy ("${highest.name}"). `;
      description += range > 0.4 ? "There's a significant difference in energy levels across these tracks." : "The energy levels are relatively consistent across these tracks.";
      break;
    case 'danceability':
      description = `The tracks range from ${Math.round(lowest.value * 100)}% danceability ("${lowest.name}") to ${Math.round(highest.value * 100)}% danceability ("${highest.name}"). `;
      description += range > 0.4 ? "There's a significant difference in how danceable these tracks are." : "The danceability is relatively consistent across these tracks.";
      break;
    case 'valence':
      description = `The emotional tone ranges from ${Math.round(lowest.value * 100)}% positive ("${lowest.name}") to ${Math.round(highest.value * 100)}% positive ("${highest.name}"). `;
      description += range > 0.4 ? "There's a significant emotional range across these tracks." : "The emotional tone is relatively consistent across these tracks.";
      break;
    case 'tempo':
      description = `The tempo ranges from ${Math.round(lowest.value)} BPM ("${lowest.name}") to ${Math.round(highest.value)} BPM ("${highest.name}"). `;
      description += Math.abs(highest.value - lowest.value) > 30 ? "There's a significant difference in tempo across these tracks." : "The tempo is relatively consistent across these tracks.";
      break;
    case 'acousticness':
      description = `The tracks range from ${Math.round(lowest.value * 100)}% acoustic ("${lowest.name}") to ${Math.round(highest.value * 100)}% acoustic ("${highest.name}"). `;
      description += range > 0.4 ? "There's a significant difference in how acoustic these tracks are." : "The acoustic quality is relatively consistent across these tracks.";
      break;
    case 'instrumentalness':
      description = `The tracks range from ${Math.round(lowest.value * 100)}% instrumental ("${lowest.name}") to ${Math.round(highest.value * 100)}% instrumental ("${highest.name}"). `;
      description += range > 0.4 ? "There's a significant difference in how instrumental these tracks are." : "The instrumental quality is relatively consistent across these tracks.";
      break;
    default:
      description = `The ${aspect} values range from ${Math.round(lowest.value * 100)}% ("${lowest.name}") to ${Math.round(highest.value * 100)}% ("${highest.name}").`;
  }
  
  return {
    values: values.map(item => ({
      id: item.id,
      name: item.name,
      value: item.value,
      displayValue: aspect === 'tempo' ? Math.round(item.value) : Math.round(item.value * 100) + '%'
    })),
    average: aspect === 'tempo' ? Math.round(average) : Math.round(average * 100) + '%',
    range: aspect === 'tempo' ? Math.round(Math.abs(highest.value - lowest.value)) : Math.round(range * 100) + '%',
    highest: {
      id: highest.id,
      name: highest.name,
      value: aspect === 'tempo' ? Math.round(highest.value) : Math.round(highest.value * 100) + '%'
    },
    lowest: {
      id: lowest.id,
      name: lowest.name,
      value: aspect === 'tempo' ? Math.round(lowest.value) : Math.round(lowest.value * 100) + '%'
    },
    description
  };
}

/**
 * Generates an overall summary of the comparison
 * @param {Array} tracksData - Array of track data objects
 * @param {Array} aspects - The aspects that were compared
 * @returns {string} - A summary of the comparison
 */
function generateComparisonSummary(tracksData, aspects) {
  // Find the track with the highest average value across all aspects
  const trackScores = tracksData.map(track => {
    const aspectValues = aspects.map(aspect => track.features[aspect] || 0);
    const averageScore = aspectValues.reduce((sum, val) => sum + val, 0) / aspectValues.length;
    return {
      id: track.id,
      name: track.name,
      artists: track.artists,
      score: averageScore
    };
  });
  
  // Sort by score
  trackScores.sort((a, b) => b.score - a.score);
  
  // Calculate similarity between tracks
  let mostSimilarPair = null;
  let leastSimilarPair = null;
  let smallestDifference = Infinity;
  let largestDifference = -Infinity;
  
  for (let i = 0; i < tracksData.length; i++) {
    for (let j = i + 1; j < tracksData.length; j++) {
      const track1 = tracksData[i];
      const track2 = tracksData[j];
      
      // Calculate Euclidean distance across all aspects
      let sumSquaredDiff = 0;
      aspects.forEach(aspect => {
        const diff = track1.features[aspect] - track2.features[aspect];
        sumSquaredDiff += diff * diff;
      });
      const distance = Math.sqrt(sumSquaredDiff);
      
      if (distance < smallestDifference) {
        smallestDifference = distance;
        mostSimilarPair = {
          track1: { id: track1.id, name: track1.name },
          track2: { id: track2.id, name: track2.name }
        };
      }
      
      if (distance > largestDifference) {
        largestDifference = distance;
        leastSimilarPair = {
          track1: { id: track1.id, name: track1.name },
          track2: { id: track2.id, name: track2.name }
        };
      }
    }
  }
  
  // Generate summary text
  let summary = `This collection contains ${tracksData.length} tracks with varying musical characteristics. `;
  
  if (mostSimilarPair) {
    summary += `The most similar tracks are "${mostSimilarPair.track1.name}" and "${mostSimilarPair.track2.name}". `;
  }
  
  if (leastSimilarPair) {
    summary += `The most different tracks are "${leastSimilarPair.track1.name}" and "${leastSimilarPair.track2.name}". `;
  }
  
  // Add information about the "strongest" track
  if (trackScores.length > 0) {
    const topTrack = trackScores[0];
    summary += `"${topTrack.name}" by ${topTrack.artists} stands out with the highest overall scores across the analyzed aspects.`;
  }
  
  return summary;
}

export { registerMusicAnalysisTools }; 