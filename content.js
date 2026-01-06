// ColorCheck Content Script
// TRUE PIXEL EYEDROPPER - Reads actual screen pixels, not CSS values

(function () {
    // Prevent multiple injections
    if (window.__colorCheckInstalled) return;
    window.__colorCheckInstalled = true;

    let mode = null;
    let screenshot = null;
    let screenshotImg = null;
    let canvas = null;
    let ctx = null;
    let overlay = null;
    let magnifier = null;
    let magnifierCtx = null;
    let colorPreview = null;
    let isActive = false;
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

    // === SCREENSHOT HANDLING ===

    function loadScreenshot(dataUrl) {
        return new Promise((resolve, reject) => {
            screenshotImg = new Image();
            screenshotImg.onload = () => {
                // Create canvas matching screenshot dimensions
                canvas = document.createElement('canvas');
                canvas.width = screenshotImg.width;
                canvas.height = screenshotImg.height;
                ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(screenshotImg, 0, 0);
                resolve();
            };
            screenshotImg.onerror = reject;
            screenshotImg.src = dataUrl;
        });
    }

    // === GET PIXEL COLOR FROM SCREENSHOT ===

    function getPixelColor(clientX, clientY) {
        if (!ctx || !screenshotImg) return { r: 0, g: 0, b: 0 };

        // Convert client coordinates to screenshot coordinates
        // Account for device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        const x = Math.round(clientX * dpr);
        const y = Math.round(clientY * dpr);

        // Clamp to image bounds
        const clampedX = Math.max(0, Math.min(x, canvas.width - 1));
        const clampedY = Math.max(0, Math.min(y, canvas.height - 1));

        try {
            const pixel = ctx.getImageData(clampedX, clampedY, 1, 1).data;
            return { r: pixel[0], g: pixel[1], b: pixel[2] };
        } catch (e) {
            console.error('getImageData error:', e);
            return { r: 0, g: 0, b: 0 };
        }
    }

    // === CREATE UI ELEMENTS ===

    function createOverlay() {
        // Main overlay - captures all mouse events
        overlay = document.createElement('div');
        overlay.id = 'colorcheck-overlay';
        overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483646;
      cursor: none;
      background: transparent;
    `;

        // Magnifier canvas - shows zoomed view
        magnifier = document.createElement('canvas');
        magnifier.id = 'colorcheck-magnifier';
        magnifier.width = 140;
        magnifier.height = 140;
        magnifier.style.cssText = `
      position: fixed;
      width: 140px;
      height: 140px;
      border: 3px solid #fff;
      border-radius: 50%;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(0,0,0,0.2);
      pointer-events: none;
      z-index: 2147483647;
      image-rendering: pixelated;
      display: none;
    `;
        magnifierCtx = magnifier.getContext('2d');

        // Color preview tooltip
        colorPreview = document.createElement('div');
        colorPreview.id = 'colorcheck-preview';
        colorPreview.style.cssText = `
      position: fixed;
      padding: 8px 12px;
      background: #1a1a1a;
      color: #fff;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 13px;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 2147483647;
      display: none;
      white-space: nowrap;
    `;

        // Crosshair in center of magnifier
        const crosshair = document.createElement('div');
        crosshair.id = 'colorcheck-crosshair';
        crosshair.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 2147483647;
      transform: translate(-50%, -50%);
      display: none;
    `;
        crosshair.innerHTML = `
      <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#fff;box-shadow:0 0 1px rgba(0,0,0,0.5);"></div>
      <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:#fff;box-shadow:0 0 1px rgba(0,0,0,0.5);"></div>
    `;

        document.body.appendChild(overlay);
        document.body.appendChild(magnifier);
        document.body.appendChild(colorPreview);
        document.body.appendChild(crosshair);

        return { overlay, magnifier, colorPreview, crosshair };
    }

    function createSelectionRect() {
        selectionRect = document.createElement('div');
        selectionRect.id = 'colorcheck-selection';
        selectionRect.style.cssText = `
      position: fixed;
      border: 2px dashed #00D4FF;
      background: rgba(0, 212, 255, 0.1);
      pointer-events: none;
      z-index: 2147483647;
    `;
        document.body.appendChild(selectionRect);
    }

    // === UPDATE MAGNIFIER ===

    function updateMagnifier(clientX, clientY) {
        if (!magnifier || !ctx || !screenshotImg) return;

        const dpr = window.devicePixelRatio || 1;
        const sourceX = Math.round(clientX * dpr);
        const sourceY = Math.round(clientY * dpr);

        // Zoom level (how many source pixels per magnifier pixel)
        const zoom = 8;
        const captureSize = magnifier.width / zoom;

        // Clear and draw zoomed region
        magnifierCtx.imageSmoothingEnabled = false;

        // Fill with checker pattern for transparency
        magnifierCtx.fillStyle = '#808080';
        magnifierCtx.fillRect(0, 0, magnifier.width, magnifier.height);

        // Calculate source region (centered on mouse)
        const srcX = sourceX - captureSize / 2;
        const srcY = sourceY - captureSize / 2;

        try {
            magnifierCtx.drawImage(
                canvas,
                srcX, srcY, captureSize, captureSize,
                0, 0, magnifier.width, magnifier.height
            );
        } catch (e) {
            console.error('Magnifier draw error:', e);
        }

        // Draw crosshair in center
        const centerX = magnifier.width / 2;
        const centerY = magnifier.height / 2;
        const cellSize = zoom;

        magnifierCtx.strokeStyle = 'rgba(255,255,255,0.8)';
        magnifierCtx.lineWidth = 1;
        magnifierCtx.strokeRect(centerX - cellSize / 2, centerY - cellSize / 2, cellSize, cellSize);

        magnifierCtx.strokeStyle = 'rgba(0,0,0,0.5)';
        magnifierCtx.lineWidth = 1;
        magnifierCtx.strokeRect(centerX - cellSize / 2 - 1, centerY - cellSize / 2 - 1, cellSize + 2, cellSize + 2);

        // Position magnifier (offset from cursor)
        const offsetX = 20;
        const offsetY = 20;
        let magX = clientX + offsetX;
        let magY = clientY + offsetY;

        // Keep in viewport
        if (magX + 150 > window.innerWidth) magX = clientX - 150 - offsetX;
        if (magY + 200 > window.innerHeight) magY = clientY - 200 - offsetY;

        magnifier.style.left = magX + 'px';
        magnifier.style.top = magY + 'px';
        magnifier.style.display = 'block';
    }

    // === UPDATE COLOR PREVIEW ===

    function updateColorPreview(clientX, clientY, color) {
        if (!colorPreview) return;

        const hex = rgbToHex(color.r, color.g, color.b);
        const hsl = rgbToHsl(color.r, color.g, color.b);

        colorPreview.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:24px;height:24px;background:${hex};border-radius:4px;border:1px solid rgba(255,255,255,0.2);"></div>
        <div>
          <div style="font-weight:600;letter-spacing:0.5px;">${hex}</div>
          <div style="font-size:11px;opacity:0.7;">rgb(${color.r}, ${color.g}, ${color.b})</div>
        </div>
      </div>
    `;

        // Position below magnifier
        const magRect = magnifier.getBoundingClientRect();
        colorPreview.style.left = magRect.left + 'px';
        colorPreview.style.top = (magRect.bottom + 8) + 'px';
        colorPreview.style.display = 'block';

        // Update crosshair
        const crosshair = document.getElementById('colorcheck-crosshair');
        if (crosshair) {
            crosshair.style.left = clientX + 'px';
            crosshair.style.top = clientY + 'px';
            crosshair.style.display = 'block';
            crosshair.style.borderColor = getBrightness(color) > 128 ? '#000' : '#fff';
        }
    }

    function getBrightness(color) {
        return (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
    }

    // === EYEDROPPER MODE HANDLERS ===

    function handleMouseMove(e) {
        if (!isActive) return;

        const color = getPixelColor(e.clientX, e.clientY);
        updateMagnifier(e.clientX, e.clientY);
        updateColorPreview(e.clientX, e.clientY, color);
    }

    function handleClick(e) {
        if (!isActive || mode !== 'eyedropper') return;

        e.preventDefault();
        e.stopPropagation();

        const color = getPixelColor(e.clientX, e.clientY);
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

        cleanup();
    }

    // === PALETTE MODE HANDLERS ===

    function handlePaletteMouseDown(e) {
        if (!isActive || mode !== 'palette') return;

        isDrawing = true;
        startX = e.clientX;
        startY = e.clientY;
        createSelectionRect();
        selectionRect.style.left = startX + 'px';
        selectionRect.style.top = startY + 'px';
        selectionRect.style.width = '0px';
        selectionRect.style.height = '0px';

        // Hide magnifier during selection
        if (magnifier) magnifier.style.display = 'none';
        if (colorPreview) colorPreview.style.display = 'none';
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
            cleanup();
            return;
        }

        // Analyze region from screenshot
        const colors = analyzeRegion(left, top, width, height);

        // Send colors to background
        chrome.runtime.sendMessage({
            action: 'storeColors',
            colors: colors
        });

        showToast(`Palette extracted: ${colors.primary.hex}`, colors.primary.hex);
        cleanup();
    }

    function analyzeRegion(left, top, width, height) {
        const dpr = window.devicePixelRatio || 1;
        const colorMap = new Map();
        const step = Math.max(3, Math.floor(Math.min(width, height) / 30));

        for (let x = left; x < left + width; x += step) {
            for (let y = top; y < top + height; y += step) {
                const color = getPixelColor(x, y);

                // Quantize to reduce color space
                const binR = Math.floor(color.r / 32) * 32;
                const binG = Math.floor(color.g / 32) * 32;
                const binB = Math.floor(color.b / 32) * 32;
                const key = `${binR},${binG},${binB}`;

                if (!colorMap.has(key)) {
                    colorMap.set(key, { count: 0, r: color.r, g: color.g, b: color.b });
                }
                const entry = colorMap.get(key);
                entry.count++;
                entry.r = Math.round((entry.r + color.r) / 2);
                entry.g = Math.round((entry.g + color.g) / 2);
                entry.b = Math.round((entry.b + color.b) / 2);
            }
        }

        const sorted = [...colorMap.values()].sort((a, b) => b.count - a.count);

        const primary = sorted[0] || { r: 100, g: 100, b: 100 };
        const primaryHsl = rgbToHsl(primary.r, primary.g, primary.b);

        const baseHsl = { h: primaryHsl.h, s: 10, l: 85 };
        const baseRgb = hslToRgb(baseHsl.h, baseHsl.s, baseHsl.l);

        const accentHsl = { h: (primaryHsl.h + 180) % 360, s: Math.min(80, primaryHsl.s + 20), l: Math.min(60, primaryHsl.l) };
        const accentRgb = hslToRgb(accentHsl.h, accentHsl.s, accentHsl.l);

        // Accent 2: Triadic color (120 degrees from primary)
        const accent2Hsl = { h: (primaryHsl.h + 120) % 360, s: Math.min(70, primaryHsl.s + 10), l: Math.min(55, primaryHsl.l + 5) };
        const accent2Rgb = hslToRgb(accent2Hsl.h, accent2Hsl.s, accent2Hsl.l);

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
            },
            accent2: {
                hex: rgbToHex(accent2Rgb.r, accent2Rgb.g, accent2Rgb.b),
                rgb: `rgb(${accent2Rgb.r}, ${accent2Rgb.g}, ${accent2Rgb.b})`,
                hsl: `hsl(${accent2Hsl.h}, ${accent2Hsl.s}%, ${accent2Hsl.l}%)`
            }
        };
    }

    // === TOAST NOTIFICATION ===

    function showToast(message, color) {
        const toast = document.createElement('div');
        toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a1a;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      font-size: 14px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      animation: ccToastIn 0.2s ease;
    `;

        const style = document.createElement('style');
        style.textContent = `
      @keyframes ccToastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `;
        document.head.appendChild(style);

        if (color) {
            const swatch = document.createElement('div');
            swatch.style.cssText = `
        width: 20px;
        height: 20px;
        border-radius: 4px;
        background: ${color};
        border: 1px solid rgba(255,255,255,0.2);
      `;
            toast.appendChild(swatch);
        }

        toast.appendChild(document.createTextNode(message));
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.2s';
            setTimeout(() => toast.remove(), 200);
        }, 2000);
    }

    // === CLEANUP ===

    function cleanup() {
        isActive = false;
        isDrawing = false;

        // Remove all overlays
        ['colorcheck-overlay', 'colorcheck-magnifier', 'colorcheck-preview', 'colorcheck-crosshair', 'colorcheck-selection'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        // Remove event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('mousedown', handlePaletteMouseDown);
        document.removeEventListener('mousemove', handlePaletteMouseMove);
        document.removeEventListener('mouseup', handlePaletteMouseUp);
        document.removeEventListener('keydown', handleKeyDown);

        // Clear references
        overlay = null;
        magnifier = null;
        colorPreview = null;
        selectionRect = null;
        canvas = null;
        ctx = null;
        screenshotImg = null;
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            cleanup();
        }
    }

    // === MAIN ACTIVATION ===

    async function activate(pickerMode, screenshotUrl) {
        // Cleanup any existing picker
        cleanup();

        mode = pickerMode;
        screenshot = screenshotUrl;

        try {
            // Load screenshot into canvas
            await loadScreenshot(screenshotUrl);

            // Create UI
            createOverlay();

            isActive = true;

            // Setup event listeners based on mode
            if (mode === 'eyedropper') {
                overlay.style.cursor = 'none';
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('click', handleClick, true);
            } else if (mode === 'palette') {
                overlay.style.cursor = 'crosshair';
                document.addEventListener('mousedown', handlePaletteMouseDown);
                document.addEventListener('mousemove', handlePaletteMouseMove);
                document.addEventListener('mouseup', handlePaletteMouseUp);
            }

            document.addEventListener('keydown', handleKeyDown);

        } catch (error) {
            console.error('ColorCheck activation error:', error);
            showToast('Failed to start eyedropper', '#ff0000');
            cleanup();
        }
    }

    // === MESSAGE LISTENER ===

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startPicker') {
            activate(message.mode, message.screenshot);
            sendResponse({ success: true });
        }
        return true;
    });

})();
