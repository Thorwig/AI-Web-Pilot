# Technology Stack

## Build System
- **Vite**: Primary build tool with separate configs for host and extension
- **TypeScript 5+**: Strict type checking with ES2022 target
- **ESLint**: Code linting with TypeScript rules
- **Vitest**: Testing framework with watch mode support

## Core Dependencies
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **ws**: WebSocket server for real-time communication
- **zod**: Runtime type validation and schema definitions
- **@types/chrome**: Chrome extension API types

## Architecture
- **Dual Build System**: Separate Vite configs for Node.js host and Chrome extension
- **ES Modules**: Modern module system throughout
- **Path Aliases**: `@/` alias points to `src/` directory
- **External Dependencies**: Host build externalizes Node.js modules

## Common Commands

### Development
```bash
bun run dev              # Start both host and extension in watch mode
bun run dev:host         # Build MCP server in watch mode
bun run dev:extension    # Build Chrome extension in watch mode
```

### Building
```bash
bun run build            # Build both components for production
bun run build:host       # Build only MCP server
bun run build:extension  # Build only Chrome extension
```

### Testing & Quality
```bash
bun test                 # Run tests once
bun run test:watch       # Run tests in watch mode
bun run lint             # Run ESLint
bun run type-check       # TypeScript type checking
```

### Chrome Extension Loading
1. Build extension: `bun run build:extension`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select `dist/extension/`

## Requirements
- Bun runtime
- Chrome/Chromium browser
- TypeScript 5+