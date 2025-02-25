import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from './AppContext';

const PlaybackContext = createContext(null);

export const PlaybackProvider = ({ children }) => {
  const { isAuthenticated } = useApp();
  const [playbackState, setPlaybackState] = useState(null);
  const [playbackDevices, setPlaybackDevices] = useState([]);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const pollingIntervalRef = useRef(null);

  const getAuthHeader = useCallback(() => {
    const auth = localStorage.getItem('music-aipi-auth');
    if (!auth) return null;
    const { userId, accessToken, refreshToken, expirationTime } = JSON.parse(auth);
    return `Bearer ${userId}:${accessToken}:${refreshToken}:${expirationTime}`;
  }, []);

  // Fetch playback state and devices
  const fetchPlaybackState = useCallback(async () => {
    try {
      const authHeader = getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/playback/state', {
        headers: {
          Authorization: authHeader
        }
      });
      const data = await response.json();
      if (!data.error) {
        setPlaybackState(data);
      }
    } catch (error) {
      console.error('[PlaybackContext] Error fetching playback state:', error);
    }
  }, [getAuthHeader]);

  const fetchPlaybackDevices = useCallback(async () => {
    try {
      const authHeader = getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/playback/devices', {
        headers: {
          Authorization: authHeader
        }
      });
      const data = await response.json();
      if (!data.error) {
        setPlaybackDevices(data.devices || []);
      }
    } catch (error) {
      console.error('[PlaybackContext] Error fetching devices:', error);
    }
  }, [getAuthHeader]);

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
    fetchPlaybackState();
    fetchPlaybackDevices();

    // Set up polling interval
    pollingIntervalRef.current = setInterval(() => {
      fetchPlaybackState();
      fetchPlaybackDevices();
    }, 1000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [isAuthenticated, fetchPlaybackState, fetchPlaybackDevices]);

  const sendPlaybackCommand = useCallback(async (action, params = {}) => {
    const authHeader = getAuthHeader();
    if (!authHeader) return;

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
      // Send command
      const device_id = normalizedParams.device_id || playbackState?.device?.id;
      const endpoint = `/api/playback/${action}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          ...normalizedParams,
          deviceId: device_id
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send playback command: ${response.statusText}`);
      }

      // Fetch fresh state after command
      await fetchPlaybackState();
    } catch (error) {
      console.error('[PlaybackContext] Error sending playback command:', error);
    }
  }, [playbackState, fetchPlaybackState, getAuthHeader]);

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