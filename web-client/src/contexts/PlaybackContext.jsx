import React, { createContext, useContext, useState, useEffect } from 'react';

const PlaybackContext = createContext(null);

export const PlaybackProvider = ({ children, socket }) => {
  const [playbackState, setPlaybackState] = useState(null);
  const [playbackDevices, setPlaybackDevices] = useState([]);
  const [playerExpanded, setPlayerExpanded] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('playback-state', (state) => {
      setPlaybackState(state);
    });

    socket.on('playback-devices', (data) => {
      setPlaybackDevices(data.devices || []);
    });

    socket.on('playback-result', (result) => {
      if (result.success) {
        socket.emit('playback-command', { action: 'get-playback-state' });
      }
    });

    // Request initial state
    socket.emit('playback-command', { action: 'get-playback-state' });
    socket.emit('playback-command', { action: 'get-devices' });

    return () => {
      socket.off('playback-state');
      socket.off('playback-devices');
      socket.off('playback-result');
    };
  }, [socket]);

  const sendPlaybackCommand = (action, params = {}) => {
    if (!socket) {
      console.error('Cannot send playback command: socket not connected');
      return;
    }
    socket.emit('playback-command', { action, params });
  };

  const handlePlayerExpandToggle = (expanded) => {
    setPlayerExpanded(expanded);
  };

  const value = {
    playbackState,
    playbackDevices,
    playerExpanded,
    sendPlaybackCommand,
    handlePlayerExpandToggle
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