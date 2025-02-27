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
      const queryString = new URLSearchParams(requestParams).toString();
      const url = `${API_URL}?${queryString}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Spotify-AIPI-Tools/1.0.0'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Last.fm API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // Check for Last.fm API error response
      if (data.error) {
        throw new Error(`Last.fm API error (${data.error}): ${data.message}`);
      }

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

  /**
   * Search for tracks on Last.fm
   * @param {string} query - Track name to search for
   * @param {string} [artist] - Optional artist name to narrow search
   * @param {number} [limit=30] - Maximum number of results
   * @param {number} [page=1] - Page number
   * @returns {Promise<Object>} Search results
   */
  async searchTracks(query, artist, limit = 30, page = 1) {
    try {
      const params = {
        method: 'track.search',
        track: query,
        limit,
        page
      };

      // Add artist parameter if provided
      if (artist) {
        params.artist = artist;
      }
      
      return await this.makeRequest(params);
    } catch (error) {
      throw new Error(`Failed to search tracks: ${error.message}`);
    }
  }

  /**
   * Get top tags for a track
   * @param {string} track - Track name
   * @param {string} artist - Artist name
   * @param {number} [autocorrect=1] - Whether to autocorrect names
   * @returns {Promise<Object>} Track tags
   */
  async getTrackTopTags(track, artist, autocorrect = 1) {
    try {
      const params = {
        method: 'track.getTopTags',
        track,
        artist,
        autocorrect
      };
      
      return await this.makeRequest(params);
    } catch (error) {
      throw new Error(`Failed to get track tags: ${error.message}`);
    }
  }

  async getChartTopTracks(limit = 50) {
    return this.makeRequest({
      method: 'chart.getTopTracks',
      limit
    });
  }

  async getTagTopArtists(tag, limit = 50) {
    return this.makeRequest({
      method: 'tag.getTopArtists',
      tag,
      limit
    });
  }

  async getTagTopAlbums(tag, limit = 50) {
    return this.makeRequest({
      method: 'tag.getTopAlbums',
      tag,
      limit
    });
  }

  /**
   * Get the most popular tags on Last.fm
   * @param {number} [limit=50] - Maximum number of tags to return
   * @returns {Promise<Object>} Top tags
   */
  async getTopTags(limit = 50) {
    try {
      const params = {
        method: 'tag.getTopTags',
        limit
      };
      
      return await this.makeRequest(params);
    } catch (error) {
      throw new Error(`Failed to get top tags: ${error.message}`);
    }
  }
}

// Create singleton instance
const lastfmClient = new LastfmClient();

export default lastfmClient; 