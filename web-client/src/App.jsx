import React, { useRef } from 'react';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import PlaybackControls from './components/PlaybackControls';
import SpotifyAuthScreen from './components/SpotifyAuthScreen';
import { AppProvider, useApp } from './contexts/AppContext';
import { PlaybackProvider, usePlayback } from './contexts/PlaybackContext';
import './styles/app.css';

const AppContent = () => {
  const { messages, isLoading, isAuthenticated, sendMessage, clearHistory, setIsAuthenticated, socketRef } = useApp();
  const { playbackState, playerExpanded } = usePlayback();
  const appRef = useRef(null);

  // Update background when playback state changes
  React.useEffect(() => {
    if (appRef.current && playbackState?.item?.album?.images?.[0]?.url) {
      appRef.current.style.setProperty('--album-art', `url(${playbackState.item.album.images[0].url})`);
      appRef.current.classList.add('has-background');
    } else if (appRef.current) {
      appRef.current.style.removeProperty('--album-art');
      appRef.current.classList.remove('has-background');
    }
  }, [playbackState?.item?.album?.images?.[0]?.url]);

  if (!isAuthenticated) {
    return <SpotifyAuthScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="app" ref={appRef} style={{ '--album-art': 'none' }}>
      <Header />
      <main className="main-content">
        <ChatInterface />
      </main>
      <footer className="app-footer">
        {playbackState && <PlaybackControls />}
      </footer>
    </div>
  );
};

const AppWithProviders = () => {
  const { socketRef } = useApp();
  return (
    <PlaybackProvider socket={socketRef?.current}>
      <AppContent />
    </PlaybackProvider>
  );
};

const App = () => {
  return (
    <AppProvider>
      <AppWithProviders />
    </AppProvider>
  );
};

export default App; 