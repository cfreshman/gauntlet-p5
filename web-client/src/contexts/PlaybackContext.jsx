import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const PlaybackContext = createContext(null);

export const PlaybackProvider = ({ children, socket }) => {
  const [playbackState, setPlaybackState] = useState(null);
  const [playbackDevices, setPlaybackDevices] = useState([]);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const deviceIdRef = useRef(null);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    socket.on('playback-state', setPlaybackState);
    socket.on('playback-devices', data => setPlaybackDevices(data.devices || []));
    socket.on('playback-error', error => console.error('[PlaybackContext] Playback error:', error));

    // Get initial state
    socket.emit('playback-command', { action: 'get-playback-state' });
    socket.emit('playback-command', { action: 'get-devices' });

    return () => {
      socket.off('playback-state');
      socket.off('playback-devices');
      socket.off('playback-error');
    };
  }, [socket]);

  const sendPlaybackCommand = useCallback((action, params = {}) => {
    if (!socket?.connected) return;

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

    // Send command
    const device_id = normalizedParams.device_id || playbackState?.device?.id;
    socket.emit('playback-command', {
      action,
      params: {
        ...normalizedParams,
        device_id: device_id || undefined
      }
    });

    // Request fresh state for next/previous since we can't predict the next track
    if (action === 'next' || action === 'previous') {
      setTimeout(() => {
        socket.emit('playback-command', { action: 'get-playback-state' });
      }, 300);
    }
  }, [socket, playbackState]);

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