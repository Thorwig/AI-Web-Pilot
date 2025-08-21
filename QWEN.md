# AI Web Pilot - Project Context for Qwen

This document provides essential context about the "AI Web Pilot" project for use in future interactions. It outlines the project's purpose, structure, technologies, and development workflows.

## Project Overview

AI Web Pilot is a Chrome extension and Model Context Protocol (MCP) server designed for AI-driven web automation. The project enables AI models to interact with web pages through a secure bridge, performing actions like navigation, DOM manipulation, and data extraction, all governed by configurable security policies.

The system consists of two main components:
1.  **MCP Server (Node.js):** Handles communication with AI models (like Claude Code) using the MCP protocol. It exposes tools for web automation and enforces security policies.
2.  **Chrome Extension:** Provides the browser-level capabilities (tabs, scripting, CDP access) needed to execute automation commands. It communicates with the MCP server via a WebSocket bridge.

## Project Structure

```
ai-web-pilot/
├── src/
│   ├── host/                 # MCP Server (Node.js)
│   │   └── index.ts         # Server entry point
│   ├── extension/           # Chrome Extension
│   │   ├── service_worker.ts # Background service worker
│   │   ├── content.ts       # Content script
│   │   ├── sidepanel/       # Side panel UI
│   │   │   ├── index.html   # Side panel HTML
│   │   │   └── index.ts     # Side panel TypeScript
│   │   └── manifest.json    # Extension manifest
│   └── shared/              # Shared types and utilities
│       └── types.ts         # Common TypeScript interfaces
├── scripts/
│   └── dev.sh              # Development script
├── dist/                   # Build output
│   ├── host/               # Built MCP server
│   └── extension/          # Built Chrome extension
└── package.json
```

## Technologies

*   **Runtime:** Bun
*   **Language:** TypeScript
*   **Build Tool:** Vite
*   **Testing:** Vitest
*   **Linting:** ESLint
*   **MCP SDK:** `@modelcontextprotocol/sdk`
*   **WebSocket Library:** `ws`
*   **Validation:** `zod`
*   **Chrome Types:** `@types/chrome`
*   **Node Types:** `@types/node`

## Key Components

### 1. MCP Server (`src/host/`)

*   **Entry Point:** `index.ts` - Initializes the MCP server, loads configuration, sets up the policy engine, tool registry, and WebSocket bridge.
*   **Bridge:** `bridge.ts` - Manages the WebSocket connection with the Chrome extension, routing commands and responses.
*   **Tool Registry:** `mcp-tools.ts` - Defines and handles the available MCP tools for web automation.
*   **Policy Engine:** `policy-engine.ts` - Enforces domain-based policies (read/write permissions, approval requirements) for tool execution.
*   **Configuration Manager:** `config.ts` - Loads and manages the `config.json` file.

### 2. Chrome Extension (`src/extension/`)

*   **Service Worker:** `service_worker.ts` - The core background script that:
    *   Manages the WebSocket connection to the MCP server.
    *   Handles incoming commands from the server.
    *   Executes browser actions (navigation, DOM manipulation, CDP commands).
    *   Manages communication with the side panel and content scripts.
*   **Content Script:** `content.ts` - Injected into web pages; currently implements a selector picker tool to help identify DOM elements.
*   **Side Panel:** `sidepanel/` - Provides a UI for monitoring activity, managing pending approvals, configuring domain policies, and using tools like the selector picker.
*   **Manifest:** `manifest.json` - Defines extension metadata, permissions, and entry points.

### 3. Shared Components (`src/shared/`)

*   **Types:** `types.ts` - Defines common TypeScript interfaces and Zod schemas used for communication between components and for data validation.

### 4. Configuration (`config.json`)

Central configuration file defining:
*   Domain allowlist with read/write permissions and approval requirements.
*   Sensitive data patterns for redaction.
*   Step budgets and timeouts.
*   File/directory paths for screenshots/downloads.
*   Logging settings.

## Development Workflow

1.  **Setup:**
    *   Install dependencies: `bun install`
2.  **Development:**
    *   Start development environment: `bun run dev`
    *   This runs both the MCP server and Chrome extension in watch mode concurrently using `scripts/dev.sh`.
3.  **Loading Extension:**
    *   Open Chrome and navigate to `chrome://extensions/`.
    *   Enable "Developer mode".
    *   Click "Load unpacked" and select the `dist/extension` directory.
4.  **Building:**
    *   Build for production: `bun run build`
    *   Build only server: `bun run build:host`
    *   Build only extension: `bun run build:extension`
5.  **Testing & Quality:**
    *   Run tests: `bun test`
    *   Watch tests: `bun run test:watch`
    *   Lint: `bun run lint`
    *   Type check: `bun run type-check`

## Communication Flow

1.  **AI Model (e.g., Claude Code) <-> MCP Server:** Communicates via stdio using the MCP protocol. The server lists available tools and executes them based on model requests.
2.  **MCP Server <-> Chrome Extension:** Communicates via a WebSocket connection on port 8777. The server sends commands to the extension's service worker, which executes them and returns results.
3.  **Chrome Extension Service Worker <-> Content Scripts/Side Panel:** Communicates using Chrome's `chrome.runtime.sendMessage` API for UI updates, selector picking, and action approvals.
4.  **Chrome Extension <-> Browser:** Uses Chrome Extension APIs (`chrome.tabs`, `chrome.scripting`) and the Chrome DevTools Protocol (CDP) for direct browser automation.

## Security Model

Security is handled through a policy engine that evaluates domain-based rules:
*   Domains can be configured with read/write permissions.
*   Domains can require explicit user approval for certain actions (e.g., financial sites).
*   Sensitive data is redacted from logs and responses based on configurable patterns.
*   Rate limiting (step budgets) can be applied per domain.