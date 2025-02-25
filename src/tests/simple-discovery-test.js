/**
 * Simple Music Discovery Test
 * 
 * A simplified test for music discovery that uses search instead of recommendations
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const spotifyClient = require('../utils/spotifyClient');

/**
 * Discover similar music using search
 * @param {string} artistName - Name of the artist to find similar music for
 */
async function discoverSimilarMusicUsingSearch(artistName) {
  try {
    console.log(`Discovering music similar to artist: ${artistName}`);
    
    // First, search for the artist
    const artistResults = await spotifyClient.search(artistName, ['artist'], 1);
    
    if (!artistResults.artists || artistResults.artists.items.length === 0) {
      throw new Error(`Artist "${artistName}" not found`);
    }
    
    const artist = artistResults.artists.items[0];
    console.log(`\nFound artist: ${artist.name} (${artist.id})`);
    console.log(`Genres: ${artist.genres.join(', ') || 'None'}`);
    
    // Use the artist's genres to find similar music
    const genres = artist.genres.length > 0 ? artist.genres : ['pop', 'rock'];
    const primaryGenre = genres[0];
    
    console.log(`\nSearching for tracks in genre: ${primaryGenre}`);
    
    // Search for tracks in the same genre
    const trackResults = await spotifyClient.search(`genre:${primaryGenre}`, ['track'], 10);
    
    if (!trackResults.tracks || trackResults.tracks.items.length === 0) {
      throw new Error(`No tracks found for genre "${primaryGenre}"`);
    }
    
    console.log(`\nFound ${trackResults.tracks.items.length} similar tracks:`);
    
    // Display the tracks
    trackResults.tracks.items.forEach((track, index) => {
      const trackArtists = track.artists.map(a => a.name).join(', ');
      console.log(`${index + 1}. ${track.name} by ${trackArtists}`);
      console.log(`   Album: ${track.album.name}`);
      console.log(`   Popularity: ${track.popularity}`);
      console.log('');
    });
    
    // Generate some insights
    const insights = generateInsights(trackResults.tracks.items);
    
    console.log('\nInsights:');
    console.log(`Found ${trackResults.tracks.items.length} tracks related to ${artist.name} through the ${primaryGenre} genre.`);
    
    if (insights.topArtists.length > 0) {
      console.log('\nTop Artists:');
      insights.topArtists.forEach((artist, index) => {
        console.log(`${index + 1}. ${artist.name} (${artist.count} tracks)`);
      });
    }
    
    console.log('\nPopularity Range:');
    console.log(`Min: ${insights.popularityRange.min}`);
    console.log(`Max: ${insights.popularityRange.max}`);
    console.log(`Average: ${insights.popularityRange.average}`);
    
    return {
      artist,
      tracks: trackResults.tracks.items,
      insights
    };
  } catch (error) {
    console.error('Error discovering similar music:', error.message);
    throw error;
  }
}

/**
 * Generate insights from tracks
 * @param {Array} tracks - Array of track objects
 * @returns {Object} - Insights object
 */
function generateInsights(tracks) {
  const insights = {
    topArtists: [],
    popularityRange: {
      min: 100,
      max: 0,
      average: 0
    }
  };
  
  // Calculate popularity stats
  let totalPopularity = 0;
  tracks.forEach(track => {
    totalPopularity += track.popularity;
    insights.popularityRange.min = Math.min(insights.popularityRange.min, track.popularity);
    insights.popularityRange.max = Math.max(insights.popularityRange.max, track.popularity);
  });
  
  insights.popularityRange.average = Math.round(totalPopularity / tracks.length);
  
  // Find top artists
  const artistCounts = {};
  tracks.forEach(track => {
    track.artists.forEach(artist => {
      if (!artistCounts[artist.id]) {
        artistCounts[artist.id] = {
          id: artist.id,
          name: artist.name,
          count: 0
        };
      }
      artistCounts[artist.id].count++;
    });
  });
  
  insights.topArtists = Object.values(artistCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return insights;
}

// Run the test
discoverSimilarMusicUsingSearch('Coldplay')
  .then(() => {
    console.log('\nTest completed successfully!');
  })
  .catch(error => {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  }); 