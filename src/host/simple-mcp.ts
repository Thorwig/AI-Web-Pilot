import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Simple MCP Server for testing
console.error("Simple AI Web Pilot MCP Server starting...");

const server = new Server({
  name: "ai-web-pilot",
  version: "1.0.0",
});

// Register simple handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Received tools/list request");
  return {
    tools: [
      {
        name: "test_tool",
        description: "A simple test tool",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Test message",
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`Received tool call: ${request.params.name}`);

  return {
    content: [
      {
        type: "text",
        text: `Tool ${
          request.params.name
        } executed successfully with args: ${JSON.stringify(
          request.params.arguments
        )}`,
      },
    ],
  };
});

async function main() {
  try {
    console.error("Setting up stdio transport...");

    // Log stream information
    console.error(`stdin available: ${!!process.stdin}`);
    console.error(`stdout available: ${!!process.stdout}`);
    console.error(`stdin.on available: ${typeof process.stdin?.on}`);
    console.error(`stdout.write available: ${typeof process.stdout?.write}`);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("MCP Server connected via stdio transport");

    // Keep the process alive
    process.on("SIGINT", () => {
      console.error("Shutting down...");
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main();
