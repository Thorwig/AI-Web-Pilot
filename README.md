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

## MCP Setup

### Prerequisites

- Bun runtime
- Chrome/Chromium browser
- TypeScript 5+
- An MCP-compatible AI assistant (like Claude Desktop, Kiro, or other MCP clients)

### Installation & Configuration

1. **Build the MCP Server**:
   ```bash
   bun run build:host
   ```

2. **Configure MCP Client**:
   
   Add the browser-pilot-mcp server to your MCP client configuration. The exact location depends on your client:

   **For Kiro IDE**:
   - Workspace config: `.kiro/settings/mcp.json`
   - User config: `~/.kiro/settings/mcp.json`

   **For Claude Desktop**:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

   **Example configuration**:
   ```json
   {
     "mcpServers": {
       "browser-pilot": {
         "command": "node",
         "args": ["./dist/host/index.js"],
         "cwd": "/path/to/browser-pilot-mcp",
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

3. **Install Chrome Extension**:
   ```bash
   bun run build:extension
   ```
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select `dist/extension/`

4. **Start Using**:
   - Restart your MCP client
   - The browser-pilot tools should now be available
   - Open a website in Chrome and start automating!

### Available MCP Tools

Once configured, you'll have access to web automation tools like:
- `navigate` - Navigate to URLs
- `click` - Click elements on pages
- `type` - Type text into form fields
- `screenshot` - Capture page screenshots
- `read_text` - Extract text content
- `wait_for` - Wait for elements to appear

### Troubleshooting

- **Server not connecting**: Check that the path in your MCP config points to the built `dist/host/index.js` file
- **Extension not working**: Ensure the Chrome extension is loaded and active
- **Permission errors**: Check that the extension has necessary permissions for the target websites

## Development

### Development Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Start development environment:
   ```bash
   bun run dev
   ```

3. Load extension in Chrome (see Installation steps above)
