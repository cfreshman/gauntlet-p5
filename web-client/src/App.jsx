import React from 'react';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import PlaybackControls from './components/PlaybackControls';
import SpotifyAuthScreen from './components/SpotifyAuthScreen';
import { AppProvider, useApp } from './contexts/AppContext';
import { PlaybackProvider } from './contexts/PlaybackContext';
import './styles/app.css';

const AppContent = () => {
  const { isAuthenticated, setIsAuthenticated } = useApp();

  if (!isAuthenticated) {
    return <SpotifyAuthScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="app">
      <div className="main-content">
        <Header />
        <PlaybackControls />
        <div className="chat-container">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <AppProvider>
      <PlaybackProvider>
        <AppContent />
      </PlaybackProvider>
    </AppProvider>
  );
};

export default App; 