import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from './AppContext';
import { useSpotifyApi } from '../hooks/useSpotifyApi';

const PlaybackContext = createContext(null);

const POLLING_INTERVAL = 1000; // Poll every 1 second

export const PlaybackProvider = ({ children }) => {
  const { isAuthenticated } = useApp();
  const { api } = useSpotifyApi();
  const apiRef = useRef(api);
  const [playbackState, setPlaybackState] = useState(null);
  const [playbackDevices, setPlaybackDevices] = useState([]);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const pollingIntervalRef = useRef(null);
  const lastFetchRef = useRef(0);

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