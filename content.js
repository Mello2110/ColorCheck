/*
 * Copyright 2026 Mellow Solutions
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ColorCheck Content Script v2.3.0
// Perceptual Color Science Engine (OKLab / OKLCH), DOM/CSS Inspector & Precision Pixel Eyedropper

(function () {
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
    let selectionBadge = null;
    let defaultFormat = 'hex';

    // =========================================================================
    // 1. PERCEPTUAL COLOR SCIENCE ENGINE (sRGB <-> Linear <-> OKLab <-> OKLCH)
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

    // Gamut-mapped OKLCH to sRGB (preserves perceptual L and h, binary-searches C)
    function oklchToRgb(L, C, h) {
        const clampedL = Math.max(0, Math.min(1, L));
        if (clampedL <= 0.001) return { r: 0, g: 0, b: 0 };
        if (clampedL >= 0.999) return { r: 255, g: 255, b: 255 };

        const rad = (h * Math.PI) / 180;
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

    function oklabToOklch(lab) {
        const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
        let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
        if (h < 0) h += 360;
        return { L: lab.L, C: C, h: C < 0.002 ? 0 : h };
    }

    function rgbToOklch(r, g, b) {
        return oklabToOklch(rgbToOklab(r, g, b));
    }

    // Perceptual distance in OKLab (with slight chroma emphasis for UI distinction)
    function deltaEOklab(lab1, lab2) {
        const dL = lab1.L - lab2.L;
        const da = lab1.a - lab2.a;
        const db = lab1.b - lab2.b;
        return Math.sqrt(dL * dL + 1.35 * (da * da + db * db));
    }

    function circularHueDistance(h1, h2) {
        const d = Math.abs(h1 - h2) % 360;
        return d > 180 ? 360 - d : d;
    }

    // Relative Luminance & WCAG 2.1 Contrast
    function getRelativeLuminance(r, g, b) {
        return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
    }

    function getContrastRatio(rgb1, rgb2) {
        const lum1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
        const lum2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
        const brightest = Math.max(lum1, lum2);
        const darkest = Math.min(lum1, lum2);
        return (brightest + 0.05) / (darkest + 0.05);
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
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function formatColorObject(c, extra = {}) {
        const r = Math.round(c.r);
        const g = Math.round(c.g);
        const b = Math.round(c.b);
        const hex = rgbToHex(r, g, b);
        const hsl = rgbToHsl(r, g, b);
        const lch = rgbToOklch(r, g, b);
        return {
            r, g, b,
            hex,
            rgb: `rgb(${r}, ${g}, ${b})`,
            hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
            oklch: `oklch(${Math.round(lch.L * 100)}% ${lch.C.toFixed(3)} ${Math.round(lch.h)})`,
            synthesized: Boolean(extra.synthesized),
            roleLabel: extra.roleLabel || null
        };
    }

    function getFormattedColorString(colorObj, fmt) {
        switch (fmt) {
            case 'rgb': return colorObj.rgb;
            case 'hsl': return colorObj.hsl;
            case 'oklch': return colorObj.oklch;
            default: return colorObj.hex;
        }
    }

    // =========================================================================
    // 2. SCREENSHOT & PIXEL ACCESS
    // =========================================================================

    function loadScreenshot(dataUrl) {
        return new Promise((resolve, reject) => {
            screenshotImg = new Image();
            screenshotImg.onload = () => {
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

    function getPixelColor(clientX, clientY) {
        if (!ctx || !screenshotImg) return { r: 0, g: 0, b: 0 };
        const dpr = window.devicePixelRatio || 1;
        const x = Math.round(clientX * dpr);
        const y = Math.round(clientY * dpr);
        const clampedX = Math.max(0, Math.min(x, canvas.width - 1));
        const clampedY = Math.max(0, Math.min(y, canvas.height - 1));

        try {
            const pixel = ctx.getImageData(clampedX, clampedY, 1, 1).data;
            return { r: pixel[0], g: pixel[1], b: pixel[2] };
        } catch (e) {
            return { r: 0, g: 0, b: 0 };
        }
    }

    // Fast batch ImageData extraction for region analysis
    function getRegionImageData(left, top, width, height) {
        if (!ctx || !canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        const sx = Math.max(0, Math.min(Math.round(left * dpr), canvas.width - 1));
        const sy = Math.max(0, Math.min(Math.round(top * dpr), canvas.height - 1));
        const sw = Math.max(1, Math.min(Math.round(width * dpr), canvas.width - sx));
        const sh = Math.max(1, Math.min(Math.round(height * dpr), canvas.height - sy));
        try {
            return ctx.getImageData(sx, sy, sw, sh);
        } catch (e) {
            return null;
        }
    }

    // =========================================================================
    // 3. PERCEPTUAL CLUSTERING & SEMANTIC EXTRACTION ALGORITHMS
    // =========================================================================

    /**
     * Extracts perceptual color clusters in OKLab space with edge/anti-aliasing
     * suppression and medoid preservation (ensuring crisp, real pixels).
     */
    function extractPerceptualClusters(left, top, width, height) {
        const imgData = getRegionImageData(left, top, width, height);
        if (!imgData) return { clusters: [], totalWeight: 0, bgLab: { L: 0.5, a: 0, b: 0 } };

        const { data, width: rw, height: rh } = imgData;
        const totalPixels = rw * rh;
        // Target ~2,500 samples for fast, high-accuracy analysis
        const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 2500)));

        const bins = new Map();
        let globalL = 0, globalA = 0, globalB = 0, globalWeight = 0;

        for (let y = 0; y < rh; y += step) {
            for (let x = 0; x < rw; x += step) {
                const idx = (y * rw + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                const lab = rgbToOklab(r, g, b);
                const lch = oklabToOklch(lab);

                // Edge / Anti-aliasing detection: compare with right and bottom neighbor
                let isEdge = false;
                if (x + 2 < rw && y + 2 < rh) {
                    const idxR = (y * rw + (x + 2)) * 4;
                    const idxB = ((y + 2) * rw + x) * 4;
                    const dr = Math.abs(r - data[idxR]) + Math.abs(g - data[idxR + 1]) + Math.abs(b - data[idxR + 2]);
                    const db = Math.abs(r - data[idxB]) + Math.abs(g - data[idxB + 1]) + Math.abs(b - data[idxB + 2]);
                    if (dr > 75 || db > 75) {
                        isEdge = true;
                    }
                }

                // Weight homogeneous surface pixels higher than anti-aliased transition pixels
                const pixelWeight = isEdge ? 0.25 : 1.0;

                // Fine quantization in OKLab space (~30 L steps, ~40 a/b steps)
                const qL = Math.round(lab.L * 32);
                const qa = Math.round(lab.a * 55);
                const qb = Math.round(lab.b * 55);
                const key = `${qL}:${qa}:${qb}`;

                let bin = bins.get(key);
                if (!bin) {
                    bin = {
                        weight: 0,
                        rawCount: 0,
                        flatCount: 0,
                        sumL: 0, sumA: 0, sumB: 0,
                        // Crisp representative pixel (prefers non-edge, vivid pixel)
                        repR: r, repG: g, repB: b,
                        repLab: lab, repLch: lch,
                        bestRepScore: -1
                    };
                    bins.set(key, bin);
                }

                bin.weight += pixelWeight;
                bin.rawCount += 1;
                if (!isEdge) bin.flatCount += 1;
                bin.sumL += lab.L * pixelWeight;
                bin.sumA += lab.a * pixelWeight;
                bin.sumB += lab.b * pixelWeight;

                // Score this pixel as the crisp representative of the bin
                const crispBonus = isEdge ? 0 : 0.5;
                const chromaBonus = lch.C * 2.0;
                const repScore = crispBonus + chromaBonus;
                if (repScore > bin.bestRepScore) {
                    bin.bestRepScore = repScore;
                    bin.repR = r;
                    bin.repG = g;
                    bin.repB = b;
                    bin.repLab = lab;
                    bin.repLch = lch;
                }

                globalL += lab.L * pixelWeight;
                globalA += lab.a * pixelWeight;
                globalB += lab.b * pixelWeight;
                globalWeight += pixelWeight;
            }
        }

        if (bins.size === 0 || globalWeight === 0) {
            return { clusters: [], totalWeight: 0, bgLab: { L: 0.5, a: 0, b: 0 } };
        }

        // Convert bins to initial clusters sorted by weight descending
        let rawClusters = Array.from(bins.values()).map(bin => {
            const meanLab = {
                L: bin.sumL / bin.weight,
                a: bin.sumA / bin.weight,
                b: bin.sumB / bin.weight
            };
            return {
                weight: bin.weight,
                rawCount: bin.rawCount,
                flatCount: bin.flatCount,
                meanLab,
                meanLch: oklabToOklch(meanLab),
                // Representative crisp pixel
                r: bin.repR,
                g: bin.repG,
                b: bin.repB,
                lab: bin.repLab,
                lch: bin.repLch
            };
        }).sort((a, b) => b.weight - a.weight);

        // Hierarchical perceptual merging in OKLab space (merge imperceptibly close shades, dE < 0.042)
        const merged = [];
        const MERGE_THRESHOLD = 0.042;

        for (const c of rawClusters) {
            let target = null;
            let minDist = Infinity;
            for (const m of merged) {
                const dist = deltaEOklab(c.lab, m.lab);
                if (dist < MERGE_THRESHOLD && dist < minDist) {
                    minDist = dist;
                    target = m;
                }
            }

            if (target) {
                const totalW = target.weight + c.weight;
                target.meanLab.L = (target.meanLab.L * target.weight + c.meanLab.L * c.weight) / totalW;
                target.meanLab.a = (target.meanLab.a * target.weight + c.meanLab.a * c.weight) / totalW;
                target.meanLab.b = (target.meanLab.b * target.weight + c.meanLab.b * c.weight) / totalW;
                target.meanLch = oklabToOklch(target.meanLab);
                target.weight = totalW;
                target.rawCount += c.rawCount;
                target.flatCount += c.flatCount;

                // Keep the crisper / more chromatic representative for accents if significant
                if (c.flatCount > 0 && c.lch.C > target.lch.C * 1.15 && c.weight > target.weight * 0.12) {
                    target.vividR = c.r;
                    target.vividG = c.g;
                    target.vividB = c.b;
                    target.vividLab = c.lab;
                    target.vividLch = c.lch;
                }
            } else {
                merged.push({
                    ...c,
                    vividR: c.r,
                    vividG: c.g,
                    vividB: c.b,
                    vividLab: c.lab,
                    vividLch: c.lch
                });
            }
        }

        // Remove noise clusters (< 0.15% of total weight unless fewer than 4 clusters exist)
        const minWeight = globalWeight * 0.0015;
        let filtered = merged.filter(c => c.weight >= minWeight || c.flatCount >= 2);
        if (filtered.length < 4) filtered = merged;

        filtered.sort((a, b) => b.weight - a.weight);

        const bgLab = filtered[0]
            ? filtered[0].lab
            : { L: globalL / globalWeight, a: globalA / globalWeight, b: globalB / globalWeight };

        return { clusters: filtered, totalWeight: globalWeight, bgLab };
    }

    /**
     * Synthesizes a harmonious color in OKLCH when a region has fewer than 4 distinct colors.
     */
    function synthesizeHarmoniousColor(referenceCluster, baseCluster, hueShiftDeg, targetRole) {
        const refLch = referenceCluster ? referenceCluster.lch : { L: 0.6, C: 0.14, h: 220 };
        const baseL = baseCluster ? baseCluster.lch.L : 0.95;

        let newH = (refLch.h + hueShiftDeg + 360) % 360;
        let newC = Math.max(0.11, Math.min(0.20, refLch.C > 0.03 ? refLch.C : 0.14));
        // Ensure good contrast against baseL
        let newL = baseL > 0.55
            ? Math.max(0.38, Math.min(0.62, refLch.L))
            : Math.max(0.65, Math.min(0.82, refLch.L));

        if (targetRole === 'base') {
            newL = refLch.L > 0.5 ? 0.16 : 0.96;
            newC = Math.min(0.02, refLch.C * 0.2);
            newH = refLch.h;
        }

        const rgb = oklchToRgb(newL, newC, newH);
        const lab = rgbToOklab(rgb.r, rgb.g, rgb.b);
        const lch = oklabToOklch(lab);
        return {
            r: rgb.r, g: rgb.g, b: rgb.b,
            lab, lch,
            vividR: rgb.r, vividG: rgb.g, vividB: rgb.b,
            vividLab: lab, vividLch: lch,
            synthesized: true
        };
    }

    /**
     * MODE 1: UI PALETTE EXTRACTION (60-30-10 Design System Role Assignment)
     * Extracts real colors from the selection and maps them to:
     * - Base: Dominant canvas / surface color (60% role)
     * - Primary: Main brand / structural identity color (30% role)
     * - Accent 1: Primary focal / CTA highlight color (10% role)
     * - Accent 2: Secondary accent or high-contrast typography/UI color
     */
    function analyzeRegion(left, top, width, height) {
        const { clusters, totalWeight } = extractPerceptualClusters(left, top, width, height);

        if (clusters.length === 0) {
            const fallback = formatColorObject({ r: 128, g: 128, b: 128 });
            return { primary: fallback, base: fallback, accent: fallback, accent2: fallback };
        }

        // 1. Select BASE (Background / Surface Canvas)
        // Dominant area coverage, favoring low-to-moderate chroma or clean dark/light surfaces
        let baseCluster = clusters[0];
        let bestBaseScore = -Infinity;

        for (const c of clusters.slice(0, 6)) {
            const areaShare = c.weight / totalWeight;
            const chromaPenalty = Math.max(0.35, 1.15 - c.lch.C * 2.2);
            const surfaceLightnessBonus = (c.lch.L > 0.85 || c.lch.L < 0.25) ? 1.25 : 1.0;
            const score = Math.pow(areaShare, 0.55) * chromaPenalty * surfaceLightnessBonus;

            if (score > bestBaseScore) {
                bestBaseScore = score;
                baseCluster = c;
            }
        }

        const selected = [baseCluster];
        const isDistinctFromSelected = (cand, minDe) => {
            return selected.every(sel => deltaEOklab(cand.lab, sel.lab) >= minDe);
        };

        // 2. Select PRIMARY (Main Brand / Structural Identity)
        // High visual presence + strong contrast against Base + chromatic identity
        let primaryCluster = null;
        let bestPrimaryScore = -Infinity;

        for (const c of clusters) {
            if (c === baseCluster) continue;
            const dEBase = deltaEOklab(c.lab, baseCluster.lab);
            if (dEBase < 0.075) continue;

            const areaFactor = Math.log(1 + (c.weight / totalWeight) * 100);
            const chromaFactor = 1.0 + c.vividLch.C * 6.5;
            const contrastFactor = Math.min(1.8, dEBase * 2.2);
            const score = areaFactor * chromaFactor * contrastFactor;

            if (score > bestPrimaryScore) {
                bestPrimaryScore = score;
                primaryCluster = c;
            }
        }

        if (!primaryCluster) {
            primaryCluster = clusters.find(c => c !== baseCluster) ||
                synthesizeHarmoniousColor(baseCluster, baseCluster, 210, 'primary');
        }
        selected.push(primaryCluster);

        // 3. Select ACCENT 1 (Most Salient / Vibrant Action Color)
        let accent1Cluster = null;
        let bestAccent1Score = -Infinity;

        for (const c of clusters) {
            if (!isDistinctFromSelected(c, 0.085)) continue;

            const dEBase = deltaEOklab(c.vividLab, baseCluster.lab);
            const dEPrim = deltaEOklab(c.vividLab, primaryCluster.vividLab);
            const hueSep = (c.vividLch.C > 0.04 && primaryCluster.vividLch.C > 0.04)
                ? (1.0 + circularHueDistance(c.vividLch.h, primaryCluster.vividLch.h) / 180 * 0.6)
                : 1.0;

            const chromaScore = c.vividLch.C * 12.0;
            const freqScore = Math.log(1 + c.rawCount) * 0.45;
            const contrastScore = (dEBase + dEPrim) * 1.4;
            const score = (chromaScore + freqScore + contrastScore) * hueSep;

            if (score > bestAccent1Score) {
                bestAccent1Score = score;
                accent1Cluster = c;
            }
        }

        if (!accent1Cluster) {
            // Try relaxed threshold before synthesizing
            accent1Cluster = clusters.find(c => !selected.includes(c) && isDistinctFromSelected(c, 0.05)) ||
                synthesizeHarmoniousColor(primaryCluster, baseCluster, 180, 'accent');
        }
        selected.push(accent1Cluster);

        // 4. Select ACCENT 2 (Secondary Distinct Accent or High-Contrast Foreground)
        let accent2Cluster = null;
        let bestAccent2Score = -Infinity;

        for (const c of clusters) {
            if (!isDistinctFromSelected(c, 0.08)) continue;

            const minDistToSelected = Math.min(...selected.map(s => deltaEOklab(c.vividLab, s.vividLab)));
            const chromaScore = c.vividLch.C * 9.0;
            const freqScore = Math.log(1 + c.rawCount) * 0.5;
            const score = (chromaScore + freqScore) * (1.0 + minDistToSelected * 2.5);

            if (score > bestAccent2Score) {
                bestAccent2Score = score;
                accent2Cluster = c;
            }
        }

        if (!accent2Cluster) {
            accent2Cluster = clusters.find(c => !selected.includes(c) && isDistinctFromSelected(c, 0.045)) ||
                synthesizeHarmoniousColor(primaryCluster, baseCluster, 140, 'accent2');
        }

        return {
            primary: formatColorObject(
                { r: primaryCluster.vividR, g: primaryCluster.vividG, b: primaryCluster.vividB },
                { synthesized: primaryCluster.synthesized, roleLabel: 'Primary' }
            ),
            base: formatColorObject(
                { r: baseCluster.r, g: baseCluster.g, b: baseCluster.b },
                { synthesized: baseCluster.synthesized, roleLabel: 'Base' }
            ),
            accent: formatColorObject(
                { r: accent1Cluster.vividR, g: accent1Cluster.vividG, b: accent1Cluster.vividB },
                { synthesized: accent1Cluster.synthesized, roleLabel: 'Accent 1' }
            ),
            accent2: formatColorObject(
                { r: accent2Cluster.vividR, g: accent2Cluster.vividG, b: accent2Cluster.vividB },
                { synthesized: accent2Cluster.synthesized, roleLabel: 'Accent 2' }
            )
        };
    }

    /**
     * MODE 2: VIVID ACCENTS EXTRACTION (Perceptual Saliency & Maximin Diversity)
     * Hunts for visually striking accent colors (buttons, badges, icons, highlights)
     * using OKLab Chroma + Contrast against background + Maximin diversity.
     */
    function analyzeAccentColors(left, top, width, height) {
        const { clusters, totalWeight, bgLab } = extractPerceptualClusters(left, top, width, height);

        if (clusters.length === 0) {
            const fallback = formatColorObject({ r: 128, g: 128, b: 128 });
            return { primary: fallback, base: fallback, accent: fallback, accent2: fallback };
        }

        // 1. Identify the Base (background canvas) first so accents contrast against it
        let baseCluster = clusters[0];
        let bestBaseScore = -Infinity;
        for (const c of clusters.slice(0, 6)) {
            const areaShare = c.weight / totalWeight;
            const lowChromaBonus = Math.max(0.3, 1.2 - c.lch.C * 2.5);
            const score = Math.pow(areaShare, 0.6) * lowChromaBonus;
            if (score > bestBaseScore) {
                bestBaseScore = score;
                baseCluster = c;
            }
        }

        // 2. Score all clusters by Perceptual Saliency in OKLab
        for (const c of clusters) {
            const lch = c.vividLch;
            const dEFromBg = deltaEOklab(c.vividLab, baseCluster.lab);
            const lightnessSweetSpot = 1.0 - Math.max(0, Math.abs(lch.L - 0.58) - 0.25) * 1.5;
            const achromaticPenalty = lch.C < 0.035 ? -2.5 : 0;
            const freqComponent = Math.log(1 + c.rawCount) * 0.35;

            c.saliencyScore =
                (lch.C * 16.0 * Math.max(0.4, lightnessSweetSpot)) +
                (dEFromBg * 3.2) +
                freqComponent +
                achromaticPenalty;
        }

        const candidates = clusters
            .filter(c => c !== baseCluster && deltaEOklab(c.vividLab, baseCluster.lab) >= 0.06)
            .sort((a, b) => b.saliencyScore - a.saliencyScore);

        const accents = [];

        // Greedy Maximin Perceptual Selection
        if (candidates.length > 0) {
            accents.push(candidates[0]);
        }

        while (accents.length < 3) {
            let bestCand = null;
            let bestCombinedScore = -Infinity;

            for (const c of candidates) {
                if (accents.includes(c)) continue;

                const minDeToAccents = Math.min(...accents.map(a => deltaEOklab(c.vividLab, a.vividLab)));
                if (minDeToAccents < 0.085) continue;

                // Bonus for wide hue angle separation when both colors are chromatic
                const minHueDiff = Math.min(...accents.map(a => {
                    if (a.vividLch.C < 0.04 || c.vividLch.C < 0.04) return 90;
                    return circularHueDistance(c.vividLch.h, a.vividLch.h);
                }));
                const diversityMultiplier = (1.0 + minDeToAccents * 2.2) * (0.85 + (minHueDiff / 180) * 0.5);
                const combinedScore = Math.max(0.1, c.saliencyScore + 3.0) * diversityMultiplier;

                if (combinedScore > bestCombinedScore) {
                    bestCombinedScore = combinedScore;
                    bestCand = c;
                }
            }

            if (bestCand) {
                accents.push(bestCand);
            } else {
                // Relax distance threshold if region has limited palette
                const relaxed = candidates.find(c =>
                    !accents.includes(c) &&
                    accents.every(a => deltaEOklab(c.vividLab, a.vividLab) >= 0.048)
                );
                if (relaxed) {
                    accents.push(relaxed);
                } else {
                    break;
                }
            }
        }

        // Synthesize remaining slots in OKLCH if selection had fewer than 3 distinct accents
        const refForSynth = accents[0] || baseCluster;
        const synthShifts = [180, 120, 240];
        let shiftIdx = 0;
        while (accents.length < 3) {
            accents.push(synthesizeHarmoniousColor(refForSynth, baseCluster, synthShifts[shiftIdx++ % 3], 'accent'));
        }

        return {
            primary: formatColorObject(
                { r: accents[0].vividR, g: accents[0].vividG, b: accents[0].vividB },
                { synthesized: accents[0].synthesized, roleLabel: 'Accent 1' }
            ),
            base: formatColorObject(
                { r: baseCluster.r, g: baseCluster.g, b: baseCluster.b },
                { synthesized: baseCluster.synthesized, roleLabel: 'Base' }
            ),
            accent: formatColorObject(
                { r: accents[1].vividR, g: accents[1].vividG, b: accents[1].vividB },
                { synthesized: accents[1].synthesized, roleLabel: 'Accent 2' }
            ),
            accent2: formatColorObject(
                { r: accents[2].vividR, g: accents[2].vividG, b: accents[2].vividB },
                { synthesized: accents[2].synthesized, roleLabel: 'Accent 3' }
            )
        };
    }

    // =========================================================================
    // 4. ON-PAGE UI OVERLAY, MAGNIFIER & HUD
    // =========================================================================

    function createOverlay() {
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
            user-select: none;
        `;

        // Precision pixel-grid magnifier
        magnifier = document.createElement('canvas');
        magnifier.id = 'colorcheck-magnifier';
        magnifier.width = 132;
        magnifier.height = 132;
        magnifier.style.cssText = `
            position: fixed;
            width: 132px;
            height: 132px;
            border: 2.5px solid rgba(255, 255, 255, 0.95);
            border-radius: 50%;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.35);
            pointer-events: none;
            z-index: 2147483647;
            image-rendering: pixelated;
            display: none;
        `;
        magnifierCtx = magnifier.getContext('2d');

        // Studio HUD Tooltip
        colorPreview = document.createElement('div');
        colorPreview.id = 'colorcheck-preview';
        colorPreview.style.cssText = `
            position: fixed;
            padding: 10px 12px;
            background: rgba(15, 16, 22, 0.92);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: #f4f6fb;
            font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
            font-size: 12px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
            pointer-events: none;
            z-index: 2147483647;
            display: none;
            white-space: nowrap;
        `;

        // Precision Cursor Ring
        const crosshair = document.createElement('div');
        crosshair.id = 'colorcheck-crosshair';
        crosshair.style.cssText = `
            position: fixed;
            width: 18px;
            height: 18px;
            border: 1.5px solid #fff;
            border-radius: 50%;
            box-shadow: 0 0 0 1px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.45);
            pointer-events: none;
            z-index: 2147483647;
            transform: translate(-50%, -50%);
            display: none;
        `;
        crosshair.innerHTML = `
            <div style="position:absolute;top:50%;left:50%;width:3px;height:3px;background:#00D4FF;border-radius:50%;transform:translate(-50%,-50%);"></div>
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
            border: 1.5px solid #00D4FF;
            background: rgba(0, 212, 255, 0.08);
            box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25), 0 8px 24px rgba(0, 212, 255, 0.15);
            border-radius: 4px;
            pointer-events: none;
            z-index: 2147483647;
        `;

        selectionBadge = document.createElement('div');
        selectionBadge.id = 'colorcheck-selection-badge';
        selectionBadge.style.cssText = `
            position: fixed;
            padding: 4px 8px;
            background: rgba(15, 16, 22, 0.9);
            color: #00D4FF;
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.04em;
            border-radius: 6px;
            border: 1px solid rgba(0, 212, 255, 0.3);
            pointer-events: none;
            z-index: 2147483647;
            display: none;
        `;

        document.body.appendChild(selectionRect);
        document.body.appendChild(selectionBadge);
    }

    function updateMagnifier(clientX, clientY, centerHex) {
        if (!magnifier || !ctx || !screenshotImg) return;

        const dpr = window.devicePixelRatio || 1;
        const sourceX = Math.round(clientX * dpr);
        const sourceY = Math.round(clientY * dpr);

        const cells = 11; // Odd number so center pixel is exact
        const cellSize = magnifier.width / cells; // 12px per cell
        const halfCells = Math.floor(cells / 2);

        magnifierCtx.imageSmoothingEnabled = false;
        magnifierCtx.fillStyle = '#18181f';
        magnifierCtx.fillRect(0, 0, magnifier.width, magnifier.height);

        const srcX = sourceX - halfCells;
        const srcY = sourceY - halfCells;

        try {
            magnifierCtx.drawImage(
                canvas,
                srcX, srcY, cells, cells,
                0, 0, magnifier.width, magnifier.height
            );
        } catch (e) {
            // Ignore boundary draw issues
        }

        // Subtle pixel grid
        magnifierCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        magnifierCtx.lineWidth = 0.5;
        for (let i = 1; i < cells; i++) {
            const pos = i * cellSize;
            magnifierCtx.beginPath();
            magnifierCtx.moveTo(pos, 0);
            magnifierCtx.lineTo(pos, magnifier.height);
            magnifierCtx.stroke();

            magnifierCtx.beginPath();
            magnifierCtx.moveTo(0, pos);
            magnifierCtx.lineTo(magnifier.width, pos);
            magnifierCtx.stroke();
        }

        // Center pixel reticle
        const centerPos = halfCells * cellSize;
        magnifierCtx.strokeStyle = '#ffffff';
        magnifierCtx.lineWidth = 1.5;
        magnifierCtx.strokeRect(centerPos, centerPos, cellSize, cellSize);
        magnifierCtx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        magnifierCtx.lineWidth = 1;
        magnifierCtx.strokeRect(centerPos - 1, centerPos - 1, cellSize + 2, cellSize + 2);

        // Ring border tinted with picked color
        magnifier.style.borderColor = centerHex || '#ffffff';

        const offsetX = 22;
        const offsetY = 22;
        let magX = clientX + offsetX;
        let magY = clientY + offsetY;

        if (magX + 165 > window.innerWidth) magX = clientX - 150 - offsetX;
        if (magY + 215 > window.innerHeight) magY = clientY - 210 - offsetY;

        magnifier.style.left = magX + 'px';
        magnifier.style.top = magY + 'px';
        magnifier.style.display = 'block';
    }

    function inspectElementAtPoint(clientX, clientY, pickedRgb) {
        try {
            const els = document.elementsFromPoint(clientX, clientY);
            const target = els.find(el => !el.id || !el.id.startsWith('colorcheck-'));
            if (!target) return null;

            const tag = target.tagName.toLowerCase();
            let selector = tag;
            if (target.id) {
                selector += `#${target.id.slice(0, 14)}`;
            } else if (typeof target.className === 'string' && target.className.trim()) {
                const firstClass = target.className.trim().split(/\s+/)[0].slice(0, 16);
                if (firstClass) selector += `.${firstClass}`;
            }

            if (tag === 'img' || tag === 'picture' || tag === 'video' || tag === 'canvas') {
                return `${selector} · media pixel`;
            }
            if (tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'rect') {
                return `${selector} · vector/svg`;
            }

            const cs = window.getComputedStyle(target);
            const matchCssRgb = (cssStr) => {
                if (!cssStr) return false;
                const m = cssStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!m) return false;
                const dr = Math.abs(parseInt(m[1]) - pickedRgb.r);
                const dg = Math.abs(parseInt(m[2]) - pickedRgb.g);
                const db = Math.abs(parseInt(m[3]) - pickedRgb.b);
                return (dr + dg + db) < 36;
            };

            let prop = 'surface';
            if (matchCssRgb(cs.color)) {
                prop = 'color (text)';
            } else if (matchCssRgb(cs.backgroundColor)) {
                prop = 'background-color';
            } else if (matchCssRgb(cs.borderTopColor) || matchCssRgb(cs.borderColor)) {
                prop = 'border-color';
            } else if (cs.backgroundImage && cs.backgroundImage !== 'none') {
                prop = cs.backgroundImage.includes('gradient') ? 'css gradient' : 'bg-image';
            }

            return `${selector} · ${prop}`;
        } catch (e) {
            return null;
        }
    }

    function updateColorPreview(clientX, clientY, color) {
        if (!colorPreview) return;

        const formatted = formatColorObject(color);
        const lch = rgbToOklch(color.r, color.g, color.b);
        const contrastWhite = getContrastRatio(color, { r: 255, g: 255, b: 255 }).toFixed(1);
        const contrastBlack = getContrastRatio(color, { r: 0, g: 0, b: 0 }).toFixed(1);
        const domInfo = inspectElementAtPoint(clientX, clientY, color);

        colorPreview.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:30px;height:30px;background:${formatted.hex};border-radius:7px;border:1px solid rgba(255,255,255,0.25);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.2);"></div>
                <div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-weight:700;font-size:13px;letter-spacing:0.03em;color:#fff;">${formatted.hex}</span>
                        <span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,0.1);color:#a8b2c8;">L ${Math.round(lch.L * 100)}%</span>
                    </div>
                    <div style="font-size:10.5px;color:#9aa4b8;margin-top:2px;">${formatted.oklch}</div>
                    <div style="display:flex;gap:8px;font-size:9.5px;color:#7e889c;margin-top:3px;">
                        <span>vs #FFF: <strong style="color:${contrastWhite >= 4.5 ? '#34d399' : '#9aa4b8'}">${contrastWhite}:1</strong></span>
                        <span>vs #000: <strong style="color:${contrastBlack >= 4.5 ? '#34d399' : '#9aa4b8'}">${contrastBlack}:1</strong></span>
                    </div>
                    ${domInfo ? `<div style="font-size:9.5px;color:#00D4FF;margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.08);max-width:190px;overflow:hidden;text-overflow:ellipsis;">${domInfo}</div>` : ''}
                </div>
            </div>
        `;

        const magRect = magnifier.getBoundingClientRect();
        let prevX = magRect.left;
        let prevY = magRect.bottom + 8;
        if (prevX + 225 > window.innerWidth) prevX = window.innerWidth - 230;

        colorPreview.style.left = prevX + 'px';
        colorPreview.style.top = prevY + 'px';
        colorPreview.style.display = 'block';

        const crosshair = document.getElementById('colorcheck-crosshair');
        if (crosshair) {
            crosshair.style.left = clientX + 'px';
            crosshair.style.top = clientY + 'px';
            crosshair.style.display = 'block';
            crosshair.style.borderColor = lch.L > 0.6 ? '#111' : '#fff';
        }
    }

    // =========================================================================
    // 5. INTERACTION HANDLERS
    // =========================================================================

    function handleMouseMove(e) {
        if (!isActive) return;
        const color = getPixelColor(e.clientX, e.clientY);
        const hex = rgbToHex(color.r, color.g, color.b);
        updateMagnifier(e.clientX, e.clientY, hex);
        updateColorPreview(e.clientX, e.clientY, color);
    }

    function handleClick(e) {
        if (!isActive || mode !== 'eyedropper') return;

        e.preventDefault();
        e.stopPropagation();

        const rawColor = getPixelColor(e.clientX, e.clientY);
        const colorObj = formatColorObject(rawColor);
        const copyText = getFormattedColorString(colorObj, defaultFormat);

        navigator.clipboard.writeText(copyText).then(() => {
            showToast(`Copied ${copyText}`, colorObj.hex);

            chrome.runtime.sendMessage({
                action: 'addToHistory',
                color: {
                    hex: colorObj.hex,
                    rgb: colorObj.rgb,
                    hsl: colorObj.hsl,
                    oklch: colorObj.oklch
                }
            });
        });

        cleanup();
    }

    function handlePaletteMouseDown(e) {
        if (!isActive || (mode !== 'palette' && mode !== 'accent')) return;

        isDrawing = true;
        startX = e.clientX;
        startY = e.clientY;
        createSelectionRect();
        selectionRect.style.left = startX + 'px';
        selectionRect.style.top = startY + 'px';
        selectionRect.style.width = '0px';
        selectionRect.style.height = '0px';

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

        if (selectionBadge && width > 24 && height > 24) {
            const modeLabel = mode === 'accent' ? 'Vivid Accents' : 'UI Palette (60-30-10)';
            selectionBadge.textContent = `${modeLabel} · ${Math.round(width)}×${Math.round(height)}px`;
            selectionBadge.style.left = left + 'px';
            selectionBadge.style.top = Math.max(8, top - 28) + 'px';
            selectionBadge.style.display = 'block';
        }
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

        const colors = mode === 'accent'
            ? analyzeAccentColors(left, top, width, height)
            : analyzeRegion(left, top, width, height);

        chrome.runtime.sendMessage({
            action: 'storeColors',
            colors: colors
        });

        const primaryCopy = getFormattedColorString(colors.primary, defaultFormat);
        navigator.clipboard.writeText(primaryCopy).catch(() => {});

        showPaletteToast(colors, mode);
        cleanup();
    }

    function showToast(message, color) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 16, 22, 0.94);
            backdrop-filter: blur(12px);
            color: #fff;
            padding: 10px 18px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            font-size: 13px;
            font-weight: 500;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        `;

        if (color) {
            const swatch = document.createElement('div');
            swatch.style.cssText = `
                width: 18px;
                height: 18px;
                border-radius: 5px;
                background: ${color};
                border: 1px solid rgba(255,255,255,0.25);
            `;
            toast.appendChild(swatch);
        }

        toast.appendChild(document.createTextNode(message));
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.25s ease';
            setTimeout(() => toast.remove(), 250);
        }, 2200);
    }

    function showPaletteToast(colors, extractionMode) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 16, 22, 0.95);
            backdrop-filter: blur(12px);
            color: #fff;
            padding: 10px 16px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            font-size: 12.5px;
            font-weight: 500;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        `;

        const swatchesHtml = [colors.base, colors.primary, colors.accent, colors.accent2]
            .map(c => `<div style="width:18px;height:18px;border-radius:4px;background:${c.hex};border:1px solid rgba(255,255,255,0.2);"></div>`)
            .join('');

        const label = extractionMode === 'accent' ? 'Vivid Accents' : 'UI Palette';
        toast.innerHTML = `
            <div style="display:flex;gap:4px;">${swatchesHtml}</div>
            <span>${label} extracted · Copied <strong>${colors.primary.hex}</strong></span>
        `;

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.25s ease';
            setTimeout(() => toast.remove(), 250);
        }, 2500);
    }

    function cleanup() {
        isActive = false;
        isDrawing = false;

        [
            'colorcheck-overlay',
            'colorcheck-magnifier',
            'colorcheck-preview',
            'colorcheck-crosshair',
            'colorcheck-selection',
            'colorcheck-selection-badge'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('mousedown', handlePaletteMouseDown);
        document.removeEventListener('mousemove', handlePaletteMouseMove);
        document.removeEventListener('mouseup', handlePaletteMouseUp);
        document.removeEventListener('keydown', handleKeyDown);

        overlay = null;
        magnifier = null;
        colorPreview = null;
        selectionRect = null;
        selectionBadge = null;
        canvas = null;
        ctx = null;
        screenshotImg = null;
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            cleanup();
        }
    }

    async function activate(pickerMode, screenshotUrl) {
        cleanup();

        mode = pickerMode;
        screenshot = screenshotUrl;

        try {
            const storageRes = await chrome.storage.local.get(['defaultFormat']);
            defaultFormat = storageRes.defaultFormat || 'hex';
        } catch (e) {
            defaultFormat = 'hex';
        }

        try {
            await loadScreenshot(screenshotUrl);
            createOverlay();
            isActive = true;

            if (mode === 'eyedropper') {
                overlay.style.cursor = 'none';
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('click', handleClick, true);
            } else if (mode === 'palette' || mode === 'accent') {
                overlay.style.cursor = 'crosshair';
                document.addEventListener('mousedown', handlePaletteMouseDown);
                document.addEventListener('mousemove', handlePaletteMouseMove);
                document.addEventListener('mouseup', handlePaletteMouseUp);
            }

            document.addEventListener('keydown', handleKeyDown);
        } catch (error) {
            console.error('ColorCheck activation error:', error);
            showToast('Failed to start picker', '#ff4444');
            cleanup();
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startPicker') {
            activate(message.mode, message.screenshot);
            sendResponse({ success: true });
        }
        return true;
    });
})();
