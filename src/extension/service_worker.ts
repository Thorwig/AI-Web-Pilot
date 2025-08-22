// Service worker for Browser Pilot MCP extension
// Handles WebSocket communication with MCP server

import { BridgeMessage, BridgeResponse, WEBSOCKET_PORT } from "@/shared/types";
import { cdpManager } from "./cdp-manager";
import {
  clickElement,
  typeText,
  waitForElement,
  readText,
  readDom,
  executeJavaScript,
} from "./dom-operations";

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
  private pendingApprovals = new Map<
    string,
    {
      resolve: (decision: string) => void;
      reject: (error: Error) => void;
      timestamp: number;
    }
  >();

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
      console.log(`[MCPBridge] Connecting to ws://localhost:${WEBSOCKET_PORT}`);
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
          `[MCPBridge] WebSocket connection closed (code: ${event.code}, reason: ${event.reason}, wasClean: ${event.wasClean})`
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
        console.error(
          "[MCPBridge] WebSocket error type:",
          error.constructor.name
        );
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

  private async handleIncomingMessage(message: BridgeMessage): Promise<void> {
    console.log("[MCPBridge] Received server message:", message.cmd);

    try {
      let response: BridgeResponse;

      switch (message.cmd) {
        // Navigation commands
        case "open_tab":
          response = await this.handleOpenTab(message);
          break;
        case "navigate":
          response = await this.handleNavigate(message);
          break;
        case "get_url":
          response = await this.handleGetUrl(message);
          break;
        case "go_back":
          response = await this.handleGoBack(message);
          break;
        case "go_forward":
          response = await this.handleGoForward(message);
          break;
        case "reload":
          response = await this.handleReload(message);
          break;

        // Tab management commands
        case "tabs_list":
          response = await this.handleTabsList(message);
          break;
        case "tab_activate":
          response = await this.handleTabActivate(message);
          break;

        // DOM interaction commands
        case "click":
          response = await this.handleClick(message);
          break;
        case "type_text":
          response = await this.handleTypeText(message);
          break;
        case "read_text":
          response = await this.handleReadText(message);
          break;
        case "read_dom":
          response = await this.handleReadDom(message);
          break;
        case "wait_for":
          response = await this.handleWaitFor(message);
          break;
        case "eval_js":
          response = await this.handleEvalJs(message);
          break;

        // Utility commands
        case "screenshot":
          response = await this.handleScreenshot(message);
          break;
        case "download_current":
          response = await this.handleDownloadCurrent(message);
          break;

        // Approval workflow commands
        case "request_approval":
          response = await this.handleRequestApproval(message);
          break;

        default:
          response = {
            replyTo: message.id,
            payload: {},
            error: `Unknown command: ${message.cmd}`,
          };
      }

      // Send response back to MCP server
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error(
        `[MCPBridge] Error handling command ${message.cmd}:`,
        error
      );

      const errorResponse: BridgeResponse = {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(errorResponse));
      }
    }
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

  public resolveApproval(actionId: string, decision: string): void {
    const approval = this.pendingApprovals.get(actionId);
    if (approval) {
      this.pendingApprovals.delete(actionId);
      approval.resolve(decision);
    } else {
      throw new Error(`No pending approval found for action ID: ${actionId}`);
    }
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

  // Command handlers for navigation and tab management

  private async handleOpenTab(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { url } = message.payload;
      if (!url || typeof url !== "string") {
        throw new Error("URL is required and must be a string");
      }

      const tab = await chrome.tabs.create({ url });

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
          },
          metadata: {
            tabId: tab.id,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleNavigate(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { url, tabId } = message.payload;

      if (!url || typeof url !== "string") {
        throw new Error("URL is required and must be a string");
      }

      let targetTabId: number;

      if (tabId && typeof tabId === "number") {
        targetTabId = tabId;
      } else {
        // Get active tab if no tabId specified
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          throw new Error("No active tab found");
        }
        targetTabId = activeTab.id;
      }

      await chrome.tabs.update(targetTabId, { url });

      // Wait for navigation to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error("Navigation timeout"));
        }, 10000);

        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.TabChangeInfo
        ) => {
          if (
            updatedTabId === targetTabId &&
            changeInfo.status === "complete"
          ) {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
      });

      const tab = await chrome.tabs.get(targetTabId);

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
          },
          metadata: {
            tabId: tab.id,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleGetUrl(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { tabId } = message.payload;

      let targetTabId: number;

      if (tabId && typeof tabId === "number") {
        targetTabId = tabId;
      } else {
        // Get active tab if no tabId specified
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          throw new Error("No active tab found");
        }
        targetTabId = activeTab.id;
      }

      const tab = await chrome.tabs.get(targetTabId);

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            url: tab.url,
            title: tab.title,
            tabId: tab.id,
          },
          metadata: {
            tabId: tab.id,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleGoBack(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { tabId } = message.payload;

      let targetTabId: number;

      if (tabId && typeof tabId === "number") {
        targetTabId = tabId;
      } else {
        // Get active tab if no tabId specified
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          throw new Error("No active tab found");
        }
        targetTabId = activeTab.id;
      }

      await chrome.tabs.goBack(targetTabId);

      // Wait a moment for navigation to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const tab = await chrome.tabs.get(targetTabId);

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            url: tab.url,
            title: tab.title,
            tabId: tab.id,
          },
          metadata: {
            tabId: tab.id,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleGoForward(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { tabId } = message.payload;

      let targetTabId: number;

      if (tabId && typeof tabId === "number") {
        targetTabId = tabId;
      } else {
        // Get active tab if no tabId specified
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          throw new Error("No active tab found");
        }
        targetTabId = activeTab.id;
      }

      await chrome.tabs.goForward(targetTabId);

      // Wait a moment for navigation to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const tab = await chrome.tabs.get(targetTabId);

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            url: tab.url,
            title: tab.title,
            tabId: tab.id,
          },
          metadata: {
            tabId: tab.id,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleReload(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { tabId } = message.payload;

      let targetTabId: number;

      if (tabId && typeof tabId === "number") {
        targetTabId = tabId;
      } else {
        // Get active tab if no tabId specified
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          throw new Error("No active tab found");
        }
        targetTabId = activeTab.id;
      }

      await chrome.tabs.reload(targetTabId);

      // Wait for reload to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error("Reload timeout"));
        }, 10000);

        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.TabChangeInfo
        ) => {
          if (
            updatedTabId === targetTabId &&
            changeInfo.status === "complete"
          ) {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
      });

      const tab = await chrome.tabs.get(targetTabId);

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            url: tab.url,
            title: tab.title,
            tabId: tab.id,
          },
          metadata: {
            tabId: tab.id,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleTabsList(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const tabs = await chrome.tabs.query({});

      const tabsData = tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.active,
        windowId: tab.windowId,
      }));

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            tabs: tabsData,
            count: tabsData.length,
          },
          metadata: {
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleTabActivate(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { tabId } = message.payload;

      if (!tabId || typeof tabId !== "number") {
        throw new Error("Tab ID is required and must be a number");
      }

      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active,
          },
          metadata: {
            tabId: tab.id,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Placeholder handlers for DOM interaction commands (to be implemented in subtask 6.3)

  private async handleClick(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { selector, tabId } = message.payload;

      if (!selector || typeof selector !== "string") {
        throw new Error("Selector is required and must be a string");
      }

      await clickElement({
        selector,
        tabId: typeof tabId === "number" ? tabId : undefined,
      });

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            selector,
            action: "clicked",
          },
          metadata: {
            tabId: typeof tabId === "number" ? tabId : undefined,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleTypeText(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { selector, text, submit, tabId } = message.payload;

      if (!selector || typeof selector !== "string") {
        throw new Error("Selector is required and must be a string");
      }

      if (!text || typeof text !== "string") {
        throw new Error("Text is required and must be a string");
      }

      await typeText({
        selector,
        text,
        submit: typeof submit === "boolean" ? submit : false,
        tabId: typeof tabId === "number" ? tabId : undefined,
      });

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            selector,
            text: text.length > 50 ? text.substring(0, 50) + "..." : text,
            action: "typed",
            submitted: submit || false,
          },
          metadata: {
            tabId: typeof tabId === "number" ? tabId : undefined,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleReadText(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { selector, tabId } = message.payload;

      const textContent = await readText({
        selector: typeof selector === "string" ? selector : undefined,
        tabId: typeof tabId === "number" ? tabId : undefined,
      });

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            text: textContent,
            selector: selector || "page",
            length: textContent.length,
          },
          metadata: {
            tabId: typeof tabId === "number" ? tabId : undefined,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleReadDom(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { selector, tabId } = message.payload;

      const domStructure = await readDom({
        selector: typeof selector === "string" ? selector : undefined,
        tabId: typeof tabId === "number" ? tabId : undefined,
      });

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            dom: domStructure,
            selector: selector || "page",
          },
          metadata: {
            tabId: typeof tabId === "number" ? tabId : undefined,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleWaitFor(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { selector, timeout_ms, tabId } = message.payload;

      if (!selector || typeof selector !== "string") {
        throw new Error("Selector is required and must be a string");
      }

      await waitForElement({
        selector,
        timeout_ms: typeof timeout_ms === "number" ? timeout_ms : 5000,
        tabId: typeof tabId === "number" ? tabId : undefined,
      });

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            selector,
            action: "found",
            timeout_ms: timeout_ms || 5000,
          },
          metadata: {
            tabId: typeof tabId === "number" ? tabId : undefined,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleEvalJs(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { code, tabId } = message.payload;

      if (!code || typeof code !== "string") {
        throw new Error("JavaScript code is required and must be a string");
      }

      const result = await executeJavaScript({
        code,
        tabId: typeof tabId === "number" ? tabId : undefined,
      });

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            result,
            code: code.length > 100 ? code.substring(0, 100) + "..." : code,
          },
          metadata: {
            tabId: typeof tabId === "number" ? tabId : undefined,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Placeholder handlers for utility commands (to be implemented in subtask 6.4)

  private async handleScreenshot(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { tabId, filename } = message.payload;

      let targetTabId: number;

      if (tabId && typeof tabId === "number") {
        targetTabId = tabId;
      } else {
        // Get active tab if no tabId specified
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          throw new Error("No active tab found");
        }
        targetTabId = activeTab.id;
      }

      // Ensure CDP session is attached (screenshots don't need Input domain)
      if (!cdpManager.isAttached(targetTabId)) {
        await cdpManager.attachToTab(targetTabId, false);
      }

      // Capture screenshot using CDP
      const screenshotResult = (await cdpManager.sendCommand(
        targetTabId,
        "Page.captureScreenshot",
        {
          format: "png",
          quality: 90,
          captureBeyondViewport: false,
        }
      )) as { data: string };

      // Generate filename if not provided
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const finalFilename =
        typeof filename === "string" && filename
          ? filename
          : `screenshot-${timestamp}.png`;

      // Convert base64 to data URL for download
      const base64Data = screenshotResult.data;
      const dataUrl = `data:image/png;base64,${base64Data}`;

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: finalFilename,
        saveAs: false,
      });

      // Calculate file size for metadata
      const byteCharacters = atob(base64Data);
      const fileSize = byteCharacters.length;

      const tab = await chrome.tabs.get(targetTabId);

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            filename: finalFilename,
            downloadId,
            size: fileSize,
            format: "png",
          },
          metadata: {
            tabId: targetTabId,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleDownloadCurrent(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { tabId, filename } = message.payload;

      let targetTabId: number;

      if (tabId && typeof tabId === "number") {
        targetTabId = tabId;
      } else {
        // Get active tab if no tabId specified
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab?.id) {
          throw new Error("No active tab found");
        }
        targetTabId = activeTab.id;
      }

      const tab = await chrome.tabs.get(targetTabId);

      if (!tab.url) {
        throw new Error("Tab has no URL to download");
      }

      // Generate filename if not provided
      let finalFilename: string;
      if (typeof filename === "string" && filename) {
        finalFilename = filename;
      } else {
        // Extract filename from URL or use timestamp
        const url = new URL(tab.url);
        const pathParts = url.pathname.split("/");
        const lastPart = pathParts[pathParts.length - 1];

        if (lastPart && lastPart.includes(".")) {
          finalFilename = lastPart;
        } else {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const hostname = url.hostname.replace(/[^a-zA-Z0-9]/g, "-");
          finalFilename = `${hostname}-${timestamp}.html`;
        }
      }

      // Initiate download
      const downloadId = await chrome.downloads.download({
        url: tab.url,
        filename: finalFilename,
        saveAs: false,
      });

      // Wait a moment to get download info
      await new Promise((resolve) => setTimeout(resolve, 500));

      let downloadInfo;
      try {
        const downloads = await chrome.downloads.search({ id: downloadId });
        downloadInfo = downloads[0];
      } catch (error) {
        console.warn("Could not get download info:", error);
      }

      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            downloadId,
            filename: finalFilename,
            url: tab.url,
            state: downloadInfo?.state || "unknown",
            bytesReceived: downloadInfo?.bytesReceived || 0,
            totalBytes: downloadInfo?.totalBytes || 0,
          },
          metadata: {
            tabId: targetTabId,
            url: tab.url,
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Approval workflow handler
  private async handleRequestApproval(
    message: BridgeMessage
  ): Promise<BridgeResponse> {
    try {
      const { actionId, tool, args, domain, riskLevel } = message.payload;

      if (
        !actionId ||
        !tool ||
        !args ||
        !domain ||
        typeof actionId !== "string"
      ) {
        throw new Error("Missing required approval request parameters");
      }

      // Create pending action for side panel
      const pendingAction = {
        id: actionId,
        tool,
        args,
        domain,
        riskLevel: riskLevel || "medium",
      };

      // Notify side panel about pending approval
      chrome.runtime
        .sendMessage({
          type: "PENDING_ACTION",
          data: pendingAction,
        })
        .catch(() => {
          // Ignore if no listeners
        });

      // Wait for approval decision
      const decision = await new Promise<string>((resolve, reject) => {
        // Set up timeout for approval (5 minutes)
        const timeout = setTimeout(() => {
          this.pendingApprovals.delete(actionId);
          reject(new Error("Approval request timed out"));
        }, 5 * 60 * 1000);

        this.pendingApprovals.set(actionId, {
          resolve: (decision: string) => {
            clearTimeout(timeout);
            resolve(decision);
          },
          reject: (error: Error) => {
            clearTimeout(timeout);
            reject(error);
          },
          timestamp: Date.now(),
        });
      });

      // Return the approval decision
      return {
        replyTo: message.id,
        payload: {
          success: true,
          data: {
            actionId,
            decision,
            timestamp: Date.now(),
          },
          metadata: {
            timestamp: Date.now(),
          },
        },
      };
    } catch (error) {
      return {
        replyTo: message.id,
        payload: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Global bridge instance
const mcpBridge = new MCPBridge();

// Extension lifecycle events
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser Pilot MCP extension started");
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Browser Pilot MCP extension installed");

  // Enable side panel for all sites (with error handling)
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } else {
      console.warn("Side panel API not available in this Chrome version");
    }
  } catch (error) {
    console.error("Failed to set panel behavior:", error);
  }
});

// Handle extension action (toolbar icon) clicks to open side panel
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel && chrome.sidePanel.open && tab.id && tab.windowId) {
      // Open the side panel for the current tab
      await chrome.sidePanel.open({
        tabId: tab.id,
        windowId: tab.windowId,
      });
      console.log("Side panel opened for tab:", tab.id);
    } else {
      console.warn(
        "Side panel API not available or missing tab/window ID - opening popup instead"
      );
      // Fallback: could open a popup window or show notification
    }
  } catch (error) {
    console.error("Failed to open side panel:", error);
  }
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

  // Handle approval decisions from side panel
  if (message.type === "APPROVE_ACTION") {
    const { actionId, decision } = message;

    try {
      // Resolve the pending approval
      mcpBridge.resolveApproval(actionId, decision);

      sendResponse({ success: true });

      // Notify side panel that action was processed
      chrome.runtime
        .sendMessage({
          type: "ACTION_COMPLETED",
          actionId: actionId,
        })
        .catch(() => {
          // Ignore if no listeners
        });
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return true; // Keep message channel open for async response
  }

  // Handle operation mode changes
  if (message.type === "SET_OPERATION_MODE") {
    // Store the operation mode and potentially notify MCP server
    chrome.storage.local.set({ "operation-mode": message.mode }).catch(() => {
      // Ignore storage errors
    });

    sendResponse({ success: true });
    return true;
  }

  // Handle CDP-related commands
  if (message.type === "CDP_COMMAND") {
    const { tabId, method, params } = message;

    if (!tabId) {
      sendResponse({
        success: false,
        error: "Tab ID required for CDP commands",
      });
      return true;
    }

    // Ensure CDP session is attached
    cdpManager
      .attachToTab(tabId)
      .then(() => cdpManager.sendCommand(tabId, method, params))
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true; // Keep message channel open for async response
  }

  // Handle DOM interaction commands
  if (message.type === "DOM_CLICK") {
    clickElement(message.options)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "DOM_TYPE") {
    typeText(message.options)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "DOM_WAIT") {
    waitForElement(message.options)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "DOM_READ_TEXT") {
    readText(message.options)
      .then((text) => sendResponse({ success: true, data: text }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "DOM_READ_DOM") {
    readDom(message.options)
      .then((dom) => sendResponse({ success: true, data: dom }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "DOM_EVAL_JS") {
    executeJavaScript(message.options)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Cleanup on extension shutdown
chrome.runtime.onSuspend.addListener(() => {
  console.log("[ServiceWorker] Extension suspending, cleaning up...");
  mcpBridge.disconnect();
  cdpManager.cleanup().catch((error) => {
    console.error("[ServiceWorker] Error during CDP cleanup:", error);
  });
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  console.log("[ServiceWorker] Extension update available");
  mcpBridge.disconnect();
  cdpManager.cleanup().catch((error) => {
    console.error("[ServiceWorker] Error during CDP cleanup on update:", error);
  });
});

console.log("[ServiceWorker] Browser Pilot MCP service worker loaded");
