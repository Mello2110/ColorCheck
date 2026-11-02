---
id: "colorcheck"
title: "ColorCheck"
tagline: "Perceptual OKLCH eyedropper, 60-30-10 palette extractor, and WCAG contrast studio for web designers."
category: "extension"
status: "production"
featured: false
badge: "Chrome Extension"
problemStatement: "Digital designers and front-end developers struggle to sample true on-screen colors due to browser color-space clipping and non-uniform legacy RGB models. Extracting harmonious, accessible palettes from complex interfaces requires tedious manual calculations across multiple external tools. Furthermore, verifying WCAG contrast compliance and color vision deficiency legibility disrupts active design workflows."
technicalSolution: "ColorCheck integrates an in-browser perceptual color science engine based on OKLab/OKLCH with native DeltaE distance calculations directly into a Manifest V3 extension. It pairs a high-precision canvas loupe eyedropper with a 60-30-10 dominant color clustering pipeline, real-time Daltonization preview filters, and multi-format CSS/Tailwind code generators."
techStack:
  - "JavaScript (ES2022)"
  - "Chrome Extension Manifest V3"
  - "OKLab / OKLCH Color Engine"
  - "HTML5 Canvas API"
  - "Chrome Storage API"
  - "CSS3 Custom Properties"
architectureHighlights:
  - "Native OKLab & OKLCH perceptual engine with DeltaEOK distance calculation and gamuts"
  - "Manifest V3 background service worker with zero-latency tab communication via Scripting API"
  - "Client-side Daltonization matrix transformations for Protan, Deutan, Tritan, and Mono previews"
  - "Proportional 60-30-10 palette clustering with instant CSS Variables & Tailwind configuration export"
links:
  chromeWebStore: ""
  demoUrl: ""
  githubUrl: "https://github.com/Mello2110/ColorCheck"
sandbox:
  enabled: false
  type: "none"
  embedUrl: ""
  notes: ""
stats:
  version: "v2.3.0"
---

# ColorCheck

