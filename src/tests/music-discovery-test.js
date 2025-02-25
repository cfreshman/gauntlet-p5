/**
 * Music Discovery Tools Test Script
 * 
 * This script tests the Layer 2 music discovery tools.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');
const logger = require('../utils/logger');

// Import the music discovery functions directly for testing
const { 
  registerMusicDiscoveryTools 
} = require('../layer2/musicDiscoveryTools');

// Create a mock server for testing
const mockServer = {
  tools: {},
  registerTool: function(tool) {
    this.tools[tool.name] = tool;
    console.log(`Registered tool: ${tool.name}`);
  }
};

// Register the tools with our mock server
registerMusicDiscoveryTools(mockServer);

/**
 * Test the discover-similar-music tool
 * @param {object} params - Parameters for music discovery
 */
async function testDiscoverSimilarMusic(params) {
  try {
    console.log('\nTesting discover-similar-music...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const discoverSimilarMusic = mockServer.tools['discover-similar-music'].handler;
    
    const result = await discoverSimilarMusic(params);
    
    console.log('\nMusic Discovery Results:');
    console.log('=======================');
    console.log(`Seed Type: ${result.seedType}`);
    console.log(`Seeds: ${result.seeds.join(', ')}`);
    console.log(`Found ${result.tracks.length} similar tracks`);
    
    console.log('\nTracks:');
    result.tracks.slice(0, 5).forEach((track, index) => {
      console.log(`${index + 1}. ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
      console.log(`   Album: ${track.album.name}`);
      console.log(`   Popularity: ${track.popularity}`);
      console.log('');
    });
    
    if (result.tracks.length > 5) {
      console.log(`... and ${result.tracks.length - 5} more tracks`);
    }
    
    console.log('\nInsights:');
    console.log(`Summary: ${result.insights.summary}`);
    
    if (result.insights.topArtists && result.insights.topArtists.length > 0) {
      console.log('\nTop Artists:');
      result.insights.topArtists.forEach((artist, index) => {
        console.log(`${index + 1}. ${artist.name} (${artist.count} tracks)`);
      });
    }
    
    console.log('\nPopularity Range:');
    console.log(`Min: ${result.insights.popularityRange.min}`);
    console.log(`Max: ${result.insights.popularityRange.max}`);
    console.log(`Average: ${result.insights.popularityRange.average}`);
    
    if (result.insights.mood) {
      console.log(`\nMood: ${result.insights.mood}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error testing discover-similar-music:', error.message);
    throw error;
  }
}

/**
 * Search for artists to use in testing
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Array of artist IDs
 */
async function searchForArtists(query) {
  try {
    console.log(`Searching for artists with query: "${query}"...`);
    
    const results = await spotifyClient.search(query, ['artist'], 1);
    
    if (!results.artists || results.artists.items.length === 0) {
      throw new Error('No artists found for the search query');
    }
    
    console.log('\nFound artists:');
    const artistIds = results.artists.items.map((artist, index) => {
      console.log(`${index + 1}. ${artist.name} (${artist.id})`);
      return artist.id;
    });
    
    return artistIds;
  } catch (error) {
    console.error('Error searching for artists:', error.message);
    throw error;
  }
}

/**
 * Search for tracks to use in testing
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Array of track IDs
 */
async function searchForTracks(query) {
  try {
    console.log(`Searching for tracks with query: "${query}"...`);
    
    const results = await spotifyClient.search(query, ['track'], 1);
    
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
    console.error('Error searching for tracks:', error.message);
    throw error;
  }
}

/**
 * Main function to run all tests
 */
async function main() {
  try {
    console.log('Starting Music Discovery Tools tests...\n');
    
    // Search for artists to use as seeds
    const artistIds = await searchForArtists('Coldplay');
    
    if (artistIds.length === 0) {
      throw new Error('Could not find artists for testing');
    }
    
    // Test discover-similar-music with artist seeds
    await testDiscoverSimilarMusic({
      seedType: 'artists',
      seeds: artistIds,
      limit: 10,
      market: 'US',
      tunableTrackAttributes: {
        minEnergy: 0.6,
        minPopularity: 50
      },
      includeAudioFeatures: true
    });
    
    // Search for tracks to use as seeds
    const trackIds = await searchForTracks('Viva La Vida');
    
    if (trackIds.length === 0) {
      throw new Error('Could not find tracks for testing');
    }
    
    // Test discover-similar-music with track seeds
    await testDiscoverSimilarMusic({
      seedType: 'tracks',
      seeds: trackIds,
      limit: 10,
      market: 'US',
      includeAudioFeatures: true
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
  testDiscoverSimilarMusic
}; 