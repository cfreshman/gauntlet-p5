/**
 * Playlist Generation Tools (Layer 2)
 * 
 * This module provides intelligent playlist generation tools that build on the Layer 1 Spotify API tools.
 */

import logger from '../utils/logger.js';
import spotifyClient from '../utils/spotifyClient.js';
import { z } from 'zod';
import lastfmClient from '../utils/lastfmClient.js';

/**
 * Register playlist generation tools with the server
 * @param {object} server - The server instance to register tools with
 */
function registerPlaylistGenerationTools(server) {
  logger.info('Registering Playlist Generation Tools (Layer 2)...');

  // Register generate-playlist tool
  server.tool(
    'generate-playlist',
    'Generates a playlist based on specified criteria',
    {
      name: z.string().describe('Name for the generated playlist'),
      description: z.string().optional().describe('Description for the generated playlist'),
      criteria: z.object({
        seed_artists: z.array(z.string()).optional(),
        seed_tracks: z.array(z.string()).optional(),
        seed_genres: z.array(z.string()).optional(),
        target_energy: z.number().min(0).max(1).optional(),
        target_danceability: z.number().min(0).max(1).optional(),
        target_valence: z.number().min(0).max(1).optional(),
        target_acousticness: z.number().min(0).max(1).optional(),
        target_instrumentalness: z.number().min(0).max(1).optional(),
        min_popularity: z.number().min(0).max(100).optional()
      }).describe('Criteria for selecting tracks'),
      trackCount: z.number().min(1).max(100).default(20).describe('Number of tracks to include in the playlist'),
      isPublic: z.boolean().default(false).describe('Whether the playlist should be public'),
      userId: z.string().describe('User ID for user-specific tokens'),
      accessToken: z.string().describe('Spotify access token')
    },
    async ({ name, description, criteria, trackCount = 20, isPublic = false, userId, accessToken }) => {
      try {
        logger.info(`Generating playlist "${name}" with ${trackCount} tracks`);
        
        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        // Validate criteria
        validatePlaylistCriteria(criteria);

        // Get seed artists and tracks from Spotify
        let seedArtists = [];
        let seedTracks = [];

        if (criteria.seed_artists && criteria.seed_artists.length > 0) {
          // Get artist names from Spotify IDs
          const artistPromises = criteria.seed_artists.map(async (artistId) => {
            const results = await spotifyClient.search(artistId, ['artist'], 1);
            if (results.artists && results.artists.items.length > 0) {
              return results.artists.items[0];
            }
            return null;
          });
          seedArtists = (await Promise.all(artistPromises)).filter(a => a);
        }

        if (criteria.seed_tracks && criteria.seed_tracks.length > 0) {
          // Get track info from Spotify IDs
          const trackPromises = criteria.seed_tracks.map(async (trackId) => {
            const results = await spotifyClient.search(trackId, ['track'], 1);
            if (results.tracks && results.tracks.items.length > 0) {
              return results.tracks.items[0];
            }
            return null;
          });
          seedTracks = (await Promise.all(trackPromises)).filter(t => t);
        }

        // Get similar tracks from Last.fm based on seed artists and tracks
        const recommendedTracks = new Set();

        // Get similar tracks for each seed track
        if (seedTracks.length > 0) {
          const similarTrackPromises = seedTracks.map(track => 
            lastfmClient.getSimilarTracks(track.name, track.artists[0].name, Math.ceil(trackCount / 2))
          );
          const similarTrackResults = await Promise.all(similarTrackPromises);

          similarTrackResults.forEach(result => {
            const tracks = result.similartracks?.track || [];
            tracks.forEach(track => {
              recommendedTracks.add(JSON.stringify({
                name: track.name,
                artist: track.artist.name
              }));
            });
          });
        }

        // Get top tracks from similar artists
        if (seedArtists.length > 0) {
          const similarArtistPromises = seedArtists.map(artist =>
            lastfmClient.getSimilarArtists(artist.name, 3)
              .then(async (result) => {
                const artists = result.similarartists?.artist || [];
                const topTracksPromises = artists.map(similarArtist =>
                  lastfmClient.getArtistTopTracks(similarArtist.name, Math.ceil(trackCount / 2))
                );
                return Promise.all(topTracksPromises);
              })
          );
          const similarArtistTopTracks = await Promise.all(similarArtistPromises);

          similarArtistTopTracks.flat().forEach(artistTracks => {
            const tracks = artistTracks.toptracks?.track || [];
            tracks.forEach(track => {
              recommendedTracks.add(JSON.stringify({
                name: track.name,
                artist: track.artist.name
              }));
            });
          });
        }

        // If we have genre seeds, get top tracks for those genres
        if (criteria.seed_genres && criteria.seed_genres.length > 0) {
          const genreTrackPromises = criteria.seed_genres.map(genre =>
            lastfmClient.getTopTracksByTag(genre, Math.ceil(trackCount / 2))
          );
          const genreTrackResults = await Promise.all(genreTrackPromises);

          genreTrackResults.forEach(result => {
            const tracks = result.tracks?.track || [];
            tracks.forEach(track => {
              recommendedTracks.add(JSON.stringify({
                name: track.name,
                artist: track.artist.name
              }));
            });
          });
        }

        // Convert Set back to array and parse JSON
        const uniqueRecommendedTracks = Array.from(recommendedTracks).map(JSON.parse);

        // Search for each recommended track on Spotify in parallel
        const spotifySearchPromises = uniqueRecommendedTracks.map(async ({ name, artist }) => {
          try {
            const query = `track:${name} artist:${artist}`;
            const results = await spotifyClient.search(query, ['track'], 1);
            return results.tracks?.items[0] || null;
          } catch (error) {
            logger.warn(`Failed to search for track "${name}" by "${artist}": ${error.message}`);
            return null;
          }
        });

        // Wait for all Spotify searches to complete
        let potentialTracks = (await Promise.all(spotifySearchPromises))
          .filter(track => track);

        // Filter tracks based on criteria if specified
        if (criteria.min_popularity !== undefined) {
          potentialTracks = potentialTracks.filter(track => track.popularity >= criteria.min_popularity);
        }

        // Get audio features to filter by musical criteria
        if (potentialTracks.length > 0 && (
          criteria.target_energy !== undefined ||
          criteria.target_danceability !== undefined ||
          criteria.target_valence !== undefined ||
          criteria.target_acousticness !== undefined ||
          criteria.target_instrumentalness !== undefined
        )) {
          const audioFeatures = await Promise.all(
            potentialTracks.map(track => spotifyClient.getAudioFeatures(track.id))
          );

          // Score tracks based on how well they match the criteria
          const scoredTracks = potentialTracks.map((track, index) => {
            const features = audioFeatures[index];
            if (!features) return { track, score: 0 };

            let score = 0;
            let criteriaCount = 0;

            if (criteria.target_energy !== undefined) {
              score += 1 - Math.abs(features.energy - criteria.target_energy);
              criteriaCount++;
            }
            if (criteria.target_danceability !== undefined) {
              score += 1 - Math.abs(features.danceability - criteria.target_danceability);
              criteriaCount++;
            }
            if (criteria.target_valence !== undefined) {
              score += 1 - Math.abs(features.valence - criteria.target_valence);
              criteriaCount++;
            }
            if (criteria.target_acousticness !== undefined) {
              score += 1 - Math.abs(features.acousticness - criteria.target_acousticness);
              criteriaCount++;
            }
            if (criteria.target_instrumentalness !== undefined) {
              score += 1 - Math.abs(features.instrumentalness - criteria.target_instrumentalness);
              criteriaCount++;
            }

            return {
              track,
              score: criteriaCount > 0 ? score / criteriaCount : 1
            };
          });

          // Sort by score and take the best matches
          scoredTracks.sort((a, b) => b.score - a.score);
          potentialTracks = scoredTracks.map(item => item.track);
        }

        // Take the requested number of tracks
        const selectedTracks = potentialTracks.slice(0, trackCount);

        if (selectedTracks.length === 0) {
          throw new Error('No tracks found matching the criteria');
        }

        logger.info(`Found ${selectedTracks.length} tracks for playlist`);
        
        // Create a new playlist
        const playlist = await spotifyClient.createPlaylist(userId, name, description, isPublic);
        
        // Add tracks to the playlist
        const trackUris = selectedTracks.map(track => track.uri);
        await spotifyClient.addTracksToPlaylist(playlist.id, trackUris, null, userId);
        
        // Construct the response
        const response = {
          playlist: {
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            url: playlist.external_urls.spotify,
            trackCount: trackUris.length
          },
          tracks: selectedTracks.map(track => ({
            id: track.id,
            name: track.name,
            artists: track.artists.map(artist => artist.name),
            album: track.album.name,
            uri: track.uri
          })),
          criteria: criteria
        };
        
        logger.info(`Playlist "${name}" (${playlist.id}) created successfully with ${trackUris.length} tracks`);
        return response;
        
      } catch (error) {
        logger.error(`Error generating playlist: ${error.message}`);
        throw new Error(`Failed to generate playlist: ${error.message}`);
      }
    }
  );

  // Register enhance-playlist tool
  server.tool(
    'enhance-playlist',
    'Enhances an existing playlist with additional tracks that fit the theme',
    {
      playlistId: z.string().describe('Spotify ID of the playlist to enhance'),
      trackCount: z.number().min(1).max(100).default(5).describe('Number of tracks to add'),
      preserveOrder: z.boolean().default(true).describe('Whether to preserve the original order'),
      diversify: z.boolean().default(false).describe('Whether to diversify the recommendations'),
      userId: z.string().describe('User ID for user-specific tokens'),
      accessToken: z.string().describe('Spotify access token')
    },
    async ({ playlistId, trackCount = 5, preserveOrder = true, diversify = false, userId, accessToken }) => {
      try {
        logger.info(`Enhancing playlist ${playlistId} with ${trackCount} tracks`);

        // Store token for this request
        spotifyClient.storeUserTokens(userId, {
          accessToken,
          expirationTime: Date.now() + 3600 * 1000 // Set expiration 1 hour from now
        });
        
        // Get the existing playlist
        const playlist = await spotifyClient.getPlaylist(playlistId, null, null, userId);
        
        // Get the existing tracks
        const existingTracks = await spotifyClient.getPlaylistTracks(playlistId, null, null, null, userId);
        
        if (!existingTracks.items || existingTracks.items.length === 0) {
          throw new Error('Playlist has no tracks to analyze for enhancement');
        }
        
        logger.info(`Analyzing ${existingTracks.items.length} existing tracks in playlist`);
        
        // Extract track and artist info
        const existingTrackUris = new Set(existingTracks.items.map(item => item.track.uri));
        const trackArtistPairs = existingTracks.items.map(item => ({
          track: item.track.name,
          artist: item.track.artists[0].name
        }));

        // Get similar tracks from Last.fm in parallel
        // We'll get similar tracks for each track in the playlist
        const similarTrackPromises = trackArtistPairs.slice(0, 5).map(({ track, artist }) => 
          lastfmClient.getSimilarTracks(track, artist, Math.ceil(trackCount / 2))
        );

        // Also get similar artists and their top tracks in parallel
        const similarArtistPromises = trackArtistPairs.slice(0, 3).map(({ artist }) =>
          lastfmClient.getSimilarArtists(artist, 3)
            .then(async (result) => {
              const artists = result.similarartists?.artist || [];
              const topTracksPromises = artists.map(similarArtist =>
                lastfmClient.getArtistTopTracks(similarArtist.name, Math.ceil(trackCount / 2))
              );
              return Promise.all(topTracksPromises);
            })
        );

        // Wait for all Last.fm requests to complete
        const [similarTrackResults, similarArtistTopTracks] = await Promise.all([
          Promise.all(similarTrackPromises),
          Promise.all(similarArtistPromises)
        ]);

        // Extract and flatten all recommended tracks from Last.fm
        const recommendedTracks = new Set();
        
        // Add similar tracks
        similarTrackResults.forEach(result => {
          const tracks = result.similartracks?.track || [];
          tracks.forEach(track => {
            recommendedTracks.add(JSON.stringify({
              name: track.name,
              artist: track.artist.name
            }));
          });
        });

        // Add top tracks from similar artists
        similarArtistTopTracks.flat().forEach(artistTracks => {
          const tracks = artistTracks.toptracks?.track || [];
          tracks.forEach(track => {
            recommendedTracks.add(JSON.stringify({
              name: track.name,
              artist: track.artist.name
            }));
          });
        });

        // Convert Set back to array and parse JSON
        const uniqueRecommendedTracks = Array.from(recommendedTracks).map(JSON.parse);

        // Shuffle if diversifying
        if (diversify) {
          uniqueRecommendedTracks.sort(() => Math.random() - 0.5);
        }

        // Search for each recommended track on Spotify in parallel
        const spotifySearchPromises = uniqueRecommendedTracks.map(async ({ name, artist }) => {
          try {
            const query = `track:${name} artist:${artist}`;
            const results = await spotifyClient.search(query, ['track'], 1);
            return results.tracks?.items[0] || null;
          } catch (error) {
            logger.warn(`Failed to search for track "${name}" by "${artist}": ${error.message}`);
            return null;
          }
        });

        // Wait for all Spotify searches to complete
        let potentialTracks = (await Promise.all(spotifySearchPromises))
          .filter(track => track && !existingTrackUris.has(track.uri));

        // Select tracks to add
        const newTracks = potentialTracks.slice(0, trackCount);

        if (newTracks.length === 0) {
          throw new Error('No suitable tracks found to add to the playlist');
        }

        logger.info(`Adding ${newTracks.length} new tracks to playlist`);
        
        // Add the new tracks to the playlist
        const newTrackUris = newTracks.map(track => track.uri);
        await spotifyClient.addTracksToPlaylist(playlistId, newTrackUris, null, userId);
        
        // Construct the response
        const response = {
          playlist: {
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            url: playlist.external_urls.spotify,
            originalTrackCount: existingTracks.items.length,
            addedTrackCount: newTracks.length,
            newTrackCount: existingTracks.items.length + newTracks.length
          },
          addedTracks: newTracks.map(track => ({
            id: track.id,
            name: track.name,
            artists: track.artists.map(artist => artist.name),
            album: track.album.name,
            uri: track.uri
          }))
        };
        
        logger.info(`Playlist ${playlistId} enhanced successfully with ${newTracks.length} tracks`);
        return response;
        
      } catch (error) {
        logger.error(`Error enhancing playlist: ${error.message}`);
        throw new Error(`Failed to enhance playlist: ${error.message}`);
      }
    }
  );

  logger.info('Playlist Generation Tools registered successfully');
}

