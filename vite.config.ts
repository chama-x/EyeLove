// vite.config.ts
/// <reference types="vite/client" />

// Imports for path handling in ESM
import { fileURLToPath } from 'node:url';
import path from 'node:path'; // Use node: prefix

import { defineConfig } from 'vite'; // Remove PluginOption if unused
import react from '@vitejs/plugin-react';
import webExtension from '@samrum/vite-plugin-web-extension';
import tailwindcss from '@tailwindcss/vite';
import { getManifest } from './src/manifest';

// ESM equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    webExtension({
      manifest: getManifest(),
    }),
  ],
  resolve: {
    alias: {
      // Use the calculated __dirname
      '~': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});