// Remove unused import
import {
  Configuration,
  DomainPolicy,
  PolicyDecision,
  ConfigurationSchema,
  RESTRICTED_DOMAINS,
  CHECKOUT_DOMAINS,
  SENSITIVE_FIELD_PATTERNS,
} from "@/shared/types.js";
import { DataRedactor } from "./data-redaction.js";
import { RateLimiter } from "./rate-limiter.js";

/**
 * Policy Engine for Browser Pilot MCP
 * Handles domain allowlist checking, sensitive data detection, and security controls
 */
export class PolicyEngine {
  private config: Configuration;
  private stepCounts: Map<string, { count: number; resetTime: number }> =
    new Map();
  private toolCallCounts: Map<string, number> = new Map();
  private lastToolCallTime: number = 0;
  private dataRedactor: DataRedactor;
  private rateLimiter: RateLimiter;
  private globalStepCount: number = 0;
  private sessionStartTime: number = Date.now();

  constructor(config: Configuration) {
    this.config = config;
    this.dataRedactor = new DataRedactor(config.sensitivePatterns);
    this.rateLimiter = new RateLimiter(
      60, // 60 requests per minute
      1000, // 1000 requests per hour
      config.toolTimeoutMs,
      5 // max 5 consecutive failures
    );
  }

  /**
   * Load and validate configuration
   */
  static async loadConfiguration(): Promise<Configuration> {
    // Default configuration
    const defaultConfig: Configuration = {
      allowlist: {
        localhost: { read: true, write: true },
        "127.0.0.1": { read: true, write: true },
        "example.com": { read: true, write: false },
        "github.com": { read: true, write: false },
        "stackoverflow.com": { read: true, write: false },
      },
      sensitivePatterns: SENSITIVE_FIELD_PATTERNS,
      stepBudget: 100,
      toolTimeoutMs: 30000,
      screenshotDir: "./screenshots",
      downloadDir: "./downloads",
      logging: {
        level: "info",
        maxLogSize: 10485760, // 10MB
        retentionDays: 7,
      },
    };

    // TODO: Load from file in future implementation
    // For now, return default config
    return ConfigurationSchema.parse(defaultConfig);
  }

  /**
   * Update configuration
   */
  updateConfiguration(newConfig: Partial<Configuration>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Check if a domain is allowed for the specified operation
   */
  checkDomainPolicy(url: string, operation: "read" | "write"): PolicyDecision {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();

      // Check for restricted domains
      for (const restricted of RESTRICTED_DOMAINS) {
        if (url.toLowerCase().startsWith(restricted)) {
          return {
            allowed: false,
            requiresApproval: false,
            reason: `Access to ${restricted} URLs is not permitted`,
            metadata: { domain, operation, restricted: true },
          };
        }
      }

      // Check allowlist
      const policy = this.getDomainPolicy(domain);
      const allowed = operation === "read" ? policy.read : policy.write;

      if (!allowed) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Domain ${domain} is not allowed for ${operation} operations`,
          metadata: { domain, operation, policy },
        };
      }

      // Check if approval is required
      const requiresApproval = this.requiresApproval(domain, url, operation);

      // Check step budget for this domain
      const stepBudgetExceeded = this.checkStepBudget(domain);
      if (stepBudgetExceeded) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Step budget exceeded for domain ${domain}`,
          metadata: { domain, operation, stepBudgetExceeded: true },
        };
      }

