/**
 * MCP Test All Script
 * 
 * This script tests all three MCP layers simultaneously.
 * It connects to each layer and demonstrates their capabilities.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const readline = require('readline');
const OpenAI = require('openai');
const { Layer1Client } = require('./layer1Client');
const { Layer2Client } = require('./layer2Client');
const { Layer3Client } = require('./layer3Client');

// Initialize OpenAI client
let openai;
try {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY is not set in the environment variables.');
    console.warn('LLM-based tool selection will not be available.');
  } else {
    const OpenAI = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('OpenAI client initialized successfully');
  }
} catch (error) {
  console.warn('⚠️ Failed to initialize OpenAI client:', error.message);
  console.warn('LLM-based tool selection will not be available.');
}

// Check if SSE client transport is available
let SSEClientTransport;
try {
  const sseModule = require('@modelcontextprotocol/sdk/client/sse.js');
  SSEClientTransport = sseModule.SSEClientTransport;
  console.log('SSEClientTransport loaded successfully');
} catch (error) {
  console.warn('SSEClientTransport not available:', error.message);
  console.warn('Will use StdioClientTransport as fallback');
}

// Try to load StdioClientTransport as fallback
let StdioClientTransport;
try {
  const stdioModule = require('@modelcontextprotocol/sdk/client/stdio.js');
  StdioClientTransport = stdioModule.StdioClientTransport;
  console.log('StdioClientTransport loaded successfully');
} catch (error) {
  console.warn('StdioClientTransport not available:', error.message);
}

// Port configuration
const ports = {
  layer1: 3001,
  layer2: 3002,
  layer3: 3003
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Initialize clients
let layer1Client = null;
let layer2Client = null;
let layer3Client = null;

/**
 * List available tools for a specific layer
 * @param {string} layerName - The name of the layer (Layer 1, Layer 2, Layer 3)
 * @param {Client} client - The client for the layer
 */
async function listTools(layerName, client) {
  try {
    const tools = await client.listTools();
    console.log(`\n${layerName} Tools:`);
    tools.tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });
    return tools.tools;
  } catch (error) {
    console.error(`Error listing ${layerName} tools:`, error.message);
    console.error(error.stack);
    return [];
  }
}

/**
 * Call a tool on a specific layer
 * @param {string} layerName - The name of the layer (Layer 1, Layer 2, Layer 3)
 * @param {Client} client - The client for the layer
 * @param {string} toolName - The name of the tool to call
 * @param {Object} args - The arguments for the tool
 */
async function callTool(layerName, client, toolName, args) {
  try {
    console.log(`\nCalling ${toolName} on ${layerName}...`);
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    
    console.log(`\n${layerName} ${toolName} result:`);
    
    // Format the response for better readability
    formatToolResponse(result);
    
    return result;
  } catch (error) {
    console.error(`Error calling ${toolName} on ${layerName}:`, error.message);
    console.error(error.stack);
    return null;
  }
}

/**
 * Format tool response for better readability
 * @param {Object} response - The response from the tool
 */
function formatToolResponse(response) {
  if (!response || !response.content) {
    console.log("No content in response");
    return;
  }
  
  console.log("\n" + "=".repeat(80));
  
  // Process each content item
  response.content.forEach(item => {
    if (item.type === 'text') {
      // For text content, print it directly
      const text = item.text.trim();
      console.log(text);
    } else if (item.type === 'image') {
      console.log(`[Image: ${item.url || 'No URL provided'}]`);
    } else {
      console.log(`[${item.type} content]`);
    }
  });
  
  console.log("=".repeat(80) + "\n");
}

/**
 * Use LLM to determine the most appropriate tool for a query
 * @param {string} query - The user query
 * @returns {Promise<{layer: string, toolName: string, args: Object}>} - The selected tool and arguments
 */
