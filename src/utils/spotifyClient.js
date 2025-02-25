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
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';

// Cache for the access token
let accessToken = null;
let refreshToken = null;
let tokenExpiration = null;
let userTokens = {}; // Store tokens by user ID

/**
 * Generate a random string for state parameter
 * @param {number} length - Length of the string
 * @returns {string} - Random string
 */
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  
  return text;
}

/**
 * Get the authorization URL for Spotify login
 * @param {string} state - State parameter for security
 * @returns {string} - Authorization URL
 */
function getAuthorizationUrl(state) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  
  if (!clientId || !redirectUri) {
    throw new Error('Spotify client ID or redirect URI not set in environment variables');
  }
  
  // Define the scopes needed for the application
  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'app-remote-control',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-private',
    'playlist-modify-public',
    'user-read-recently-played',
    'user-top-read'
  ];
  
  // Construct the authorization URL
  const params = {
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state: state
  };
  
  return `${AUTHORIZE_URL}?${querystring.stringify(params)}`;
}

/**
 * Exchange authorization code for access and refresh tokens
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} - Tokens and expiration
 */
async function exchangeCodeForTokens(code) {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Spotify client ID, client secret, or redirect URI not set in environment variables');
    }
    
    // Encode client ID and secret for Basic Auth
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    // Request tokens
    const response = await axios.post(
      AUTH_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      }).toString(),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Calculate expiration time
    const expiresIn = response.data.expires_in;
    const expirationTime = Date.now() + (expiresIn - 300) * 1000; // 5 minutes buffer
    
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expirationTime: expirationTime
    };
  } catch (error) {
    logger.error('Error exchanging code for tokens:', error.message);
    if (error.response) {
      logger.error('Response status:', error.response.status);
      logger.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Refresh the access token using the refresh token
 * @param {string} refreshTokenStr - Refresh token
 * @returns {Promise<Object>} - New access token and expiration
 */
async function refreshAccessToken(refreshTokenStr) {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Spotify client ID or client secret not set in environment variables');
    }
    
    // Encode client ID and secret for Basic Auth
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    // Request new access token
    const response = await axios.post(
      AUTH_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenStr
      }).toString(),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Calculate expiration time
    const expiresIn = response.data.expires_in;
    const expirationTime = Date.now() + (expiresIn - 300) * 1000; // 5 minutes buffer
    
    return {
      accessToken: response.data.access_token,
      expirationTime: expirationTime
    };
  } catch (error) {
    logger.error('Error refreshing access token:', error.message);
    if (error.response) {
      logger.error('Response status:', error.response.status);
      logger.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Store user tokens
 * @param {string} userId - User ID
 * @param {Object} tokens - User tokens
 */
function storeUserTokens(userId, tokens) {
  userTokens[userId] = tokens;
}

/**
 * Get user tokens
 * @param {string} userId - User ID
 * @returns {Object|null} - User tokens or null if not found
 */
function getUserTokens(userId) {
  return userTokens[userId] || null;
}

/**
 * Get an access token for the Spotify API
 * @param {string} [userId] - User ID for user-specific tokens
 * @returns {Promise<string>} Access token
 */
async function getAccessToken(userId = null) {
  // If userId is provided, try to get user-specific token
  if (userId) {
    const userToken = getUserTokens(userId);
    if (userToken) {
      // Check if token is expired
      if (userToken.expirationTime && Date.now() < userToken.expirationTime) {
        return userToken.accessToken;
      }
      
      // Token is expired, refresh it
      if (userToken.refreshToken) {
        try {
          const newTokens = await refreshAccessToken(userToken.refreshToken);
          
          // Update user tokens
          storeUserTokens(userId, {
            ...userToken,
            accessToken: newTokens.accessToken,
            expirationTime: newTokens.expirationTime
          });
          
          return newTokens.accessToken;
        } catch (error) {
          logger.error(`Error refreshing token for user ${userId}:`, error.message);
          // Fall back to client credentials flow
        }
      }
    }
  }

  // Fall back to client credentials flow if no user token or refresh failed
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
 * @param {string} [userId] - User ID for user-specific tokens
 * @returns {Promise<Object>} Response data
 */
async function makeRequest(method, endpoint, params = {}, data = null, userId = null) {
  try {
    // Get access token
    const token = await getAccessToken(userId);

    // Log the request details for debugging
    logger.debug(`Making ${method} request to ${endpoint}`, { 
      params: JSON.stringify(params),
      hasData: data !== null,
      userId: userId || 'none'
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
        hasData: data !== null,
        userId: userId || 'none'
      });
      
      // If token expired, clear it and retry once
      if (status === 401 && data.error?.message === 'The access token expired') {
        logger.info('Token expired, refreshing and retrying request');
        
        if (userId) {
          // Clear user token
          const userToken = getUserTokens(userId);
          if (userToken && userToken.refreshToken) {
            try {
              const newTokens = await refreshAccessToken(userToken.refreshToken);
              
              // Update user tokens
              storeUserTokens(userId, {
                ...userToken,
                accessToken: newTokens.accessToken,
                expirationTime: newTokens.expirationTime
              });
              
              // Retry the request
              return makeRequest(method, endpoint, params, data, userId);
            } catch (refreshError) {
              logger.error(`Error refreshing token for user ${userId}:`, refreshError.message);
              // Fall through to throw the original error
            }
          }
        } else {
          // Clear global token
          accessToken = null;
          tokenExpiration = null;
          return makeRequest(method, endpoint, params, data, userId);
        }
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
 * @param {string} [userId] - User ID for user-specific tokens
 * @returns {Promise<object>} - Recommendations response
 */
async function getRecommendations(params, userId = null) {
  try {
    return await makeRequest('GET', '/recommendations', params, null, userId);
  } catch (error) {
    throw new Error(`Failed to get recommendations: ${error.message}`);
  }
}

/**
 * Get a client credentials token for validation
 * @returns {Promise<string>} Access token
 */
async function getClientCredentialsToken() {
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

    logger.debug('Obtained Spotify client credentials token for validation');
    return response.data.access_token;
  } catch (error) {
    logger.error('Error getting Spotify client credentials token:', error.message);
    if (error.response) {
      logger.error('Response status:', error.response.status);
      logger.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Export API methods
module.exports = {
  // Auth
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  storeUserTokens,
  getUserTokens,
  generateRandomString,
  getClientCredentialsToken,
  
  // Search
  search: (query, types, limit = 20, offset = 0, market = null, userId = null) => {
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
    return makeRequest('GET', '/search', params, null, userId);
  },
  
  // Tracks
  getTrack: (trackId, market = null, userId = null) => {
    const params = market ? { market } : {};
    return makeRequest('GET', `/tracks/${trackId}`, params, null, userId);
  },
  
  getSeveralTracks: (trackIds, market = null, userId = null) => {
    const params = {
      ids: Array.isArray(trackIds) ? trackIds.join(',') : trackIds
    };
    
    if (market) {
      params.market = market;
    }
    
    return makeRequest('GET', '/tracks', params, null, userId);
  },
  
  getAudioFeatures: (trackId, userId = null) => {
    return makeRequest('GET', `/audio-features/${trackId}`, {}, null, userId);
  },
  
  getSeveralAudioFeatures: (trackIds, userId = null) => {
    const params = {
      ids: Array.isArray(trackIds) ? trackIds.join(',') : trackIds
    };
    
    return makeRequest('GET', '/audio-features', params, null, userId);
  },
  
  // Playlists
  getPlaylist: (playlistId, fields = null, market = null, userId = null) => {
    const params = {};
    
    if (fields) {
      params.fields = fields;
    }
    
    if (market) {
      params.market = market;
    }
    
    return makeRequest('GET', `/playlists/${playlistId}`, params, null, userId);
  },
  
  getPlaylistTracks: (playlistId, limit = 20, offset = 0, market = null, userId = null) => {
    const params = {
      limit,
      offset
    };
    
    if (market) {
      params.market = market;
    }
    
    return makeRequest('GET', `/playlists/${playlistId}/tracks`, params, null, userId);
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
    
    return makeRequest('POST', `/users/${userId}/playlists`, {}, data, userId);
  },
  
  addTracksToPlaylist: (playlistId, trackUris, position = null, userId = null) => {
    const data = {
      uris: Array.isArray(trackUris) ? trackUris : [trackUris]
    };
    
    if (position !== null) {
      data.position = position;
    }
    
    return makeRequest('POST', `/playlists/${playlistId}/tracks`, {}, data, userId);
  },
  
  // Player API methods
  getPlaybackState: (market = null, userId = null) => {
    const params = market ? { market } : {};
    return makeRequest('GET', '/me/player', params, null, userId);
  },
  
  getAvailableDevices: (userId = null) => {
    return makeRequest('GET', '/me/player/devices', {}, null, userId);
  },
  
  getCurrentlyPlayingTrack: (market = null, userId = null) => {
    const params = market ? { market } : {};
    return makeRequest('GET', '/me/player/currently-playing', params, null, userId);
  },
  
  transferPlayback: (deviceIds, play = false, userId = null) => {
    const data = {
      device_ids: Array.isArray(deviceIds) ? deviceIds : [deviceIds],
      play
    };
    return makeRequest('PUT', '/me/player', {}, data, userId);
  },
  
  startResumePlayback: (deviceId = null, contextUri = null, uris = null, offset = null, positionMs = null, userId = null) => {
    const params = deviceId ? { device_id: deviceId } : {};
    const data = {};
    
    if (contextUri) data.context_uri = contextUri;
    if (uris) data.uris = uris;
    if (offset) data.offset = offset;
    if (positionMs !== null) data.position_ms = positionMs;
    
    return makeRequest('PUT', '/me/player/play', params, data, userId);
  },
  
  pausePlayback: (deviceId = null, userId = null) => {
    const params = deviceId ? { device_id: deviceId } : {};
    return makeRequest('PUT', '/me/player/pause', params, null, userId);
  },
  
  skipToNext: (deviceId = null, userId = null) => {
    const params = deviceId ? { device_id: deviceId } : {};
    return makeRequest('POST', '/me/player/next', params, null, userId);
  },
  
  skipToPrevious: (deviceId = null, userId = null) => {
    const params = deviceId ? { device_id: deviceId } : {};
    return makeRequest('POST', '/me/player/previous', params, null, userId);
  },
  
  seekToPosition: (positionMs, deviceId = null, userId = null) => {
    const params = {
      position_ms: positionMs
    };
    
    if (deviceId) params.device_id = deviceId;
    
    return makeRequest('PUT', '/me/player/seek', params, null, userId);
  },
  
  setRepeatMode: (state, deviceId = null, userId = null) => {
    const params = {
      state // 'track', 'context', or 'off'
    };
    
    if (deviceId) params.device_id = deviceId;
    
    return makeRequest('PUT', '/me/player/repeat', params, null, userId);
  },
  
  setPlaybackVolume: (volumePercent, deviceId = null, userId = null) => {
    const params = {
      volume_percent: volumePercent
    };
    
    if (deviceId) params.device_id = deviceId;
    
    return makeRequest('PUT', '/me/player/volume', params, null, userId);
  },
  
  togglePlaybackShuffle: (state, deviceId = null, userId = null) => {
    const params = {
      state: state.toString() // 'true' or 'false'
    };
    
    if (deviceId) params.device_id = deviceId;
    
    return makeRequest('PUT', '/me/player/shuffle', params, null, userId);
  },
  
  getRecentlyPlayedTracks: (limit = 20, before = null, after = null, userId = null) => {
    const params = { limit };
    
    if (before) params.before = before;
    if (after) params.after = after;
    
    return makeRequest('GET', '/me/player/recently-played', params, null, userId);
  },
  
  getQueue: (userId = null) => {
    return makeRequest('GET', '/me/player/queue', {}, null, userId);
  },
  
  addToQueue: (uri, deviceId = null, userId = null) => {
    const params = {
      uri
    };
    
    if (deviceId) params.device_id = deviceId;
    
    return makeRequest('POST', '/me/player/queue', params, null, userId);
  },
  
  // User profile
  getCurrentUserProfile: (userId = null) => {
    return makeRequest('GET', '/me', {}, null, userId);
  },
  
  getRecommendations
}; 