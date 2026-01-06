// ColorCheck Options Page Script
// Manages settings, favorites gallery, and history

document.addEventListener('DOMContentLoaded', () => {
    // External Links
    const COFFEE_URL = 'https://buymeacoffee.com/mellowsolutions';
    const LANDING_URL = 'https://mello2110.github.io/LandingpageMellowSolutions/';
    const MAX_FAVORITES = 50;

    // DOM Elements
    const themeToggle = document.getElementById('themeToggle');
    const chromeShortcuts = document.getElementById('chromeShortcuts');
    const operaShortcuts = document.getElementById('operaShortcuts');
    const favoritesGrid = document.getElementById('favoritesGrid');
    const historyList = document.getElementById('historyList');
    const exportBtn = document.getElementById('exportFavorites');
    const clearFavoritesBtn = document.getElementById('clearFavorites');
    const clearHistoryBtn = document.getElementById('clearHistory');
    const formatOptions = document.querySelectorAll('input[name="format"]');
    const coffeeBtn = document.getElementById('coffeeBtn');
    const landingBtn = document.getElementById('landingBtn');

    let currentFormat = 'hex';

    // Initialize
    init();

    async function init() {
        await loadTheme();
        await loadFormat();
        await loadFavorites();
        await loadHistory();
        await loadShortcuts();
        setupEventListeners();
    }

    async function loadShortcuts() {
        try {
            const commands = await chrome.commands.getAll();
            const eyedropperEl = document.getElementById('eyedropperShortcut');
            const paletteEl = document.getElementById('paletteShortcut');

            commands.forEach(cmd => {
                if (cmd.name === 'toggle-eyedropper' && eyedropperEl) {
                    eyedropperEl.innerHTML = formatShortcut(cmd.shortcut);
                }
                if (cmd.name === 'toggle-palette' && paletteEl) {
                    paletteEl.innerHTML = formatShortcut(cmd.shortcut);
                }
            });
        } catch (e) {
            console.error('Failed to load shortcuts:', e);
        }
    }

    function formatShortcut(shortcut) {
        if (!shortcut) {
            return '<span class="shortcut-not-set">Not set</span>';
        }
        // Split by + and wrap each key in kbd
        const keys = shortcut.split('+').map(key => key.trim());
        return keys.map(key => `<kbd>${key}</kbd>`).join(' + ');
    }

    function setupEventListeners() {
        // Theme toggle
        themeToggle.addEventListener('click', toggleTheme);

        // Chrome shortcuts link - open in new tab
        chromeShortcuts.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        });

        // Opera shortcuts link - open in new tab
        operaShortcuts.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'opera://extensions/shortcuts' });
        });

        // Export favorites
        exportBtn.addEventListener('click', exportFavorites);

        // Clear favorites
        clearFavoritesBtn.addEventListener('click', async () => {
            if (confirm('Clear all favorites?')) {
                await chrome.storage.local.set({ favorites: [] });
                loadFavorites();
                showToast('Favorites cleared');
            }
        });

        // Clear history
        clearHistoryBtn.addEventListener('click', async () => {
            if (confirm('Clear color history?')) {
                await chrome.storage.session.set({ colorHistory: [] });
                loadHistory();
                showToast('History cleared');
            }
        });

        // Format change
        formatOptions.forEach(option => {
            option.addEventListener('change', async () => {
                currentFormat = option.value;
                await chrome.storage.local.set({ defaultFormat: currentFormat });
                loadFavorites();
                loadHistory();
                showToast(`Default format: ${currentFormat.toUpperCase()}`);
            });
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

        // Brand logo link
        const brandLogoLink = document.getElementById('brandLogoLink');
        if (brandLogoLink) {
            brandLogoLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: LANDING_URL });
            });
        }
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
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>
        </svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
        </svg>`;
    }

    // === FORMAT ===

    async function loadFormat() {
        const result = await chrome.storage.local.get(['defaultFormat']);
        currentFormat = result.defaultFormat || 'hex';

        formatOptions.forEach(option => {
            option.checked = option.value === currentFormat;
        });
    }

    // === FAVORITES ===

    async function loadFavorites() {
        const result = await chrome.storage.local.get(['favorites']);
        const favorites = result.favorites || [];
        renderFavorites(favorites);
    }

    function renderFavorites(favorites) {
        if (favorites.length === 0) {
            favoritesGrid.innerHTML = '<p class="empty-state">No favorites saved yet. Click the ★ icon on any color to add it.</p>';
            return;
        }

        favoritesGrid.innerHTML = favorites.map((color, index) => `
      <div class="favorite-item" data-index="${index}">
        <div class="favorite-color" style="background: ${color.hex}"></div>
        <span class="favorite-value">${getFormattedValue(color)}</span>
        <div class="favorite-actions">
          <button class="icon-btn copy-fav" title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
            </svg>
          </button>
          <button class="icon-btn remove-fav" title="Remove">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

        // Event listeners for favorites
        favoritesGrid.querySelectorAll('.favorite-item').forEach(item => {
            const index = parseInt(item.dataset.index);

            item.querySelector('.copy-fav').addEventListener('click', (e) => {
                e.stopPropagation();
                const value = getFormattedValue(favorites[index]);
                copyToClipboard(value, favorites[index].hex);
            });

            item.querySelector('.remove-fav').addEventListener('click', async (e) => {
                e.stopPropagation();
                favorites.splice(index, 1);
                await chrome.storage.local.set({ favorites });
                loadFavorites();
                showToast('Removed from favorites');
            });

            // Click on item to copy
            item.addEventListener('click', () => {
                const value = getFormattedValue(favorites[index]);
                copyToClipboard(value, favorites[index].hex);
            });
        });
    }

    function exportFavorites() {
        chrome.storage.local.get(['favorites'], (result) => {
            const favorites = result.favorites || [];

            if (favorites.length === 0) {
                showToast('No favorites to export');
                return;
            }

            const exportData = favorites.map(c => ({
                hex: c.hex,
                rgb: c.rgb,
                hsl: c.hsl
            }));

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'colorcheck-favorites.json';
            a.click();

            URL.revokeObjectURL(url);
            showToast(`Exported ${favorites.length} colors`);
        });
    }

    // === HISTORY ===

    async function loadHistory() {
        const result = await chrome.storage.session.get(['colorHistory']);
        const history = result.colorHistory || [];
        renderHistory(history);
    }

    function renderHistory(history) {
        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No colors in history. Use Alt+PageUp to pick colors.</p>';
            return;
        }

        historyList.innerHTML = history.slice(0, 12).map((color, index) => `
      <div class="favorite-item history-item" data-index="${index}" data-hex="${color.hex}" data-rgb="${color.rgb}" data-hsl="${color.hsl}">
        <div class="favorite-color" style="background: ${color.hex}"></div>
        <span class="favorite-value">${getFormattedValue(color)}</span>
        <div class="favorite-actions">
          <button class="icon-btn add-to-fav" title="Add to favorites">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <button class="icon-btn copy-hist" title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
            </svg>
          </button>
          <button class="icon-btn remove-hist" title="Remove from history">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

        // Event listeners for history items
        historyList.querySelectorAll('.history-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            const colorData = {
                hex: item.dataset.hex,
                rgb: item.dataset.rgb,
                hsl: item.dataset.hsl
            };

            item.querySelector('.copy-hist').addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(getFormattedValue(colorData), colorData.hex);
            });

            item.querySelector('.add-to-fav').addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await chrome.storage.local.get(['favorites']);
                let favorites = result.favorites || [];

                if (favorites.some(f => f.hex === colorData.hex)) {
                    showToast('Already in favorites');
                    return;
                }

                if (favorites.length >= MAX_FAVORITES) {
                    showToast(`Max ${MAX_FAVORITES} favorites! Delete one first.`);
                    return;
                }

                favorites.push({ ...colorData, timestamp: Date.now() });
                await chrome.storage.local.set({ favorites });
                loadFavorites();
                showToast('Added to favorites (' + favorites.length + '/' + MAX_FAVORITES + ')', colorData.hex);
            });

            item.querySelector('.remove-hist').addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await chrome.storage.session.get(['colorHistory']);
                let historyData = result.colorHistory || [];
                historyData.splice(index, 1);
                await chrome.storage.session.set({ colorHistory: historyData });
                renderHistory(historyData);
                showToast('Removed from history');
            });

            // Click on item to copy
            item.addEventListener('click', () => {
                copyToClipboard(getFormattedValue(colorData), colorData.hex);
            });
        });
    }

    // === UTILITIES ===

    function getFormattedValue(colorData) {
        switch (currentFormat) {
            case 'rgb': return colorData.rgb;
            case 'hsl': return colorData.hsl;
            default: return colorData.hex;
        }
    }

    function copyToClipboard(text, hexColor) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied: ${text}`, hexColor);
        });
    }

    function showToast(message, color) {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = 'toast';

        if (color) {
            toast.innerHTML = `<div class="toast-swatch" style="background: ${color}"></div>${message}`;
        } else {
            toast.textContent = message;
        }

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    // === STORAGE LISTENER ===

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.favorites) {
            loadFavorites();
        }
        if (namespace === 'session' && changes.colorHistory) {
            loadHistory();
        }
    });
});
