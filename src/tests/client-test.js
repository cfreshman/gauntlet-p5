/**
 * Spotify Client Test
 * 
 * Tests our Spotify client implementation directly
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');

async function testClient() {
  try {
    console.log('Testing Spotify client implementation...\n');
    
    // Test search
    console.log('Testing search functionality:');
    const searchResults = await spotifyClient.search('The Beatles', ['artist'], 1);
    
    if (searchResults.artists && searchResults.artists.items.length > 0) {
      const artist = searchResults.artists.items[0];
      console.log('\nSearch successful! Found artist:');
      console.log(`Name: ${artist.name}`);
      console.log(`ID: ${artist.id}`);
      console.log(`Popularity: ${artist.popularity}`);
      console.log(`Followers: ${artist.followers.total.toLocaleString()}`);
    } else {
      console.log('Search returned no results.');
    }
    
    // Test getting a track
    console.log('\nTesting get track functionality:');
    // "Hey Jude" by The Beatles
    const trackId = '0aym2LBJBk9DAYuHHutrIl';
    const track = await spotifyClient.getTrack(trackId);
    
    console.log('\nTrack details:');
    console.log(`Name: ${track.name}`);
    console.log(`Artists: ${track.artists.map(a => a.name).join(', ')}`);
    console.log(`Album: ${track.album.name}`);
    console.log(`Duration: ${Math.floor(track.duration_ms / 60000)}:${((track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`);
    
    // Skip audio features test for now as it requires additional permissions
    
    console.log('\nBasic client tests passed successfully!');
    return true;
  } catch (error) {
    console.error('\nClient test failed:');
    console.error(error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return false;
  }
}

// Run the test
testClient()
  .then(success => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 