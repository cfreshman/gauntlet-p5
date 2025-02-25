import React, { useEffect } from 'react';
import '../styles/header.css';

const Header = ({ clearHistory, messageCount = 0 }) => {
  // Log when component mounts
  useEffect(() => {
    console.log('Header mounted');
    return () => {
      console.log('Header unmounted');
    };
  }, []);
  
  const handleClearHistory = () => {
    console.log('Clear history button clicked');
    clearHistory();
  };
  
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="title">music-aipi</h1>
        <div className="header-controls">
          {messageCount > 0 && (
            <button 
              className="clear-history" 
              onClick={handleClearHistory}
            >
              clear history ({messageCount})
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header; 