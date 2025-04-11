// src/manifest.ts
import { defineManifest } from '@samrum/vite-plugin-web-extension/manifest';
import pkg from '../package.json'; // Import package.json for version

// Function to generate the Manifest V3 object
export function getManifest(): chrome.runtime.ManifestV3 {
  return defineManifest({
    manifest_version: 3,
    name: pkg.name || 'EyeLove', // Use name from package.json
    version: pkg.version,
    description: pkg.description || 'Advanced Dark Mode & Digital Eye Care',
    // Define default locale if planning localization later
    // default_locale: 'en',
    icons: {
      // Add paths to icons later (e.g., 16, 32, 48, 128 px)
      // '16': 'src/assets/icon16.png',
      // '48': 'src/assets/icon48.png',
      // '128': 'src/assets/icon128.png',
    },
    // Background Service Worker
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module', // Use ES module type
    },
    // Action (Popup)
    action: {
      default_popup: 'src/pages/popup/index.html',
      default_title: 'EyeLove Settings',
      // Add default icon later
      // default_icon: {
      //   '16': 'src/assets/icon16.png',
      //   '32': 'src/assets/icon32.png',
      // }
    },
    // Options Page
    options_page: 'src/pages/options/index.html',
    // Content Scripts (Placeholders for FOUC Prevention)
    content_scripts: [
      {
        js: ['src/content-scripts/fouc-handler.ts'],
        css: ['src/styles/fouc-prevention.css'],
        matches: ['<all_urls>'], // Broad match needed for global styling
        run_at: 'document_start', // Crucial for FOUC prevention
        all_frames: false, // Don't inject FOUC prevention into iframes by default
      },
      // Add main content script entry later, likely at document_idle
      // {
      //   js: ['src/content-scripts/main.ts'],
      //   matches: ['<all_urls>'],
      //   run_at: 'document_idle', // Default
      //   all_frames: true, // Decide if main logic needs to run in iframes
      // }
    ],
    // Permissions (Start minimal, add as needed)
    permissions: [
      'storage', // For user settings
      'activeTab', // Often useful, less intrusive than host permissions initially
      'scripting', // Needed for executeScript, insertCSS etc.
      'alarms',    // Needed for break reminders
      // 'notifications', // Add if using chrome.notifications
      // 'offscreen',    // Add when implementing OS theme detection
    ],
    // Host Permissions (Keep minimal, justify broad permissions later)
    // host_permissions: [
    //   '<all_urls>' // Add ONLY when core styling functionality requires it
    // ],
    // Web Accessible Resources (Configure carefully later)
    // web_accessible_resources: [
    //   {
    //     resources: ['src/assets/*.png', 'src/pages/options/index.html'],
    //     matches: ['<all_urls>'], // Restrict matches if possible
    //     // use_dynamic_url: true // Recommended by some plugins
    //   },
    // ],
    // Content Security Policy (Define later if needed)
    // content_security_policy: {
    //   extension_pages: "script-src 'self'; object-src 'self';",
    //   // sandbox: ...
    // },
    // Optional: Define commands, minimum Chrome version etc.
    // commands: {
    //   _execute_action: {
    //     suggested_key: {
    //       default: 'Ctrl+Shift+E',
    //       mac: 'Command+Shift+E',
    //     },
    //   },
    // },
    // minimum_chrome_version: '100', // Set based on API usage
  });
}