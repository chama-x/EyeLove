import { SettingsSchema, Settings, parseMessage } from '~/lib/schemas.ts'; // Import Zod schemas/types

console.info('EyeLove Background Service Worker Initialized');

// Function to get current settings safely
async function getSettings(): Promise<Partial<Settings>> {
  try {
    const settings = await chrome.storage.sync.get(['enabled', 'theme']);
    // Validate settings retrieved from storage
    return SettingsSchema.partial().parse(settings || {});
  } catch (error) {
    console.error('Error retrieving or validating settings:', error);
    return { enabled: true, theme: 'auto' }; // Return default on error
  }
}

// Function to send message to active tab's content script
async function sendMessageToActiveTab(message: { action: string; payload?: Record<string, unknown> }) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
        console.info(`Background sending message to tab ${tabs[0].id}:`, message);
        console.log(`[EyeLove BG] sendMessageToActiveTab: Attempting to send message to tab ${tabs[0].id}:`, message);
        // Important: Check if the tab is ready before sending complex messages
        // For simple toggles, it might be okay, but consider tab status for heavier actions.
        await chrome.tabs.sendMessage(tabs[0].id, message);
        console.log(`[EyeLove BG] sendMessageToActiveTab: Message sent successfully to tab ${tabs[0].id}`);
    } catch (error) {
        // Often happens if the content script isn't injected or ready on that specific page (e.g., chrome:// pages)
        console.warn(`Could not send message to active tab ${tabs[0].id}:`, error instanceof Error ? error.message : error);
    }
  } else {
      console.warn("Could not find active tab to send message.");
  }
}

// == Listeners ==

// On Install/Update: Set initial settings
chrome.runtime.onInstalled.addListener(async (details) => {
  console.info('Extension installed or updated:', details.reason);
  if (details.reason === 'install') {
    const defaultSettings = SettingsSchema.parse({}); // Get defaults from schema
    await chrome.storage.sync.set(defaultSettings);
    console.info('Default settings saved:', defaultSettings);
  }
  // On update, could perform migrations if needed
});

// On Message: Handle communication from popup, content scripts etc.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[EyeLove BG] Raw message received:', message);
  const parsedMessage = parseMessage(message); // Validate message format

  if (!parsedMessage) {
    console.warn("Received invalid message format:", message);
    return false; // Ignore invalid messages
  }

  console.info('Background received validated message:', parsedMessage, 'from:', sender.tab ? `tab ${sender.tab.id}` : 'extension context');

  // Handle 'getSettings' action
  if (parsedMessage.action === 'getSettings') {
    getSettings().then(settings => {
      console.info('Background sending settings:', settings);
      sendResponse(settings);
    }).catch(error => {
      console.error("Error handling getSettings:", error);
      sendResponse(null); // Indicate error or send empty response
    });
    return true; // Indicates response will be sent asynchronously
  }

  // Handle 'toggleEnabled' action
  if (parsedMessage.action === 'toggleEnabled') {
     (async () => {
        try {
            const currentSettings = await getSettings();
            const newState = !(currentSettings.enabled ?? true); // Toggle current state or default to enabling if undefined
            await chrome.storage.sync.set({ enabled: newState });
            console.info(`Background toggled 'enabled' state to: ${newState}`);
            console.log(`[EyeLove BG] toggleEnabled: State changed to ${newState}. Attempting to send 'updateBodyClass' to active tab.`);
            // Broadcast change to active tab immediately (storage listener will also fire)
            await sendMessageToActiveTab({ action: 'updateBodyClass', payload: { enabled: newState } });
            sendResponse({ success: true, newState }); // Acknowledge toggle
        } catch (error) {
             console.error("Error handling toggleEnabled:", error);
             sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
     })();
     return true; // Indicates response will be sent asynchronously
  }

  // Handle 'queryInitialState' from content script
  if (parsedMessage.action === 'queryInitialState') {
      (async () => {
          const settings = await getSettings();
          console.info('Background responding to queryInitialState with:', settings);
          sendResponse(settings);
      })();
      return true; // Async response
  }

  // Add handlers for other actions ('setTheme' etc.) later

  return false; // Indicate no async response for unhandled actions
});


// On Storage Change: Broadcast changes to content scripts (optional, but good for sync)
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'sync') {
        console.info('Background detected storage change:', changes);
        const settings = await getSettings(); // Get the complete current state
        // Only broadcast if relevant settings changed
        if (changes.enabled !== undefined || changes.theme !== undefined) {
             await sendMessageToActiveTab({ action: 'updateBodyClass', payload: { enabled: settings.enabled } });
             // Later, add theme update logic here too
        }
    }
});

// Optional: Keep service worker alive briefly using connections (use carefully)
// chrome.runtime.onConnect.addListener(port => {
//   console.info('Connection opened:', port.name);
//   port.onDisconnect.addListener(() => {
//     console.info('Connection closed:', port.name);
//   });
// }); 