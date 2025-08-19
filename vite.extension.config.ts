import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist/extension',
    rollupOptions: {
      input: {
        'service_worker': resolve(__dirname, 'src/extension/service_worker.ts'),
        'sidepanel/index': resolve(__dirname, 'src/extension/sidepanel/index.ts'),
        'content': resolve(__dirname, 'src/extension/content.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    target: 'es2022',
    minify: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  plugins: [
    {
      name: 'copy-extension-files',
      writeBundle() {
        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, 'src/extension/manifest.json'),
          resolve(__dirname, 'dist/extension/manifest.json')
        );
        
        // Create sidepanel directory and copy HTML
        const sidepanelDir = resolve(__dirname, 'dist/extension/sidepanel');
        if (!existsSync(sidepanelDir)) {
          mkdirSync(sidepanelDir, { recursive: true });
        }
        copyFileSync(
          resolve(__dirname, 'src/extension/sidepanel/index.html'),
          resolve(__dirname, 'dist/extension/sidepanel/index.html')
        );
      }
    }
  ]
});