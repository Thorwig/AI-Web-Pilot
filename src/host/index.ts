import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { WebSocketBridge } from "./bridge.js";
import { MCPToolRegistry } from "./mcp-tools.js";
import { PolicyEngine } from "./policy-engine.js";
import { ConfigManager } from "./config.js";
import { CustomStdioTransport } from "./custom-stdio-transport.js";

// MCP Server entry point
console.log("Browser Pilot MCP Server starting...");

// Initialize configuration manager
const configPath = process.env.CONFIG_PATH || "./config.json";
const configManager = new ConfigManager(configPath);

// Initialize policy engine (will be set up in main function)
let policyEngine: PolicyEngine;

// Initialize WebSocket bridge
const bridge = new WebSocketBridge();

// Initialize MCP server
const server = new Server({
  name: "ai-web-pilot",
  version: "1.0.0",
});

// Tool registry will be initialized in main function after policy engine is ready
let toolRegistry: MCPToolRegistry;

// Register MCP handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolRegistry.getToolDefinitions(),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await toolRegistry.executeTool(name, args || {});

    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data || {}, null, 2),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${result.error}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    console.error(`Tool execution error for ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Internal error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  try {
    // Load configuration
    const config = await configManager.loadConfiguration();
    console.log("Configuration loaded successfully");

    // Initialize policy engine
    policyEngine = new PolicyEngine(config);
    console.log("Policy engine initialized");

    // Initialize tool registry with policy engine
    toolRegistry = new MCPToolRegistry(bridge, policyEngine);
    console.log("Tool registry initialized with policy enforcement");

    // Check if we're being run in a mode that suggests we should be an MCP server
    const isLikelyMCPMode =
      process.argv.includes("--mcp") ||
      process.env.MCP_MODE === "true" ||
      (process.stdin && !process.stdin.isTTY);

    // If we're in MCP mode, try to set up stdio transport
    if (isLikelyMCPMode) {
      console.error("Running in MCP mode - setting up stdio transport...");
      console.error(`Process PID: ${process.pid}`);
      console.error(`stdin available: ${!!process.stdin}`);
      console.error(`stdout available: ${!!process.stdout}`);
      console.error(`stdin.isTTY: ${process.stdin?.isTTY}`);
      console.error(`stdout.isTTY: ${process.stdout?.isTTY}`);
      console.error(`stderr.isTTY: ${process.stderr?.isTTY}`);

      // Check if we have proper stdio streams for standard MCP transport
      const hasValidStdio =
        process.stdin &&
        process.stdout &&
        typeof process.stdin.on === "function" &&
        typeof process.stdout.write === "function";

      if (hasValidStdio) {
        console.error("Using standard stdio transport...");
        try {
          const transport = new StdioServerTransport();
          await server.connect(transport);
          console.error(
            "MCP Server ready - standard stdio transport connected"
          );

          // Set up the WebSocket bridge for extension communication (in background)
          console.log("WebSocket bridge active on port 8777");
          console.log("Extension can connect to ws://localhost:8777");
          console.log(
            "MCP stdio transport active - WebSocket bridge also available for extension"
          );
          return;
        } catch (error: unknown) {
          console.error(
            "Standard stdio transport failed:",
            error instanceof Error ? error.message : String(error)
          );
          console.error("Trying custom stdio transport...");
        }
      } else {
        console.error(
          "Standard stdio not available, using custom stdio transport..."
        );
      }

      // Try custom stdio transport (handles undefined streams)
      try {
        const transport = new CustomStdioTransport();
        await server.connect(transport);
        console.error("MCP Server ready - custom stdio transport connected");

        // Set up the WebSocket bridge for extension communication (in background)
        console.log("WebSocket bridge active on port 8777");
        console.log("Extension can connect to ws://localhost:8777");
        console.log(
          "MCP custom stdio transport active - WebSocket bridge also available for extension"
        );
        return;
      } catch (fallbackError: unknown) {
        console.error(
          "Custom stdio transport also failed:",
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        );
        console.error("Server will exit - MCP client should handle restart");
        process.exit(1);
      }
    }

    console.log("Running in WebSocket mode for Chrome extension");

    // Set up the WebSocket bridge for extension communication
    console.log("WebSocket bridge active on port 8777");
    console.log("Extension can connect to ws://localhost:8777");

    // Keep the process alive with a heartbeat
    setInterval(() => {
      console.log("[HEARTBEAT] MCP Server running in WebSocket mode");
    }, 30000);
  } catch (error) {
    console.error("Failed to initialize MCP server:", error);
    throw error;
  }
}

// Cleanup on process termination
process.on("SIGINT", async () => {
  console.log("\nShutting down MCP server...");
  await bridge.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down MCP server...");
  await bridge.close();
  process.exit(0);
});

// Periodic cleanup of stale requests and policy data
setInterval(() => {
  bridge.cleanupStaleRequests();
  if (policyEngine) {
    policyEngine.cleanup();
  }
}, 60000); // Every minute

// Start the server
main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
