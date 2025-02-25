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

  // Check auth on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

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

  const initializeSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    socketRef.current = io('http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 20000,
      autoConnect: false
    });

    socketRef.current.on('connect', () => {
      setConnected(true);
    });
    
    socketRef.current.on('connect_error', (error) => {
      setConnected(false);
      if (error.message.includes('session')) {
        setIsAuthenticated(false);
        checkAuthStatus();
      }
    });
    
    socketRef.current.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') {
        socketRef.current.connect();
      }
    });
    
    socketRef.current.on('assistant_response', (response) => {
      if (response.type === 'error') {
        setMessages(prev => [...prev, { role: 'assistant', content: response.content.text }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
      }
      setIsLoading(false);
    });

    socketRef.current.on('auth-success', () => {
      setIsAuthenticated(true);
    });
    
    socketRef.current.connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  };

  const sendMessage = (message) => {
    if (message.trim() === '' || !socketRef.current) return;
    
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