// src/content-scripts/main.ts
// Injected at document_idle (or later)

import { SettingsSchema, parseMessage } from '~/lib/schemas.ts';

const BODY_CLASS_DARK_ENABLED = 'eyelove-dark-mode-enabled';
const isDev = process.env.NODE_ENV === 'development';

// Initial list of common CSS variable names to check
const TARGET_CSS_VARIABLES: string[] = [
  // Backgrounds
  '--bg-color', '--background-color', '--background', '--body-bg', '--body-background',
  '--surface-color', '--surface', '--color-background', '--page-bg',
  // Text
  '--text-color', '--color-text', '--text', '--body-color', '--foreground-color',
  '--color-foreground', '--fg-color', '--primary-text-color',
  // Borders
  '--border-color', '--color-border',
  // Links
  '--link-color', '--anchor-color', '--color-link',
  // Primary / Accent
  '--primary-color', '--primary', '--accent-color', '--accent', '--color-primary',
  // Secondary
  '--secondary-color', '--secondary', '--color-secondary',
  // Common Framework Vars (Examples)
  '--bs-body-bg', '--bs-body-color', '--bs-border-color',
  '--md-sys-color-surface', '--md-sys-color-on-surface',
];

// == Types ==
interface HSLColor {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

// == Color Utility Functions ==

/** Parses hex color (#rgb or #rrggbb) to RGB */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/** Converts RGB color values to HSL */
function rgbToHsl(r: number, g: number, b: number): HSLColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s, l: l };
}

/** Parses common CSS color strings (hex, rgb) into an HSL object */
function parseColorString(colorStr: string): HSLColor | null {
  colorStr = colorStr.trim().toLowerCase();
  // Try hex
  const hexRgb = hexToRgb(colorStr);
  if (hexRgb) {
    return rgbToHsl(hexRgb.r, hexRgb.g, hexRgb.b);
  }
  // Try rgb/rgba
  const rgbMatch = colorStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return rgbToHsl(r, g, b);
    }
  }
  // TODO: Add hsl/hsla parsing if needed
  return null; // Could not parse or unsupported format
}

/** Transforms an HSL color for dark mode */
function transformHslForDarkMode(hsl: HSLColor): HSLColor {
  const { h, s, l } = hsl;
  let newL = l;
  let newS = s;

  // Invert lightness significantly (adjust threshold and range as needed)
  // This pushes light colors towards dark, and dark towards light
  // We aim for dark backgrounds (low L) and light text (high L)
  const lightnessThreshold = 0.5; // Cutoff point
  const targetDarkMaxL = 0.25; // Max lightness for dark backgrounds
  const targetLightMinL = 0.75; // Min lightness for light text

  if (l >= lightnessThreshold) { // Light color -> make dark
      newL = targetDarkMaxL * (1 - (l - lightnessThreshold) / (1 - lightnessThreshold));
  } else { // Dark color -> make light
      newL = targetLightMinL + (1 - targetLightMinL) * (l / lightnessThreshold);
  }

  // Reduce saturation, especially for lighter colors
  newS = s * (0.4 + (1 - l) * 0.4); // Reduce more for lighter colors

  // Clamp values
  newL = Math.max(0, Math.min(1, newL));
  newS = Math.max(0, Math.min(1, newS));

  return { h: h, s: newS, l: newL };
}

