import { WebSocketBridge } from "./bridge.js";

// MCP Server entry point
console.log("AI Web Pilot MCP Server starting...");

// Initialize WebSocket bridge
const bridge = new WebSocketBridge();

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

// Periodic cleanup of stale requests
setInterval(() => {
  bridge.cleanupStaleRequests();
}, 60000); // Every minute

console.log("MCP Server initialized with WebSocket bridge");
