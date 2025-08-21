// DOM interaction operations using Chrome DevTools Protocol
// Provides click, type, and wait functionality

import { cdpManager } from "./cdp-manager";

export interface ClickOptions {
  selector: string;
  tabId?: number;
}

export interface TypeTextOptions {
  selector: string;
  text: string;
  submit?: boolean;
  tabId?: number;
}

export interface WaitForOptions {
  selector: string;
  timeout_ms?: number;
  tabId?: number;
}

export interface ElementInfo {
  nodeId: number;
  backendNodeId: number;
  objectId?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ReadTextOptions {
  selector?: string;
  tabId?: number;
}

export interface ReadDomOptions {
  selector?: string;
  tabId?: number;
}

export interface EvalJsOptions {
  code: string;
  tabId?: number;
}

/**
 * Get the active tab ID if not specified
 */
async function getActiveTabId(specifiedTabId?: number): Promise<number> {
  if (specifiedTabId) {
    return specifiedTabId;
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (tabs.length === 0) {
        reject(new Error("No active tab found"));
      } else {
        resolve(tabs[0].id!);
      }
    });
  });
}

/**
 * Find an element using CSS selector and return its information
 */
async function findElement(
  tabId: number,
  selector: string
): Promise<ElementInfo> {
  try {
    // Get the document root
    const documentResult = (await cdpManager.sendCommand(
      tabId,
      "DOM.getDocument",
      {
        depth: 0,
        pierce: false,
      }
    )) as { root: { nodeId: number } };

    // Query for the element
    const queryResult = (await cdpManager.sendCommand(
      tabId,
      "DOM.querySelector",
      {
        nodeId: documentResult.root.nodeId,
        selector: selector,
      }
    )) as { nodeId: number };

    if (queryResult.nodeId === 0) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Get element box model for positioning
    let boundingBox;
    try {
      const boxModelResult = (await cdpManager.sendCommand(
        tabId,
        "DOM.getBoxModel",
        {
          nodeId: queryResult.nodeId,
        }
      )) as { model: { border: number[] } };

      if (boxModelResult.model?.border) {
        const border = boxModelResult.model.border;
        // border is an array of 8 numbers: [x1, y1, x2, y2, x3, y3, x4, y4]
        // representing the four corners of the border box
        const x = Math.min(border[0], border[2], border[4], border[6]);
        const y = Math.min(border[1], border[3], border[5], border[7]);
        const maxX = Math.max(border[0], border[2], border[4], border[6]);
        const maxY = Math.max(border[1], border[3], border[5], border[7]);

        boundingBox = {
          x,
          y,
          width: maxX - x,
          height: maxY - y,
        };
      }
    } catch (boxModelError) {
      console.warn(
        `[DOMOperations] Could not get box model for element: ${boxModelError}`
      );
      // Continue without bounding box - we can still interact with the element
    }

    // Get backend node ID for more reliable operations
    const backendNodeResult = (await cdpManager.sendCommand(
      tabId,
      "DOM.describeNode",
      {
        nodeId: queryResult.nodeId,
      }
    )) as { node: { backendNodeId: number } };

    return {
      nodeId: queryResult.nodeId,
      backendNodeId: backendNodeResult.node.backendNodeId,
      boundingBox,
    };
  } catch (error) {
    throw new Error(`Failed to find element "${selector}": ${error}`);
  }
}

/**
 * Click on an element using CDP
 */
