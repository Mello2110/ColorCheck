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

  // Initialize
  init();

  async function init() {
    await loadTheme();
    await loadFormat();
    await loadColors();
    await loadHistory();
    await loadFavorites();
    setupEventListeners();
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

    // Manual Triggers
    startEyedropperBtn.addEventListener('click', () => triggerMode('eyedropper'));
    startPaletteBtn.addEventListener('click', () => triggerMode('palette'));

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

      // Click on swatch color to copy
      swatch.querySelector('.swatch-color').addEventListener('click', () => {
        const value = getFormattedHistoryValue(colorData);
        copyToClipboard(value, swatch);
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