async function determineToolWithLLM(query) {
  try {
    console.log("Using GPT-4o to determine the most appropriate tool...");
    
    // Get available tools from each layer
    const availableTools = {};
    
    if (layer1Client) {
      try {
        const tools = await layer1Client.listTools();
        availableTools.layer1 = tools.tools;
        console.log(`Found ${tools.tools.length} tools in Layer 1`);
      } catch (error) {
        console.error(`Error listing tools for Layer 1:`, error.message);
      }
    }
    
    if (layer2Client) {
      try {
        const tools = await layer2Client.listTools();
        availableTools.layer2 = tools.tools;
        console.log(`Found ${tools.tools.length} tools in Layer 2`);
      } catch (error) {
        console.error(`Error listing tools for Layer 2:`, error.message);
      }
    }
    
    if (layer3Client) {
      try {
        const tools = await layer3Client.listTools();
        availableTools.layer3 = tools.tools;
        console.log(`Found ${tools.tools.length} tools in Layer 3`);
      } catch (error) {
        console.error(`Error listing tools for Layer 3:`, error.message);
      }
    }
    
    // Create a description of all available tools with their parameters
    let toolsDescription = "Available tools:\n\n";
    
    for (const [layerName, tools] of Object.entries(availableTools)) {
      if (tools && tools.length > 0) {
        toolsDescription += `${layerName.toUpperCase()} TOOLS:\n`;
        tools.forEach(tool => {
          toolsDescription += `- ${tool.name}: ${tool.description}\n`;
          
          // Add parameter information for known tools
          if (tool.name === 'validate-data') {
            toolsDescription += `  Parameters: schema (object), data (any)\n`;
          } else if (tool.name === 'transform-data') {
            toolsDescription += `  Parameters: sourceFormat (string), targetFormat (string), data (string)\n`;
          } else if (tool.name === 'analyze-text') {
            toolsDescription += `  Parameters: text (string), analysisType (string: 'sentiment', 'summary', 'keywords', 'entities')\n`;
          } else if (tool.name === 'enrich-data') {
            toolsDescription += `  Parameters: data (any), enrichmentType (string: 'descriptions', 'categories', 'recommendations')\n`;
          } else if (tool.name === 'process-query') {
            toolsDescription += `  Parameters: query (string), context (string, optional), responseFormat (string, optional: 'concise', 'detailed', 'technical', 'simple')\n`;
          } else if (tool.name === 'reason') {
            toolsDescription += `  Parameters: problem (string), steps (number, optional), domainKnowledge (string, optional)\n`;
          } else if (tool.name === 'consult-expert') {
            toolsDescription += `  Parameters: domain (string: 'technical', 'business', 'scientific', 'creative', 'legal'), question (string), background (string, optional)\n`;
          }
        });
        toolsDescription += "\n";
      }
    }
    
    // Create the prompt for the LLM
    const prompt = `
You are an intelligent router for a layered AI system. Your job is to analyze a user query and determine the most appropriate tool to handle it.

${toolsDescription}

USER QUERY: "${query}"

Based on the query, determine:
1. Which layer's tool is most appropriate (layer1, layer2, or layer3)
2. Which specific tool from that layer should be used
3. What arguments should be passed to that tool

Layer 1 tools are deterministic and handle basic data operations.
Layer 2 tools combine code with LLM capabilities for enhanced processing.
Layer 3 tools provide expert-level LLM capabilities for complex natural language tasks.

IMPORTANT: Make sure to use the EXACT parameter names for each tool as specified in the tool descriptions.
For example:
- For 'reason' tool, use 'problem' (not 'query') for the input question
- For 'consult-expert' tool, use 'question' (not 'query') for the input question
- For 'analyze-text' tool, use 'text' (not 'query') for the input text

Respond in JSON format only:
{
  "layer": "layer1|layer2|layer3",
  "toolName": "name-of-selected-tool",
  "args": {
    // appropriate arguments for the selected tool with EXACT parameter names
  },
  "reasoning": "brief explanation of why this tool was selected"
}
`;

    // Call OpenAI API with GPT-4o
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant that outputs only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    
    const result = response.choices[0].message.content;
    const parsedResult = JSON.parse(result);
    
    console.log(`GPT-4o selected ${parsedResult.toolName} from ${parsedResult.layer}`);
    console.log(`Reasoning: ${parsedResult.reasoning}`);
    
    // Validate and fix arguments if needed
    const fixedArgs = validateAndFixToolArguments(parsedResult.toolName, parsedResult.args, query);
    parsedResult.args = fixedArgs;
    
    return parsedResult;
  } catch (error) {
    console.error('Error determining tool with LLM:', error.message);
    console.error(error.stack);
    
    // Fall back to a default tool if LLM fails
    return {
      layer: 'layer3',
      toolName: 'process-query',
      args: {
        query: query,
        responseFormat: 'concise'
      },
      reasoning: "Falling back to default tool due to LLM error"
    };
  }
}

/**
 * Validate and fix tool arguments to ensure they match the expected parameters
 * @param {string} toolName - The name of the tool
 * @param {Object} args - The arguments provided by the LLM
 * @param {string} originalQuery - The original user query
 * @returns {Object} - The fixed arguments
 */
