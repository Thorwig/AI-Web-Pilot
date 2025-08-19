import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/host/index.ts"),
      name: "ai-web-pilot-host",
      fileName: "index",
      formats: ["es"],
    },
    outDir: "dist/host",
    rollupOptions: {
      external: [
        "ws",
        "@modelcontextprotocol/sdk",
        "zod",
        "fs",
        "path",
        "crypto",
      ],
      output: {
        globals: {
          ws: "ws",
          "@modelcontextprotocol/sdk": "MCP",
          zod: "z",
        },
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