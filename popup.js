// ColorCheck Popup Script
// Handles color display, format toggle, and clipboard operations

document.addEventListener('DOMContentLoaded', () => {
    let currentFormat = 'hex';
    let currentColors = null;

    const formatBtns = document.querySelectorAll('.format-btn');
    const primarySwatch = document.getElementById('primarySwatch');
    const baseSwatch = document.getElementById('baseSwatch');
    const accentSwatch = document.getElementById('accentSwatch');
    const historyList = document.getElementById('historyList');

    // Load stored colors
    loadColors();
    loadHistory();

    // Format toggle
    formatBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            formatBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFormat = btn.dataset.format;
            updateDisplay();
        });
    });

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const swatch = btn.closest('.color-swatch');
            const value = swatch.querySelector('.swatch-value').textContent;

            if (value && value !== '--') {
                copyToClipboard(value, btn);
            }
        });
    });

    function loadColors() {
        chrome.storage.session.get(['currentColors'], (result) => {
            if (result.currentColors) {
                currentColors = result.currentColors;
                updateDisplay();
            }
        });
    }

    function loadHistory() {
        chrome.storage.session.get(['colorHistory'], (result) => {
            const history = result.colorHistory || [];
            renderHistory(history);
        });
    }

    function updateDisplay() {
        if (!currentColors) return;

        updateSwatch(primarySwatch, currentColors.primary);
        updateSwatch(baseSwatch, currentColors.base);
        updateSwatch(accentSwatch, currentColors.accent);
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

    function renderHistory(history) {
        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No colors picked yet</p>';
            return;
        }

        historyList.innerHTML = history.map(color => `
      <div class="history-item" data-hex="${color.hex}" data-rgb="${color.rgb}" data-hsl="${color.hsl}">
        <div class="history-color" style="background: ${color.hex}"></div>
        <span class="history-value">${color.hex}</span>
      </div>
    `).join('');

        // Click to copy from history
        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const value = item.dataset[currentFormat];
                copyToClipboard(value, item);
            });
        });
    }

    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            // Visual feedback
            if (element.classList.contains('copy-btn')) {
                element.classList.add('copied');
                setTimeout(() => element.classList.remove('copied'), 1000);
            } else {
                const originalBg = element.style.background;
                element.style.background = '#2d4a2d';
                setTimeout(() => element.style.background = originalBg, 300);
            }
        });
    }

    // Listen for updates while popup is open
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
    });
});
