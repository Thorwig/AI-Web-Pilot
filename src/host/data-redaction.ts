import { SENSITIVE_FIELD_PATTERNS } from "@/shared/types.js";

/**
 * Sensitive data detection and redaction utilities
 */
export class DataRedactor {
  private sensitivePatterns: RegExp[];
  private sensitiveFieldPatterns: RegExp[];

  constructor(customPatterns: string[] = []) {
    // Combine default patterns with custom ones
    const allPatterns = [...SENSITIVE_FIELD_PATTERNS, ...customPatterns];

    // Create regex patterns for field names (case-insensitive)
    this.sensitiveFieldPatterns = allPatterns.map(
      (pattern) => new RegExp(pattern, "i")
    );

    // Create regex patterns for sensitive data values
    this.sensitivePatterns = [
      // Credit card numbers (basic pattern)
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,

      // Social Security Numbers
      /\b\d{3}-?\d{2}-?\d{4}\b/g,

      // Phone numbers (US format)
      /\b(?:\+1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,

      // Email addresses
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

      // IBAN (basic pattern)
      /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,

      // CVV/CVC codes (3-4 digits)
      /\b\d{3,4}\b/g, // This is very broad, should be used carefully

      // API keys and tokens (common patterns)
      /\b[A-Za-z0-9]{32,}\b/g, // Generic long alphanumeric strings
      /sk_[a-zA-Z0-9]{24,}/g, // Stripe secret keys
      /pk_[a-zA-Z0-9]{24,}/g, // Stripe public keys
      /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal access tokens
      /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth tokens
    ];
  }

  /**
   * Check if a field name is considered sensitive
   */
  isSensitiveField(fieldName: string): boolean {
    return this.sensitiveFieldPatterns.some((pattern) =>
      pattern.test(fieldName)
    );
  }

  /**
   * Check if a value contains sensitive data
   */
  containsSensitiveData(value: string): boolean {
    return this.sensitivePatterns.some((pattern) => pattern.test(value));
  }

  /**
   * Redact sensitive data from a string
   */
  redactString(input: string): string {
    let redacted = input;

    for (const pattern of this.sensitivePatterns) {
      redacted = redacted.replace(pattern, (match) => {
        // Keep first and last character for context, redact middle
        if (match.length <= 4) {
          return "*".repeat(match.length);
        }
        return (
          match[0] + "*".repeat(match.length - 2) + match[match.length - 1]
        );
      });
    }

    return redacted;
  }

  /**
   * Redact sensitive data from an object recursively
   */
  redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        // Completely redact sensitive fields
        redacted[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        // Redact sensitive patterns in string values
        redacted[key] = this.redactString(value);
      } else if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          // Handle arrays
          redacted[key] = value.map((item) =>
            typeof item === "object" && item !== null
              ? this.redactObject(item as Record<string, unknown>)
              : typeof item === "string"
              ? this.redactString(item)
              : item
          );
        } else {
          // Recursively handle nested objects
          redacted[key] = this.redactObject(value as Record<string, unknown>);
        }
      } else {
        // Keep non-sensitive, non-string values as-is
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Check if an action is sensitive based on context
   */
  isSensitiveAction(
    toolName: string,
    args: Record<string, unknown>,
    url?: string
  ): {
    isSensitive: boolean;
    reason?: string;
    riskLevel: "low" | "medium" | "high";
  } {
    // Check for sensitive tool operations
    if (toolName === "type_text") {
      const selector = args.selector as string;
      const text = args.text as string;

      // Check if typing into sensitive fields
      if (selector && this.isSensitiveField(selector)) {
        return {
          isSensitive: true,
          reason: "Typing into sensitive field",
          riskLevel: "high",
        };
      }

      // Check if text contains sensitive data
      if (text && this.containsSensitiveData(text)) {
        return {
          isSensitive: true,
          reason: "Text contains sensitive data",
          riskLevel: "high",
        };
      }
    }

    // Check for sensitive URLs
    if (url) {
      const lowerUrl = url.toLowerCase();

      // Payment/checkout pages
      const checkoutKeywords = [
        "checkout",
        "payment",
        "billing",
        "cart",
        "order",
        "purchase",
      ];
      if (checkoutKeywords.some((keyword) => lowerUrl.includes(keyword))) {
        return {
          isSensitive: true,
          reason: "Interacting with checkout/payment page",
          riskLevel: "high",
        };
      }

      // Banking/financial sites
      const financialKeywords = [
        "bank",
        "banking",
        "finance",
        "paypal",
        "stripe",
      ];
      if (financialKeywords.some((keyword) => lowerUrl.includes(keyword))) {
        return {
          isSensitive: true,
          reason: "Interacting with financial website",
          riskLevel: "high",
        };
      }

      // Admin/management interfaces
      const adminKeywords = ["admin", "dashboard", "control", "manage"];
      if (adminKeywords.some((keyword) => lowerUrl.includes(keyword))) {
        return {
          isSensitive: true,
          reason: "Interacting with admin interface",
          riskLevel: "medium",
        };
      }
    }

    // Check for large data operations
    if (toolName === "eval_js") {
      const code = args.code as string;
      if (code && code.length > 1000) {
        return {
          isSensitive: true,
          reason: "Executing large JavaScript code",
          riskLevel: "medium",
        };
      }
    }

    // Check for form submissions
    if (toolName === "type_text" && args.submit === true) {
      return {
        isSensitive: true,
        reason: "Submitting form data",
        riskLevel: "medium",
      };
    }

    return { isSensitive: false, riskLevel: "low" };
  }

  /**
   * Create redacted log entry for tool execution
   */
  createRedactedLogEntry(
    toolName: string,
    args: Record<string, unknown>,
    result: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      tool: toolName,
      args: this.redactObject(args),
      result: this.redactObject(result),
      metadata: metadata ? this.redactObject(metadata) : undefined,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if POST body is too large and potentially sensitive
   */
  isLargePostBody(data: string | Record<string, unknown>): boolean {
    const maxSize = 8192; // 8KB threshold

    if (typeof data === "string") {
      return data.length > maxSize;
    }

    try {
      const jsonString = JSON.stringify(data);
      return jsonString.length > maxSize;
    } catch {
      return false;
    }
  }

  /**
   * Detect if selector targets sensitive form fields
   */
  isSensitiveSelector(selector: string): boolean {
    const lowerSelector = selector.toLowerCase();

    // Common sensitive field selectors
    const sensitiveSelectors = [
      'input[type="password"]',
      'input[name*="password"]',
      'input[name*="card"]',
      'input[name*="cvv"]',
      'input[name*="cvc"]',
      'input[name*="ssn"]',
      'input[name*="social"]',
      'input[name*="iban"]',
      'input[name*="account"]',
      'input[name*="routing"]',
      'input[name*="pin"]',
      'input[name*="secret"]',
      'input[name*="token"]',
    ];

    return (
      sensitiveSelectors.some((pattern) =>
        lowerSelector.includes(pattern.toLowerCase())
      ) || this.sensitiveFieldPatterns.some((pattern) => pattern.test(selector))
    );
  }

  /**
   * Get risk assessment for a tool operation
   */
  assessRisk(
    toolName: string,
    args: Record<string, unknown>,
    url?: string
  ): { riskLevel: "low" | "medium" | "high"; reasons: string[] } {
    const reasons: string[] = [];
    let riskLevel: "low" | "medium" | "high" = "low";

    // Check sensitive action
    const sensitiveCheck = this.isSensitiveAction(toolName, args, url);
    if (sensitiveCheck.isSensitive) {
      reasons.push(sensitiveCheck.reason!);
      if (sensitiveCheck.riskLevel === "high") {
        riskLevel = "high";
      } else if (sensitiveCheck.riskLevel === "medium" && riskLevel === "low") {
        riskLevel = "medium";
      }
    }

    // Check for write operations on sensitive domains
    const writeTools = ["click", "type_text", "eval_js", "navigate"];
    if (writeTools.includes(toolName) && url) {
      const domain = new URL(url).hostname.toLowerCase();
      if (domain.includes("bank") || domain.includes("payment")) {
        reasons.push("Write operation on financial domain");
        riskLevel = "high";
      }
    }

    // Check for selector-based risks
    if (args.selector && typeof args.selector === "string") {
      if (this.isSensitiveSelector(args.selector)) {
        reasons.push("Targeting sensitive form field");
        if (riskLevel !== "high") {
          riskLevel = "medium";
        }
      }
    }

    return { riskLevel, reasons };
  }
}
