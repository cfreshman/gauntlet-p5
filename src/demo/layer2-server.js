import '../utils/punycode-hook.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { WebSocketServerTransport, WebSocketClientTransport } from '../utils/ws-transport.js';

// Create express app
const app = express();
app.use(cors());
app.use(express.json());

// Create MCP server
const server = new McpServer({
  name: 'demo-layer2-server',
  version: '1.0.0'
}, {
  capabilities: {
    prompts: {},
    resources: {},
    tools: {}
  }
});

// Track current transport
let transport = null;

// Create Layer 1 client
const layer1Client = new Client(
  {
    name: 'layer2-to-layer1-client',
    version: '1.0.0'
  },
  {
    capabilities: {
      prompts: {},
      resources: {},
      tools: {}
    }
  }
);

// Function to connect to Layer 1 with retries
async function connectToLayer1() {
  const maxRetries = 5;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check if Layer 1 is ready
      console.log(`Layer 2: Checking Layer 1 health (attempt ${attempt}/${maxRetries})...`);
      const healthResponse = await fetch('http://localhost:3001/health');
      const health = await healthResponse.json();

      if (health.status === 'ok') {
        console.log('Layer 2: Layer 1 is ready, connecting...');
        
        // Create WebSocket connection
        const ws = new WebSocket('ws://localhost:3011');
        
        // Wait for connection
        await new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });

        // Create transport and connect
        const layer1Transport = new WebSocketClientTransport(ws);
        await layer1Client.connect(layer1Transport);
        console.log('Layer 2: Connected to Layer 1');
        return true;
      }
    } catch (error) {
      console.log(`Layer 2: Layer 1 not ready (${error.message}), retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error('Failed to connect to Layer 1 after max retries');
}

// Connect to Layer 1 before starting Layer 2 server
await connectToLayer1();

// Register a tool that uses Layer 1's echo
server.tool(
  "enhanced-echo",
  "Echo back the input message with enhancements",
  {
    message: z.string().describe("Message to echo back")
  },
  async ({ message }) => {
    console.log('Layer 2: Enhanced echo tool called with message:', message);
    
    // Call Layer 1's echo
    const layer1Result = await layer1Client.callTool({
      name: 'echo',
      arguments: { message }
    });

    // Add our enhancement
    return {
      content: [
        {
          type: "text",
          text: `Layer 2 Enhancement: ${layer1Result.content[0].text}`
        }
      ]
    };
  }
);

// Create WebSocket server
const wss = new WebSocketServer({ port: 3012 });

wss.on('connection', (ws) => {
  console.log('Layer 2: WebSocket connection received');

  // Create transport and connect
  console.log('Layer 2: Creating WebSocket transport');
  transport = new WebSocketServerTransport(ws);
  
  console.log('Layer 2: Connecting transport to server');
  server.connect(transport);

  // Handle client disconnect
  ws.on('close', () => {
    console.log('Layer 2: Client disconnected');
    transport = null;
  });

  console.log('Layer 2: WebSocket connection established');
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    hasTransport: !!transport,
    layer1Connected: layer1Client.isConnected()
  });
});

// Start HTTP server on port 3002
const port = 3002;
app.listen(port, () => {
  console.log(`Layer 2 HTTP server listening on port ${port}`);
  console.log(`Layer 2 WebSocket server listening on port 3012`);
}); 