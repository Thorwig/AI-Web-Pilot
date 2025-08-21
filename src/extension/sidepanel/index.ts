// Side panel TypeScript entry point
// Handles UI interactions and communication with service worker

import type { ActionLog, PendingAction, DomainPolicy } from "@/shared/types";

interface ConnectionStatus {
  connected: boolean;
  reconnectAttempts: number;
  lastError?: string;
  lastConnected?: number;
}

interface CurrentAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  startTime: number;
  domain?: string;
}

type OperationMode = "auto" | "ask" | "readonly";

class SidePanelUI {
  private connectionStatusEl!: HTMLElement;
  private connectionDetailsEl!: HTMLElement;
  private currentActionEl!: HTMLElement;

  private pendingApprovalsEl!: HTMLElement;
  private approvalCounterEl!: HTMLElement;
  private activityLogEl!: HTMLElement;
  private refreshConnectionBtn!: HTMLButtonElement;
  private clearLogsBtn!: HTMLElement;
  private exportLogsBtn!: HTMLElement;
  private toggleModeBtn!: HTMLElement;
  private toggleSelectorPickerBtn!: HTMLElement;
  private copyLastSelectorBtn!: HTMLElement;
  private lastSelectorEl!: HTMLElement;
  private selectorSectionEl!: HTMLElement;

  // Domain policy elements
  private addDomainPolicyBtn!: HTMLElement;
  private importPoliciesBtn!: HTMLElement;
  private exportPoliciesBtn!: HTMLElement;
  private resetPoliciesBtn!: HTMLElement;
  private currentDomainPolicyEl!: HTMLElement;
  private currentDomainInfoEl!: HTMLElement;
  private editCurrentDomainBtn!: HTMLElement;
  private removeCurrentDomainBtn!: HTMLElement;
  private domainPoliciesListEl!: HTMLElement;

  // Modal elements
  private domainPolicyModalEl!: HTMLElement;
  private modalTitleEl!: HTMLElement;
  private closeModalBtn!: HTMLElement;
  private domainInputEl!: HTMLInputElement;
  private readPermissionEl!: HTMLInputElement;
  private writePermissionEl!: HTMLInputElement;
  private requiresApprovalEl!: HTMLInputElement;
  private maxStepsInputEl!: HTMLInputElement;
  private saveDomainPolicyBtn!: HTMLElement;
  private cancelDomainPolicyBtn!: HTMLElement;

