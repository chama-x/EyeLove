// src/content-scripts/main.ts
// Injected at document_idle (or later)

import { SettingsSchema, parseMessage } from '../lib/schemas';
import * as culori from 'culori'; // Import the culori library

// Define Oklch type to match culori's internal type structure
interface Oklch {
  mode: "oklch"; // Literal type for mode
  l: number;     // Lightness (0-1)
  c: number;     // Chroma (0+)
  h?: number;    // Hue (0-360), optional to match culori's type definition
  alpha?: number; // Alpha channel (0-1), optional
}

// Store original element inline styles for proper restoration
const elementOriginalStyles = new WeakMap<HTMLElement, string | null>();

// Observer for dynamic content
let domObserver: MutationObserver | null = null;

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
  // GitHub Specific Vars
  '--button-default-bgColor-rest', '--color-btn-bg', '--color-btn-text',
  '--color-fg-default', '--color-canvas-default', '--color-canvas-subtle',
  '--color-accent-fg', '--color-accent-emphasis', '--color-border-default',
];

// == Dynamic Stylesheet Logic ==

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

  // --- CSS Variable Override Logic using OKLCH ---
  const computedStylesRoot = getComputedStyle(document.documentElement); // Renamed for clarity
  const overrideRules: string[] = [];

  for (const varName of TARGET_CSS_VARIABLES) {
    const value = computedStylesRoot.getPropertyValue(varName).trim();
    if (value) {
      try {
        const parsed = culori.parse(value); // Attempt to parse ANY valid CSS color
        if (parsed) {
          const originalOklch = culori.oklch(parsed); // Convert to OKLCH

          if (originalOklch) {
            // Transform OKLCH for dark mode
            // L: Invert lightness (0 -> 1, 1 -> 0) - simple inversion for now
            let newL = 1.0 - originalOklch.l;
            // C: Reduce chroma (saturation) significantly
            let newC = originalOklch.c * 0.3; // Reduce to 30% (adjust as needed)
            // H: Keep Hue the same
            const newH = originalOklch.h || 0; // Use 0 if hue is undefined (e.g., for grayscale)

            // --- Refinements (Could be added later) ---
            // Clamping: Ensure L is [0, 1], C >= 0
            newL = Math.max(0, Math.min(1, newL));
            newC = Math.max(0, newC);
            // Add minimum contrast logic here if needed based on originalL vs newL

            // Create the new color object with explicit type and mode as literal "oklch"
            const darkOklch: Oklch = { 
              mode: "oklch", 
              l: newL, 
              c: newC, 
              h: newH 
            };

            // Format back to a common, compatible format like HEX
            const newCssColor = culori.formatHex(darkOklch);

            if (newCssColor) {
              // Use !important for reliability
              overrideRules.push(`${varName}: ${newCssColor} !important;`);
            }
          }
        }
      } catch (parseError) {
        // culori.parse throws on invalid color string
        if (isDev) console.debug(`[EyeLove CS] Could not parse color for var ${varName}:`, value, parseError);
      }
    }
  }
  // --- End of CSS Variable Strategy (Strategy 1) ---

  // --- Computed Style Analysis Fallback (Strategy 2) ---
  if (isDev) console.log('[EyeLove CS] Starting Strategy 2: Computed Style Analysis...');
  const t0_strategy2 = performance.now(); // Start timing Strategy 2

  // TODO: Refine selector later (performance) - avoid '*' initially
  const elementSelector = 'body, div, section, article, main, header, footer, nav, aside, p, li, h1, h2, h3, h4, h5, h6, span, button, label, legend, td, th, svg'; // Common elements + SVG
  const elementsToCheck = document.querySelectorAll(elementSelector);
  const elementsToStyleData: Array<{
      element: Element;
      originalBg: string;
      originalColor: string;
      originalBorder: string;
      originalFill?: string;
      originalStroke?: string;
  }> = [];

  // == Read Phase (Batch DOM Reads) ==
  // PERF_NOTE: Avoid reading and writing in the same loop!
  elementsToCheck.forEach(element => {
      try {
          // PERF_NOTE: getComputedStyle can be expensive. Minimize calls.
          const styles = window.getComputedStyle(element);
          const bgColor = styles.backgroundColor;
          const color = styles.color;
          const borderColor = styles.borderTopColor; // Check one border color for simplicity
          
          // Add SVG-specific properties
          const fill = styles.fill;
          const stroke = styles.stroke;

          // TODO: Add smarter check: Only process if element needs styling
          // (e.g., light background OR dark text, AND not transparent/fully transparent,
          // AND maybe check if it's already inheriting styles correctly from overridden vars)
          // For now, store all found colors for processing.

          elementsToStyleData.push({
              element: element,
              originalBg: bgColor,
              originalColor: color,
              originalBorder: borderColor,
              originalFill: fill !== 'none' ? fill : undefined,
              originalStroke: stroke !== 'none' ? stroke : undefined
          });
      } catch (e) {
          if (isDev) console.warn('[EyeLove CS] Error getting computed style for element:', element, e);
      }
  });
  if (isDev) console.log(`[EyeLove CS] Strategy 2: Read phase found ${elementsToStyleData.length} elements data points.`);


  // == Write Phase (Batch DOM Writes - Apply Inline Styles) ==
  // PERF_NOTE: This loop applies inline styles. Consider generating CSS rules for adopted sheet later if needed.
  elementsToStyleData.forEach(data => {
      try {
          let newBg: string | null = null;
          let newColor: string | null = null;
          let newFill: string | null = null;
          let newStroke: string | null = null;
          let finalBackgroundL = 0.2; // Default assumed dark background lightness
          let backgroundLuminance: number | undefined;
          const isButton = data.element.tagName === 'BUTTON'; // Check if it's a button
          let finalBgOklch: Oklch | undefined; // Store the final background color

          // Process Background Color
          const parsedBg = data.originalBg ? culori.parse(data.originalBg) : undefined;
          const originalAlpha = parsedBg?.alpha ?? 1.0;
          const hasDirectText = data.element.textContent?.trim().length > 0;
          const oklchBg = parsedBg ? culori.oklch(parsedBg) : undefined;
          let reasonSkipped = '';

          if (isDev) { // Debug logs only in development
              console.debug(`[EyeLove CS Debug BG] === Element:`, data.element);
              console.debug(`  Original BG: ${data.originalBg}`);
              console.debug(`  Parsed BG:`, parsedBg);
              console.debug(`  Alpha: ${originalAlpha.toFixed(2)}`);
              console.debug(`  Has Direct Text: ${hasDirectText}`);
              if(oklchBg) console.debug(`  Original Lightness (L): ${oklchBg.l.toFixed(2)}`);
          }

          // --- Refined Check: Only process opaque backgrounds ---
          if (oklchBg && originalAlpha > 0.5) { // Check opacity FIRST
              if (oklchBg!.l > 0.3) { // Check if light enough
                  if (hasDirectText) { // Check if it has text
                      // Conditions met: Calculate new background
                      const isButton = data.element.tagName === 'BUTTON';
                      let targetL = isButton ? 0.35 : (1.0 - oklchBg.l);
                      let targetC = oklchBg.c * (isButton ? 0.1 : 0.3);
                      const newH = oklchBg.h || 0;
                      targetL = Math.max(0, Math.min(1, targetL));
                      targetC = Math.max(0, targetC);
                      finalBackgroundL = targetL;
                      finalBgOklch = { mode: "oklch", l: finalBackgroundL, c: targetC, h: newH };
                      backgroundLuminance = getRelativeLuminance(finalBgOklch);
                      newBg = culori.formatHex(finalBgOklch);
                      if (isDev) console.debug(`  Decision: Applying new BG ${newBg}`);
                  } else {
                      reasonSkipped = 'No direct text content';
                      // Estimate background luminance if skipping BG apply
                      finalBackgroundL = 0.2;
                      finalBgOklch = { mode: 'oklch', l: finalBackgroundL, c: 0, h: 0 };
                      backgroundLuminance = getRelativeLuminance(finalBgOklch) ?? 0.1;
                  }
              } else {
                  // Original was dark or near-dark
                  reasonSkipped = 'Original BG not light enough (L <= 0.3)';
                  finalBackgroundL = oklchBg.l;
                  finalBgOklch = oklchBg;
                  backgroundLuminance = getRelativeLuminance(finalBgOklch);
              }
          } else {
               // Background was transparent, semi-transparent, or unparseable
               reasonSkipped = `Parsed BG invalid or alpha <= 0.5 (alpha=${originalAlpha.toFixed(2)})`;
               finalBackgroundL = 0.2;
               finalBgOklch = { mode: 'oklch', l: finalBackgroundL, c: 0, h: 0 };
               backgroundLuminance = getRelativeLuminance(finalBgOklch) ?? 0.1;
          }
          // --- End Refined Check ---

          if (!newBg && isDev) {
              console.debug(`  Decision: Skipping BG override. Reason: ${reasonSkipped}`);
          }

          // Fallback for background luminance if still undefined (shouldn't happen often now)
          if (backgroundLuminance === undefined) {
             backgroundLuminance = finalBackgroundL < 0.5 ? 0.1 : 0.9;
             if (isDev) console.debug(`  Using estimated fallback luminance: ${backgroundLuminance.toFixed(2)}`);
          }

          // Process Text Color with simpler contrast approach
          const parsedColor = data.originalColor ? culori.parse(data.originalColor) : undefined;
          if (parsedColor && (parsedColor.alpha ?? 1) > 0.5) {
            const oklchColor = culori.oklch(parsedColor);
            if (oklchColor) {
              // Initial transformation
              let newL = 1.0 - oklchColor.l;
              let newC = oklchColor.c * (isButton ? 0.5 : 0.3); // Less chroma reduction for button text
              const newH = oklchColor.h || 0;
              
              // Basic clamping
              newL = Math.max(0, Math.min(1, newL));
              newC = Math.max(0, newC);
              
              // --- Apply Simpler Contrast Clamp ---
              if (finalBackgroundL < 0.5) {
                  newL = Math.max(newL, 0.75); // Force light text on dark background
              } else {
                  newL = Math.min(newL, 0.25); // Force dark text on light background
              }
              newL = Math.max(0, Math.min(1, newL)); // Re-clamp
              // --- End Simpler Contrast Clamp ---
              
              // Create transformed text color
              const darkOklchText: Oklch = { 
                mode: "oklch", 
                l: newL, 
                c: newC, 
                h: newH 
              };
              
              // Generate hex color
              newColor = culori.formatHex(darkOklchText);
            }
          }
          
          // Process SVG Fill Color
          if (data.originalFill) {
              try {
                  const parsedFill = culori.parse(data.originalFill);
                  if (parsedFill && (parsedFill.alpha ?? 1) > 0.1) {
                      const oklchFill = culori.oklch(parsedFill);
                      if (oklchFill) {
                          // Simple transformation
                          let newL = 1.0 - oklchFill.l; // Invert lightness
                          let newC = oklchFill.c * (isButton ? 0.4 : 0.3); // Less chroma reduction for button icons
                          const newH = oklchFill.h || 0;
                          
                          // Basic clamping
                          newL = Math.max(0, Math.min(1, newL));
                          newC = Math.max(0, newC);
                          
                          // --- Apply Simpler Contrast Clamp ---
                          if (finalBackgroundL < 0.5) {
                              newL = Math.max(newL, 0.75); // Force light fill on dark background
                          } else {
                              newL = Math.min(newL, 0.25); // Force dark fill on light background
                          }
                          newL = Math.max(0, Math.min(1, newL)); // Re-clamp
                          // --- End Simpler Contrast Clamp ---
                          
                          // Create transformed fill color
                          const darkOklchFill: Oklch = { 
                              mode: "oklch", 
                              l: newL, 
                              c: newC, 
                              h: newH 
                          };
                          
                          // Generate hex color
                          newFill = culori.formatHex(darkOklchFill);
                      }
                  }
              } catch (e) {
                  if (isDev) console.debug(`[EyeLove CS] Error processing fill color: ${data.originalFill}`, e);
              }
          }
          
          // Process SVG Stroke Color
          if (data.originalStroke) {
              try {
                  const parsedStroke = culori.parse(data.originalStroke);
                  if (parsedStroke && (parsedStroke.alpha ?? 1) > 0.1) {
                      const oklchStroke = culori.oklch(parsedStroke);
                      if (oklchStroke) {
                          // Simple transformation
                          let newL = 1.0 - oklchStroke.l; // Invert lightness
                          let newC = oklchStroke.c * (isButton ? 0.3 : 0.2); // Less chroma reduction for button strokes
                          const newH = oklchStroke.h || 0;
                          
                          // Basic clamping
                          newL = Math.max(0, Math.min(1, newL));
                          newC = Math.max(0, newC);
                          
                          // --- Apply Simpler Contrast Clamp ---
                          if (finalBackgroundL < 0.5) {
                              newL = Math.max(newL, 0.75); // Force light stroke on dark background
                          } else {
                              newL = Math.min(newL, 0.25); // Force dark stroke on light background
                          }
                          newL = Math.max(0, Math.min(1, newL)); // Re-clamp
                          // --- End Simpler Contrast Clamp ---
                          
                          // Create transformed stroke color
                          const darkOklchStroke: Oklch = { 
                              mode: "oklch", 
                              l: newL, 
                              c: newC, 
                              h: newH 
                          };
                          
                          // Generate hex color
                          newStroke = culori.formatHex(darkOklchStroke);
                      }
                  }
              } catch (e) {
                  if (isDev) console.debug(`[EyeLove CS] Error processing stroke color: ${data.originalStroke}`, e);
              }
          }

          // Apply styles directly to the element using setProperty
          // PERF_NOTE: Writing inline styles. Causes DOM modification.
          let stylesApplied = false;
          
          if (data.element instanceof HTMLElement || data.element instanceof SVGElement) {
              // First, store the original style but only if not already styled by us
              if (!data.element.hasAttribute('data-eyelove-styled')) {
                  const originalStyle = data.element.getAttribute('style');
                  elementOriginalStyles.set(data.element as HTMLElement, originalStyle);
              }
              
              // Apply new styles
              if (newBg) {
                  data.element.style.setProperty('background-color', newBg, 'important');
                  stylesApplied = true;
              }
              if (newColor) {
                  data.element.style.setProperty('color', newColor, 'important');
                  stylesApplied = true;
              }
              // Apply SVG-specific styles
              if (newFill) {
                  data.element.style.setProperty('fill', newFill, 'important');
                  stylesApplied = true;
              }
              if (newStroke) {
                  data.element.style.setProperty('stroke', newStroke, 'important');
                  stylesApplied = true;
              }
              
              // Mark the element as styled by EyeLove for later cleanup
              if (stylesApplied) {
                  data.element.dataset.eyeloveStyled = 'inline';
              }
          }
      } catch (e) {
          if (isDev) console.warn('[EyeLove CS] Error processing or styling element:', data.element, e);
      }
  });

  const t1_strategy2 = performance.now();
  if (isDev) console.log(`[EyeLove CS] Strategy 2: Write phase finished. Duration: ${(t1_strategy2 - t0_strategy2).toFixed(2)}ms`);
  // --- End of Strategy 2 ---

  // Combine generated rules with fallback styles
  const cssOverrideRules = `
    /* EyeLove Dynamic Styles (OKLCH-based) */
    html.eyelove-dark-theme-active,
    body.${BODY_CLASS_DARK_ENABLED} {
      /* Basic Fallbacks */
      background-color: #1a1a1a !important;
      color: #e0e0e0 !important;
      border-color: #444444 !important;
      color-scheme: dark !important;

      /* Generated Variable Overrides (Strategy 1) */
      ${overrideRules.join('\n      ')}
    }

    /* Specific non-variable overrides */
    body.${BODY_CLASS_DARK_ENABLED} a {
      color: #9ecaed !important;
    }
  `;

  try {
    // Update the sheet content
    console.log('[EyeLove CS] applyDarkModeStyles: Current adoptedStyleSheets:', [...document.adoptedStyleSheets]);
    console.log('[EyeLove CS] applyDarkModeStyles: Attempting to add/update sheet:', dynamicStyleSheet);
    dynamicStyleSheet.replaceSync(cssOverrideRules);

    // Add the sheet to the document if it's not already there
    if (!document.adoptedStyleSheets.includes(dynamicStyleSheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, dynamicStyleSheet];
    }
    if (isDev) console.info('[EyeLove CS] Applied dynamic dark mode styles (OKLCH). Overridden vars:', overrideRules.length);
    // if (isDev && overrideRules.length > 0) console.debug('Generated CSS:', cssOverrideRules); // Optionally log full CSS

  } catch (e) {
      console.error('[EyeLove CS] Error applying dynamic styles:', e);
  }

  // Cache state
  try {
    localStorage.setItem('eyelove-enabled-cache', 'true');
  } catch (e) {
    if (isDev) console.error('Error writing to localStorage cache:', e);
  }
  
  // Set up MutationObserver for dynamic content if not already observing
  if (!domObserver) {
    if (isDev) console.log('[EyeLove CS] Setting up MutationObserver for dynamic content');
    
    domObserver = new MutationObserver((mutationsList) => {
      if (isDev) console.log('[EyeLove CS] DOM mutations detected:', mutationsList.length);
      
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node instanceof HTMLElement) {
              if (isDev) console.log('[EyeLove CS] New element added to DOM:', node);
              applyStylesToElementAndChildren(node);
            }
          });
        }
      }
    });
    
    // Start observing with configuration
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
    
    if (isDev) console.log('[EyeLove CS] MutationObserver started for dynamic content');
  }
}

