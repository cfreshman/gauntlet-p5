import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { X, SignOut, Binoculars } from 'phosphor-react';
import '../styles/header.css';
import LensEditor from './LensEditor';

const Header = () => {
  const { messages, clearHistory, isConnected, logout } = useApp();
  const [isLensEditorOpen, setIsLensEditorOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleClearClick = (e) => {
    e.preventDefault();
    clearHistory();
    setIsMenuOpen(false);
  };

  const handleLensClick = () => {
    setIsLensEditorOpen(true);
    setIsMenuOpen(false);
  };

  const handleLogoutClick = () => {
    logout();
    setIsMenuOpen(false);
  };

  return (
    <>
      <div className="header-wrapper">
        <header className="header">
          <div className="header-content">
            <h1 className="title">music-AIPI</h1>
            <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
              <span className="status-dot" />
              <span className="status-text">{isConnected ? 'connected' : 'connecting...'}</span>
            </div>
          </div>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="menu-button">
            menu
          </button>
          <div className={`header-controls ${isMenuOpen ? 'open' : ''}`}>
            <button onClick={handleLensClick} className="header-button">
              <Binoculars size={10} weight="bold" />
              <span>lens</span>
            </button>
            {messages.length > 0 && (
              <button onClick={handleClearClick} className="header-button">
                <X size={10} weight="bold" />
                <span>clear</span>
              </button>
            )}
            <button onClick={handleLogoutClick} className="header-button">
              <SignOut size={10} weight="bold" />
              <span>logout</span>
            </button>
          </div>
        </header>
      </div>
      <LensEditor isOpen={isLensEditorOpen} onClose={() => setIsLensEditorOpen(false)} />
    </>
  );
};

export default Header; 