export async function clickElement(options: ClickOptions): Promise<void> {
  const tabId = await getActiveTabId(options.tabId);

  try {
    // Ensure CDP session is attached
    if (!cdpManager.isAttached(tabId)) {
      await cdpManager.attachToTab(tabId);
    }

    // Find the element
    const element = await findElement(tabId, options.selector);

    if (element.boundingBox) {
      // Use precise mouse event if we have bounding box
      const centerX = element.boundingBox.x + element.boundingBox.width / 2;
      const centerY = element.boundingBox.y + element.boundingBox.height / 2;

      // Dispatch mouse events for a complete click
      await cdpManager.sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: centerX,
        y: centerY,
        button: "left",
        clickCount: 1,
      });

      await cdpManager.sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: centerX,
        y: centerY,
        button: "left",
        clickCount: 1,
      });

      console.log(
        `[DOMOperations] Clicked element "${options.selector}" at (${centerX}, ${centerY})`
      );
    } else {
      // Fallback: Use DOM.focus and simulate click via JavaScript
      await cdpManager.sendCommand(tabId, "DOM.focus", {
        nodeId: element.nodeId,
      });

      // Simulate click event via JavaScript
      await cdpManager.sendCommand(tabId, "Runtime.evaluate", {
        expression: `
          (function() {
            const element = document.querySelector('${options.selector.replace(
              /'/g,
              "\\'"
            )}');
            if (element) {
              element.click();
              return true;
            }
            return false;
          })()
        `,
        returnByValue: true,
      });

      console.log(
        `[DOMOperations] Clicked element "${options.selector}" using fallback method`
      );
    }
  } catch (error) {
    throw new Error(`Failed to click element "${options.selector}": ${error}`);
  }
}

/**
 * Type text into an element
 */
export async function typeText(options: TypeTextOptions): Promise<void> {
  const tabId = await getActiveTabId(options.tabId);

  try {
    // Ensure CDP session is attached
    if (!cdpManager.isAttached(tabId)) {
      await cdpManager.attachToTab(tabId);
    }

    // Find the element
    const element = await findElement(tabId, options.selector);

    // Focus the element first
    await cdpManager.sendCommand(tabId, "DOM.focus", {
      nodeId: element.nodeId,
    });

    // Clear existing content by selecting all and then typing
    await cdpManager.sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      modifiers: 2, // Ctrl modifier
    });

    await cdpManager.sendCommand(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      modifiers: 2, // Ctrl modifier
    });

    // Type the new text
    for (const char of options.text) {
      await cdpManager.sendCommand(tabId, "Input.dispatchKeyEvent", {
        type: "char",
        text: char,
      });
    }

    console.log(
      `[DOMOperations] Typed text into element "${options.selector}"`
    );

    // Submit form if requested
    if (options.submit) {
      await cdpManager.sendCommand(tabId, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
      });

      await cdpManager.sendCommand(tabId, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
      });

      console.log(`[DOMOperations] Submitted form after typing`);
    }
  } catch (error) {
    throw new Error(
      `Failed to type text into element "${options.selector}": ${error}`
    );
  }
}

/**
 * Wait for an element to appear in the DOM
 */
