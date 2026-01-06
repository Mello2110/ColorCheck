// ColorCheck Popup Script
// Enhanced with favorites, dark mode, and 10-color history

document.addEventListener('DOMContentLoaded', () => {
  // External Links - REPLACE WITH YOUR URLS
  const COFFEE_URL = 'https://buymeacoffee.com/YOUR_USERNAME';
  const LANDING_URL = 'https://your-landing-page.com';

  let currentFormat = 'hex';
  let currentColors = null;
  let favorites = [];

  // DOM Elements
  const formatBtns = document.querySelectorAll('.format-btn');
  const primarySwatch = document.getElementById('primarySwatch');
  const baseSwatch = document.getElementById('baseSwatch');
  const accentSwatch = document.getElementById('accentSwatch');
  const historyList = document.getElementById('historyList');
  const themeToggle = document.getElementById('themeToggle');
  const settingsBtn = document.getElementById('openSettings');
  const coffeeBtn = document.getElementById('coffeeBtn');
  const landingBtn = document.getElementById('landingBtn');

  // Initialize
  init();

  async function init() {
    await loadTheme();
    await loadColors();
    await loadHistory();
    await loadFavorites();
    setupEventListeners();
  }

  function setupEventListeners() {
    // Format toggle
    formatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        formatBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFormat = btn.dataset.format;
        updateDisplay();
        updateHistoryDisplay();
      });
    });

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

    landingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: LANDING_URL });
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

    historyList.innerHTML = history.slice(0, 10).map(color => `
      <div class="history-item" 
           style="background: ${color.hex}" 
           data-hex="${color.hex}"
           data-rgb="${color.rgb}"
           data-hsl="${color.hsl}"
           title="Click to copy">
      </div>
    `).join('');

    // Click to copy
    historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const value = item.dataset[currentFormat];
        copyToClipboard(value, item);
      });
    });
  }

  function updateHistoryDisplay() {
    // Reload history with new format
    loadHistory();
  }

  // === FAVORITES ===

  function toggleFavorite(colorData, btn) {
    const index = favorites.findIndex(f => f.hex === colorData.hex);
    
    if (index > -1) {
      favorites.splice(index, 1);
      btn.classList.remove('active');
      showToast('Removed from favorites', colorData.hex);
    } else {
      favorites.push({
        hex: colorData.hex,
        rgb: colorData.rgb,
        hsl: colorData.hsl,
        timestamp: Date.now()
      });
      btn.classList.add('active');
      showToast('Added to favorites', colorData.hex);
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
});
