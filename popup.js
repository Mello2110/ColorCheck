/*
 * Copyright 2026 Mellow Solutions
 * Licensed under the Apache License, Version 2.0
 *
 * ColorCheck v2.3.0 Studio Popup Script
 * Perceptual OKLCH Engine, WCAG Auto-Fixer, CVD Daltonization & Tailwind/CSS Export
 */

document.addEventListener('DOMContentLoaded', () => {
  const COFFEE_URL = 'https://buymeacoffee.com/mellowsolutions';
  const LANDING_URL = 'https://mello2110.github.io/LandingpageMellowSolutions/';
  const FORMATS = ['hex', 'rgb', 'hsl', 'oklch'];
  const MAX_FAVORITES = 50;

  let currentFormat = 'hex';
  let currentColors = null;
  let currentMode = 'palette';
  let currentHarmony = 'split';
  let currentCvd = 'normal';
  let favorites = [];

  // DOM Elements
  const primarySwatch = document.getElementById('primarySwatch');
  const baseSwatch = document.getElementById('baseSwatch');
  const accentSwatch = document.getElementById('accentSwatch');
  const accent2Swatch = document.getElementById('accent2Swatch');
  const barBase = document.getElementById('barBase');
  const barPrimary = document.getElementById('barPrimary');
  const barAccent1 = document.getElementById('barAccent1');
  const barAccent2 = document.getElementById('barAccent2');
  const cvdStatusBadge = document.getElementById('cvdStatusBadge');
  const cvdPills = document.querySelectorAll('.cvd-pill');

  const historyList = document.getElementById('historyList');
  const themeToggle = document.getElementById('themeToggle');
  const formatCycleBtn = document.getElementById('formatCycleBtn');
  const settingsBtn = document.getElementById('openSettings');
  const coffeeBtn = document.getElementById('coffeeBtn');
  const startEyedropperBtn = document.getElementById('startEyedropper');
  const startPaletteBtn = document.getElementById('startPalette');
  const copyPaletteCssBtn = document.getElementById('copyPaletteCss');
  const copyPaletteTwBtn = document.getElementById('copyPaletteTw');

  // Mode Toggle
  const modePaletteBtn = document.getElementById('modePalette');
  const modeAccentBtn = document.getElementById('modeAccent');

  // Harmony Studio Elements
  const compInput = document.getElementById('compInput');
  const compColorPicker = document.getElementById('compColorPicker');
  const compDotPreview = document.getElementById('compDotPreview');
  const generateCompBtn = document.getElementById('generateComp');
  const harmonyTabs = document.querySelectorAll('.harmony-tab');
  const compSwatches = [
    document.getElementById('compBase'),
    document.getElementById('compTrue'),
    document.getElementById('compSplit1'),
    document.getElementById('compSplit2')
  ];

  // =========================================================================
  // 1. PERCEPTUAL COLOR SCIENCE (sRGB <-> Linear <-> OKLab <-> OKLCH & CVD)
  // =========================================================================

  function srgbToLinear(x) {
    const v = x / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(x) {
    const clamped = Math.max(0, Math.min(1, x));
    const v = clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(v * 255);
  }

  function rgbToOklab(r, g, b) {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);

    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    };
  }

  function deltaEOklab(lab1, lab2) {
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + 1.35 * (da * da + db * db));
  }

  function oklabToLinearRgb(L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    return {
      r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    };
  }

  function isInGamut(lr, lg, lb) {
    const eps = -0.0005;
    const max = 1.0005;
    return lr >= eps && lr <= max && lg >= eps && lg <= max && lb >= eps && lb <= max;
  }

  // Gamut-mapped OKLCH -> sRGB
  function oklchToRgb(L, C, h) {
    const clampedL = Math.max(0, Math.min(1, L));
    if (clampedL <= 0.001) return { r: 0, g: 0, b: 0 };
    if (clampedL >= 0.999) return { r: 255, g: 255, b: 255 };

    const rad = (((h % 360) + 360) % 360) * (Math.PI / 180);
    const cosH = Math.cos(rad);
    const sinH = Math.sin(rad);

    let low = 0;
    let high = C;
    let bestLin = oklabToLinearRgb(clampedL, C * cosH, C * sinH);

    if (!isInGamut(bestLin.r, bestLin.g, bestLin.b)) {
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) * 0.5;
        const lin = oklabToLinearRgb(clampedL, mid * cosH, mid * sinH);
        if (isInGamut(lin.r, lin.g, lin.b)) {
          low = mid;
          bestLin = lin;
        } else {
          high = mid;
        }
      }
    }

    return {
      r: linearToSrgb(bestLin.r),
      g: linearToSrgb(bestLin.g),
      b: linearToSrgb(bestLin.b)
    };
  }

  function rgbToOklch(r, g, b) {
    const lab = rgbToOklab(r, g, b);
    const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { L: lab.L, C, h: C < 0.002 ? 0 : h };
  }

  // Linear sRGB Color Vision Deficiency (CVD) Simulation (Viénot 1999 / Machado 2009)
  function simulateCVD(rgb, mode) {
    if (!rgb || mode === 'normal') return rgb;
    const lr = srgbToLinear(rgb.r);
    const lg = srgbToLinear(rgb.g);
    const lb = srgbToLinear(rgb.b);

    let sr = lr, sg = lg, sb = lb;
    if (mode === 'protan') {
      sr = 0.152286 * lr + 1.052583 * lg - 0.204868 * lb;
      sg = 0.114503 * lr + 0.786281 * lg + 0.099216 * lb;
      sb = -0.003882 * lr - 0.048116 * lg + 1.051998 * lb;
    } else if (mode === 'deutan') {
      sr = 0.367322 * lr + 0.860646 * lg - 0.227968 * lb;
      sg = 0.280085 * lr + 0.672501 * lg + 0.047413 * lb;
      sb = -0.011820 * lr + 0.042940 * lg + 0.968881 * lb;
    } else if (mode === 'tritan') {
      sr = 1.255528 * lr - 0.076749 * lg - 0.178779 * lb;
      sg = -0.078411 * lr + 0.930809 * lg + 0.147602 * lb;
      sb = 0.004733 * lr + 0.691367 * lg + 0.303900 * lb;
    } else if (mode === 'mono') {
      const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      sr = sg = sb = y;
    }

    return {
      r: linearToSrgb(sr),
      g: linearToSrgb(sg),
      b: linearToSrgb(sb)
    };
  }

  function getRelativeLuminance(r, g, b) {
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  }

  function getContrastRatio(rgb1, rgb2) {
    const lum1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
    return (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
  }

  // Perceptual OKLCH Auto-Fixer: adjusts L while preserving h and C to meet target WCAG contrast
  function fixContrastInOklch(colorRgb, baseRgb, targetRatio = 4.55) {
    const lch = rgbToOklch(colorRgb.r, colorRgb.g, colorRgb.b);
    const baseLum = getRelativeLuminance(baseRgb.r, baseRgb.g, baseRgb.b);

    // Try both lighter and darker directions in OKLCH L and pick the closer shift that passes
    const searchDirection = (goLighter) => {
      let low = goLighter ? lch.L : 0.0;
      let high = goLighter ? 1.0 : lch.L;
      let bestRgb = null;
      let bestL = lch.L;

      for (let i = 0; i < 16; i++) {
        const mid = (low + high) * 0.5;
        const candRgb = oklchToRgb(mid, lch.C, lch.h);
        const ratio = getContrastRatio(candRgb, baseRgb);
        if (ratio >= targetRatio) {
          bestRgb = candRgb;
          bestL = mid;
          if (goLighter) {
            high = mid; // try to stay as close to original L as possible
          } else {
            low = mid;
          }
        } else {
          if (goLighter) {
            low = mid;
          } else {
            high = mid;
          }
        }
      }
      return bestRgb ? { rgb: bestRgb, dL: Math.abs(bestL - lch.L) } : null;
    };

    const lighter = searchDirection(true);
    const darker = searchDirection(false);

    if (lighter && darker) {
      return lighter.dL <= darker.dL ? lighter.rgb : darker.rgb;
    }
    if (lighter) return lighter.rgb;
    if (darker) return darker.rgb;

    // Fallback to pure white or black if target ratio is extreme
    return baseLum > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
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
    return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  }

  function buildFullColorData(rgb, extra = {}) {
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const lch = rgbToOklch(rgb.r, rgb.g, rgb.b);
    return {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      hex,
      rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      oklch: `oklch(${Math.round(lch.L * 100)}% ${lch.C.toFixed(3)} ${Math.round(lch.h)})`,
      ...extra
    };
  }

  function parseToRgb(str) {
    if (!str) return null;
    const clean = str.trim();

    if (clean.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(clean) || /^[0-9a-fA-F]{3}$/.test(clean)) {
      const raw = clean.startsWith('#') ? clean : '#' + clean;
      const hex = raw.length === 4
        ? '#' + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3]
        : raw;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
    }

    const rgbMatch = clean.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (rgbMatch) {
      return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
    }

    const hslMatch = clean.match(/hsl\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%?\s*,\s*(\d+(?:\.\d+)?)%?\s*\)/i);
    if (hslMatch) {
      const hex = hslToHex(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]));
      return parseToRgb(hex);
    }

    const oklchMatch = clean.match(/oklch\s*\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/i);
    if (oklchMatch) {
      let L = parseFloat(oklchMatch[1]);
      if (oklchMatch[2] === '%' || L > 1) L /= 100;
      const C = parseFloat(oklchMatch[3]);
      const h = parseFloat(oklchMatch[4]);
      return oklchToRgb(L, C, h);
    }

    return null;
  }

  function getFormattedValue(colorData) {
    if (!colorData) return '--';
    const rgb = (colorData.r !== undefined) ? colorData : parseToRgb(colorData.hex);
    const enriched = rgb ? { ...buildFullColorData(rgb), ...colorData } : colorData;

    switch (currentFormat) {
      case 'rgb': return enriched.rgb;
      case 'hsl': return enriched.hsl;
      case 'oklch': return enriched.oklch || buildFullColorData(rgb).oklch;
      default: return enriched.hex;
    }
  }

  // =========================================================================
  // 2. INITIALIZATION & EVENT LISTENERS
  // =========================================================================

  init();

  async function init() {
    await loadTheme();
    await loadMode();
    await loadFormat();
    await loadFavorites();
    await loadColors();
    await loadHistory();
    setupEventListeners();

    const seedHex = (currentColors && currentColors.primary && currentColors.primary.hex)
      ? currentColors.primary.hex
      : '#00D4FF';
    compInput.value = seedHex;
    compColorPicker.value = seedHex;
    compDotPreview.style.background = seedHex;
    generateHarmony(false);
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

  async function loadFormat() {
    const result = await chrome.storage.local.get(['defaultFormat']);
    currentFormat = result.defaultFormat || 'hex';
    if (formatCycleBtn) formatCycleBtn.textContent = currentFormat.toUpperCase();
  }

  async function cycleFormat() {
    const idx = FORMATS.indexOf(currentFormat);
    currentFormat = FORMATS[(idx + 1) % FORMATS.length];
    if (formatCycleBtn) formatCycleBtn.textContent = currentFormat.toUpperCase();
    await chrome.storage.local.set({ defaultFormat: currentFormat });

    updateDisplay();
    loadHistory();
    generateHarmony(false);
    showToast(`Format: ${currentFormat.toUpperCase()}`);
  }

  function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);
    if (formatCycleBtn) formatCycleBtn.addEventListener('click', cycleFormat);

    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    coffeeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: COFFEE_URL });
    });

    const brandLink = document.getElementById('brandLinkPopup');
    if (brandLink) {
      brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: LANDING_URL });
      });
    }

    startEyedropperBtn.addEventListener('click', () => triggerMode('eyedropper'));
    startPaletteBtn.addEventListener('click', () => triggerMode(currentMode));

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

    // CVD Vision Simulator Pills
    cvdPills.forEach(pill => {
      pill.addEventListener('click', () => {
        cvdPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentCvd = pill.dataset.cvd;
        updateDisplay();
      });
    });

    // Copy Palette as CSS Custom Properties
    if (copyPaletteCssBtn) {
      copyPaletteCssBtn.addEventListener('click', () => {
        if (!currentColors || !currentColors.primary) {
          showToast('Extract a palette first');
          return;
        }
        const cssVars = [
          ':root {',
          `  --color-base: ${getFormattedValue(currentColors.base)};`,
          `  --color-primary: ${getFormattedValue(currentColors.primary)};`,
          `  --color-accent-1: ${getFormattedValue(currentColors.accent)};`,
          `  --color-accent-2: ${getFormattedValue(currentColors.accent2)};`,
          '}'
        ].join('\n');
        navigator.clipboard.writeText(cssVars).then(() => {
          showToast('Copied :root CSS variables', currentColors.primary.hex);
        });
      });
    }

    // Copy Palette & Tonal Scale as Tailwind Config
    if (copyPaletteTwBtn) {
      copyPaletteTwBtn.addEventListener('click', () => {
        if (!currentColors || !currentColors.primary) {
          showToast('Extract a palette first');
          return;
        }
        const primRgb = parseToRgb(currentColors.primary.hex);
        const lch = rgbToOklch(primRgb.r, primRgb.g, primRgb.b);
        const cPeak = Math.max(0.03, lch.C);
        const steps = [
          { k: '50', L: 0.97, cMul: 0.15 },
          { k: '100', L: 0.93, cMul: 0.28 },
          { k: '200', L: 0.86, cMul: 0.50 },
          { k: '300', L: 0.78, cMul: 0.72 },
          { k: '400', L: 0.68, cMul: 0.90 },
          { k: '500', L: 0.58, cMul: 1.00 },
          { k: '600', L: 0.49, cMul: 0.95 },
          { k: '700', L: 0.40, cMul: 0.82 },
          { k: '800', L: 0.31, cMul: 0.68 },
          { k: '900', L: 0.23, cMul: 0.52 },
          { k: '950', L: 0.15, cMul: 0.40 }
        ];

        const scaleObj = { DEFAULT: getFormattedValue(currentColors.primary) };
        steps.forEach(st => {
          const rgb = oklchToRgb(st.L, cPeak * st.cMul, lch.h);
          scaleObj[st.k] = getFormattedValue(buildFullColorData(rgb));
        });

        const twConfig = {
          colors: {
            base: getFormattedValue(currentColors.base),
            primary: scaleObj,
            accent: {
              1: getFormattedValue(currentColors.accent),
              2: getFormattedValue(currentColors.accent2)
            }
          }
        };

        navigator.clipboard.writeText(JSON.stringify(twConfig, null, 2)).then(() => {
          showToast('Copied Tailwind config + 50-950 scale', currentColors.primary.hex);
        });
      });
    }

    // Swatch Copy Buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const swatch = btn.closest('.swatch');
        const value = swatch.querySelector('.swatch-value').textContent;
        const colorData = getSwatchColorData(swatch);
        if (value && value !== '--') {
          copyToClipboard(value, btn, colorData ? colorData.hex : null);
        }
      });
    });

    // Clear Palette
    const clearPaletteBtn = document.getElementById('clearPalette');
    if (clearPaletteBtn) {
      clearPaletteBtn.addEventListener('click', async () => {
        await chrome.storage.session.remove('currentColors');
        currentColors = null;

        [primarySwatch, baseSwatch, accentSwatch, accent2Swatch].forEach(swatch => {
          if (swatch) {
            swatch.querySelector('.swatch-color').style.background = '';
            swatch.querySelector('.swatch-value').textContent = '--';
            const badges = swatch.querySelector('.swatch-badges');
            if (badges) badges.innerHTML = '';
          }
        });
        [barBase, barPrimary, barAccent1, barAccent2].forEach(seg => {
          if (seg) seg.style.background = '';
        });
        if (cvdStatusBadge) {
          cvdStatusBadge.textContent = '';
          cvdStatusBadge.className = 'cvd-status-badge';
        }

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

    // Favorite buttons on Palette
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

    // Harmony Mode Tabs
    harmonyTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        harmonyTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentHarmony = tab.dataset.harmony;
        generateHarmony(false);
      });
    });

    // Harmony Color Picker & Input
    compColorPicker.addEventListener('input', (e) => {
      const hex = e.target.value.toUpperCase();
      compDotPreview.style.background = hex;
      compInput.value = hex;
      generateHarmony(false);
    });

    generateCompBtn.addEventListener('click', () => generateHarmony(true));
    compInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') generateHarmony(true);
    });

    // Copy for Harmony swatches
    compSwatches.forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.comp-fav-btn')) return;
        const value = el.querySelector('.swatch-value').textContent;
        const hex = el.dataset.hex;
        if (value && value !== '--') {
          copyToClipboard(value, el, hex);
        }
      });
    });

    // Favorites for Harmony swatches
    document.querySelectorAll('.comp-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const swatch = btn.closest('.comp-swatch');
        const hex = swatch.dataset.hex;
        if (hex) {
          const rgb = parseToRgb(hex);
          if (rgb) {
            addToFavorites(buildFullColorData(rgb));
          }
        }
      });
    });

    // Click Palette swatch to load into Harmony Studio (or click contrast badge to Auto-Fix AA/AAA)
    [primarySwatch, baseSwatch, accentSwatch, accent2Swatch].forEach(swatch => {
      if (swatch) {
        swatch.addEventListener('click', async (e) => {
          const fixBadge = e.target.closest('.badge-contrast.fixable');
          if (fixBadge) {
            e.stopPropagation();
            const role = swatch.dataset.role;
            await handleAutoFixContrast(role);
            return;
          }

          if (e.target.closest('.icon-btn')) return;
          const colorData = getSwatchColorData(swatch);
          if (colorData && colorData.hex) {
            compInput.value = getFormattedValue(colorData);
            compColorPicker.value = colorData.hex;
            compDotPreview.style.background = colorData.hex;
            generateHarmony(true);
          }
        });
      }
    });
  }

  // =========================================================================
  // 3. THEME MANAGEMENT
  // =========================================================================

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
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>
        </svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
        </svg>`;
  }

  // =========================================================================
  // 4. PALETTE DISPLAY, CVD CHECK & INTERACTIVE CONTRAST AUTO-FIXER
  // =========================================================================

  async function loadColors() {
    const result = await chrome.storage.session.get(['currentColors']);
    if (result.currentColors) {
      currentColors = result.currentColors;
      updateDisplay();
    }
  }

  async function loadHistory() {
    const result = await chrome.storage.session.get(['colorHistory']);
    renderHistory(result.colorHistory || []);
  }

  async function loadFavorites() {
    const result = await chrome.storage.local.get(['favorites']);
    favorites = result.favorites || [];
    updateFavoriteButtons();
  }

  async function handleAutoFixContrast(role) {
    if (!currentColors || !currentColors[role] || !currentColors.base || role === 'base') return;
    const roleColor = currentColors[role];
    const roleRgb = parseToRgb(roleColor.hex);
    const baseRgb = parseToRgb(currentColors.base.hex);
    if (!roleRgb || !baseRgb) return;

    const currentRatio = getContrastRatio(roleRgb, baseRgb);
    const targetRatio = currentRatio < 4.5 ? 4.55 : 7.05;
    const targetLabel = currentRatio < 4.5 ? 'AA' : 'AAA';

    const fixedRgb = fixContrastInOklch(roleRgb, baseRgb, targetRatio);
    const updatedColor = buildFullColorData(fixedRgb, {
      synthesized: roleColor.synthesized,
      roleLabel: roleColor.roleLabel
    });

    currentColors[role] = updatedColor;
    await chrome.storage.session.set({ currentColors });
    updateDisplay();

    const formatted = getFormattedValue(updatedColor);
    navigator.clipboard.writeText(formatted).catch(() => {});
    showToast(`Fixed to WCAG ${targetLabel} (${formatted})`, updatedColor.hex);
  }

  function evaluateCvdSafety() {
    if (!cvdStatusBadge || !currentColors || !currentColors.primary || !currentColors.base) return;

    const roles = [
      { name: 'Primary', rgb: parseToRgb(currentColors.primary.hex) },
      { name: 'Base', rgb: parseToRgb(currentColors.base.hex) },
      { name: 'Accent 1', rgb: parseToRgb(currentColors.accent.hex) },
      { name: 'Accent 2', rgb: parseToRgb(currentColors.accent2.hex) }
    ].filter(r => r.rgb);

    const modesToCheck = currentCvd === 'normal' ? ['protan', 'deutan', 'tritan'] : [currentCvd];
    let worstConflict = null;

    for (const m of modesToCheck) {
      const simLabs = roles.map(r => {
        const sim = simulateCVD(r.rgb, m);
        return { name: r.name, lab: rgbToOklab(sim.r, sim.g, sim.b) };
      });

      for (let i = 0; i < simLabs.length; i++) {
        for (let j = i + 1; j < simLabs.length; j++) {
          const dE = deltaEOklab(simLabs[i].lab, simLabs[j].lab);
          if (dE < 0.062) {
            worstConflict = `${simLabs[i].name} ≈ ${simLabs[j].name} (${m})`;
            break;
          }
        }
        if (worstConflict) break;
      }
      if (worstConflict) break;
    }

    if (worstConflict) {
      cvdStatusBadge.textContent = '⚠ CVD Conflict';
      cvdStatusBadge.className = 'cvd-status-badge cvd-warn';
      cvdStatusBadge.title = `Indistinguishable under color blindness: ${worstConflict}`;
    } else {
      cvdStatusBadge.textContent = '✓ CVD Safe';
      cvdStatusBadge.className = 'cvd-status-badge cvd-pass';
      cvdStatusBadge.title = 'All 4 palette colors remain perceptually distinct under Protan, Deutan & Tritan vision';
    }
  }

  function getDisplayHexForCvd(hex) {
    if (currentCvd === 'normal' || !hex) return hex;
    const rgb = parseToRgb(hex);
    if (!rgb) return hex;
    const sim = simulateCVD(rgb, currentCvd);
    return rgbToHex(sim.r, sim.g, sim.b);
  }

  function updateDisplay() {
    if (!currentColors) return;

    const baseRgb = parseToRgb(currentColors.base ? currentColors.base.hex : null);

    updateSwatch(primarySwatch, currentColors.primary, baseRgb, false);
    updateSwatch(baseSwatch, currentColors.base, baseRgb, true);
    updateSwatch(accentSwatch, currentColors.accent, baseRgb, false);
    updateSwatch(accent2Swatch, currentColors.accent2, baseRgb, false);

    // Update 60-30-10 Live Preview Bar (reflects CVD simulation if active)
    if (barBase && currentColors.base) barBase.style.background = getDisplayHexForCvd(currentColors.base.hex);
    if (barPrimary && currentColors.primary) barPrimary.style.background = getDisplayHexForCvd(currentColors.primary.hex);
    if (barAccent1 && currentColors.accent) barAccent1.style.background = getDisplayHexForCvd(currentColors.accent.hex);
    if (barAccent2 && currentColors.accent2) barAccent2.style.background = getDisplayHexForCvd(currentColors.accent2.hex);

    evaluateCvdSafety();
    updateFavoriteButtons();
  }

  function updateSwatch(swatch, colorData, baseRgb, isBaseRole) {
    if (!swatch || !colorData) return;
    const colorDiv = swatch.querySelector('.swatch-color');
    const valueSpan = swatch.querySelector('.swatch-value');
    const badgesEl = swatch.querySelector('.swatch-badges');

    colorDiv.style.background = getDisplayHexForCvd(colorData.hex);
    valueSpan.textContent = getFormattedValue(colorData);

    if (badgesEl) {
      const badges = [];

      if (colorData.synthesized) {
        badges.push(`<span class="badge-synth" title="Harmoniously synthesized in OKLCH">Synth</span>`);
      }

      if (!isBaseRole && baseRgb) {
        const swatchRgb = parseToRgb(colorData.hex);
        if (swatchRgb) {
          const ratio = getContrastRatio(swatchRgb, baseRgb);
          const ratioStr = ratio.toFixed(1) + ':1';
          if (ratio >= 7.0) {
            badges.push(`<span class="badge-contrast pass-aaa" title="Passes WCAG AAA (${ratioStr} vs Base)">${ratioStr} AAA</span>`);
          } else if (ratio >= 4.5) {
            badges.push(`<span class="badge-contrast pass-aa fixable" title="Passes WCAG AA (${ratioStr}). Click to auto-tune lightness to AAA (7:1)">${ratioStr} AA · ↑AAA</span>`);
          } else {
            badges.push(`<span class="badge-contrast low fixable" title="Low text contrast vs Base (${ratioStr}). Click to auto-fix to WCAG AA (4.5:1) in OKLCH">${ratioStr} · Fix AA</span>`);
          }
        }
      } else if (isBaseRole && baseRgb) {
        const lch = rgbToOklch(baseRgb.r, baseRgb.g, baseRgb.b);
        const surfaceType = lch.L > 0.55 ? 'Light' : 'Dark';
        badges.push(`<span class="badge-contrast pass-aa" title="Perceptual Lightness L=${Math.round(lch.L * 100)}%">${surfaceType} L${Math.round(lch.L * 100)}</span>`);
      }

      badgesEl.innerHTML = badges.join('');
    }
  }

  function getSwatchColorData(swatch) {
    if (!currentColors || !swatch) return null;
    const role = swatch.dataset.role;
    return currentColors[role];
  }

  // =========================================================================
  // 5. PERCEPTUAL OKLCH HARMONY GENERATOR
  // =========================================================================

  function generateHarmony(showNotification = false) {
    const input = compInput.value.trim();
    if (!input) return;

    const rgb = parseToRgb(input);
    if (!rgb) {
      if (showNotification) showToast('Invalid color format', '#EF4444');
      return;
    }

    const baseData = buildFullColorData(rgb);
    compColorPicker.value = baseData.hex;
    compDotPreview.style.background = baseData.hex;

    const lch = rgbToOklch(rgb.r, rgb.g, rgb.b);
    const effectiveC = lch.C < 0.02 && currentHarmony !== 'tonal' ? 0.14 : lch.C;
    const effectiveL = Math.max(0.25, Math.min(0.85, lch.L));

    let items = [];

    if (currentHarmony === 'split') {
      items = [
        { label: 'Base', rgb },
        { label: 'Comp 180°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h + 180) },
        { label: 'Split 150°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h + 150) },
        { label: 'Split 210°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h + 210) }
      ];
    } else if (currentHarmony === 'triad') {
      const surfaceL = lch.L > 0.5 ? 0.16 : 0.95;
      items = [
        { label: 'Base', rgb },
        { label: 'Triad 120°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h + 120) },
        { label: 'Triad 240°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h + 240) },
        { label: 'Surface', rgb: oklchToRgb(surfaceL, Math.min(0.025, lch.C * 0.25), lch.h) }
      ];
    } else if (currentHarmony === 'analog') {
      items = [
        { label: 'Base', rgb },
        { label: 'Analog -30°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h - 30) },
        { label: 'Analog +30°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h + 30) },
        { label: 'Analog +60°', rgb: oklchToRgb(effectiveL, effectiveC, lch.h + 60) }
      ];
    } else if (currentHarmony === 'tonal') {
      const cPeak = Math.max(0.04, lch.C);
      items = [
        { label: '900 Deep', rgb: oklchToRgb(0.27, cPeak * 0.75, lch.h) },
        { label: '600 Vivid', rgb: oklchToRgb(0.52, cPeak, lch.h) },
        { label: '400 Soft', rgb: oklchToRgb(0.74, cPeak * 0.82, lch.h) },
        { label: '100 Tint', rgb: oklchToRgb(0.93, cPeak * 0.28, lch.h) }
      ];
    }

    items.forEach((item, idx) => {
      const el = compSwatches[idx];
      if (!el) return;
      const cData = buildFullColorData(item.rgb);
      el.dataset.hex = cData.hex;
      el.querySelector('.swatch-color').style.background = cData.hex;
      el.querySelector('.swatch-label').textContent = item.label;
      el.querySelector('.swatch-value').textContent = getFormattedValue(cData);

      const favBtn = el.querySelector('.comp-fav-btn');
      if (favBtn) {
        favBtn.classList.toggle('active', favorites.some(f => f.hex === cData.hex));
      }
    });

    if (showNotification) {
      showToast('OKLCH Harmony updated', baseData.hex);
    }
  }

  // =========================================================================
  // 6. RECENT HISTORY & FAVORITES
  // =========================================================================

  function renderHistory(history) {
    if (!history || history.length === 0) {
      historyList.innerHTML = '<p class="empty-state">No colors picked yet</p>';
      return;
    }

    historyList.innerHTML = history.slice(0, 4).map((color, index) => {
      const val = getFormattedValue(color);
      return `
        <div class="swatch history-swatch"
             data-hex="${color.hex}"
             data-rgb="${color.rgb}"
             data-hsl="${color.hsl}"
             data-oklch="${color.oklch || ''}"
             data-index="${index}">
          <div class="swatch-color" style="background: ${color.hex}" title="Click to load into Harmony Studio"></div>
          <div class="swatch-info">
            <span class="swatch-value">${val}</span>
          </div>
          <button class="icon-btn history-fav-btn" title="Save to favorites">
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
          <button class="icon-btn history-delete-btn" title="Remove">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    historyList.querySelectorAll('.history-swatch').forEach(swatch => {
      const colorData = {
        hex: swatch.dataset.hex,
        rgb: swatch.dataset.rgb,
        hsl: swatch.dataset.hsl,
        oklch: swatch.dataset.oklch
      };
      const index = parseInt(swatch.dataset.index);

      swatch.querySelector('.history-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(getFormattedValue(colorData), swatch, colorData.hex);
      });

      swatch.querySelector('.history-fav-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(colorData, e.currentTarget);
      });

      swatch.querySelector('.history-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const result = await chrome.storage.session.get(['colorHistory']);
        const historyData = result.colorHistory || [];
        historyData.splice(index, 1);
        await chrome.storage.session.set({ colorHistory: historyData });
        renderHistory(historyData);
      });

      swatch.addEventListener('click', () => {
        compInput.value = getFormattedValue(colorData);
        compColorPicker.value = colorData.hex;
        compDotPreview.style.background = colorData.hex;
        generateHarmony(true);
      });
    });

    updateFavoriteButtons();
  }

  function addToFavorites(colorData) {
    if (favorites.some(f => f.hex === colorData.hex)) {
      showToast('Already in favorites', colorData.hex);
      return;
    }
    if (favorites.length >= MAX_FAVORITES) {
      showToast(`Max ${MAX_FAVORITES} favorites reached`, '#EF4444');
      return;
    }

    const rgb = parseToRgb(colorData.hex);
    const full = rgb ? buildFullColorData(rgb) : colorData;

    favorites.push({
      hex: full.hex,
      rgb: full.rgb,
      hsl: full.hsl,
      oklch: full.oklch,
      timestamp: Date.now()
    });

    chrome.storage.local.set({ favorites });
    showToast(`Saved (${favorites.length}/${MAX_FAVORITES})`, full.hex);
    updateFavoriteButtons();
  }

  function toggleFavorite(colorData, btn) {
    const index = favorites.findIndex(f => f.hex === colorData.hex);
    if (index > -1) {
      favorites.splice(index, 1);
      if (btn) btn.classList.remove('active');
      showToast('Removed from favorites', colorData.hex);
    } else {
      if (favorites.length >= MAX_FAVORITES) {
        showToast(`Max ${MAX_FAVORITES} favorites reached`, '#EF4444');
        return;
      }
      const rgb = parseToRgb(colorData.hex);
      const full = rgb ? buildFullColorData(rgb) : colorData;
      favorites.push({
        hex: full.hex,
        rgb: full.rgb,
        hsl: full.hsl,
        oklch: full.oklch,
        timestamp: Date.now()
      });
      if (btn) btn.classList.add('active');
      showToast(`Saved (${favorites.length}/${MAX_FAVORITES})`, full.hex);
    }
    chrome.storage.local.set({ favorites });
    updateFavoriteButtons();
  }

  function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
      const swatch = btn.closest('.swatch');
      const colorData = getSwatchColorData(swatch);
      btn.classList.toggle('active', Boolean(colorData && favorites.some(f => f.hex === colorData.hex)));
    });

    historyList.querySelectorAll('.history-fav-btn').forEach(btn => {
      const swatch = btn.closest('.history-swatch');
      btn.classList.toggle('active', Boolean(swatch && favorites.some(f => f.hex === swatch.dataset.hex)));
    });

    compSwatches.forEach(el => {
      if (!el) return;
      const favBtn = el.querySelector('.comp-fav-btn');
      if (favBtn) {
        favBtn.classList.toggle('active', Boolean(el.dataset.hex && favorites.some(f => f.hex === el.dataset.hex)));
      }
    });
  }

  function copyToClipboard(text, element, swatchHex = null) {
    navigator.clipboard.writeText(text).then(() => {
      if (element && element.classList.contains('copy-btn')) {
        element.classList.add('copied');
        setTimeout(() => element.classList.remove('copied'), 1000);
      }
      showToast(`Copied ${text}`, swatchHex || (text.startsWith('#') ? text : null));
    });
  }

  function showToast(message, color) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = 'toast';

    if (color && color.startsWith('#')) {
      toast.innerHTML = `<div class="toast-swatch" style="background: ${color}"></div><span>${message}</span>`;
    } else {
      toast.textContent = message;
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

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

  async function triggerMode(mode) {
    try {
      chrome.runtime.sendMessage({
        action: 'startPickerFromPopup',
        mode: mode
      });
      window.close();
    } catch (error) {
      console.error('ColorCheck trigger error:', error);
      showToast('Error starting picker', '#EF4444');
    }
  }
});
