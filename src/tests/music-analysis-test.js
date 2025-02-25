/**
 * Music Analysis Tools Test Script
 * 
 * This script tests the Layer 2 music analysis tools.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');
const logger = require('../utils/logger');

// Import the music analysis functions directly for testing
const { 
  registerMusicAnalysisTools 
} = require('../layer2/musicAnalysisTools');

// Create a mock server for testing
const mockServer = {
  tools: {},
  registerTool: function(tool) {
    this.tools[tool.name] = tool;
    console.log(`Registered tool: ${tool.name}`);
  }
};

// Register the tools with our mock server
registerMusicAnalysisTools(mockServer);

/**
 * Test the analyze-track-features tool
 * @param {string} trackId - Spotify track ID to analyze
 */
async function testAnalyzeTrackFeatures(trackId) {
  try {
    console.log(`\nTesting analyze-track-features for track ${trackId}...`);
    
    const analyzeTrackFeatures = mockServer.tools['analyze-track-features'].handler;
    
    const result = await analyzeTrackFeatures({ 
      trackId, 
      includeTrackDetails: true 
    });
    
    console.log('\nTrack Analysis Results:');
    console.log('======================');
    
    if (result.trackDetails) {
      console.log(`\nTrack: ${result.trackDetails.name}`);
      console.log(`Artists: ${result.trackDetails.artists.join(', ')}`);
      console.log(`Album: ${result.trackDetails.album}`);
      console.log(`Release Date: ${result.trackDetails.releaseDate}`);
      console.log(`Popularity: ${result.trackDetails.popularity}/100`);
    }
    
    console.log(`\nSummary: ${result.analysis.summary}`);
    
    console.log('\nMood Analysis:');
    console.log(`Primary Mood: ${result.analysis.mood.primaryMood}`);
    console.log(`Description: ${result.analysis.mood.moodDescription}`);
    console.log('Mood Metrics:');
    Object.entries(result.analysis.mood.moodMetrics).forEach(([key, value]) => {
      console.log(`  ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}%`);
    });
    
    console.log('\nEnergy Analysis:');
    console.log(`Profile: ${result.analysis.energyAnalysis.energyProfile}`);
    console.log(`Description: ${result.analysis.energyAnalysis.energyDescription}`);
    
    console.log('\nDanceability Analysis:');
    console.log(`Profile: ${result.analysis.danceabilityAnalysis.danceProfile}`);
    console.log(`Description: ${result.analysis.danceabilityAnalysis.danceDescription}`);
    
    console.log('\nMusical Attributes:');
    console.log(`Key: ${result.analysis.musicalAttributes.key.fullName}`);
    console.log(`Time Signature: ${result.analysis.musicalAttributes.structure.timeSignature}`);
    console.log(`Tempo: ${result.analysis.musicalAttributes.structure.tempo}`);
    
    console.log('\nRecommendations:');
    console.log('Listening Contexts:');
    result.analysis.recommendations.listeningContext.forEach(context => {
      console.log(`  - ${context}`);
    });
    
    return result;
  } catch (error) {
    console.error('Error testing analyze-track-features:', error.message);
    throw error;
  }
}

/**
 * Test the compare-tracks tool
 * @param {string[]} trackIds - Array of Spotify track IDs to compare
 */
async function testCompareTracks(trackIds) {
  try {
    console.log(`\nTesting compare-tracks for ${trackIds.length} tracks...`);
    
    const compareTracks = mockServer.tools['compare-tracks'].handler;
    
    const result = await compareTracks({ 
      trackIds,
      aspects: ['all']
    });
    
    console.log('\nTrack Comparison Results:');
    console.log('========================');
    
    console.log('\nTracks:');
    result.tracks.forEach((track, index) => {
      console.log(`${index + 1}. ${track.name} (${track.id})`);
    });
    
    console.log('\nSummary:');
    console.log(result.summary);
    
    console.log('\nEnergy Comparison:');
    console.log(result.comparisons.energy.description);
    console.log(`Average: ${result.comparisons.energy.average}`);
    console.log(`Range: ${result.comparisons.energy.range}`);
    
    console.log('\nDanceability Comparison:');
    console.log(result.comparisons.danceability.description);
    console.log(`Average: ${result.comparisons.danceability.average}`);
    console.log(`Range: ${result.comparisons.danceability.range}`);
    
    return result;
  } catch (error) {
    console.error('Error testing compare-tracks:', error.message);
    throw error;
  }
}

/**
 * Search for tracks to use in testing
 * @param {string} query - Search query
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} - Array of track IDs
 */
async function searchForTestTracks(query, limit = 5) {
  try {
    console.log(`Searching for tracks with query: "${query}"...`);
    
    const results = await spotifyClient.search(query, ['track'], limit);
    
    if (!results.tracks || results.tracks.items.length === 0) {
      throw new Error('No tracks found for the search query');
    }
    
    console.log('\nFound tracks:');
    const trackIds = results.tracks.items.map((track, index) => {
      const artists = track.artists.map(a => a.name).join(', ');
      console.log(`${index + 1}. ${track.name} by ${artists} (${track.id})`);
      return track.id;
    });
    
    return trackIds;
  } catch (error) {
    console.error('Error searching for test tracks:', error.message);
    throw error;
  }
}

/**
 * Main function to run all tests
 */
async function main() {
  try {
    console.log('Starting Music Analysis Tools tests...\n');
    
    // Search for test tracks
    const trackIds = await searchForTestTracks('The Beatles', 3);
    
    if (trackIds.length === 0) {
      throw new Error('No tracks found for testing');
    }
    
    // Test analyze-track-features with the first track
    await testAnalyzeTrackFeatures(trackIds[0]);
    
    // Test compare-tracks with all tracks
    if (trackIds.length >= 2) {
      await testCompareTracks(trackIds);
    }
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('\nTests failed:', error.message);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  testAnalyzeTrackFeatures,
  testCompareTracks
}; 