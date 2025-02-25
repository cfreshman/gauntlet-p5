import React, { useRef } from 'react';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import PlaybackControls from './components/PlaybackControls';
import SpotifyAuthScreen from './components/SpotifyAuthScreen';
import { AppProvider, useApp } from './contexts/AppContext';
import { PlaybackProvider, usePlayback } from './contexts/PlaybackContext';
import './styles/app.css';

const AppContent = () => {
  const { isAuthenticated, setIsAuthenticated } = useApp();
  const { playbackState } = usePlayback();
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
    <div className="app" ref={appRef}>
      <Header />
      <main className="main-content">
        <ChatInterface />
      </main>
      <PlaybackControls />
    </div>
  );
};

const AppWithProviders = () => {
  const { socketRef } = useApp();

  // Add debug logging for socket initialization
  console.log('[App] Initializing PlaybackProvider with socket:', {
    hasSocket: !!socketRef?.current,
    socketId: socketRef?.current?.id,
    isConnected: socketRef?.current?.connected,
    timestamp: new Date().toISOString()
  });

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