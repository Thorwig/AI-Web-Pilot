// Chrome DevTools Protocol session manager
// Handles CDP session lifecycle, domain enabling, and command execution

import { CDPSession } from "@/shared/types";

interface PendingCommand {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class CDPManager {
  private sessions = new Map<number, CDPSession>();
  private pendingCommands = new Map<number, PendingCommand>();
  private commandId = 0;
  private readonly commandTimeoutMs = 30000; // 30 seconds
  private readonly sessionCleanupIntervalMs = 300000; // 5 minutes
  private readonly sessionInactivityTimeoutMs = 600000; // 10 minutes
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  // Required CDP domains for web automation
  private readonly requiredDomains = ["Page", "DOM", "Runtime", "Input"];

  constructor() {
    this.startCleanupInterval();
    this.setupEventListeners();
  }

  /**
   * Attach to a tab and enable required CDP domains
   */
  public async attachToTab(tabId: number): Promise<void> {
    try {
      // Check if already attached
      const existingSession = this.sessions.get(tabId);
      if (existingSession?.attached) {
        console.log(`[CDPManager] Already attached to tab ${tabId}`);
        existingSession.lastActivity = Date.now();
        return;
      }

      console.log(`[CDPManager] Attaching to tab ${tabId}`);

      // Attach debugger
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ tabId }, "1.3", () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });

      // Create session record
      const session: CDPSession = {
        tabId,
        attached: true,
        lastActivity: Date.now(),
        domains: new Set(),
      };

      this.sessions.set(tabId, session);

      // Enable required domains
      await this.enableRequiredDomains(tabId);

