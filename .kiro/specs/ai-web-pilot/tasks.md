# Implementation Plan

- [x] 1. Set up project structure and build system

  - Create directory structure for extension and host components
  - Configure TypeScript, Vite/esbuild, and package.json files
  - Set up development scripts for concurrent building and testing
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Implement core shared types and schemas

  - Create shared TypeScript interfaces for messages, tool calls, and responses
  - Implement Zod schemas for all MCP tool inputs and outputs
  - Define configuration types and validation schemas
  - _Requirements: 2.2, 7.1, 7.5_

- [x] 3. Create Chrome extension manifest and basic structure

  - Write Manifest V3 configuration with required permissions
  - Implement basic service worker with WebSocket connection stub
  - Create side panel HTML structure and basic TypeScript entry point
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Implement WebSocket bridge communication
- [x] 4.1 Create WebSocket server in MCP host

  - Write WebSocket server using 'ws' library on localhost:8777
  - Implement connection management with client tracking
  - Add message correlation system with UUID-based request/response matching
  - _Requirements: 1.5, 2.3_

- [x] 4.2 Implement WebSocket client in extension service worker

  - Create WebSocket client connection with automatic reconnection
  - Implement message handling and response correlation
  - Add connection status tracking and error recovery
  - _Requirements: 1.5, 9.1_

- [x] 5. Implement Chrome DevTools Protocol integration
- [x] 5.1 Create CDP session manager

  - Write CDP session management with chrome.debugger API
  - Implement automatic domain enabling (Page, DOM, Runtime, Input)
  - Add session lifecycle management and cleanup
  - _Requirements: 6.1, 6.2, 9.2_

- [x] 5.2 Implement core DOM interaction methods

  - Write click functionality using DOM.querySelector and Input.dispatchMouseEvent
  - Implement text input using element focusing and value setting
  - Create element waiting functionality with timeout handling
  - _Requirements: 6.3, 6.4, 3.3, 3.4, 3.7_

- [x] 5.3 Add DOM reading and JavaScript execution

  - Implement text extraction using Runtime.evaluate
  - Create DOM structure reading for debugging failed selectors
  - Add sandboxed JavaScript execution with returnByValue
  - _Requirements: 6.5, 3.5, 3.6, 3.8_

- [x] 6. Create MCP server with tool registration
- [x] 6.1 Implement core MCP server structure

  - Set up MCP server using @modelcontextprotocol/sdk/server
  - Create tool registration system with Zod validation
  - Implement stdio transport connection for AI model communication
  - _Requirements: 2.1, 2.2_

- [x] 6.2 Implement navigation and tab management tools

  - Create open_tab, navigate, get_url tools with WebSocket bridge calls
  - Implement tabs_list, tab_activate, go_back, go_forward, reload tools
  - Add proper error handling and response formatting
  - _Requirements: 3.1, 3.2, 3.10, 2.3_

- [x] 6.3 Implement DOM interaction tools

  - Create click, type_text, read_text, read_dom tools
  - Implement wait_for tool with configurable timeouts
  - Add eval_js tool with sandboxing considerations
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 6.4 Add screenshot and download capabilities

  - Implement screenshot tool using CDP Page.captureScreenshot
  - Create download_current tool with file management
  - Add file path handling and directory management
  - _Requirements: 3.9, 3.11_

- [x] 7. Implement policy engine and security controls
- [x] 7.1 Create domain policy system

  - Write domain allowlist checking with read/write permissions
  - Implement policy configuration loading and validation
  - Add policy decision logic for tool execution
  - _Requirements: 4.1, 7.1, 7.5_

- [x] 7.2 Implement sensitive data detection and redaction

  - Create pattern matching for sensitive fields (password, card, etc.)
  - Implement logging redaction for sensitive values
  - Add sensitive action detection for approval gates
  - _Requirements: 4.2, 4.6, 7.2, 7.4_

- [x] 7.3 Add step budget and rate limiting

  - Implement step counting and budget enforcement
  - Create rate limiting for tool calls and domain access
  - Add timeout handling and task cancellation
  - _Requirements: 4.3, 4.4, 4.5_

