/**
 * MCP Test Client
 * 
 * This script demonstrates how to use the MCP client to interact with our MCP servers.
 * It connects to a specified layer server and sends a test query.
 */

require('dotenv').config();
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Get the layer to test from command line arguments
const layer = process.argv[2] || '1';
if (!['1', '2', '3'].includes(layer)) {
  console.error('Invalid layer. Please specify 1, 2, or 3.');
  process.exit(1);
}

// Start the MCP server process
console.log(`Starting Layer ${layer} MCP Server...`);
const serverProcess = spawn('node', ['src/mcp/demo.js', layer], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Handle server output
serverProcess.stdout.on('data', (data) => {
  console.log(`Server: ${data.toString().trim()}`);
});

serverProcess.stderr.on('data', (data) => {
  console.error(`Server Error: ${data.toString().trim()}`);
});

// Initialize MCP client
const client = new Client(
  {
    name: "aipi-test-client",
    version: "1.0.0"
  },
  {
    capabilities: {
      prompts: {},
      resources: {},
      tools: {}
    }
  }
);

// Create transport
const transport = new StdioClientTransport({
  command: 'node',
  args: ['src/mcp/demo.js', layer],
  cwd: process.cwd()
});

// Connect to the server process
client.connect(transport);

// Function to send a query to the MCP server
async function sendQuery(query) {
  console.log(`Sending query: "${query}"`);
  
  try {
    // List available tools
    const tools = await client.listTools();
    console.log('\nAvailable tools:');
    console.log(tools);
    
    // Try to parse the query as JSON for data validation
    let data;
    try {
      data = JSON.parse(query);
    } catch (e) {
      data = query;
    }
    
    // Call the validate-data tool if available
    if (tools.tools.some(tool => tool.name === 'validate-data')) {
      console.log('\nCalling validate-data tool...');
      const result = await client.callTool({
        name: 'validate-data',
        arguments: {
          schema: {
            type: typeof data === 'string' ? 'string' : 'object',
            properties: {}
          },
          data: data
        }
      });
      
      console.log('\nValidation result:');
      console.log(result);
    } 
    // Call the transform-data tool if available and the query looks like JSON
    else if (tools.tools.some(tool => tool.name === 'transform-data') && typeof data === 'object') {
      console.log('\nCalling transform-data tool...');
      const result = await client.callTool({
        name: 'transform-data',
        arguments: {
          sourceFormat: 'json',
          targetFormat: 'csv',
          data: JSON.stringify(data)
        }
      });
      
      console.log('\nTransformation result:');
      console.log(result);
    }
    else {
      console.log('\nNo suitable tool available to handle the query.');
    }
  } catch (error) {
    console.error('Error sending query:', error);
  }
}

// Interactive mode
function startInteractiveMode() {
  console.log('\n=== MCP Test Client ===');
  console.log(`Connected to Layer ${layer} MCP Server`);
  console.log('Type your queries or "exit" to quit\n');
  
  rl.question('> ', async (query) => {
    if (query.toLowerCase() === 'exit') {
      console.log('Exiting...');
      serverProcess.kill();
      rl.close();
      process.exit(0);
    } else {
      await sendQuery(query);
      startInteractiveMode();
    }
  });
}

// Wait for server to initialize before starting interactive mode
setTimeout(() => {
  startInteractiveMode();
}, 2000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('Terminating...');
  serverProcess.kill();
  rl.close();
  process.exit(0);
}); 