import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import PlaybackControls from './components/PlaybackControls';
import SpotifyAuthScreen from './components/SpotifyAuthScreen';
import './styles/app.css';

const STORAGE_KEY = 'music-aipi-chat-history';

const App = () => {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState(() => {
    // Load messages from localStorage on initial render
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [playbackState, setPlaybackState] = useState(null);
  const [playbackDevices, setPlaybackDevices] = useState([]);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const socketRef = useRef(null);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    console.log('saved messages to localStorage, count:', messages.length);
  }, [messages]);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Check authentication status
  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      });
      
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
      
      if (data.authenticated) {
        initializeSocket();
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  // Initialize socket connection
  const initializeSocket = () => {
    console.log('initializing socket connection...');
    socketRef.current = io();
    
    socketRef.current.on('connect', () => {
      setConnected(true);
      console.log('socket connected, id:', socketRef.current.id);
    });
    
    socketRef.current.on('disconnect', () => {
      setConnected(false);
      console.log('socket disconnected');
    });
    
    socketRef.current.on('message', (message) => {
      console.log('received message from server:', message);
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
      setIsLoading(false);
    });
    
    socketRef.current.on('debug-log', (debugInfo) => {
      // Log the raw debug object to the browser console
      console.log('MUSIC_AIPI_DEBUG:', debugInfo);
    });
    
    // Playback-related event handlers
    socketRef.current.on('playback-state', (state) => {
      console.log('received playback state:', state);
      setPlaybackState(state);
    });
    
    socketRef.current.on('playback-devices', (data) => {
      console.log('received playback devices:', data);
      setPlaybackDevices(data.devices || []);
    });
    
    socketRef.current.on('playback-result', (result) => {
      console.log('playback command result:', result);
      // Refresh playback state after successful command
      if (result.success) {
        socketRef.current.emit('playback-command', { action: 'get-playback-state' });
      }
    });
    
    socketRef.current.on('playback-error', (error) => {
      // Only log certain errors, ignore volume control errors for iPhone
      if (error && error.error && !error.error.includes('Cannot control device volume')) {
        console.error('playback error:', error);
      }
    });
    
    socketRef.current.on('auth-success', (userData) => {
      console.log('spotify auth success:', userData);
      setIsAuthenticated(true);
      // Fetch initial playback state after successful auth
      socketRef.current.emit('playback-command', { action: 'get-playback-state' });
      socketRef.current.emit('playback-command', { action: 'get-devices' });
    });
    
    socketRef.current.on('connect_error', (error) => {
      console.error('socket connection error:', error);
    });
    
    socketRef.current.on('error', (error) => {
      console.error('socket error:', error);
    });
    
    // Request initial playback state and devices
    socketRef.current.emit('playback-command', { action: 'get-playback-state' });
    socketRef.current.emit('playback-command', { action: 'get-devices' });
    
    return () => {
      console.log('cleaning up socket connection');
      socketRef.current.disconnect();
    };
  };
  
  const sendMessage = (message) => {
    if (message.trim() === '' || !socketRef.current) return;
    
    console.log('sending message to server:', message);
    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    socketRef.current.emit('message', message);
  };
  
  const clearHistory = () => {
    console.log('clearing chat history');
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };
  
  const sendPlaybackCommand = (action, params = {}) => {
    if (!socketRef.current) {
      console.error('Cannot send playback command: socket not connected');
      return;
    }
    
    console.log(`sending playback command: ${action}`, params);
    socketRef.current.emit('playback-command', { action, params });
  };
  
  const handleLoginSuccess = (userData) => {
    setIsAuthenticated(true);
    initializeSocket();
  };
  
  const handlePlayerExpandToggle = (expanded) => {
    setPlayerExpanded(expanded);
  };
  
  // If not authenticated, show the auth screen
  if (!isAuthenticated) {
    return <SpotifyAuthScreen onLoginSuccess={handleLoginSuccess} />;
  }
  
  return (
    <div className="app">
      <Header 
        clearHistory={clearHistory}
        messageCount={messages.length}
      />
      <main className="main-content">
        <ChatInterface 
          messages={messages} 
          sendMessage={sendMessage} 
          isLoading={isLoading}
          hideInput={playerExpanded}
        />
      </main>
      <footer className="app-footer">
        {playbackState && (
          <PlaybackControls 
            playbackState={playbackState}
            playbackDevices={playbackDevices}
            sendPlaybackCommand={sendPlaybackCommand}
            onExpandToggle={handlePlayerExpandToggle}
          />
        )}
      </footer>
    </div>
  );
};

export default App; 