[![Status](https://img.shields.io/badge/Status-Active-emerald?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](#)
[![Version](https://img.shields.io/badge/Version-v2.3.0-purple?style=flat-square)](#)

> Perceptual OKLCH eyedropper, 60-30-10 palette extractor, and WCAG contrast studio for web designers.

<!-- QUICK ACCESS / CALL TO ACTION -->
<p align="left">
  <a href="https://github.com/Mello2110/ColorCheck"><b>📦 GitHub Repository</b></a> &nbsp;|&nbsp;
  <a href="https://github.com/Mello2110"><b>🌐 Mellow Solutions Hub</b></a>
</p>

---

## 📌 Problem & Motivation

Modern UI/UX design and front-end engineering demand precise color management, yet everyday developer tooling continues to suffer from key shortcomings:

1. **Perceptual Non-Uniformity:** Traditional color spaces like sRGB and HSL do not reflect human vision. Two colors with identical 50% lightness in HSL (e.g. pure yellow vs. pure blue) exhibit vastly different perceived brightness, skewing contrast calculations and visual balance.
2. **Cumbersome Palette Creation:** Translating an inspiring UI screenshot or photograph into a production-ready color system usually requires manual guesswork. Standard eyedroppers only sample individual isolated pixels, ignoring compositional hierarchy like the standard 60-30-10 UI rule.
3. **Accessibility Workflow Friction:** Verifying WCAG 2.1 contrast ratios (AAA / AA) and validating legibility for Color Vision Deficiency (CVD, such as protanopia or deuteranopia) typically forces developers into disjointed external browser tabs, disrupting focused development loops.
4. **Export Overhead:** Hand-coding CSS custom properties and complex Tailwind theme palettes from sampled colors is repetitive and prone to manual formatting errors.

---

## ⚡ The Solution

**ColorCheck** is an all-in-one browser extension built on Chrome Manifest V3 that introduces true perceptual color science into the browser:

- **Perceptual OKLab / OKLCH Engine:** All conversions, harmonies, and tonal variations are calculated in the perceptual OKLab/OKLCH color space with native DeltaE distance calculations, guaranteeing uniform perceived brightness and saturation across the entire spectrum.
- **Precision Eyedropper & HUD:** An interactive subpixel loupe captures on-screen colors with live magnification, crosshairs, format cycling (HEX, RGB, HSL, OKLCH), and instant WCAG contrast badges against dark and light backgrounds.
- **60-30-10 & Saliency Palette Clustering:** Users can drag a selection box across any webpage region to extract a structured 4-color palette adhering to the 60% Base / 30% Primary / 10% Accent UI design principle or isolate vivid salient accent tones.
- **Instant Daltonization & Accessibility Checks:** Built-in matrix-based simulations for Protanopia, Deuteranopia, Tritanopia, and Achromatopsia let creators instantly verify palette distinguishability.
- **Developer-Centric Code Generators:** Export sampled colors, harmonies, and complete tonal ramps directly into CSS `:root` variables or ready-to-use Tailwind CSS configuration blocks with a single click.

---

## 🚀 Key Features

- **🎯 Perceptual Eyedropper with Live HUD:** Sample any pixel on active browser tabs with a high-definition zoom loupe, subpixel coordinate tracking, and real-time contrast indicators.
- **🎨 Structured 60-30-10 UI Palette Extraction:** Automatically classifies sampled image areas into Base (60%), Primary (30%), Accent 1, and Accent 2 for cohesive UI composition.
- **✨ Vivid Saliency Mode:** Alternative extraction algorithm focusing specifically on distinct, vibrant accent hues across the selected screen area.
- **👁️ Color Vision Deficiency (CVD) Simulation:** Daltonization preview toggles between Normal, Protanopia (red-blind), Deuteranopia (green-blind), Tritanopia (blue-blind), and Achromatopsia (monochrome).
- **🌈 OKLCH Harmony Studio:** Generate Split-Complementary, Triadic, Analogous, and Perceptual Tonal step scales directly in the OKLCH color space.
- **📋 Single-Click CSS & Tailwind Export:** Generate formatted CSS Custom Properties (`:root`) and full Tailwind CSS theme config objects with automatic OKLCH lightness tinting.
- **⭐ Local Favorites & History Management:** Save, manage, tag, and export color sets in JSON or CSS format backed by Chrome's local storage.
- **⌨️ Customizable Global Hotkeys:** Default shortcuts (`Ctrl+Shift+E` / `Cmd+Shift+E` for Eyedropper, `Ctrl+Shift+P` / `Cmd+Shift+P` for Region Extractor) for seamless workflow integration.
- **🔒 Zero Tracking & Full Privacy:** 100% client-side execution with zero external network requests, zero telemetry, and complete offline functionality.

---

## 🛠️ Architecture & Tech Stack

- **Languages & Frameworks:** Vanilla JavaScript (ES2022+), HTML5 Canvas 2D API, CSS3 with modern CSS Custom Properties.
- **Extension Platform:** Chrome Extension Manifest V3 running a background service worker (`background.js`), interactive popup (`popup.html`/`popup.js`), option settings page (`options.html`/`options.js`), and injected content script (`content.js`).
- **Color Engine:** Custom mathematical implementation of:
  - Gamma-corrected sRGB $\leftrightarrow$ Linear RGB conversions
  - Linear RGB $\leftrightarrow$ OKLab $\leftrightarrow$ OKLCH cylindrical transformations
  - $\Delta E_{\text{OK}}$ perceptual distance metric for accurate cluster quantization
  - WCAG 2.1 relative luminance and contrast compliance calculations
- **Daltonization Engine:** Client-side 3x3 color-blindness projection matrices (Brettel & Vienot model) applied in real-time.
- **State & Storage:** `chrome.storage.local` for asynchronous persistence of user favorites, recent pick history, theme settings, and preferred default formats.

---

## 📦 Installation & Usage

### Manual Installation (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Mello2110/ColorCheck.git
   ```
2. Open your Chromium-based browser (Google Chrome, Microsoft Edge, Brave, Opera).
3. Navigate to the extensions manager:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
4. Enable **Developer Mode** using the toggle switch in the top-right corner.
5. Click **Load unpacked** in the top-left corner.
6. Select the `ColorCheck` folder. The extension icon will now appear in your browser toolbar.

### Workflow & Shortcuts

- **Pick Single Color:** Click the extension icon and select **Pick Color**, or press `Ctrl+Shift+E` (`⌘+Shift+E` on macOS). Hover over any element and click to copy.
- **Extract Palette:** Select **Extract Region** or press `Ctrl+Shift+P` (`⌘+Shift+P` on macOS), then click and drag a rectangular bounding box across any webpage element or image.
- **Generate Harmonies:** Click any palette swatch or enter a custom hex/rgb/oklch code in the Harmony Studio to inspect Split-Complementary, Triadic, or Tonal variations.
- **Simulate CVD:** Click on the **Vision** pill bar in the popup to simulate Protan, Deutan, Tritan, or Monochromatic vision across the active palette.
- **Export Tokens:** Click **CSS** or **TW** in the Extracted Palette header to copy clean production-ready design tokens to your clipboard.

---

## 📄 License & Disclaimer

Part of the **Mellow Solutions** portfolio. Provided under the Apache License 2.0 as-is for non-commercial and personal utility. See [LICENSE](LICENSE) for details.