      return {
        allowed: true,
        requiresApproval,
        reason: requiresApproval
          ? "Sensitive domain or action detected"
          : undefined,
        metadata: { domain, operation, policy },
      };
    } catch (error) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Invalid URL: ${
          error instanceof Error ? error.message : String(error)
        }`,
        metadata: { url, operation },
      };
    }
  }

  /**
   * Get domain policy with fallback to default
   */
  private getDomainPolicy(domain: string): DomainPolicy {
    // Check exact match
    if (this.config.allowlist[domain]) {
      return this.config.allowlist[domain];
    }

    // Check wildcard matches (e.g., *.example.com)
    for (const [allowedDomain, policy] of Object.entries(
      this.config.allowlist
    )) {
      if (allowedDomain.startsWith("*.")) {
        const baseDomain = allowedDomain.slice(2);
        if (domain.endsWith(baseDomain)) {
          return policy;
        }
      }
    }

    // Default policy: no access
    return { read: false, write: false };
  }

  /**
   * Check if approval is required for this domain/URL/operation
   */
  private requiresApproval(
    domain: string,
    url: string,
    operation: string
  ): boolean {
    const policy = this.getDomainPolicy(domain);

    // Check if policy explicitly requires approval
    if (policy.requiresApproval) {
      return true;
    }

    // Check for checkout/payment domains
    const lowerUrl = url.toLowerCase();
    const lowerDomain = domain.toLowerCase();

    for (const checkoutKeyword of CHECKOUT_DOMAINS) {
      if (
        lowerUrl.includes(checkoutKeyword) ||
        lowerDomain.includes(checkoutKeyword)
      ) {
        return true;
      }
    }

    // Write operations on sensitive domains require approval
    if (operation === "write" && this.isSensitiveDomain(domain)) {
      return true;
    }

    return false;
  }

  /**
   * Check if domain is considered sensitive
   */
  private isSensitiveDomain(domain: string): boolean {
    const sensitiveDomains = [
      "bank",
      "banking",
      "finance",
      "payment",
      "paypal",
      "stripe",
      "checkout",
      "cart",
      "order",
      "purchase",
      "billing",
      "admin",
      "dashboard",
      "control",
      "manage",
    ];

    const lowerDomain = domain.toLowerCase();
    return sensitiveDomains.some((keyword) => lowerDomain.includes(keyword));
  }

  /**
   * Check step budget for domain
   */
  private checkStepBudget(domain: string): boolean {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    const policy = this.getDomainPolicy(domain);
    const maxSteps = policy.maxStepsPerHour || this.config.stepBudget;

    const stepData = this.stepCounts.get(domain);
    if (!stepData) {
      return false; // No steps recorded yet
    }

    // Reset counter if an hour has passed
    if (now - stepData.resetTime > hourMs) {
      this.stepCounts.set(domain, { count: 0, resetTime: now });
      return false;
    }

    return stepData.count >= maxSteps;
  }

  /**
   * Increment step count for domain
   */
  incrementStepCount(domain: string): void {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    const stepData = this.stepCounts.get(domain);
    if (!stepData || now - stepData.resetTime > hourMs) {
      this.stepCounts.set(domain, { count: 1, resetTime: now });
    } else {
      stepData.count++;
    }
  }

  /**
   * Check if tool execution should be rate limited
   */
  checkRateLimit(identifier: string = "global"): PolicyDecision {
    const now = Date.now();
    const minInterval = 100; // Minimum 100ms between tool calls

    // Check minimum interval between calls
    if (now - this.lastToolCallTime < minInterval) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: "Rate limit exceeded - too many rapid tool calls",
        metadata: { rateLimited: true, minInterval },
      };
    }

    // Check rate limiter
    const rateLimitResult = this.rateLimiter.checkRateLimit(identifier);
    if (!rateLimitResult.allowed) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: rateLimitResult.reason,
        metadata: {
          rateLimited: true,
          retryAfter: rateLimitResult.retryAfter,
        },
      };
    }

    this.lastToolCallTime = now;
    this.rateLimiter.recordRequest(identifier);

    return {
      allowed: true,
      requiresApproval: false,
    };
  }

  /**
   * Check if consecutive failures exceed threshold
   */
  checkFailureThreshold(toolName: string): PolicyDecision {
    const failureResult = this.rateLimiter.checkFailureThreshold(toolName);

    if (!failureResult.allowed) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: failureResult.reason,
        metadata: {
          toolName,
          failureCount: failureResult.failureCount,
          maxFailures: 5,
        },
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
    };
  }

  /**
   * Record tool execution result
   */
  recordToolExecution(
    toolName: string,
    success: boolean,
    domain?: string,
    requestId?: string
  ): void {
    // Increment global step count
    this.globalStepCount++;

    if (domain) {
      this.incrementStepCount(domain);
    }

    // Record in rate limiter
    this.rateLimiter.completeRequest(requestId || toolName, success);

    if (success) {
      // Reset failure count on success
      this.toolCallCounts.delete(`${toolName}_failures`);
    } else {
      // Increment failure count
      const currentFailures =
        this.toolCallCounts.get(`${toolName}_failures`) || 0;
      this.toolCallCounts.set(`${toolName}_failures`, currentFailures + 1);
    }
  }

  /**
   * Reset failure counts (e.g., after user intervention)
   */
  resetFailureCountsForTool(): void {
    for (const key of this.toolCallCounts.keys()) {
      if (key.endsWith("_failures")) {
        this.toolCallCounts.delete(key);
      }
    }
  }

  /**
   * Get current step counts for monitoring
   */
  getStepCounts(): Record<string, { count: number; resetTime: number }> {
    return Object.fromEntries(this.stepCounts);
  }

  /**
   * Check if a tool operation involves sensitive data
   */
  checkSensitiveData(
    toolName: string,
    args: Record<string, unknown>,
    url?: string
  ): PolicyDecision {
    const sensitiveCheck = this.dataRedactor.isSensitiveAction(
      toolName,
      args,
      url
    );

    if (sensitiveCheck.isSensitive) {
      return {
        allowed: true, // Allow but require approval
        requiresApproval: true,
        reason: sensitiveCheck.reason,
        metadata: {
          riskLevel: sensitiveCheck.riskLevel,
          sensitiveData: true,
        },
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
    };
  }

  /**
   * Redact sensitive data from tool arguments for logging
   */
  redactToolArguments(args: Record<string, unknown>): Record<string, unknown> {
    return this.dataRedactor.redactObject(args);
  }

  /**
   * Redact sensitive data from tool results for logging
   */
  redactToolResults(result: Record<string, unknown>): Record<string, unknown> {
    return this.dataRedactor.redactObject(result);
  }

  /**
   * Create a redacted log entry for tool execution
   */
  createRedactedLogEntry(
    toolName: string,
    args: Record<string, unknown>,
    result: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    return this.dataRedactor.createRedactedLogEntry(
      toolName,
      args,
      result,
      metadata
    );
  }

  /**
   * Check if POST body is too large and requires approval
   */
  checkLargePostBody(data: string | Record<string, unknown>): PolicyDecision {
    if (this.dataRedactor.isLargePostBody(data)) {
      return {
        allowed: true,
        requiresApproval: true,
        reason: "Large POST body detected (>8KB) - requires user confirmation",
        metadata: {
          largePostBody: true,
          dataSize:
            typeof data === "string"
              ? data.length
              : JSON.stringify(data).length,
        },
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
    };
  }

  /**
   * Assess overall risk level for a tool operation
   */
  assessOperationRisk(
    toolName: string,
    args: Record<string, unknown>,
    url?: string
  ): { riskLevel: "low" | "medium" | "high"; reasons: string[] } {
    return this.dataRedactor.assessRisk(toolName, args, url);
  }

  /**
   * Update sensitive patterns configuration
   */
  updateSensitivePatterns(patterns: string[]): void {
    this.config.sensitivePatterns = patterns;
    this.dataRedactor = new DataRedactor(patterns);
  }

  /**
   * Check global step budget
   */
  checkGlobalStepBudget(): PolicyDecision {
    if (this.globalStepCount >= this.config.stepBudget) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Global step budget exceeded: ${this.globalStepCount}/${this.config.stepBudget}`,
        metadata: {
          globalStepCount: this.globalStepCount,
          stepBudget: this.config.stepBudget,
          budgetExceeded: true,
        },
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      metadata: {
        globalStepCount: this.globalStepCount,
        stepBudget: this.config.stepBudget,
      },
    };
  }

  /**
   * Start tracking a tool request with timeout
   */
  async startToolRequest(requestId: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs || this.config.toolTimeoutMs;
    await this.rateLimiter.startRequest(requestId, timeout);
  }

  /**
   * Cancel a tool request
   */
  cancelToolRequest(requestId: string): boolean {
    return this.rateLimiter.cancelRequest(requestId);
  }

  /**
   * Cancel all active tool requests
   */
  cancelAllToolRequests(): void {
    this.rateLimiter.cancelAllRequests();
  }

  /**
   * Reset all failure counts
   */
  resetFailureCounts(): void {
    this.rateLimiter.resetAllFailures();
    for (const key of this.toolCallCounts.keys()) {
      if (key.endsWith("_failures")) {
        this.toolCallCounts.delete(key);
      }
    }
  }

  /**
   * Reset step budget (e.g., for new session)
   */
  resetStepBudget(): void {
    this.globalStepCount = 0;
    this.stepCounts.clear();
    this.sessionStartTime = Date.now();
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(identifier: string = "global"): {
    minuteCount: number;
    hourCount: number;
    minuteLimit: number;
    hourLimit: number;
    activeRequests: number;
    consecutiveFailures: number;
  } {
    return this.rateLimiter.getRateLimitStatus(identifier);
  }

  /**
   * Get current session statistics
   */
  getSessionStats(): {
    globalStepCount: number;
    stepBudget: number;
    sessionDuration: number;
    activeRequests: number;
    domainStepCounts: Record<string, { count: number; resetTime: number }>;
  } {
    return {
      globalStepCount: this.globalStepCount,
      stepBudget: this.config.stepBudget,
      sessionDuration: Date.now() - this.sessionStartTime,
      activeRequests: this.rateLimiter.getActiveRequestCount(),
      domainStepCounts: Object.fromEntries(this.stepCounts),
    };
  }

  /**
   * Update rate limits and timeouts
   */
  updateRateLimits(
    maxRequestsPerMinute?: number,
    maxRequestsPerHour?: number,
    toolTimeoutMs?: number,
    maxConsecutiveFailures?: number
  ): void {
    this.rateLimiter.updateLimits(
      maxRequestsPerMinute,
      maxRequestsPerHour,
      toolTimeoutMs,
      maxConsecutiveFailures
    );

    if (toolTimeoutMs !== undefined) {
      this.config.toolTimeoutMs = toolTimeoutMs;
    }
  }

  /**
   * Cleanup expired data
   */
  cleanup(): void {
    this.rateLimiter.cleanup();

    // Clean up old step counts
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    for (const [domain, data] of this.stepCounts) {
      if (now - data.resetTime > hourMs * 2) {
        this.stepCounts.delete(domain);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): Configuration {
    return { ...this.config };
  }
}
