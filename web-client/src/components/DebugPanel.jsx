import React, { useEffect, useState } from 'react';
import '../styles/debug-panel.css';

const DebugPanel = ({ debugInfo }) => {
  const [toolsData, setToolsData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Log when debug info changes
  useEffect(() => {
    console.log('DebugPanel - Debug info updated:', debugInfo);
  }, [debugInfo]);

  // Log when component mounts/unmounts
  useEffect(() => {
    console.log('DebugPanel mounted');
    
    // Fetch tools data when component mounts
    fetchToolsData();
    fetchConnectionStatus();
    
    return () => {
      console.log('DebugPanel unmounted');
    };
  }, []);
  
  // Fetch tools data from the API
  const fetchToolsData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tools');
      const data = await response.json();
      setToolsData(data);
      console.log('Tools data fetched:', data);
    } catch (error) {
      console.error('Error fetching tools data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch connection status from the API
  const fetchConnectionStatus = async () => {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      setConnectionStatus(data);
      console.log('Connection status fetched:', data);
    } catch (error) {
      console.error('Error fetching connection status:', error);
    }
  };
  
  // Format connection status for display
  const formatConnectionStatus = () => {
    if (!connectionStatus) return 'unknown';
    
    const { connections } = connectionStatus;
    const connectedLayers = Object.entries(connections)
      .filter(([_, isConnected]) => isConnected)
      .map(([layer, _]) => layer);
    
    if (connectedLayers.length === 0) return 'no connections';
    return connectedLayers.join(', ');
  };
  
  // Count total tools
  const countTools = () => {
    if (!toolsData) return 0;
    
    return Object.values(toolsData).reduce((total, layerTools) => {
      return total + layerTools.length;
    }, 0);
  };

  return (
    <div className="debug-panel">
      <h2 className="debug-title">debug info</h2>
      
      <div className="debug-section">
        <h3 className="debug-section-title">mcp status:</h3>
        <div className="debug-content">
          <p>connected layers: {formatConnectionStatus()}</p>
          <p>available tools: {loading ? 'loading...' : countTools()}</p>
        </div>
      </div>
      
      <div className="debug-section">
        <h3 className="debug-section-title">tool call:</h3>
        <div className="debug-content">
          <p>{debugInfo.toolCall || 'no tool call detected'}</p>
          <p className="tool-result-status">
            tool result: <span className={debugInfo.toolResult === 'Available' ? 'available' : 'unavailable'}>
              {debugInfo.toolResult || 'none'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default DebugPanel; 