- [x] 8. Create side panel user interface
- [x] 8.1 Implement basic side panel structure

  - Create HTML layout with connection status, action queue, and logs
  - Write TypeScript for UI state management and event handling
  - Add CSS styling for clean, functional interface
  - _Requirements: 5.1, 5.4_

- [x] 8.2 Add approval workflow interface

  - Implement pending action display with tool details
  - Create approval buttons (Approve Once, Deny, Always Allow)
  - Add approval decision communication back to MCP server
  - _Requirements: 5.2, 5.3_

- [x] 8.3 Implement selector picker functionality

  - Create content script for element highlighting on hover
  - Implement robust CSS selector generation algorithm
  - Add selector copying to clipboard and side panel display
  - _Requirements: 5.5_

- [x] 8.4 Add domain policy management interface

  - Create UI for viewing and editing domain policies
  - Implement policy persistence using chrome.storage.sync
  - Add policy import/export functionality
  - _Requirements: 5.6, 7.5_

- [ ] 9. Implement comprehensive error handling
- [ ] 9.1 Add WebSocket connection error recovery

  - Implement exponential backoff reconnection strategy
  - Create connection status monitoring and user notification
  - Add message queuing for offline scenarios
  - _Requirements: 9.1_

- [ ] 9.2 Implement CDP session error handling

  - Add automatic session recreation on CDP failures
  - Implement tab closure detection and cleanup
  - Create graceful degradation for CDP unavailability
  - _Requirements: 9.2_

- [ ] 9.3 Add tool execution error handling

  - Implement selector failure recovery with DOM inspection
  - Create timeout handling with user-friendly error messages
  - Add retry logic for transient failures
  - _Requirements: 9.3, 9.4, 9.5_

- [ ] 10. Implement logging and monitoring system
- [ ] 10.1 Create structured logging for MCP server

  - Implement JSON logging with configurable levels
  - Add file-based log persistence with rotation
  - Create request/response logging with sensitive data redaction
  - _Requirements: 7.3, 7.4_

- [ ] 10.2 Add extension logging system

  - Implement chrome.storage.local logging for extension events
  - Create log viewing interface in side panel
  - Add log export functionality for debugging
  - _Requirements: 7.3, 5.4_

- [ ] 11. Create configuration management system
- [ ] 11.1 Implement host configuration

  - Create config.ts with domain allowlist and security settings
  - Add configuration validation and loading
  - Implement runtime configuration updates
  - _Requirements: 7.1, 7.2, 7.5_

- [ ] 11.2 Add extension configuration persistence

  - Implement chrome.storage.sync for cross-device policy sync
  - Create chrome.storage.local for session-specific data
  - Add configuration backup and restore functionality
  - _Requirements: 5.6, 7.5_

- [ ] 12. Implement development and build scripts
- [ ] 12.1 Create development workflow scripts

  - Write dev.sh script for concurrent host and extension development
  - Implement hot reload for extension during development
  - Add Chrome profile management for testing
  - _Requirements: 8.2, 8.3, 8.4_

- [ ] 12.2 Add production build system

  - Create production build configuration with optimization
  - Implement extension packaging for distribution
  - Add build validation and testing integration
  - _Requirements: 8.5_

- [ ] 13. Write comprehensive test suite
- [ ] 13.1 Create unit tests for core components

  - Write tests for MCP tool validation and execution
  - Implement tests for policy engine and security controls
  - Add tests for WebSocket bridge communication
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [ ] 13.2 Implement integration tests

  - Create end-to-end test scenarios for all acceptance criteria
  - Write tests for error recovery and resilience
  - Add performance and load testing for concurrent operations
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [ ] 14. Create documentation and examples
- [ ] 14.1 Write setup and configuration documentation

  - Create README with installation and setup instructions
  - Document permission requirements and security rationale
  - Add troubleshooting guide for common issues
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 14.2 Add usage examples and API documentation
  - Create JSON examples of all tool calls and responses
  - Write AI model integration guide with system prompts
  - Add example automation scenarios and best practices
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_
