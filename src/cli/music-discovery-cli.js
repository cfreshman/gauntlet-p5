#!/usr/bin/env node

/**
 * Music Discovery CLI
 * 
 * A command-line interface for discovering music using Spotify and Last.fm APIs.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const readline = require('readline');
const spotifyClient = require('../utils/spotifyClient');
const lastfmClient = require('../utils/lastfmClient');
const { registerLastfmDiscoveryTools } = require('../layer2/lastfmDiscoveryTools');

// Create a mock server for the Last.fm discovery tools
const mockServer = {
  tools: {},
  registerTool: function(tool) {
    this.tools[tool.name] = tool;
  }
};

// Register the Last.fm discovery tools
registerLastfmDiscoveryTools(mockServer);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Main menu
 */
function showMainMenu() {
  console.log('\n=== Music Discovery CLI ===');
  console.log('1. Search for tracks on Spotify');
  console.log('2. Discover similar tracks (Last.fm)');
  console.log('3. Discover similar artists (Last.fm)');
  console.log('4. Discover tracks by tag/genre (Last.fm)');
  console.log('5. Get track audio features (Spotify)');
  console.log('6. Exit');
  
  rl.question('\nEnter your choice (1-6): ', (choice) => {
    switch (choice) {
      case '1':
        searchTracks();
        break;
      case '2':
        discoverSimilarTracks();
        break;
      case '3':
        discoverSimilarArtists();
        break;
      case '4':
        discoverByTag();
        break;
      case '5':
        getTrackAudioFeatures();
        break;
      case '6':
        console.log('Goodbye!');
        rl.close();
        break;
      default:
        console.log('Invalid choice. Please try again.');
        showMainMenu();
    }
  });
}

/**
 * Search for tracks on Spotify
 */
function searchTracks() {
  rl.question('\nEnter search query: ', (query) => {
    rl.question('Enter limit (default: 5): ', async (limitInput) => {
      const limit = parseInt(limitInput) || 5;
      
      try {
        console.log(`\nSearching for "${query}" on Spotify...`);
        const results = await spotifyClient.search(query, ['track'], limit);
        
        if (!results.tracks || results.tracks.items.length === 0) {
          console.log('No tracks found.');
        } else {
          console.log(`\nFound ${results.tracks.items.length} tracks:`);
          
          results.tracks.items.forEach((track, index) => {
            const artists = track.artists.map(a => a.name).join(', ');
            console.log(`${index + 1}. "${track.name}" by ${artists}`);
            console.log(`   Album: ${track.album.name}`);
            console.log(`   Spotify ID: ${track.id}`);
            console.log(`   Popularity: ${track.popularity}`);
            console.log(`   Preview URL: ${track.preview_url || 'Not available'}`);
            console.log(`   Spotify URL: ${track.external_urls.spotify}`);
            console.log('');
          });
        }
      } catch (error) {
        console.error('Error searching for tracks:', error.message);
      }
      
      returnToMainMenu();
    });
  });
}

/**
 * Discover similar tracks using Last.fm
 */
