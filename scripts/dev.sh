#!/bin/bash

# AI Web Pilot Development Script
# Runs MCP host and extension builder concurrently

set -e

echo "🚀 Starting AI Web Pilot development environment..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create dist directories if they don't exist
mkdir -p dist/host
mkdir -p dist/extension

# Copy static files for extension
echo "📋 Copying extension static files..."
cp src/extension/manifest.json dist/extension/
cp -r src/extension/sidepanel/index.html dist/extension/sidepanel/ 2>/dev/null || mkdir -p dist/extension/sidepanel && cp src/extension/sidepanel/index.html dist/extension/sidepanel/

# Create placeholder icons
mkdir -p dist/extension/icons
echo "Creating placeholder icons..."
# Create simple placeholder icon files (these would be replaced with actual icons)
touch dist/extension/icons/icon16.png
touch dist/extension/icons/icon48.png
touch dist/extension/icons/icon128.png

echo "🔧 Starting concurrent build processes..."
echo "   - MCP Host server (watch mode)"
echo "   - Chrome extension (watch mode)"
echo ""
echo "Press Ctrl+C to stop all processes"
echo ""

# Run both build processes concurrently
npm run dev:host &
HOST_PID=$!

npm run dev:extension &
EXTENSION_PID=$!

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Stopping development processes..."
    kill $HOST_PID 2>/dev/null || true
    kill $EXTENSION_PID 2>/dev/null || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait $HOST_PID $EXTENSION_PID