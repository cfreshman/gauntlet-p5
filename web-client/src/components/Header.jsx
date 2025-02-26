import React from 'react';
import { useApp } from '../contexts/AppContext';
import { X, SignOut } from 'phosphor-react';
import '../styles/header.css';

const Header = () => {
  const { messages, clearHistory, isConnected, logout } = useApp();

  const handleClearClick = (e) => {
    e.preventDefault();
    clearHistory();
  };

  return (
    <div className="header-wrapper">
      <header className="header">
        <div className="header-content">
          <h1 className="title">music-AIPI</h1>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot" />
            <span className="status-text">{isConnected ? 'connected' : 'connecting...'}</span>
          </div>
        </div>
        <div className="header-controls">
          {messages.length > 0 && (
            <button onClick={handleClearClick} className="header-button">
              <X size={10} weight="bold" />
              <span>clear</span>
            </button>
          )}
          <button onClick={logout} className="header-button">
            <SignOut size={10} weight="bold" />
            <span>logout</span>
          </button>
        </div>
      </header>
    </div>
  );
};

export default Header; 