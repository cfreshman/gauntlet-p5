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
  name: 'demo-layer-server',
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
    console.log('Demo Layer: Echo tool called with message:', message);
    return {
      content: [
        {
          type: "text",
          text: `Demo Echo: ${message}`
        }
      ]
    };
  }
);

// Create WebSocket server
const wss = new WebSocketServer({ port: 3015 });

wss.on('connection', (ws) => {
  console.log('Demo Layer: WebSocket connection received');

  // Create transport and connect
  console.log('Demo Layer: Creating WebSocket transport');
  transport = new WebSocketServerTransport(ws);
  
  console.log('Demo Layer: Connecting transport to server');
  server.connect(transport);

  // Handle client disconnect
  ws.on('close', () => {
    console.log('Demo Layer: Client disconnected');
    transport = null;
  });

  console.log('Demo Layer: WebSocket connection established');
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    hasTransport: !!transport
  });
});

// Start HTTP server
const port = 3005;
app.listen(port, () => {
  console.log(`Demo Layer HTTP server listening on port ${port}`);
  console.log(`Demo Layer WebSocket server listening on port 3015`);
}); 