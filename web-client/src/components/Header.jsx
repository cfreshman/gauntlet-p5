import React from 'react';
import { useApp } from '../contexts/AppContext';
import '../styles/header.css';

const Header = () => {
  const { messages, clearHistory, isConnected } = useApp();

  const handleClearClick = (e) => {
    e.preventDefault();
    clearHistory();
  };

  return (
    <div className="header-wrapper">
      <header className="header">
        <div className="header-content">
          <h1 className="title">music-AIPI</h1>
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
            <span className="status-text">{isConnected ? 'connected' : 'connecting...'}</span>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClearClick} className="reset-button">
            reset
          </button>
        )}
      </header>
    </div>
  );
};

export default Header; 