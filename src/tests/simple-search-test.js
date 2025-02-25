/**
 * Simple Spotify Search Test
 * 
 * A minimal test script to verify Spotify API credentials and search functionality
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');
const axios = require('axios');

async function testAuth() {
  try {
    console.log('Testing Spotify API authentication directly...');
    
    // Get client credentials from environment variables
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    console.log(`Using Client ID: ${clientId.substring(0, 5)}...${clientId.substring(clientId.length - 5)}`);
    console.log(`Using Client Secret: ${clientSecret.substring(0, 5)}...${clientSecret.substring(clientSecret.length - 5)}`);

    // Encode client ID and secret for Basic Auth
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Request access token
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('\nAuthentication successful!');
    console.log(`Token Type: ${response.data.token_type}`);
    console.log(`Expires In: ${response.data.expires_in} seconds`);
    console.log(`Access Token: ${response.data.access_token.substring(0, 10)}...`);
    
    return response.data.access_token;
  } catch (error) {
    console.error('\nError testing Spotify authentication:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

async function testSearch(token) {
  try {
    console.log('\nTesting Spotify API search functionality...');
    
    // Simple search for a well-known artist
    const query = 'The Beatles';
    const types = ['artist'];
    const limit = 1;
    
    console.log(`Searching for "${query}"...`);
    
    // If we have a token from direct auth test, use it
    if (token) {
      console.log('Using token from direct authentication test');
      const response = await axios.get(
        'https://api.spotify.com/v1/search',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params: {
            q: query,
            type: types.join(','),
            limit
          }
        }
      );
      
      if (response.data.artists && response.data.artists.items.length > 0) {
        const artist = response.data.artists.items[0];
        console.log('\nSuccess! Found artist:');
        console.log(`Name: ${artist.name}`);
        console.log(`ID: ${artist.id}`);
        console.log(`Popularity: ${artist.popularity}`);
        console.log(`Followers: ${artist.followers.total.toLocaleString()}`);
        console.log(`Genres: ${artist.genres.join(', ')}`);
      }
      
      return response.data;
    } else {
      // Use our client
      console.log('Using spotifyClient');
      const results = await spotifyClient.search(query, types, limit);
      
      if (results.artists && results.artists.items.length > 0) {
        const artist = results.artists.items[0];
        console.log('\nSuccess! Found artist:');
        console.log(`Name: ${artist.name}`);
        console.log(`ID: ${artist.id}`);
        console.log(`Popularity: ${artist.popularity}`);
        console.log(`Followers: ${artist.followers.total.toLocaleString()}`);
        console.log(`Genres: ${artist.genres.join(', ')}`);
      }
      
      return results;
    }
  } catch (error) {
    console.error('\nError testing Spotify search:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

// Run the tests
async function runTests() {
  try {
    console.log('Starting Spotify API tests...\n');
    
    // Test authentication directly
    let token;
    try {
      token = await testAuth();
      console.log('\nDirect authentication test passed!');
    } catch (error) {
      console.error('\nDirect authentication test failed!');
    }
    
    // Test search
    try {
      await testSearch(token);
      console.log('\nSearch test passed!');
    } catch (error) {
      console.error('\nSearch test failed!');
    }
    
    console.log('\nAll tests completed.');
  } catch (error) {
    console.error('\nTests failed with an unexpected error.');
  }
}

runTests(); 