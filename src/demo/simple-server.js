import '../utils/punycode-hook.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';

// Create express app
const app = express();
app.use(cors());
app.use(express.json());

// Create MCP server
const server = new McpServer({
  name: 'simple-demo-server',
  version: '1.0.0'
}, {
  capabilities: {
    prompts: {},
    resources: {},
    tools: {}
  }
});

// Track current transport and connection state
let transport = null;
let isConnected = false;

// Register a simple echo tool
server.tool(
  "echo",
  "Echo back the input message",
  {
    message: z.string().describe("Message to echo back")
  },
  async ({ message }) => {
    console.log('Echo tool called with message:', message);
    return {
      content: [
        {
          type: "text",
          text: `Echo: ${message}`
        }
      ]
    };
  }
);

// Add SSE endpoint
app.get('/sse', (req, res) => {
  console.log('SSE connection request received');

  // Create transport and connect
  console.log('Creating SSE transport');
  transport = new SSEServerTransport('/messages', res);
  
  console.log('Connecting transport to server');
  server.connect(transport);
  isConnected = true;

  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected');
    isConnected = false;
    transport = null;
  });

  // Handle errors
  req.on('error', (error) => {
    console.error('SSE connection error:', error);
    isConnected = false;
    transport = null;
  });

  console.log('SSE connection established');
});

// Add POST endpoint for client-to-server messages
app.post('/messages', express.json(), (req, res) => {
  console.log('Received POST message:', req.body);
  
  if (!transport || !isConnected) {
    console.log('No active transport for POST');
    res.status(400).json({ error: 'No active SSE connection' });
    return;
  }

  try {
    console.log('Handling POST message with transport');
    transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('Error handling POST:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    hasTransport: !!transport,
    isConnected
  });
});

// Start server
const port = 3456;
app.listen(port, () => {
  console.log(`Simple demo server listening on port ${port}`);
}); 