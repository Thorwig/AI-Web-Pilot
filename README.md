# Browser Pilot MCP

Chrome extension and MCP server for AI-driven web automation.

## Project Structure

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

## Development Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Start development environment:

   ```bash
   bun run dev
   ```

   This runs both the MCP host server and Chrome extension in watch mode.

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist/extension` directory

## Build Commands

- `bun run build` - Build both host and extension for production
- `bun run build:host` - Build only the MCP server
- `bun run build:extension` - Build only the Chrome extension
- `bun run dev:host` - Build MCP server in watch mode
- `bun run dev:extension` - Build Chrome extension in watch mode

## Testing

- `bun test` - Run tests once
- `bun run test:watch` - Run tests in watch mode
- `bun run lint` - Run ESLint
- `bun run type-check` - Run TypeScript type checking

## Requirements

- Bun runtime
- Chrome/Chromium browser
- TypeScript 5+

## Next Steps

This is the basic project structure. The actual implementation of MCP tools, Chrome extension functionality, and WebSocket bridge will be added in subsequent tasks.
