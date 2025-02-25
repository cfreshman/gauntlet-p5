/**
 * Layer 2 (Agentic) MCP Server Implementation
 * 
 * This file implements the agentic MCP server for Layer 2,
 * which combines traditional code execution with LLM integration.
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const OpenAI = require('openai');
const logger = require('../utils/logger');
const { MCPBoundaryError } = require('../utils/errors');
const { registerMusicAnalysisTools } = require('../layer2/musicAnalysisTools');
const { registerPlaylistGenerationTools } = require('../layer2/playlistGenerationTools');
const { registerMusicDiscoveryTools } = require('../layer2/musicDiscoveryTools');
const { registerLastfmDiscoveryTools } = require('../layer2/lastfmDiscoveryTools');

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Try to load SSE client transport
let SSEClientTransport;
try {
  const sseModule = require('@modelcontextprotocol/sdk/client/sse.js');
  SSEClientTransport = sseModule.SSEClientTransport;
  logger.debug('SSEClientTransport loaded successfully for Layer2Server');
} catch (error) {
  logger.warn('SSEClientTransport not available for Layer2Server:', error.message);
}

// Try to load StdioClientTransport as fallback
let StdioClientTransport;
try {
  const stdioModule = require('@modelcontextprotocol/sdk/client/stdio.js');
  StdioClientTransport = stdioModule.StdioClientTransport;
  logger.debug('StdioClientTransport loaded successfully for Layer2Server');
} catch (error) {
  logger.warn('StdioClientTransport not available for Layer2Server:', error.message);
}

/**
 * Layer 2 MCP Server
 * Provides agentic tools and resources that combine code execution with LLM capabilities
 */
class Layer2Server {
  /**
   * Create a new Layer 2 MCP Server
   * @param {Object} options - Server configuration options
   * @param {string} options.layer1Endpoint - Endpoint URL for Layer 1 API
   */
  constructor(options = {}) {
    this.server = new McpServer({
      name: options.name || 'aipi-layer2-server',
      version: options.version || '1.0.0'
    });
    
    this.layer1Endpoint = options.layer1Endpoint;
    this.layer1Client = null;
    
    if (!this.layer1Endpoint) {
      logger.warn('Layer 2 server initialized without Layer 1 endpoint');
    } else {
      logger.info(`Layer 2 server initialized with Layer 1 endpoint: ${this.layer1Endpoint}`);
      this.initializeLayer1Client();
    }
    
    this.registerDefaultTools();
    this.registerDefaultResources();
    this.registerDefaultPrompts();
    
    // Register Layer 2 tools
    registerMusicAnalysisTools(this.server);
    registerPlaylistGenerationTools(this.server);
    registerMusicDiscoveryTools(this.server);
    registerLastfmDiscoveryTools(this.server);
    
    logger.info(`Layer 2 MCP Server initialized`);
  }
  
