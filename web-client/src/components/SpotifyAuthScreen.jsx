import React, { useState, useEffect } from 'react';
import '../styles/spotify-auth-screen.css';

const SpotifyAuthScreen = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Check authentication status on component mount
  useEffect(() => {
    // Check for error in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setLoading(false);
    } else {
      checkAuthStatus();
    }
  }, []);
  
  // Function to check authentication status
  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.authenticated && onLoginSuccess) {
        onLoginSuccess(data);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setError('failed to check authentication status');
      setLoading(false);
    }
  };
  
  // Function to handle login
  const handleLogin = () => {
    // Get the current origin to determine if we're on the dev server or production
    const currentOrigin = window.location.origin;
    
    // If we're on the dev server (port 3004), we need to use the backend server URL directly
    if (currentOrigin.includes('3004')) {
      window.location.href = 'http://localhost:3000/auth/spotify';
    } else {
      // Otherwise, use the relative path which will be correctly proxied
      window.location.href = '/auth/spotify';
    }
  };
  
  if (loading) {
    return (
      <div className="spotify-auth-screen">
        <div className="auth-content">
          <h1>music-aipi</h1>
          <div className="loading-message">checking spotify connection...</div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="spotify-auth-screen">
        <div className="auth-content">
          <h1>music-aipi</h1>
          <div className="error-message">{error}</div>
          <button className="login-button" onClick={handleLogin}>
            try again
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="spotify-auth-screen">
      <div className="auth-content">
        <h1>music-aipi</h1>
        <p className="auth-description">
          connect to spotify to discover, save, and play music
        </p>
        <button className="login-button" onClick={handleLogin}>
          connect to spotify
        </button>
      </div>
    </div>
  );
};

export default SpotifyAuthScreen;