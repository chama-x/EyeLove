// src/manifest.ts
import pkg from '../package.json';

// Define the Manifest V3 object type explicitly for clarity
type ManifestV3 = chrome.runtime.ManifestV3;

// Function to generate the Manifest V3 object
export function getManifest(): ManifestV3 {
  // Just return the plain manifest object
  // Type checking will happen against the ManifestV3 type
  return {
    manifest_version: 3,
    name: pkg.name || 'EyeLove',
    version: pkg.version,
    description: pkg.description || 'Advanced Dark Mode & Digital Eye Care', // Ensure description is in package.json
    icons: {
      // '16': 'src/assets/icon16.png',
      // '48': 'src/assets/icon48.png',
      // '128': 'src/assets/icon128.png',
    },
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module',
    },
    action: {
      default_popup: 'src/pages/popup/index.html',
      default_title: 'EyeLove Settings',
      // default_icon: { /* ... */ }
    },
    options_page: 'src/pages/options/index.html',
    content_scripts: [
      {
        js: ['src/content-scripts/fouc-handler.ts'],
        css: ['src/styles/fouc-prevention.css'],
        matches: ['<all_urls>'],
        run_at: 'document_start',
        all_frames: false,
      },
      {
        js: ['src/content-scripts/main.ts'],
        matches: ['<all_urls>'],
        run_at: 'document_idle',
        all_frames: true,
      }
    ],
    permissions: [
      'storage',
      'scripting',
      'alarms',
      'activeTab',
      // 'notifications',
      // 'offscreen',
    ],
    host_permissions: [
      '<all_urls>'
    ],
    // web_accessible_resources: [ /* ... */ ],
    // content_security_policy: { /* ... */ },
    // commands: { /* ... */ },
    // minimum_chrome_version: '100', // Example
  };
}