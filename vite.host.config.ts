import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: "dist/host",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/host/index.ts"),
        bridge: resolve(__dirname, "src/host/bridge.ts"),
        "mcp-tools": resolve(__dirname, "src/host/mcp-tools.ts"),
        "policy-engine": resolve(__dirname, "src/host/policy-engine.ts"),
        config: resolve(__dirname, "src/host/config.ts"),
        "data-redaction": resolve(__dirname, "src/host/data-redaction.ts"),
        "rate-limiter": resolve(__dirname, "src/host/rate-limiter.ts"),
        "custom-stdio-transport": resolve(
          __dirname,
          "src/host/custom-stdio-transport.ts"
        ),
      },
      external: [
        "ws",
        "@modelcontextprotocol/sdk",
        "zod",
        "fs",
        "fs/promises",
        "path",
        "crypto",
        "stream",
      ],
      output: {
        format: "es",
        entryFileNames: "[name].js",
      },
    },
    target: "node18",
    minify: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});