import React, { useState, useEffect } from 'react';
import { SettingsSchema, Settings } from '~/lib/schemas';

function Options() {
  const [settings, setSettings] = useState<Partial<Settings>>({
    enabled: true,
    theme: 'auto',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (chrome.storage?.sync) {
          const result = await chrome.storage.sync.get(['enabled', 'theme']);
          setSettings(SettingsSchema.partial().parse(result));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Save settings when changed
  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      if (chrome.storage?.sync) {
        await chrome.storage.sync.set(settings);
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle theme change
  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as Settings['theme'];
    setSettings((prev: Partial<Settings>) => ({ ...prev, theme: value }));
  };

  // Handle enable/disable toggle
  const handleEnabledChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev: Partial<Settings>) => ({ ...prev, enabled: event.target.checked }));
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading settings...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">EyeLove Extension Settings</h1>
      
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <label htmlFor="enabled" className="font-medium">
            Enable Extension
          </label>
          <input
            type="checkbox"
            id="enabled"
            checked={settings.enabled}
            onChange={handleEnabledChange}
            className="h-5 w-5"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="theme" className="block font-medium">
            Theme
          </label>
          <select
            id="theme"
            value={settings.theme}
            onChange={handleThemeChange}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto (System Preference)</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
          
          {saveStatus === 'success' && (
            <span className="text-green-600">Settings saved successfully!</span>
          )}
          
          {saveStatus === 'error' && (
            <span className="text-red-600">Error saving settings</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Options; 