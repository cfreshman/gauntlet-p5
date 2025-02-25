import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import './styles/app.css';

const STORAGE_KEY = 'music-aipi-chat-history';

const App = () => {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState(() => {
    // Load messages from localStorage on initial render
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const socketRef = useRef(null);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    console.log('saved messages to localStorage, count:', messages.length);
  }, [messages]);

  useEffect(() => {
    console.log('initializing socket connection...');
    socketRef.current = io();
    
    socketRef.current.on('connect', () => {
      setConnected(true);
      console.log('socket connected, id:', socketRef.current.id);
    });
    
    socketRef.current.on('disconnect', () => {
      setConnected(false);
      console.log('socket disconnected');
    });
    
    socketRef.current.on('message', (message) => {
      console.log('received message from server:', message);
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
      setIsLoading(false);
    });
    
    socketRef.current.on('debug-log', (debugInfo) => {
      // Log the raw debug object to the browser console
      console.log('MUSIC_AIPI_DEBUG:', debugInfo);
    });
    
    socketRef.current.on('connect_error', (error) => {
      console.error('socket connection error:', error);
    });
    
    socketRef.current.on('error', (error) => {
      console.error('socket error:', error);
    });
    
    // Add global debug function to window object
    window.debugMusicAipi = {
      showTools: async () => {
        try {
          console.log('Fetching tool descriptions...');
          const response = await fetch('/api/tool-descriptions');
          const data = await response.json();
          
          // Log the formatted tool descriptions
          console.log('TOOL_DESCRIPTIONS:');
          console.log(data.toolsDescription);
          
          // Format and log detailed tool parameters
          console.log('DETAILED_TOOL_PARAMETERS:');
          
          // Process each layer
          ['layer1', 'layer2', 'layer3'].forEach(layer => {
            if (data.rawTools[layer] && data.rawTools[layer].length > 0) {
              console.group(`${layer.toUpperCase()} TOOLS:`);
              
              // Process each tool in the layer
              data.rawTools[layer].forEach(tool => {
                console.group(`${tool.name}: ${tool.description}`);
                
                // Log the raw tool object to see its structure
                console.log('Raw tool object:', tool);
                
                // Try different ways to access schema information
                if (tool._schema) {
                  console.log('Tool has _schema property');
                  console.log('Schema:', tool._schema);
                }
                
                if (tool.schema) {
                  console.log('Tool has schema property');
                  console.log('Schema:', tool.schema);
                }
                
                // Try to find parameters in various locations
                let params = null;
                
                if (tool._schema && tool._schema.arguments && tool._schema.arguments.shape) {
                  params = tool._schema.arguments.shape;
                } else if (tool.schema && tool.schema.arguments && tool.schema.arguments.shape) {
                  params = tool.schema.arguments.shape;
                } else if (tool.arguments) {
                  params = tool.arguments;
                }
                
                if (params) {
                  console.log('Parameters found:');
                  Object.keys(params).forEach(paramName => {
                    const param = params[paramName];
                    console.log(`  - ${paramName}: ${JSON.stringify(param)}`);
                  });
                } else {
                  console.log('No parameters found in expected locations');
                }
                
                console.groupEnd();
              });
              
              console.groupEnd();
            }
          });
          
          return data;
        } catch (error) {
          console.error('Error fetching tool descriptions:', error);
          return null;
        }
      },
      findTool: (toolName) => {
        console.log(`Searching for tool: ${toolName}`);
        fetch('/api/tool-descriptions')
          .then(response => response.json())
          .then(data => {
            let found = false;
            
            ['layer1', 'layer2', 'layer3'].forEach(layer => {
              if (data.enhancedTools[layer]) {
                const tool = data.enhancedTools[layer].find(t => t.name === toolName);
                if (tool) {
                  found = true;
                  console.group(`FOUND TOOL: ${tool.name} (${layer})`);
                  console.log('Description:', tool.description);
                  
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
                  
                  // Log the raw tool data
                  console.log('Raw tool data:', tool.rawTool);
                  
                  console.groupEnd();
                }
              }
            });
            
            if (!found) {
              console.log(`Tool "${toolName}" not found in any layer`);
            }
          })
          .catch(error => {
            console.error('Error searching for tool:', error);
          });
      }
    };
    
    console.log('Debug functions added to window.debugMusicAipi');
    console.log('Available commands:');
    console.log('  window.debugMusicAipi.showTools() - Show all tools and their parameters');
    console.log('  window.debugMusicAipi.findTool("tool-name") - Find a specific tool by name');
    
    return () => {
      console.log('cleaning up socket connection');
      socketRef.current.disconnect();
      
      // Clean up global debug function
      delete window.debugMusicAipi;
    };
  }, []);
  
  const sendMessage = (message) => {
    if (message.trim() === '') return;
    
    console.log('sending message to server:', message);
    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    socketRef.current.emit('message', message);
  };
  
  const clearHistory = () => {
    console.log('clearing chat history');
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };
  
  const toggleDebug = () => {
    const newState = !showDebug;
    console.log('toggling debug mode:', newState ? 'enabled' : 'disabled');
    setShowDebug(newState);
  };
  
  return (
    <div className="app">
      <Header 
        connected={connected} 
        showDebug={showDebug}
        toggleDebug={toggleDebug}
        clearHistory={clearHistory}
        messageCount={messages.length}
      />
      <main className="main-content">
        <ChatInterface 
          messages={messages} 
          sendMessage={sendMessage} 
          isLoading={isLoading}
        />
      </main>
    </div>
  );
};

export default App; 