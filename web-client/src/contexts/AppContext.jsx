import React, { createContext, useContext, useState, useEffect } from 'react';

const STORAGE_KEY = 'music-aipi-chat-history';
const AUTH_STORAGE_KEY = 'music-aipi-auth';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState(null);

  // Check auth on mount and URL params
  useEffect(() => {
    const checkAuth = () => {
      const auth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (auth) {
        const { userId, accessToken, refreshToken, expirationTime } = JSON.parse(auth);
        if (Date.now() < expirationTime) {
          setIsAuthenticated(true);
          setUserId(userId);
          return;
        }
      }

      // Check URL params for new auth
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') === 'success') {
        const newAuth = {
          userId: params.get('userId'),
          accessToken: params.get('accessToken'),
          refreshToken: params.get('refreshToken'),
          expirationTime: parseInt(params.get('expirationTime'))
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newAuth));
        setIsAuthenticated(true);
        setUserId(newAuth.userId);
        
        // Clean URL
        window.history.replaceState({}, document.title, '/');
      }
    };

    checkAuth();
  }, []);

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
      const auth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!auth) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "please log in with spotify first" 
        }]);
        return;
      }

      const { userId, accessToken, refreshToken, expirationTime } = JSON.parse(auth);
      const authHeader = `Bearer ${userId}:${accessToken}:${refreshToken}:${expirationTime}`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          query: message,
          conversationHistory: JSON.stringify(messages),
          responseFormat: 'concise'
        })
      });

      const data = await response.json();
      
      if (data.isError) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content[0].text }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "sorry, something went wrong. please try again in a moment." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    setIsLoading(false);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
    setUserId(null);
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