import '../utils/punycode-hook.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { WebSocketServer } from 'ws';
import { WebSocketServerTransport } from '../utils/ws-transport.js';

// Create express app
const app = express();
app.use(cors());
app.use(express.json());

// Create MCP server
const server = new McpServer({
  name: 'demo-layer1-server',
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

// Register a simple echo tool
server.tool(
  "echo",
  "Echo back the input message",
  {
    message: z.string().describe("Message to echo back")
  },
  async ({ message }) => {
    console.log('Layer 1: Echo tool called with message:', message);
    return {
      content: [
        {
          type: "text",
          text: `Layer 1 Echo: ${message}`
        }
      ]
    };
  }
);

// Create WebSocket server
const wss = new WebSocketServer({ port: 3011 });

wss.on('connection', (ws) => {
  console.log('Layer 1: WebSocket connection received');

  // Create transport and connect
  console.log('Layer 1: Creating WebSocket transport');
  transport = new WebSocketServerTransport(ws);
  
  console.log('Layer 1: Connecting transport to server');
  server.connect(transport);

  // Handle client disconnect
  ws.on('close', () => {
    console.log('Layer 1: Client disconnected');
    transport = null;
  });

  console.log('Layer 1: WebSocket connection established');
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    hasTransport: !!transport
  });
});

// Start HTTP server on port 3001
const port = 3001;
app.listen(port, () => {
  console.log(`Layer 1 HTTP server listening on port ${port}`);
  console.log(`Layer 1 WebSocket server listening on port 3011`);
});