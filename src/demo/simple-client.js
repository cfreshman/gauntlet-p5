import '../utils/punycode-hook.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import WebSocket from 'ws';
import { WebSocketClientTransport } from '../utils/ws-transport.js';

async function main() {
  let transport = null;
  let client = null;
  let ws = null;
  
  try {
    console.log('Creating MCP client...');
    
    // Create client
    client = new Client(
      {
        name: 'simple-demo-client',
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
    
    // Create WebSocket connection
    console.log('Creating WebSocket connection...');
    ws = new WebSocket('ws://localhost:3012');
    
    // Wait for connection
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Create transport
    console.log('Creating WebSocket transport...');
    transport = new WebSocketClientTransport(ws);

    // Connect client
    console.log('Connecting to Layer 2...');
    await client.connect(transport);
    console.log('Connected to Layer 2');
    
    // List available tools
    console.log('Listing available tools...');
    const tools = await client.listTools();
    console.log('Available tools:', tools);
    
    // Call the enhanced echo tool
    console.log('Calling enhanced echo tool...');
    const result = await client.callTool({
      name: 'enhanced-echo',
      arguments: {
        message: 'Hello from simple client!'
      }
    });
    
    console.log('Enhanced echo result:', result);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Ensure we disconnect cleanly
    if (transport) {
      console.log('Disconnecting transport...');
      await transport.close();
    }
    if (ws) {
      console.log('Closing WebSocket...');
      ws.close();
    }
    console.log('Done');
  }
}

// Run the demo
main(); 