/**
 * Removes dynamic dark mode styles and body class.
 */
function removeDarkModeStyles() {
  // Disconnect the mutation observer if it exists
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
    if (isDev) console.log('[EyeLove CS] MutationObserver disconnected');
  }
  
  // First, clean up any inline styles applied by Strategy 2
  const t0_cleanup = performance.now();
  const inlineStyledElements = document.querySelectorAll('[data-eyelove-styled="inline"]');
  
  if (inlineStyledElements.length > 0) {
      if (isDev) console.log(`[EyeLove CS Cleanup] Removing inline styles from ${inlineStyledElements.length} elements`);
      
      inlineStyledElements.forEach(element => {
          if (element instanceof HTMLElement || element instanceof SVGElement) {
              // Retrieve original style
              const originalStyle = elementOriginalStyles.get(element as HTMLElement);
              
              // --- Add Debug Logging Here ---
              if (isDev) {
                  console.debug(`[EyeLove CS Cleanup] Processing element:`, element);
                  console.debug(`[EyeLove CS Cleanup]   Original style retrieved from WeakMap:`, originalStyle);
              }
              // --- End Debug Logging ---
              
              // Restore original style state
              if (originalStyle !== undefined) {
                  if (originalStyle !== null) {
                      if (isDev) console.debug(`[EyeLove CS Cleanup]   Restoring style attribute to: "${originalStyle}"`);
                      element.setAttribute('style', originalStyle);
                  } else {
                      if (isDev) console.debug('[EyeLove CS Cleanup]   Original style was null, removing attribute.');
                      element.removeAttribute('style');
                  }
                  // Clean up WeakMap entry
                  elementOriginalStyles.delete(element as HTMLElement);
              } else {
                  // Fallback / Error case
                  if (isDev) console.warn('[EyeLove CS Cleanup] Missing original style in WeakMap for element:', element);
                  // Attempt cleanup by removing attribute as fallback
                   element.removeAttribute('style');
                   // Fallback: remove individual properties (optional, maybe redundant now)
                   // (element as HTMLElement).style.removeProperty('background-color');
                   // (element as HTMLElement).style.removeProperty('color');
                   // (element as HTMLElement).style.removeProperty('fill');
                   // (element as HTMLElement).style.removeProperty('stroke');
              }
              
              // Remove our marker
              element.removeAttribute('data-eyelove-styled');
          }
      });
      
      const t1_cleanup = performance.now();
      if (isDev) console.log(`[EyeLove CS] Inline styles cleanup completed in ${(t1_cleanup - t0_cleanup).toFixed(2)}ms`);
  }
  
  // Then remove the body class
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