  /**
   * Initialize the Layer 1 client
   * @private
   */
  async initializeLayer1Client() {
    try {
      const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
      
      // Create Layer 1 client
      this.layer1Client = new Client(
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
      
      // Connect to Layer 1 server
      let transport;
      if (SSEClientTransport) {
        transport = new SSEClientTransport({ endpoint: this.layer1Endpoint });
      } else if (StdioClientTransport) {
        transport = new StdioClientTransport({
          command: 'node',
          args: ['src/mcp/demo.js', '1'],
          cwd: process.cwd()
        });
      } else {
        throw new Error('No transport available for Layer 1 client');
      }
      
      await this.layer1Client.connect(transport);
      logger.info('Layer 2 server connected to Layer 1 server');
      
      // List available tools from Layer 1
      await this.queryLayer1Tools();
    } catch (error) {
      logger.error('Error initializing Layer 1 client:', error.message);
      this.layer1Client = null;
    }
  }
  
  /**
   * Query available tools from Layer 1
   * @returns {Promise<Array>} - List of available tools
   * @private
   */
  async queryLayer1Tools() {
    if (!this.layer1Client) {
      logger.warn('Cannot query Layer 1 tools: Layer 1 client not initialized');
      return [];
    }
    
    try {
      const tools = await this.layer1Client.listTools();
      logger.info(`Layer 2 server found ${tools.tools.length} tools in Layer 1`);
      this.layer1Tools = tools.tools;
      return tools.tools;
    } catch (error) {
      logger.error('Error querying Layer 1 tools:', error.message);
      return [];
    }
  }
  
  /**
   * Call a tool on Layer 1
   * @param {string} toolName - The name of the tool to call
   * @param {Object} args - The arguments for the tool
   * @returns {Promise<Object>} - The result of the tool call
   * @private
   */
  async callLayer1Tool(toolName, args) {
    if (!this.layer1Client) {
      throw new Error('Layer 1 client not initialized');
    }
    
    try {
      logger.debug(`Calling Layer 1 tool: ${toolName}`, { args });
      const result = await this.layer1Client.callTool({
        name: toolName,
        arguments: args
      });
      
      return result;
    } catch (error) {
      logger.error(`Error calling Layer 1 tool ${toolName}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Register the default tools for Layer 2
   * These tools combine code execution with LLM capabilities
   */
  registerDefaultTools() {
    // Example tool: Text analysis
    this.server.tool(
      "analyze-text",
      "Analyze text using LLM capabilities",
      {
        text: z.string(),
        analysisType: z.enum(['sentiment', 'summary', 'keywords', 'entities'])
      },
      async ({ text, analysisType }) => {
        try {
          logger.debug('Analyzing text', { analysisType, textLength: text.length });
          
          // Construct prompt based on analysis type
          let prompt;
          switch (analysisType) {
            case 'sentiment':
              prompt = `Analyze the sentiment of the following text. Provide a score from -1 (very negative) to 1 (very positive) and explain your reasoning:\n\n${text}`;
              break;
            case 'summary':
              prompt = `Provide a concise summary of the following text in 3-5 sentences:\n\n${text}`;
              break;
            case 'keywords':
              prompt = `Extract the 5-10 most important keywords or phrases from the following text:\n\n${text}`;
              break;
            case 'entities':
              prompt = `Identify and list all named entities (people, organizations, locations, etc.) in the following text:\n\n${text}`;
              break;
            default:
              throw new Error(`Unsupported analysis type: ${analysisType}`);
          }
          
          // Call OpenAI API
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You are a helpful assistant that analyzes text." },
              { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 500
          });
          
          const result = response.choices[0].message.content;
          
          return {
            content: [
              {
                type: "text",
                text: result
              }
            ]
          };
        } catch (error) {
          logger.error('Error analyzing text', { error: error.message });
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
    
    // Example tool: Data enrichment
    this.server.tool(
      "enrich-data",
      "Enrich data with additional information using LLM capabilities",
      {
        data: z.any(),
        enrichmentType: z.enum(['descriptions', 'categories', 'recommendations'])
      },
      async ({ data, enrichmentType }) => {
        try {
          logger.debug('Enriching data', { enrichmentType });
          
          // Convert data to string for LLM processing
          const dataString = JSON.stringify(data, null, 2);
          
          // Construct prompt based on enrichment type
          let prompt;
          switch (enrichmentType) {
            case 'descriptions':
              prompt = `Generate descriptive text for each item in the following data:\n\n${dataString}\n\nProvide a JSON object with the original data plus a 'description' field for each item.`;
              break;
            case 'categories':
              prompt = `Categorize each item in the following data:\n\n${dataString}\n\nProvide a JSON object with the original data plus a 'category' field for each item.`;
              break;
            case 'recommendations':
              prompt = `Generate recommendations based on the following data:\n\n${dataString}\n\nProvide a JSON object with the original data plus a 'recommendations' array for each item.`;
              break;
            default:
              throw new Error(`Unsupported enrichment type: ${enrichmentType}`);
          }
          
          // Call OpenAI API
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You are a helpful assistant that enriches data with additional information." },
              { role: "user", content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 1000
          });
          
          const result = response.choices[0].message.content;
          
          return {
            content: [
              {
                type: "text",
                text: result
              }
            ]
          };
        } catch (error) {
          logger.error('Error enriching data', { error: error.message });
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
    
    // Tool that demonstrates using Layer 1 tools
    this.server.tool(
      "validate-and-transform",
      "Validate data and then transform it using Layer 1 tools",
      {
        data: z.any(),
        sourceFormat: z.string(),
        targetFormat: z.string()
      },
      async ({ data, sourceFormat, targetFormat }) => {
        try {
          logger.debug('Validating and transforming data', { sourceFormat, targetFormat });
          
          if (!this.layer1Client) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Layer 1 client not initialized. Cannot access Layer 1 tools."
                }
              ],
              isError: true
            };
          }
          
          // First, validate the data using Layer 1's validate-data tool
          const validationResult = await this.callLayer1Tool("validate-data", {
            schema: {
              type: typeof data === 'string' ? 'string' : 'object',
              properties: {}
            },
            data: data
          });
          
          // Parse the validation result
          let validationContent = "Validation failed";
          if (validationResult && validationResult.content && validationResult.content.length > 0) {
            validationContent = validationResult.content[0].text;
          }
          
          const validationData = JSON.parse(validationContent);
          
          if (!validationData.isValid) {
            return {
              content: [
                {
                  type: "text",
                  text: `Data validation failed: ${JSON.stringify(validationData.errors)}`
                }
              ],
              isError: true
            };
          }
          
          // Then, transform the data using Layer 1's transform-data tool
          const transformResult = await this.callLayer1Tool("transform-data", {
            sourceFormat,
            targetFormat,
            data: typeof data === 'string' ? data : JSON.stringify(data)
          });
          
          // Get the transformation result
          let transformContent = "Transformation failed";
          if (transformResult && transformResult.content && transformResult.content.length > 0) {
            transformContent = transformResult.content[0].text;
          }
          
          // Enhance the result with LLM capabilities
          const enhancedResult = await this.enhanceTransformationResult(transformContent, targetFormat);
          
          return {
            content: [
              {
                type: "text",
                text: `Validation successful. Transformation result:\n\n${enhancedResult}`
              }
            ]
          };
        } catch (error) {
          logger.error('Error in validate-and-transform', { error: error.message });
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
    
    logger.info('Default Layer 2 tools registered');
  }
  
  /**
   * Enhance a transformation result using LLM capabilities
   * @param {string} result - The transformation result
   * @param {string} format - The format of the result
   * @returns {Promise<string>} - The enhanced result
   * @private
   */
  async enhanceTransformationResult(result, format) {
    try {
      // Call OpenAI API to enhance the result
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are a helpful assistant that enhances ${format} data. Make the data more readable and add helpful comments where appropriate.` 
          },
          { 
            role: "user", 
            content: `Please enhance the following ${format} data:\n\n${result}` 
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      logger.error('Error enhancing transformation result', { error: error.message });
      return result; // Return the original result if enhancement fails
    }
  }
  
  /**
   * Register the default resources for Layer 2
   * These resources provide access to data enhanced with LLM capabilities
   */
  registerDefaultResources() {
    // Example: Documentation resource with LLM-enhanced explanations
    this.server.resource(
      "enhanced-docs",
      "Get documentation with LLM-enhanced explanations",
      "docs://{topic}",
      async (uri, { topic }) => {
        try {
          logger.debug('Fetching enhanced documentation', { topic });
          
          // Basic documentation content
          const basicDocs = {
            'api': 'API documentation for the (AI)PI system',
            'architecture': 'Architecture overview of the (AI)PI system',
            'deployment': 'Deployment instructions for the (AI)PI system',
            'security': 'Security guidelines for the (AI)PI system'
          };
          
          // Check if the topic exists
          if (!basicDocs[topic]) {
            throw new Error(`Documentation for topic '${topic}' not found`);
          }
          
          // Enhance the documentation with LLM
          const prompt = `Enhance the following documentation with more detailed explanations and examples:\n\n${basicDocs[topic]}`;
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You are a helpful assistant that enhances technical documentation." },
              { role: "user", content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 1000
          });
          
          const enhancedDocs = response.choices[0].message.content;
          
          return {
            contents: [
              {
                uri: uri.href,
                text: enhancedDocs
              }
            ]
          };
        } catch (error) {
          logger.error('Error fetching enhanced documentation', { error: error.message });
          throw error;
        }
      }
    );
    
    logger.info('Default Layer 2 resources registered');
  }
  
  /**
   * Register the default prompts for Layer 2
   * These prompts provide templates for common LLM interactions
   */
  registerDefaultPrompts() {
    // Example: Code review prompt
    this.server.prompt(
      "code-review",
      "Review code for issues and improvements",
      {
        code: z.string(),
        language: z.string().optional(),
        focus: z.enum(['security', 'performance', 'readability', 'all']).optional()
      },
      ({ code, language, focus }) => {
        const focusArea = focus || 'all';
        const codeLanguage = language || 'javascript';
        
        return {
          messages: [
            {
              role: "system",
              content: {
                type: "text",
                text: `You are a code review assistant specializing in ${codeLanguage}. Focus on ${focusArea} aspects of the code.`
              }
            },
            {
              role: "user",
              content: {
                type: "text",
                text: `Please review the following ${codeLanguage} code:\n\n\`\`\`${codeLanguage}\n${code}\n\`\`\``
              }
            }
          ]
        };
      }
    );
    
    // Example: Data analysis prompt
    this.server.prompt(
      "data-analysis",
      "Analyze data and provide insights",
      {
        data: z.string(),
        format: z.enum(['json', 'csv', 'text']),
        analysisGoal: z.string()
      },
      ({ data, format, analysisGoal }) => {
        return {
          messages: [
            {
              role: "system",
              content: {
                type: "text",
                text: `You are a data analysis assistant. The user will provide ${format} data and you should analyze it according to their goals.`
              }
            },
            {
              role: "user",
              content: {
                type: "text",
                text: `Please analyze the following ${format} data with the goal of ${analysisGoal}:\n\n${data}`
              }
            }
          ]
        };
      }
    );
    
    logger.info('Default Layer 2 prompts registered');
  }
  
  /**
   * Connect the server to a transport
   * @param {Object} transport - The transport to connect to
   * @returns {Promise<void>}
   */
  async connect(transport) {
    try {
      await this.server.connect(transport);
      logger.info('Layer 2 MCP Server connected to transport');
    } catch (error) {
      logger.error('Error connecting Layer 2 MCP Server', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Get the underlying MCP server instance
   * @returns {McpServer} - The MCP server instance
   */
  getServer() {
    return this.server;
  }
}

module.exports = Layer2Server; 