import express from 'express';
import cors from 'cors';
import session from 'express-session';
import logger from './utils/logger.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from './utils/ws-transport.js';
import spotifyClient from './utils/spotifyClient.js';
import { ThinkingReceiveClient } from './utils/thinking-client.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Constants
const REQUEST_TIMEOUT = 600000; // 10 minutes timeout

// Do not start thinking server - it runs in its own process

// Create express app
const app = express();

// Add middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3004'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['set-cookie']
}));
app.use(express.json());
app.use(session({
  secret: 'music-aipi-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Create MCP client
const client = new Client({
  name: 'web-client',
  version: '1.0.0'
}, {
  capabilities: {
    prompts: {},
    resources: {},
    tools: {}
  },
  requestTimeout: REQUEST_TIMEOUT
});

// Track thinking clients
const thinkingClients = new Map();

// AIPI client management
let aipiClient = null;
let aipiWs = null;
let aipiConnected = false;
const maxRetries = 3;

async function getAipiClient() {
  if (aipiConnected && aipiClient) {
    return aipiClient;
  }

  // Clean up any existing connection
  if (aipiWs) {
    aipiWs.close();
    aipiWs = null;
  }
  if (aipiClient) {
    aipiClient = null;
  }
  aipiConnected = false;

  // Create new client
  aipiClient = new Client({
    name: 'web-request-client',
    version: '1.0.0'
  }, {
    capabilities: {
      prompts: {},
      resources: {},
      tools: {}
    },
    requestTimeout: REQUEST_TIMEOUT
  });

  let retryCount = 0;
  while (!aipiConnected && retryCount < maxRetries) {
    try {
      aipiWs = new WebSocket(`ws://localhost:5907`);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        aipiWs.once('open', () => {
          clearTimeout(timeout);
          aipiConnected = true;
          resolve();
        });

        aipiWs.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        aipiWs.once('close', () => {
          aipiConnected = false;
          if (!aipiConnected) {
            reject(new Error('Connection closed'));
          }
        });
      });

      const transport = new WebSocketClientTransport(aipiWs);
      await transport.start();
      await aipiClient.connect(transport);

      // Set up reconnection handler
      aipiWs.on('close', async () => {
        logger.warn('AIPI connection closed, will reconnect on next request');
        aipiConnected = false;
        aipiWs = null;
        aipiClient = null;
      });

      return aipiClient;
    } catch (error) {
      retryCount++;
      logger.warn(`AIPI connection attempt ${retryCount} failed:`, error);
      if (aipiWs) {
        aipiWs.close();
        aipiWs = null;
      }
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
        logger.info(`Retrying AIPI connection in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error('Failed to connect to AIPI server after multiple attempts');
}

// Spotify auth routes
app.get('/auth/spotify', (req, res) => {
  try {
    logger.info('Starting Spotify authentication...');
    
    const state = spotifyClient.generateRandomString(16);
    logger.info('Generated state:', state);
    
    req.session.spotifyAuthState = state;
    logger.info('Stored state in session');
    
    logger.info('Getting authorization URL...');
    const authUrl = spotifyClient.getAuthorizationUrl(state);
    logger.info('Generated auth URL:', authUrl);
    
    logger.info('Redirecting to Spotify...');
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Error initiating Spotify auth:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to initiate Spotify authentication' });
  }
});

app.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      logger.error('Spotify auth error:', error);
      return res.redirect('/?error=' + encodeURIComponent(error));
    }
    
    if (!req.session.spotifyAuthState || state !== req.session.spotifyAuthState) {
      logger.error('State mismatch in Spotify auth');
      return res.redirect('/?error=state_mismatch');
    }
    
    // Exchange code for tokens
    const tokens = await spotifyClient.exchangeCodeForTokens(code);
    
    // Get user profile
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get user profile: ${response.status}`);
    }
    
    const userProfile = await response.json();
    const userId = userProfile.id;
    
    // Store tokens in session
    req.session.spotifyTokens = tokens;
    req.session.spotifyUserId = userId;
    
    // Store tokens in Spotify client
    spotifyClient.storeUserTokens(userId, tokens);
    
    // Send tokens to client
    res.redirect(`/?auth=success&userId=${encodeURIComponent(userId)}&accessToken=${encodeURIComponent(tokens.accessToken)}&refreshToken=${encodeURIComponent(tokens.refreshToken)}&expirationTime=${encodeURIComponent(tokens.expirationTime)}`);
  } catch (error) {
    logger.error('Error in Spotify callback:', error);
    res.redirect('/?error=' + encodeURIComponent('Failed to authenticate with Spotify'));
  }
});

// Auth status endpoint
app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: !!(req.session.spotifyUserId && req.session.spotifyTokens),
    userId: req.session.spotifyUserId
  });
});

// Logout endpoint
app.get('/api/auth/logout', (req, res) => {
  req.session.spotifyTokens = null;
  req.session.spotifyUserId = null;
  res.json({ success: true });
});

