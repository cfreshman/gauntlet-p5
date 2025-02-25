/**
 * Last.fm API Client
 * 
 * This module provides utilities for interacting with the Last.fm API.
 * It handles API requests for music discovery and recommendations.
 */

import fetch from 'node-fetch';
import logger from './logger.js';

// Base URL for Last.fm API
const API_URL = 'http://ws.audioscrobbler.com/2.0/';

// Cache for API responses to reduce redundant calls
const responseCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

class LastfmClient {
  /**
   * Make a request to the Last.fm API
   * @param {Object} params - The parameters for the API request
   * @returns {Promise<Object>} - The API response data
   */
  async makeRequest(params) {
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
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'User-Agent': 'Spotify-AIPI-Tools/1.0.0'
        },
        params: requestParams
      });

      const data = await response.json();

      // Cache the response
      responseCache.set(cacheKey, {
        timestamp: Date.now(),
        data: data
      });

      return data;
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
  async getSimilarTracks(track, artist, limit = 20) {
    return this.makeRequest({
      method: 'track.getSimilar',
      track,
      artist,
      limit,
      autocorrect: 1
    });
  }

  async getSimilarArtists(artist, limit = 20) {
    return this.makeRequest({
      method: 'artist.getSimilar',
      artist,
      limit,
      autocorrect: 1
    });
  }

  async getArtistTopTracks(artist, limit = 20) {
    return this.makeRequest({
      method: 'artist.getTopTracks',
      artist,
      limit,
      autocorrect: 1
    });
  }

  async getTrackInfo(track, artist) {
    return this.makeRequest({
      method: 'track.getInfo',
      track,
      artist,
      autocorrect: 1
    });
  }

  async getArtistInfo(artist) {
    return this.makeRequest({
      method: 'artist.getInfo',
      artist,
      autocorrect: 1
    });
  }

  async getTopTracksByTag(tag, limit = 20) {
    return this.makeRequest({
      method: 'tag.getTopTracks',
      tag,
      limit
    });
  }
}

// Create singleton instance
const lastfmClient = new LastfmClient();

export default lastfmClient; 