/**
 * Validates the playlist generation criteria
 * @param {object} criteria - The criteria to validate
 * @throws {Error} If the criteria are invalid
 */
function validatePlaylistCriteria(criteria) {
  // Check if at least one seed type is provided
  const hasSeeds = (
    (criteria.seed_artists && criteria.seed_artists.length > 0) ||
    (criteria.seed_tracks && criteria.seed_tracks.length > 0) ||
    (criteria.seed_genres && criteria.seed_genres.length > 0)
  );
  
  if (!hasSeeds) {
    throw new Error('At least one seed artist, track, or genre must be provided');
  }
  
  // Check seed limits (Spotify API allows up to 5 seed values in total)
  const seedCount = (
    (criteria.seed_artists ? criteria.seed_artists.length : 0) +
    (criteria.seed_tracks ? criteria.seed_tracks.length : 0) +
    (criteria.seed_genres ? criteria.seed_genres.length : 0)
  );
  
  if (seedCount > 5) {
    throw new Error('Maximum of 5 seeds (artists + tracks + genres) allowed');
  }
  
  // Validate numeric ranges
  const numericParams = [
    'target_energy', 'target_danceability', 'target_valence',
    'target_acousticness', 'target_instrumentalness'
  ];
  
  numericParams.forEach(param => {
    if (criteria[param] !== undefined) {
      if (criteria[param] < 0 || criteria[param] > 1) {
        throw new Error(`${param} must be between 0.0 and 1.0`);
      }
    }
  });
  
  if (criteria.min_popularity !== undefined) {
    if (criteria.min_popularity < 0 || criteria.min_popularity > 100) {
      throw new Error('min_popularity must be between 0 and 100');
    }
  }
}

