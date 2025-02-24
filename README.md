# (AI)PI Server System

An implementation of an (AI)PI server system with a layered architecture that combines deterministic APIs with LLM-driven capabilities.

## Architecture Overview

This system follows a layered architecture:

1. **Layer 0 – Integration**
   - RESTful OpenAPI endpoints
   - Complete bundle for client code generation
   - Direct interface with external systems

2. **Layer 1 – Primitives**
   - Deterministic, code-only MCP server
   - Wraps and mediates calls to Layer 0
   - All operations are deterministic

3. **Layer 2 – Agentic**
   - Combines traditional code execution with server-side LLM integration
   - Can call both Layer 0 and Layer 1
   - Allows non-deterministic, flexible processing

4. **Layer 3 – Expert**
   - LLM-only orchestration layer
   - English-based interface (natural language API)
   - Cannot directly call Layer 0; all interactions pass through the MCP boundary

## MCP Boundary & Constraints

- All inter-layer calls go through an MCP (Model Control Protocol) interface
- Strict separation: no direct tool-to-tool calls that bypass this boundary
- Deterministic behavior in Layers 0 and 1, non-determinism in Layers 2 and 3

## Setup and Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   PORT=3000
   NODE_ENV=development
   OPENAI_API_KEY=your_openai_api_key
   ```
4. Start the server:
   ```
   npm start
   ```
   
## API Documentation

Once the server is running, you can access the OpenAPI documentation at:
```
http://localhost:3000/api-docs
```

## Testing

Run all tests:
```
npm test
```

Run unit tests:
```
npm run test:unit
```

Run integration tests:
```
npm run test:integration
```

## Project Structure

```
src/
├── layer0/         # Integration Layer - OpenAPI endpoints
├── layer1/         # Primitives Layer - Deterministic tools
├── layer2/         # Agentic Layer - LLM + code execution
├── layer3/         # Expert Layer - LLM-only orchestration
├── mcp/            # Model Control Protocol implementation
├── utils/          # Utility functions and helpers
├── tests/          # Test files
│   ├── unit/       # Unit tests
│   └── integration/# Integration tests
└── index.js        # Main entry point
```

## License

MIT
