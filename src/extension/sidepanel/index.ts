// Side panel TypeScript entry point
// Handles UI interactions and communication with service worker

interface ActionLog {
  id: string;
  timestamp: number;
  tool: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  domain: string;
  riskLevel: "low" | "medium" | "high";
}

class SidePanelUI {
  private connectionStatusEl!: HTMLElement;
  private pendingApprovalsEl!: HTMLElement;
  private activityLogEl!: HTMLElement;
  private refreshConnectionBtn!: HTMLElement;
  private clearLogsBtn!: HTMLElement;
  private exportLogsBtn!: HTMLElement;

  private logs: ActionLog[] = [];
  private pendingActions: PendingAction[] = [];

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.startStatusPolling();
    this.loadStoredLogs();
  }

  private initializeElements() {
    this.connectionStatusEl = document.getElementById("connectionStatus")!;

    this.pendingApprovalsEl = document.getElementById("pendingApprovals")!;
    this.activityLogEl = document.getElementById("activityLog")!;
    this.refreshConnectionBtn = document.getElementById("refreshConnection")!;
    this.clearLogsBtn = document.getElementById("clearLogs")!;
    this.exportLogsBtn = document.getElementById("exportLogs")!;
  }

  private setupEventListeners() {
    this.refreshConnectionBtn.addEventListener("click", () => {
      this.checkConnectionStatus();
    });

    this.clearLogsBtn.addEventListener("click", () => {
      this.clearLogs();
    });

    this.exportLogsBtn.addEventListener("click", () => {
      this.exportLogs();
    });

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "ACTION_LOG") {
        this.addLogEntry(message.data);
      } else if (message.type === "PENDING_ACTION") {
        this.addPendingAction(message.data);
      } else if (message.type === "ACTION_COMPLETED") {
        this.removePendingAction(message.actionId);
      }
    });
  }

  private async checkConnectionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_CONNECTION_STATUS",
      });
      this.updateConnectionStatus(response.connected);
    } catch (error) {
      console.error("Failed to check connection status:", error);
      this.updateConnectionStatus(false);
    }
  }

  private updateConnectionStatus(connected: boolean) {
    if (connected) {
      this.connectionStatusEl.textContent = "Connected to MCP Server";
      this.connectionStatusEl.className = "status connected";
    } else {
      this.connectionStatusEl.textContent = "Disconnected from MCP Server";
      this.connectionStatusEl.className = "status disconnected";
    }
  }

  private addLogEntry(log: ActionLog) {
    this.logs.unshift(log); // Add to beginning
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(0, 100); // Keep only last 100 entries
    }
    this.updateActivityLog();
    this.storeLogs();
  }

  private updateActivityLog() {
    if (this.logs.length === 0) {
      this.activityLogEl.innerHTML =
        '<div class="empty-state">No recent activity</div>';
      return;
    }

    const logHtml = this.logs
      .slice(0, 10)
      .map((log) => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        const errorClass = log.error ? " error" : "";
        const duration = log.duration ? ` (${log.duration}ms)` : "";

        return `
        <div class="log-entry${errorClass}">
          <strong>${timestamp}</strong> ${log.tool}${duration}
          ${log.error ? `<br>Error: ${log.error}` : ""}
        </div>
      `;
      })
      .join("");

    this.activityLogEl.innerHTML = logHtml;
  }

  private addPendingAction(action: PendingAction) {
    this.pendingActions.push(action);
    this.updatePendingApprovals();
  }

  private removePendingAction(actionId: string) {
    this.pendingActions = this.pendingActions.filter(
      (action) => action.id !== actionId
    );
    this.updatePendingApprovals();
  }

  private updatePendingApprovals() {
    if (this.pendingActions.length === 0) {
      this.pendingApprovalsEl.innerHTML =
        '<div class="empty-state">No pending approvals</div>';
      return;
    }

    const approvalsHtml = this.pendingActions
      .map(
        (action) => `
      <div class="pending-action">
        <h4>${action.tool} on ${action.domain}</h4>
        <div class="action-details">${JSON.stringify(
          action.args,
          null,
          2
        )}</div>
        <button class="button" onclick="approveAction('${
          action.id
        }')">Approve Once</button>
        <button class="button secondary" onclick="alwaysAllow('${
          action.id
        }')">Always Allow</button>
        <button class="button danger" onclick="denyAction('${
          action.id
        }')">Deny</button>
      </div>
    `
      )
      .join("");

    this.pendingApprovalsEl.innerHTML = approvalsHtml;
  }

  private clearLogs() {
    this.logs = [];
    this.updateActivityLog();
    this.storeLogs();
  }

  private exportLogs() {
    const logsJson = JSON.stringify(this.logs, null, 2);
    const blob = new Blob([logsJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-web-pilot-logs-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private async storeLogs() {
    try {
      await chrome.storage.local.set({ "ai-web-pilot-logs": this.logs });
    } catch (error) {
      console.error("Failed to store logs:", error);
    }
  }

  private async loadStoredLogs() {
    try {
      const result = await chrome.storage.local.get(["ai-web-pilot-logs"]);
      if (result["ai-web-pilot-logs"]) {
        this.logs = result["ai-web-pilot-logs"];
        this.updateActivityLog();
      }
    } catch (error) {
      console.error("Failed to load stored logs:", error);
    }
  }

  private startStatusPolling() {
    // Check connection status every 5 seconds
    setInterval(() => {
      this.checkConnectionStatus();
    }, 5000);

    // Initial check
    this.checkConnectionStatus();
  }
}

// Global functions for approval buttons
(window as unknown as Record<string, unknown>).approveAction = (
  actionId: string
) => {
  chrome.runtime.sendMessage({
    type: "APPROVE_ACTION",
    actionId,
    decision: "approve_once",
  });
};

(window as unknown as Record<string, unknown>).alwaysAllow = (
  actionId: string
) => {
  chrome.runtime.sendMessage({
    type: "APPROVE_ACTION",
    actionId,
    decision: "always_allow",
  });
};

(window as unknown as Record<string, unknown>).denyAction = (
  actionId: string
) => {
  chrome.runtime.sendMessage({
    type: "APPROVE_ACTION",
    actionId,
    decision: "deny",
  });
};

// Initialize the side panel UI when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new SidePanelUI();
});

console.log("AI Web Pilot side panel loaded");
