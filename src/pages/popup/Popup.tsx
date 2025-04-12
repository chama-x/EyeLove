import { useState, useEffect, useCallback } from 'react';
import { SettingsSchema, Settings } from '~/lib/schemas.ts'; // Import Zod schema/type

const POPUP_STATE_CLASS = 'eyelove-popup-state'; // Class to potentially signal state to content script (optional)

function Popup() {
  const [settings, setSettings] = useState<Partial<Settings>>({ enabled: true }); // Store settings object
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch settings
  const fetchSettings = useCallback(() => {
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError) {
          console.error('Error fetching settings:', chrome.runtime.lastError.message);
          setError('Could not load settings.');
          setSettings({ enabled: true }); // Fallback
          return;
        }
        // Validate response (optional but good practice)
        try {
            const parsedSettings = SettingsSchema.partial().parse(response || {});
            setSettings(parsedSettings);
        } catch (validationError) {
             console.error("Invalid settings received:", validationError);
             setError('Invalid settings format.');
             setSettings({ enabled: true }); // Fallback
        }
      });
    } else {
       console.warn('Not running as an extension. Setting default state.');
       setSettings({ enabled: true });
       setIsLoading(false);
    }
  }, []);

  // Fetch initial state and listen for changes
  useEffect(() => {
    fetchSettings(); // Fetch on mount

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'sync' && (changes.enabled || changes.theme)) {
        console.info('Popup detected settings change in chrome.storage.sync, refetching...');
        fetchSettings(); // Refetch settings if relevant ones change
      }
    };

    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    // Add/remove body class when popup opens/closes (optional visual cue)
    document.body.classList.add(POPUP_STATE_CLASS);

    return () => {
      // Cleanup listener and body class
      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
      document.body.classList.remove(POPUP_STATE_CLASS);
    };
  }, [fetchSettings]);

  const handleToggle = () => {
    // Optimistically update UI? Or wait for storage change? Let's wait.
    // Send message to background to toggle the enabled state
    if (chrome.runtime?.id) {
      console.log('[EyeLove Popup] handleToggle: Sending message:', { action: 'toggleEnabled' });
      console.info("Popup sending 'toggleEnabled' message...");
      chrome.runtime.sendMessage({ action: 'toggleEnabled' }, (response) => {
         if (chrome.runtime.lastError) {
           console.error('[EyeLove Popup] handleToggle: Error sending message:', chrome.runtime.lastError.message);
           setError('Failed to toggle.');
         } else {
           console.log('[EyeLove Popup] handleToggle: Message sent successfully, response:', response);
           // Clear error on success
           setError(null);
           console.info("Toggle message acknowledged by background.", response);
           // State will update via the storage listener
         }
      });
    }
  };

  if (isLoading) {
     return <div className="p-4 w-64 text-center">Loading...</div>;
  }

  if (error) {
      return <div className="p-4 w-64 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="p-4 w-64 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      <h1 className="text-lg font-bold mb-4">EyeLove</h1>
      <div className="flex items-center justify-between">
        <span>Extension Enabled</span>
        <button
          onClick={handleToggle}
          className={`px-3 py-1 rounded ${
            settings.enabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-500 hover:bg-gray-600'
          } text-white transition-colors duration-150 font-medium`}
          aria-pressed={settings.enabled}
        >
          {settings.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {/* Display current theme (example) */}
      <p className="text-xs mt-2">Current theme setting: {settings.theme ?? 'N/A'}</p>
      {/* Add more controls later */}
    </div>
  );
}

export default Popup; 