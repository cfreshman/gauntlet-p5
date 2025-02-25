import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import http from 'http';
import { Server } from 'socket.io';
import { config } from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env') });

import logger from './utils/logger.js';
import mcpClient from './utils/mcp-client.js';
import spotifyClient from './utils/spotifyClient.js';
import { processUserMessage, generateSystemPrompt } from './chat/message-processor.js';
import toolFormatter from './utils/tool-formatter.js';
import session from 'express-session';
import fetch from 'node-fetch';

// create express app
const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3004'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['set-cookie']
}));
app.use(express.json());

// Set up session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'music-aipi-secret',
  resave: true,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
    httpOnly: true
  },
  name: 'connect.sid'
});

// Store the session middleware for access to the session store
app.use(sessionMiddleware);

// Make session store accessible
const sessionStore = sessionMiddleware.store;
app.set('sessionStore', sessionStore);

// serve static files from web-client/dist if they exist
app.use(express.static(path.join(__dirname, '../web-client/dist')));

// create http server and socket.io instance
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3004'],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['set-cookie']
  },
  allowEIO3: true,
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // Set to false for development
    domain: 'localhost'  // Added domain
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

// Use the session middleware with socket.io
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Add error handling middleware for socket.io
io.engine.on("connection_error", (err) => {
  console.error('Socket.io connection error:', err);
});

// Add middleware to handle authentication
io.use((socket, next) => {
  const session = socket.request.session;
  if (!session) {
    return next(new Error('Session not found'));
  }
  
  // Store session ID in socket for later use
  socket.sessionID = session.id;
  
  // Log successful session attachment
  console.log(`Session attached to socket ${socket.id}:`, {
    sessionId: session.id,
    userId: session.spotifyUserId || 'not authenticated'
  });
  
  next();
});

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

// Socket.IO connection handling
io.on('connection', async (socket) => {
  try {
    // Get session ID from socket
    const sessionId = socket.request.session?.id;
    if (!sessionId) {
      logger.error('No session ID found for socket connection');
      socket.disconnect();
      return;
    }
    
    // Get user ID directly from socket session
    const userId = socket.request.session?.spotifyUserId;
    if (!userId) {
      logger.error('No user ID found in session:', sessionId);
      socket.disconnect();
      return;
    }
    
    // Store socket connection
    socketsBySession[sessionId] = socket.id;
    activeConnections++;
    
    logger.info(`Client connected - Session: ${sessionId}, User: ${userId}, Active connections: ${activeConnections}`);
    
    // Handle incoming messages
    socket.on('user_message', async (data) => {
      try {
        logger.info('Received message from client:', { 
          messageLength: data.message.length,
          userId,
          sessionId 
        });
        
        // Process the message
        const response = await processUserMessage(data.message, userId);
        
        // Send response back to client
        socket.emit('assistant_response', {
          type: 'message',
          content: response
        });
      } catch (error) {
        logger.error('Error processing message:', { 
          error: error.message,
          userId,
          sessionId
        });
        
        socket.emit('assistant_response', {
          type: 'error',
          content: {
            type: "text",
            text: `i'm sorry, something went wrong while processing your message. please try again.`
          }
        });
      }
    });

    // Handle playback commands
    socket.on('playback-command', async (data) => {
      try {
        const { action, params = {} } = data;
        logger.info('Received playback command:', { action, params, userId });

        let result;
        switch (action) {
          case 'get-playback-state':
            result = await spotifyClient.getPlaybackState(null, userId);
            socket.emit('playback-state', result);
            break;

          case 'get-devices':
            result = await spotifyClient.getAvailableDevices(userId);
            socket.emit('playback-devices', result);
            break;

          case 'play':
            await spotifyClient.startResumePlayback(
              params.deviceId,
              params.contextUri,
              params.uris,
              params.offset,
              params.positionMs,
              userId
            );
            socket.emit('playback-result', { success: true });
            break;

          case 'pause':
            await spotifyClient.pausePlayback(params.deviceId, userId);
            socket.emit('playback-result', { success: true });
            break;

          case 'next':
            await spotifyClient.skipToNext(params.deviceId, userId);
            socket.emit('playback-result', { success: true });
            break;

          case 'previous':
            await spotifyClient.skipToPrevious(params.deviceId, userId);
            socket.emit('playback-result', { success: true });
            break;

          case 'seek':
            await spotifyClient.seekToPosition(params.positionMs, params.deviceId, userId);
            socket.emit('playback-result', { success: true });
            break;

          case 'volume':
            await spotifyClient.setPlaybackVolume(params.volumePercent, params.deviceId, userId);
            socket.emit('playback-result', { success: true });
            break;

          case 'transfer':
            await spotifyClient.transferPlayback(params.deviceId, params.play || false, userId);
            socket.emit('playback-result', { success: true });
            break;

          default:
            socket.emit('playback-error', { error: `Unknown command: ${action}` });
        }

        // After any successful command, get the latest playback state
        if (action !== 'get-playback-state' && action !== 'get-devices') {
          const newState = await spotifyClient.getPlaybackState(null, userId);
          socket.emit('playback-state', newState);
        }
      } catch (error) {
        logger.error('Error handling playback command:', { 
          error: error.message,
          action: data.action,
          userId 
        });
        socket.emit('playback-error', { error: error.message });
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      delete socketsBySession[sessionId];
      activeConnections--;
      logger.info(`Client disconnected - Session: ${sessionId}, User: ${userId}, Active connections: ${activeConnections}`);
    });
  } catch (error) {
    logger.error('Error in socket connection:', error);
    socket.disconnect();
  }
});

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

// Check if MCP servers are ready
async function waitForMcpServers() {
  const maxRetries = 5;
  const retryDelay = 2000;
  const layers = [3001, 3002, 3003];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${new Date().toISOString()}] Checking MCP servers health (attempt ${attempt}/${maxRetries})...`);
      
      // Check all layers
      const results = await Promise.all(layers.map(async (port) => {
        return new Promise((resolve) => {
          const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/health',
            method: 'GET'
          }, (res) => {
            resolve(res.statusCode === 200);
          });
          
          req.on('error', () => {
            resolve(false);
          });
          
          req.end();
        });
      }));
      
      if (results.every(ok => ok)) {
        console.log(`[${new Date().toISOString()}] All MCP servers are ready`);
        return true;
      }
      
      console.log(`[${new Date().toISOString()}] Some MCP servers not ready yet, retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error checking MCP servers:`, error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  throw new Error('MCP servers not ready after maximum retries');
}

// Initialize MCP client before starting server
async function startServer() {
  try {
    // Check Spotify credentials
    await checkSpotifyCredentials();
    
    // Wait for MCP servers to be ready
    await waitForMcpServers();
    
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

export {
  startServer,
  waitForMcpServers,
  checkSpotifyCredentials
}; 