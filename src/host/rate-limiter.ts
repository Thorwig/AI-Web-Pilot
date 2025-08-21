/**
 * Rate limiting and budget management for AI Web Pilot
 */
export class RateLimiter {
  private requestCounts: Map<string, { count: number; resetTime: number }> =
    new Map();
  private activeRequests: Map<
    string,
    { startTime: number; timeoutId: ReturnType<typeof setTimeout> }
  > = new Map();
  private consecutiveFailures: Map<string, number> = new Map();

  constructor(
    private maxRequestsPerMinute: number = 60,
    private maxRequestsPerHour: number = 1000,
    private defaultTimeoutMs: number = 30000,
    private maxConsecutiveFailures: number = 5
  ) {}

  /**
   * Check if request is within rate limits
   */
  checkRateLimit(identifier: string): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const now = Date.now();

    // Check minute-based rate limit
    const minuteKey = `${identifier}:minute`;
    const minuteData = this.requestCounts.get(minuteKey);
    const minuteMs = 60 * 1000;

    if (minuteData && now - minuteData.resetTime < minuteMs) {
      if (minuteData.count >= this.maxRequestsPerMinute) {
        const retryAfter = minuteMs - (now - minuteData.resetTime);
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${minuteData.count}/${this.maxRequestsPerMinute} requests per minute`,
          retryAfter: Math.ceil(retryAfter / 1000), // seconds
        };
      }
    }

    // Check hour-based rate limit
    const hourKey = `${identifier}:hour`;
    const hourData = this.requestCounts.get(hourKey);
    const hourMs = 60 * 60 * 1000;

    if (hourData && now - hourData.resetTime < hourMs) {
      if (hourData.count >= this.maxRequestsPerHour) {
        const retryAfter = hourMs - (now - hourData.resetTime);
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${hourData.count}/${this.maxRequestsPerHour} requests per hour`,
          retryAfter: Math.ceil(retryAfter / 1000), // seconds
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a request
   */
  recordRequest(identifier: string): void {
    const now = Date.now();

    // Record minute-based count
    const minuteKey = `${identifier}:minute`;
    const minuteData = this.requestCounts.get(minuteKey);
    const minuteMs = 60 * 1000;

    if (!minuteData || now - minuteData.resetTime > minuteMs) {
      this.requestCounts.set(minuteKey, { count: 1, resetTime: now });
    } else {
      minuteData.count++;
    }

    // Record hour-based count
    const hourKey = `${identifier}:hour`;
    const hourData = this.requestCounts.get(hourKey);
    const hourMs = 60 * 60 * 1000;

    if (!hourData || now - hourData.resetTime > hourMs) {
      this.requestCounts.set(hourKey, { count: 1, resetTime: now });
    } else {
      hourData.count++;
    }
  }

  /**
   * Start tracking a request with timeout
   */
  startRequest(requestId: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs || this.defaultTimeoutMs;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.activeRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
      }, timeout);

      this.activeRequests.set(requestId, {
        startTime: Date.now(),
        timeoutId,
      });

      resolve();
    });
  }

  /**
   * Complete a tracked request
   */
  completeRequest(requestId: string, success: boolean): void {
    const requestData = this.activeRequests.get(requestId);
    if (requestData) {
      clearTimeout(requestData.timeoutId);
      this.activeRequests.delete(requestId);
    }

    // Track consecutive failures
    if (success) {
      this.consecutiveFailures.delete(requestId);
    } else {
      const currentFailures = this.consecutiveFailures.get(requestId) || 0;
      this.consecutiveFailures.set(requestId, currentFailures + 1);
    }
  }

  /**
   * Check if consecutive failure threshold is exceeded
   */
  checkFailureThreshold(identifier: string): {
    allowed: boolean;
    reason?: string;
    failureCount?: number;
  } {
    const failureCount = this.consecutiveFailures.get(identifier) || 0;

    if (failureCount >= this.maxConsecutiveFailures) {
      return {
        allowed: false,
        reason: `Too many consecutive failures: ${failureCount}/${this.maxConsecutiveFailures}`,
        failureCount,
      };
    }

    return { allowed: true, failureCount };
  }

  /**
   * Reset failure count for identifier
   */
  resetFailures(identifier: string): void {
    this.consecutiveFailures.delete(identifier);
  }

  /**
   * Reset all failure counts
   */
  resetAllFailures(): void {
    this.consecutiveFailures.clear();
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests(): void {
    for (const [, requestData] of this.activeRequests) {
      clearTimeout(requestData.timeoutId);
    }
    this.activeRequests.clear();
  }

  /**
   * Cancel a specific request
   */
  cancelRequest(requestId: string): boolean {
    const requestData = this.activeRequests.get(requestId);
    if (requestData) {
      clearTimeout(requestData.timeoutId);
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(identifier: string): {
    minuteCount: number;
    hourCount: number;
    minuteLimit: number;
    hourLimit: number;
    minuteResetTime: number;
    hourResetTime: number;
    activeRequests: number;
    consecutiveFailures: number;
  } {
    const now = Date.now();

    const minuteKey = `${identifier}:minute`;
    const minuteData = this.requestCounts.get(minuteKey);
    const minuteMs = 60 * 1000;

    const hourKey = `${identifier}:hour`;
    const hourData = this.requestCounts.get(hourKey);
    const hourMs = 60 * 60 * 1000;

    return {
      minuteCount:
        minuteData && now - minuteData.resetTime < minuteMs
          ? minuteData.count
          : 0,
      hourCount:
        hourData && now - hourData.resetTime < hourMs ? hourData.count : 0,
      minuteLimit: this.maxRequestsPerMinute,
      hourLimit: this.maxRequestsPerHour,
      minuteResetTime: minuteData
        ? minuteData.resetTime + minuteMs
        : now + minuteMs,
      hourResetTime: hourData ? hourData.resetTime + hourMs : now + hourMs,
      activeRequests: this.activeRequests.size,
      consecutiveFailures: this.consecutiveFailures.get(identifier) || 0,
    };
  }

  /**
   * Clean up expired rate limit data
   */
  cleanup(): void {
    const now = Date.now();
    const minuteMs = 60 * 1000;
    const hourMs = 60 * 60 * 1000;

    for (const [key, data] of this.requestCounts) {
      const isMinuteKey = key.endsWith(":minute");
      const maxAge = isMinuteKey ? minuteMs : hourMs;

      if (now - data.resetTime > maxAge * 2) {
        // Keep data for 2x the period
        this.requestCounts.delete(key);
      }
    }
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  /**
   * Get all active request IDs
   */
  getActiveRequestIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }

  /**
   * Update rate limits
   */
  updateLimits(
    maxRequestsPerMinute?: number,
    maxRequestsPerHour?: number,
    defaultTimeoutMs?: number,
    maxConsecutiveFailures?: number
  ): void {
    if (maxRequestsPerMinute !== undefined) {
      this.maxRequestsPerMinute = maxRequestsPerMinute;
    }
    if (maxRequestsPerHour !== undefined) {
      this.maxRequestsPerHour = maxRequestsPerHour;
    }
    if (defaultTimeoutMs !== undefined) {
      this.defaultTimeoutMs = defaultTimeoutMs;
    }
    if (maxConsecutiveFailures !== undefined) {
      this.maxConsecutiveFailures = maxConsecutiveFailures;
    }
  }
}
