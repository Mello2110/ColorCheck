// ColorCheck Options Page Script v3.0
// Manages settings, OKLCH formatting, favorites gallery, CSS/JSON export, and history

document.addEventListener('DOMContentLoaded', () => {
    const COFFEE_URL = 'https://buymeacoffee.com/mellowsolutions';
    const LANDING_URL = 'https://mello2110.github.io/LandingpageMellowSolutions/';
    const MAX_FAVORITES = 50;

    const themeToggle = document.getElementById('themeToggle');
    const chromeShortcuts = document.getElementById('chromeShortcuts');
    const operaShortcuts = document.getElementById('operaShortcuts');
    const favoritesGrid = document.getElementById('favoritesGrid');
    const historyList = document.getElementById('historyList');
    const exportBtn = document.getElementById('exportFavorites');
    const exportCssBtn = document.getElementById('exportCssBtn');
    const clearFavoritesBtn = document.getElementById('clearFavorites');
    const clearHistoryBtn = document.getElementById('clearHistory');
    const formatOptions = document.querySelectorAll('input[name="format"]');
    const coffeeBtn = document.getElementById('coffeeBtn');
    const landingBtn = document.getElementById('landingBtn');

    let currentFormat = 'hex';

    // OKLCH helper for legacy saved colors
    function srgbToLinear(x) {
        const v = x / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }

    function hexToOklchString(hex) {
        if (!hex || !hex.startsWith('#') || hex.length < 7) return hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
        const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
        const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
        const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
        const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
        const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        const b_ = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        const C = Math.sqrt(a * a + b_ * b_);
        let h = (Math.atan2(b_, a) * 180) / Math.PI;
        if (h < 0) h += 360;
        return `oklch(${Math.round(L * 100)}% ${C.toFixed(3)} ${Math.round(C < 0.002 ? 0 : h)})`;
    }

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
        const keys = shortcut.split('+').map(key => key.trim());
        return keys.map(key => `<kbd>${key}</kbd>`).join(' + ');
    }

    function setupEventListeners() {
        themeToggle.addEventListener('click', toggleTheme);

        chromeShortcuts.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
        });

        operaShortcuts.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'opera://extensions/shortcuts' });
        });

        exportBtn.addEventListener('click', exportFavoritesJson);
        if (exportCssBtn) exportCssBtn.addEventListener('click', exportFavoritesCss);

        clearFavoritesBtn.addEventListener('click', async () => {
            if (confirm('Clear all favorites?')) {
                await chrome.storage.local.set({ favorites: [] });
                loadFavorites();
                showToast('Favorites cleared');
            }
        });

        clearHistoryBtn.addEventListener('click', async () => {
            if (confirm('Clear color history?')) {
                await chrome.storage.session.set({ colorHistory: [] });
                loadHistory();
                showToast('History cleared');
            }
        });

        formatOptions.forEach(option => {
            option.addEventListener('change', async () => {
                currentFormat = option.value;
                await chrome.storage.local.set({ defaultFormat: currentFormat });
                loadFavorites();
                loadHistory();
                showToast(`Default format: ${currentFormat.toUpperCase()}`);
            });
        });

        coffeeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: COFFEE_URL });
        });

        landingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: LANDING_URL });
        });

        const brandLogoLink = document.getElementById('brandLogoLink');
        if (brandLogoLink) {
            brandLogoLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: LANDING_URL });
            });
        }
    }

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
        themeToggle.innerHTML = isDark
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>
        </svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
        </svg>`;
    }

    async function loadFormat() {
        const result = await chrome.storage.local.get(['defaultFormat']);
        currentFormat = result.defaultFormat || 'hex';
        formatOptions.forEach(option => {
            option.checked = option.value === currentFormat;
        });
    }

    async function loadFavorites() {
        const result = await chrome.storage.local.get(['favorites']);
        renderFavorites(result.favorites || []);
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

            item.addEventListener('click', () => {
                const value = getFormattedValue(favorites[index]);
                copyToClipboard(value, favorites[index].hex);
            });
        });
    }

    function exportFavoritesJson() {
        chrome.storage.local.get(['favorites'], (result) => {
            const favorites = result.favorites || [];
            if (favorites.length === 0) {
                showToast('No favorites to export');
                return;
            }

            const exportData = favorites.map(c => ({
                hex: c.hex,
                rgb: c.rgb,
                hsl: c.hsl,
                oklch: c.oklch || hexToOklchString(c.hex)
            }));

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'colorcheck-favorites.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast(`Exported ${favorites.length} colors (JSON)`);
        });
    }

    function exportFavoritesCss() {
        chrome.storage.local.get(['favorites'], (result) => {
            const favorites = result.favorites || [];
            if (favorites.length === 0) {
                showToast('No favorites to export');
                return;
            }

            const lines = [':root {'];
            favorites.forEach((c, idx) => {
                lines.push(`  --cc-color-${idx + 1}: ${getFormattedValue(c)}; /* ${c.hex} */`);
            });
            lines.push('}');

            const blob = new Blob([lines.join('\n')], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'colorcheck-tokens.css';
            a.click();
            URL.revokeObjectURL(url);
            showToast(`Exported ${favorites.length} CSS tokens`);
        });
    }

    async function loadHistory() {
        const result = await chrome.storage.session.get(['colorHistory']);
        renderHistory(result.colorHistory || []);
    }

    function renderHistory(history) {
        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No colors in history. Use Ctrl+Shift+E to pick colors.</p>';
            return;
        }

        historyList.innerHTML = history.slice(0, 12).map((color, index) => `
      <div class="favorite-item history-item" data-index="${index}" data-hex="${color.hex}" data-rgb="${color.rgb}" data-hsl="${color.hsl}" data-oklch="${color.oklch || ''}">
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

        historyList.querySelectorAll('.history-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            const colorData = {
                hex: item.dataset.hex,
                rgb: item.dataset.rgb,
                hsl: item.dataset.hsl,
                oklch: item.dataset.oklch || hexToOklchString(item.dataset.hex)
            };

            item.querySelector('.copy-hist').addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(getFormattedValue(colorData), colorData.hex);
            });

            item.querySelector('.add-to-fav').addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await chrome.storage.local.get(['favorites']);
                const favorites = result.favorites || [];

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
                const historyData = result.colorHistory || [];
                historyData.splice(index, 1);
                await chrome.storage.session.set({ colorHistory: historyData });
                renderHistory(historyData);
                showToast('Removed from history');
            });

            item.addEventListener('click', () => {
                copyToClipboard(getFormattedValue(colorData), colorData.hex);
            });
        });
    }

    function getFormattedValue(colorData) {
        switch (currentFormat) {
            case 'rgb': return colorData.rgb;
            case 'hsl': return colorData.hsl;
            case 'oklch': return colorData.oklch || hexToOklchString(colorData.hex);
            default: return colorData.hex;
        }
    }

    function copyToClipboard(text, hexColor) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied: ${text}`, hexColor);
        });
    }

    function showToast(message, color) {
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

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.favorites) {
            loadFavorites();
        }
        if (namespace === 'session' && changes.colorHistory) {
            loadHistory();
        }
    });
});
