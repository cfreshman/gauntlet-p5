/**
 * Last.fm API Client
 * 
 * This module provides utilities for interacting with the Last.fm API.
 * It handles API requests for music discovery and recommendations.
 */

const axios = require('axios');
const logger = require('./logger');

// Base URL for Last.fm API
const API_URL = 'http://ws.audioscrobbler.com/2.0/';

// Cache for API responses to reduce redundant calls
const responseCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Make a request to the Last.fm API
 * @param {Object} params - The parameters for the API request
 * @returns {Promise<Object>} - The API response data
 */
async function makeRequest(params) {
  try {
    // Get API key from environment variables
    const apiKey = process.env.LASTFM_API_KEY;

    if (!apiKey) {
      throw new Error('Last.fm API key not set in environment variables');
    }

    // Create a cache key based on the request parameters
    const cacheKey = JSON.stringify(params);
    
    // Check if we have a cached response
    const cachedResponse = responseCache.get(cacheKey);
    if (cachedResponse && cachedResponse.timestamp > Date.now() - CACHE_TTL) {
      logger.debug('Using cached Last.fm API response');
      return cachedResponse.data;
    }

    // Add API key and format to parameters
    const requestParams = {
      ...params,
      api_key: apiKey,
      format: 'json'
    };

    // Log the request details for debugging
    logger.debug('Making Last.fm API request', { 
      method: requestParams.method,
      params: JSON.stringify(requestParams)
    });

    // Make the request
    const response = await axios.get(API_URL, {
      params: requestParams,
      headers: {
        'User-Agent': 'Spotify-AIPI-Tools/1.0.0'
      }
    });

    // Cache the response
    responseCache.set(cacheKey, {
      timestamp: Date.now(),
      data: response.data
    });

    return response.data;
  } catch (error) {
    // Handle API errors
    if (error.response) {
      const { status, data } = error.response;
      logger.error(`Last.fm API error (${status}):`, data);
      
      throw new Error(`Last.fm API error (${status}): ${JSON.stringify(data)}`);
    }
    
    logger.error('Error making Last.fm API request:', error.message);
    throw error;
  }
}

// Export API methods
module.exports = {
  /**
   * Get similar tracks based on a track and artist
   * @param {string} track - The track name
   * @param {string} artist - The artist name
   * @param {number} limit - Maximum number of similar tracks to return
   * @returns {Promise<Object>} - Similar tracks response
   */
  getSimilarTracks: async (track, artist, limit = 20) => {
    return makeRequest({
      method: 'track.getSimilar',
      track,
      artist,
      limit,
      autocorrect: 1
    });
  },

  /**
   * Get similar artists based on an artist name
   * @param {string} artist - The artist name
   * @param {number} limit - Maximum number of similar artists to return
   * @returns {Promise<Object>} - Similar artists response
   */
  getSimilarArtists: async (artist, limit = 20) => {
    return makeRequest({
      method: 'artist.getSimilar',
      artist,
      limit,
      autocorrect: 1
    });
  },

  /**
   * Get top tracks for an artist
   * @param {string} artist - The artist name
   * @param {number} limit - Maximum number of tracks to return
   * @returns {Promise<Object>} - Top tracks response
   */
  getArtistTopTracks: async (artist, limit = 20) => {
    return makeRequest({
      method: 'artist.getTopTracks',
      artist,
      limit,
      autocorrect: 1
    });
  },

  /**
   * Get track info including tags and stats
   * @param {string} track - The track name
   * @param {string} artist - The artist name
   * @returns {Promise<Object>} - Track info response
   */
  getTrackInfo: async (track, artist) => {
    return makeRequest({
      method: 'track.getInfo',
      track,
      artist,
      autocorrect: 1
    });
  },

  /**
   * Get artist info including biography, tags, and stats
   * @param {string} artist - The artist name
   * @returns {Promise<Object>} - Artist info response
   */
  getArtistInfo: async (artist) => {
    return makeRequest({
      method: 'artist.getInfo',
      artist,
      autocorrect: 1
    });
  },

  /**
   * Get top tracks by tag
   * @param {string} tag - The tag name (genre)
   * @param {number} limit - Maximum number of tracks to return
   * @returns {Promise<Object>} - Top tracks by tag response
   */
  getTopTracksByTag: async (tag, limit = 20) => {
    return makeRequest({
      method: 'tag.getTopTracks',
      tag,
      limit
    });
  }
}; 