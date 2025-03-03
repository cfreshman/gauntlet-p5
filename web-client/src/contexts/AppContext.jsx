import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSpotifyApi } from '../hooks/useSpotifyApi';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'music-aipi-chat-history';
const AUTH_STORAGE_KEY = 'music-aipi-auth';
const SESSION_STORAGE_KEY = 'music-aipi-session';
const LENS_STORAGE_KEY = 'music-aipi-lens';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [lens, setLens] = useState(() => {
    const savedLens = localStorage.getItem(LENS_STORAGE_KEY);
    return savedLens || '';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated, setIsAuthenticated, api, logout } = useSpotifyApi();
  const [userId, setUserId] = useState(null);
  const wsRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  const RECONNECT_INTERVAL = 5000;

  // Save lens to localStorage
  useEffect(() => {
    localStorage.setItem(LENS_STORAGE_KEY, lens);
  }, [lens]);

  // Initialize WebSocket connection when auth changes
  useEffect(() => {
    const auth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!auth) {
      setIsConnected(false);
      return;
    }

    connectWebSocket();

    // Cleanup on unmount or auth change
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      retryCountRef.current = 0;
    };
  }, [isAuthenticated]);

  const retryConnection = () => {
    if (retryCountRef.current < MAX_RETRIES) {
      retryTimeoutRef.current = setTimeout(() => {
        console.log(`Retrying connection attempt ${retryCountRef.current + 1}/${MAX_RETRIES}`);
        retryCountRef.current++;
        connectWebSocket();
      }, RETRY_DELAY);
    } else {
      console.error('Max immediate retries reached, switching to periodic retry');
      retryCountRef.current = 0;
      // Start periodic reconnection attempts
      retryTimeoutRef.current = setInterval(() => {
        console.log('Attempting periodic reconnection...');
        connectWebSocket();
      }, RECONNECT_INTERVAL);
    }
  };

  // Initialize WebSocket connection
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Clear any periodic retry interval if we're connected
      if (retryTimeoutRef.current) {
        clearInterval(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      return;
    }

    const auth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!auth) return;

    // Parse auth JSON and format as string
    const { userId, accessToken, refreshToken, expirationTime } = JSON.parse(auth);
    const authString = `${userId}:${accessToken}:${refreshToken}:${expirationTime}`;

    // Get existing session ID if any
    const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.port === '3004' ? 'localhost:3000' : window.location.host}/chat?auth=${encodeURIComponent(authString)}${sessionId ? `&sessionId=${sessionId}` : ''}`;
    console.log('WebSocket URL:', wsUrl);
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connection opened');
      setIsConnected(true);
      retryCountRef.current = 0;
      // Clear any retry timers on successful connection
      if (retryTimeoutRef.current) {
        clearInterval(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      // Clear any connection error messages
      setMessages(prev => prev.filter(m => !m.isError || !m.content.some(c => 
        c.text?.includes('connection error')
      )));
    };

    wsRef.current.onmessage = (event) => {
      console.log('Raw WebSocket message received:', event.data);
      const data = JSON.parse(event.data);
      console.log('Parsed WebSocket message:', data);
      console.log('Message type:', data.type);

      if (data.type === 'session') {
        // Store session ID for reconnection
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
        return;
      }

      if (data.type === 'thinking') {
        console.log('Processing thinking message:', data.content);
        // Update loading state with thinking message
        setMessages(prev => {
          console.log('Previous messages:', prev);
          // Remove any previous thinking messages
          const withoutThinking = prev.filter(m => !m.isThinking);
          console.log('Messages without thinking:', withoutThinking);
          
          const newMessages = [...withoutThinking, {
            role: 'assistant',
            content: data.content,
            isThinking: true,
            style: 'thinking-pulse'
          }];
          console.log('New messages state:', newMessages);
          return newMessages;
        });
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content,
          isError: true
        }]);
        setIsLoading(false);
      } else {
        // Final response - replace any thinking message
        setMessages(prev => {
          // Remove any thinking messages
          const withoutThinking = prev.filter(m => !m.isThinking);
          return [...withoutThinking, {
            role: 'assistant',
            content: data.content
          }];
        });
        setIsLoading(false);
      }
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket connection closed');
      wsRef.current = null;
      setIsConnected(false);
      
      // If we've exceeded retries, clear session ID and thinking messages
      if (retryCountRef.current >= MAX_RETRIES) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setMessages(prev => prev.filter(m => !m.isThinking));
      }
      
      retryConnection();
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  };

  // Save messages to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const sendMessage = async (message) => {
    if (message.trim() === '') return;
    
    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      if (!isAuthenticated) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "please log in with spotify first" 
        }]);
        return;
      }

      // Send message through WebSocket if connected
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          query: message,
          conversationHistory: JSON.stringify(messages),
          lens
        }));
      } else {
        throw new Error('WebSocket not connected');
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "sorry, something went wrong. please try again in a moment." 
      }]);
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    setIsLoading(false);
  };

  // Clear session on logout
  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    logout();
  };

  const value = {
    messages,
    isLoading,
    isConnected,
    isAuthenticated,
    userId,
    lens,
    setLens,
    setIsAuthenticated,
    sendMessage,
    clearHistory,
    logout: handleLogout
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