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

// Try to load SSE client transport
let SSEClientTransport;
try {
  const sseModule = require('@modelcontextprotocol/sdk/client/sse.js');
  SSEClientTransport = sseModule.SSEClientTransport;
  logger.debug('SSEClientTransport loaded successfully for Layer3Server');
} catch (error) {
  logger.warn('SSEClientTransport not available for Layer3Server:', error.message);
}

// Try to load StdioClientTransport as fallback
let StdioClientTransport;
try {
  const stdioModule = require('@modelcontextprotocol/sdk/client/stdio.js');
  StdioClientTransport = stdioModule.StdioClientTransport;
  logger.debug('StdioClientTransport loaded successfully for Layer3Server');
} catch (error) {
  logger.warn('StdioClientTransport not available for Layer3Server:', error.message);
}

/**
 * Layer 3 MCP Server
 * Provides expert-level LLM-only orchestration capabilities
 */
class Layer3Server {
  /**
   * Create a new Layer 3 MCP Server
   * @param {Object} options - Server configuration options
   * @param {string} options.layer2Endpoint - Endpoint URL for Layer 2 API
   * @param {string} options.layer1Endpoint - Endpoint URL for Layer 1 API (optional)
   */
  constructor(options = {}) {
    this.server = new McpServer({
      name: options.name || 'aipi-layer3-server',
      version: options.version || '1.0.0'
    });
    
    this.layer2Endpoint = options.layer2Endpoint;
    this.layer1Endpoint = options.layer1Endpoint;
    this.layer2Client = null;
    this.layer1Client = null;
    
    if (!this.layer2Endpoint) {
      logger.warn('Layer 3 server initialized without Layer 2 endpoint');
    } else {
      logger.info(`Layer 3 server initialized with Layer 2 endpoint: ${this.layer2Endpoint}`);
      this.initializeLayer2Client();
    }
    
    if (this.layer1Endpoint) {
      logger.info(`Layer 3 server initialized with Layer 1 endpoint: ${this.layer1Endpoint}`);
      this.initializeLayer1Client();
    }
    
    this.registerDefaultTools();
    this.registerDefaultPrompts();
    
    logger.info(`Layer 3 MCP Server initialized`);
  }
  
  /**
   * Initialize the Layer 2 client
   * @private
   */
  async initializeLayer2Client() {
    try {
      const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
      
      // Create Layer 2 client
      this.layer2Client = new Client(
        {
          name: 'layer3-to-layer2-client',
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
      
      // Connect to Layer 2 server
      let transport;
      if (SSEClientTransport) {
        transport = new SSEClientTransport({ endpoint: this.layer2Endpoint });
      } else if (StdioClientTransport) {
        transport = new StdioClientTransport({
          command: 'node',
          args: ['src/mcp/demo.js', '2'],
          cwd: process.cwd()
        });
      } else {
        throw new Error('No transport available for Layer 2 client');
      }
      
      await this.layer2Client.connect(transport);
      logger.info('Layer 3 server connected to Layer 2 server');
      
      // List available tools from Layer 2
      await this.queryLayer2Tools();
    } catch (error) {
      logger.error('Error initializing Layer 2 client:', error.message);
      this.layer2Client = null;
    }
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
          name: 'layer3-to-layer1-client',
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
      logger.info('Layer 3 server connected to Layer 1 server');
      
      // List available tools from Layer 1
      await this.queryLayer1Tools();
    } catch (error) {
      logger.error('Error initializing Layer 1 client:', error.message);
      this.layer1Client = null;
    }
  }
  
  /**
   * Query available tools from Layer 2
   * @returns {Promise<Array>} - List of available tools
   * @private
   */
  async queryLayer2Tools() {
    if (!this.layer2Client) {
      logger.warn('Cannot query Layer 2 tools: Layer 2 client not initialized');
      return [];
    }
    
    try {
      const tools = await this.layer2Client.listTools();
      logger.info(`Layer 3 server found ${tools.tools.length} tools in Layer 2`);
      this.layer2Tools = tools.tools;
      return tools.tools;
    } catch (error) {
      logger.error('Error querying Layer 2 tools:', error.message);
      return [];
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
      logger.info(`Layer 3 server found ${tools.tools.length} tools in Layer 1`);
      this.layer1Tools = tools.tools;
      return tools.tools;
    } catch (error) {
      logger.error('Error querying Layer 1 tools:', error.message);
      return [];
    }
  }
  
  /**
   * Call a tool on Layer 2
   * @param {string} toolName - The name of the tool to call
   * @param {Object} args - The arguments for the tool
   * @returns {Promise<Object>} - The result of the tool call
   * @private
   */
  async callLayer2Tool(toolName, args) {
    if (!this.layer2Client) {
      throw new Error('Layer 2 client not initialized');
    }
    
    try {
      logger.debug(`Calling Layer 2 tool: ${toolName}`, { args });
      const result = await this.layer2Client.callTool({
        name: toolName,
        arguments: args
      });
      
      return result;
    } catch (error) {
      logger.error(`Error calling Layer 2 tool ${toolName}:`, error.message);
      throw error;
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
    
    // Tool that demonstrates using Layer 1 and Layer 2 tools
    this.server.tool(
      "analyze-and-transform",
      "Analyze text and transform data using tools from Layer 1 and Layer 2",
      {
        text: z.string(),
        targetFormat: z.string().optional()
      },
      async ({ text, targetFormat = 'json' }) => {
        try {
          logger.debug('Analyzing and transforming text', { textLength: text.length, targetFormat });
          
          // Check if clients are initialized
          if (!this.layer2Client && !this.layer1Client) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Neither Layer 1 nor Layer 2 clients are initialized. Cannot access lower-layer tools."
                }
              ],
              isError: true
            };
          }
          
          // Step 1: Analyze the text using Layer 2's analyze-text tool
          let analysisResult;
          if (this.layer2Client) {
            try {
              analysisResult = await this.callLayer2Tool("analyze-text", {
                text: text,
                analysisType: 'summary'
              });
            } catch (error) {
              logger.error('Error calling Layer 2 analyze-text tool:', error.message);
              return {
                content: [
                  {
                    type: "text",
                    text: `Error analyzing text: ${error.message}`
                  }
                ],
                isError: true
              };
            }
          } else {
            // If Layer 2 is not available, use our own LLM capabilities
            const response = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                { role: "system", content: "You are a helpful assistant that summarizes text." },
                { role: "user", content: `Summarize the following text in 3-5 sentences:\n\n${text}` }
              ],
              temperature: 0.3,
              max_tokens: 500
            });
            
