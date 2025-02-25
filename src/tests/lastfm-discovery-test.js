/**
 * Last.fm Music Discovery Tools Test Script
 * 
 * This script tests the Layer 2 Last.fm music discovery tools.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const logger = require('../utils/logger');
const lastfmClient = require('../utils/lastfmClient');

// Import the Last.fm discovery functions directly for testing
const { 
  registerLastfmDiscoveryTools 
} = require('../layer2/lastfmDiscoveryTools');

// Create a mock server for testing
const mockServer = {
  tools: {},
  registerTool: function(tool) {
    this.tools[tool.name] = tool;
    console.log(`Registered tool: ${tool.name}`);
  }
};

// Register the tools with our mock server
registerLastfmDiscoveryTools(mockServer);

/**
 * Test the discover-similar-tracks tool
 * @param {object} params - Parameters for track discovery
 */
async function testDiscoverSimilarTracks(params) {
  try {
    console.log('\nTesting discover-similar-tracks...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const discoverSimilarTracks = mockServer.tools['discover-similar-tracks'].handler;
    
    const result = await discoverSimilarTracks(params);
    
    console.log('\nSimilar Tracks Discovery Results:');
    console.log('===============================');
    console.log(`Source Track: "${result.sourceTrack.name}" by ${result.sourceTrack.artist}`);
    console.log(`Found ${result.similarTracks.length} similar tracks`);
    
    console.log('\nTop 5 Similar Tracks:');
    result.similarTracks.slice(0, 5).forEach((track, index) => {
      console.log(`${index + 1}. "${track.name}" by ${track.artist}`);
      console.log(`   Match: ${track.match.toFixed(1)}%`);
      console.log(`   Last.fm URL: ${track.url}`);
      
      if (track.spotify) {
        console.log(`   Spotify: ${track.spotify.externalUrl}`);
        console.log(`   Popularity: ${track.spotify.popularity}`);
      } else {
        console.log('   Not found on Spotify');
      }
      
      console.log('');
    });
    
    if (result.similarTracks.length > 5) {
      console.log(`... and ${result.similarTracks.length - 5} more tracks`);
    }
    
    console.log('\nInsights:');
    console.log(`Summary: ${result.insights.summary}`);
    
    if (result.insights.topArtists && result.insights.topArtists.length > 0) {
      console.log('\nTop Artists:');
      result.insights.topArtists.forEach((artist, index) => {
        console.log(`${index + 1}. ${artist.name} (${artist.count} tracks)`);
      });
    }
    
    console.log('\nSpotify Availability:');
    console.log(`Available: ${result.insights.spotifyAvailability.available}`);
    console.log(`Unavailable: ${result.insights.spotifyAvailability.unavailable}`);
    console.log(`Percentage: ${result.insights.spotifyAvailability.percentage}%`);
    
    if (result.insights.popularityRange) {
      console.log('\nPopularity Range:');
      console.log(`Min: ${result.insights.popularityRange.min}`);
      console.log(`Max: ${result.insights.popularityRange.max}`);
      console.log(`Average: ${result.insights.popularityRange.average}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error testing discover-similar-tracks:', error.message);
    throw error;
  }
}

/**
 * Test the discover-similar-artists tool
 * @param {object} params - Parameters for artist discovery
 */
async function testDiscoverSimilarArtists(params) {
  try {
    console.log('\nTesting discover-similar-artists...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const discoverSimilarArtists = mockServer.tools['discover-similar-artists'].handler;
    
    const result = await discoverSimilarArtists(params);
    
    console.log('\nSimilar Artists Discovery Results:');
    console.log('===============================');
    console.log(`Source Artist: ${result.sourceArtist}`);
    console.log(`Found ${result.similarArtists.length} similar artists`);
    
    console.log('\nTop 5 Similar Artists:');
    result.similarArtists.slice(0, 5).forEach((artist, index) => {
      console.log(`${index + 1}. ${artist.name}`);
      console.log(`   Match: ${artist.match.toFixed(1)}%`);
      console.log(`   Last.fm URL: ${artist.url}`);
      
      if (artist.topTracks && artist.topTracks.length > 0) {
        console.log('   Top Tracks:');
        artist.topTracks.forEach((track, trackIndex) => {
          console.log(`     ${trackIndex + 1}. ${track.name} (${track.listeners.toLocaleString()} listeners)`);
        });
      }
      
      console.log('');
    });
    
    if (result.similarArtists.length > 5) {
      console.log(`... and ${result.similarArtists.length - 5} more artists`);
    }
    
    console.log('\nInsights:');
    console.log(`Summary: ${result.insights.summary}`);
    
    console.log('\nMatch Distribution:');
    console.log(`High (70%+): ${result.insights.matchDistribution.high}`);
    console.log(`Medium (40-70%): ${result.insights.matchDistribution.medium}`);
    console.log(`Low (<40%): ${result.insights.matchDistribution.low}`);
    
    return result;
  } catch (error) {
    console.error('Error testing discover-similar-artists:', error.message);
    throw error;
  }
}

/**
 * Test the discover-by-tag tool
 * @param {object} params - Parameters for tag-based discovery
 */
async function testDiscoverByTag(params) {
  try {
    console.log('\nTesting discover-by-tag...');
    console.log('Parameters:', JSON.stringify(params, null, 2));
    
    const discoverByTag = mockServer.tools['discover-by-tag'].handler;
    
    const result = await discoverByTag(params);
    
    console.log('\nTag-based Discovery Results:');
    console.log('==========================');
    console.log(`Tag: ${result.tag}`);
    console.log(`Found ${result.tracks.length} tracks`);
    
    console.log('\nTop 5 Tracks:');
    result.tracks.slice(0, 5).forEach((track, index) => {
      console.log(`${index + 1}. "${track.name}" by ${track.artist}`);
      console.log(`   Rank: ${track.rank}`);
      console.log(`   Last.fm URL: ${track.url}`);
      
      if (track.spotify) {
        console.log(`   Spotify: ${track.spotify.externalUrl}`);
        console.log(`   Popularity: ${track.spotify.popularity}`);
      } else {
        console.log('   Not found on Spotify');
      }
      
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
    
    return result;
  } catch (error) {
    console.error('Error testing discover-by-tag:', error.message);
    throw error;
  }
}

/**
 * Main function to run all tests
 */
async function main() {
  try {
    console.log('Starting Last.fm Music Discovery Tools tests...\n');
    
    // Check if Last.fm API key is set
    if (!process.env.LASTFM_API_KEY) {
      console.error('LASTFM_API_KEY environment variable is not set. Please set it in src/.env');
      process.exit(1);
    }
    
    // Test discover-similar-tracks
    await testDiscoverSimilarTracks({
      trackName: 'Viva La Vida',
      artistName: 'Coldplay',
      limit: 10,
      findOnSpotify: true
    });
    
    // Test discover-similar-artists
    await testDiscoverSimilarArtists({
      artistName: 'Coldplay',
      limit: 10,
      includeTopTracks: true
    });
    
    // Test discover-by-tag
    await testDiscoverByTag({
      tag: 'indie rock',
      limit: 10,
      findOnSpotify: true
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
  testDiscoverSimilarTracks,
  testDiscoverSimilarArtists,
  testDiscoverByTag
}; 