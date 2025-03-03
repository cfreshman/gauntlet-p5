import { useState, useCallback, useEffect, useRef } from 'react';

const AUTH_STORAGE_KEY = 'music-aipi-auth';
const REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes before expiration

export const useSpotifyApi = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const auth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!auth) return false;
    const { expirationTime } = JSON.parse(auth);
    return Date.now() < expirationTime;
  });
  const refreshTimerRef = useRef(null);

  // Set up refresh timer
  useEffect(() => {
    const checkAndRefreshToken = async () => {
      const auth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!auth) return;

      const { refreshToken, expirationTime } = JSON.parse(auth);
      const timeUntilExpiry = expirationTime - Date.now();

      // If token expires in less than our buffer, refresh it
      if (timeUntilExpiry < REFRESH_BUFFER) {
        console.log('Token expiring soon, refreshing...');
        await refreshTokens(refreshToken);
      }

      // Schedule next check
      const nextCheck = Math.max(timeUntilExpiry - REFRESH_BUFFER, 1000);
      refreshTimerRef.current = setTimeout(checkAndRefreshToken, nextCheck);
    };

    // Start checking if authenticated
    if (isAuthenticated) {
      checkAndRefreshToken();
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [isAuthenticated]);

  const refreshTokens = useCallback(async (refreshToken) => {
    try {
      const auth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
      const response = await fetch('/api/spotify/token', {
        headers: {
          'Authorization': `Bearer ${auth.userId}:expired:${refreshToken}:0`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const data = await response.json();
      
      // Update stored auth with new token and expiration
      const updatedAuth = {
        ...auth,
        accessToken: data.token,
        expirationTime: Date.now() + (3600 - 300) * 1000 // 1 hour minus 5 min buffer
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedAuth));
      setIsAuthenticated(true);
      return updatedAuth;
    } catch (error) {
      console.error('Error refreshing token:', error);
      logout();
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    // First clear server session
    fetch('/api/auth/logout', {
      credentials: 'include'
    }).finally(() => {
      // Then clear local state
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
    });
  }, []);

  const makeRequest = useCallback(async (config, retryCount = 0) => {
    try {
      const auth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!auth) {
        throw new Error('Not authenticated');
      }

      let { userId, accessToken, refreshToken, expirationTime } = JSON.parse(auth);

      // Check if token needs refresh before making request
      if (Date.now() >= expirationTime) {
        const newAuth = await refreshTokens(refreshToken);
        if (!newAuth) {
          throw new Error('Failed to refresh token');
        }
        accessToken = newAuth.accessToken;
        expirationTime = newAuth.expirationTime;
      }

      const authHeader = `Bearer ${userId}:${accessToken}:${refreshToken}:${expirationTime}`;

      const response = await fetch(config.url, {
        method: config.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          ...config.headers
        },
        ...(config.body && { body: JSON.stringify(config.body) })
      });

      if (!response.ok) {
        // If unauthorized and haven't retried yet, try refreshing token
        if (response.status === 401 && retryCount === 0) {
          const newAuth = await refreshTokens(refreshToken);
          if (newAuth) {
            // Retry the request with new token
            return makeRequest(config, retryCount + 1);
          }
        }
        throw new Error(`Request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }, [refreshTokens]);

  // Spotify API endpoints
  const api = {
    chat: (message, conversationHistory) => makeRequest({
      url: '/api/chat',
      method: 'POST',
      body: {
        query: message,
        conversationHistory: JSON.stringify(conversationHistory),
        responseFormat: 'concise'
      }
    }),

    playback: {
      getState: () => makeRequest({ url: '/api/playback/state' }),
      getDevices: () => makeRequest({ url: '/api/playback/devices' }),
      play: (options) => makeRequest({
        url: '/api/playback/play',
        method: 'POST',
        body: options
      }),
      pause: (deviceId) => makeRequest({
        url: '/api/playback/pause',
        method: 'POST',
        body: { deviceId }
      }),
      next: (deviceId) => makeRequest({
        url: '/api/playback/next',
        method: 'POST',
        body: { deviceId }
      }),
      previous: (deviceId) => makeRequest({
        url: '/api/playback/previous',
        method: 'POST',
        body: { deviceId }
      }),
      seek: (position_ms, deviceId) => makeRequest({
        url: '/api/playback/seek',
        method: 'POST',
        body: { position_ms, deviceId }
      }),
      setVolume: (volumePercent, deviceId) => makeRequest({
        url: '/api/playback/volume',
        method: 'POST',
        body: { volumePercent, deviceId }
      }),
      addToQueue: (uri, deviceId) => makeRequest({
        url: '/api/playback/queue',
        method: 'POST',
        body: { uri, deviceId }
      }),
      getContextInfo: (type, uri) => makeRequest({
        url: `/api/${type}s/${uri.split(':').pop()}`
      }),
      transfer: (options) => makeRequest({
        url: '/api/playback/transfer',
        method: 'POST',
        body: options
      }),
      shuffle: (state, deviceId) => makeRequest({
        url: '/api/playback/shuffle',
        method: 'POST',
        body: { state, deviceId }
      })
    }
  };

  return {
    isAuthenticated,
    setIsAuthenticated,
    refreshTokens,
    logout,
    api
  };
}; 