            analysisResult = {
              content: [
                {
                  type: "text",
                  text: response.choices[0].message.content
                }
              ]
            };
          }
          
          // Extract the analysis text
          let analysisText = "Analysis failed";
          if (analysisResult && analysisResult.content && analysisResult.content.length > 0) {
            analysisText = analysisResult.content[0].text;
          }
          
          // Step 2: Transform the analysis into the target format using Layer 1's transform-data tool
          let transformResult;
          if (this.layer1Client) {
            try {
              // Create a JSON structure from the analysis
              const jsonData = JSON.stringify([
                {
                  original_text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                  analysis: analysisText,
                  timestamp: new Date().toISOString()
                }
              ]);
              
              transformResult = await this.callLayer1Tool("transform-data", {
                sourceFormat: 'json',
                targetFormat: targetFormat,
                data: jsonData
              });
            } catch (error) {
              logger.error('Error calling Layer 1 transform-data tool:', error.message);
              
              // If transformation fails, return just the analysis
              return {
                content: [
                  {
                    type: "text",
                    text: `Analysis result (transformation failed):\n\n${analysisText}`
                  }
                ]
              };
            }
          } else {
            // If Layer 1 is not available, format the result ourselves
            transformResult = {
              content: [
                {
                  type: "text",
                  text: `Analysis result (no transformation available):\n\n${analysisText}`
                }
              ]
            };
          }
          
          // Extract the transformation result
          let transformText = "Transformation failed";
          if (transformResult && transformResult.content && transformResult.content.length > 0) {
            transformText = transformResult.content[0].text;
          }
          
          // Step 3: Enhance the result with our expert-level capabilities
          const enhancedResult = await this.enhanceResult(analysisText, transformText, targetFormat);
          
          return {
            content: [
              {
                type: "text",
                text: enhancedResult
              }
            ]
          };
        } catch (error) {
          logger.error('Error in analyze-and-transform', { error: error.message });
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
   * Enhance the analysis and transformation results
   * @param {string} analysisText - The analysis result
   * @param {string} transformText - The transformation result
   * @param {string} format - The target format
   * @returns {Promise<string>} - The enhanced result
   * @private
   */
  async enhanceResult(analysisText, transformText, format) {
    try {
      // Call OpenAI API to enhance the result
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "You are an expert at synthesizing and presenting information in a clear, insightful manner." 
          },
          { 
            role: "user", 
            content: `I have analyzed some text and transformed the analysis into ${format} format. Please enhance this information by adding insights and presenting it in a well-structured format.\n\nAnalysis:\n${analysisText}\n\nTransformed data:\n${transformText}` 
          }
        ],
        temperature: 0.4,
        max_tokens: 1500
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      logger.error('Error enhancing results', { error: error.message });
      return `Analysis:\n${analysisText}\n\nTransformed data:\n${transformText}`; // Return the original results if enhancement fails
    }
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