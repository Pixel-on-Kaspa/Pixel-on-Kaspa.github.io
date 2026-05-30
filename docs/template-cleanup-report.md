# Template Cleanup Report — AI-tell purge

**Date:** 2026-05-30
**File:** `scripts/post-templates/visual-generator-posts.md`
**Method:** Audited every positive example (✅ / "good") against the forbidden AI-tell list. Deprecated and replaced violators in place.

## Forbidden list (reference)

- "X becomes Y" / "X becoming Y" structure
- "One X, … Y" opener
- Aphoristic one-liner without concrete fact
- "pure" / "essence" / "distilled" / "held"
- "rendered in real time" / "alive" / "math, running"
- Em-dash as dramatic pause mid-sentence (not for connecting clause)
- "Sound becomes shape" (explicit named instance)

---

## Summary

| Metric | Count |
|---|---|
| Positive examples audited | 8 |
| Deprecated as AI-tell | **5** |
| Kept unchanged | **3** |

---

## Deprecated and replaced (5)

### 1. AFTER — Example A — Koma Tebe p5

**Violation:** "X became Y" transformation structure
**Old line:** `His one-liner became a full parametric sketch.`

**New version:**
```
Generator output — after @KomaTebe

Parametric port of his p5 one-liner. Three live controls: zoom, warp, seed.
Browser runtime, PNG export at arbitrary resolution.

pixel-on-kaspa.fyi/pixel-p5.html
```
**Concrete facts:** p5 origin, 3 named controls (zoom/warp/seed), PNG export, arbitrary resolution.
**Line 2 role:** adds info about runtime + export, not a punchline.

---

### 2. AFTER — Example B — Yohei GLSL

**Violation:** "turned into" (becomes variant) + "real-time" framing
**Old line:** `A tweet-sized GLSL shader turned into a real-time raymarcher.`

**New version:**
```
Generator output — after Yohei Nishitsuji

GLSL fragment shader from a 280-character tweet. Log-polar mapping, 99 raymarching iterations per frame.
Compiles client-side via WebGL.

pixel-on-kaspa.fyi/yohei-glsl.html
```
**Concrete facts:** shader type (fragment), source size (280 chars), log-polar mapping, 99 iterations/frame, WebGL.
**Line 2 role:** adds info about where/how it compiles.

---

### 3. ORIGINAL — Example A — SYNTHI Generator

**Violation:** "Sound becomes shape" — the canonical forbidden phrase, explicitly named on the AI-tell list
**Old line:** `Sound becomes shape. Bass drives exposure, highs warp geometry.`

**New version:**
```
SYNTHI Generator — multi-layer Lissajous, Web Audio API

FFT bins drive the visual: bass band sets exposure, treble warps geometry.
Three Lissajous layers stacked with adjustable phase offset.

pixel-on-kaspa.fyi/synthi/generator.html
```
**Concrete facts:** FFT bins, bass band, treble band, three layers, adjustable phase offset.
**Line 2 role:** adds info about layer count + phase parameter.

---

### 4. ORIGINAL — Example B — SYNTHI App

**Violation:** aphoristic punchline on line 2 ("The ratio draws the figure") instead of added information
**Old body:** `Set two frequencies. The ratio draws the figure.`

**New version:**
```
SYNTHI App — 4 oscillators, mathematical Lissajous

Set frequencies on the X and Y axes; their ratio defines the closed curve.
Phase offset rotates the figure, amplitude scales it.

pixel-on-kaspa.fyi/synthi/app.html
```
**Concrete facts:** X/Y axes, ratio → closed curve, phase = rotation, amplitude = scale.
**Line 2 role:** adds two more parameters (phase, amplitude) and what they control.

---

### 5. RECRUITMENT — Example A

**Violation:** "running live on-chain" — belongs to the "alive / math, running" family
**Old phrase:** `…want them running live on-chain — reach out.`

**New version:**
```
We host generative art on Kaspa.

p5.js, GLSL, and Processing sketches published as KRC-721 generators.
DM if you want to host a sketch. $PIXEL rewards route to the artist wallet.

pixel-on-kaspa.fyi
```
**Concrete facts:** p5.js, GLSL, Processing, KRC-721 token standard, $PIXEL rewards, artist wallet routing.
**Line 2 role:** adds the CTA + concrete reward routing detail.

---

## Kept unchanged (3)

### SERIES — Example A — Koma Tebe variations
Has 3 body lines but line 1 carries the concrete fact ("4 seeds from the Koma Tebe p5 generator") and line 2 adds info ("Same algorithm, different parameters"). Line 3 ("Every output is a one-off") is a flourish on top of factual content, not the load-bearing line. Borderline but passes.

### SERIES — Example B — SYNTHI frequency ratios
Strongest example in the file — line 1 lists actual ratios (1:1, 2:3, 3:4, 5:6), line 2 adds the mechanism ("Each ratio draws a different knot"), line 3 adds origin ("All from the same 4-oscillator engine"). Every line carries new information.

### RECRUITMENT — Example B
Header is a CTA, line 1 has concrete tech list ("p5.js, WebGL, Web Audio"), line 2 ("Your sketch, our infrastructure") is a closing pitch — borderline aphoristic but the post is recruitment-style where a closing slogan is appropriate, and the load-bearing line above it has facts.

---

## Verification

Re-scanned the file after edits — no remaining instances of:
- `become`, `became`, `becomes`, `becoming`
- `turned into` / `transformed into`
- `One frequency` / `One sketch` / `One X` opening pattern
- `pure`, `essence`, `distilled`, `held`
- `rendered in real time`, `alive`, `math, running`, `running live`

All 5 replacements contain ≥ 1 concrete fact in each body line (numbers, named technologies, named parameters, or specific behaviors).

## Side effect

The file now also serves as a **before/after teaching artifact** — the deprecated blocks stay visible with one-sentence "Why" notes, so an LLM operator reading the templates sees both the tell *and* the corrected version side by side. This addresses the gap flagged in `docs/post-command-audit.md` point #4 (missing ✅/❌ contrast).
