# Requirements Document

## Introduction

The AI Web Pilot is a Chrome/Chromium extension that enables AI models (Claude or Qwen) to safely control an existing browser profile through a Model Context Protocol (MCP) server. The system allows AI to perform web automation tasks like navigation, reading, clicking, typing, downloading, and tab management while maintaining security through guardrails, user approvals, and policy controls. The solution preserves existing user profiles, passwords, and extensions without requiring browser modifications.

## Requirements

### Requirement 1: Core Extension Architecture

**User Story:** As a developer, I want a Manifest V3 Chrome extension with TypeScript support, so that I can build a modern, secure web automation tool.

#### Acceptance Criteria

1. WHEN the extension is built THEN it SHALL use Manifest V3 format with TypeScript compiled to JavaScript
2. WHEN the extension is packaged THEN it SHALL include service worker, content scripts, and side panel components
3. WHEN the extension is loaded THEN it SHALL request permissions for "tabs", "scripting", "downloads", "cookies", "storage", "declarativeNetRequest", "debugger", "clipboardWrite", "activeTab"
4. WHEN the extension is installed THEN it SHALL have host_permissions for "<all_urls>"
5. WHEN the extension starts THEN it SHALL establish WebSocket connection to localhost:8777 for MCP communication

### Requirement 2: MCP Server Integration

**User Story:** As an AI model, I want to control browser actions through standardized MCP tools, so that I can perform web automation tasks reliably.

#### Acceptance Criteria

1. WHEN the MCP server starts THEN it SHALL expose tools for web automation via @modelcontextprotocol/sdk/server
2. WHEN a tool is called THEN it SHALL validate input using Zod schemas
3. WHEN the server receives a tool request THEN it SHALL communicate with the extension via WebSocket bridge
4. WHEN the server processes requests THEN it SHALL apply domain policies and security guardrails
5. WHEN sensitive actions are requested THEN it SHALL require user approval through the side panel

### Requirement 3: Web Automation Tools

**User Story:** As an AI model, I want comprehensive web interaction capabilities, so that I can perform complex browser automation tasks.

#### Acceptance Criteria

1. WHEN open_tab is called THEN it SHALL create a new tab with the specified URL and return tabId
2. WHEN navigate is called THEN it SHALL navigate to the specified URL in the target tab
3. WHEN click is called THEN it SHALL use Chrome DevTools Protocol to click elements by CSS selector
4. WHEN type_text is called THEN it SHALL input text into form fields and optionally submit forms
5. WHEN read_text is called THEN it SHALL extract text content from specified elements or entire page
6. WHEN read_dom is called THEN it SHALL return HTML structure for debugging selector issues
7. WHEN wait_for is called THEN it SHALL wait for elements to appear with configurable timeout
8. WHEN eval_js is called THEN it SHALL execute sandboxed JavaScript and return results
9. WHEN screenshot is called THEN it SHALL capture page screenshots and save to configured directory
10. WHEN tabs_list is called THEN it SHALL return all open tabs with id, title, url, and active status
11. WHEN download_current is called THEN it SHALL initiate downloads and move files to configured directory

### Requirement 4: Security and Policy Controls

**User Story:** As a user, I want granular control over what domains and actions the AI can perform, so that I can maintain security while enabling automation.

#### Acceptance Criteria

