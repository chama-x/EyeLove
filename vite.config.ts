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
      // Only list HTML files as additional inputs
      additionalInputs: {
        html: [
          'src/pages/popup/index.html',
          'src/pages/options/index.html',
        ]
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
      // Define output structure for assets
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});