/*
 * Copyright 2026 Mellow Solutions
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ColorCheck Popup Script
// Enhanced with favorites, dark mode, and 10-color history

document.addEventListener('DOMContentLoaded', () => {
  // External Links
  const COFFEE_URL = 'https://buymeacoffee.com/mellowsolutions';
  const LANDING_URL = 'https://mello2110.github.io/LandingpageMellowSolutions/';

  let currentFormat = 'hex';
  let currentColors = null;
  let favorites = [];
  const MAX_FAVORITES = 50;

  // DOM Elements
  const primarySwatch = document.getElementById('primarySwatch');
  const baseSwatch = document.getElementById('baseSwatch');
  const accentSwatch = document.getElementById('accentSwatch');
  const accent2Swatch = document.getElementById('accent2Swatch');
  const historyList = document.getElementById('historyList');
  const themeToggle = document.getElementById('themeToggle');
  const settingsBtn = document.getElementById('openSettings');
  const coffeeBtn = document.getElementById('coffeeBtn');
  const startEyedropperBtn = document.getElementById('startEyedropper');
  const startPaletteBtn = document.getElementById('startPalette');

  // DOM Elements - Mode Toggle
  const modePaletteBtn = document.getElementById('modePalette');
  const modeAccentBtn = document.getElementById('modeAccent');
  let currentMode = 'palette';

  // Complementary Elements
  const compInput = document.getElementById('compInput');
  const generateCompBtn = document.getElementById('generateComp');
  const compBaseSwatch = document.getElementById('compBase');
  const compResults = [
    { el: document.getElementById('compTrue'), shift: 180 },
    { el: document.getElementById('compSplit1'), shift: 150 },
    { el: document.getElementById('compSplit2'), shift: 210 }
  ];

  // Initialize
  init();

  async function init() {
    await loadTheme();
    await loadMode();
    await loadFormat();
    await loadColors();
    await loadHistory();
    await loadFavorites();
    setupEventListeners();
  }

  async function loadMode() {
    const result = await chrome.storage.local.get(['activeMode']);
    currentMode = result.activeMode || 'palette';
    updateModeUI();
  }

  function updateModeUI() {
    if (currentMode === 'palette') {
      modePaletteBtn.classList.add('active');
      modeAccentBtn.classList.remove('active');
      updateSwatchLabels(['Primary', 'Base', 'Accent 1', 'Accent 2']);
    } else {
      modeAccentBtn.classList.add('active');
      modePaletteBtn.classList.remove('active');
      updateSwatchLabels(['Accent 1', 'Base', 'Accent 2', 'Accent 3']);
    }
  }

  function updateSwatchLabels(labels) {
    if (primarySwatch) primarySwatch.querySelector('.swatch-label').textContent = labels[0];
    if (baseSwatch) baseSwatch.querySelector('.swatch-label').textContent = labels[1];
    if (accentSwatch) accentSwatch.querySelector('.swatch-label').textContent = labels[2];
    if (accent2Swatch) accent2Swatch.querySelector('.swatch-label').textContent = labels[3];
  }

  async function loadShortcuts() {
    try {
      const commands = await chrome.commands.getAll();
      const eyedropperEl = document.getElementById('popupEyedropperShortcut');
      const paletteEl = document.getElementById('popupPaletteShortcut');

      commands.forEach(cmd => {
        if (cmd.name === 'toggle-eyedropper' && eyedropperEl) {
          eyedropperEl.innerHTML = formatShortcutCompact(cmd.shortcut, 'Pick');
        }
        if (cmd.name === 'toggle-palette' && paletteEl) {
          paletteEl.innerHTML = formatShortcutCompact(cmd.shortcut, 'Palette');
        }
      });
    } catch (e) {
      console.error('Failed to load shortcuts:', e);
    }
  }

  function formatShortcutCompact(shortcut, label) {
    if (!shortcut) {
      return `<span class="shortcut-not-set">No shortcut</span> ${label}`;
    }
    const keys = shortcut.split('+').map(key => key.trim());
    const formatted = keys.map(key => `<kbd>${key}</kbd>`).join('+');
    return `${formatted} ${label}`;
  }

  async function loadFormat() {
    const result = await chrome.storage.local.get(['defaultFormat']);
    currentFormat = result.defaultFormat || 'hex';
  }

  function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Settings button
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // External links
    coffeeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: COFFEE_URL });
    });

    // Brand link
    const brandLink = document.getElementById('brandLinkPopup');
    if (brandLink) {
      brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: LANDING_URL });
      });
    }

    // Manual Triggers - Button actions depend on active mode, but buttons themselves call triggerMode
    startEyedropperBtn.addEventListener('click', () => triggerMode('eyedropper'));
    startPaletteBtn.addEventListener('click', () => triggerMode(currentMode)); // Uses currently selected mode

    // Mode Toggle
    modePaletteBtn.addEventListener('click', async () => {
      currentMode = 'palette';
      await chrome.storage.local.set({ activeMode: 'palette' });
      updateModeUI();
    });

    modeAccentBtn.addEventListener('click', async () => {
      currentMode = 'accent';
      await chrome.storage.local.set({ activeMode: 'accent' });
      updateModeUI();
    });

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const swatch = btn.closest('.swatch');
        const value = swatch.querySelector('.swatch-value').textContent;
        if (value && value !== '--') {
          copyToClipboard(value, btn);
        }
      });
    });

    // Clear Palette
    const clearPaletteBtn = document.getElementById('clearPalette');
    if (clearPaletteBtn) {
      clearPaletteBtn.addEventListener('click', async () => {
        await chrome.storage.session.remove('currentColors');
        currentColors = null;

        // Reset UI manually since updateDisplay returns early on null
        [primarySwatch, baseSwatch, accentSwatch, accent2Swatch].forEach(swatch => {
          if (swatch) {
            const colorDiv = swatch.querySelector('.swatch-color');
            const valueSpan = swatch.querySelector('.swatch-value');
            colorDiv.style.background = '';
            valueSpan.textContent = '--';
          }
        });

        showToast('Palette cleared');
      });
    }

    // Clear Recent
    const clearRecentBtn = document.getElementById('clearRecent');
    if (clearRecentBtn) {
      clearRecentBtn.addEventListener('click', async () => {
        await chrome.storage.session.remove('colorHistory');
        renderHistory([]);
        showToast('Recent history cleared');
      });
    }

    // Favorite buttons
    document.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const swatch = btn.closest('.swatch');
        const colorData = getSwatchColorData(swatch);
        if (colorData) {
          toggleFavorite(colorData, btn);
        }
      });
    });

    // Complementary Generator
    generateCompBtn.addEventListener('click', generateComplementary);
    compInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') generateComplementary();
    });

    // Copy for Complementary swatches (click swatch-color to copy)
    [compBaseSwatch, ...compResults.map(r => r.el)].forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.comp-fav-btn')) return;
        const value = el.querySelector('.swatch-value').textContent;
        if (value && value !== '--') {
          copyToClipboard(value, el);
        }
      });
    });

    // Favorites for Complementary swatches
    document.querySelectorAll('.comp-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const swatch = btn.closest('.comp-swatch');
        const hex = swatch.querySelector('.swatch-value').textContent;
        if (hex && hex !== '--') {
          const rgb = parseToRgb(hex);
          if (rgb) {
            const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
            addToFavorites({
              hex: hex,
              rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
              hsl: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`
            });
          }
        }
      });
    });

    // Auto-fill Complementary input from Palette swatches
    [primarySwatch, baseSwatch, accentSwatch, accent2Swatch].forEach(swatch => {
      if (swatch) {
        swatch.querySelector('.swatch-color').addEventListener('click', () => {
          const value = swatch.querySelector('.swatch-value').textContent;
          if (value && value !== '--') {
            compInput.value = value;
            generateComplementary();
          }
        });
      }
    });
  }

  // === THEME ===

  async function loadTheme() {
    const result = await chrome.storage.local.get(['darkMode']);
    const isDark = result.darkMode ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(isDark);
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = !isDark;
    applyTheme(newTheme);
    chrome.storage.local.set({ darkMode: newTheme });
  }

  function applyTheme(isDark) {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
  }

  function updateThemeIcon(isDark) {
    themeToggle.innerHTML = isDark
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>
        </svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
        </svg>`;
  }

  // === COLORS ===

  async function loadColors() {
    const result = await chrome.storage.session.get(['currentColors']);
    if (result.currentColors) {
      currentColors = result.currentColors;
      updateDisplay();
    }
  }

  async function loadHistory() {
    const result = await chrome.storage.session.get(['colorHistory']);
    const history = result.colorHistory || [];
    renderHistory(history);
  }

  async function loadFavorites() {
    const result = await chrome.storage.local.get(['favorites']);
    favorites = result.favorites || [];
    updateFavoriteButtons();
  }

  function updateDisplay() {
    if (!currentColors) return;
    updateSwatch(primarySwatch, currentColors.primary);
    updateSwatch(baseSwatch, currentColors.base);
    updateSwatch(accentSwatch, currentColors.accent);
    updateSwatch(accent2Swatch, currentColors.accent2);
    updateFavoriteButtons();
  }

  function updateSwatch(swatch, colorData) {
    if (!colorData) return;
    const colorDiv = swatch.querySelector('.swatch-color');
    const valueSpan = swatch.querySelector('.swatch-value');
    colorDiv.style.background = colorData.hex;
    valueSpan.textContent = getFormattedValue(colorData);
  }

  function getFormattedValue(colorData) {
    switch (currentFormat) {
      case 'rgb': return colorData.rgb;
      case 'hsl': return colorData.hsl;
      default: return colorData.hex;
    }
  }

  function getSwatchColorData(swatch) {
    if (!currentColors) return null;
    const role = swatch.dataset.role;
    return currentColors[role];
  }

  // === HISTORY ===

  function renderHistory(history) {
    if (history.length === 0) {
      historyList.innerHTML = '<p class="empty-state">No colors picked yet</p>';
      return;
    }

    historyList.innerHTML = history.slice(0, 3).map((color, index) => `
      <div class="swatch history-swatch" 
           data-hex="${color.hex}"
           data-rgb="${color.rgb}"
           data-hsl="${color.hsl}"
           data-index="${index}">
        <div class="swatch-color" style="background: ${color.hex}"></div>
        <div class="swatch-info">
          <span class="swatch-value">${getFormattedHistoryValue(color)}</span>
        </div>
        <button class="icon-btn history-fav-btn" title="Add to favorites">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
        <button class="icon-btn history-copy-btn" title="Copy">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
          </svg>
        </button>
        <button class="icon-btn history-delete-btn" title="Remove from history">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join('');

    // Set up event listeners for history items
    historyList.querySelectorAll('.history-swatch').forEach(swatch => {
      const colorData = {
        hex: swatch.dataset.hex,
        rgb: swatch.dataset.rgb,
        hsl: swatch.dataset.hsl
      };
      const index = parseInt(swatch.dataset.index);

      // Copy button
      swatch.querySelector('.history-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const value = getFormattedHistoryValue(colorData);
        copyToClipboard(value, swatch);
      });

      // Favorite button
      swatch.querySelector('.history-fav-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        addToFavorites(colorData);
      });

      // Delete button
      swatch.querySelector('.history-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const result = await chrome.storage.session.get(['colorHistory']);
        let historyData = result.colorHistory || [];
        historyData.splice(index, 1);
        await chrome.storage.session.set({ colorHistory: historyData });
        renderHistory(historyData);
        showToast('Removed from history');
      });

      // Click on swatch color to auto-fill Complementary generator
      swatch.querySelector('.swatch-color').addEventListener('click', () => {
        compInput.value = colorData.hex;
        generateComplementary();
      });
    });

    updateHistoryFavoriteButtons();
  }

  function getFormattedHistoryValue(colorData) {
    switch (currentFormat) {
      case 'rgb': return colorData.rgb;
      case 'hsl': return colorData.hsl;
      default: return colorData.hex;
    }
  }

  function updateHistoryFavoriteButtons() {
    historyList.querySelectorAll('.history-fav-btn').forEach(btn => {
      const swatch = btn.closest('.history-swatch');
      if (swatch && favorites.some(f => f.hex === swatch.dataset.hex)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function updateHistoryDisplay() {
    // Reload history with new format
    loadHistory();
  }

  // === FAVORITES ===

  function addToFavorites(colorData) {
    // Check if already in favorites
    if (favorites.some(f => f.hex === colorData.hex)) {
      showToast('Already in favorites', colorData.hex);
      return;
    }

    // Check limit
    if (favorites.length >= MAX_FAVORITES) {
      showToast(`Max ${MAX_FAVORITES} favorites! Delete one first.`, '#ff4444');
      return;
    }

    favorites.push({
      hex: colorData.hex,
      rgb: colorData.rgb,
      hsl: colorData.hsl,
      timestamp: Date.now()
    });

    chrome.storage.local.set({ favorites });
    showToast('Added to favorites (' + favorites.length + '/' + MAX_FAVORITES + ')', colorData.hex);
    updateFavoriteButtons();
  }

  function toggleFavorite(colorData, btn) {
    const index = favorites.findIndex(f => f.hex === colorData.hex);

    if (index > -1) {
      favorites.splice(index, 1);
      btn.classList.remove('active');
      showToast('Removed from favorites', colorData.hex);
    } else {
      // Check limit
      if (favorites.length >= MAX_FAVORITES) {
        showToast(`Max ${MAX_FAVORITES} favorites! Delete one first.`, '#ff4444');
        return;
      }

      favorites.push({
        hex: colorData.hex,
        rgb: colorData.rgb,
        hsl: colorData.hsl,
        timestamp: Date.now()
      });
      btn.classList.add('active');
      showToast('Added to favorites (' + favorites.length + '/' + MAX_FAVORITES + ')', colorData.hex);
    }

    chrome.storage.local.set({ favorites });
  }

  // === COMPLEMENTARY GENERATOR ===

  function generateComplementary() {
    const input = compInput.value.trim();
    if (!input) return;

    const rgb = parseToRgb(input);
    if (!rgb) {
      showToast('Invalid color format', '#ff0000');
      return;
    }

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const baseHex = hslToHex(hsl.h, hsl.s, hsl.l);

    // Update base color preview
    const baseColorDiv = compBaseSwatch.querySelector('.swatch-color');
    const baseValueSpan = compBaseSwatch.querySelector('.swatch-value');
    baseColorDiv.style.background = baseHex;
    baseValueSpan.textContent = formatCompColor(rgb, hsl);

    // Update trio swatches
    compResults.forEach(res => {
      const newHue = (hsl.h + res.shift) % 360;
      const newHex = hslToHex(newHue, hsl.s, hsl.l);
      const newRgb = parseToRgb(newHex);
      const newHsl = { h: newHue, s: hsl.s, l: hsl.l };
      
      const colorDiv = res.el.querySelector('.swatch-color');
      const valueSpan = res.el.querySelector('.swatch-value');
      
      colorDiv.style.background = newHex;
      valueSpan.textContent = formatCompColor(newRgb, newHsl);
    });

    showToast('Trio generated');
  }

  function formatCompColor(rgb, hsl) {
    switch (currentFormat) {
      case 'rgb':
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      case 'hsl':
        return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
      default:
        return hslToHex(hsl.h, hsl.s, hsl.l);
    }
  }

  function fillCompInput(hexValue) {
    if (hexValue && hexValue !== '--') {
      compInput.value = hexValue;
      generateComplementary();
    }
  }

  // === COLOR UTILITIES ===

  function parseToRgb(str) {
    // Hex
    if (str.startsWith('#')) {
      const hex = str.length === 4 
        ? '#' + str[1] + str[1] + str[2] + str[2] + str[3] + str[3]
        : str;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
    }
    // RGB
    const rgbMatch = str.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (rgbMatch) {
      return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
    }
    // HSL
    const hslMatch = str.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]);
      const s = parseInt(hslMatch[2]);
      const l = parseInt(hslMatch[3]);
      const hex = hslToHex(h, s, l);
      return parseToRgb(hex);
    }
    return null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
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
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    const toHex = x => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
      const swatch = btn.closest('.swatch');
      const colorData = getSwatchColorData(swatch);
      if (colorData && favorites.some(f => f.hex === colorData.hex)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // === CLIPBOARD ===

  function copyToClipboard(text, element) {
    navigator.clipboard.writeText(text).then(() => {
      // Visual feedback
      if (element.classList.contains('copy-btn')) {
        element.classList.add('copied');
        setTimeout(() => element.classList.remove('copied'), 1000);
      } else if (element.classList.contains('history-item')) {
        element.style.transform = 'scale(1.2)';
        element.style.boxShadow = '0 0 0 3px var(--cc-cyan)';
        setTimeout(() => {
          element.style.transform = '';
          element.style.boxShadow = '';
        }, 300);
      }
      showToast(`Copied: ${text}`, text.startsWith('#') ? text : null);
    });
  }

  function showToast(message, color) {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast';

    if (color && color.startsWith('#')) {
      toast.innerHTML = `<div class="toast-swatch" style="background: ${color}"></div>${message}`;
    } else {
      toast.textContent = message;
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // === STORAGE LISTENER ===

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'session') {
      if (changes.currentColors) {
        currentColors = changes.currentColors.newValue;
        updateDisplay();
      }
      if (changes.colorHistory) {
        renderHistory(changes.colorHistory.newValue);
      }
    }
    if (namespace === 'local') {
      if (changes.favorites) {
        favorites = changes.favorites.newValue || [];
        updateFavoriteButtons();
      }
    }
  });

  // === MANUAL TRIGGER ===

  async function triggerMode(mode) {
    try {
      // Send message to background script to handle everything
      // Background will capture screenshot and inject content script
      chrome.runtime.sendMessage({
        action: 'startPickerFromPopup',
        mode: mode
      });

      // Close popup immediately
      window.close();

    } catch (error) {
      console.error('ColorCheck trigger error:', error);
      showToast('Error starting picker', '#ff0000');
    }
  }
});
