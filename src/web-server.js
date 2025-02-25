const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { processUserMessage, getDebugInfo } = require('./chat/message-processor');
const mcpClient = require('./utils/mcp-client');
const logger = require('./utils/logger');
const toolFormatter = require('./utils/tool-formatter');
const spotifyClient = require('./utils/spotifyClient');
const session = require('express-session');

// create express app
const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3004'],
  credentials: true
}));
app.use(express.json());

// Set up session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'music-aipi-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
});

// Store the session middleware for access to the session store
app.use(sessionMiddleware);
app.set('sessionStore', sessionMiddleware.store);

// serve static files from web-client/dist if they exist
app.use(express.static(path.join(__dirname, '../web-client/dist')));

// create http server and socket.io instance
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3004'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Use the session middleware with socket.io
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Track active connections
let activeConnections = 0;

// Store socket connections by session ID
const socketsBySession = {};

// Spotify authentication routes
app.get('/auth/spotify', (req, res) => {
  try {
    // Generate a random state string for security
    const state = spotifyClient.generateRandomString(16);
    
    // Store the state in the session
    req.session.spotifyAuthState = state;
    
    // Get the authorization URL
    const authUrl = spotifyClient.getAuthorizationUrl(state);
    
    // Redirect to Spotify authorization page
    res.redirect(authUrl);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error initiating Spotify auth:`, error);
    res.status(500).json({ error: 'Failed to initiate Spotify authentication' });
  }
});

app.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    // Check if there was an error
    if (error) {
      console.error(`[${new Date().toISOString()}] Spotify auth error:`, error);
      return res.redirect('/?error=' + encodeURIComponent(error));
    }
    
    // Check if the state matches
    if (!req.session.spotifyAuthState || state !== req.session.spotifyAuthState) {
      console.error(`[${new Date().toISOString()}] State mismatch in Spotify auth`);
      return res.redirect('/?error=state_mismatch');
    }
    
    // Exchange the code for tokens
    const tokens = await spotifyClient.exchangeCodeForTokens(code);
    console.log(`[${new Date().toISOString()}] Tokens received:`, { 
      accessTokenLength: tokens.accessToken.length,
      hasRefreshToken: !!tokens.refreshToken,
      expirationTime: new Date(tokens.expirationTime).toISOString()
    });
    
    // Create a temporary user ID to store the tokens
    const tempUserId = 'temp-' + Date.now();
    
    // Store the tokens in the spotifyClient
    spotifyClient.storeUserTokens(tempUserId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expirationTime: tokens.expirationTime
    });
    
    // Get user profile to get the user ID
    const userProfile = await spotifyClient.getCurrentUserProfile(tempUserId);
    const userId = userProfile.id;
    
    // Update the tokens with the real user ID
    spotifyClient.storeUserTokens(userId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expirationTime: tokens.expirationTime
    });
    
    // Remove the temporary user tokens
    spotifyClient.storeUserTokens(tempUserId, null);
    
    // Store the tokens in the session
    req.session.spotifyTokens = tokens;
    req.session.spotifyUserId = userId;
    
    // Notify the socket if it exists
    const socketId = socketsBySession[req.sessionID];
    if (socketId) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('auth-success', {
          userId,
          displayName: userProfile.display_name,
          profileUrl: userProfile.external_urls?.spotify
        });
      }
    }
    
    // Check if the request came from the dev server
    const referer = req.get('Referer') || '';
    if (referer.includes('3004')) {
      // Redirect back to the dev server
      return res.redirect('http://localhost:3004/?auth=success');
    }
    
    // Redirect back to the app
    res.redirect('/?auth=success');
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in Spotify callback:`, error);
    res.redirect('/?error=' + encodeURIComponent('Failed to authenticate with Spotify'));
  }
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
  if (req.session.spotifyUserId && req.session.spotifyTokens) {
    res.json({
      authenticated: true,
      userId: req.session.spotifyUserId
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// Logout route
app.get('/api/auth/logout', (req, res) => {
  // Clear the session
  req.session.spotifyTokens = null;
  req.session.spotifyUserId = null;
  
  res.json({ success: true });
});

// socket.io connection handling
io.on('connection', (socket) => {
  activeConnections++;
  console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);
  console.log(`Active connections: ${activeConnections}`);
  
  // Store the socket ID with the session ID
  if (socket.request.session.id) {
    socketsBySession[socket.request.session.id] = socket.id;
  }
  
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
  
  // Handle playback control commands
  socket.on('playback-command', async (command) => {
    try {
      const { action, params = {} } = command;
      
      // Get user ID directly from the socket's session
      const session = socket.request.session;
      const userId = session.spotifyUserId;
      
      if (!userId) {
        socket.emit('playback-error', { error: 'Not authenticated with Spotify' });
        return;
      }
      
      let result;
      
      try {
        switch (action) {
          case 'get-playback-state':
            result = await spotifyClient.getPlaybackState(params.market, userId);
            socket.emit('playback-state', result);
            break;
            
          case 'get-devices':
            result = await spotifyClient.getAvailableDevices(userId);
            socket.emit('playback-devices', result);
            break;
            
          case 'play':
            result = await spotifyClient.startResumePlayback(
              params.deviceId, 
              params.contextUri, 
              params.uris, 
              params.offset, 
              params.positionMs, 
              userId
            );
            socket.emit('playback-result', { action, success: true });
            break;
            
          case 'pause':
            result = await spotifyClient.pausePlayback(params.deviceId, userId);
            socket.emit('playback-result', { action, success: true });
            break;
            
          case 'next':
            result = await spotifyClient.skipToNext(params.deviceId, userId);
            socket.emit('playback-result', { action, success: true });
            break;
            
          case 'previous':
            result = await spotifyClient.skipToPrevious(params.deviceId, userId);
            socket.emit('playback-result', { action, success: true });
            break;
            
          case 'seek':
            result = await spotifyClient.seekToPosition(params.positionMs, params.deviceId, userId);
            socket.emit('playback-result', { action, success: true });
            break;
            
          case 'volume':
            result = await spotifyClient.setPlaybackVolume(params.volumePercent, params.deviceId, userId);
            socket.emit('playback-result', { action, success: true });
            break;
            
          case 'transfer':
            result = await spotifyClient.transferPlayback(params.deviceId, params.play, userId);
            socket.emit('playback-result', { action, success: true });
            break;
            
          default:
            socket.emit('playback-error', { error: `Unknown action: ${action}` });
        }
      } catch (actionError) {
        // Handle specific action errors
        console.error(`[${new Date().toISOString()}] Error handling playback action ${action}:`, actionError.message);
        
        // Send the error to the client
        socket.emit('playback-error', { 
          error: actionError.message,
          action
        });
        
        // For certain errors, still refresh the playback state
        if (action !== 'get-playback-state' && action !== 'get-devices') {
          try {
            // Get the updated playback state after an error
            const updatedState = await spotifyClient.getPlaybackState(null, userId);
            socket.emit('playback-state', updatedState);
          } catch (stateError) {
            // Ignore errors when getting the updated state
            console.error(`[${new Date().toISOString()}] Error getting updated playback state:`, stateError.message);
          }
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error handling playback command:`, error);
      socket.emit('playback-error', { error: error.message });
    }
  });
  
  socket.on('disconnect', () => {
    activeConnections--;
    console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id}`);
    console.log(`Active connections: ${activeConnections}`);
    
    // Remove socket from session mapping
    for (const sessionId in socketsBySession) {
      if (socketsBySession[sessionId] === socket.id) {
        delete socketsBySession[sessionId];
        break;
      }
    }
  });
  
  // Log errors
  socket.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Socket error for ${socket.id}:`, error);
  });
});

// Helper function to get session ID from socket
function getSessionIdFromSocket(socket) {
  if (socket.handshake.headers.cookie) {
    const cookies = socket.handshake.headers.cookie.split(';');
    const sessionCookie = cookies.find(cookie => cookie.trim().startsWith('connect.sid='));
    if (sessionCookie) {
      return sessionCookie.split('=')[1].split('.')[0].trim();
    }
  }
  return null;
}

// Helper function to get user ID from session
function getUserIdFromSession(sessionId) {
  if (!sessionId) return null;
  
  // Find the session in the session store
  const sessionKey = `sess:${sessionId}`;
  
  // Access the session store through the app's session middleware
  if (app.get('sessionStore') && app.get('sessionStore').sessions) {
    const sessionData = app.get('sessionStore').sessions[sessionKey];
    
    if (sessionData) {
      try {
        const parsedSession = JSON.parse(sessionData);
        return parsedSession.spotifyUserId || null;
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error parsing session:`, error);
      }
    }
  }
  
  return null;
}

// Playback API endpoints
app.get('/api/playback/state', (req, res) => {
  try {
    if (!req.session.spotifyUserId || !req.session.spotifyTokens) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    spotifyClient.getPlaybackState(null, req.session.spotifyUserId)
      .then(state => {
        res.json(state);
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Error getting playback state:`, error);
        res.status(500).json({ error: 'Failed to get playback state' });
      });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in playback state endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/playback/devices', (req, res) => {
  try {
    if (!req.session.spotifyUserId || !req.session.spotifyTokens) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    spotifyClient.getAvailableDevices(req.session.spotifyUserId)
      .then(devices => {
        res.json(devices);
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Error getting devices:`, error);
        res.status(500).json({ error: 'Failed to get devices' });
      });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in devices endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/playback/play', (req, res) => {
  try {
    if (!req.session.spotifyUserId || !req.session.spotifyTokens) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    const { deviceId, contextUri, uris, offset, positionMs } = req.body || {};
    
    spotifyClient.startResumePlayback(deviceId, contextUri, uris, offset, positionMs, req.session.spotifyUserId)
      .then(() => {
        res.json({ success: true });
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Error starting playback:`, error);
        res.status(500).json({ error: 'Failed to start playback' });
      });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in play endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/playback/pause', (req, res) => {
  try {
    if (!req.session.spotifyUserId || !req.session.spotifyTokens) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    const { deviceId } = req.body || {};
    
    spotifyClient.pausePlayback(deviceId, req.session.spotifyUserId)
      .then(() => {
        res.json({ success: true });
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Error pausing playback:`, error);
        res.status(500).json({ error: 'Failed to pause playback' });
      });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in pause endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/playback/next', (req, res) => {
  try {
    if (!req.session.spotifyUserId || !req.session.spotifyTokens) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    const { deviceId } = req.body || {};
    
    spotifyClient.skipToNext(deviceId, req.session.spotifyUserId)
      .then(() => {
        res.json({ success: true });
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Error skipping to next:`, error);
        res.status(500).json({ error: 'Failed to skip to next track' });
      });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in next endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/playback/previous', (req, res) => {
  try {
    if (!req.session.spotifyUserId || !req.session.spotifyTokens) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    const { deviceId } = req.body || {};
    
    spotifyClient.skipToPrevious(deviceId, req.session.spotifyUserId)
      .then(() => {
        res.json({ success: true });
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Error skipping to previous:`, error);
        res.status(500).json({ error: 'Failed to skip to previous track' });
      });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in previous endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/playback/transfer', (req, res) => {
  try {
    if (!req.session.spotifyUserId || !req.session.spotifyTokens) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    const { deviceId, play } = req.body || {};
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    
    spotifyClient.transferPlayback(deviceId, play, req.session.spotifyUserId)
      .then(() => {
        res.json({ success: true });
      })
      .catch(error => {
        console.error(`[${new Date().toISOString()}] Error transferring playback:`, error);
        res.status(500).json({ error: 'Failed to transfer playback' });
      });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in transfer endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
    // Check Spotify credentials
    await checkSpotifyCredentials();
    
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
      console.log(`  - GET /auth/spotify - Authenticate with Spotify`);
      console.log(`  - GET /api/auth/status - Check authentication status`);
      console.log(`  - GET /api/playback/* - Playback API endpoints`);
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error starting server:`, error);
    process.exit(1);
  }
}

/**
 * Check if Spotify API credentials are valid
 */
async function checkSpotifyCredentials() {
  try {
    console.log(`[${new Date().toISOString()}] Checking Spotify API credentials...`);
    
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Spotify client ID, client secret, or redirect URI not set in environment variables');
    }
    
    console.log(`[${new Date().toISOString()}] Spotify credentials found:`);
    console.log(`  - Client ID: ${clientId.substring(0, 5)}...${clientId.substring(clientId.length - 5)}`);
    console.log(`  - Client Secret: ${clientSecret.substring(0, 3)}...${clientSecret.substring(clientSecret.length - 3)}`);
    console.log(`  - Redirect URI: ${redirectUri}`);
    
    // Try to get a client credentials token
    try {
      await spotifyClient.getClientCredentialsToken();
      console.log(`[${new Date().toISOString()}] Successfully obtained Spotify client credentials token`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting Spotify client credentials token:`, error.message);
      throw new Error('Failed to validate Spotify API credentials. Check your client ID and client secret.');
    }
    
    console.log(`[${new Date().toISOString()}] Spotify API credentials are valid`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Spotify credentials check failed:`, error.message);
    throw error;
  }
}

// Start the server
startServer();

// Log server errors
server.on('error', (error) => {
  console.error(`[${new Date().toISOString()}] Server error:`, error);
});

module.exports = { app, server, io }; 