  private logs: ActionLog[] = [];
  private pendingActions: PendingAction[] = [];
  private currentAction: CurrentAction | null = null;
  private connectionStatus: ConnectionStatus = {
    connected: false,
    reconnectAttempts: 0,
  };
  private operationMode: OperationMode = "auto";
  private currentDomain: string = "";
  private lastSelector: string = "";
  private selectorPickerActive: boolean = false;
  private domainPolicies: Record<string, DomainPolicy> = {};

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.startStatusPolling();
    this.loadStoredData();
    this.loadDomainPolicies();
    this.updateUI();
  }

  // Public methods for global access
  public openDomainPolicyModal(domain?: string) {
    this.openDomainPolicyModalInternal(domain);
  }

  public getDomainPolicies() {
    return this.domainPolicies;
  }

  public setDomainPolicies(policies: Record<string, DomainPolicy>) {
    this.domainPolicies = policies;
  }

  public async storeDomainPoliciesPublic() {
    return this.storeDomainPolicies();
  }

  public updateDomainPoliciesListPublic() {
    this.updateDomainPoliciesList();
  }

  public updateCurrentDomainPolicyPublic() {
    this.updateCurrentDomainPolicy();
  }

  private initializeElements() {
    this.connectionStatusEl = document.getElementById("connectionStatus")!;
    this.connectionDetailsEl = document.getElementById("connectionDetails")!;
    this.currentActionEl = document.getElementById("currentAction")!;
    this.pendingApprovalsEl = document.getElementById("pendingApprovals")!;
    this.approvalCounterEl = document.getElementById("approvalCounter")!;
    this.activityLogEl = document.getElementById("activityLog")!;
    this.refreshConnectionBtn = document.getElementById(
      "refreshConnection"
    ) as HTMLButtonElement;
    this.clearLogsBtn = document.getElementById("clearLogs")!;
    this.exportLogsBtn = document.getElementById("exportLogs")!;
    this.toggleModeBtn = document.getElementById("toggleMode")!;
    this.toggleSelectorPickerBtn = document.getElementById(
      "toggleSelectorPicker"
    )!;
    this.copyLastSelectorBtn = document.getElementById("copyLastSelector")!;
    this.lastSelectorEl = document.getElementById("lastSelector")!;
    this.selectorSectionEl = document.getElementById("selectorSection")!;

    // Domain policy elements
    this.addDomainPolicyBtn = document.getElementById("addDomainPolicy")!;
    this.importPoliciesBtn = document.getElementById("importPolicies")!;
    this.exportPoliciesBtn = document.getElementById("exportPolicies")!;
    this.resetPoliciesBtn = document.getElementById("resetPolicies")!;
    this.currentDomainPolicyEl = document.getElementById(
      "currentDomainPolicy"
    )!;
    this.currentDomainInfoEl = document.getElementById("currentDomainInfo")!;
    this.editCurrentDomainBtn = document.getElementById("editCurrentDomain")!;
    this.removeCurrentDomainBtn = document.getElementById(
      "removeCurrentDomain"
    )!;
    this.domainPoliciesListEl = document.getElementById("domainPoliciesList")!;

    // Modal elements
    this.domainPolicyModalEl = document.getElementById("domainPolicyModal")!;
    this.modalTitleEl = document.getElementById("modalTitle")!;
    this.closeModalBtn = document.getElementById("closeModal")!;
    this.domainInputEl = document.getElementById(
      "domainInput"
    ) as HTMLInputElement;
    this.readPermissionEl = document.getElementById(
      "readPermission"
    ) as HTMLInputElement;
    this.writePermissionEl = document.getElementById(
      "writePermission"
    ) as HTMLInputElement;
    this.requiresApprovalEl = document.getElementById(
      "requiresApproval"
    ) as HTMLInputElement;
    this.maxStepsInputEl = document.getElementById(
      "maxStepsInput"
    ) as HTMLInputElement;
    this.saveDomainPolicyBtn = document.getElementById("saveDomainPolicy")!;
    this.cancelDomainPolicyBtn = document.getElementById("cancelDomainPolicy")!;
  }

  private setupEventListeners() {
    this.refreshConnectionBtn.addEventListener("click", () => {
      this.forceReconnect();
    });

    this.clearLogsBtn.addEventListener("click", () => {
      this.clearLogs();
    });

    this.exportLogsBtn.addEventListener("click", () => {
      this.exportLogs();
    });

    this.toggleModeBtn.addEventListener("click", () => {
      this.toggleOperationMode();
    });

    this.toggleSelectorPickerBtn.addEventListener("click", () => {
      this.toggleSelectorPicker();
    });

    this.copyLastSelectorBtn.addEventListener("click", () => {
      this.copyLastSelector();
    });

    // Domain policy event listeners
    this.addDomainPolicyBtn.addEventListener("click", () => {
      this.openDomainPolicyModalInternal();
    });

    this.importPoliciesBtn.addEventListener("click", () => {
      this.importPolicies();
    });

    this.exportPoliciesBtn.addEventListener("click", () => {
      this.exportPolicies();
    });

    this.resetPoliciesBtn.addEventListener("click", () => {
      this.resetPolicies();
    });

    this.editCurrentDomainBtn.addEventListener("click", () => {
      this.editCurrentDomainPolicy();
    });

    this.removeCurrentDomainBtn.addEventListener("click", () => {
      this.removeCurrentDomainPolicy();
    });

    // Modal event listeners
    this.closeModalBtn.addEventListener("click", () => {
      this.closeDomainPolicyModal();
    });

    this.saveDomainPolicyBtn.addEventListener("click", () => {
      this.saveDomainPolicy();
    });

    this.cancelDomainPolicyBtn.addEventListener("click", () => {
      this.closeDomainPolicyModal();
    });

    // Close modal on background click
    this.domainPolicyModalEl.addEventListener("click", (event) => {
      if (event.target === this.domainPolicyModalEl) {
        this.closeDomainPolicyModal();
      }
    });

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((message) => {
      console.log("[SidePanel] Received message:", message.type);

      switch (message.type) {
        case "CONNECTION_STATUS_CHANGED":
          this.updateConnectionStatus(message.status);
          break;
        case "ACTION_STARTED":
          this.setCurrentAction(message.data);
          break;
        case "ACTION_LOG":
          this.addLogEntry(message.data);
          break;
        case "ACTION_COMPLETED":
          this.clearCurrentAction();
          this.removePendingAction(message.actionId);
          break;
        case "PENDING_ACTION":
          this.addPendingAction(message.data);
          break;
        case "DOMAIN_CHANGED":
          this.currentDomain = message.domain;
          this.updateUI();
          break;
        case "SELECTOR_PICKED":
          this.handleSelectorPicked(message.data);
          break;
      }
    });

    // Handle visibility changes to refresh status
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.checkConnectionStatus();
      }
    });
  }

  private async checkConnectionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_CONNECTION_STATUS",
      });
      this.updateConnectionStatus(
        response.status || {
          connected: response.connected,
          reconnectAttempts: 0,
        }
      );
    } catch (error) {
      console.error("Failed to check connection status:", error);
      this.updateConnectionStatus({
        connected: false,
        reconnectAttempts: 0,
        lastError: "Communication error",
      });
    }
  }

  private async forceReconnect() {
    try {
      await chrome.runtime.sendMessage({ type: "FORCE_RECONNECT" });
      this.refreshConnectionBtn.textContent = "🔄 Reconnecting...";
      this.refreshConnectionBtn.disabled = true;

      setTimeout(() => {
        this.refreshConnectionBtn.textContent = "🔄 Refresh";
        this.refreshConnectionBtn.disabled = false;
        this.checkConnectionStatus();
      }, 2000);
    } catch (error) {
      console.error("Failed to force reconnect:", error);
      this.refreshConnectionBtn.textContent = "🔄 Refresh";
      this.refreshConnectionBtn.disabled = false;
    }
  }

  private updateConnectionStatus(status: ConnectionStatus) {
    this.connectionStatus = status;

    const statusTextEl = this.connectionStatusEl.querySelector(
      ".status-text div:first-child"
    )!;

    if (status.connected) {
      statusTextEl.textContent = "Connected to MCP Server";
      this.connectionStatusEl.className = "status-bar connected";
      this.connectionDetailsEl.textContent = status.lastConnected
        ? `Connected at ${new Date(status.lastConnected).toLocaleTimeString()}`
        : "";
    } else {
      statusTextEl.textContent = "Disconnected from MCP Server";
      this.connectionStatusEl.className = status.lastError
        ? "status-bar error"
        : "status-bar disconnected";

      let details = "";
      if (status.reconnectAttempts > 0) {
        details = `Reconnect attempts: ${status.reconnectAttempts}`;
      }
      if (status.lastError) {
        details += details ? ` • ${status.lastError}` : status.lastError;
      }
      this.connectionDetailsEl.textContent = details;
    }
  }

  private setCurrentAction(action: CurrentAction) {
    this.currentAction = action;
    this.updateCurrentAction();
  }

  private clearCurrentAction() {
    this.currentAction = null;
    this.updateCurrentAction();
  }

  private updateCurrentAction() {
    if (!this.currentAction) {
      this.currentActionEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">⏸️</div>
          <div>No active actions</div>
        </div>
      `;
      return;
    }

    const duration = Date.now() - this.currentAction.startTime;
    const durationText =
      duration > 1000 ? `${Math.round(duration / 1000)}s` : `${duration}ms`;

    this.currentActionEl.innerHTML = `
      <div class="current-action">
        <div class="action-title">${this.currentAction.tool}</div>
        <div class="action-details">${JSON.stringify(
          this.currentAction.args,
          null,
          2
        )}</div>
        <div class="domain-info">
          ${
            this.currentAction.domain
              ? `Domain: ${this.currentAction.domain} • `
              : ""
          }
          Duration: ${durationText}
        </div>
      </div>
    `;
  }

  private addLogEntry(log: ActionLog) {
    this.logs.unshift(log); // Add to beginning
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(0, 100); // Keep only last 100 entries
    }
    this.updateActivityLog();
    this.storeData();
  }

  private updateActivityLog() {
    if (this.logs.length === 0) {
      this.activityLogEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">📝</div>
          <div>No recent activity</div>
        </div>
      `;
      return;
    }

    const logHtml = this.logs
      .slice(0, 20) // Show more entries
      .map((log) => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        const duration = log.duration ? ` (${log.duration}ms)` : "";

        let logClass = "log-entry";
        if (log.error) {
          logClass += " error";
        } else if (log.result) {
          logClass += " success";
        }

        return `
          <div class="${logClass}">
            <div>
              <span class="log-time">${timestamp}</span>
              <span class="log-tool">${log.tool}</span>
              <span class="log-duration">${duration}</span>
            </div>
            ${
              log.error
                ? `<div class="log-error">Error: ${log.error}</div>`
                : ""
            }
            ${log.url ? `<div class="domain-info">${log.url}</div>` : ""}
          </div>
        `;
      })
      .join("");

    this.activityLogEl.innerHTML = logHtml;
  }

  private addPendingAction(action: PendingAction) {
    // Avoid duplicates
    if (!this.pendingActions.find((a) => a.id === action.id)) {
      this.pendingActions.push(action);
      this.updatePendingApprovals();
    }
  }

  private removePendingAction(actionId: string) {
    this.pendingActions = this.pendingActions.filter(
      (action) => action.id !== actionId
    );
    this.updatePendingApprovals();
  }

  private updatePendingApprovals() {
    // Update counter
    if (this.pendingActions.length > 0) {
      this.approvalCounterEl.textContent =
        this.pendingActions.length.toString();
      this.approvalCounterEl.style.display = "inline";
    } else {
      this.approvalCounterEl.style.display = "none";
    }

    if (this.pendingActions.length === 0) {
      this.pendingApprovalsEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">✅</div>
          <div>No pending approvals</div>
        </div>
      `;
      return;
    }

    const approvalsHtml = this.pendingActions
      .map(
        (action) => `
        <div class="pending-action">
          <div class="action-header">
            <div class="action-title">${action.tool} on ${action.domain}</div>
            <div class="risk-badge ${action.riskLevel}">${
          action.riskLevel
        }</div>
          </div>
          <div class="action-details">${JSON.stringify(
            action.args,
            null,
            2
          )}</div>
          <div class="action-buttons">
            <button class="button small success" onclick="approveAction('${
              action.id
            }')">✓ Approve Once</button>
            <button class="button small warning" onclick="alwaysAllow('${
              action.id
            }')">🔓 Always Allow</button>
            <button class="button small danger" onclick="denyAction('${
              action.id
            }')">✗ Deny</button>
          </div>
        </div>
      `
      )
      .join("");

    this.pendingApprovalsEl.innerHTML = approvalsHtml;
  }

  private toggleOperationMode() {
    const modes: OperationMode[] = ["auto", "ask", "readonly"];
    const currentIndex = modes.indexOf(this.operationMode);
    this.operationMode = modes[(currentIndex + 1) % modes.length];

    this.updateModeButton();
    this.storeData();

    // Notify service worker of mode change
    chrome.runtime
      .sendMessage({
        type: "SET_OPERATION_MODE",
        mode: this.operationMode,
      })
      .catch(() => {
        // Ignore if no listeners
      });
  }

  private updateModeButton() {
    const modeIcons = {
      auto: "🔓",
      ask: "🔒",
      readonly: "👁️",
    };

    const modeLabels = {
      auto: "Auto",
      ask: "Ask",
      readonly: "Read-Only",
    };

    this.toggleModeBtn.textContent = `${modeIcons[this.operationMode]} Mode: ${
      modeLabels[this.operationMode]
    }`;

    // Update button style based on mode
    this.toggleModeBtn.className =
      "button " +
      (this.operationMode === "auto"
        ? "success"
        : this.operationMode === "ask"
        ? "warning"
        : "secondary");
  }

  private async toggleSelectorPicker() {
    try {
      // Get current active tab
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!activeTab?.id) {
        throw new Error("No active tab found");
      }

      // Toggle selector picker in content script
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: "TOGGLE_SELECTOR_PICKER",
      });

      this.selectorPickerActive = response.active;
      this.updateSelectorPickerButton();

      if (this.selectorPickerActive) {
        // Show selector section
        this.selectorSectionEl.style.display = "block";
      }
    } catch (error) {
      console.error("Failed to toggle selector picker:", error);

      // Try to inject content script if it's not loaded
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (activeTab?.id) {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["content.js"],
          });

          // Try again after injection
          setTimeout(() => this.toggleSelectorPicker(), 500);
        }
      } catch (injectionError) {
        console.error("Failed to inject content script:", injectionError);
      }
    }
  }

  private updateSelectorPickerButton() {
    if (this.selectorPickerActive) {
      this.toggleSelectorPickerBtn.textContent = "🎯 Stop Picking";
      this.toggleSelectorPickerBtn.className = "button danger";
    } else {
      this.toggleSelectorPickerBtn.textContent = "🎯 Pick Selector";
      this.toggleSelectorPickerBtn.className = "button";
    }
  }

  private handleSelectorPicked(data: {
    selector: string;
    tagName: string;
    textContent: string;
    attributes: Record<string, string>;
    timestamp: number;
  }) {
    this.lastSelector = data.selector;
    this.selectorPickerActive = false;

    this.updateSelectorPickerButton();
    this.updateLastSelector(data);
    this.storeData();
  }

  private updateLastSelector(data: {
    selector: string;
    tagName: string;
    textContent: string;
    attributes: Record<string, string>;
    timestamp: number;
  }) {
    if (!this.lastSelector) {
      this.lastSelectorEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">🎯</div>
          <div>No selector picked yet</div>
        </div>
      `;
      this.copyLastSelectorBtn.style.display = "none";
      return;
    }

    const timestamp = new Date(data.timestamp).toLocaleTimeString();

    this.lastSelectorEl.innerHTML = `
      <div class="current-action">
        <div class="action-title">Selected: ${data.tagName.toUpperCase()}</div>
        <div class="action-details">${data.selector}</div>
        <div class="domain-info">
          ${
            data.textContent
              ? `Text: "${data.textContent.substring(0, 50)}${
                  data.textContent.length > 50 ? "..." : ""
                }" • `
              : ""
          }
          Picked at ${timestamp}
        </div>
        ${
          Object.keys(data.attributes).length > 0
            ? `
          <div style="margin-top: 8px; font-size: 11px; color: #6c757d;">
            Attributes: ${Object.entries(data.attributes)
              .map(([key, value]) => `${key}="${value}"`)
              .join(", ")}
          </div>
        `
            : ""
        }
      </div>
    `;

    this.copyLastSelectorBtn.style.display = "inline-block";
    this.selectorSectionEl.style.display = "block";
  }

  private async copyLastSelector() {
    if (!this.lastSelector) return;

    try {
      await navigator.clipboard.writeText(this.lastSelector);

      // Show feedback
      const originalText = this.copyLastSelectorBtn.textContent;
      this.copyLastSelectorBtn.textContent = "✓ Copied!";
      this.copyLastSelectorBtn.className = "button secondary success";

      setTimeout(() => {
        this.copyLastSelectorBtn.textContent = originalText;
        this.copyLastSelectorBtn.className = "button secondary";
      }, 2000);
    } catch (error) {
      console.error("Failed to copy selector:", error);
    }
  }

  // Domain Policy Management Methods

  private openDomainPolicyModalInternal(domain?: string) {
    if (domain && this.domainPolicies[domain]) {
      // Edit existing domain
      this.modalTitleEl.textContent = "Edit Domain Policy";
      const policy = this.domainPolicies[domain];
      this.domainInputEl.value = domain;
      this.domainInputEl.disabled = true;
      this.readPermissionEl.checked = policy.read;
      this.writePermissionEl.checked = policy.write;
      this.requiresApprovalEl.checked = policy.requiresApproval || false;
      this.maxStepsInputEl.value = policy.maxStepsPerHour?.toString() || "";
    } else {
      // Add new domain
      this.modalTitleEl.textContent = "Add Domain Policy";
      this.domainInputEl.value = "";
      this.domainInputEl.disabled = false;
      this.readPermissionEl.checked = true;
      this.writePermissionEl.checked = false;
      this.requiresApprovalEl.checked = false;
      this.maxStepsInputEl.value = "";
    }

    this.domainPolicyModalEl.style.display = "flex";
  }

  private closeDomainPolicyModal() {
    this.domainPolicyModalEl.style.display = "none";
  }

  private async saveDomainPolicy() {
    const domain = this.domainInputEl.value.trim();
    if (!domain) {
      alert("Please enter a domain name");
      return;
    }

    // Validate domain format
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      alert("Please enter a valid domain name (e.g., example.com)");
      return;
    }

    const policy: DomainPolicy = {
      read: this.readPermissionEl.checked,
      write: this.writePermissionEl.checked,
      requiresApproval: this.requiresApprovalEl.checked,
    };

    const maxSteps = parseInt(this.maxStepsInputEl.value);
    if (!isNaN(maxSteps) && maxSteps > 0) {
      policy.maxStepsPerHour = maxSteps;
    }

    // Validate that at least one permission is granted
    if (!policy.read && !policy.write) {
      alert("Please grant at least one permission (read or write)");
      return;
    }

    this.domainPolicies[domain] = policy;
    await this.storeDomainPolicies();
    this.updateDomainPoliciesList();
    this.updateCurrentDomainPolicy();
    this.closeDomainPolicyModal();
  }

  private async removeCurrentDomainPolicy() {
    if (!this.currentDomain || !this.domainPolicies[this.currentDomain]) {
      return;
    }

    if (confirm(`Remove policy for ${this.currentDomain}?`)) {
      delete this.domainPolicies[this.currentDomain];
      await this.storeDomainPolicies();
      this.updateDomainPoliciesList();
      this.updateCurrentDomainPolicy();
    }
  }

  private editCurrentDomainPolicy() {
    if (this.currentDomain) {
      this.openDomainPolicyModalInternal(this.currentDomain);
    }
  }

  private async importPolicies() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedPolicies = JSON.parse(text);

        // Validate imported data
        if (typeof importedPolicies !== "object" || !importedPolicies) {
          throw new Error("Invalid policy file format");
        }

        // Merge with existing policies
        this.domainPolicies = { ...this.domainPolicies, ...importedPolicies };
        await this.storeDomainPolicies();
        this.updateDomainPoliciesList();
        this.updateCurrentDomainPolicy();

        alert(
          `Imported ${Object.keys(importedPolicies).length} domain policies`
        );
      } catch (error) {
        console.error("Failed to import policies:", error);
        alert("Failed to import policies. Please check the file format.");
      }
    };

    input.click();
  }

  private exportPolicies() {
    const dataStr = JSON.stringify(this.domainPolicies, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-web-pilot-policies-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private async resetPolicies() {
    if (
      confirm("Reset all domain policies to default? This cannot be undone.")
    ) {
      this.domainPolicies = {};
      await this.storeDomainPolicies();
      this.updateDomainPoliciesList();
      this.updateCurrentDomainPolicy();
    }
  }

  private updateDomainPoliciesList() {
    const domains = Object.keys(this.domainPolicies);

    if (domains.length === 0) {
      this.domainPoliciesListEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">🛡️</div>
          <div>No domain policies configured</div>
        </div>
      `;
      return;
    }

    const policiesHtml = domains
      .sort()
      .map((domain) => {
        const policy = this.domainPolicies[domain];
        const permissions: string[] = [];

        if (policy.read)
          permissions.push('<span class="permission-badge read">Read</span>');
        if (policy.write)
          permissions.push('<span class="permission-badge write">Write</span>');
        if (policy.requiresApproval)
          permissions.push(
            '<span class="permission-badge approval">Approval</span>'
          );

        return `
          <div class="domain-policy-item">
            <div class="domain-name">${domain}</div>
            <div class="domain-permissions">
              ${permissions.join(" ")}
              ${
                policy.maxStepsPerHour
                  ? `• Max: ${policy.maxStepsPerHour}/hour`
                  : ""
              }
            </div>
            <div class="domain-actions">
              <button class="button small" onclick="editDomainPolicy('${domain}')">✏️ Edit</button>
              <button class="button small danger" onclick="removeDomainPolicy('${domain}')">🗑️ Remove</button>
            </div>
          </div>
        `;
      })
      .join("");

    this.domainPoliciesListEl.innerHTML = policiesHtml;
  }

  private updateCurrentDomainPolicy() {
    if (!this.currentDomain || !this.domainPolicies[this.currentDomain]) {
      this.currentDomainPolicyEl.style.display = "none";
      return;
    }

    const policy = this.domainPolicies[this.currentDomain];
    const permissions: string[] = [];

    if (policy.read) permissions.push("Read");
    if (policy.write) permissions.push("Write");
    if (policy.requiresApproval) permissions.push("Requires Approval");

    this.currentDomainInfoEl.textContent = `
Domain: ${this.currentDomain}
Permissions: ${permissions.join(", ")}
${
  policy.maxStepsPerHour
    ? `Max Steps: ${policy.maxStepsPerHour}/hour`
    : "No step limit"
}
    `.trim();

    this.currentDomainPolicyEl.style.display = "block";
  }

  private async storeDomainPolicies() {
    try {
      await chrome.storage.sync.set({
        "ai-web-pilot-domain-policies": this.domainPolicies,
      });
    } catch (error) {
      console.error("Failed to store domain policies:", error);
    }
  }

  private async loadDomainPolicies() {
    try {
      const result = await chrome.storage.sync.get([
        "ai-web-pilot-domain-policies",
      ]);
      if (result["ai-web-pilot-domain-policies"]) {
        this.domainPolicies = result["ai-web-pilot-domain-policies"];
        this.updateDomainPoliciesList();
        this.updateCurrentDomainPolicy();
      }
    } catch (error) {
      console.error("Failed to load domain policies:", error);
    }
  }

  private clearLogs() {
    this.logs = [];
    this.updateActivityLog();
    this.storeData();
  }

  private exportLogs() {
    const exportData = {
      logs: this.logs,
      exportTime: new Date().toISOString(),
      version: "1.0",
      mode: this.operationMode,
      connectionStatus: this.connectionStatus,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
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

  private async storeData() {
    try {
      await chrome.storage.local.set({
        "ai-web-pilot-logs": this.logs,
        "ai-web-pilot-mode": this.operationMode,
        "ai-web-pilot-ui-state": {
          currentDomain: this.currentDomain,
          lastSelector: this.lastSelector,
          lastUpdate: Date.now(),
        },
      });
    } catch (error) {
      console.error("Failed to store data:", error);
    }
  }

  private async loadStoredData() {
    try {
      const result = await chrome.storage.local.get([
        "ai-web-pilot-logs",
        "ai-web-pilot-mode",
        "ai-web-pilot-ui-state",
      ]);

      if (result["ai-web-pilot-logs"]) {
        this.logs = result["ai-web-pilot-logs"];
      }

      if (result["ai-web-pilot-mode"]) {
        this.operationMode = result["ai-web-pilot-mode"];
      }

      if (result["ai-web-pilot-ui-state"]) {
        const uiState = result["ai-web-pilot-ui-state"];
        this.currentDomain = uiState.currentDomain || "";
        this.lastSelector = uiState.lastSelector || "";

        if (this.lastSelector) {
          this.updateLastSelector({
            selector: this.lastSelector,
            tagName: "element",
            textContent: "",
            attributes: {},
            timestamp: uiState.lastUpdate || Date.now(),
          });
        }
      }
    } catch (error) {
      console.error("Failed to load stored data:", error);
    }
  }

  private updateUI() {
    this.updateConnectionStatus(this.connectionStatus);
    this.updateCurrentAction();
    this.updatePendingApprovals();
    this.updateActivityLog();
    this.updateModeButton();
    this.updateSelectorPickerButton();
  }

  private startStatusPolling() {
    // Check connection status every 10 seconds
    setInterval(() => {
      this.checkConnectionStatus();
    }, 10000);

    // Update current action duration every second
    setInterval(() => {
      if (this.currentAction) {
        this.updateCurrentAction();
      }
    }, 1000);

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

// Global functions for domain policy management
let sidePanelInstance: SidePanelUI;

(window as unknown as Record<string, unknown>).editDomainPolicy = (
  domain: string
) => {
  sidePanelInstance?.openDomainPolicyModal(domain);
};

(window as unknown as Record<string, unknown>).removeDomainPolicy = async (
  domain: string
) => {
  if (sidePanelInstance && confirm(`Remove policy for ${domain}?`)) {
    const policies = sidePanelInstance.getDomainPolicies();
    delete policies[domain];
    sidePanelInstance.setDomainPolicies(policies);
    await sidePanelInstance.storeDomainPoliciesPublic();
    sidePanelInstance.updateDomainPoliciesListPublic();
    sidePanelInstance.updateCurrentDomainPolicyPublic();
  }
};

// Initialize the side panel UI when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  sidePanelInstance = new SidePanelUI();
});

console.log("AI Web Pilot side panel loaded");
