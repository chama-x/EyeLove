// src/content-scripts/fouc-handler.ts
// Injected at document_start for Flash of Unstyled Content prevention
// This is a minimal script that runs very early in page load

(() => {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) console.info('[EyeLove] FOUC Prevention Handler Started');

  // Try to read the cached setting from localStorage first for speed
  let initialEnabledState = true; // Default to enabled if not found
  
  try {
    const cachedEnabled = localStorage.getItem('eyelove-enabled-cache');
    if (cachedEnabled !== null) {
      initialEnabledState = cachedEnabled === 'true';
      if (isDev) console.info('[EyeLove FOUC] Using cached enabled state:', initialEnabledState);
    } else {
      if (isDev) console.info('[EyeLove FOUC] No cached state found, using default enabled');
    }
  } catch (e) {
    if (isDev) console.warn('[EyeLove FOUC] Error accessing localStorage:', e);
  }

  // Apply initial class based on cached state - this happens very early
  if (initialEnabledState) {
    // Add a class to document root that can be targeted in the CSS
    document.documentElement.classList.add('eyelove-dark-theme-active');
    if (isDev) console.info('[EyeLove FOUC] Added initial dark theme class to documentElement');
  }

  // Additional preload checks could go here (media query for system preference, etc.)
  // But keep it minimal as this runs at document_start

})(); 