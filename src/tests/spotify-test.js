/**
 * Spotify API Test Script
 * 
 * This script tests the Spotify API client and tools.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');
const logger = require('../utils/logger');

/**
 * Test the Spotify search functionality
 */
async function testSearch() {
  try {
    console.log('Testing Spotify search...');
    
    const query = 'The Beatles';
    const types = ['artist', 'track'];
    const limit = 5;
    
    console.log(`Searching for "${query}" (types: ${types.join(', ')}, limit: ${limit})...`);
    
    const results = await spotifyClient.search(query, types, limit);
    
    console.log('\nSearch Results:');
    console.log('==============');
    
    // Display artists
    if (results.artists && results.artists.items.length > 0) {
      console.log('\nArtists:');
      results.artists.items.forEach((artist, index) => {
        console.log(`${index + 1}. ${artist.name} (Popularity: ${artist.popularity})`);
        console.log(`   ID: ${artist.id}`);
        console.log(`   Genres: ${artist.genres.join(', ') || 'None'}`);
        console.log(`   Followers: ${artist.followers.total.toLocaleString()}`);
        console.log('');
      });
    }
    
    // Display tracks
    if (results.tracks && results.tracks.items.length > 0) {
      console.log('\nTracks:');
      results.tracks.items.forEach((track, index) => {
        const artists = track.artists.map(a => a.name).join(', ');
        console.log(`${index + 1}. ${track.name} by ${artists}`);
        console.log(`   ID: ${track.id}`);
        console.log(`   Album: ${track.album.name}`);
        console.log(`   Duration: ${Math.floor(track.duration_ms / 60000)}:${((track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`);
        console.log(`   Popularity: ${track.popularity}`);
        console.log('');
      });
    }
    
    return results;
  } catch (error) {
    console.error('Error testing Spotify search:', error.message);
    throw error;
  }
}

/**
 * Test getting audio features for a track
 * @param {string} trackId - Spotify track ID
 */
async function testGetAudioFeatures(trackId) {
  try {
    console.log(`\nTesting get audio features for track ${trackId}...`);
    
    const audioFeatures = await spotifyClient.getAudioFeatures(trackId);
    
    console.log('\nAudio Features:');
    console.log('==============');
    console.log(`Acousticness: ${audioFeatures.acousticness.toFixed(2)}`);
    console.log(`Danceability: ${audioFeatures.danceability.toFixed(2)}`);
    console.log(`Energy: ${audioFeatures.energy.toFixed(2)}`);
    console.log(`Instrumentalness: ${audioFeatures.instrumentalness.toFixed(2)}`);
    console.log(`Key: ${audioFeatures.key}`);
    console.log(`Liveness: ${audioFeatures.liveness.toFixed(2)}`);
    console.log(`Loudness: ${audioFeatures.loudness.toFixed(2)} dB`);
    console.log(`Mode: ${audioFeatures.mode === 1 ? 'Major' : 'Minor'}`);
    console.log(`Speechiness: ${audioFeatures.speechiness.toFixed(2)}`);
    console.log(`Tempo: ${audioFeatures.tempo.toFixed(2)} BPM`);
    console.log(`Time Signature: ${audioFeatures.time_signature}/4`);
    console.log(`Valence: ${audioFeatures.valence.toFixed(2)}`);
    
    return audioFeatures;
  } catch (error) {
    console.error('Error testing get audio features:', error.message);
    throw error;
  }
}

/**
 * Main function to run all tests
 */
async function main() {
  try {
    console.log('Starting Spotify API tests...\n');
    
    // Test search
    const searchResults = await testSearch();
    
    // Skip audio features test for now as it requires additional permissions
    // if (searchResults.tracks && searchResults.tracks.items.length > 0) {
    //   const trackId = searchResults.tracks.items[0].id;
    //   await testGetAudioFeatures(trackId);
    // }
    
    console.log('\nSearch test completed successfully!');
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
  testSearch,
  testGetAudioFeatures
}; 