/** Converts an HSL object to a CSS hsl() string */
function hslToCssString(hsl: HSLColor): string {
  // Round values for CSS
  const h = Math.round(hsl.h);
  const s = Math.round(hsl.s * 100);
  const l = Math.round(hsl.l * 100);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Create a single stylesheet instance for our dynamic overrides
let dynamicStyleSheet: CSSStyleSheet | null = null;
try {
  dynamicStyleSheet = new CSSStyleSheet();
} catch (e) {
  console.error('[EyeLove CS] Error creating CSSStyleSheet:', e);
  // Fallback or error handling might be needed for older browsers/environments
}

/**
 * Applies dynamic dark mode styles and body class.
 */
function applyDarkModeStyles() {
  if (!dynamicStyleSheet) return; // Exit if sheet couldn't be created

  document.body.classList.add(BODY_CLASS_DARK_ENABLED);

  // --- CSS Variable Override Logic ---
  const computedStyles = getComputedStyle(document.documentElement);
  const overrideRules: string[] = [];

  for (const varName of TARGET_CSS_VARIABLES) {
    const value = computedStyles.getPropertyValue(varName).trim();
    if (value) {
      const originalHsl = parseColorString(value); // Parse the original color
      if (originalHsl) {
        // If it's a parseable color, transform it
        const darkHsl = transformHslForDarkMode(originalHsl);
        const newCssColor = hslToCssString(darkHsl);
        // Use !important for reliability
        overrideRules.push(`${varName}: ${newCssColor} !important;`);
      }
      // If value exists but is not a parseable color (e.g., gradient, keyword),
      // we currently do nothing. Strategy 2 (computed style analysis) would handle this.
    }
  }

  // Combine generated rules with fallback styles
  const cssOverrideRules = `
    /* EyeLove Dynamic Styles */
    html.eyelove-dark-theme-active,
    body.${BODY_CLASS_DARK_ENABLED} {
      /* Basic Fallbacks (applied if no variables override them OR if body class is used) */
      background-color: #1a1a1a !important;
      color: #e0e0e0 !important;
      border-color: #444444 !important; /* Basic border fallback */
      color-scheme: dark !important;

      /* Generated Variable Overrides (applied to :root effectively via specificity) */
      ${overrideRules.join('\n      ')}
    }

    /* Specific overrides needed beyond variables (keep simple) */
    body.${BODY_CLASS_DARK_ENABLED} a {
        color: #9ecaed !important; /* Ensure links are readable */
    }
     /* Add more targeted overrides if variables aren't enough */
  `;
  // -------------------------------------------------

  try {
    // Update the sheet content
    console.log('[EyeLove CS] applyDarkModeStyles: Current adoptedStyleSheets:', [...document.adoptedStyleSheets]);
    console.log('[EyeLove CS] applyDarkModeStyles: Attempting to add/update sheet:', dynamicStyleSheet);
    dynamicStyleSheet.replaceSync(cssOverrideRules);

    // Add the sheet to the document if it's not already there
    if (!document.adoptedStyleSheets.includes(dynamicStyleSheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, dynamicStyleSheet];
    }
     if (isDev) console.info('[EyeLove CS] Applied dynamic dark mode styles. Overridden vars:', overrideRules.length, 'CSS:', cssOverrideRules);

  } catch (e) {
      console.error('[EyeLove CS] Error applying dynamic styles:', e);
  }

  // Cache state
  try {
    localStorage.setItem('eyelove-enabled-cache', 'true');
  } catch (e) {
    if (isDev) console.error('Error writing to localStorage cache:', e);
  }
}

/**
 * Removes dynamic dark mode styles and body class.
 */
function removeDarkModeStyles() {
  document.body.classList.remove(BODY_CLASS_DARK_ENABLED);

  // Remove our specific sheet from the document
  console.log('[EyeLove CS] removeDarkModeStyles: Current adoptedStyleSheets:', [...document.adoptedStyleSheets]);
  console.log('[EyeLove CS] removeDarkModeStyles: Attempting to remove sheet:', dynamicStyleSheet);
  if (dynamicStyleSheet && document.adoptedStyleSheets.includes(dynamicStyleSheet)) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
      (s) => s !== dynamicStyleSheet
    );
  }
  if (isDev) console.info('[EyeLove CS] Removed dynamic dark mode styles.');

  // Cache state
  try {
    localStorage.setItem('eyelove-enabled-cache', 'false');
  } catch (e) {
    if (isDev) console.error('Error writing to localStorage cache:', e);
  }
}


// == Listeners ==

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender) => {
  // --- Add this sender check ---
  if (sender.id !== chrome.runtime.id) {
    // Optional: Log ignored messages from other sources during development
    // if (isDev) console.debug('[EyeLove CS] Ignoring message from other sender:', sender.id, message);
    return false; // Ignore message from other senders
  }
  // --- End of sender check ---

  if (isDev) console.log('[EyeLove CS] Raw message received from own extension:', message);
  const parsedMessage = parseMessage(message); // Use the parser

  if (!parsedMessage) {
    // Log handled by parseMessage utility itself
    return false;
  }

  if (isDev) console.log('[EyeLove CS] Parsed message received:', parsedMessage);

  if (parsedMessage.action === 'updateBodyClass') {
    const enabled = parsedMessage.payload?.enabled;
    console.log('[EyeLove CS] Handling updateBodyClass. Enabled:', enabled);
    if (enabled === true) {
      applyDarkModeStyles();
    } else if (enabled === false) {
      removeDarkModeStyles();
    }
  } else {
    if (isDev) console.info('[EyeLove CS] Received unhandled parsed message:', parsedMessage);
  }
  return false; // No async response needed here
});


// == Initial State Query ==

// Function to ask the background script for the initial state
function queryInitialState() {
  if (chrome.runtime?.id) {
    if (isDev) console.info('[EyeLove CS] Querying initial state from background...');
    chrome.runtime.sendMessage({ action: 'queryInitialState' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[EyeLove CS] Error querying initial state:', chrome.runtime.lastError.message);
        // Apply based on FOUC handler's cache read
        const cachedEnabled = localStorage.getItem('eyelove-enabled-cache') === 'true';
         if (cachedEnabled) applyDarkModeStyles(); else removeDarkModeStyles();
        return;
      }
      try {
        const settings = SettingsSchema.partial().parse(response || {});
        if (isDev) console.info('[EyeLove CS] Received initial state:', settings);
        // Apply initial styles based on received state
        if (settings.enabled) {
            applyDarkModeStyles();
        } else {
            removeDarkModeStyles();
        }
      } catch(validationError) {
        console.error("[EyeLove CS] Invalid initial settings received:", validationError);
        applyDarkModeStyles(); // Fallback to enabled
      }
    });
  } else {
    if (isDev) console.warn("[EyeLove CS] Not running as extension, cannot query initial state.");
    // Fallback to cache
    try {
      const cachedEnabled = localStorage.getItem('eyelove-enabled-cache') === 'true';
       if (cachedEnabled) applyDarkModeStyles(); else removeDarkModeStyles();
    } catch (e) {
      applyDarkModeStyles(); // Fallback
      if (isDev) console.error('Error reading from localStorage cache:', e);
    }
  }
}

// Initial load - Apply styles immediately based on cache if possible before querying background
try {
    const cachedEnabled = localStorage.getItem('eyelove-enabled-cache') === 'true';
    if(cachedEnabled) {
        if (isDev) console.info('[EyeLove CS] Applying initial styles from cache.');
        applyDarkModeStyles(); // Apply styles immediately based on cache
    }
} catch(e) {
     if (isDev) console.error('Error reading cache on initial load:', e);
}
// Then query background for potentially updated state
setTimeout(queryInitialState, 100); 