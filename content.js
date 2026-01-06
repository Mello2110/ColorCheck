// ColorCheck Content Script
// Eyedropper and Palette extraction logic

(function () {
    // Prevent multiple injections
    if (window.__colorCheckActive) return;
    window.__colorCheckActive = true;

    let mode = null;
    let overlay = null;
    let canvas = null;
    let ctx = null;
    let isDrawing = false;
    let startX = 0, startY = 0;
    let selectionRect = null;

    // === COLOR UTILITIES ===

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
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
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    // === OVERLAY MANAGEMENT ===

    function createOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'colorcheck-overlay';
        overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      cursor: crosshair;
      background: transparent;
    `;
        document.body.appendChild(overlay);

        // Create hidden canvas for pixel capture
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    function removeOverlay() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
        if (selectionRect) {
            selectionRect.remove();
            selectionRect = null;
        }
        mode = null;
        window.__colorCheckActive = false;
    }

    function showToast(message, color) {
        const toast = document.createElement('div');
        toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a1a;
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      font-size: 14px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;

        const swatch = document.createElement('div');
        swatch.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: ${color};
      border: 1px solid rgba(255,255,255,0.2);
    `;

        toast.appendChild(swatch);
        toast.appendChild(document.createTextNode(message));
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 2000);
    }

    // === SCREEN CAPTURE ===

    async function captureScreen() {
        return new Promise((resolve) => {
            // Use html2canvas-like approach: render page to canvas
            const width = window.innerWidth;
            const height = window.innerHeight;

            canvas.width = width;
            canvas.height = height;

            // Capture visible content using DOM snapshot
            const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">
              ${document.documentElement.outerHTML}
            </div>
          </foreignObject>
        </svg>
      `;

            // Fallback: Just get computed background colors
            resolve(true);
        });
    }

    function getColorAtPoint(x, y) {
        const element = document.elementFromPoint(x, y);
        if (!element) return { r: 0, g: 0, b: 0 };

        const style = window.getComputedStyle(element);
        let bgColor = style.backgroundColor;

        // Parse rgba/rgb
        const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
        }

        // Fallback to white
        return { r: 255, g: 255, b: 255 };
    }

    // === EYEDROPPER MODE ===

    function handleEyedropperClick(e) {
        const color = getColorAtPoint(e.clientX, e.clientY);
        const hex = rgbToHex(color.r, color.g, color.b);
        const hsl = rgbToHsl(color.r, color.g, color.b);

        // Copy to clipboard
        navigator.clipboard.writeText(hex).then(() => {
            showToast(`Copied: ${hex}`, hex);

            // Store in history
            chrome.runtime.sendMessage({
                action: 'addToHistory',
                color: {
                    hex,
                    rgb: `rgb(${color.r}, ${color.g}, ${color.b})`,
                    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
                }
            });
        });

        removeOverlay();
    }

    // === PALETTE MODE ===

    function createSelectionRect() {
        selectionRect = document.createElement('div');
        selectionRect.style.cssText = `
      position: fixed;
      border: 2px dashed #fff;
      background: rgba(255, 255, 255, 0.1);
      pointer-events: none;
      z-index: 2147483647;
    `;
        document.body.appendChild(selectionRect);
    }

    function handlePaletteMouseDown(e) {
        isDrawing = true;
        startX = e.clientX;
        startY = e.clientY;
        createSelectionRect();
        selectionRect.style.left = startX + 'px';
        selectionRect.style.top = startY + 'px';
        selectionRect.style.width = '0px';
        selectionRect.style.height = '0px';
    }

    function handlePaletteMouseMove(e) {
        if (!isDrawing || !selectionRect) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        selectionRect.style.left = left + 'px';
        selectionRect.style.top = top + 'px';
        selectionRect.style.width = width + 'px';
        selectionRect.style.height = height + 'px';
    }

    function handlePaletteMouseUp(e) {
        if (!isDrawing) return;
        isDrawing = false;

        const endX = e.clientX;
        const endY = e.clientY;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        if (width < 10 || height < 10) {
            removeOverlay();
            return;
        }

        // Analyze region
        const colors = analyzeRegion(left, top, width, height);

        // Send colors to background for popup
        chrome.runtime.sendMessage({
            action: 'storeColors',
            colors: colors
        });

        showToast(`Palette extracted: ${colors.primary.hex}`, colors.primary.hex);
        removeOverlay();
    }

    function analyzeRegion(left, top, width, height) {
        // Collect colors from elements in region using histogram
        const colorMap = new Map();
        const step = Math.max(5, Math.floor(Math.min(width, height) / 20)); // Sample grid

        for (let x = left; x < left + width; x += step) {
            for (let y = top; y < top + height; y += step) {
                const color = getColorAtPoint(x, y);
                // Quantize to 12-bin histogram (reduce color space)
                const binR = Math.floor(color.r / 64) * 64;
                const binG = Math.floor(color.g / 64) * 64;
                const binB = Math.floor(color.b / 64) * 64;
                const key = `${binR},${binG},${binB}`;

                if (!colorMap.has(key)) {
                    colorMap.set(key, { count: 0, r: color.r, g: color.g, b: color.b });
                }
                const entry = colorMap.get(key);
                entry.count++;
                // Average the actual colors
                entry.r = Math.round((entry.r + color.r) / 2);
                entry.g = Math.round((entry.g + color.g) / 2);
                entry.b = Math.round((entry.b + color.b) / 2);
            }
        }

        // Sort by frequency
        const sorted = [...colorMap.values()].sort((a, b) => b.count - a.count);

        // Get primary (most frequent)
        const primary = sorted[0] || { r: 100, g: 100, b: 100 };
        const primaryHsl = rgbToHsl(primary.r, primary.g, primary.b);

        // Generate BASE: desaturated, high lightness (L=80%, S=10%)
        const baseHsl = { h: primaryHsl.h, s: 10, l: 80 };
        const baseRgb = hslToRgb(baseHsl.h, baseHsl.s, baseHsl.l);

        // Generate ACCENT: complementary (hue + 180°)
        const accentHsl = { h: (primaryHsl.h + 180) % 360, s: primaryHsl.s, l: primaryHsl.l };
        const accentRgb = hslToRgb(accentHsl.h, accentHsl.s, accentHsl.l);

        return {
            primary: {
                hex: rgbToHex(primary.r, primary.g, primary.b),
                rgb: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
                hsl: `hsl(${primaryHsl.h}, ${primaryHsl.s}%, ${primaryHsl.l}%)`
            },
            base: {
                hex: rgbToHex(baseRgb.r, baseRgb.g, baseRgb.b),
                rgb: `rgb(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b})`,
                hsl: `hsl(${baseHsl.h}, ${baseHsl.s}%, ${baseHsl.l}%)`
            },
            accent: {
                hex: rgbToHex(accentRgb.r, accentRgb.g, accentRgb.b),
                rgb: `rgb(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b})`,
                hsl: `hsl(${accentHsl.h}, ${accentHsl.s}%, ${accentHsl.l}%)`
            }
        };
    }

    // === EVENT HANDLERS ===

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            removeOverlay();
        }
    }

    function setupEventListeners() {
        if (!overlay) return;

        document.addEventListener('keydown', handleKeyDown);

        if (mode === 'eyedropper') {
            overlay.addEventListener('click', handleEyedropperClick);
        } else if (mode === 'palette') {
            overlay.addEventListener('mousedown', handlePaletteMouseDown);
            overlay.addEventListener('mousemove', handlePaletteMouseMove);
            overlay.addEventListener('mouseup', handlePaletteMouseUp);
        }
    }

    // === MESSAGE LISTENER ===

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'activate') {
            if (overlay) removeOverlay(); // Clean up any existing overlay

            mode = message.mode;
            window.__colorCheckActive = true;
            createOverlay();
            setupEventListeners();
            sendResponse({ success: true });
        }
        return true;
    });
})();
