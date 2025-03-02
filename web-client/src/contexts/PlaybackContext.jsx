import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from './AppContext';
import { useSpotifyApi } from '../hooks/useSpotifyApi';

const PlaybackContext = createContext(null);

const POLLING_INTERVAL = 1000; // Poll every 1 second
const SPOTIFY_SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const AUTH_STORAGE_KEY = 'music-aipi-auth';

export const PlaybackProvider = ({ children }) => {
  const { isAuthenticated } = useApp();
  const { api } = useSpotifyApi();
  const apiRef = useRef(api);
  const [playbackState, setPlaybackState] = useState(null);
  const [playbackDevices, setPlaybackDevices] = useState([]);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const pollingIntervalRef = useRef(null);
  const lastFetchRef = useRef(0);
  const playerRef = useRef(null);

  // Load Spotify SDK Script
  useEffect(() => {
    if (!isAuthenticated) return;

    // Only load script if it hasn't been loaded
    if (!document.getElementById('spotify-player-script')) {
      const script = document.createElement('script');
      script.id = 'spotify-player-script';
      script.src = SPOTIFY_SDK_URL;
      script.async = true;

      // Initialize player when script loads
      window.onSpotifyWebPlaybackSDKReady = () => {
        const player = new window.Spotify.Player({
          name: 'music-AIPI',
          getOAuthToken: async cb => {
            try {
              // Get auth data from storage
              const authData = localStorage.getItem(AUTH_STORAGE_KEY);
              if (!authData) {
                console.error('No auth data found');
                return;
              }

              const { userId, accessToken, refreshToken, expirationTime } = JSON.parse(authData);
              const response = await fetch('/api/spotify/token', {
                headers: {
                  'Authorization': `Bearer ${userId}:${accessToken}:${refreshToken}:${expirationTime}`
                }
              });

              if (!response.ok) {
                throw new Error('Failed to refresh token');
              }

              const data = await response.json();
              cb(data.token);
            } catch (err) {
              console.error('Error getting token for SDK:', err);
            }
          }
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => {
          console.error('Failed to initialize player:', message);
        });
        player.addListener('authentication_error', ({ message }) => {
          console.error('Failed to authenticate:', message);
        });
        player.addListener('account_error', ({ message }) => {
          console.error('Failed to validate Spotify account:', message);
        });
        player.addListener('playback_error', ({ message }) => {
          console.error('Failed to perform playback:', message);
        });

        // Ready listener
        player.addListener('ready', ({ device_id }) => {
          console.log('Web Playback SDK ready with device ID:', device_id);
          // Fetch devices to include our new device
          fetchPlaybackData();
        });

        // Not ready listener
        player.addListener('not_ready', ({ device_id }) => {
          console.log('Web Playback SDK device became not ready:', device_id);
        });

        // Connect to the player
        player.connect();
        playerRef.current = player;
      };

      document.body.appendChild(script);
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, [isAuthenticated]);

  // Keep apiRef current
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  // Fetch playback state and devices
  const fetchPlaybackData = useCallback(async () => {
    try {
      // Prevent fetching too frequently
      const now = Date.now();
      if (now - lastFetchRef.current < POLLING_INTERVAL) {
        return;
      }
      lastFetchRef.current = now;

      if (!isAuthenticated) return;

      const [stateData, devicesData] = await Promise.all([
        apiRef.current.playback.getState(),
        apiRef.current.playback.getDevices()
      ]);

      if (!stateData.error) {
        setPlaybackState(stateData);
      }
      if (!devicesData.error) {
        setPlaybackDevices(devicesData.devices || []);
      }
    } catch (error) {
      console.error('[PlaybackContext] Error fetching playback data:', error);
    }
  }, [isAuthenticated]); // Only depend on isAuthenticated

  // Start polling on mount and when auth changes
  useEffect(() => {
    if (!isAuthenticated) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchPlaybackData();

    // Set up polling interval
    pollingIntervalRef.current = setInterval(fetchPlaybackData, POLLING_INTERVAL);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, fetchPlaybackData]);

  const sendPlaybackCommand = useCallback(async (action, params = {}) => {
    if (!isAuthenticated) return;

    // Convert camelCase to snake_case
    const normalizedParams = { ...params };
    if (params.positionMs !== undefined) {
      normalizedParams.position_ms = parseInt(params.positionMs, 10);
      delete normalizedParams.positionMs;
    }
    if (params.deviceId !== undefined) {
      normalizedParams.device_id = params.deviceId;
      delete normalizedParams.deviceId;
    }

    // Update UI immediately for common actions
    switch (action) {
      case 'play':
        setPlaybackState(prev => ({ ...prev, is_playing: true }));
        break;
      case 'pause':
        setPlaybackState(prev => ({ ...prev, is_playing: false }));
        break;
      case 'seek':
        setPlaybackState(prev => ({ ...prev, progress_ms: normalizedParams.position_ms }));
        break;
      case 'volume':
        setPlaybackState(prev => ({
          ...prev,
          device: { ...prev.device, volume_percent: params.volumePercent }
        }));
        break;
    }

    try {
      // Send command using the appropriate API method
      const device_id = normalizedParams.device_id || playbackState?.device?.id;
      
      switch (action) {
        case 'play':
          await apiRef.current.playback.play({ ...normalizedParams, deviceId: device_id });
          break;
        case 'pause':
          await apiRef.current.playback.pause(device_id);
          break;
        case 'next':
          await apiRef.current.playback.next(device_id);
          break;
        case 'previous':
          await apiRef.current.playback.previous(device_id);
          break;
        case 'seek':
          await apiRef.current.playback.seek(normalizedParams.position_ms, device_id);
          break;
        case 'volume':
          await apiRef.current.playback.setVolume(params.volumePercent, device_id);
          break;
        case 'queue':
          await apiRef.current.playback.addToQueue(params.uri, device_id);
          break;
        case 'transfer':
          await apiRef.current.playback.transfer({ deviceId: normalizedParams.device_id });
          break;
        case 'shuffle':
          await apiRef.current.playback.shuffle(params.state, device_id);
          // Update UI immediately
          setPlaybackState(prev => ({ ...prev, shuffle_state: params.state }));
          break;
      }

      // Fetch fresh state after command
      await fetchPlaybackData();
    } catch (error) {
      console.error('[PlaybackContext] Error sending playback command:', error);
    }
  }, [isAuthenticated, playbackState, fetchPlaybackData]); // Remove api from dependencies

  const value = {
    playbackState,
    playbackDevices,
    playerExpanded,
    sendPlaybackCommand,
    handlePlayerExpandToggle: setPlayerExpanded
  };

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
};

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}; 