import React, { useState, useEffect } from 'react';
import '../styles/spotify-auth-screen.css';

const AUTH_STORAGE_KEY = 'music-aipi-auth';

const SpotifyAuthScreen = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Check authentication status on component mount
  useEffect(() => {
    // Check for error in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    const authSuccess = urlParams.get('auth') === 'success';
    
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setLoading(false);
    } else if (authSuccess) {
      // Store auth data in localStorage
      const authData = {
        userId: urlParams.get('userId'),
        accessToken: urlParams.get('accessToken'),
        refreshToken: urlParams.get('refreshToken'),
        expirationTime: parseInt(urlParams.get('expirationTime'))
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
      
      // Clear URL parameters
      window.history.replaceState({}, document.title, '/');
      
      // Notify parent of successful login
      if (onLoginSuccess) {
        onLoginSuccess({ authenticated: true, userId: authData.userId });
      }
      setLoading(false);
    } else {
      checkAuthStatus();
    }
  }, [onLoginSuccess]);
  
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
    window.location.href = '/auth/spotify';
  };
  
  if (loading) {
    return (
      <div className="spotify-auth-screen">
        <div className="auth-content">
          <h1>music-AIPI</h1>
          <div className="loading-message">checking spotify connection...</div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="spotify-auth-screen">
        <div className="auth-content">
          <h1>music-AIPI</h1>
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
        <h1>music-AIPI</h1>
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