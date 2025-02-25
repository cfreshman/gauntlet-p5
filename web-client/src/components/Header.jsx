import React from 'react';
import '../styles/header.css';

const Header = ({ connected }) => {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="title">music-aipi</h1>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'connected' : 'disconnected'}
        </div>
      </div>
    </header>
  );
};

export default Header; 