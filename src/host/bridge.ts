import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import {
  BridgeMessage,
  BridgeResponse,
  WEBSOCKET_PORT,
} from "../shared/types.js";

export interface ConnectedClient {
  id: string;
  ws: WebSocket;
  connectedAt: number;
  lastActivity: number;
}

export interface PendingRequest {
  id: string;
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class WebSocketBridge {
  private server: WebSocketServer;
  private clients = new Map<string, ConnectedClient>();
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly requestTimeoutMs = 30000; // 30 seconds

  constructor() {
    this.server = new WebSocketServer({
      port: WEBSOCKET_PORT,
      host: "localhost",
    });

    this.setupServer();
  }

  private setupServer(): void {
    this.server.on("connection", (ws: WebSocket) => {
      const clientId = randomUUID();
      const client: ConnectedClient = {
        id: clientId,
        ws,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      };

      this.clients.set(clientId, client);
      console.log(`[Bridge] Client connected: ${clientId}`);

      // Set up message handling for this client
      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as BridgeResponse;
          this.handleResponse(clientId, message);
        } catch (error) {
          console.error(
            `[Bridge] Invalid message from client ${clientId}:`,
            error
          );
        }
      });

      // Handle client disconnection
      ws.on("close", () => {
        console.log(`[Bridge] Client disconnected: ${clientId}`);
        this.clients.delete(clientId);

        // Reject any pending requests from this client
        this.rejectPendingRequestsForClient();
      });

      // Handle WebSocket errors
      ws.on("error", (error) => {
        console.error(
          `[Bridge] WebSocket error for client ${clientId}:`,
          error
        );
        this.clients.delete(clientId);
        this.rejectPendingRequestsForClient();
      });

      // Send ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

      ws.on("pong", () => {
        client.lastActivity = Date.now();
      });
    });

    this.server.on("error", (error) => {
      console.error("[Bridge] WebSocket server error:", error);
    });

    console.log(
      `[Bridge] WebSocket server listening on localhost:${WEBSOCKET_PORT}`
    );
  }

  private handleResponse(clientId: string, response: BridgeResponse): void {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(
        `[Bridge] Received response from unknown client: ${clientId}`
      );
      return;
    }

    client.lastActivity = Date.now();

    const pendingRequest = this.pendingRequests.get(response.replyTo);
    if (!pendingRequest) {
      console.warn(
        `[Bridge] Received response for unknown request: ${response.replyTo}`
      );
      return;
    }

    // Clear timeout and remove from pending requests
    clearTimeout(pendingRequest.timeoutId);
    this.pendingRequests.delete(response.replyTo);

    // Resolve or reject the promise
    if (response.error) {
      pendingRequest.reject(new Error(response.error));
    } else {
      pendingRequest.resolve(response.payload);
    }
  }

  private rejectPendingRequestsForClient(): void {
    // Note: We don't track which client made which request in this simple implementation
    // In a more sophisticated version, we might want to track this
    for (const [, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeoutId);
      request.reject(new Error("Client disconnected"));
      this.pendingRequests.delete(request.id);
    }
  }

  /**
   * Send a command to the extension and wait for response
   */
  public async sendCommand(
    cmd: string,
    payload: Record<string, unknown> = {}
  ): Promise<import("../shared/types.js").ToolResponse> {
    if (this.clients.size === 0) {
      throw new Error("No extension clients connected");
    }

    // For now, send to the first available client
    // In a more sophisticated implementation, we might want client selection logic
    const client = Array.from(this.clients.values())[0];

    const messageId = randomUUID();
    const message: BridgeMessage = {
      id: messageId,
      cmd,
      payload,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Request timeout after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      // Store pending request
      this.pendingRequests.set(messageId, {
        id: messageId,
        resolve,
        reject,
        timestamp: Date.now(),
        timeoutId,
      });

      // Send message to client
      try {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(message));
        } else {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(messageId);
          reject(new Error("WebSocket connection not open"));
        }
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(messageId);
        reject(error);
      }
    })
      .then((response: unknown) => {
        // Ensure response is in ToolResponse format
        if (
          typeof response === "object" &&
          response !== null &&
          "success" in response
        ) {
          return response as import("../shared/types.js").ToolResponse;
        }

        // Wrap raw response in ToolResponse format
        return {
          success: true,
          data: response as Record<string, unknown>,
          metadata: {
            timestamp: Date.now(),
          },
        } as import("../shared/types.js").ToolResponse;
      })
      .catch((error: Error) => {
        // Return error in ToolResponse format
        return {
          success: false,
          error: error.message,
          metadata: {
            tool: cmd,
            timestamp: Date.now(),
          },
        } as import("../shared/types.js").ToolResponse;
      });
  }

  /**
   * Get connection status
   */
  public getStatus(): {
    connected: boolean;
    clientCount: number;
    pendingRequests: number;
  } {
    return {
      connected: this.clients.size > 0,
      clientCount: this.clients.size,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /**
   * Get connected clients info
   */
  public getClients(): Omit<ConnectedClient, "ws">[] {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      connectedAt: client.connectedAt,
      lastActivity: client.lastActivity,
    }));
  }

  /**
   * Close the WebSocket server
   */
  public async close(): Promise<void> {
    return new Promise((resolve) => {
      // Clear all pending requests
      for (const [, request] of this.pendingRequests.entries()) {
        clearTimeout(request.timeoutId);
        request.reject(new Error("Server shutting down"));
      }
      this.pendingRequests.clear();

      // Close all client connections
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.clients.clear();

      // Close the server
      this.server.close(() => {
        console.log("[Bridge] WebSocket server closed");
        resolve();
      });
    });
  }

  /**
   * Cleanup stale requests (called periodically)
   */
  public cleanupStaleRequests(): void {
    const now = Date.now();
    const staleThreshold = this.requestTimeoutMs;

    for (const [, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > staleThreshold) {
        clearTimeout(request.timeoutId);
        request.reject(new Error("Request expired"));
        this.pendingRequests.delete(request.id);
      }
    }
  }
}
