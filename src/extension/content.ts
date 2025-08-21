// Chrome extension content script
// Handles element highlighting and selector generation for AI Web Pilot

interface SelectorPickerState {
  active: boolean;
  highlightedElement: HTMLElement | null;
  overlay: HTMLElement | null;
  tooltip: HTMLElement | null;
}

class SelectorPicker {
  private state: SelectorPickerState = {
    active: false,
    highlightedElement: null,
    overlay: null,
    tooltip: null,
  };

  private originalCursor: string = "";
  private boundHandlers = {
    mouseover: this.handleMouseOver.bind(this),
    mouseout: this.handleMouseOut.bind(this),
    click: this.handleClick.bind(this),
    keydown: this.handleKeyDown.bind(this),
  };

  constructor() {
    this.setupMessageListener();
    this.createOverlayElements();
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case "TOGGLE_SELECTOR_PICKER":
          this.toggle();
          sendResponse({ success: true, active: this.state.active });
          break;
        case "DISABLE_SELECTOR_PICKER":
          this.disable();
          sendResponse({ success: true });
          break;
        case "GET_SELECTOR_PICKER_STATUS":
          sendResponse({ active: this.state.active });
          break;
      }
      return true;
    });
  }

  private createOverlayElements() {
    // Create highlight overlay
    this.state.overlay = document.createElement("div");
    this.state.overlay.id = "ai-web-pilot-selector-overlay";
    this.state.overlay.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 999999;
      border: 2px solid #007bff;
      background: rgba(0, 123, 255, 0.1);
      border-radius: 3px;
      display: none;
      box-shadow: 0 0 0 1px rgba(0, 123, 255, 0.3);
    `;

    // Create tooltip
    this.state.tooltip = document.createElement("div");
    this.state.tooltip.id = "ai-web-pilot-selector-tooltip";
    this.state.tooltip.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 1000000;
      background: #333;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      font-size: 12px;
      max-width: 400px;
      word-break: break-all;
      display: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;

    // Add elements to document
    document.documentElement.appendChild(this.state.overlay);
    document.documentElement.appendChild(this.state.tooltip);
  }

  public toggle() {
    if (this.state.active) {
      this.disable();
    } else {
      this.enable();
    }
  }

  public enable() {
    if (this.state.active) return;

    this.state.active = true;
    this.originalCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    // Add event listeners
    document.addEventListener("mouseover", this.boundHandlers.mouseover, true);
    document.addEventListener("mouseout", this.boundHandlers.mouseout, true);
    document.addEventListener("click", this.boundHandlers.click, true);
    document.addEventListener("keydown", this.boundHandlers.keydown, true);

    // Show instructions
    this.showInstructions();

    console.log("[SelectorPicker] Enabled");
  }

  public disable() {
    if (!this.state.active) return;

    this.state.active = false;
    document.body.style.cursor = this.originalCursor;

    // Remove event listeners
    document.removeEventListener("mouseover", this.boundHandlers.mouseover, true);
    document.removeEventListener("mouseout", this.boundHandlers.mouseout, true);
    document.removeEventListener("click", this.boundHandlers.click, true);
    document.removeEventListener("keydown", this.boundHandlers.keydown, true);

    // Hide overlay and tooltip
    this.hideHighlight();
    this.hideInstructions();

    console.log("[SelectorPicker] Disabled");
  }

  private handleMouseOver(event: MouseEvent) {
    if (!this.state.active) return;

    const element = event.target as HTMLElement;
    if (!element || element === this.state.overlay || element === this.state.tooltip) {
      return;
    }

    this.highlightElement(element);
  }

  private handleMouseOut(event: MouseEvent) {
    if (!this.state.active) return;

    const element = event.target as HTMLElement;
    if (element === this.state.highlightedElement) {
      // Don't hide if moving to a child element
      const relatedTarget = event.relatedTarget as HTMLElement;
      if (relatedTarget && element.contains(relatedTarget)) {
        return;
      }
      this.hideHighlight();
    }
  }

  private handleClick(event: MouseEvent) {
    if (!this.state.active) return;

    event.preventDefault();
    event.stopPropagation();

    const element = event.target as HTMLElement;
    if (!element || element === this.state.overlay || element === this.state.tooltip) {
      return;
    }

    this.selectElement(element);
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!this.state.active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      this.disable();
    }
  }

  private highlightElement(element: HTMLElement) {
    if (!this.state.overlay || !this.state.tooltip) return;

    this.state.highlightedElement = element;

    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    // Position overlay
    this.state.overlay.style.display = "block";
    this.state.overlay.style.left = `${rect.left + scrollX}px`;
    this.state.overlay.style.top = `${rect.top + scrollY}px`;
    this.state.overlay.style.width = `${rect.width}px`;
    this.state.overlay.style.height = `${rect.height}px`;

    // Generate and show selector
    const selector = this.generateSelector(element);
    this.showTooltip(selector, rect, scrollX, scrollY);
  }

  private hideHighlight() {
    if (this.state.overlay) {
      this.state.overlay.style.display = "none";
    }
    if (this.state.tooltip) {
      this.state.tooltip.style.display = "none";
    }
    this.state.highlightedElement = null;
  }

  private showTooltip(selector: string, rect: DOMRect, scrollX: number, scrollY: number) {
    if (!this.state.tooltip) return;

    this.state.tooltip.textContent = selector;
    this.state.tooltip.style.display = "block";

    // Position tooltip above element, or below if not enough space
    const tooltipRect = this.state.tooltip.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceAbove >= tooltipRect.height + 10 || spaceAbove > spaceBelow) {
      // Position above
      this.state.tooltip.style.left = `${rect.left + scrollX}px`;
      this.state.tooltip.style.top = `${rect.top + scrollY - tooltipRect.height - 8}px`;
    } else {
      // Position below
      this.state.tooltip.style.left = `${rect.left + scrollX}px`;
      this.state.tooltip.style.top = `${rect.bottom + scrollY + 8}px`;
    }

    // Ensure tooltip stays within viewport
    const tooltipLeft = parseInt(this.state.tooltip.style.left);
    const maxLeft = window.innerWidth - tooltipRect.width - 10;
    if (tooltipLeft > maxLeft) {
      this.state.tooltip.style.left = `${maxLeft + scrollX}px`;
    }
  }

  private selectElement(element: HTMLElement) {
    const selector = this.generateSelector(element);
    
    // Copy to clipboard
    this.copyToClipboard(selector);
    
    // Send to side panel
    chrome.runtime.sendMessage({
      type: "SELECTOR_PICKED",
      data: {
        selector,
        tagName: element.tagName.toLowerCase(),
        textContent: element.textContent?.substring(0, 100) || "",
        attributes: this.getElementAttributes(element),
        timestamp: Date.now(),
      },
    }).catch(() => {
      // Ignore if no listeners
    });

    // Show success feedback
    this.showSuccessFeedback(selector);
    
    // Disable picker after selection
    setTimeout(() => this.disable(), 1000);
  }

  private generateSelector(element: HTMLElement): string {
    // Try different selector strategies in order of preference
    const strategies = [
      () => this.getSelectorById(element),
      () => this.getSelectorByUniqueAttribute(element),
      () => this.getSelectorByClass(element),
      () => this.getSelectorByTagAndText(element),
      () => this.getSelectorByPosition(element),
    ];

    for (const strategy of strategies) {
      const selector = strategy();
      if (selector && this.isUniqueSelector(selector)) {
        return selector;
      }
    }

    // Fallback to nth-child selector
    return this.getSelectorByPath(element);
  }

  private getSelectorById(element: HTMLElement): string | null {
    if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
      return `#${element.id}`;
    }
    return null;
  }

  private getSelectorByUniqueAttribute(element: HTMLElement): string | null {
    const uniqueAttributes = ['data-testid', 'data-test', 'data-cy', 'data-automation-id', 'name'];
    
    for (const attr of uniqueAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        const selector = `[${attr}="${value}"]`;
        if (this.isUniqueSelector(selector)) {
          return selector;
        }
      }
    }
    return null;
  }

  private getSelectorByClass(element: HTMLElement): string | null {
    if (!element.className) return null;

    const classes = Array.from(element.classList)
      .filter(cls => cls && /^[a-zA-Z][\w-]*$/.test(cls))
      .slice(0, 3); // Limit to first 3 classes

    if (classes.length === 0) return null;

    const tagName = element.tagName.toLowerCase();
    const classSelector = classes.map(cls => `.${cls}`).join('');
    
    return `${tagName}${classSelector}`;
  }

  private getSelectorByTagAndText(element: HTMLElement): string | null {
    const text = element.textContent?.trim();
    if (!text || text.length > 30) return null;

    const tagName = element.tagName.toLowerCase();
    const escapedText = text.replace(/"/g, '\\"');
    
    return `${tagName}:contains("${escapedText}")`;
  }

  private getSelectorByPosition(element: HTMLElement): string | null {
    const parent: HTMLElement | null = element.parentElement;
    if (!parent) return null;

    const tagName = element.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (child): child is HTMLElement => child.tagName.toLowerCase() === tagName
    );

    if (siblings.length === 1) {
      const parentSelector = this.generateSelector(parent);
      return `${parentSelector} > ${tagName}`;
    }

    const index = siblings.indexOf(element) + 1;
    const parentSelector = this.generateSelector(parent);
    return `${parentSelector} > ${tagName}:nth-child(${index})`;
  }

  private getSelectorByPath(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.documentElement) {
      const tagName = current.tagName.toLowerCase();
      const parent: HTMLElement | null = current.parentElement;
      
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child): child is HTMLElement => child.tagName.toLowerCase() === tagName
        );
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          path.unshift(`${tagName}:nth-child(${index})`);
        } else {
          path.unshift(tagName);
        }
      } else {
        path.unshift(tagName);
      }

      current = parent;
    }

    return path.join(' > ');
  }

  private isUniqueSelector(selector: string): boolean {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length === 1;
    } catch {
      return false;
    }
  }

  private getElementAttributes(element: HTMLElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    const importantAttrs = ['id', 'class', 'name', 'type', 'role', 'aria-label', 'data-testid'];
    
    for (const attr of importantAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    }
    
    return attributes;
  }

  private async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        console.warn("Fallback copy failed:", err);
      }
      textArea.remove();
    }
  }

  private showSuccessFeedback(selector: string) {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 1000001;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      max-width: 300px;
      word-break: break-all;
    `;
    feedback.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">✓ Selector Copied!</div>
      <div style="font-size: 12px; opacity: 0.9;">${selector}</div>
    `;

    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.remove();
    }, 3000);
  }

  private showInstructions() {
    const instructions = document.createElement("div");
    instructions.id = "ai-web-pilot-instructions";
    instructions.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      z-index: 1000001;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    instructions.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">🎯 Selector Picker Active</div>
      <div>Click any element to copy its selector</div>
      <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Press ESC to cancel</div>
    `;

    document.body.appendChild(instructions);
  }

  private hideInstructions() {
    const instructions = document.getElementById("ai-web-pilot-instructions");
    if (instructions) {
      instructions.remove();
    }
  }
}

// Initialize selector picker
new SelectorPicker();

console.log("[AI Web Pilot] Content script loaded with selector picker");