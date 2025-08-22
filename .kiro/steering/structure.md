# Project Structure

## Directory Organization

```
browser-pilot-mcp/
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

## Code Organization Patterns

### Shared Types (`src/shared/`)
- All TypeScript interfaces and Zod schemas
- Communication protocols between host and extension
- Configuration and validation types
- Constants and enums

### MCP Host (`src/host/`)
- Node.js server implementing MCP protocol
- WebSocket server for extension communication
- Tool handlers and business logic
- External dependencies allowed (ws, @modelcontextprotocol/sdk, etc.)

### Chrome Extension (`src/extension/`)
- **Service Worker**: Background script, WebSocket client, tab management
- **Content Script**: DOM interaction, page manipulation
- **Side Panel**: User interface, status display, manual controls
- **Manifest**: Extension configuration and permissions

## File Naming Conventions
- Use kebab-case for directories and files
- TypeScript files use `.ts` extension
- Test files use `.test.ts` suffix
- Configuration files in root directory

## Import Patterns
- Use `@/` alias for imports from `src/`
- Shared types imported from `@/shared/types`
- External dependencies imported normally
- Chrome APIs available globally in extension context

## Build Output Structure
- `dist/host/`: Contains built MCP server as ES module
- `dist/extension/`: Contains Chrome extension files ready for loading
- Manifest and HTML files copied during build process