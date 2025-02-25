import React, { useState, useEffect } from 'react';
import '../styles/spotify-login.css';

const SpotifyLogin = ({ onLoginSuccess }) => {
  const [authStatus, setAuthStatus] = useState({
    authenticated: false,
    loading: true,
    error: null
  });
  
  // Check authentication status on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);
  
  // Function to check authentication status
  const checkAuthStatus = async () => {
    try {
      setAuthStatus(prev => ({ ...prev, loading: true }));
      
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      setAuthStatus({
        authenticated: data.authenticated,
        userId: data.userId,
        loading: false,
        error: null
      });
      
      if (data.authenticated && onLoginSuccess) {
        onLoginSuccess(data);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setAuthStatus({
        authenticated: false,
        loading: false,
        error: 'Failed to check authentication status'
      });
    }
  };
  
  // Function to handle login
  const handleLogin = () => {
    window.location.href = '/auth/spotify';
  };
  
  // Function to handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        credentials: 'include'
      });
      
      setAuthStatus({
        authenticated: false,
        loading: false,
        error: null
      });
      
      // Reload the page to clear any state
      window.location.reload();
    } catch (error) {
      console.error('Error logging out:', error);
      setAuthStatus(prev => ({
        ...prev,
        error: 'Failed to log out'
      }));
    }
  };
  
  if (authStatus.loading) {
    return (
      <div className="spotify-login loading">
        checking spotify login status...
      </div>
    );
  }
  
  if (authStatus.authenticated) {
    return (
      <div className="spotify-login authenticated">
        <span className="status-text">connected to spotify</span>
        <button className="logout-button" onClick={handleLogout}>
          disconnect
        </button>
      </div>
    );
  }
  
  return (
    <div className="spotify-login">
      <button className="login-button" onClick={handleLogin}>
        connect to spotify
      </button>
      {authStatus.error && (
        <div className="error-message">
          {authStatus.error}
        </div>
      )}
    </div>
  );
};

export default SpotifyLogin; 