function validateAndFixToolArguments(toolName, args, originalQuery) {
  // Create a copy of the arguments
  const fixedArgs = { ...args };
  
  // Fix common issues based on tool name
  switch (toolName) {
    case 'reason':
      // Ensure 'problem' parameter exists
      if (!fixedArgs.problem && (fixedArgs.query || originalQuery)) {
        fixedArgs.problem = fixedArgs.query || originalQuery;
        delete fixedArgs.query; // Remove incorrect parameter
      }
      break;
      
    case 'process-query':
      // Ensure 'query' parameter exists
      if (!fixedArgs.query && originalQuery) {
        fixedArgs.query = originalQuery;
      }
      break;
      
    case 'analyze-text':
      // Ensure 'text' parameter exists
      if (!fixedArgs.text && (fixedArgs.query || originalQuery)) {
        fixedArgs.text = fixedArgs.query || originalQuery;
        delete fixedArgs.query; // Remove incorrect parameter
      }
      // Ensure valid analysisType
      if (!fixedArgs.analysisType || !['sentiment', 'summary', 'keywords', 'entities'].includes(fixedArgs.analysisType)) {
        fixedArgs.analysisType = 'summary'; // Default to summary
      }
      break;
      
    case 'consult-expert':
      // Ensure 'question' parameter exists
      if (!fixedArgs.question && (fixedArgs.query || originalQuery)) {
        fixedArgs.question = fixedArgs.query || originalQuery;
        delete fixedArgs.query; // Remove incorrect parameter
      }
      // Ensure valid domain
      if (!fixedArgs.domain || !['technical', 'business', 'scientific', 'creative', 'legal'].includes(fixedArgs.domain)) {
        fixedArgs.domain = 'technical'; // Default to technical
      }
      break;
      
    case 'validate-data':
      // Ensure schema exists
      if (!fixedArgs.schema) {
        fixedArgs.schema = {
          type: typeof fixedArgs.data === 'string' ? 'string' : 'object',
          properties: {}
        };
      }
      break;
  }
  
  return fixedArgs;
}

/**
 * Process a query using the LLM-based router
 * @param {string} query - The user query
 */
async function processQuery(query) {
  console.log(`\nProcessing query: "${query}"`);
  
  // Try to parse the query as JSON for data validation
  let isJson = false;
  try {
    JSON.parse(query);
    isJson = true;
    console.log("Detected JSON input");
  } catch (e) {
    console.log("Detected text input");
  }

  // Use LLM to determine the most appropriate tool
  const toolSelection = await determineToolWithLLM(query);
  
  // Call the selected tool
  let client = null;
  let layerName = '';
  
  if (toolSelection.layer === 'layer1' && layer1Client) {
    client = layer1Client;
    layerName = 'Layer 1';
  } else if (toolSelection.layer === 'layer2' && layer2Client) {
    client = layer2Client;
    layerName = 'Layer 2';
  } else if (toolSelection.layer === 'layer3' && layer3Client) {
    client = layer3Client;
    layerName = 'Layer 3';
  }
  
  if (client) {
    try {
      await callTool(layerName, client, toolSelection.toolName, toolSelection.args);
    } catch (error) {
      console.error(`Error calling selected tool:`, error.message);
      console.error(error.stack);
      
      // Fall back to a simpler approach if the selected tool fails
      console.log("Selected tool failed. Trying a simpler approach...");
      
      if (layer3Client) {
        try {
          await callTool('Layer 3', layer3Client, 'process-query', { query });
        } catch (error) {
          console.error(`Error with fallback to Layer 3:`, error.message);
        }
      } else if (layer2Client) {
        try {
          await callTool('Layer 2', layer2Client, 'analyze-text', { text: query, analysisType: 'summary' });
        } catch (error) {
          console.error(`Error with fallback to Layer 2:`, error.message);
        }
      }
    }
  } else {
    console.log(`Selected layer ${toolSelection.layer} is not available.`);
    
    // Try to use any available layer
    if (layer3Client) {
      await callTool('Layer 3', layer3Client, 'process-query', { query });
    } else if (layer2Client) {
      await callTool('Layer 2', layer2Client, 'analyze-text', { text: query, analysisType: 'summary' });
    } else if (layer1Client) {
      await callTool('Layer 1', layer1Client, 'validate-data', { 
        schema: { type: 'string' }, 
        data: query 
      });
    } else {
      console.log("No layers are available. Please make sure the MCP servers are running.");
    }
  }
}

/**
 * Interactive mode
 */
function startInteractiveMode() {
  console.log('\n=== MCP Test All Layers ===');
  console.log('Type your queries or "exit" to quit\n');
  console.log('Type "tools" to list available tools\n');
  
  rl.question('> ', async (query) => {
    if (query.toLowerCase() === 'exit') {
      console.log('Exiting...');
      cleanupAndExit();
    } else if (query.toLowerCase() === 'tools') {
      // List tools for all connected layers
      if (layer1Client) {
        await listTools('Layer 1', layer1Client);
      }
      
      if (layer2Client) {
        await listTools('Layer 2', layer2Client);
      }
      
      if (layer3Client) {
        await listTools('Layer 3', layer3Client);
      }
      
      startInteractiveMode();
    } else {
      try {
        await processQuery(query);
      } catch (error) {
        console.error('Error processing query:', error.message);
        console.error(error.stack);
      }
      startInteractiveMode();
    }
  });
}