      console.log(`[CDPManager] Successfully attached to tab ${tabId}`);
    } catch (error) {
      console.error(`[CDPManager] Failed to attach to tab ${tabId}:`, error);

      // Clean up partial session
      this.sessions.delete(tabId);

      // Try to detach in case attachment partially succeeded
      try {
        chrome.debugger.detach({ tabId });
      } catch (detachError) {
        // Ignore detach errors
      }

      throw new Error(`Failed to attach CDP session to tab ${tabId}: ${error}`);
    }
  }

  /**
   * Detach from a tab and clean up session
   */
  public async detachFromTab(tabId: number): Promise<void> {
    try {
      const session = this.sessions.get(tabId);
      if (!session?.attached) {
        console.log(`[CDPManager] Tab ${tabId} not attached`);
        return;
      }

      console.log(`[CDPManager] Detaching from tab ${tabId}`);

      // Cancel any pending commands for this tab
      this.cancelPendingCommandsForTab(tabId);

      // Detach debugger
      await new Promise<void>((resolve) => {
        chrome.debugger.detach({ tabId }, () => {
          if (chrome.runtime.lastError) {
            // Don't reject on detach errors - tab might already be closed
            console.warn(
              `[CDPManager] Detach warning for tab ${tabId}:`,
              chrome.runtime.lastError.message
            );
          }
          resolve();
        });
      });

      // Remove session
      this.sessions.delete(tabId);

      console.log(`[CDPManager] Successfully detached from tab ${tabId}`);
    } catch (error) {
      console.error(`[CDPManager] Error detaching from tab ${tabId}:`, error);
      // Still remove the session record
      this.sessions.delete(tabId);
      throw error;
    }
  }

  /**
   * Send a CDP command to a tab
   */
  public async sendCommand(
    tabId: number,
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const session = this.sessions.get(tabId);
    if (!session?.attached) {
      throw new Error(`CDP session not attached to tab ${tabId}`);
    }

    // Update last activity
    session.lastActivity = Date.now();

    return new Promise((resolve, reject) => {
      const commandId = ++this.commandId;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        const pendingCommand = this.pendingCommands.get(commandId);
        if (pendingCommand) {
          this.pendingCommands.delete(commandId);
          reject(
            new Error(
              `CDP command timeout after ${this.commandTimeoutMs}ms: ${method}`
            )
          );
        }
      }, this.commandTimeoutMs);

      // Store pending command
      this.pendingCommands.set(commandId, {
        resolve,
        reject,
        timestamp: Date.now(),
        timeoutId,
      });

      // Send command
      chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
        const pendingCommand = this.pendingCommands.get(commandId);
        if (!pendingCommand) {
          return; // Command already timed out
        }

        clearTimeout(pendingCommand.timeoutId);
        this.pendingCommands.delete(commandId);

        if (chrome.runtime.lastError) {
          pendingCommand.reject(new Error(chrome.runtime.lastError.message));
        } else {
          pendingCommand.resolve(result);
        }
      });
    });
  }

  /**
   * Check if attached to a tab
   */
  public isAttached(tabId: number): boolean {
    const session = this.sessions.get(tabId);
    return session?.attached === true;
  }

  /**
   * Get session information for a tab
   */
  public getSession(tabId: number): CDPSession | undefined {
    return this.sessions.get(tabId);
  }

  /**
   * Get all active sessions
   */
  public getAllSessions(): CDPSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Force cleanup of all sessions
   */
  public async cleanup(): Promise<void> {
    console.log("[CDPManager] Cleaning up all CDP sessions");

    // Stop cleanup interval
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    // Cancel all pending commands
    for (const [, pendingCommand] of this.pendingCommands.entries()) {
      clearTimeout(pendingCommand.timeoutId);
      pendingCommand.reject(new Error("CDP manager shutting down"));
    }
    this.pendingCommands.clear();

    // Detach from all sessions
    const detachPromises = Array.from(this.sessions.keys()).map((tabId) =>
      this.detachFromTab(tabId).catch((error) => {
        console.warn(
          `[CDPManager] Error detaching from tab ${tabId} during cleanup:`,
          error
        );
      })
    );

    await Promise.all(detachPromises);
    this.sessions.clear();

    console.log("[CDPManager] Cleanup complete");
  }

  /**
   * Enable required CDP domains for a tab
   */
  private async enableRequiredDomains(tabId: number): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) {
      throw new Error(`No session found for tab ${tabId}`);
    }

    console.log(
      `[CDPManager] Enabling domains for tab ${tabId}:`,
      this.requiredDomains
    );

    for (const domain of this.requiredDomains) {
      try {
        await this.sendCommand(tabId, `${domain}.enable`);
        session.domains.add(domain);
        console.log(`[CDPManager] Enabled ${domain} domain for tab ${tabId}`);
      } catch (error) {
        console.error(
          `[CDPManager] Failed to enable ${domain} domain for tab ${tabId}:`,
          error
        );
        throw new Error(`Failed to enable ${domain} domain: ${error}`);
      }
    }
  }

  /**
   * Cancel pending commands for a specific tab
   */
  private cancelPendingCommandsForTab(tabId: number): void {
    // Note: We don't have a direct way to map commands to tabs,
    // so we cancel all pending commands when detaching.
    // This is acceptable since commands should complete quickly.
    for (const [, pendingCommand] of this.pendingCommands.entries()) {
      clearTimeout(pendingCommand.timeoutId);
      pendingCommand.reject(new Error(`Tab ${tabId} detached`));
    }
    this.pendingCommands.clear();
  }

  /**
   * Start periodic cleanup of inactive sessions
   */
  private startCleanupInterval(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupInactiveSessions();
    }, this.sessionCleanupIntervalMs);
  }

  /**
   * Clean up sessions that have been inactive for too long
   */
  private async cleanupInactiveSessions(): Promise<void> {
    const now = Date.now();
    const inactiveSessions: number[] = [];

    for (const [tabId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionInactivityTimeoutMs) {
        inactiveSessions.push(tabId);
      }
    }

    if (inactiveSessions.length > 0) {
      console.log(
        `[CDPManager] Cleaning up ${inactiveSessions.length} inactive sessions`
      );

      for (const tabId of inactiveSessions) {
        try {
          await this.detachFromTab(tabId);
        } catch (error) {
          console.warn(
            `[CDPManager] Error cleaning up inactive session ${tabId}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Set up event listeners for tab changes and debugger events
   */
  private setupEventListeners(): void {
    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      const session = this.sessions.get(tabId);
      if (session?.attached) {
        console.log(`[CDPManager] Tab ${tabId} removed, cleaning up session`);
        this.sessions.delete(tabId);
        this.cancelPendingCommandsForTab(tabId);
      }
    });

    // Handle debugger detach events
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId) {
        const session = this.sessions.get(source.tabId);
        if (session) {
          console.log(
            `[CDPManager] Debugger detached from tab ${source.tabId}, reason: ${reason}`
          );
          session.attached = false;
          this.sessions.delete(source.tabId);
          this.cancelPendingCommandsForTab(source.tabId);
        }
      }
    });

    // Handle CDP events (for future use)
    chrome.debugger.onEvent.addListener((source, method) => {
      if (source.tabId) {
        const session = this.sessions.get(source.tabId);
        if (session) {
          session.lastActivity = Date.now();
          // Future: Handle specific CDP events if needed
          console.debug(
            `[CDPManager] CDP event from tab ${source.tabId}: ${method}`
          );
        }
      }
    });
  }
}

// Export singleton instance
export const cdpManager = new CDPManager();
