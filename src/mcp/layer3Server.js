/**
 * Layer 3 (Expert) MCP Server Implementation
 * 
 * This file implements the expert MCP server for Layer 3,
 * which provides LLM-only orchestration capabilities.
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
 * Layer 3 MCP Server
 * Provides expert-level LLM-only orchestration capabilities
 */
class Layer3Server {
  /**
   * Create a new Layer 3 MCP Server
   * @param {Object} options - Server configuration options
   * @param {Object} options.layer2Server - Reference to Layer 2 server for delegation
   */
  constructor(options = {}) {
    this.server = new McpServer({
      name: options.name || 'aipi-layer3-server',
      version: options.version || '1.0.0'
    });
    
    this.layer2Server = options.layer2Server;
    
    if (!this.layer2Server) {
      logger.warn('Layer 3 server initialized without Layer 2 reference');
    }
    
    this.registerDefaultTools();
    this.registerDefaultPrompts();
    
    logger.info(`Layer 3 MCP Server initialized`);
  }
  
  /**
   * Register the default tools for Layer 3
   * These tools provide LLM-only orchestration capabilities
   */
  registerDefaultTools() {
    // Example tool: Natural language query processor
    this.server.tool(
      "process-query",
      "Process a natural language query and generate a response",
      {
        query: z.string(),
        context: z.string().optional(),
        responseFormat: z.enum(['concise', 'detailed', 'technical', 'simple']).optional()
      },
      async ({ query, context = '', responseFormat = 'detailed' }) => {
        try {
          logger.debug('Processing natural language query', { queryLength: query.length, responseFormat });
          
          // Construct system prompt based on response format
          let systemPrompt;
          switch (responseFormat) {
            case 'concise':
              systemPrompt = "You are a helpful assistant that provides concise, to-the-point answers.";
              break;
            case 'detailed':
              systemPrompt = "You are a helpful assistant that provides detailed, comprehensive answers.";
              break;
            case 'technical':
              systemPrompt = "You are a helpful assistant that provides technical, precise answers with relevant details.";
              break;
            case 'simple':
              systemPrompt = "You are a helpful assistant that provides simple, easy-to-understand answers without technical jargon.";
              break;
            default:
              systemPrompt = "You are a helpful assistant.";
          }
          
          // Prepare user prompt with context if provided
          const userPrompt = context 
            ? `Context information:\n${context}\n\nQuery: ${query}`
            : query;
          
          // Call OpenAI API
          const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
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
          logger.error('Error processing query', { error: error.message });
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
    
    // Example tool: Multi-step reasoning
    this.server.tool(
      "reason",
      "Perform multi-step reasoning to solve a complex problem",
      {
        problem: z.string(),
        steps: z.number().min(1).max(5).optional(),
        domainKnowledge: z.string().optional()
      },
      async ({ problem, steps = 3, domainKnowledge = '' }) => {
        try {
          logger.debug('Performing multi-step reasoning', { problemLength: problem.length, steps });
          
          const systemPrompt = `You are an expert problem solver that breaks down complex problems into ${steps} clear steps. ${domainKnowledge ? 'Use the following domain knowledge: ' + domainKnowledge : ''}`;
          
          const userPrompt = `Solve the following problem using ${steps} clear steps. For each step, explain your reasoning and how it contributes to the solution:\n\n${problem}`;
          
          // Call OpenAI API
          const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.5,
            max_tokens: 2000
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
          logger.error('Error performing reasoning', { error: error.message });
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
    
    // Example tool: Expert consultation
    this.server.tool(
      "consult-expert",
      "Consult a domain expert for specialized knowledge",
      {
        domain: z.enum(['technical', 'business', 'scientific', 'creative', 'legal']),
        question: z.string(),
        background: z.string().optional()
      },
      async ({ domain, question, background = '' }) => {
        try {
          logger.debug('Consulting expert', { domain, questionLength: question.length });
          
          // Construct system prompt based on domain
          let systemPrompt;
          switch (domain) {
            case 'technical':
              systemPrompt = "You are a senior technical expert with deep knowledge of software engineering, architecture, and development practices.";
              break;
            case 'business':
              systemPrompt = "You are a seasoned business consultant with expertise in strategy, operations, and market analysis.";
              break;
            case 'scientific':
              systemPrompt = "You are a scientific researcher with extensive knowledge across multiple scientific disciplines.";
              break;
            case 'creative':
              systemPrompt = "You are a creative director with expertise in design, content creation, and artistic expression.";
              break;
            case 'legal':
              systemPrompt = "You are a legal expert with knowledge of various legal frameworks and practices.";
              break;
            default:
              systemPrompt = "You are a domain expert.";
          }
          
          // Prepare user prompt with background if provided
          const userPrompt = background 
            ? `Background information:\n${background}\n\nQuestion: ${question}`
            : question;
          
          // Call OpenAI API
          const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 1500
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
          logger.error('Error consulting expert', { error: error.message });
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
    
    logger.info('Default Layer 3 tools registered');
  }
  
  /**
   * Register the default prompts for Layer 3
   * These prompts provide templates for expert-level LLM interactions
   */
  registerDefaultPrompts() {
    // Example: Strategic planning prompt
    this.server.prompt(
      "strategic-planning",
      "Generate a strategic plan for a given objective",
      {
        objective: z.string(),
        timeframe: z.string(),
        constraints: z.string().optional(),
        resources: z.string().optional()
      },
      ({ objective, timeframe, constraints = '', resources = '' }) => {
        return {
          messages: [
            {
              role: "system",
              content: {
                type: "text",
                text: "You are a strategic planning expert that helps organizations develop comprehensive plans to achieve their objectives."
              }
            },
            {
              role: "user",
              content: {
                type: "text",
                text: `Please create a strategic plan for the following objective: ${objective}\n\nTimeframe: ${timeframe}\n${constraints ? 'Constraints: ' + constraints + '\n' : ''}${resources ? 'Available Resources: ' + resources : ''}`
              }
            }
          ]
        };
      }
    );
    
    // Example: Expert analysis prompt
    this.server.prompt(
      "expert-analysis",
      "Provide expert analysis on a specific topic",
      {
        topic: z.string(),
        perspective: z.enum(['technical', 'business', 'scientific', 'creative', 'legal']),
        depth: z.enum(['overview', 'detailed', 'comprehensive']).optional()
      },
      ({ topic, perspective, depth = 'detailed' }) => {
        let systemContent;
        switch (perspective) {
          case 'technical':
            systemContent = "You are a technical expert providing analysis on technology-related topics.";
            break;
          case 'business':
            systemContent = "You are a business analyst providing insights on business-related topics.";
            break;
          case 'scientific':
            systemContent = "You are a scientific researcher providing analysis on scientific topics.";
            break;
          case 'creative':
            systemContent = "You are a creative expert providing analysis on design and artistic topics.";
            break;
          case 'legal':
            systemContent = "You are a legal expert providing analysis on legal topics.";
            break;
          default:
            systemContent = "You are an expert providing analysis.";
        }
        
        return {
          messages: [
            {
              role: "system",
              content: {
                type: "text",
                text: systemContent
              }
            },
            {
              role: "user",
              content: {
                type: "text",
                text: `Please provide a ${depth} analysis of the following topic from a ${perspective} perspective: ${topic}`
              }
            }
          ]
        };
      }
    );
    
    logger.info('Default Layer 3 prompts registered');
  }
  
  /**
   * Connect the server to a transport
   * @param {Object} transport - The transport to connect to
   * @returns {Promise<void>}
   */
  async connect(transport) {
    try {
      await this.server.connect(transport);
      logger.info('Layer 3 MCP Server connected to transport');
    } catch (error) {
      logger.error('Error connecting Layer 3 MCP Server', { error: error.message });
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

module.exports = Layer3Server; 