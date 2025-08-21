import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, cpSync } from "fs";

export default defineConfig({
  build: {
    outDir: "dist/extension",
    rollupOptions: {
      input: {
        service_worker: resolve(__dirname, "src/extension/service_worker.ts"),
        "sidepanel/index": resolve(
          __dirname,
          "src/extension/sidepanel/index.ts"
        ),
        content: resolve(__dirname, "src/extension/content.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
        format: "es",
      },
    },
    target: "es2022",
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [
    {
      name: "copy-extension-files",
      writeBundle() {
        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, "src/extension/manifest.json"),
          resolve(__dirname, "dist/extension/manifest.json")
        );

        // Create sidepanel directory and copy HTML
        const sidepanelDir = resolve(__dirname, "dist/extension/sidepanel");
        if (!existsSync(sidepanelDir)) {
          mkdirSync(sidepanelDir, { recursive: true });
        }
        copyFileSync(
          resolve(__dirname, "src/extension/sidepanel/index.html"),
          resolve(__dirname, "dist/extension/sidepanel/index.html")
        );

        // Copy icons directory
        const iconsDir = resolve(__dirname, "dist/extension/icons");
        if (!existsSync(iconsDir)) {
          mkdirSync(iconsDir, { recursive: true });
        }
        cpSync(resolve(__dirname, "src/extension/icons"), iconsDir, {
          recursive: true,
        });
      },
    },
  ],
});