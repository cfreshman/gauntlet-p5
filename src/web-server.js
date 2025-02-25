const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { processUserMessage, getDebugInfo } = require('./chat/message-processor');
const mcpClient = require('./utils/mcp-client');
const logger = require('./utils/logger');
const toolFormatter = require('./utils/tool-formatter');

// create express app
const app = express();
app.use(cors());
app.use(express.json());

// serve static files from web-client/dist if they exist
app.use(express.static(path.join(__dirname, '../web-client/dist')));

// create http server and socket.io instance
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Track active connections
let activeConnections = 0;

// socket.io connection handling
io.on('connection', (socket) => {
  activeConnections++;
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);
  console.log(`Active connections: ${activeConnections}`);
  
  socket.on('message', async (message) => {
    console.log(`[${new Date().toISOString()}] Message from ${socket.id}: "${message}"`);
    
    try {
      console.log(`Processing message from ${socket.id}...`);
      // process the message using the existing chat processor
      const response = await processUserMessage(message);
      
      // Get debug info
      const debugInfo = getDebugInfo();
      
      // Send the response
      console.log(`Sending response to ${socket.id}, length: ${response.length} characters`);
      socket.emit('message', response);
      
      // Send debug info for browser console logging
      socket.emit('debug-log', {
        query: message,
        toolCall: debugInfo.lastToolCall,
        toolResult: debugInfo.lastToolResult,
        timestamp: new Date().toISOString(),
        details: {
          toolName: debugInfo.lastToolCall ? debugInfo.lastToolCall.split(' with args:')[0] : null,
          fullToolResult: debugInfo.lastToolResult,
          mcpStatus: mcpClient.getConnectionStatus(),
          toolsCount: {
            layer1: mcpClient.tools.layer1?.length || 0,
            layer2: mcpClient.tools.layer2?.length || 0,
            layer3: mcpClient.tools.layer3?.length || 0
          }
        },
        // Include the call tree if available
        callTree: global.lastCallTree || null,
        // Include tool descriptions for debugging
        toolDescriptions: global.lastToolDescriptions || null
      });
      
      console.log(`Completed request for ${socket.id}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error processing message for ${socket.id}:`, error);
      socket.emit('message', 'sorry, there was an error processing your request.');
      
      // Send error info for browser console logging
      socket.emit('debug-log', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  socket.on('disconnect', () => {
    activeConnections--;
    console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
    console.log(`Active connections: ${activeConnections}`);
  });
  
  // Log errors
  socket.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Socket error for ${socket.id}:`, error);
  });
});

// Add endpoint to get available tools
app.get('/api/tools', async (req, res) => {
  try {
    // Initialize MCP client if not already initialized
    if (!mcpClient.initialized) {
      await mcpClient.initialize();
    }
    
    const tools = mcpClient.getAllTools();
    res.json(tools);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching tools:`, error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// Add endpoint to get tool descriptions for debugging
app.get('/api/tool-descriptions', async (req, res) => {
  try {
    // Initialize MCP client if not already initialized
    if (!mcpClient.initialized) {
      await mcpClient.initialize();
    }
    
    const allTools = mcpClient.getAllTools();
    
    // Format tools as JSON for LLM prompting
    const toolsDescription = toolFormatter.formatAllToolsForLLM(allTools, {
      header: "Available tools:\n"
    });
    
    // Create simplified tool representations
    const simplifiedTools = {};
    
    // Process each layer
    ['layer1', 'layer2', 'layer3'].forEach(layer => {
      if (allTools[layer] && allTools[layer].length > 0) {
        simplifiedTools[layer] = allTools[layer].map(tool => toolFormatter.simplifyToolForLLM(tool));
      }
    });
    
    // Store in global scope for debug logs
    global.lastToolDescriptions = toolsDescription;
    
    res.json({
      toolsDescription,
      rawTools: allTools,
      simplifiedTools
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error generating tool descriptions:`, error);
    res.status(500).json({ error: 'Failed to generate tool descriptions' });
  }
});

// Add endpoint to get connection status
app.get('/api/status', (req, res) => {
  const status = {
    connections: mcpClient.getConnectionStatus(),
    activeWebClients: activeConnections
  };
  res.json(status);
});

// Log all HTTP requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web-client/dist/index.html'));
});

// Initialize MCP client before starting server
async function startServer() {
  try {
    // Initialize MCP client
    console.log(`[${new Date().toISOString()}] Initializing MCP client...`);
    await mcpClient.initialize();
    console.log(`[${new Date().toISOString()}] MCP client initialized`);
    
    // Log connection status
    const status = mcpClient.getConnectionStatus();
    console.log(`[${new Date().toISOString()}] MCP connection status:`, status);
    
    // start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] Web server running on port ${PORT}`);
      console.log(`[${new Date().toISOString()}] API endpoints:`);
      console.log(`  - GET /api/tools - List all available tools`);
      console.log(`  - GET /api/status - Get connection status`);
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error starting server:`, error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Log server errors
server.on('error', (error) => {
  console.error(`[${new Date().toISOString()}] Server error:`, error);
});

module.exports = { app, server, io }; 