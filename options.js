// ColorCheck Options Page Script
// Manages settings, favorites gallery, and history

document.addEventListener('DOMContentLoaded', () => {
    // External Links - REPLACE WITH YOUR URLS
    const COFFEE_URL = 'https://buymeacoffee.com/YOUR_USERNAME';
    const LANDING_URL = 'https://your-landing-page.com';

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
        setupEventListeners();
    }

    function setupEventListeners() {
        // Theme toggle
        themeToggle.addEventListener('click', toggleTheme);

        // Chrome shortcuts link - copy URL to clipboard
        chromeShortcuts.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText('chrome://extensions/shortcuts').then(() => {
                showToast('URL copied! Paste in address bar');
            });
        });

        // Opera shortcuts link - copy URL to clipboard
        operaShortcuts.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText('opera://extensions/shortcuts').then(() => {
                showToast('URL copied! Paste in address bar');
            });
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
            historyList.innerHTML = '<p class="empty-state">No colors in history. Use Alt+C or Alt+P to pick colors.</p>';
            return;
        }

        historyList.innerHTML = history.slice(0, 10).map(color => `
      <div class="history-row" data-hex="${color.hex}" data-rgb="${color.rgb}" data-hsl="${color.hsl}">
        <div class="history-color" style="background: ${color.hex}"></div>
        <div class="history-values">
          <span>${color.hex}</span>
          <span>${color.rgb}</span>
          <span>${color.hsl}</span>
        </div>
      </div>
    `).join('');

        // Click to copy
        historyList.querySelectorAll('.history-row').forEach(row => {
            row.addEventListener('click', () => {
                const value = row.dataset[currentFormat];
                copyToClipboard(value, row.dataset.hex);
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
