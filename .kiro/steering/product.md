# AI Web Pilot

Chrome extension and MCP server for AI-driven web automation.

## Core Purpose
Enables AI assistants to interact with web pages through a secure bridge between an MCP (Model Context Protocol) server and a Chrome extension. The system provides web automation capabilities while maintaining security through domain policies and user approval workflows.

## Key Components
- **MCP Server**: Node.js host that implements MCP protocol for AI communication
- **Chrome Extension**: Browser extension with service worker, content scripts, and side panel UI
- **WebSocket Bridge**: Real-time communication between MCP server and extension
- **Security Layer**: Domain allowlists, sensitive data detection, and approval workflows

## Target Use Cases
- AI-assisted web browsing and data extraction
- Automated form filling and web interactions
- Screenshot capture and page analysis
- Safe web automation with user oversight