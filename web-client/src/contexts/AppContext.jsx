import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const STORAGE_KEY = 'music-aipi-chat-history';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const socketRef = useRef(null);

  // Save messages to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const initializeSocket = () => {
    if (socketRef.current?.connected) {
      console.log('[AppContext] Socket already connected:', socketRef.current.id);
      return;
    }

    console.log('[AppContext] Initializing socket connection');
    
    // Initialize socket connection with auth error handling
    const socket = io('http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      autoConnect: false
    });

    socket.on('connect', () => {
      console.log('[AppContext] Socket connected:', socket.id);
      setConnected(true);
    });
    
    socket.on('connect_error', (error) => {
      console.error('[AppContext] Socket connection error:', error.message);
      if (error.message === 'Authentication required') {
        setIsAuthenticated(false);
        // Don't redirect here - let the UI handle it
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[AppContext] Socket disconnected:', reason);
      setConnected(false);
    });
    
    socket.on('assistant_response', (response) => {
      if (response.type === 'error') {
        setMessages(prev => [...prev, { role: 'assistant', content: response.content.text }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
      }
      setIsLoading(false);
    });

    socket.on('auth-success', () => {
      console.log('[AppContext] Authentication successful');
      setIsAuthenticated(true);
    });

    socketRef.current = socket;
  };

  // Check auth on mount and initialize socket if authenticated
  const checkAuthStatus = async () => {
    try {
      console.log('[AppContext] Checking auth status');
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      });
      const data = await response.json();
      
      console.log('[AppContext] Auth status:', data);
      setIsAuthenticated(data.authenticated);
      
      if (data.authenticated) {
        initializeSocket();
        if (socketRef.current && !socketRef.current.connected) {
          console.log('[AppContext] Connecting socket after auth check');
          socketRef.current.connect();
        }
      } else if (socketRef.current) {
        console.log('[AppContext] Disconnecting socket - not authenticated');
        socketRef.current.disconnect();
      }
    } catch (error) {
      console.error('[AppContext] Error checking auth status:', error);
    }
  };

  // Check auth on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Handle authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      console.log('[AppContext] Authenticated, ensuring socket connection');
      initializeSocket();
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
    } else if (socketRef.current) {
      console.log('[AppContext] Not authenticated, disconnecting socket');
      socketRef.current.disconnect();
    }

    return () => {
      if (socketRef.current) {
        console.log('[AppContext] Cleaning up socket connection');
        socketRef.current.disconnect();
      }
    };
  }, [isAuthenticated]);

  const sendMessage = (message) => {
    if (message.trim() === '') return;
    if (!socketRef.current?.connected) {
      console.error('[AppContext] Cannot send message: Socket not connected');
      return;
    }
    
    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    socketRef.current.emit('user_message', { message });
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    setIsLoading(false);
  };

  const value = {
    connected,
    messages,
    isLoading,
    isAuthenticated,
    sendMessage,
    clearHistory,
    checkAuthStatus,
    setIsAuthenticated,
    socketRef
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}; 