import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import './styles/app.css';

const App = () => {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io();
    
    socketRef.current.on('connect', () => {
      setConnected(true);
      console.log('connected to server');
    });
    
    socketRef.current.on('disconnect', () => {
      setConnected(false);
      console.log('disconnected from server');
    });
    
    socketRef.current.on('message', (message) => {
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
      setIsLoading(false);
    });
    
    return () => {
      socketRef.current.disconnect();
    };
  }, []);
  
  const sendMessage = (message) => {
    if (message.trim() === '') return;
    
    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    socketRef.current.emit('message', message);
  };
  
  return (
    <div className="app">
      <Header connected={connected} />
      <main className="main-content">
        <ChatInterface 
          messages={messages} 
          sendMessage={sendMessage} 
          isLoading={isLoading}
        />
      </main>
    </div>
  );
};

export default App; 