# Visual Generator Posts — Templates

Post templates for @PixelonKas promoting visual outputs from PIXEL on Kaspa generators.

**Rules:**
- 2–3 lines max, no hashtags in main post (reply thread only)
- Link format: `pixel-on-kaspa.fyi/...` (no `http://`)
- Tone: clean, direct, professional — no crypto slang, no hype

---

## 1. AFTER pattern

Generator output inspired by a specific artist. Credit the original creator.

### Example A — Koma Tebe p5

❌ **DEPRECATED 2026-05-30 — AI-tell.**
Why: opens with "His one-liner **became** a full parametric sketch" — the "X became Y" transformation structure is a classic LLM stylistic tell.

```
Generator output — after @KomaTebe

His one-liner became a full parametric sketch.
Zoom, warp, seed — every frame is different.

pixel-on-kaspa.fyi/pixel-p5.html
```

✅ **Replacement:**

```
Generator output — after @KomaTebe

Parametric port of his p5 one-liner. Three live controls: zoom, warp, seed.
Browser runtime, PNG export at arbitrary resolution.

pixel-on-kaspa.fyi/pixel-p5.html
```

### Example B — Yohei GLSL

❌ **DEPRECATED 2026-05-30 — AI-tell.**
Why: "A tweet-sized GLSL shader **turned into** a real-time raymarcher" is a "becomes" variant; also leans on the "real-time / alive" framing flagged in the AI-tell list.

```
Generator output — after Yohei Nishitsuji

A tweet-sized GLSL shader turned into a real-time raymarcher.
Log-polar mapping, 99 iterations, runs in the browser.

pixel-on-kaspa.fyi/yohei-glsl.html
```

✅ **Replacement:**

```
Generator output — after Yohei Nishitsuji

GLSL fragment shader from a 280-character tweet. Log-polar mapping, 99 raymarching iterations per frame.
Compiles client-side via WebGL.

pixel-on-kaspa.fyi/yohei-glsl.html
```

---

## 2. ORIGINAL pattern

Generator without external reference. Lead with name + tech, second line is the point — not a description.

### Example A — SYNTHI Generator

❌ **DEPRECATED 2026-05-30 — AI-tell.**
Why: opens with "**Sound becomes shape**" — the canonical "X becomes Y" LLM tell explicitly named on the forbidden list.

```
SYNTHI Generator — multi-layer Lissajous, Web Audio API

Sound becomes shape. Bass drives exposure, highs warp geometry.

pixel-on-kaspa.fyi/synthi/generator.html
```

✅ **Replacement:**

```
SYNTHI Generator — multi-layer Lissajous, Web Audio API

FFT bins drive the visual: bass band sets exposure, treble warps geometry.
Three Lissajous layers stacked with adjustable phase offset.

pixel-on-kaspa.fyi/synthi/generator.html
```

### Example B — SYNTHI App

❌ **DEPRECATED 2026-05-30 — AI-tell.**
Why: "Set two frequencies. **The ratio draws the figure.**" — the second line is an aphoristic punchline, not added information; violates the "line 2 must add info, not pointu" rule.

```
SYNTHI App — 4 oscillators, mathematical Lissajous

Set two frequencies. The ratio draws the figure.

pixel-on-kaspa.fyi/synthi/app.html
```

✅ **Replacement:**

```
SYNTHI App — 4 oscillators, mathematical Lissajous

Set frequencies on the X and Y axes; their ratio defines the closed curve.
Phase offset rotates the figure, amplitude scales it.

pixel-on-kaspa.fyi/synthi/app.html
```

---

## 3. SERIES pattern

Multiple outputs from one generator. For threads and carousels — first post sets context, images carry the rest.

### Example A — Koma Tebe variations

```
4 seeds from the Koma Tebe p5 generator.

Same algorithm, different parameters.
Every output is a one-off.
```

*(attach 4 PNG exports, link in reply)*

### Example B — SYNTHI frequency ratios

```
Lissajous figures at 1:1, 2:3, 3:4, 5:6.

Each ratio draws a different knot.
All from the same 4-oscillator engine.
```

*(attach 4 screenshots from SYNTHI App at different freq ratios, link in reply)*

---

## 4. RECRUITMENT pattern

Once every 2 weeks. Invitation for creators working in p5.js / GLSL / TouchDesigner / Processing.

### Example A

❌ **DEPRECATED 2026-05-30 — AI-tell.**
Why: "want them **running live** on-chain" — belongs to the "alive / math, running" family flagged on the AI-tell list.

```
We host generative art on Kaspa.

If you write p5.js, GLSL, or Processing sketches and want them
running live on-chain — reach out.

pixel-on-kaspa.fyi
```

✅ **Replacement:**

```
We host generative art on Kaspa.

p5.js, GLSL, and Processing sketches published as KRC-721 generators.
DM if you want to host a sketch. $PIXEL rewards route to the artist wallet.

pixel-on-kaspa.fyi
```

### Example B

```
Open call for visual artists.

PIXEL on Kaspa runs browser-based generators — p5.js, WebGL, Web Audio.
Your sketch, our infrastructure.

pixel-on-kaspa.fyi
```

---

## Anti-patterns

Six examples of what NOT to post, and why.

**1. Hype language**
> 🚀 AMAZING new generator just dropped!! This is INSANE!! 🔥🔥

Why: empty superlatives signal nothing. The visual should speak for itself.

**2. Crypto/NFT jargon soup**
> Mint our gen-art NFTs on the fastest L1! DYOR NFA wagmi

Why: alienates non-crypto audience and sounds like every other project. PIXEL posts to artists, not traders.

**3. Feature list instead of a point**
> Our generator has zoom, warp, rotation, fade, seed control, PNG export, fullscreen mode and localStorage persistence.

Why: reads like a changelog. Say what it does for the viewer, not what checkboxes it ticks.

**4. Hashtag-stuffed main post**
> New output from the Koma generator #generativeart #p5js #kaspa #nft #cryptoart #glsl #webgl

Why: hashtags go in the reply thread. In the main post they break the visual rhythm and look desperate.

**5. Uncredited inspiration**
> Check out this fragment shader we built.

Why: the Yohei GLSL generator is built on Yohei Nishitsuji's tweet shader. Always credit the original — "after Yohei Nishitsuji" or tag the author.

**6. Vague artistic statement**
> Exploring the intersection of sound and vision in the decentralized space.

Why: says nothing concrete. Name the technology, the technique, or the ratio — specificity is the signal.