/**
 * Clean up resources and exit
 */
function cleanupAndExit(code = 0) {
  console.log('Cleaning up resources and exiting');
  
  // Close readline interface
  try {
    rl.close();
    console.log('Closed readline interface');
  } catch (error) {
    console.error('Error closing readline interface:', error.message);
  }
  
  // Exit process
  console.log('Exiting process');
  process.exit(code);
}

/**
 * Main function to initialize and connect to all MCP layers
 */
async function main() {
  try {
    console.log('Initializing MCP test client...');
    
    // Define layer endpoints
    const layer1Endpoint = 'http://localhost:3001/mcp/events';
    const layer2Endpoint = 'http://localhost:3002/mcp/events';
    const layer3Endpoint = 'http://localhost:3003/mcp/events';
    
    // Initialize Layer 1 client
    layer1Client = new Layer1Client({
      name: 'aipi-layer1-client',
      version: '1.0.0'
    });
    
    // Initialize Layer 2 client
    layer2Client = new Layer2Client({
      name: 'aipi-layer2-client',
      version: '1.0.0'
    });
    
    // Initialize Layer 3 client
    layer3Client = new Layer3Client({
      name: 'aipi-layer3-client',
      version: '1.0.0'
    });
    
    // Connect to Layer 1
    console.log('Connecting to Layer 1 MCP Server...');
    try {
      let transport;
      if (SSEClientTransport) {
        transport = new SSEClientTransport({ endpoint: layer1Endpoint });
      } else if (StdioClientTransport) {
        transport = new StdioClientTransport({
          command: 'node',
          args: ['src/mcp/demo.js', '1'],
          cwd: process.cwd()
        });
      } else {
        throw new Error('No transport available');
      }
      
      await layer1Client.connect(transport);
      console.log('✅ Connected to Layer 1 MCP Server');
    } catch (error) {
      console.warn(`⚠️ Failed to connect to Layer 1 MCP Server: ${error.message}`);
    }
    
    // Connect to Layer 2
    console.log('Connecting to Layer 2 MCP Server...');
    try {
      let transport;
      if (SSEClientTransport) {
        transport = new SSEClientTransport({ endpoint: layer2Endpoint });
      } else if (StdioClientTransport) {
        transport = new StdioClientTransport({
          command: 'node',
          args: ['src/mcp/demo.js', '2'],
          cwd: process.cwd()
        });
      } else {
        throw new Error('No transport available');
      }
      
      await layer2Client.connect(transport);
      console.log('✅ Connected to Layer 2 MCP Server');
    } catch (error) {
      console.warn(`⚠️ Failed to connect to Layer 2 MCP Server: ${error.message}`);
    }
    
    // Connect to Layer 3
    console.log('Connecting to Layer 3 MCP Server...');
    try {
      let transport;
      if (SSEClientTransport) {
        transport = new SSEClientTransport({ endpoint: layer3Endpoint });
      } else if (StdioClientTransport) {
        transport = new StdioClientTransport({
          command: 'node',
          args: ['src/mcp/demo.js', '3'],
          cwd: process.cwd()
        });
      } else {
        throw new Error('No transport available');
      }
      
      await layer3Client.connect(transport);
      console.log('✅ Connected to Layer 3 MCP Server');
    } catch (error) {
      console.warn(`⚠️ Failed to connect to Layer 3 MCP Server: ${error.message}`);
    }
    
    // Check if at least one client is connected
    if (!layer1Client && !layer2Client && !layer3Client) {
      console.error('No MCP servers available. Make sure to run "npm run mcp:all" first.');
      cleanupAndExit(1);
      return;
    }
    
    // Start interactive mode
    startInteractiveMode();
  } catch (error) {
    console.error('Error in main function:', error);
    console.error(error.stack);
    cleanupAndExit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT signal. Terminating...');
  cleanupAndExit();
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM signal. Terminating...');
  cleanupAndExit();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('\nUncaught exception:', error.message);
  console.error(error.stack);
  cleanupAndExit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('\nUnhandled promise rejection:', 
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? reason.stack : undefined
  );
  cleanupAndExit(1);
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error in main', error.message);
    console.error(error.stack);
    cleanupAndExit(1);
  });
}

module.exports = { main }; 