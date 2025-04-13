// vite.config.ts
/// <reference types="vite/client" />

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from '@samrum/vite-plugin-web-extension';
import tailwindcss from '@tailwindcss/vite';
import { getManifest } from './src/manifest'; // Ensure this import is correct

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// [https://vitejs.dev/config/](https://vitejs.dev/config/)
export default defineConfig({
  // Prevent Vite from copying the public dir (and potentially src) into dist
  publicDir: false,

  plugins: [
    react(),
    tailwindcss(),
    webExtension({
      // Use the function to get the manifest object
      manifest: getManifest(),
      // Explicitly list HTML source files for the build process
      additionalInputs: {
        html: [
          'src/pages/popup/index.html',
          'src/pages/options/index.html',
        ]
        // No 'scripts' or 'styles' needed here if plugin handles manifest entries
      },
      // Recommended setting for Manifest V3 WAR handling
      useDynamicUrlWebAccessibleResources: true,
      // Optional: Keep validation enabled
      // disableManifestValidation: false,
    }),
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  // Configure build output paths explicitly
  build: {
    outDir: 'dist',
    emptyOutDir: true, // Clean dist folder before build
    rollupOptions: {
      // Explicitly define HTML inputs for Vite/Rollup build
      input: {
        popup: path.resolve(__dirname, 'src/pages/popup/index.html'),
        options: path.resolve(__dirname, 'src/pages/options/index.html'),
        // Note: Background/Content scripts are usually handled by the webExtension plugin
        // and don't need to be listed here unless issues arise.
      },
      // Keep the output configuration from before (optional, but good for structure)
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});