// Spotify token endpoint for Web Playback SDK
app.get('/api/spotify/token', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    if (Date.now() >= parseInt(expirationTime)) {
      const newTokens = await spotifyClient.refreshAccessToken(refreshToken);
      res.json({ token: newTokens.accessToken });
    } else {
      res.json({ token: accessToken });
    }
  } catch (error) {
    logger.error('Error getting Spotify token:', error);
    res.status(500).json({ error: 'Failed to get token' });
  }
});

// Playback endpoints
app.get('/api/playback/state', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const state = await spotifyClient.getPlaybackState(userId);
    res.json(state);
  } catch (error) {
    logger.error('Error getting playback state:', error);
    res.status(500).json({ error: 'Failed to get playback state' });
  }
});

app.get('/api/playback/devices', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const devices = await spotifyClient.getAvailableDevices(userId);
    res.json(devices);
  } catch (error) {
    logger.error('Error getting devices:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

app.post('/api/playback/play', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { deviceId, contextUri, uris, offset, positionMs } = req.body;
    await spotifyClient.startPlayback(deviceId, contextUri, uris, offset, positionMs, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error starting playback:', error);
    res.status(500).json({ error: 'Failed to start playback' });
  }
});

app.post('/api/playback/pause', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { deviceId } = req.body;
    await spotifyClient.pausePlayback(deviceId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error pausing playback:', error);
    res.status(500).json({ error: 'Failed to pause playback' });
  }
});

app.post('/api/playback/next', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { deviceId } = req.body;
    await spotifyClient.skipToNext(deviceId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error skipping to next:', error);
    res.status(500).json({ error: 'Failed to skip to next' });
  }
});

app.post('/api/playback/previous', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { deviceId } = req.body;
    await spotifyClient.skipToPrevious(deviceId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error skipping to previous:', error);
    res.status(500).json({ error: 'Failed to skip to previous' });
  }
});

// Add seek endpoint
app.post('/api/playback/seek', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { deviceId, position_ms } = req.body;
    await spotifyClient.seekToPosition(position_ms, deviceId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error seeking to position:', error);
    res.status(500).json({ error: 'Failed to seek to position' });
  }
});

// Add volume endpoint
app.post('/api/playback/volume', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { deviceId, volumePercent } = req.body;
    await spotifyClient.setPlaybackVolume(volumePercent, deviceId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error setting volume:', error);
    res.status(500).json({ error: 'Failed to set volume' });
  }
});

// Add transfer endpoint
app.post('/api/playback/transfer', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { deviceId } = req.body;
    await spotifyClient.transferPlayback(deviceId, true, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error transferring playback:', error);
    res.status(500).json({ error: 'Failed to transfer playback' });
  }
});

// Add shuffle endpoint
app.post('/api/playback/shuffle', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const { state, deviceId } = req.body;
    await spotifyClient.togglePlaybackShuffle(state, deviceId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error setting shuffle state:', error);
    res.status(500).json({ error: 'Failed to set shuffle state' });
  }
});

// Create WebSocket server attached to Express
const wsServer = new WebSocketServer({ noServer: true });

// Track active sessions and their handlers
const activeSessions = new Map();

// Start server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  logger.info(`Web server listening on port ${port}`);
});

