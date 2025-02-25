/**
 * Playlist Generation Tools Test Script
 * 
 * This script tests the Layer 2 playlist generation tools.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');
const logger = require('../utils/logger');

// Import the playlist generation functions directly for testing
const { 
  registerPlaylistGenerationTools 
} = require('../layer2/playlistGenerationTools');

// Create a mock server for testing
const mockServer = {
  tools: {},
  registerTool: function(tool) {
    this.tools[tool.name] = tool;
    console.log(`Registered tool: ${tool.name}`);
  }
};

// Register the tools with our mock server
registerPlaylistGenerationTools(mockServer);

/**
 * Test the generate-playlist tool
 * @param {object} params - Parameters for playlist generation
 */
async function testGeneratePlaylist(params) {
  try {
    console.log('\nTesting generate-playlist...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const generatePlaylist = mockServer.tools['generate-playlist'].handler;
    
    const result = await generatePlaylist(params);
    
    console.log('\nPlaylist Generation Results:');
    console.log('===========================');
    console.log(`Playlist: ${result.playlist.name} (${result.playlist.id})`);
    console.log(`URL: ${result.playlist.url}`);
    console.log(`Track Count: ${result.playlist.trackCount}`);
    
    console.log('\nTracks:');
    result.tracks.forEach((track, index) => {
      console.log(`${index + 1}. ${track.name} by ${track.artists.join(', ')}`);
    });
    
    return result;
  } catch (error) {
    console.error('Error testing generate-playlist:', error.message);
    throw error;
  }
}

/**
 * Test the enhance-playlist tool
 * @param {object} params - Parameters for playlist enhancement
 */
async function testEnhancePlaylist(params) {
  try {
    console.log('\nTesting enhance-playlist...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const enhancePlaylist = mockServer.tools['enhance-playlist'].handler;
    
    const result = await enhancePlaylist(params);
    
    console.log('\nPlaylist Enhancement Results:');
    console.log('============================');
    console.log(`Playlist: ${result.playlist.name} (${result.playlist.id})`);
    console.log(`URL: ${result.playlist.url}`);
    console.log(`Original Track Count: ${result.playlist.originalTrackCount}`);
    console.log(`Added Track Count: ${result.playlist.addedTrackCount}`);
    console.log(`New Total Track Count: ${result.playlist.newTrackCount}`);
    
    console.log('\nAdded Tracks:');
    result.addedTracks.forEach((track, index) => {
      console.log(`${index + 1}. ${track.name} by ${track.artists.join(', ')}`);
    });
    
    return result;
  } catch (error) {
    console.error('Error testing enhance-playlist:', error.message);
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
    
    const results = await spotifyClient.search(query, ['artist'], 3);
    
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
    
    const results = await spotifyClient.search(query, ['track'], 3);
    
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
    console.log('Starting Playlist Generation Tools tests...\n');
    
    // Get user ID from environment variables
    const userId = process.env.SPOTIFY_TEST_USER_ID;
    
    if (!userId) {
      throw new Error('SPOTIFY_TEST_USER_ID environment variable is required');
    }
    
    // Search for artists and tracks to use as seeds
    const artistIds = await searchForArtists('The Beatles');
    const trackIds = await searchForTracks('Queen');
    
    if (artistIds.length === 0 || trackIds.length === 0) {
      throw new Error('Could not find artists or tracks for testing');
    }
    
    // Test generate-playlist
    const playlistResult = await testGeneratePlaylist({
      name: 'Test Generated Playlist',
      description: 'A playlist generated by the Spotify AIPI tools test',
      criteria: {
        seed_artists: [artistIds[0]],
        seed_tracks: [trackIds[0]],
        target_energy: 0.7,
        target_danceability: 0.6,
        min_popularity: 50
      },
      userId,
      trackCount: 10,
      public: false
    });
    
    // Test enhance-playlist with the generated playlist
    if (playlistResult && playlistResult.playlist && playlistResult.playlist.id) {
      await testEnhancePlaylist({
        playlistId: playlistResult.playlist.id,
        trackCount: 5,
        maintainStyle: true,
        diversify: true
      });
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
  testGeneratePlaylist,
  testEnhancePlaylist
}; 