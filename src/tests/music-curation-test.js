/**
 * Music Curation Tools Test Script
 * 
 * This script tests the Layer 3 music curation tools.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');
const logger = require('../utils/logger');
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Import the music curation functions directly for testing
const { 
  registerMusicCurationTools 
} = require('../layer3/musicCurationTools');

// Create a mock server for testing
const mockServer = {
  tools: {},
  registerTool: function(tool) {
    this.tools[tool.name] = tool;
    console.log(`Registered tool: ${tool.name}`);
  }
};

// Mock Layer 1 and Layer 2 servers
const mockLayer1Server = {};
const mockLayer2Server = {};

// Register the tools with our mock server
registerMusicCurationTools(mockServer, mockLayer1Server, mockLayer2Server);

/**
 * Test the curate-personalized-collection tool
 * @param {object} params - Parameters for collection curation
 */
async function testCuratePersonalizedCollection(params) {
  try {
    console.log('\nTesting curate-personalized-collection...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const curatePersonalizedCollection = mockServer.tools['curate-personalized-collection'].handler;
    
    const result = await curatePersonalizedCollection(params);
    
    console.log('\nPersonalized Collection Results:');
    console.log('==============================');
    console.log(`Theme: ${result.collection.theme}`);
    console.log(`Track Count: ${result.collection.trackCount}`);
    
    console.log('\nCuration Strategy:');
    console.log(`Description: ${result.collection.strategy.description}`);
    console.log('Sections:');
    result.collection.strategy.sections.forEach((section, index) => {
      console.log(`  ${index + 1}. ${section.name} (${Math.round(section.proportion * 100)}%)`);
      console.log(`     ${section.description}`);
    });
    
    console.log('\nTracks:');
    result.collection.tracks.forEach((track, index) => {
      console.log(`${index + 1}. ${track.name} by ${track.artists.join(', ')}`);
    });
    
    if (result.playlist) {
      console.log('\nPlaylist:');
      console.log(`Name: ${result.playlist.name}`);
      console.log(`URL: ${result.playlist.url}`);
    }
    
    if (result.analysis) {
      console.log('\nAnalysis:');
      console.log(`Overall Profile: ${result.analysis.overallProfile}`);
      console.log(`Theme Alignment: ${result.analysis.themeAlignment}`);
      console.log('Listening Contexts:');
      result.analysis.listeningContexts.forEach((context, index) => {
        console.log(`  ${index + 1}. ${context}`);
      });
      console.log(`Musical Journey: ${result.analysis.musicalJourney}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error testing curate-personalized-collection:', error.message);
    throw error;
  }
}

/**
 * Main function to run all tests
 */
async function main() {
  try {
    console.log('Starting Music Curation Tools tests...\n');
    
    // Get user ID from environment variables
    const userId = process.env.SPOTIFY_TEST_USER_ID;
    
    if (!userId) {
      throw new Error('SPOTIFY_TEST_USER_ID environment variable is required');
    }
    
    // Test curate-personalized-collection
    await testCuratePersonalizedCollection({
      userId,
      theme: 'Workout Motivation',
      preferences: {
        favoriteArtists: ['Imagine Dragons', 'Foo Fighters', 'Coldplay'],
        favoriteGenres: ['rock', 'pop', 'electronic'],
        mood: 'energetic',
        energyLevel: 'high',
        excludeExplicit: false
      },
      context: {
        occasion: 'Gym session',
        duration: 45,
        location: 'Fitness center',
        timeOfDay: 'Morning',
        season: 'Summer'
      },
      collectionSize: 10,
      createPlaylist: true,
      includeAnalysis: true
    });
    
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
  testCuratePersonalizedCollection
}; 