1. WHEN a tool targets a domain THEN it SHALL check allowlist configuration for read/write permissions
2. WHEN sensitive patterns are detected THEN it SHALL redact password, card, cvv, iban, ssn, phone, email fields from logs
3. WHEN checkout domains or password fields are encountered THEN it SHALL require explicit user approval
4. WHEN step budget is exceeded THEN it SHALL terminate the automation task
5. WHEN 5 consecutive tool failures occur THEN it SHALL cancel the current task
6. WHEN large POST bodies (>8KB) are submitted THEN it SHALL require user confirmation
7. WHEN restricted pages (chrome://, Chrome Web Store) are accessed THEN it SHALL block operations with helpful error

### Requirement 5: Side Panel User Interface

**User Story:** As a user, I want a clear interface to monitor AI actions and approve sensitive operations, so that I maintain control over browser automation.

#### Acceptance Criteria

1. WHEN the side panel opens THEN it SHALL display connection status for Model/MCP/Extension
2. WHEN an action is queued THEN it SHALL show the upcoming tool call with method and arguments
3. WHEN approval is needed THEN it SHALL provide "Approve Once", "Deny", and "Always Allow" buttons
4. WHEN actions are executed THEN it SHALL display live log with timestamps, tools, and result summaries
5. WHEN selector picker is enabled THEN it SHALL overlay element outlines and copy selectors to clipboard
6. WHEN domain policies change THEN it SHALL persist settings in chrome.storage.sync

### Requirement 6: Chrome DevTools Protocol Integration

**User Story:** As a developer, I want reliable DOM interaction through CDP, so that web automation works consistently across different page types.

#### Acceptance Criteria

1. WHEN a tab requires automation THEN it SHALL attach chrome.debugger with CDP version 1.3
2. WHEN DOM operations are needed THEN it SHALL enable Page, DOM, and Runtime domains
3. WHEN elements are clicked THEN it SHALL use DOM.querySelector and Input.dispatchMouseEvent for precise targeting
4. WHEN text is typed THEN it SHALL focus elements and use appropriate input methods
5. WHEN selectors fail THEN it SHALL provide fallback to chrome.scripting.executeScript for simple operations

### Requirement 7: Configuration and Logging

**User Story:** As a user, I want configurable policies and comprehensive logging, so that I can customize behavior and troubleshoot issues.

#### Acceptance Criteria

1. WHEN the system starts THEN it SHALL load domain allowlist with read/write capabilities per domain
2. WHEN sensitive data is processed THEN it SHALL apply configurable redaction patterns
3. WHEN actions are performed THEN it SHALL log structured JSON to chrome.storage.local
4. WHEN the host runs THEN it SHALL write file logs with timestamps and request details
5. WHEN configuration changes THEN it SHALL persist domain policies and user preferences

### Requirement 8: Development and Build System

**User Story:** As a developer, I want streamlined development and build processes, so that I can efficiently develop and test the extension.

#### Acceptance Criteria

1. WHEN building the extension THEN it SHALL use Vite or esbuild for TypeScript compilation
2. WHEN running in development THEN it SHALL provide hot reload for extension components
3. WHEN starting the system THEN it SHALL run MCP server and extension builder concurrently
4. WHEN testing THEN it SHALL support loading as unpacked extension in Chrome
5. WHEN packaging THEN it SHALL generate production-ready extension bundle

### Requirement 9: Error Handling and Resilience

**User Story:** As a user, I want the system to handle errors gracefully and recover from failures, so that automation tasks remain reliable.

#### Acceptance Criteria

1. WHEN WebSocket connection fails THEN it SHALL automatically reconnect with exponential backoff
2. WHEN CDP attachment is lost THEN it SHALL re-attach transparently on next command
3. WHEN selectors fail THEN it SHALL provide detailed error messages and suggest alternatives
4. WHEN timeouts occur THEN it SHALL cancel operations and return appropriate error responses
5. WHEN the extension crashes THEN it SHALL preserve state and resume operations after restart

### Requirement 10: Acceptance Testing Framework

**User Story:** As a developer, I want comprehensive acceptance tests, so that I can verify all functionality works correctly.

#### Acceptance Criteria

1. WHEN testing basic navigation THEN it SHALL successfully open pages and read content
2. WHEN testing search workflows THEN it SHALL perform multi-step interactions without policy violations
3. WHEN testing form interactions THEN it SHALL properly gate sensitive actions and require approval
4. WHEN testing selector recovery THEN it SHALL adapt to failed selectors using DOM inspection
5. WHEN testing downloads THEN it SHALL successfully save files to configured directories
6. WHEN testing policy enforcement THEN it SHALL block unauthorized actions with clear error messages
7. WHEN testing resilience THEN it SHALL recover from tab closures and connection failures