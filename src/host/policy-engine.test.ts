import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine } from "./policy-engine.js";
import type { Configuration } from "@/shared/types.js";

describe("PolicyEngine", () => {
  let policyEngine: PolicyEngine;
  let config: Configuration;

  beforeEach(() => {
    config = {
      allowlist: {
        "example.com": { read: true, write: false },
        localhost: { read: true, write: true },
        "bank.com": { read: true, write: false, requiresApproval: true },
      },
      sensitivePatterns: ["password", "card", "cvv"],
      stepBudget: 10,
      toolTimeoutMs: 5000,
      screenshotDir: "./screenshots",
      downloadDir: "./downloads",
      logging: {
        level: "info",
        maxLogSize: 1000000,
        retentionDays: 7,
      },
    };
    policyEngine = new PolicyEngine(config);
  });

  describe("Domain Policy Checking", () => {
    it("should allow read operations on allowed domains", () => {
      const decision = policyEngine.checkDomainPolicy(
        "https://example.com/page",
        "read"
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(false);
    });

    it("should block write operations on read-only domains", () => {
      const decision = policyEngine.checkDomainPolicy(
        "https://example.com/page",
        "write"
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("not allowed for write operations");
    });

    it("should require approval for sensitive domains", () => {
      const decision = policyEngine.checkDomainPolicy(
        "https://bank.com/login",
        "read"
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(true);
    });

    it("should block restricted domains", () => {
      const decision = policyEngine.checkDomainPolicy(
        "chrome://settings",
        "read"
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("not permitted");
    });
  });

  describe("Rate Limiting", () => {
    it("should allow requests within rate limits", () => {
      const decision = policyEngine.checkRateLimit("test");
      expect(decision.allowed).toBe(true);
    });

    it("should enforce minimum interval between calls", async () => {
      policyEngine.checkRateLimit("test");
      const decision = policyEngine.checkRateLimit("test");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("too many rapid tool calls");
    });
  });

  describe("Step Budget", () => {
    it("should allow operations within step budget", () => {
      const decision = policyEngine.checkGlobalStepBudget();
      expect(decision.allowed).toBe(true);
    });

    it("should block operations when step budget is exceeded", () => {
      // Simulate exceeding step budget
      for (let i = 0; i < 11; i++) {
        policyEngine.recordToolExecution("test_tool", true, "example.com");
      }

      const decision = policyEngine.checkGlobalStepBudget();
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("step budget exceeded");
    });
  });

  describe("Failure Threshold", () => {
    it("should allow operations with low failure count", () => {
      const decision = policyEngine.checkFailureThreshold("test_tool");
      expect(decision.allowed).toBe(true);
    });

    it("should block operations after too many failures", () => {
      // Simulate consecutive failures
      for (let i = 0; i < 6; i++) {
        policyEngine.recordToolExecution("test_tool", false, "example.com");
      }

      const decision = policyEngine.checkFailureThreshold("test_tool");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("consecutive failures");
    });
  });

  describe("Sensitive Data Detection", () => {
    it("should detect sensitive actions", () => {
      const decision = policyEngine.checkSensitiveData(
        "type_text",
        { selector: "input[name='password']", text: "secret123" },
        "https://example.com/login"
      );
      expect(decision.requiresApproval).toBe(true);
    });

    it("should detect large POST bodies", () => {
      const largeText = "x".repeat(10000);
      const decision = policyEngine.checkLargePostBody(largeText);
      expect(decision.requiresApproval).toBe(true);
      expect(decision.reason).toContain("Large POST body");
    });
  });

  describe("Data Redaction", () => {
    it("should redact sensitive data from arguments", () => {
      const args = {
        password: "secret123",
        username: "testuser",
        cardNumber: "4111-1111-1111-1111",
      };

      const redacted = policyEngine.redactToolArguments(args);
      expect(redacted.password).toBe("[REDACTED]");
      expect(redacted.username).toBe("testuser");
      // cardNumber is also treated as sensitive field, so it gets [REDACTED]
      expect(redacted.cardNumber).toBe("[REDACTED]");
    });
  });

  describe("Session Management", () => {
    it("should track session statistics", () => {
      policyEngine.recordToolExecution("test_tool", true, "example.com");

      const stats = policyEngine.getSessionStats();
      expect(stats.globalStepCount).toBe(1);
      expect(stats.stepBudget).toBe(10);
      expect(stats.sessionDuration).toBeGreaterThanOrEqual(0);
    });

    it("should reset step budget", () => {
      policyEngine.recordToolExecution("test_tool", true, "example.com");
      expect(policyEngine.getSessionStats().globalStepCount).toBe(1);

      policyEngine.resetStepBudget();
      expect(policyEngine.getSessionStats().globalStepCount).toBe(0);
    });
  });
});
