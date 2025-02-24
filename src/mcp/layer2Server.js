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

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Layer 2 MCP Server
 * Provides agentic tools and resources that combine code execution with LLM capabilities
 */
class Layer2Server {
  /**
   * Create a new Layer 2 MCP Server
   * @param {Object} options - Server configuration options
   * @param {Object} options.layer1Server - Reference to Layer 1 server for delegation
   */
  constructor(options = {}) {
    this.server = new McpServer({
      name: options.name || 'aipi-layer2-server',
      version: options.version || '1.0.0'
    });
    
    this.layer1Server = options.layer1Server;
    
    if (!this.layer1Server) {
      logger.warn('Layer 2 server initialized without Layer 1 reference');
    }
    
    this.registerDefaultTools();
    this.registerDefaultResources();
    this.registerDefaultPrompts();
    
    logger.info(`Layer 2 MCP Server initialized`);
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
    
    logger.info('Default Layer 2 tools registered');
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