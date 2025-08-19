// Service worker for AI Web Pilot extension
// Handles WebSocket communication with MCP server

import { BridgeMessage, BridgeResponse, WEBSOCKET_PORT } from "@/shared/types";

interface ConnectionStatus {
  connected: boolean;
  reconnectAttempts: number;
  lastError?: string;
  lastConnected?: number;
}

interface MessageHandler {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

class MCPBridge {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private messageHandlers = new Map<string, MessageHandler>();
  private connectionStatus: ConnectionStatus = {
    connected: false,
    reconnectAttempts: 0,
  };
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly messageTimeoutMs = 30000; // 30 seconds

  constructor() {
    this.connect();
  }

  private connect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    try {
      console.log(
        `[MCPBridge] Attempting to connect to MCP server (attempt ${
          this.reconnectAttempts + 1
        })`
      );
      this.ws = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}`);

      this.ws.onopen = () => {
        console.log("[MCPBridge] Connected to MCP server");
        this.reconnectAttempts = 0;
        this.connectionStatus = {
          connected: true,
          reconnectAttempts: 0,
          lastConnected: Date.now(),
        };
        this.notifyConnectionStatusChange();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Check if this is a response to our request
          if (data.replyTo) {
            this.handleResponse(data as BridgeResponse);
          } else {
            // This is a server-initiated message
            this.handleIncomingMessage(data as BridgeMessage);
          }
        } catch (error) {
          console.error("[MCPBridge] Error parsing WebSocket message:", error);
        }
      };

      this.ws.onclose = (event) => {
        console.log(
          `[MCPBridge] WebSocket connection closed (code: ${event.code}, reason: ${event.reason})`
        );
        this.ws = null;
        this.connectionStatus.connected = false;
        this.connectionStatus.lastError = `Connection closed: ${
          event.reason || "Unknown reason"
        }`;
        this.notifyConnectionStatusChange();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("[MCPBridge] WebSocket error:", error);
        this.connectionStatus.lastError = "WebSocket error occurred";
      };
    } catch (error) {
      console.error(
        "[MCPBridge] Failed to create WebSocket connection:",
        error
      );
      this.connectionStatus.lastError = `Connection failed: ${error}`;
      this.scheduleReconnect();
    }
  }

  private handleIncomingMessage(message: BridgeMessage): void {
    // Handle server-initiated messages
    // In the future, this could handle server-initiated messages like status updates
    console.log("[MCPBridge] Received server message:", message.cmd);
  }

  private handleResponse(response: BridgeResponse): void {
    const handler = this.messageHandlers.get(response.replyTo);
    if (!handler) {
      console.warn(
        `[MCPBridge] Received response for unknown request: ${response.replyTo}`
      );
      return;
    }

    // Clear timeout and remove handler
    clearTimeout(handler.timeoutId);
    this.messageHandlers.delete(response.replyTo);

    // Resolve or reject the promise
    if (response.error) {
      handler.reject(new Error(response.error));
    } else {
      handler.resolve(response.payload);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `[MCPBridge] Max reconnection attempts (${this.maxReconnectAttempts}) reached`
      );
      this.connectionStatus.lastError = "Max reconnection attempts reached";
      this.notifyConnectionStatusChange();
      return;
    }

    this.reconnectAttempts++;
    this.connectionStatus.reconnectAttempts = this.reconnectAttempts;

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = baseDelay + jitter;

    console.log(
      `[MCPBridge] Reconnecting in ${Math.round(delay)}ms (attempt ${
        this.reconnectAttempts
      }/${this.maxReconnectAttempts})`
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private notifyConnectionStatusChange(): void {
    // Notify side panel and other components about connection status changes
    chrome.runtime
      .sendMessage({
        type: "CONNECTION_STATUS_CHANGED",
        status: this.connectionStatus,
      })
      .catch(() => {
        // Ignore errors if no listeners
      });
  }

  public async sendCommand(
    cmd: string,
    payload: Record<string, unknown> = {}
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected to MCP server"));
        return;
      }

      const messageId = crypto.randomUUID();
      const message: BridgeMessage = {
        id: messageId,
        cmd,
        payload,
        timestamp: Date.now(),
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        const handler = this.messageHandlers.get(messageId);
        if (handler) {
          this.messageHandlers.delete(messageId);
          reject(new Error(`Command timeout after ${this.messageTimeoutMs}ms`));
        }
      }, this.messageTimeoutMs);

      // Store message handler
      this.messageHandlers.set(messageId, {
        resolve,
        reject,
        timestamp: Date.now(),
        timeoutId,
      });

      try {
        this.ws.send(JSON.stringify(message));
        console.log(`[MCPBridge] Sent command: ${cmd}`);
      } catch (error) {
        clearTimeout(timeoutId);
        this.messageHandlers.delete(messageId);
        reject(error);
      }
    });
  }

  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public forceReconnect(): void {
    console.log("[MCPBridge] Force reconnecting...");
    if (this.ws) {
      this.ws.close();
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  public disconnect(): void {
    console.log("[MCPBridge] Disconnecting...");

    // Clear reconnect timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Reject all pending messages
    for (const [, handler] of this.messageHandlers.entries()) {
      clearTimeout(handler.timeoutId);
      handler.reject(new Error("Bridge disconnected"));
    }
    this.messageHandlers.clear();

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connectionStatus.connected = false;
    this.notifyConnectionStatusChange();
  }
}

// Global bridge instance
const mcpBridge = new MCPBridge();

// Extension lifecycle events
chrome.runtime.onStartup.addListener(() => {
  console.log("AI Web Pilot extension started");
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Web Pilot extension installed");
});

// Tab management
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log("Tab activated:", activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    console.log("Tab updated:", tabId, tab.url);
  }
});

// Message handling from other extension components
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[ServiceWorker] Received message:", message.type);

  // Handle messages from side panel or content scripts
  if (message.type === "GET_CONNECTION_STATUS") {
    sendResponse({
      connected: mcpBridge.isConnected(),
      status: mcpBridge.getConnectionStatus(),
    });
    return true;
  }

  if (message.type === "FORCE_RECONNECT") {
    mcpBridge.forceReconnect();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "SEND_MCP_COMMAND") {
    mcpBridge
      .sendCommand(message.cmd, message.payload || {})
      .then((response) => sendResponse({ success: true, data: response }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }

  // Handle CDP-related commands (will be implemented in later tasks)
  if (message.type === "CDP_COMMAND") {
    // TODO: Implement CDP command handling
    sendResponse({ success: false, error: "CDP commands not yet implemented" });
    return true;
  }
});

// Cleanup on extension shutdown
chrome.runtime.onSuspend.addListener(() => {
  console.log("[ServiceWorker] Extension suspending, cleaning up...");
  mcpBridge.disconnect();
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  console.log("[ServiceWorker] Extension update available");
  mcpBridge.disconnect();
});

console.log("[ServiceWorker] AI Web Pilot service worker loaded");
