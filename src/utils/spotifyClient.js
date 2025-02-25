/**
 * Spotify API Client
 * 
 * This module provides utilities for interacting with the Spotify Web API.
 * It handles authentication, token refresh, and API requests.
 */

const axios = require('axios');
const querystring = require('querystring');
const logger = require('./logger');

// Base URLs
const AUTH_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';

// Cache for the access token
let accessToken = null;
let tokenExpiration = null;

/**
 * Get an access token for the Spotify API using client credentials flow
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  // Check if we have a valid token
  if (accessToken && tokenExpiration && Date.now() < tokenExpiration) {
    return accessToken;
  }

  try {
    // Get client credentials from environment variables
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Spotify client ID or client secret not set in environment variables');
    }

    // Encode client ID and secret for Basic Auth
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Request access token
    const response = await axios.post(
      AUTH_URL,
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // Cache the token and set expiration
    accessToken = response.data.access_token;
    // Set expiration to 5 minutes before actual expiry to be safe
    tokenExpiration = Date.now() + (response.data.expires_in - 300) * 1000;

    logger.debug('Obtained new Spotify access token');
    return accessToken;
  } catch (error) {
    logger.error('Error getting Spotify access token:', error.message);
    if (error.response) {
      logger.error('Response status:', error.response.status);
      logger.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Make a request to the Spotify API
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} [params] - Query parameters
 * @param {Object} [data] - Request body for POST/PUT requests
 * @returns {Promise<Object>} Response data
 */
async function makeRequest(method, endpoint, params = {}, data = null) {
  try {
    // Get access token
    const token = await getAccessToken();

    // Log the request details for debugging
    logger.debug(`Making ${method} request to ${endpoint}`, { 
      params: JSON.stringify(params),
      hasData: data !== null
    });

    // Make the request
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params
    };
    
    // Only add data for non-GET requests
    if (method !== 'GET' && data !== null) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    // Handle API errors
    if (error.response) {
      const { status, data } = error.response;
      logger.error(`Spotify API error (${status}):`, data.error?.message || JSON.stringify(data));
      logger.error('Request details:', { 
        method, 
        endpoint, 
        params: JSON.stringify(params),
        hasData: data !== null
      });
      
      // If token expired, clear it and retry once
      if (status === 401 && data.error?.message === 'The access token expired') {
        logger.info('Token expired, refreshing and retrying request');
        accessToken = null;
        tokenExpiration = null;
        return makeRequest(method, endpoint, params, data);
      }
      
      throw new Error(`Spotify API error (${status}): ${data.error?.message || JSON.stringify(data)}`);
    }
    
    logger.error('Error making Spotify API request:', error.message);
    throw error;
  }
}

/**
 * Get track recommendations based on seed artists, tracks, genres, and other parameters
 * @param {object} params - Parameters for recommendations
 * @returns {Promise<object>} - Recommendations response
 */
async function getRecommendations(params) {
  try {
    return await makeRequest('GET', '/recommendations', params, null);
  } catch (error) {
    throw new Error(`Failed to get recommendations: ${error.message}`);
  }
}

// Export API methods
module.exports = {
  // Search
  search: (query, types, limit = 20, offset = 0, market = null) => {
    const params = {
      q: query,
      type: Array.isArray(types) ? types.join(',') : types,
      limit,
      offset
    };
    
    if (market) {
      params.market = market;
    }
    
    // For GET requests, don't pass a data parameter (4th parameter should be null)
    return makeRequest('GET', '/search', params, null);
  },
  
  // Tracks
  getTrack: (trackId, market = null) => {
    const params = market ? { market } : {};
    return makeRequest('GET', `/tracks/${trackId}`, params, null);
  },
  
  getSeveralTracks: (trackIds, market = null) => {
    const params = {
      ids: Array.isArray(trackIds) ? trackIds.join(',') : trackIds
    };
    
    if (market) {
      params.market = market;
    }
    
    return makeRequest('GET', '/tracks', params, null);
  },
  
  getAudioFeatures: (trackId) => {
    return makeRequest('GET', `/audio-features/${trackId}`, {}, null);
  },
  
  getSeveralAudioFeatures: (trackIds) => {
    const params = {
      ids: Array.isArray(trackIds) ? trackIds.join(',') : trackIds
    };
    
    return makeRequest('GET', '/audio-features', params, null);
  },
  
  // Playlists
  getPlaylist: (playlistId, fields = null, market = null) => {
    const params = {};
    
    if (fields) {
      params.fields = fields;
    }
    
    if (market) {
      params.market = market;
    }
    
    return makeRequest('GET', `/playlists/${playlistId}`, params, null);
  },
  
  getPlaylistTracks: (playlistId, limit = 20, offset = 0, market = null) => {
    const params = {
      limit,
      offset
    };
    
    if (market) {
      params.market = market;
    }
    
    return makeRequest('GET', `/playlists/${playlistId}/tracks`, params, null);
  },
  
  createPlaylist: (userId, name, description = null, isPublic = false, collaborative = false) => {
    const data = {
      name,
      public: isPublic,
      collaborative
    };
    
    if (description) {
      data.description = description;
    }
    
    return makeRequest('POST', `/users/${userId}/playlists`, {}, data);
  },
  
  addTracksToPlaylist: (playlistId, trackUris, position = null) => {
    const data = {
      uris: Array.isArray(trackUris) ? trackUris : [trackUris]
    };
    
    if (position !== null) {
      data.position = position;
    }
    
    return makeRequest('POST', `/playlists/${playlistId}/tracks`, {}, data);
  },
  
  getRecommendations
}; 