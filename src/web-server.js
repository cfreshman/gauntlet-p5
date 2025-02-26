import express from 'express';
import cors from 'cors';
import session from 'express-session';
import logger from './utils/logger.js';
import AipiLayerClient from './mcp/AipiLayerClient.js';
import spotifyClient from './utils/spotifyClient.js';
import dotenv from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

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
  }
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

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    // Verify client is connected
    if (!client.isFullyConnected()) {
      return res.status(503).json({
        content: [
          {
            type: "text",
            text: "service is starting up, please try again in a moment..."
          }
        ],
        isError: true,
        unready: true
      });
    }
    
    const { query, responseFormat, conversationHistory } = req.body;

    // Get auth header and pass it as context
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({
        content: [
          {
            type: "text",
            text: "please log in with spotify first"
          }
        ],
        isError: true
      });
    }

    // Call the music-aipi-agent tool
    const result = await client.callTool({
      name: 'music-aipi-agent',
      arguments: {
        query,
        context: auth,
        responseFormat: responseFormat || 'detailed',
        conversationHistory: conversationHistory || ''
      }
    });

    // Send response
    await res.json(result);
  } catch (error) {
    logger.error('Error in chat endpoint:', error);
    await res.status(500).json({
      content: [
        {
          type: "text",
          text: "sorry, something went wrong. please try again in a moment."
        }
      ],
      isError: true
    });
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

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`Web server listening on port ${port}`);
}); 