/**
 * Analyzes the style of a playlist based on its tracks
 * @param {string[]} trackIds - Array of track IDs in the playlist
 * @param {boolean} diversify - Whether to diversify recommendations
 * @returns {Promise<object>} - Style criteria for the playlist
 */
async function analyzePlaylistStyle(trackIds, diversify = false) {
  // Get audio features for all tracks
  const audioFeatures = await Promise.all(
    trackIds.slice(0, 100).map(trackId => spotifyClient.getAudioFeatures(trackId))
  );
  
  // Calculate average values for key features
  const averages = audioFeatures.reduce((acc, features) => {
    acc.energy.push(features.energy);
    acc.danceability.push(features.danceability);
    acc.valence.push(features.valence);
    acc.acousticness.push(features.acousticness);
    acc.instrumentalness.push(features.instrumentalness);
    acc.tempo.push(features.tempo);
    return acc;
  }, {
    energy: [],
    danceability: [],
    valence: [],
    acousticness: [],
    instrumentalness: [],
    tempo: []
  });
  
  // Calculate the average for each feature
  const calculateAverage = values => values.reduce((sum, val) => sum + val, 0) / values.length;
  
  const style = {
    target_energy: calculateAverage(averages.energy),
    target_danceability: calculateAverage(averages.danceability),
    target_valence: calculateAverage(averages.valence),
    target_acousticness: calculateAverage(averages.acousticness),
    target_instrumentalness: calculateAverage(averages.instrumentalness),
    target_tempo: calculateAverage(averages.tempo)
  };
  
  // If diversify is true, adjust the targets to introduce variety
  if (diversify) {
    // Adjust energy and valence in the opposite direction of the average
    // This creates variety while still respecting the overall style
    if (style.target_energy > 0.5) {
      style.target_energy = Math.max(0.3, style.target_energy - 0.2);
    } else {
      style.target_energy = Math.min(0.8, style.target_energy + 0.2);
    }
    
    if (style.target_valence > 0.5) {
      style.target_valence = Math.max(0.3, style.target_valence - 0.2);
    } else {
      style.target_valence = Math.min(0.8, style.target_valence + 0.2);
    }
  }
  
  return style;
}

/**
 * Selects seed tracks from a list of track IDs
 * @param {string[]} trackIds - Array of track IDs
 * @returns {string[]} - Selected seed track IDs
 */
function selectSeedTracks(trackIds) {
  // Select up to 2 random tracks as seeds
  const seedCount = Math.min(2, trackIds.length);
  const seeds = [];
  
  // Create a copy of the array to avoid modifying the original
  const availableTracks = [...trackIds];
  
  for (let i = 0; i < seedCount; i++) {
    const randomIndex = Math.floor(Math.random() * availableTracks.length);
    seeds.push(availableTracks[randomIndex]);
    availableTracks.splice(randomIndex, 1);
  }
  
  return seeds;
}

export { registerPlaylistGenerationTools }; 