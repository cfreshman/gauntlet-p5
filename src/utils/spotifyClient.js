/**
 * Last.fm API Client
 * 
 * This module provides utilities for interacting with the Last.fm API.
 * It handles API requests for music discovery and recommendations.
 */

import fetch from 'node-fetch';
import logger from './logger.js';

// Base URLs
const AUTH_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';

class SpotifyClient {
  constructor() {
    // Cache for the access token
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiration = null;
    this.userTokens = {}; // Store tokens by user ID
  }

  /**
   * Generate a random string for state parameter
   * @param {number} length - Length of the string
   * @returns {string} - Random string
   */
  generateRandomString(length) {
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
  getAuthorizationUrl(state) {
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
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state: state
    });
    
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * @param {string} code - Authorization code
   * @returns {Promise<Object>} - Tokens and expiration
   */
  async exchangeCodeForTokens(code) {
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
      const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        })
      });

      const data = await response.json();
      
      // Calculate expiration time
      const expiresIn = data.expires_in;
      const expirationTime = Date.now() + (expiresIn - 300) * 1000; // 5 minutes buffer
      
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expirationTime: expirationTime
      };
    } catch (error) {
      logger.error('Error exchanging code for tokens:', error.message);
      throw error;
    }
  }

  /**
   * Refresh the access token using the refresh token
   * @param {string} refreshTokenStr - Refresh token
   * @returns {Promise<Object>} - New access token and expiration
   */
  async refreshAccessToken(refreshTokenStr) {
    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('Spotify client ID or client secret not set in environment variables');
      }
      
      // Encode client ID and secret for Basic Auth
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      // Request new access token
      const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshTokenStr
        })
      });

      const data = await response.json();
      
      // Calculate expiration time
      const expiresIn = data.expires_in;
      const expirationTime = Date.now() + (expiresIn - 300) * 1000; // 5 minutes buffer
      
      return {
        accessToken: data.access_token,
        expirationTime: expirationTime
      };
    } catch (error) {
      logger.error('Error refreshing access token:', error.message);
      throw error;
    }
  }

  /**
   * Store tokens for a specific user
   * @param {string} userId - The Spotify user ID
   * @param {Object} tokens - The tokens to store
   */
  storeUserTokens(userId, tokens) {
    this.userTokens[userId] = tokens;
  }

  /**
   * Get tokens for a specific user
   * @param {string} userId - The Spotify user ID
   * @returns {Object|null} The stored tokens or null if not found
   */
  getUserTokens(userId) {
    return this.userTokens[userId] || null;
  }

  /**
   * Get an access token for the Spotify API
   * @param {string} [userId] - User ID for user-specific tokens
   * @returns {Promise<string>} Access token
   */
  async getAccessToken(userId = null) {
    // If userId is provided, try to get user-specific token
    if (userId) {
      const userToken = this.getUserTokens(userId);
      if (userToken) {
        // Check if token is expired
        if (userToken.expirationTime && Date.now() < userToken.expirationTime) {
          return userToken.accessToken;
        }
        
        // Token is expired, refresh it
        if (userToken.refreshToken) {
          try {
            const newTokens = await this.refreshAccessToken(userToken.refreshToken);
            
            // Update user tokens
            this.storeUserTokens(userId, {
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
    if (this.accessToken && this.tokenExpiration && Date.now() < this.tokenExpiration) {
      return this.accessToken;
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
      const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' })
      });

      const data = await response.json();

      // Cache the token and set expiration
      this.accessToken = data.access_token;
      // Set expiration to 5 minutes before actual expiry to be safe
      this.tokenExpiration = Date.now() + (data.expires_in - 300) * 1000;

      logger.debug('Obtained new Spotify access token');
      return this.accessToken;
    } catch (error) {
      logger.error('Error getting Spotify access token:', error.message);
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
  async makeRequest(method, endpoint, params = {}, data = null, userId = null) {
    try {
      // Get access token - ALWAYS try to get user token first if userId is provided
      const token = await this.getAccessToken(userId);

      // Log the request details for debugging
      logger.debug(`Making ${method} request to ${endpoint}`, { 
        params: JSON.stringify(params),
        hasData: data !== null,
        userId: userId || 'none'
      });

      // Prepare URL with query parameters
      const url = new URL(`${API_URL}${endpoint}`);
      if (Object.keys(params).length > 0) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      // Make the request
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        ...(data && { body: JSON.stringify(data) })
      });

      // Handle 204 No Content responses first
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Spotify API error (${response.status}): ${errorText}`);
      }

      // Only try to parse JSON for non-204 successful responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      // For non-JSON responses, return null
      return null;
    } catch (error) {
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
  async getRecommendations(params, userId = null) {
    try {
      return await this.makeRequest('GET', '/recommendations', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to get recommendations: ${error.message}`);
    }
  }

  /**
   * Get a client credentials token for validation
   * @returns {Promise<string>} Access token
   */
  async getClientCredentialsToken() {
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
      const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' })
      });

      const data = await response.json();
      logger.debug('Obtained Spotify client credentials token for validation');
      return data.access_token;
    } catch (error) {
      logger.error('Error getting Spotify client credentials token:', error.message);
      throw error;
    }
  }

  /**
   * Get the current user's Spotify profile
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} - User profile data
   */
  async getCurrentUserProfile(userId) {
    try {
      return await this.makeRequest('GET', '/me', {}, null, userId);
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Get the currently playing track (more efficient than full playback state)
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} - Currently playing track info
   */
  async getCurrentlyPlaying(userId) {
    try {
      console.log('[SpotifyClient] Getting currently playing track for user:', userId);
      const response = await this.makeRequest('GET', '/me/player/currently-playing', {}, null, userId);
      console.log('[SpotifyClient] Currently playing response:', {
        hasResponse: !!response,
        isPlaying: response?.is_playing,
        track: response?.item?.name,
        progress: response?.progress_ms,
        timestamp: response?.timestamp
      });
      return response;
    } catch (error) {
      console.error('[SpotifyClient] Failed to get currently playing:', error.message);
      throw new Error(`Failed to get currently playing: ${error.message}`);
    }
  }

  /**
   * Get the current playback state
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} - Current playback state
   */
  async getPlaybackState(userId) {
    try {
      console.log('[SpotifyClient] Getting playback state for user:', userId);
      const response = await this.makeRequest('GET', '/me/player', {}, null, userId);
      console.log('[SpotifyClient] Playback state response:', {
        hasResponse: !!response,
        statusCode: response?.status,
        isPlaying: response?.is_playing,
        track: response?.item?.name,
        device: response?.device?.name
      });
      return response;
    } catch (error) {
      console.error('[SpotifyClient] Failed to get playback state:', error.message);
      throw new Error(`Failed to get playback state: ${error.message}`);
    }
  }

  /**
   * Get available playback devices
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} - List of available devices
   */
  async getAvailableDevices(userId) {
    try {
      console.log('[SpotifyClient] Getting available devices for user:', userId);
      const response = await this.makeRequest('GET', '/me/player/devices', {}, null, userId);
      console.log('[SpotifyClient] Devices response:', {
        hasResponse: !!response,
        deviceCount: response?.devices?.length,
        devices: response?.devices?.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type,
          isActive: d.is_active
        }))
      });
      return response;
    } catch (error) {
      console.error('[SpotifyClient] Failed to get available devices:', error.message);
      throw new Error(`Failed to get available devices: ${error.message}`);
    }
  }

  /**
   * Start/Resume playback
   * @param {string} deviceId - Device ID to play on
   * @param {string} contextUri - Spotify URI to play
   * @param {Array<string>} uris - List of track URIs to play
   * @param {Object} offset - Offset into context
   * @param {number} positionMs - Position to start from
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async startPlayback(deviceId, contextUri, uris, offset, positionMs, userId) {
    try {
      const params = deviceId ? { device_id: deviceId } : {};
      const data = {
        ...contextUri && { context_uri: contextUri },
        ...uris && { uris: uris },
        ...offset && { offset: offset },
        ...positionMs && { position_ms: positionMs }
      };
      await this.makeRequest('PUT', '/me/player/play', params, data, userId);
    } catch (error) {
      throw new Error(`Failed to start playback: ${error.message}`);
    }
  }

  /**
   * Pause playback
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async pausePlayback(deviceId, userId) {
    try {
      const params = deviceId ? { device_id: deviceId } : {};
      await this.makeRequest('PUT', '/me/player/pause', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to pause playback: ${error.message}`);
    }
  }

  /**
   * Skip to next track
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async skipToNext(deviceId, userId) {
    try {
      const params = deviceId ? { device_id: deviceId } : {};
      await this.makeRequest('POST', '/me/player/next', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to skip to next track: ${error.message}`);
    }
  }

  /**
   * Skip to previous track
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async skipToPrevious(deviceId, userId) {
    try {
      const params = deviceId ? { device_id: deviceId } : {};
      await this.makeRequest('POST', '/me/player/previous', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to skip to previous track: ${error.message}`);
    }
  }

  /**
   * Set playback volume
   * @param {number} volumePercent - Volume percentage (0-100)
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async setPlaybackVolume(volumePercent, deviceId, userId) {
    try {
      const params = {
        volume_percent: volumePercent,
        ...deviceId && { device_id: deviceId }
      };
      await this.makeRequest('PUT', '/me/player/volume', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to set volume: ${error.message}`);
    }
  }

  /**
   * Transfer playback to another device
   * @param {string} deviceId - Device ID to transfer to
   * @param {boolean} play - Whether to ensure playback happens on new device
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async transferPlayback(deviceId, play, userId) {
    try {
      const data = {
        device_ids: [deviceId],
        play: play
      };
      await this.makeRequest('PUT', '/me/player', {}, data, userId);
    } catch (error) {
      throw new Error(`Failed to transfer playback: ${error.message}`);
    }
  }

  /**
   * Seek to position in currently playing track
   * @param {number} positionMs - Position in milliseconds
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async seekToPosition(positionMs, deviceId, userId) {
    try {
      const params = {
        position_ms: positionMs,
        ...deviceId && { device_id: deviceId }
      };
      await this.makeRequest('PUT', '/me/player/seek', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to seek to position: ${error.message}`);
    }
  }
}

// Create singleton instance
const spotifyClient = new SpotifyClient();

export default spotifyClient;