// Handle upgrade requests
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  // Handle both chat and thinking WebSocket upgrades
  if (url.pathname === '/chat' || url.pathname === '/thinking') {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket connection handler
wsServer.on('connection', async (ws, req) => {
  try {
    // Get auth from query params
    const params = new URL(req.url, 'ws://localhost').searchParams;
    const auth = params.get('auth');
    const clientSessionId = params.get('sessionId');
    
    if (!auth) {
      ws.send(JSON.stringify({
        type: 'error',
        content: [{
          type: 'text',
          text: 'please log in with spotify first'
        }]
      }));
      ws.close();
      return;
    }

    // Parse auth string
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(':');
    
    // Store tokens in Spotify client
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });

    // Check if this is a reconnection
    let sessionId = clientSessionId;
    let activeSession = sessionId ? activeSessions.get(sessionId) : null;
    let isReconnection = false;

    if (activeSession) {
      // This is a reconnection
      isReconnection = true;
      logger.info(`Reconnection detected for session ${sessionId}`);
      
      // Update the WebSocket for this session
      activeSession.ws = ws;
      
      // If there was a pending response, send it
      if (activeSession.pendingResponse) {
        logger.info(`Sending pending response for session ${sessionId}`);
        ws.send(JSON.stringify(activeSession.pendingResponse));
        delete activeSession.pendingResponse;
      }
    } else {
      // New connection - generate session ID
      sessionId = uuidv4();
      activeSession = { ws, userId };
      activeSessions.set(sessionId, activeSession);
      
      // Send session ID to client
      ws.send(JSON.stringify({
        type: 'session',
        sessionId
      }));
    }

    // Get or create thinking client for this session
    let thinkingClient = thinkingClients.get(sessionId);
    if (!thinkingClient) {
      thinkingClient = new ThinkingReceiveClient();
      thinkingClients.set(sessionId, thinkingClient);
    }

    // Clear any existing message handler
    thinkingClient.onMessage(null);

    // Set up message handler for this connection
    thinkingClient.onMessage((message) => {
      if (ws.readyState === WebSocket.OPEN) {
        logger.info(`Forwarding thinking message to browser for session ${sessionId}:`, message);
        ws.send(JSON.stringify(message));
      }
    });

    // Connect thinking client if needed
    if (!thinkingClient.isConnected()) {
      try {
        await thinkingClient.connect(sessionId);
        logger.info(`Connected thinking client for session ${sessionId}`);
      } catch (error) {
        logger.error(`Failed to connect thinking client for session ${sessionId}:`, error);
        logger.warn(`Continuing without thinking client for session ${sessionId}`);
      }
    }

    // Handle messages from browser
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.info(`Received chat message for session ${sessionId}`);
        logger.debug('Message details:', {
          hasQuery: !!message.query,
          historyLength: message.conversationHistory ? JSON.parse(message.conversationHistory).length : 0
        });

        // Try to reconnect thinking client if disconnected
        if (thinkingClient && !thinkingClient.isConnected()) {
          try {
            await thinkingClient.connect(sessionId);
            logger.info(`Reconnected thinking client for session ${sessionId}`);
          } catch (error) {
            logger.warn(`Failed to reconnect thinking client for session ${sessionId}:`, error);
          }
        }

        // Get AIPI client (will reconnect if needed)
        const requestClient = await getAipiClient();

        // Call the music-agent
        const result = await requestClient.callTool({
          name: 'music-agent',
          arguments: {
            query: message.query,
            spotifyAuth: `Bearer ${userId}:${accessToken}:${refreshToken}:${expirationTime}`,
            conversationHistory: message.conversationHistory || '',
            sessionId
          }
        }, undefined, { timeout: REQUEST_TIMEOUT });

        // Store result in case of disconnection
        activeSession.pendingResponse = result;

        // Send final response if still connected
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(result));
          delete activeSession.pendingResponse;
        }
      } catch (error) {
        logger.error('Error processing message:', error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            content: [{
              type: "text",
              text: "sorry, something went wrong. please try again in a moment."
            }],
            isError: true
          }));
        }
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      logger.info(`Browser WebSocket closed for session ${sessionId}`);
      
      // Clear message handler
      if (thinkingClient) {
        thinkingClient.onMessage(null);
      }

      // Start grace period for session
      setTimeout(() => {
        const session = activeSessions.get(sessionId);
        // Only clean up if this is still the same WebSocket instance
        if (session && session.ws === ws) {
          logger.info(`Cleaning up session ${sessionId} after grace period`);
          activeSessions.delete(sessionId);
          
          // Also clean up thinking client
          const client = thinkingClients.get(sessionId);
          if (client) {
            client.close();
            thinkingClients.delete(sessionId);
          }
        }
      }, 30000); // 30 second grace period
    });

  } catch (error) {
    logger.error('Error in WebSocket connection:', error);
    ws.close();
  }
});

// Cleanup disconnected thinking clients periodically - but only those without active reconnection timers
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, thinkingClient] of thinkingClients.entries()) {
    if (!thinkingClient.isConnected() && (!thinkingClient.lastDisconnect || now - thinkingClient.lastDisconnect > 30000)) {
      logger.info(`Cleaning up stale thinking client for session ${sessionId}`);
      thinkingClient.close();
      thinkingClients.delete(sessionId);
    }
  }
}, 60000); // Run cleanup every minute

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ready: true,
    thinkingSessions: thinkingClients.size
  });
});

// Context info endpoints
app.get('/api/playlists/:id', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const playlist = await spotifyClient.makeRequest('GET', `/playlists/${req.params.id}`, {}, null, userId);
    res.json(playlist);
  } catch (error) {
    logger.error('Error getting playlist:', error);
    res.status(500).json({ error: 'Failed to get playlist' });
  }
});

app.get('/api/albums/:id', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const album = await spotifyClient.makeRequest('GET', `/albums/${req.params.id}`, {}, null, userId);
    res.json(album);
  } catch (error) {
    logger.error('Error getting album:', error);
    res.status(500).json({ error: 'Failed to get album' });
  }
});

app.get('/api/artists/:id', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const [userId, accessToken, refreshToken, expirationTime] = auth.split(' ')[1].split(':');
    
    // Store tokens from auth header
    spotifyClient.storeUserTokens(userId, {
      accessToken,
      refreshToken,
      expirationTime: parseInt(expirationTime)
    });
    
    const artist = await spotifyClient.makeRequest('GET', `/artists/${req.params.id}`, {}, null, userId);
    res.json(artist);
  } catch (error) {
    logger.error('Error getting artist:', error);
    res.status(500).json({ error: 'Failed to get artist' });
  }
});

// Remove duplicate server start
// app.listen(port, () => {
//   logger.info(`Web server listening on port ${port}`);
// }); 