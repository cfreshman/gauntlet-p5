import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSpotifyApi } from '../hooks/useSpotifyApi';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'music-aipi-chat-history';
const AUTH_STORAGE_KEY = 'music-aipi-auth';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, setIsAuthenticated, api, logout } = useSpotifyApi();
  const [userId, setUserId] = useState(null);
  const wsRef = useRef(null);
  const sessionIdRef = useRef(null);

  // Initialize WebSocket connection
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const auth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!auth) return;

    // Parse auth JSON and format as string
    const { userId, accessToken, refreshToken, expirationTime } = JSON.parse(auth);
    const authString = `${userId}:${accessToken}:${refreshToken}:${expirationTime}`;

    // Generate session ID if needed
    if (!sessionIdRef.current) {
      sessionIdRef.current = uuidv4();
    }

    const wsUrl = `ws://localhost:3000/chat?auth=${encodeURIComponent(authString)}&sessionId=${sessionIdRef.current}`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connection opened');
    };

    wsRef.current.onmessage = (event) => {
      console.log('Raw WebSocket message received:', event.data);
      const data = JSON.parse(event.data);
      console.log('Parsed WebSocket message:', data);
      console.log('Message type:', data.type);

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
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'connection error. please try again.'
        }],
        isError: true
      }]);
      setIsLoading(false);
    };
  };

  // Save messages to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

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

      // Ensure WebSocket is connected
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        // Wait for connection
        await new Promise((resolve) => {
          const checkConnection = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              clearInterval(checkConnection);
              resolve();
            }
          }, 100);
        });
      }

      // Send message through WebSocket
      wsRef.current.send(JSON.stringify({
        query: message,
        conversationHistory: JSON.stringify(messages)
      }));

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

  const value = {
    messages,
    isLoading,
    isAuthenticated,
    userId,
    setIsAuthenticated,
    sendMessage,
    clearHistory,
    logout
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