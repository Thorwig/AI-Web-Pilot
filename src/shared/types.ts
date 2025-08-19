import { z } from "zod";

// ============================================================================
// Core Communication Types
// ============================================================================

export interface BridgeMessage {
  id: string;
  cmd: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface BridgeResponse {
  replyTo: string;
  payload: Record<string, unknown>;
  error?: string;
}

export interface ToolResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  metadata?: {
    tabId?: number;
    url?: string;
    timestamp: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
    retryable: boolean;
  };
  metadata: {
    tool: string;
    timestamp: number;
    tabId?: number;
    url?: string;
  };
}

// ============================================================================
// Extension Command Types
// ============================================================================

export interface ExtensionCommand {
  cmd: string;
  tabId?: number;
  payload: Record<string, unknown>;
  requestId: string;
}

export interface CDPSession {
  tabId: number;
  attached: boolean;
  lastActivity: number;
  domains: Set<string>;
}

// ============================================================================
// Policy and Security Types
// ============================================================================

export interface DomainPolicy {
  read: boolean;
  write: boolean;
  requiresApproval?: boolean;
  maxStepsPerHour?: number;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredPolicy {
  domain: string;
  policy: DomainPolicy;
  lastUpdated: number;
  userSet: boolean;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface Configuration {
  allowlist: Record<string, DomainPolicy>;
  sensitivePatterns: string[];
  stepBudget: number;
  toolTimeoutMs: number;
  screenshotDir: string;
  downloadDir: string;
  logging: {
    level: "debug" | "info" | "warn" | "error";
    maxLogSize: number;
    retentionDays: number;
  };
}

// ============================================================================
// UI State Types
// ============================================================================

export interface UIState {
  connectionStatus: "connected" | "disconnected" | "error";
  currentDomain: string;
  mode: "auto" | "ask" | "readonly";
  pendingApproval?: PendingAction;
  recentActions: ActionLog[];
}

export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  domain: string;
  riskLevel: "low" | "medium" | "high";
}

export interface ActionLog {
  id: string;
  timestamp: number;
  tool: string;
  args: Record<string, unknown>; // Redacted sensitive data
  result: Record<string, unknown>;
  duration: number;
  tabId?: number;
  url?: string;
  error?: string;
}

// ============================================================================
// Tab Management Types
// ============================================================================

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
  windowId: number;
}

// ============================================================================
// Zod Schemas for MCP Tool Validation
// ============================================================================

// Navigation Tool Schemas
export const OpenTabSchema = z.object({
  url: z.string().url("Invalid URL format"),
});

export const NavigateSchema = z.object({
  url: z.string().url("Invalid URL format").optional(),
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const GetUrlSchema = z.object({
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const GoBackSchema = z.object({
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const GoForwardSchema = z.object({
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const ReloadSchema = z.object({
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

// Tab Management Schemas
export const TabsListSchema = z.object({});

export const TabActivateSchema = z.object({
  tabId: z.number().int().positive("Tab ID must be a positive integer"),
});

// DOM Interaction Schemas
export const ClickSchema = z.object({
  selector: z.string().min(1, "Selector cannot be empty"),
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const TypeTextSchema = z.object({
  selector: z.string().min(1, "Selector cannot be empty"),
  text: z.string(),
  submit: z.boolean().optional().default(false),
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const ReadTextSchema = z.object({
  selector: z.string().optional(),
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const ReadDomSchema = z.object({
  selector: z.string().optional(),
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const WaitForSchema = z.object({
  selector: z.string().min(1, "Selector cannot be empty"),
  timeout_ms: z
    .number()
    .int()
    .positive("Timeout must be a positive integer")
    .optional()
    .default(5000),
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

export const EvalJsSchema = z.object({
  code: z.string().min(1, "JavaScript code cannot be empty"),
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
});

// Utility Schemas
export const ScreenshotSchema = z.object({
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
  filename: z.string().optional(),
});

export const DownloadCurrentSchema = z.object({
  tabId: z
    .number()
    .int()
    .positive("Tab ID must be a positive integer")
    .optional(),
  filename: z.string().optional(),
});

// ============================================================================
// Configuration Validation Schemas
// ============================================================================

export const DomainPolicySchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
  requiresApproval: z.boolean().optional(),
  maxStepsPerHour: z.number().int().positive().optional(),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]),
  maxLogSize: z.number().int().positive(),
  retentionDays: z.number().int().positive(),
});

export const ConfigurationSchema = z.object({
  allowlist: z.record(z.string(), DomainPolicySchema),
  sensitivePatterns: z.array(z.string()),
  stepBudget: z.number().int().positive(),
  toolTimeoutMs: z.number().int().positive(),
  screenshotDir: z.string().min(1),
  downloadDir: z.string().min(1),
  logging: LoggingConfigSchema,
});

// ============================================================================
// Type Exports for Schema Inference
// ============================================================================

export type OpenTabInput = z.infer<typeof OpenTabSchema>;
export type NavigateInput = z.infer<typeof NavigateSchema>;
export type GetUrlInput = z.infer<typeof GetUrlSchema>;
export type GoBackInput = z.infer<typeof GoBackSchema>;
export type GoForwardInput = z.infer<typeof GoForwardSchema>;
export type ReloadInput = z.infer<typeof ReloadSchema>;
export type TabsListInput = z.infer<typeof TabsListSchema>;
export type TabActivateInput = z.infer<typeof TabActivateSchema>;
export type ClickInput = z.infer<typeof ClickSchema>;
export type TypeTextInput = z.infer<typeof TypeTextSchema>;
export type ReadTextInput = z.infer<typeof ReadTextSchema>;
export type ReadDomInput = z.infer<typeof ReadDomSchema>;
export type WaitForInput = z.infer<typeof WaitForSchema>;
export type EvalJsInput = z.infer<typeof EvalJsSchema>;
export type ScreenshotInput = z.infer<typeof ScreenshotSchema>;
export type DownloadCurrentInput = z.infer<typeof DownloadCurrentSchema>;

// ============================================================================
// Tool Registry Type
// ============================================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: Record<string, unknown>) => Promise<ToolResponse>;
}

// ============================================================================
// Constants
// ============================================================================

export const WEBSOCKET_PORT = 8777;
export const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_STEP_BUDGET = 100;
export const SENSITIVE_FIELD_PATTERNS = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "key",
  "card",
  "cvv",
  "cvc",
  "ssn",
  "iban",
  "phone",
  "email",
];

export const RESTRICTED_DOMAINS = [
  "chrome://",
  "chrome-extension://",
  "moz-extension://",
  "edge://",
  "about:",
  "file://",
];

export const CHECKOUT_DOMAINS = [
  "checkout",
  "payment",
  "billing",
  "cart",
  "order",
  "purchase",
];
