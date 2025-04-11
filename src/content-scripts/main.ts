// src/content-scripts/main.ts
// Injected at document_idle (or later)

import { SettingsSchema } from '~/lib/schemas'; // Import Zod schema/type

const BODY_CLASS_DARK_ENABLED = 'eyelove-dark-mode-enabled'; // Specific class for dark mode being active
const isDev = process.env.NODE_ENV === 'development';

if (isDev) console.info('[EyeLove] Main Content Script Loaded.');

/**
 * Applies or removes the dark mode class based on the enabled state.
 * @param enabled - Whether the dark mode should be enabled.
 */
function updateBodyClass(enabled: boolean | undefined) {
  if (enabled) {
    document.body.classList.add(BODY_CLASS_DARK_ENABLED);
    if (isDev) console.info('[EyeLove CS] Added body class:', BODY_CLASS_DARK_ENABLED);
    // TODO: Later, trigger actual dark mode style application here
  } else {
    document.body.classList.remove(BODY_CLASS_DARK_ENABLED);
     if (isDev) console.info('[EyeLove CS] Removed body class:', BODY_CLASS_DARK_ENABLED);
    // TODO: Later, trigger removal/reset of dark mode styles here
  }

  // Cache the state in localStorage for faster FOUC handler access next time
  try {
      // We only store 'enabled' state here, FOUC handler can combine with prefers-color-scheme for 'auto'
      localStorage.setItem('eyelove-enabled-cache', enabled ? 'true' : 'false');
  } catch (e) {
      if (isDev) console.error('Error writing to localStorage cache:', e);
  }
}


// == Listeners ==

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  // Validate message structure (optional but good practice)
  if (message?.action === 'updateBodyClass' && typeof message.enabled === 'boolean') {
      if (isDev) console.info('[EyeLove CS] Received message:', message);
      updateBodyClass(message.enabled);
      // Optionally send response back to background
      // _sendResponse({ status: 'acknowledged' });
  } else {
      if (isDev) console.info('[EyeLove CS] Received unknown message:', message);
  }
  // Return false if not sending an async response
  return false;
});


// == Initial State Query ==

// Function to ask the background script for the initial state
function queryInitialState() {
   if (chrome.runtime?.id) {
        if (isDev) console.info('[EyeLove CS] Querying initial state from background...');
        chrome.runtime.sendMessage({ action: 'queryInitialState' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[EyeLove CS] Error querying initial state:', chrome.runtime.lastError.message);
                // Apply default based on FOUC handler's initial guess or failsafe
                const foucClassApplied = document.documentElement.classList.contains('eyelove-dark-theme-active');
                updateBodyClass(foucClassApplied); // Trust FOUC handler's initial application if query fails
                return;
            }
            // Validate response
            try {
                 const settings = SettingsSchema.partial().parse(response || {});
                 if (isDev) console.info('[EyeLove CS] Received initial state:', settings);
                 // Apply initial class based on received state
                 updateBodyClass(settings.enabled);
            } catch(validationError) {
                 console.error("[EyeLove CS] Invalid initial settings received:", validationError);
                 updateBodyClass(true); // Fallback to enabled
            }
        });
   } else {
       if (isDev) console.warn("[EyeLove CS] Not running as extension, cannot query initial state.");
       // Potentially read from localStorage cache directly as fallback
       try {
           const cachedEnabled = localStorage.getItem('eyelove-enabled-cache');
           updateBodyClass(cachedEnabled === 'true');
       } catch (e) {
           updateBodyClass(true); // Fallback
       }
   }
}

// Query the initial state when the script loads (document_idle)
// Use a small timeout to ensure background script is likely ready
// This is a workaround; a more robust solution involves retries or background checking script readiness.
setTimeout(queryInitialState, 100); // Wait 100ms before querying 