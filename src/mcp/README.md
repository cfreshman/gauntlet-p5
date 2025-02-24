# MCP (Model Context Protocol) Implementation

This directory contains the implementation of the Model Context Protocol (MCP) for the (AI)PI server system. The MCP serves as a boundary between the different layers of the architecture, ensuring proper separation of concerns and enforcing the constraints of each layer.

## Architecture Overview

The MCP implementation follows the layered architecture of the (AI)PI system:

1. **Layer 1 – Primitives**
   - Deterministic, code-only MCP server
   - Provides tools and resources with guaranteed deterministic behavior
   - Acts as a mediator for Layer 0 (Integration Layer)

2. **Layer 2 – Agentic**
   - Combines traditional code execution with LLM integration
   - Can call both Layer 0 and Layer 1
   - Provides enhanced capabilities through LLM integration

3. **Layer 3 – Expert**
   - LLM-only orchestration layer
   - Provides natural language interface
   - Cannot directly call Layer 0; all interactions pass through the MCP boundary

## Implementation Details

### MCP Servers

Each layer has its own MCP server implementation:

- `Layer1Server`: Provides deterministic tools and resources
- `Layer2Server`: Combines code execution with LLM capabilities
- `Layer3Server`: Provides expert-level LLM-only orchestration

### Transports

The MCP implementation supports the following transports:

- `StdioServerTransport`: Communication through standard input/output streams

### Tools and Resources

Each layer provides its own set of tools and resources:

- **Layer 1**: Deterministic operations like data validation and transformation
- **Layer 2**: Enhanced capabilities like text analysis and data enrichment
- **Layer 3**: Expert-level capabilities like natural language query processing and multi-step reasoning

## Usage

You can run the MCP servers for each layer using the following npm scripts:

```bash
# Run Layer 1 MCP server
npm run mcp:layer1

# Run Layer 2 MCP server
npm run mcp:layer2

# Run Layer 3 MCP server
npm run mcp:layer3

# Run all layers at once
npm run mcp:all
```

You can also test the MCP servers using the test clients:

```bash
# Test a specific layer (1, 2, or 3)
npm run mcp:test 1

# Test all layers at once
npm run mcp:test-all
```

## Integration with External Systems

The MCP servers can be integrated with external systems that support the Model Context Protocol, such as:

- Claude for Desktop
- MCP Inspector
- Custom MCP clients

## Development

To extend the MCP implementation:

1. Add new tools and resources to the appropriate layer server
2. Ensure proper separation of concerns between layers
3. Maintain the deterministic nature of Layer 1
4. Follow the MCP specification for message formats and protocol flow

## Dependencies

The MCP implementation uses the official Model Context Protocol SDK:

```bash
npm install @modelcontextprotocol/sdk
```

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 