/**
 * Apply styles to a dynamically added element and its children
 * 
 * @param element The newly added element to style
 */
function applyStylesToElementAndChildren(element: Element) {
  if (!element) return;
  
  const t0 = performance.now();
  
  // Target this element and all its descendants matching our selector
  const elementSelector = 'body, div, section, article, main, header, footer, nav, aside, p, li, h1, h2, h3, h4, h5, h6, span, button, label, legend, td, th, svg';
  const elementsToProcess: Element[] = [];
  
  // Add the element itself if it matches our target tags
  if (element.nodeName && elementSelector.includes(element.nodeName.toLowerCase())) {
    elementsToProcess.push(element);
  }
  
  // Add matching child elements
  if (element.querySelectorAll) {
    const children = element.querySelectorAll(elementSelector);
    children.forEach(child => elementsToProcess.push(child));
  }
  
  if (elementsToProcess.length === 0) return;
  if (isDev) console.log(`[EyeLove CS] Processing ${elementsToProcess.length} dynamic elements`);
  
  // --- Read Phase ---
  const elementsData: Array<{
    element: Element;
    originalBg: string;
    originalColor: string;
    originalFill?: string;
    originalStroke?: string;
  }> = [];
  
  // Batch DOM reads
  elementsToProcess.forEach(el => {
    try {
      const styles = window.getComputedStyle(el);
      elementsData.push({
        element: el,
        originalBg: styles.backgroundColor,
        originalColor: styles.color,
        originalFill: styles.fill !== 'none' ? styles.fill : undefined,
        originalStroke: styles.stroke !== 'none' ? styles.stroke : undefined
      });
    } catch (e) {
      if (isDev) console.warn('[EyeLove CS] Error reading styles from dynamic element:', el, e);
    }
  });
  
  // --- Write Phase ---
  // Apply the same strategy 2 logic but without border handling
  elementsData.forEach(data => {
    try {
      let newBg: string | null = null;
      let newColor: string | null = null;
      let newFill: string | null = null;
      let newStroke: string | null = null;
      let finalBackgroundL = 0.2; // Default assumed dark background lightness
      const isButton = data.element.tagName === 'BUTTON'; // Check if it's a button
      let finalBgOklch: Oklch | undefined; // Store the final background color

      // Process Background Color
      const parsedBg = data.originalBg ? culori.parse(data.originalBg) : undefined;
      const originalAlpha = parsedBg?.alpha ?? 1.0;
      const hasDirectText = data.element.textContent?.trim().length > 0;
      const oklchBg = parsedBg ? culori.oklch(parsedBg) : undefined;
      let reasonSkipped = '';

      if (isDev) { // Debug logs only in development
          console.debug(`[EyeLove CS Debug BG] === Element:`, data.element);
          console.debug(`  Original BG: ${data.originalBg}`);
          console.debug(`  Parsed BG:`, parsedBg);
          console.debug(`  Alpha: ${originalAlpha.toFixed(2)}`);
          console.debug(`  Has Direct Text: ${hasDirectText}`);
          if(oklchBg) console.debug(`  Original Lightness (L): ${oklchBg.l.toFixed(2)}`);
      }

      // --- Refined Check: Only process opaque backgrounds ---
      if (oklchBg && originalAlpha > 0.5) { // Check opacity FIRST
          if (oklchBg!.l > 0.3) { // Check if light enough
              if (hasDirectText) { // Check if it has text
                  // Conditions met: Calculate new background
                  const isButton = data.element.tagName === 'BUTTON';
                  let targetL = isButton ? 0.35 : (1.0 - oklchBg.l);
                  let targetC = oklchBg.c * (isButton ? 0.1 : 0.3);
                  const newH = oklchBg.h || 0;
                  targetL = Math.max(0, Math.min(1, targetL));
                  targetC = Math.max(0, targetC);
                  finalBackgroundL = targetL;
                  finalBgOklch = { mode: "oklch", l: finalBackgroundL, c: targetC, h: newH };
                  newBg = culori.formatHex(finalBgOklch);
                  if (isDev) console.debug(`  Decision: Applying new BG ${newBg}`);
              } else {
                  reasonSkipped = 'No direct text content';
                  // Estimate background luminance if skipping BG apply
                  finalBackgroundL = 0.2;
                  finalBgOklch = { mode: 'oklch', l: finalBackgroundL, c: 0, h: 0 };
              }
          } else {
              // Original was dark or near-dark
              reasonSkipped = 'Original BG not light enough (L <= 0.3)';
              finalBackgroundL = oklchBg.l;
              finalBgOklch = oklchBg;
          }
      } else {
           // Background was transparent, semi-transparent, or unparseable
           reasonSkipped = `Parsed BG invalid or alpha <= 0.5 (alpha=${originalAlpha.toFixed(2)})`;
           finalBackgroundL = 0.2;
           finalBgOklch = { mode: 'oklch', l: finalBackgroundL, c: 0, h: 0 };
      }
      // --- End Refined Check ---

      if (!newBg && isDev) {
          console.debug(`  Decision: Skipping BG override. Reason: ${reasonSkipped}`);
      }

      // Process Text Color with simpler contrast approach
      const parsedColor = data.originalColor ? culori.parse(data.originalColor) : undefined;
      if (parsedColor && (parsedColor.alpha ?? 1) > 0.5) {
        const oklchColor = culori.oklch(parsedColor);
        if (oklchColor) {
          // Initial transformation
          let newL = 1.0 - oklchColor.l;
          let newC = oklchColor.c * (isButton ? 0.5 : 0.3); // Less chroma reduction for button text
          const newH = oklchColor.h || 0;
          
          // Basic clamping
          newL = Math.max(0, Math.min(1, newL));
          newC = Math.max(0, newC);
          
          // --- Apply Simpler Contrast Clamp ---
          if (finalBackgroundL < 0.5) {
              newL = Math.max(newL, 0.75); // Force light text on dark background
          } else {
              newL = Math.min(newL, 0.25); // Force dark text on light background
          }
          newL = Math.max(0, Math.min(1, newL)); // Re-clamp
          // --- End Simpler Contrast Clamp ---
          
          // Create transformed text color
          const darkOklchText: Oklch = { 
            mode: "oklch", 
            l: newL, 
            c: newC, 
            h: newH 
          };
          
          // Generate hex color
          newColor = culori.formatHex(darkOklchText);
        }
      }
      
      // Process SVG Fill Color
      if (data.originalFill) {
        try {
          const parsedFill = culori.parse(data.originalFill);
          if (parsedFill && (parsedFill.alpha ?? 1) > 0.1) {
            const oklchFill = culori.oklch(parsedFill);
            if (oklchFill) {
              // Simple transformation
              let newL = 1.0 - oklchFill.l; // Invert lightness
              let newC = oklchFill.c * (isButton ? 0.4 : 0.3); // Less chroma reduction for button icons
              const newH = oklchFill.h || 0;
              
              // Basic clamping
              newL = Math.max(0, Math.min(1, newL));
              newC = Math.max(0, newC);
              
              // --- Apply Simpler Contrast Clamp ---
              if (finalBackgroundL < 0.5) {
                  newL = Math.max(newL, 0.75); // Force light fill on dark background
              } else {
                  newL = Math.min(newL, 0.25); // Force dark fill on light background
              }
              newL = Math.max(0, Math.min(1, newL)); // Re-clamp
              // --- End Simpler Contrast Clamp ---
              
              // Create transformed fill color
              const darkOklchFill: Oklch = { 
                mode: "oklch", 
                l: newL, 
                c: newC, 
                h: newH 
              };
              
              // Generate hex color
              newFill = culori.formatHex(darkOklchFill);
            }
          }
        } catch (e) {
          if (isDev) console.debug(`[EyeLove CS] Error processing fill color: ${data.originalFill}`, e);
        }
      }
      
      // Process SVG Stroke Color
      if (data.originalStroke) {
        try {
          const parsedStroke = culori.parse(data.originalStroke);
          if (parsedStroke && (parsedStroke.alpha ?? 1) > 0.1) {
            const oklchStroke = culori.oklch(parsedStroke);
            if (oklchStroke) {
              // Simple transformation
              let newL = 1.0 - oklchStroke.l; // Invert lightness
              let newC = oklchStroke.c * (isButton ? 0.3 : 0.2); // Less chroma reduction for button strokes
              const newH = oklchStroke.h || 0;
              
              // Basic clamping
              newL = Math.max(0, Math.min(1, newL));
              newC = Math.max(0, newC);
              
              // --- Apply Simpler Contrast Clamp ---
              if (finalBackgroundL < 0.5) {
                  newL = Math.max(newL, 0.75); // Force light stroke on dark background
              } else {
                  newL = Math.min(newL, 0.25); // Force dark stroke on light background
              }
              newL = Math.max(0, Math.min(1, newL)); // Re-clamp
              // --- End Simpler Contrast Clamp ---
              
              // Create transformed stroke color
              const darkOklchStroke: Oklch = { 
                mode: "oklch", 
                l: newL, 
                c: newC, 
                h: newH 
              };
              
              // Generate hex color
              newStroke = culori.formatHex(darkOklchStroke);
            }
          }
        } catch (e) {
          if (isDev) console.debug(`[EyeLove CS] Error processing stroke color: ${data.originalStroke}`, e);
        }
      }
      
      // Apply styles
      let stylesApplied = false;
      
      if (data.element instanceof HTMLElement || data.element instanceof SVGElement) {
        // Store original style
        if (!data.element.hasAttribute('data-eyelove-styled')) {
          const originalStyle = data.element.getAttribute('style');
          elementOriginalStyles.set(data.element as HTMLElement, originalStyle);
        }
        
        // Apply new styles
        if (newBg) {
          data.element.style.setProperty('background-color', newBg, 'important');
          stylesApplied = true;
        }
        if (newColor) {
          data.element.style.setProperty('color', newColor, 'important');
          stylesApplied = true;
        }
        // Apply SVG-specific styles
        if (newFill) {
          data.element.style.setProperty('fill', newFill, 'important');
          stylesApplied = true;
        }
        if (newStroke) {
          data.element.style.setProperty('stroke', newStroke, 'important');
          stylesApplied = true;
        }
        
        if (stylesApplied) {
          data.element.dataset.eyeloveStyled = 'inline';
        }
      }
    } catch (e) {
      if (isDev) console.warn('[EyeLove CS] Error styling dynamic element:', data.element, e);
    }
  });
  
  const t1 = performance.now();
  if (isDev && elementsData.length > 0) {
    console.log(`[EyeLove CS] Processed ${elementsData.length} dynamic elements in ${(t1 - t0).toFixed(2)}ms`);
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

// Query background for potentially updated state ONCE after a short delay.
// queryInitialState itself handles applying styles based on response or cache fallback.
setTimeout(queryInitialState, 100);

// Note: The following unused functions have been removed:
// - getHighContrastColor
// - adjustColorForHighContrast
// - invertLightness
// - processColorMatches (commented placeholder)
// - processColorMatches (commented placeholder) 