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
      // Users
      'user-read-private',
      'user-read-email',
      
      // Spotify Connect
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      
      // Playback
      'streaming',
      
      // Playlists
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-private',
      'playlist-modify-public',
      
      // Listening History
      'user-read-playback-position',
      'user-top-read',
      'user-read-recently-played',
      
      // Library
      'user-library-modify',
      'user-library-read',
      
      // Follow
      'user-follow-modify',
      'user-follow-read'
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
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @param {Object} data - Request body data
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} - API response
   */
  async makeRequest(method, endpoint, params = {}, data = null, userId = null) {
    try {
      // Get access token
      const accessToken = await this.getAccessToken(userId);
      if (!accessToken) {
        throw new Error('No access token available');
      }

      // Build URL with query parameters
      const url = new URL(`https://api.spotify.com/v1${endpoint}`);
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

      // Make request
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        ...(data && { body: JSON.stringify(data) })
      });

      // Handle response
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Spotify API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      // Check Content-Type before parsing JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      // For non-JSON responses, return the raw text
      return await response.text();
    } catch (error) {
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
      logger.debug('Making getCurrentlyPlaying request', { userId });
      const response = await this.makeRequest('GET', '/me/player/currently-playing', {}, null, userId);
      logger.debug('getCurrentlyPlaying response:', response);
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
      const response = await this.makeRequest('GET', '/me/player', {}, null, userId);
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
      const response = await this.makeRequest('GET', '/me/player/devices', {}, null, userId);
      return response;
    } catch (error) {
      console.error('[SpotifyClient] Failed to get available devices:', error.message);
      throw new Error(`Failed to get available devices: ${error.message}`);
    }
  }

  /**
   * Check and get active device
   * @private
   * @param {string} deviceId - Optional device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<string>} - Active device ID
   */
  async _getActiveDevice(deviceId, userId) {
    if (deviceId) return deviceId;

    logger.debug('No deviceId provided, checking available devices');
    const devices = await this.getAvailableDevices(userId);
    if (!devices || !devices.devices || devices.devices.length === 0) {
      throw new Error('No available Spotify devices found. Please open Spotify on a device.');
    }
    
    // If no active device, use the first available one
    const activeDevice = devices.devices.find(d => d.is_active);
    if (!activeDevice) {
      const newDeviceId = devices.devices[0].id;
      logger.debug(`No active device found, transferring playback to device ${newDeviceId}`);
      // Transfer playback to this device
      await this.transferPlayback(newDeviceId, true, userId);
      // Wait a bit for the transfer to take effect
      await new Promise(resolve => setTimeout(resolve, 1000));
      return newDeviceId;
    }
    
    return activeDevice.id;
  }

  /**
   * Handle common playback errors
   * @private
   * @param {Error} error - The error to handle
   * @param {string} action - The action being performed
   * @throws {Error} - Formatted error message
   */
  _handlePlaybackError(error, action) {
    if (error.message.includes('404')) {
      throw new Error(`Failed to ${action}: No active Spotify session found. Please open Spotify on a device.`);
    }
    if (error.message.includes('403')) {
      throw new Error(`Failed to ${action}: No active device available. Please open Spotify on a device.`);
    }
    throw new Error(`Failed to ${action}: ${error.message}`);
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
      deviceId = await this._getActiveDevice(deviceId, userId);
      
      const params = deviceId ? { device_id: deviceId } : {};
      const data = {
        ...contextUri && { context_uri: contextUri },
        ...uris && { uris: uris },
        ...offset && { offset: offset },
        ...positionMs && { position_ms: positionMs }
      };
      
      logger.debug('Starting playback with params:', { deviceId, contextUri, uris });
      await this.makeRequest('PUT', '/me/player/play', params, data, userId);
    } catch (error) {
      this._handlePlaybackError(error, 'start playback');
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
      deviceId = await this._getActiveDevice(deviceId, userId);
      const params = deviceId ? { device_id: deviceId } : {};
      await this.makeRequest('PUT', '/me/player/pause', params, null, userId);
    } catch (error) {
      this._handlePlaybackError(error, 'pause playback');
    }
  }

  /**
   * Skip forward in the queue
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @param {number} [count=1] - Number of tracks to skip forward
   * @returns {Promise<void>}
   */
  async skipToNext(deviceId, userId, count = 1) {
    try {
      deviceId = await this._getActiveDevice(deviceId, userId);
      const params = deviceId ? { device_id: deviceId } : {};
      
      for (let i = 0; i < count; i++) {
        await this.makeRequest('POST', '/me/player/next', params, null, userId);
      }
    } catch (error) {
      this._handlePlaybackError(error, 'skip to next track');
    }
  }

  /**
   * Skip backward in the queue
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @param {number} [count=1] - Number of tracks to skip backward
   * @returns {Promise<void>}
   */
  async skipToPrevious(deviceId, userId, count = 1) {
    try {
      deviceId = await this._getActiveDevice(deviceId, userId);
      const params = deviceId ? { device_id: deviceId } : {};
      
      for (let i = 0; i < count; i++) {
        await this.makeRequest('POST', '/me/player/previous', params, null, userId);
      }
    } catch (error) {
      this._handlePlaybackError(error, 'skip to previous track');
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
      deviceId = await this._getActiveDevice(deviceId, userId);
      const params = {
        volume_percent: volumePercent,
        ...deviceId && { device_id: deviceId }
      };
      await this.makeRequest('PUT', '/me/player/volume', params, null, userId);
    } catch (error) {
      this._handlePlaybackError(error, 'set volume');
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
      logger.debug('Transferring playback', { deviceId, play });
      const data = {
        device_ids: Array.isArray(deviceId) ? deviceId : [deviceId],
        play: play
      };
      await this.makeRequest('PUT', '/me/player', {}, data, userId);
      logger.debug('Playback transfer successful');
    } catch (error) {
      this._handlePlaybackError(error, 'transfer playback');
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
      deviceId = await this._getActiveDevice(deviceId, userId);
      const params = {
        position_ms: positionMs === 0 ? 1 : positionMs,
        ...deviceId && { device_id: deviceId }
      };
      await this.makeRequest('PUT', '/me/player/seek', params, null, userId);
    } catch (error) {
      this._handlePlaybackError(error, 'seek to position');
    }
  }

  /**
   * Get information about a playback context (playlist, album, artist)
   * @param {string} type - The type of context ('playlist', 'album', 'artist')
   * @param {string} uri - The Spotify URI of the context
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} Context information including name
   */
  async getContextInfo(type, uri, userId) {
    try {
      const contextId = uri.split(':').pop();
      
      switch (type) {
        case 'playlist':
          const playlist = await this.makeRequest('GET', `/playlists/${contextId}`, {}, null, userId);
          return {
            name: playlist.name,
            type: 'playlist',
            uri: uri,
            href: playlist.external_urls?.spotify
          };
        
        case 'album':
          const album = await this.makeRequest('GET', `/albums/${contextId}`, {}, null, userId);
          return {
            name: album.name,
            type: 'album',
            uri: uri,
            href: album.external_urls?.spotify
          };
        
        case 'artist':
          const artist = await this.makeRequest('GET', `/artists/${contextId}`, {}, null, userId);
          return {
            name: artist.name,
            type: 'artist',
            uri: uri,
            href: artist.external_urls?.spotify
          };
          
        default:
          return null;
      }
    } catch (error) {
      logger.error('Error getting context info:', error.message);
      return null;
    }
  }

  /**
   * Search for items on Spotify
   * @param {string} query - Search query
   * @param {string|Array<string>} types - Item types to search for (album, artist, playlist, track)
   * @param {number} [limit=20] - Maximum number of results per type
   * @param {number} [offset=0] - Index offset for pagination
   * @param {string} [market='US'] - Market code (ISO 3166-1 alpha-2)
   * @param {string} [userId] - User ID for user-specific tokens
   * @returns {Promise<Object>} - Search results
   */
  async search(query, types, limit = 20, offset = 0, market = 'US', userId = null) {
    try {
      // Convert types to array if it's a string
      const typesArray = Array.isArray(types) ? types : [types];
      
      const params = {
        q: query,
        type: typesArray.join(','),
        limit,
        offset,
        market
      };

      return await this.makeRequest('GET', '/search', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to search Spotify: ${error.message}`);
    }
  }

  /**
   * Get the user's queue
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} Queue information
   */
  async getQueue(userId) {
    try {
      return await this.makeRequest('GET', '/me/player/queue', {}, null, userId);
    } catch (error) {
      throw new Error(`Failed to get queue: ${error.message}`);
    }
  }

  /**
   * Add item(s) to the user's playback queue
   * @param {string|string[]} uris - Spotify URI(s) of the item(s) to add
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async addToQueue(uris, deviceId, userId) {
    try {
      deviceId = await this._getActiveDevice(deviceId, userId);
      const uriArray = Array.isArray(uris) ? uris : [uris];
      
      for (const uri of uriArray) {
        const params = {
          uri,
          ...deviceId && { device_id: deviceId }
        };
        await this.makeRequest('POST', '/me/player/queue', params, null, userId);
      }
    } catch (error) {
      this._handlePlaybackError(error, 'add to queue');
    }
  }

  /**
   * Set repeat mode
   * @param {string} state - Repeat mode (track, context, off)
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async setRepeatMode(state, deviceId, userId) {
    try {
      deviceId = await this._getActiveDevice(deviceId, userId);
      const params = {
        state,
        ...deviceId && { device_id: deviceId }
      };
      await this.makeRequest('PUT', '/me/player/repeat', params, null, userId);
    } catch (error) {
      this._handlePlaybackError(error, 'set repeat mode');
    }
  }

  /**
   * Toggle shuffle mode
   * @param {boolean} state - Shuffle state
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<void>}
   */
  async togglePlaybackShuffle(state, deviceId, userId) {
    try {
      deviceId = await this._getActiveDevice(deviceId, userId);
      const params = {
        state,
        ...deviceId && { device_id: deviceId }
      };
      await this.makeRequest('PUT', '/me/player/shuffle', params, null, userId);
    } catch (error) {
      this._handlePlaybackError(error, 'toggle shuffle');
    }
  }

  /**
   * Get a track by ID
   * @param {string} trackId - The Spotify track ID
   * @param {string} [market] - Optional market code
   * @param {string} [userId] - User ID for user-specific tokens
   * @returns {Promise<Object>} Track object
   */
  async getTrack(trackId, market = null, userId = null) {
    try {
      const params = market ? { market } : {};
      return await this.makeRequest('GET', `/tracks/${trackId}`, params, null, userId);
    } catch (error) {
      throw new Error(`Failed to get track: ${error.message}`);
    }
  }

  /**
   * Get a playlist by ID
   * @param {string} playlistId - The Spotify playlist ID
   * @param {string} [fields] - Optional fields to return
   * @param {string} [market] - Optional market code
   * @param {string} [userId] - User ID for user-specific tokens
   * @returns {Promise<Object>} Playlist object
   */
  async getPlaylist(playlistId, fields = null, market = null, userId = null) {
    try {
      const params = {
        ...(fields && { fields }),
        ...(market && { market })
      };
      return await this.makeRequest('GET', `/playlists/${playlistId}`, params, null, userId);
    } catch (error) {
      throw new Error(`Failed to get playlist: ${error.message}`);
    }
  }

  /**
   * Get tracks in a playlist
   * @param {string} playlistId - The Spotify playlist ID
   * @param {number} [limit=20] - Number of tracks to return
   * @param {number} [offset=0] - Offset into playlist tracks
   * @param {string} [market] - Optional market code
   * @param {string} [userId] - User ID for user-specific tokens
   * @returns {Promise<Object>} Playlist tracks object
   */
  async getPlaylistTracks(playlistId, limit = 20, offset = 0, market = null, userId = null) {
    try {
      const params = {
        limit,
        offset,
        ...(market && { market })
      };
      return await this.makeRequest('GET', `/playlists/${playlistId}/tracks`, params, null, userId);
    } catch (error) {
      throw new Error(`Failed to get playlist tracks: ${error.message}`);
    }
  }

  /**
   * Create a new playlist
   * @param {string} userId - The user's Spotify ID
   * @param {string} name - Name of the playlist
   * @param {string} [description] - Optional description
   * @param {boolean} [isPublic=false] - Whether the playlist is public
   * @param {boolean} [collaborative=false] - Whether the playlist is collaborative
   * @returns {Promise<Object>} Created playlist object
   */
  async createPlaylist(userId, name, description = null, isPublic = false, collaborative = false) {
    try {
      const data = {
        name,
        public: isPublic,
        collaborative,
        ...(description && { description })
      };
      return await this.makeRequest('POST', `/users/${userId}/playlists`, {}, data, userId);
    } catch (error) {
      throw new Error(`Failed to create playlist: ${error.message}`);
    }
  }

  /**
   * Add tracks to a playlist
   * @param {string} playlistId - The Spotify playlist ID
   * @param {string|string[]} trackUris - Track URI(s) to add
   * @param {number} [position] - Position to insert tracks
   * @param {string} [userId] - User ID for user-specific tokens
   * @returns {Promise<Object>} Response object
   */
  async addTracksToPlaylist(playlistId, trackUris, position = null, userId = null) {
    try {
      const uris = Array.isArray(trackUris) ? trackUris : [trackUris];
      const data = {
        uris,
        ...(position !== null && { position })
      };
      return await this.makeRequest('POST', `/playlists/${playlistId}/tracks`, {}, data, userId);
    } catch (error) {
      throw new Error(`Failed to add tracks to playlist: ${error.message}`);
    }
  }

  /**
   * Get user's recently played tracks
   * @param {number} [limit=20] - Number of tracks to return
   * @param {number} [before] - Unix timestamp in ms to get tracks before
   * @param {number} [after] - Unix timestamp in ms to get tracks after
   * @param {string} userId - User ID for user-specific tokens
   * @returns {Promise<Object>} Recently played tracks object
   */
  async getRecentlyPlayedTracks(limit = 20, before = null, after = null, userId) {
    try {
      const params = {
        limit,
        ...(before && { before }),
        ...(after && { after })
      };
      return await this.makeRequest('GET', '/me/player/recently-played', params, null, userId);
    } catch (error) {
      throw new Error(`Failed to get recently played tracks: ${error.message}`);
    }
  }
}

// Create singleton instance
const spotifyClient = new SpotifyClient();

export default spotifyClient;