export async function waitForElement(options: WaitForOptions): Promise<void> {
  const tabId = await getActiveTabId(options.tabId);
  const timeout = options.timeout_ms || 5000;
  const startTime = Date.now();
  const pollInterval = 100; // Check every 100ms

  try {
    // Ensure CDP session is attached
    if (!cdpManager.isAttached(tabId)) {
      await cdpManager.attachToTab(tabId);
    }

    while (Date.now() - startTime < timeout) {
      try {
        // Try to find the element
        await findElement(tabId, options.selector);
        console.log(
          `[DOMOperations] Element "${options.selector}" found after ${
            Date.now() - startTime
          }ms`
        );
        return; // Element found!
      } catch (error) {
        // Element not found yet, continue waiting
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(
      `Element "${options.selector}" not found within ${timeout}ms`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found within")) {
      throw error; // Re-throw timeout errors as-is
    }
    throw new Error(
      `Failed to wait for element "${options.selector}": ${error}`
    );
  }
}

/**
 * Check if an element exists without throwing an error
 */
export async function elementExists(
  selector: string,
  tabId?: number
): Promise<boolean> {
  try {
    const resolvedTabId = await getActiveTabId(tabId);

    if (!cdpManager.isAttached(resolvedTabId)) {
      await cdpManager.attachToTab(resolvedTabId);
    }

    await findElement(resolvedTabId, selector);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get element information for debugging
 */
export async function getElementInfo(
  selector: string,
  tabId?: number
): Promise<ElementInfo | null> {
  try {
    const resolvedTabId = await getActiveTabId(tabId);

    if (!cdpManager.isAttached(resolvedTabId)) {
      await cdpManager.attachToTab(resolvedTabId);
    }

    return await findElement(resolvedTabId, selector);
  } catch (error) {
    console.warn(
      `[DOMOperations] Could not get element info for "${selector}":`,
      error
    );
    return null;
  }
}
/**
 * Read text content from an element or the entire page
 */
export async function readText(options: ReadTextOptions): Promise<string> {
  const tabId = await getActiveTabId(options.tabId);

  try {
    // Ensure CDP session is attached
    if (!cdpManager.isAttached(tabId)) {
      await cdpManager.attachToTab(tabId);
    }

    let jsCode: string;

    if (options.selector) {
      // Read text from specific element
      jsCode = `
        (function() {
          const element = document.querySelector('${options.selector.replace(
            /'/g,
            "\\'"
          )}');
          if (!element) {
            throw new Error('Element not found: ${options.selector.replace(
              /'/g,
              "\\'"
            )}');
          }
          
          // Get visible text content, handling different element types
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            return element.value || '';
          } else if (element.tagName === 'SELECT') {
            const selectedOption = element.options[element.selectedIndex];
            return selectedOption ? selectedOption.text : '';
          } else {
            // For other elements, get text content but clean up whitespace
            return element.textContent ? element.textContent.trim().replace(/\\s+/g, ' ') : '';
          }
        })()
      `;
    } else {
      // Read text from entire page
      jsCode = `
        (function() {
          // Get page title and main content
          const title = document.title || '';
          const bodyText = document.body ? document.body.textContent : '';
          
          // Clean up whitespace and combine
          const cleanBodyText = bodyText ? bodyText.trim().replace(/\\s+/g, ' ') : '';
          
          if (title && cleanBodyText) {
            return title + '\\n\\n' + cleanBodyText;
          } else if (title) {
            return title;
          } else {
            return cleanBodyText;
          }
        })()
      `;
    }

    const result = (await cdpManager.sendCommand(tabId, "Runtime.evaluate", {
      expression: jsCode,
      returnByValue: true,
      awaitPromise: false,
    })) as { result: { value: string } };

    if (result.result?.value !== undefined) {
      console.log(
        `[DOMOperations] Read text from ${options.selector || "page"}`
      );
      return result.result.value;
    } else {
      throw new Error("No text content returned");
    }
  } catch (error) {
    const target = options.selector || "page";
    throw new Error(`Failed to read text from ${target}: ${error}`);
  }
}

/**
 * Read DOM structure for debugging failed selectors
 */
export async function readDom(options: ReadDomOptions): Promise<string> {
  const tabId = await getActiveTabId(options.tabId);

  try {
    // Ensure CDP session is attached
    if (!cdpManager.isAttached(tabId)) {
      await cdpManager.attachToTab(tabId);
    }

    let jsCode: string;

    if (options.selector) {
      // Read DOM structure around a specific element
      jsCode = `
        (function() {
          const element = document.querySelector('${options.selector.replace(
            /'/g,
            "\\'"
          )}');
          if (!element) {
            // Element not found, return nearby elements for debugging
            const allElements = Array.from(document.querySelectorAll('*'));
            const suggestions = allElements
              .filter(el => {
                const text = el.textContent?.trim();
                const selector = '${options.selector.replace(/'/g, "\\'")}';
                // Look for elements with similar text or attributes
                return text && (
                  text.toLowerCase().includes(selector.toLowerCase()) ||
                  el.className.toLowerCase().includes(selector.toLowerCase()) ||
                  el.id.toLowerCase().includes(selector.toLowerCase())
                );
              })
              .slice(0, 5)
              .map(el => {
                const tag = el.tagName.toLowerCase();
                const id = el.id ? '#' + el.id : '';
                const classes = el.className ? '.' + el.className.split(' ').join('.') : '';
                const text = el.textContent?.trim().substring(0, 50) || '';
                return \`<\${tag}\${id}\${classes}>\${text}...\`;
              });
            
            return 'Element not found. Similar elements:\\n' + suggestions.join('\\n');
          }
          
          // Return the element and its context
          const tag = element.tagName.toLowerCase();
          const id = element.id ? ' id="' + element.id + '"' : '';
          const className = element.className ? ' class="' + element.className + '"' : '';
          const text = element.textContent?.trim().substring(0, 100) || '';
          
          let result = \`Found element: <\${tag}\${id}\${className}>\${text}...\`;
          
          // Add parent context
          if (element.parentElement) {
            const parentTag = element.parentElement.tagName.toLowerCase();
            const parentId = element.parentElement.id ? ' id="' + element.parentElement.id + '"' : '';
            const parentClass = element.parentElement.className ? ' class="' + element.parentElement.className + '"' : '';
            result += \`\\nParent: <\${parentTag}\${parentId}\${parentClass}>\`;
          }
          
          // Add children context
          const children = Array.from(element.children).slice(0, 3);
          if (children.length > 0) {
            result += '\\nChildren:';
            children.forEach(child => {
              const childTag = child.tagName.toLowerCase();
              const childId = child.id ? ' id="' + child.id + '"' : '';
              const childClass = child.className ? ' class="' + child.className + '"' : '';
              const childText = child.textContent?.trim().substring(0, 30) || '';
              result += \`\\n  <\${childTag}\${childId}\${childClass}>\${childText}...\`;
            });
          }
          
          return result;
        })()
      `;
    } else {
      // Read overall page structure
      jsCode = `
        (function() {
          const title = document.title || 'No title';
          const url = window.location.href;
          
          // Get main structural elements
          const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 5)
            .map(h => \`\${h.tagName}: \${h.textContent?.trim().substring(0, 50) || ''}\`);
          
          const forms = Array.from(document.querySelectorAll('form')).slice(0, 3)
            .map((form, i) => {
              const inputs = Array.from(form.querySelectorAll('input, select, textarea')).slice(0, 3)
                .map(input => \`  \${input.tagName.toLowerCase()}\${input.type ? '[' + input.type + ']' : ''}\${input.name ? ' name="' + input.name + '"' : ''}\`);
              return \`Form \${i + 1}:\\n\${inputs.join('\\n')}\`;
            });
          
          const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).slice(0, 5)
            .map(btn => \`Button: \${btn.textContent?.trim() || btn.value || 'No text'}\`);
          
          let result = \`Page: \${title}\\nURL: \${url}\`;
          
          if (headings.length > 0) {
            result += '\\n\\nHeadings:\\n' + headings.join('\\n');
          }
          
          if (forms.length > 0) {
            result += '\\n\\nForms:\\n' + forms.join('\\n\\n');
          }
          
          if (buttons.length > 0) {
            result += '\\n\\nButtons:\\n' + buttons.join('\\n');
          }
          
          return result;
        })()
      `;
    }

    const result = (await cdpManager.sendCommand(tabId, "Runtime.evaluate", {
      expression: jsCode,
      returnByValue: true,
      awaitPromise: false,
    })) as { result: { value: string } };

    if (result.result?.value !== undefined) {
      console.log(
        `[DOMOperations] Read DOM structure for ${options.selector || "page"}`
      );
      return result.result.value;
    } else {
      throw new Error("No DOM structure returned");
    }
  } catch (error) {
    const target = options.selector || "page";
    throw new Error(`Failed to read DOM structure for ${target}: ${error}`);
  }
}

/**
 * Execute JavaScript code in the page context
 */
export async function executeJavaScript(
  options: EvalJsOptions
): Promise<unknown> {
  const tabId = await getActiveTabId(options.tabId);

  try {
    // Ensure CDP session is attached
    if (!cdpManager.isAttached(tabId)) {
      await cdpManager.attachToTab(tabId);
    }

    // Wrap the code in a function to provide better error handling and sandboxing
    const wrappedCode = `
      (function() {
        try {
          ${options.code}
        } catch (error) {
          throw new Error('JavaScript execution error: ' + error.message);
        }
      })()
    `;

    const result = (await cdpManager.sendCommand(tabId, "Runtime.evaluate", {
      expression: wrappedCode,
      returnByValue: true,
      awaitPromise: true, // Allow async code
      timeout: 10000, // 10 second timeout
    })) as {
      result: {
        value?: unknown;
        type: string;
      };
      exceptionDetails?: {
        text: string;
        exception?: {
          description: string;
        };
      };
    };

    if (result.exceptionDetails) {
      const errorMessage =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text;
      throw new Error(`JavaScript execution failed: ${errorMessage}`);
    }

    console.log(`[DOMOperations] Executed JavaScript code successfully`);
    return result.result.value;
  } catch (error) {
    throw new Error(`Failed to execute JavaScript: ${error}`);
  }
}
