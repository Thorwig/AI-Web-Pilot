import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { WebSocketBridge } from "./bridge.js";
import type { PolicyEngine } from "./policy-engine.js";
import type { MCPTool, ToolResponse } from "@/shared/types.js";
import {
  // Navigation schemas
  OpenTabSchema,
  NavigateSchema,
  GetUrlSchema,
  GoBackSchema,
  GoForwardSchema,
  ReloadSchema,
  // Tab management schemas
  TabsListSchema,
  TabActivateSchema,
  // DOM interaction schemas
  ClickSchema,
  TypeTextSchema,
  ReadTextSchema,
  ReadDomSchema,
  WaitForSchema,
  EvalJsSchema,
  // Utility schemas
  ScreenshotSchema,
  DownloadCurrentSchema,
} from "@/shared/types.js";

/**
 * Registry for MCP tools that handles validation and execution
 */
export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();

  constructor(
    private bridge: WebSocketBridge,
    private policyEngine: PolicyEngine
  ) {
    this.registerAllTools();
  }

  /**
   * Register all available tools
   */
  private registerAllTools(): void {
    // Navigation tools
    this.registerTool({
      name: "open_tab",
      description: "Open a new browser tab with the specified URL",
      inputSchema: OpenTabSchema,
      handler: this.handleOpenTab.bind(this),
    });

    this.registerTool({
      name: "navigate",
      description: "Navigate to a URL in the current or specified tab",
      inputSchema: NavigateSchema,
      handler: this.handleNavigate.bind(this),
    });

    this.registerTool({
      name: "get_url",
      description: "Get the current URL of the active or specified tab",
      inputSchema: GetUrlSchema,
      handler: this.handleGetUrl.bind(this),
    });

    this.registerTool({
      name: "go_back",
      description: "Navigate back in browser history",
      inputSchema: GoBackSchema,
      handler: this.handleGoBack.bind(this),
    });

    this.registerTool({
      name: "go_forward",
      description: "Navigate forward in browser history",
      inputSchema: GoForwardSchema,
      handler: this.handleGoForward.bind(this),
    });

    this.registerTool({
      name: "reload",
      description: "Reload the current or specified tab",
      inputSchema: ReloadSchema,
      handler: this.handleReload.bind(this),
    });

    // Tab management tools
    this.registerTool({
      name: "tabs_list",
      description: "List all open browser tabs with their details",
      inputSchema: TabsListSchema,
      handler: this.handleTabsList.bind(this),
    });

    this.registerTool({
      name: "tab_activate",
      description: "Activate (focus) a specific browser tab",
      inputSchema: TabActivateSchema,
      handler: this.handleTabActivate.bind(this),
    });

    // DOM interaction tools
    this.registerTool({
      name: "click",
      description: "Click on an element specified by CSS selector",
      inputSchema: ClickSchema,
      handler: this.handleClick.bind(this),
    });

    this.registerTool({
      name: "type_text",
      description: "Type text into an input field specified by CSS selector",
      inputSchema: TypeTextSchema,
      handler: this.handleTypeText.bind(this),
    });

    this.registerTool({
      name: "read_text",
      description: "Read text content from elements or entire page",
      inputSchema: ReadTextSchema,
      handler: this.handleReadText.bind(this),
    });

    this.registerTool({
      name: "read_dom",
      description: "Read DOM structure for debugging selector issues",
      inputSchema: ReadDomSchema,
      handler: this.handleReadDom.bind(this),
    });

    this.registerTool({
      name: "wait_for",
      description: "Wait for an element to appear on the page",
      inputSchema: WaitForSchema,
      handler: this.handleWaitFor.bind(this),
    });

    this.registerTool({
      name: "eval_js",
      description: "Execute JavaScript code in the page context",
      inputSchema: EvalJsSchema,
      handler: this.handleEvalJs.bind(this),
    });

    // Utility tools
    this.registerTool({
      name: "screenshot",
      description: "Take a screenshot of the current or specified tab",
      inputSchema: ScreenshotSchema,
      handler: this.handleScreenshot.bind(this),
    });

    this.registerTool({
      name: "download_current",
      description: "Download the current page or initiate a download",
      inputSchema: DownloadCurrentSchema,
      handler: this.handleDownloadCurrent.bind(this),
    });

    console.log(`Registered ${this.tools.size} MCP tools`);
  }

  /**
   * Register a single tool
   */
  private registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get tool definitions for MCP protocol
   */
  getToolDefinitions(): Tool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object" as const,
        ...this.zodSchemaToJsonSchema(tool.inputSchema),
      },
    }));
  }

  /**
   * Execute a tool by name with validation
   */
  async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
        metadata: {
          tool: name,
          timestamp: Date.now(),
        },
      };
    }

    try {
      // Check global step budget
      const stepBudgetDecision = this.policyEngine.checkGlobalStepBudget();
      if (!stepBudgetDecision.allowed) {
        return {
          success: false,
          error: stepBudgetDecision.reason || "Step budget exceeded",
          metadata: {
            tool: name,
            timestamp: Date.now(),
            stepBudgetExceeded: true,
            ...stepBudgetDecision.metadata,
          },
        };
      }

      // Check rate limiting
      const rateLimitDecision = this.policyEngine.checkRateLimit("global");
      if (!rateLimitDecision.allowed) {
        return {
          success: false,
          error: rateLimitDecision.reason || "Rate limit exceeded",
          metadata: {
            tool: name,
            timestamp: Date.now(),
            rateLimited: true,
            ...rateLimitDecision.metadata,
          },
        };
      }

      // Check failure threshold
      const failureDecision = this.policyEngine.checkFailureThreshold(name);
      if (!failureDecision.allowed) {
        return {
          success: false,
          error: failureDecision.reason || "Too many consecutive failures",
          metadata: {
            tool: name,
            timestamp: Date.now(),
            failureThresholdExceeded: true,
          },
        };
      }

      // Validate input using Zod schema
      const validatedArgs = tool.inputSchema.parse(args);

      // Generate request ID for tracking
      const requestId = `${name}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 11)}`;

      // Start request tracking with timeout
      try {
        await this.policyEngine.startToolRequest(requestId);
      } catch (timeoutError) {
        return {
          success: false,
          error: `Tool request setup failed: ${
            timeoutError instanceof Error
              ? timeoutError.message
              : String(timeoutError)
          }`,
          metadata: {
            tool: name,
            timestamp: Date.now(),
            requestId,
            timeoutError: true,
          },
        };
      }

      let result: ToolResponse;
      try {
        // Execute the tool handler with policy checking
        result = await this.executeToolWithPolicy(name, validatedArgs);
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            tool: name,
            timestamp: Date.now(),
            requestId,
          },
        };
      }

      // Record execution result
      const domain = this.extractDomainFromArgs(validatedArgs);
      this.policyEngine.recordToolExecution(
        name,
        result.success,
        domain,
        requestId
      );

      return result;
    } catch (error) {
      // Record failure
      const domain = this.extractDomainFromArgs(args);
      const requestId = `${name}_${Date.now()}_error`;
      this.policyEngine.recordToolExecution(name, false, domain, requestId);

      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Invalid input: ${error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
          metadata: {
            tool: name,
            timestamp: Date.now(),
            validationError: true,
          },
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          tool: name,
          timestamp: Date.now(),
          unexpectedError: true,
        },
      };
    }
  }

  /**
   * Execute tool with policy enforcement
   */
  private async executeToolWithPolicy(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    const tool = this.tools.get(name)!;

    // Determine if this is a read or write operation
    const operation = this.getToolOperation(name);

    // Check domain policy if URL is involved
    const url = this.extractUrlFromArgs(args);
    if (url) {
      const policyDecision = this.policyEngine.checkDomainPolicy(
        url,
        operation
      );

      if (!policyDecision.allowed) {
        return {
          success: false,
          error: policyDecision.reason || "Domain policy violation",
          metadata: {
            tool: name,
            timestamp: Date.now(),
            policyViolation: true,
            domain: policyDecision.metadata?.domain,
          },
        };
      }

      if (policyDecision.requiresApproval) {
        // TODO: Implement approval workflow
        // For now, we'll allow but log the requirement
        console.warn(
          `Tool ${name} requires approval for ${url} but approval workflow not yet implemented`
        );
      }
    }

    // Check for sensitive data
    const sensitiveDataDecision = this.policyEngine.checkSensitiveData(
      name,
      args,
      url || undefined
    );
    if (sensitiveDataDecision.requiresApproval) {
      // TODO: Implement approval workflow for sensitive data
      console.warn(
        `Tool ${name} involves sensitive data: ${sensitiveDataDecision.reason}`
      );
    }

    // Check for large POST bodies (for type_text with large content)
    if (name === "type_text" && args.text) {
      const largeBodyDecision = this.policyEngine.checkLargePostBody(
        args.text as string
      );
      if (largeBodyDecision.requiresApproval) {
        console.warn(
          `Tool ${name} has large content: ${largeBodyDecision.reason}`
        );
      }
    }

    // Execute the tool handler
    const result = await tool.handler(args);

    // Log execution with redacted sensitive data
    const redactedLogEntry = this.policyEngine.createRedactedLogEntry(
      name,
      args,
      result.data || {},
      result.metadata
    );
    console.log("Tool execution:", JSON.stringify(redactedLogEntry, null, 2));

    return result;
  }

  /**
   * Determine if tool is read or write operation
   */
  private getToolOperation(toolName: string): "read" | "write" {
    const writeTools = [
      "open_tab",
      "navigate",
      "click",
      "type_text",
      "eval_js",
      "download_current",
      "tab_activate",
      "go_back",
      "go_forward",
      "reload",
    ];

    return writeTools.includes(toolName) ? "write" : "read";
  }

  /**
   * Extract URL from tool arguments
   */
  private extractUrlFromArgs(args: Record<string, unknown>): string | null {
    if (typeof args.url === "string") {
      return args.url;
    }

    // For tools that don't have URL directly, we might need to get current tab URL
    // This would require bridge communication, so for now return null
    return null;
  }

  /**
   * Extract domain from tool arguments for step counting
   */
  private extractDomainFromArgs(
    args: Record<string, unknown>
  ): string | undefined {
    const url = this.extractUrlFromArgs(args);
    if (url) {
      try {
        return new URL(url).hostname;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Convert Zod schema to JSON Schema for MCP protocol
   */
  private zodSchemaToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
    // This is a simplified conversion - in a production system you might want
    // to use a library like zod-to-json-schema for more complete conversion
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        if (value instanceof z.ZodString) {
          properties[key] = { type: "string" };
          if (!value.isOptional()) required.push(key);
        } else if (value instanceof z.ZodNumber) {
          properties[key] = { type: "number" };
          if (!value.isOptional()) required.push(key);
        } else if (value instanceof z.ZodBoolean) {
          properties[key] = { type: "boolean" };
          if (!value.isOptional()) required.push(key);
        } else if (value instanceof z.ZodOptional) {
          // Handle optional fields
          const innerType = value._def.innerType;
          if (innerType instanceof z.ZodString) {
            properties[key] = { type: "string" };
          } else if (innerType instanceof z.ZodNumber) {
            properties[key] = { type: "number" };
          } else if (innerType instanceof z.ZodBoolean) {
            properties[key] = { type: "boolean" };
          }
        }
      }

      return {
        type: "object",
        properties,
        required,
      };
    }

    // Fallback for other schema types
    return { type: "object" };
  }

  // Tool handlers - these will send commands to the extension via WebSocket bridge

  private async handleOpenTab(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("open_tab", args);
  }

  private async handleNavigate(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("navigate", args);
  }

  private async handleGetUrl(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("get_url", args);
  }

  private async handleGoBack(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("go_back", args);
  }

  private async handleGoForward(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("go_forward", args);
  }

  private async handleReload(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("reload", args);
  }

  private async handleTabsList(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("tabs_list", args);
  }

  private async handleTabActivate(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("tab_activate", args);
  }

  private async handleClick(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("click", args);
  }

  private async handleTypeText(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("type_text", args);
  }

  private async handleReadText(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("read_text", args);
  }

  private async handleReadDom(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("read_dom", args);
  }

  private async handleWaitFor(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("wait_for", args);
  }

  private async handleEvalJs(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("eval_js", args);
  }

  private async handleScreenshot(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("screenshot", args);
  }

  private async handleDownloadCurrent(
    args: Record<string, unknown>
  ): Promise<ToolResponse> {
    return this.bridge.sendCommand("download_current", args);
  }
}
