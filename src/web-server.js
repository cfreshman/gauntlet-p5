import express from 'express';
import cors from 'cors';
import session from 'express-session';
import logger from './utils/logger.js';
import AipiLayerClient from './mcp/AipiLayerClient.js';
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
const client = new AipiLayerClient({
  name: 'web-client',
  layerServers: {
    layer3: {
      port: 3003,
      wsPort: 3013
    }
  },
  requestTimeout: REQUEST_TIMEOUT // Add timeout configuration
});

// Start client connections
await client.start();

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

// Create WebSocket server attached to Express
const wsServer = new WebSocketServer({ noServer: true });

// Start server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  logger.info(`Web server listening on port ${port}`);
});

// Handle upgrade requests
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  // Only handle WebSocket upgrades for /chat
  if (url.pathname === '/chat') {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket connection handler
wsServer.on('connection', async (ws, req) => {
  let thinkingClient = null;
  
  try {
    // Get auth from query params
    const params = new URL(req.url, 'ws://localhost').searchParams;
    const auth = params.get('auth');
    const sessionId = params.get('sessionId');
    
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

    if (!sessionId) {
      ws.send(JSON.stringify({
        type: 'error',
        content: [{
          type: 'text',
          text: 'no session id provided'
        }]
      }));
      ws.close();
      return;
    }

    // Create and connect thinking client
    thinkingClient = new ThinkingReceiveClient();
    
    try {
      await thinkingClient.connect(sessionId);
    } catch (error) {
      logger.error(`Failed to connect thinking client for session ${sessionId}:`, error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          content: [{
            type: 'text',
            text: 'failed to connect to thinking service. please try again in a moment.'
          }]
        }));
      }
      ws.close();
      return;
    }

    // Forward thinking messages to browser
    thinkingClient.onMessage((message) => {
      if (ws.readyState === WebSocket.OPEN) {
        logger.info(`Forwarding thinking message to browser for session ${sessionId}:`, message);
        ws.send(JSON.stringify(message));
      }
    });

    // Handle messages from browser
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.info(`Received message from browser for session ${sessionId}:`, message);

        if (!client.isFullyConnected()) {
          ws.send(JSON.stringify({
            content: [{
              type: "text",
              text: "service is starting up, please try again in a moment..."
            }],
            isError: true,
            unready: true
          }));
          return;
        }

        // Call the music-aipi-agent
        const result = await client.callTool({
          name: 'music-aipi-agent',
          arguments: {
            query: message.query,
            context: `Bearer ${userId}:${accessToken}:${refreshToken}:${expirationTime}`,
            responseFormat: message.responseFormat || 'detailed',
            conversationHistory: message.conversationHistory || '',
            sessionId
          }
        });

        // Send final response
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(result));
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
      if (thinkingClient) {
        thinkingClient.close();
      }
    });

  } catch (error) {
    logger.error('Error in WebSocket connection:', error);
    if (thinkingClient) {
      thinkingClient.close();
    }
    ws.close();
  }
});

// Get available tools
app.get('/api/tools', async (req, res) => {
  try {
    const tools = client.getAllTools();
    res.json(tools);
  } catch (error) {
    logger.error('Error fetching tools:', error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// Get connection status
app.get('/api/status', (req, res) => {
  const status = {
    connections: client.getConnectionStatus(),
    ready: client.isFullyConnected()
  };
  res.json(status);
});

// Health check endpoint
app.get('/health', (req, res) => {
  const isReady = client.isFullyConnected();
  res.json({
    status: isReady ? 'ok' : 'starting',
    ready: isReady
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