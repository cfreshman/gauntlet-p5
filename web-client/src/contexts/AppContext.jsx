import React, { createContext, useContext, useState, useEffect } from 'react';

const STORAGE_KEY = 'music-aipi-chat-history';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/status', {
          credentials: 'include'
        });
        const data = await response.json();
        setIsAuthenticated(data.authenticated);
      } catch (error) {
        console.error('Error checking auth status:', error);
      }
    };

    checkAuthStatus();
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
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

  const value = {
    messages,
    isLoading,
    isAuthenticated,
    setIsAuthenticated,
    sendMessage,
    clearHistory
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