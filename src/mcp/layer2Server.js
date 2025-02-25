/**
 * Layer 2 (Agentic) MCP Server Implementation
 * 
 * This file implements the agentic MCP server for Layer 2,
 * which combines traditional code execution with LLM integration.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import OpenAI from 'openai';
import logger from '../utils/logger.js';
import { MCPBoundaryError } from '../utils/errors.js';
import { registerMusicAnalysisTools } from '../layer2/musicAnalysisTools.js';
import { registerPlaylistGenerationTools } from '../layer2/playlistGenerationTools.js';
import { registerMusicDiscoveryTools } from '../layer2/musicDiscoveryTools.js';
import { registerLastfmDiscoveryTools } from '../layer2/lastfmDiscoveryTools.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { WebSocketServerTransport, WebSocketClientTransport } from '../utils/ws-transport.js';
import dotenv from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

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
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.server = new McpServer({
      name: options.name || 'aipi-layer2-server',
      version: options.version || '1.0.0'
    });
    
    // Create express app
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
    
    // Create WebSocket server
    this.wss = null;
    
    // Track current transport
    this.transport = null;
    
    // Initialize Layer 1 client if endpoint is provided
    if (options.layer1Endpoint) {
      this.layer1Endpoint = options.layer1Endpoint;
      logger.info(`Layer 2 server initialized with Layer 1 endpoint: ${this.layer1Endpoint}`);
      this.initializeLayer1Client();
    } else {
      logger.info('Layer 2 server initialized without Layer 1 endpoint');
    }
    
    this.layer1Client = null;
    
    // Register tools
    registerMusicAnalysisTools(this.server);
    registerPlaylistGenerationTools(this.server);
    registerMusicDiscoveryTools(this.server);
    registerLastfmDiscoveryTools(this.server);
    this.registerDefaultTools();
    this.registerDefaultResources();
    this.registerDefaultPrompts();
    
    // Set up endpoints
    this.setupEndpoints();
    
    logger.info('Layer 2 MCP Server initialized');
  }
  
  /**
   * Initialize the Layer 1 client
   * @private
   */
  async initializeLayer1Client() {
    try {
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
      
      // Create WebSocket connection to Layer 1
      const ws = new WebSocket('ws://localhost:3011');
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      
      // Create transport and connect
      const transport = new WebSocketClientTransport(ws);
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
   * Query tools from Layer 1
   * @returns {Promise<Array>} - Array of tools from Layer 1
   */
  async queryLayer1Tools() {
    if (!this.layer1Client) {
      logger.debug('Cannot query Layer 1 tools: Layer 1 client not initialized');
      return [];
    }
    
    try {
      const response = await this.layer1Client.listTools();
      logger.info(`Layer 2 server found ${response.tools.length} tools in Layer 1`);
      return response.tools;
    } catch (error) {
      logger.error(`Error querying Layer 1 tools: ${error.message}`);
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
          const response = await this.openai.chat.completions.create({
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
          const response = await this.openai.chat.completions.create({
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
      const response = await this.openai.chat.completions.create({
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
          
          const response = await this.openai.chat.completions.create({
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
   * Get the underlying MCP server instance
   * @returns {McpServer} - The MCP server instance
   */
  getServer() {
    return this.server;
  }

  setupEndpoints() {
    // Create WebSocket server
    this.wss = new WebSocketServer({ port: 3012 });

    this.wss.on('connection', (ws) => {
      logger.info('Layer 2: WebSocket connection received');

      // Create transport and connect
      logger.info('Layer 2: Creating WebSocket transport');
      this.transport = new WebSocketServerTransport(ws);
      
      logger.info('Layer 2: Connecting transport to server');
      this.server.connect(this.transport);

      // Handle client disconnect
      ws.on('close', () => {
        logger.info('Layer 2: Client disconnected');
        this.transport = null;
      });

      logger.info('Layer 2: WebSocket connection established');
    });

    // Add health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok',
        hasTransport: !!this.transport,
        layer1Connected: this.layer1Client?.isConnected() || false
      });
    });
  }

  async start(port = 3002) {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        logger.info(`Layer 2 HTTP server listening on port ${port}`);
        logger.info('Layer 2 WebSocket server listening on port 3012');
        resolve();
      });
    });
  }
}

export { Layer2Server }; 