import React, { useEffect } from 'react';
import '../styles/header.css';

const Header = ({ connected, showDebug, toggleDebug, clearHistory, messageCount = 0 }) => {
  // Log when connection status changes
  useEffect(() => {
    console.log('Header - Connection status changed:', connected ? 'connected' : 'disconnected');
  }, [connected]);
  
  // Log when debug visibility changes
  useEffect(() => {
    console.log('Header - Debug visibility changed:', showDebug ? 'visible' : 'hidden');
  }, [showDebug]);
  
  // Log when component mounts
  useEffect(() => {
    console.log('Header mounted');
    return () => {
      console.log('Header unmounted');
    };
  }, []);
  
  const handleDebugToggle = () => {
    console.log('Debug toggle button clicked, current state:', showDebug);
    toggleDebug();
  };
  
  const handleClearHistory = () => {
    console.log('Clear history button clicked');
    clearHistory();
  };
  
  const handleShowTools = async () => {
    console.log('Show tools button clicked');
    try {
      const response = await fetch('/api/tool-descriptions');
      const data = await response.json();
      
      // Log the formatted tool descriptions
      console.log('TOOL_DESCRIPTIONS:');
      console.log(data.toolsDescription);
      
      // Format and log detailed tool parameters using enhanced data
      console.log('ENHANCED_TOOL_PARAMETERS:');
      
      // Process each layer
      ['layer1', 'layer2', 'layer3'].forEach(layer => {
        if (data.enhancedTools[layer] && data.enhancedTools[layer].length > 0) {
          console.group(`${layer.toUpperCase()} TOOLS:`);
          
          // Process each tool in the layer
          data.enhancedTools[layer].forEach(tool => {
            console.group(`${tool.name}: ${tool.description}`);
            
            // Log parameter details
            if (tool.paramDetails && tool.paramDetails.source) {
              console.log(`Parameters found in: ${tool.paramDetails.source}`);
              
              if (tool.paramDetails.params) {
                console.group('Parameters:');
                
                try {
                  if (typeof tool.paramDetails.params === 'object') {
                    Object.keys(tool.paramDetails.params).forEach(paramName => {
                      const param = tool.paramDetails.params[paramName];
                      console.log(`  - ${paramName}: ${JSON.stringify(param)}`);
                    });
                  } else {
                    console.log('Parameters not in expected format:', tool.paramDetails.params);
                  }
                } catch (err) {
                  console.error('Error processing parameters:', err);
                }
                
                console.groupEnd();
              }
            } else {
              console.log('No parameter details found');
            }
            
            console.groupEnd();
          });
          
          console.groupEnd();
        }
      });
      
      // Also log the raw tools data for reference
      console.log('RAW_TOOLS_DATA:');
      console.log(data.rawTools);
      
      // Log the enhanced tools data
      console.log('ENHANCED_TOOLS_DATA:');
      console.log(data.enhancedTools);
    } catch (error) {
      console.error('Error fetching tool descriptions:', error);
    }
  };
  
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="title">music-aipi</h1>
        <div className="header-controls">
          <button 
            className="show-tools" 
            onClick={handleShowTools}
          >
            show tools
          </button>
          {messageCount > 0 && (
            <button 
              className="clear-history" 
              onClick={handleClearHistory}
            >
              clear history ({messageCount})
            </button>
          )}
          <button 
            className={`debug-toggle ${showDebug ? 'active' : ''}`} 
            onClick={handleDebugToggle}
          >
            debug
          </button>
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'connected' : 'disconnected'}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 