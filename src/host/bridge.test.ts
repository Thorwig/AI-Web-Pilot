import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketBridge } from "./bridge.js";

describe("WebSocketBridge", () => {
  let bridge: WebSocketBridge;

  beforeEach(() => {
    bridge = new WebSocketBridge();
  });

  afterEach(async () => {
    await bridge.close();
  });

  it("should initialize WebSocket server on correct port", () => {
    const status = bridge.getStatus();
    expect(status.connected).toBe(false); // No clients connected yet
    expect(status.clientCount).toBe(0);
    expect(status.pendingRequests).toBe(0);
  });

  it("should track connection status correctly", () => {
    const status = bridge.getStatus();
    expect(status).toHaveProperty("connected");
    expect(status).toHaveProperty("clientCount");
    expect(status).toHaveProperty("pendingRequests");
    expect(typeof status.connected).toBe("boolean");
    expect(typeof status.clientCount).toBe("number");
    expect(typeof status.pendingRequests).toBe("number");
  });

  it("should handle sendCommand when no clients are connected", async () => {
    await expect(bridge.sendCommand("test", {})).rejects.toThrow(
      "No extension clients connected"
    );
  });

  it("should cleanup stale requests without errors", () => {
    expect(() => bridge.cleanupStaleRequests()).not.toThrow();
  });

  it("should return empty clients list when no clients connected", () => {
    const clients = bridge.getClients();
    expect(Array.isArray(clients)).toBe(true);
    expect(clients.length).toBe(0);
  });

  it("should close gracefully", async () => {
    await expect(bridge.close()).resolves.toBeUndefined();
  });
});
