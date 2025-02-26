import React from 'react';
import { Trash } from 'phosphor-react';
import { useApp } from '../contexts/AppContext';
import '../styles/header.css';

const Header = () => {
  const { messages, clearHistory } = useApp();

  const handleClearClick = (e) => {
    e.preventDefault();
    clearHistory();
  };

  return (
    <header className="header">
      <div className="header-content">
        <h1 className="title">music-AIPI</h1>
      </div>
      {messages.length > 0 && (
        <button onClick={handleClearClick} className="clear-button">
          <Trash size={16} weight="bold" />
        </button>
      )}
    </header>
  );
};

export default Header; 