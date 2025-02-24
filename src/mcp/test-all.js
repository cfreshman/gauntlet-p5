/**
 * MCP Test All Script
 * 
 * This script tests all three MCP layers simultaneously.
 * It connects to each layer and demonstrates their capabilities.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { spawn } = require('child_process');
const readline = require('readline');
const logger = require('../utils/logger');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Check if SSE client transport is available
let SSEClientTransport;
try {
  SSEClientTransport = require('@modelcontextprotocol/sdk/client/sse.js').SSEClientTransport;
} catch (error) {
  logger.warn('SSEClientTransport not available. Will use StdioClientTransport as fallback.', { error: error.message });
}

// Try to load StdioClientTransport as fallback
let StdioClientTransport;
try {
  StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport;
} catch (error) {
  logger.warn('StdioClientTransport not available.', { error: error.message });
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

// Initialize clients for each layer
const clients = {
  layer1: null,
  layer2: null,
  layer3: null
};

// Store child processes for cleanup
const processes = [];

/**
 * Initialize and connect a client to a specific layer using SSE
 * @param {string} layerName - The name of the layer (layer1, layer2, layer3)
 * @param {number} port - The port to connect to
 * @returns {Promise<Client>} - The connected client
 */
async function initializeSSEClient(layerName, port) {
  if (!SSEClientTransport) {
    throw new Error('SSEClientTransport not available');
  }

  logger.info(`Initializing ${layerName} client with SSE transport`);
  
  const client = new Client(
    {
      name: `aipi-${layerName}-test-client`,
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
  
  try {
    // Create SSE transport with the correct URL format
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${port}/mcp/events`)
    );
    
    await client.connect(transport);
    logger.info(`Connected to ${layerName} server via SSE`);
    return client;
  } catch (error) {
    logger.error(`Error connecting to ${layerName} server via SSE`, { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Initialize and connect a client to a specific layer using stdio
 * @param {string} layerName - The name of the layer (layer1, layer2, layer3)
 * @param {string} layer - The layer number (1, 2, 3)
 * @returns {Promise<Client>} - The connected client
 */
async function initializeStdioClient(layerName, layer) {
  if (!StdioClientTransport) {
    throw new Error('StdioClientTransport not available');
  }

  logger.info(`Initializing ${layerName} client with stdio transport`);
  
  const client = new Client(
    {
      name: `aipi-${layerName}-test-client`,
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
  
  // Start the server process
  const serverProcess = spawn('node', ['src/mcp/demo.js', layer], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  processes.push(serverProcess);
  
  // Handle server output
  serverProcess.stdout.on('data', (data) => {
    logger.debug(`${layerName} Server: ${data.toString().trim()}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    logger.error(`${layerName} Server Error: ${data.toString().trim()}`);
  });
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['src/mcp/demo.js', layer],
    cwd: process.cwd()
  });
  
  try {
    await client.connect(transport);
    logger.info(`Connected to ${layerName} server via stdio`);
    return client;
  } catch (error) {
    logger.error(`Error connecting to ${layerName} server via stdio`, { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Initialize and connect a client to a specific layer
 * @param {string} layerName - The name of the layer (layer1, layer2, layer3)
 * @param {number} port - The port to connect to
 * @param {string} layer - The layer number (1, 2, 3)
 * @returns {Promise<Client>} - The connected client
 */
async function initializeClient(layerName, port, layer) {
  // Try SSE first, fall back to stdio
  try {
    if (SSEClientTransport) {
      return await initializeSSEClient(layerName, port);
    }
  } catch (error) {
    logger.warn(`Failed to connect to ${layerName} via SSE, trying stdio`, { error: error.message });
  }
  
  // Fall back to stdio
  try {
    if (StdioClientTransport) {
      return await initializeStdioClient(layerName, layer);
    }
  } catch (error) {
    logger.error(`Failed to connect to ${layerName} via stdio`, { error: error.message, stack: error.stack });
    throw error;
  }
  
  throw new Error('No transport available');
}

/**
 * List available tools for a specific layer
 * @param {string} layerName - The name of the layer (layer1, layer2, layer3)
 * @param {Client} client - The client for the layer
 */
async function listTools(layerName, client) {
  try {
    const tools = await client.listTools();
    console.log(`\n${layerName} Tools:`);
    tools.tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });
  } catch (error) {
    console.error(`Error listing ${layerName} tools:`, error.message);
    logger.error(`Error listing ${layerName} tools:`, { error: error.message, stack: error.stack });
  }
}

/**
 * Call a tool on a specific layer
 * @param {string} layerName - The name of the layer (layer1, layer2, layer3)
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
    logger.error(`Error calling ${toolName} on ${layerName}:`, { error: error.message, stack: error.stack });
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
 * @param {Object} availableTools - Object containing available tools for each layer
 * @returns {Promise<{layer: string, toolName: string, args: Object}>} - The selected tool and arguments
 */
async function determineToolWithLLM(query, availableTools) {
  try {
    console.log("Using GPT-4o to determine the most appropriate tool...");
    
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
    logger.error('Error determining tool with LLM', { error: error.message, stack: error.stack });
    console.error('Error determining tool with LLM:', error.message);
    
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
 * Process a query across all layers
 * @param {string} query - The user query
 */
async function processQuery(query) {
  console.log(`\nProcessing query: "${query}"`);
  
  // Try to parse the query as JSON for data validation
  let data;
  let isJson = false;
  try {
    data = JSON.parse(query);
    isJson = true;
    console.log("Detected JSON input");
  } catch (e) {
    data = query;
    console.log("Detected text input");
  }

  // First, get all available tools from each layer
  const availableTools = {};
  
  for (const [layerName, client] of Object.entries(clients)) {
    if (client) {
      try {
        const toolsList = await client.listTools();
        availableTools[layerName] = toolsList.tools;
        console.log(`Found ${toolsList.tools.length} tools in ${layerName}`);
      } catch (error) {
        logger.error(`Error listing tools for ${layerName}`, { error: error.message, stack: error.stack });
      }
    }
  }

  // Use LLM to determine the most appropriate tool
  const toolSelection = await determineToolWithLLM(query, availableTools);
  
  // Call the selected tool
  if (clients[toolSelection.layer]) {
    try {
      await callTool(
        toolSelection.layer.charAt(0).toUpperCase() + toolSelection.layer.slice(1), 
        clients[toolSelection.layer], 
        toolSelection.toolName, 
        toolSelection.args
      );
    } catch (error) {
      logger.error(`Error calling selected tool ${toolSelection.toolName}`, { error: error.message, stack: error.stack });
      console.error(`Error calling selected tool:`, error.message);
      
      // Fall back to rule-based routing if LLM-selected tool fails
      console.log("Falling back to rule-based routing...");
      await processQueryRuleBased(query, data, isJson, availableTools);
    }
  } else {
    console.log(`Selected layer ${toolSelection.layer} is not available. Falling back to rule-based routing.`);
    await processQueryRuleBased(query, data, isJson, availableTools);
  }
}

/**
 * Process a query using rule-based routing (fallback method)
 * @param {string} query - The original query string
 * @param {any} data - The parsed data (if JSON) or the original query
 * @param {boolean} isJson - Whether the query is JSON
 * @param {Object} availableTools - Object containing available tools for each layer
 */
async function processQueryRuleBased(query, data, isJson, availableTools) {
  // Analyze the query to determine the best tool for each layer
  if (isJson) {
    // For JSON data, prioritize data processing tools
    
    // Layer 1: Use data validation or transformation tools
    if (clients.layer1 && availableTools.layer1) {
      const validateTool = availableTools.layer1.find(tool => tool.name === 'validate-data');
      const transformTool = availableTools.layer1.find(tool => tool.name === 'transform-data');
      
      if (validateTool) {
        try {
          console.log("Using Layer 1 for data validation");
          await callTool('Layer 1', clients.layer1, 'validate-data', {
            schema: {
              type: 'object',
              properties: {}
            },
            data: data
          });
        } catch (error) {
          logger.error('Error processing JSON with Layer 1', { error: error.message, stack: error.stack });
        }
      } else if (transformTool) {
        try {
          console.log("Using Layer 1 for data transformation");
          await callTool('Layer 1', clients.layer1, 'transform-data', {
            sourceFormat: 'json',
            targetFormat: 'csv',
            data: JSON.stringify(data)
          });
        } catch (error) {
          logger.error('Error transforming data with Layer 1', { error: error.message, stack: error.stack });
        }
      }
    }
    
    // Layer 2: Use data enrichment if available
    if (clients.layer2 && availableTools.layer2) {
      const enrichTool = availableTools.layer2.find(tool => tool.name === 'enrich-data');
      
      if (enrichTool) {
        try {
          console.log("Using Layer 2 for data enrichment");
          await callTool('Layer 2', clients.layer2, 'enrich-data', {
            data: data,
            enrichmentType: 'descriptions'
          });
        } catch (error) {
          logger.error('Error enriching data with Layer 2', { error: error.message, stack: error.stack });
        }
      }
    }
  } else {
    // For text queries, use natural language processing tools
    
    // Check if the query looks like a question
    const isQuestion = query.trim().endsWith('?') || 
                      query.toLowerCase().startsWith('what') || 
                      query.toLowerCase().startsWith('how') ||
                      query.toLowerCase().startsWith('why') ||
                      query.toLowerCase().startsWith('when') ||
                      query.toLowerCase().startsWith('where') ||
                      query.toLowerCase().startsWith('who') ||
                      query.toLowerCase().startsWith('can');
    
    // Check if it looks like a command
    const isCommand = query.toLowerCase().startsWith('analyze') ||
                     query.toLowerCase().startsWith('transform') ||
                     query.toLowerCase().startsWith('validate') ||
                     query.toLowerCase().startsWith('process') ||
                     query.toLowerCase().startsWith('summarize') ||
                     query.toLowerCase().startsWith('extract');
    
    // Route to the most appropriate layer based on query type
    if (isQuestion) {
      // Questions are best handled by Layer 3's natural language capabilities
      if (clients.layer3 && availableTools.layer3) {
        const processQueryTool = availableTools.layer3.find(tool => tool.name === 'process-query');
        const reasonTool = availableTools.layer3.find(tool => tool.name === 'reason');
        const consultTool = availableTools.layer3.find(tool => tool.name === 'consult-expert');
        
        if (processQueryTool) {
          try {
            console.log("Using Layer 3 for natural language query processing");
            await callTool('Layer 3', clients.layer3, 'process-query', {
              query: query,
              responseFormat: 'detailed'
            });
          } catch (error) {
            logger.error('Error processing query with Layer 3', { error: error.message, stack: error.stack });
          }
        } else if (reasonTool) {
          try {
            console.log("Using Layer 3 for reasoning");
            await callTool('Layer 3', clients.layer3, 'reason', {
              problem: query,
              steps: 3
            });
          } catch (error) {
            logger.error('Error reasoning with Layer 3', { error: error.message, stack: error.stack });
          }
        }
      } else if (clients.layer2 && availableTools.layer2) {
        // Fall back to Layer 2 if Layer 3 is not available
        const analyzeTextTool = availableTools.layer2.find(tool => tool.name === 'analyze-text');
        
        if (analyzeTextTool) {
          try {
            console.log("Using Layer 2 for text analysis (Layer 3 not available)");
            await callTool('Layer 2', clients.layer2, 'analyze-text', {
              text: query,
              analysisType: 'summary'
            });
          } catch (error) {
            logger.error('Error analyzing text with Layer 2', { error: error.message, stack: error.stack });
          }
        }
      }
    } else if (isCommand) {
      // Commands often map to specific tools in Layer 1 or 2
      
      // Check for specific command types
      if (query.toLowerCase().includes('analyze') || 
          query.toLowerCase().includes('sentiment') || 
          query.toLowerCase().includes('summarize')) {
        
        // Text analysis is best handled by Layer 2
        if (clients.layer2 && availableTools.layer2) {
          const analyzeTextTool = availableTools.layer2.find(tool => tool.name === 'analyze-text');
          
          if (analyzeTextTool) {
            // Determine analysis type based on query
            let analysisType = 'summary';
            if (query.toLowerCase().includes('sentiment')) {
              analysisType = 'sentiment';
            } else if (query.toLowerCase().includes('keyword')) {
              analysisType = 'keywords';
            } else if (query.toLowerCase().includes('entit')) {
              analysisType = 'entities';
            }
            
            try {
              console.log(`Using Layer 2 for text analysis (${analysisType})`);
              await callTool('Layer 2', clients.layer2, 'analyze-text', {
                text: query.replace(/^analyze|summarize|extract/i, '').trim(),
                analysisType: analysisType
              });
            } catch (error) {
              logger.error('Error analyzing text with Layer 2', { error: error.message, stack: error.stack });
            }
          }
        }
      } else if (query.toLowerCase().includes('validate') || 
                query.toLowerCase().includes('transform')) {
        
        // Data operations are best handled by Layer 1
        if (clients.layer1 && availableTools.layer1) {
          if (query.toLowerCase().includes('validate')) {
            const validateTool = availableTools.layer1.find(tool => tool.name === 'validate-data');
            
            if (validateTool) {
              try {
                console.log("Using Layer 1 for data validation");
                await callTool('Layer 1', clients.layer1, 'validate-data', {
                  schema: {
                    type: 'string',
                    properties: {}
                  },
                  data: query.replace(/^validate/i, '').trim()
                });
              } catch (error) {
                logger.error('Error validating with Layer 1', { error: error.message, stack: error.stack });
              }
            }
          } else if (query.toLowerCase().includes('transform')) {
            const transformTool = availableTools.layer1.find(tool => tool.name === 'transform-data');
            
            if (transformTool) {
              try {
                console.log("Using Layer 1 for data transformation");
                await callTool('Layer 1', clients.layer1, 'transform-data', {
                  sourceFormat: 'json',
                  targetFormat: 'csv',
                  data: query.replace(/^transform/i, '').trim()
                });
              } catch (error) {
                logger.error('Error transforming with Layer 1', { error: error.message, stack: error.stack });
              }
            }
          }
        }
      }
    } else {
      // For general statements or unclear queries, use Layer 3 if available, then fall back
      if (clients.layer3 && availableTools.layer3) {
        const processQueryTool = availableTools.layer3.find(tool => tool.name === 'process-query');
        
        if (processQueryTool) {
          try {
            console.log("Using Layer 3 for general query processing");
            await callTool('Layer 3', clients.layer3, 'process-query', {
              query: query,
              responseFormat: 'concise'
            });
          } catch (error) {
            logger.error('Error processing query with Layer 3', { error: error.message, stack: error.stack });
          }
        }
      } else if (clients.layer2 && availableTools.layer2) {
        const analyzeTextTool = availableTools.layer2.find(tool => tool.name === 'analyze-text');
        
        if (analyzeTextTool) {
          try {
            console.log("Using Layer 2 for text analysis (Layer 3 not available)");
            await callTool('Layer 2', clients.layer2, 'analyze-text', {
              text: query,
              analysisType: 'summary'
            });
          } catch (error) {
            logger.error('Error analyzing text with Layer 2', { error: error.message, stack: error.stack });
          }
        }
      }
    }
  }
}

/**
 * Interactive mode
 */
function startInteractiveMode() {
  console.log('\n=== MCP Test All Layers ===');
  console.log('Type your queries or "exit" to quit\n');
  
  rl.question('> ', async (query) => {
    if (query.toLowerCase() === 'exit') {
      console.log('Exiting...');
      cleanupAndExit();
    } else if (query.toLowerCase() === 'tools') {
      // List tools for all connected layers
      for (const [layerName, client] of Object.entries(clients)) {
        if (client) {
          try {
            await listTools(layerName.charAt(0).toUpperCase() + layerName.slice(1), client);
          } catch (error) {
            logger.error(`Error listing tools for ${layerName}`, { error: error.message, stack: error.stack });
          }
        }
      }
      startInteractiveMode();
    } else {
      try {
        await processQuery(query);
      } catch (error) {
        logger.error('Error processing query', { error: error.message, stack: error.stack });
        console.error('Error processing query:', error.message);
      }
      startInteractiveMode();
    }
  });
}

/**
 * Clean up resources and exit
 */
function cleanupAndExit() {
  logger.info('Cleaning up resources and exiting');
  
  // Kill all child processes
  processes.forEach(proc => {
    try {
      if (proc && !proc.killed) {
        proc.kill();
        logger.debug('Killed child process');
      }
    } catch (error) {
      logger.error('Error killing process:', { error: error.message, stack: error.stack });
    }
  });
  
  // Close readline interface
  try {
    rl.close();
    logger.debug('Closed readline interface');
  } catch (error) {
    logger.error('Error closing readline interface:', { error: error.message, stack: error.stack });
  }
  
  // Exit process
  logger.info('Exiting process');
  process.exit(0);
}

/**
 * Main function
 */
async function main() {
  try {
    logger.info('Starting MCP Test All Layers');
    
    // Initialize clients for each layer
    try {
      clients.layer1 = await initializeClient('layer1', ports.layer1, '1');
      await listTools('Layer 1', clients.layer1);
    } catch (error) {
      logger.warn('Layer 1 server not available', { error: error.message });
    }
    
    try {
      clients.layer2 = await initializeClient('layer2', ports.layer2, '2');
      await listTools('Layer 2', clients.layer2);
    } catch (error) {
      logger.warn('Layer 2 server not available', { error: error.message });
    }
    
    try {
      clients.layer3 = await initializeClient('layer3', ports.layer3, '3');
      await listTools('Layer 3', clients.layer3);
    } catch (error) {
      logger.warn('Layer 3 server not available', { error: error.message });
    }
    
    // Check if at least one client is connected
    const connectedClients = Object.values(clients).filter(client => client !== null);
    if (connectedClients.length === 0) {
      logger.error('No MCP servers available. Make sure to run "npm run mcp:all" first.');
      cleanupAndExit();
      return;
    }
    
    // Start interactive mode
    startInteractiveMode();
  } catch (error) {
    logger.error('Error in MCP Test All Layers', { error: error.message, stack: error.stack });
    cleanupAndExit();
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('Terminating...');
  cleanupAndExit();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  cleanupAndExit();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { 
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
  cleanupAndExit();
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error in main', { error: error.message, stack: error.stack });
    cleanupAndExit();
  });
}

module.exports = { main }; 