function discoverSimilarTracks() {
  rl.question('\nEnter track name: ', (trackName) => {
    rl.question('Enter artist name: ', (artistName) => {
      rl.question('Enter limit (default: 5): ', async (limitInput) => {
        const limit = parseInt(limitInput) || 5;
        
        try {
          console.log(`\nDiscovering tracks similar to "${trackName}" by "${artistName}" using Last.fm...`);
          
          const discoverSimilarTracks = mockServer.tools['discover-similar-tracks'].handler;
          const result = await discoverSimilarTracks({
            trackName,
            artistName,
            limit,
            findOnSpotify: true
          });
          
          console.log(`\nFound ${result.similarTracks.length} similar tracks:`);
          
          result.similarTracks.forEach((track, index) => {
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
          
          // Display insights
          console.log('Insights:');
          console.log(`Summary: ${result.insights.summary}`);
          
          if (result.insights.topArtists && result.insights.topArtists.length > 0) {
            console.log('\nTop Artists:');
            result.insights.topArtists.forEach((artist, index) => {
              console.log(`${index + 1}. ${artist.name} (${artist.count} tracks)`);
            });
          }
        } catch (error) {
          console.error('Error discovering similar tracks:', error.message);
        }
        
        returnToMainMenu();
      });
    });
  });
}

/**
 * Discover similar artists using Last.fm
 */
function discoverSimilarArtists() {
  rl.question('\nEnter artist name: ', (artistName) => {
    rl.question('Enter limit (default: 5): ', (limitInput) => {
      rl.question('Include top tracks? (y/n, default: n): ', async (includeTopTracksInput) => {
        const limit = parseInt(limitInput) || 5;
        const includeTopTracks = includeTopTracksInput.toLowerCase() === 'y';
        
        try {
          console.log(`\nDiscovering artists similar to "${artistName}" using Last.fm...`);
          
          const discoverSimilarArtists = mockServer.tools['discover-similar-artists'].handler;
          const result = await discoverSimilarArtists({
            artistName,
            limit,
            includeTopTracks
          });
          
          console.log(`\nFound ${result.similarArtists.length} similar artists:`);
          
          result.similarArtists.forEach((artist, index) => {
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
          
          // Display insights
          console.log('Insights:');
          console.log(`Summary: ${result.insights.summary}`);
          
          console.log('\nMatch Distribution:');
          console.log(`High (70%+): ${result.insights.matchDistribution.high}`);
          console.log(`Medium (40-70%): ${result.insights.matchDistribution.medium}`);
          console.log(`Low (<40%): ${result.insights.matchDistribution.low}`);
        } catch (error) {
          console.error('Error discovering similar artists:', error.message);
        }
        
        returnToMainMenu();
      });
    });
  });
}

/**
 * Discover tracks by tag/genre using Last.fm
 */
function discoverByTag() {
  rl.question('\nEnter tag/genre: ', (tag) => {
    rl.question('Enter limit (default: 5): ', async (limitInput) => {
      const limit = parseInt(limitInput) || 5;
      
      try {
        console.log(`\nDiscovering top tracks for tag "${tag}" using Last.fm...`);
        
        const discoverByTag = mockServer.tools['discover-by-tag'].handler;
        const result = await discoverByTag({
          tag,
          limit,
          findOnSpotify: true
        });
        
        console.log(`\nFound ${result.tracks.length} top tracks for tag "${tag}":`);
        
        result.tracks.forEach((track, index) => {
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
        
        // Display insights
        console.log('Insights:');
        console.log(`Summary: ${result.insights.summary}`);
        
        if (result.insights.topArtists && result.insights.topArtists.length > 0) {
          console.log('\nTop Artists:');
          result.insights.topArtists.forEach((artist, index) => {
            console.log(`${index + 1}. ${artist.name} (${artist.count} tracks)`);
          });
        }
      } catch (error) {
        console.error('Error discovering tracks by tag:', error.message);
      }
      
      returnToMainMenu();
    });
  });
}

/**
 * Get track audio features from Spotify
 */
function getTrackAudioFeatures() {
  rl.question('\nEnter Spotify track ID: ', async (trackId) => {
    try {
      console.log(`\nGetting audio features for track ${trackId}...`);
      
      // First, get the track details
      const track = await spotifyClient.getTrack(trackId);
      const artists = track.artists.map(a => a.name).join(', ');
      
      console.log(`\nTrack: "${track.name}" by ${artists}`);
      console.log(`Album: ${track.album.name}`);
      
      // Then, get the audio features
      const audioFeatures = await spotifyClient.getAudioFeatures(trackId);
      
      console.log('\nAudio Features:');
      console.log(`Acousticness: ${(audioFeatures.acousticness * 100).toFixed(1)}%`);
      console.log(`Danceability: ${(audioFeatures.danceability * 100).toFixed(1)}%`);
      console.log(`Energy: ${(audioFeatures.energy * 100).toFixed(1)}%`);
      console.log(`Instrumentalness: ${(audioFeatures.instrumentalness * 100).toFixed(1)}%`);
      console.log(`Liveness: ${(audioFeatures.liveness * 100).toFixed(1)}%`);
      console.log(`Loudness: ${audioFeatures.loudness.toFixed(1)} dB`);
      console.log(`Speechiness: ${(audioFeatures.speechiness * 100).toFixed(1)}%`);
      console.log(`Tempo: ${audioFeatures.tempo.toFixed(1)} BPM`);
      console.log(`Valence (positivity): ${(audioFeatures.valence * 100).toFixed(1)}%`);
      console.log(`Key: ${getKeyName(audioFeatures.key)} ${audioFeatures.mode === 1 ? 'Major' : 'Minor'}`);
      console.log(`Time Signature: ${audioFeatures.time_signature}/4`);
    } catch (error) {
      console.error('Error getting track audio features:', error.message);
    }
    
    returnToMainMenu();
  });
}

/**
 * Get key name from key number
 * @param {number} key - Key number (0-11)
 * @returns {string} - Key name
 */
function getKeyName(key) {
  const keyNames = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"];
  return key >= 0 && key < keyNames.length ? keyNames[key] : "Unknown";
}

/**
 * Return to main menu
 */
function returnToMainMenu() {
  rl.question('\nPress Enter to return to the main menu...', () => {
    showMainMenu();
  });
}

// Start the CLI
console.log('Welcome to the Music Discovery CLI!');
console.log('This tool demonstrates the integration of Spotify and Last.fm APIs.');
showMainMenu();

// Handle exit
rl.on('close', () => {
  console.log('\nThank you for using the Music Discovery CLI!');
  process.exit(0);
}); 