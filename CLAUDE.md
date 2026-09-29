# CLAUDE.md — Pixel on Kaspa

Project website for **PIXEL on Kaspa**, an audio-visual art and NFT project on the Kaspa blockchain. Live at [pixel-on-kaspa.fyi](https://pixel-on-kaspa.fyi).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Static generator | Jekyll 3.9.3+ (via Beautiful Jekyll v6.0.1 theme) |
| Markup | Markdown (Kramdown, GFM) |
| CSS | Bootstrap 4.4.1, Font Awesome 6.5.2, custom CSS |
| JavaScript | Vanilla JS, p5.js, Three.js/WebGL, Web Audio API |
| Fonts | Google Fonts — Lora, Open Sans |
| Hosting | GitHub Pages (custom domain via CNAME) |
| CI/CD | GitHub Actions |
| Package manager | Bundler (Ruby only — no npm/yarn) |

No Node.js build pipeline. No webpack, Vite, or similar tools.

---

## Repository Structure

```
Pixel-on-Kaspa.github.io/
├── _config.yml          # Jekyll site configuration
├── _layouts/            # Jekyll HTML layout templates (6 files)
├── _includes/           # Jekyll partials / components (29 files)
├── _posts/              # Blog posts in Markdown
├── _data/               # Data files (ui-text.yml — 40+ language strings)
├── assets/
│   ├── css/             # Stylesheets (beautifuljekyll.css + custom-styles.css)
│   ├── img/             # Image assets (~47 MB, NFT and artwork images)
│   ├── js/              # JS utilities
│   └── data/            # searchcorpus.json (search index)
├── js/                  # Root-level JS generator scripts
├── synthi/              # Audio synthesizer sub-application
│   ├── index.html       # SYNTHI main interface
│   ├── index.js         # Web Audio API implementation (~36 KB)
│   ├── generator.html   # Generator UI
│   ├── rec.html         # Recording UI
│   └── js/synthi-audio.js
├── index.html           # Homepage (2348 lines)
├── viewer.html          # NFT collection viewer
├── pixel-p5.html        # Interactive p5.js sketch generator
├── yohei-glsl.html      # WebGL GLSL shader visualizer (fixed motifs)
├── glsl-lab.html        # Modular GLSL shader lab (build your own motif)
├── artists.html         # Artist/creator gallery
├── about.md             # About the PIXEL project
├── collections.md       # NFT collections listing
├── CNAME                # Custom domain: pixel-on-kaspa.fyi
└── .github/workflows/ci.yml  # Build & deploy pipeline
```

---

## Build & Deployment

### Local development

```bash
bundle install
bundle exec jekyll serve
# Site available at http://localhost:4000
```

### CI/CD

GitHub Actions builds on every push and PR:

```bash
bundle exec appraisal jekyll build --future --config _config_ci.yml,_config.yml
```

Deployment is via GitHub Pages artifact upload. No manual deployment step needed — merge to `master` triggers a build.

### Jekyll configuration

Key settings in `_config.yml`:
- **Theme**: Beautiful Jekyll v6.0.1
- **Paginate**: 5 posts per page
- **Timezone**: Europe/Prague
- **Permalink**: `/:year-:month-:day-:title/`
- **Plugins**: `jekyll-paginate`, `jekyll-sitemap`
- **Custom CSS**: `/assets/css/custom-styles.css`
- **Social**: Twitter `@PixelonKas`, email, Telegram
- **Navigation**: NFT Viewer, Collections, About Pixel

---

## Content

### Blog posts (`_posts/`)

Markdown files with YAML front matter. Required front matter fields:

```yaml
---
layout: post
title: "Post title"
cover-img: /assets/img/some-image.jpg
thumbnail-img: /assets/img/thumbnail.jpg
tags: [kaspa, nft]
---
```

### Pages

- `about.md`, `collections.md` — Markdown pages rendered by Jekyll
- `viewer.html`, `pixel-p5.html`, `yohei-glsl.html`, `glsl-lab.html`, `artists.html` — standalone HTML pages with embedded JS/CSS

### NFT Collections

Two collections referenced throughout the site:
- **PIXELONKAS** — primary pixel art NFT collection
- **SYKORA** — collection inspired by Zdeněk Sýkora's computer art legacy, interpreted by David Vrbík

Minting links point to `kaspa.com/nft/collections/`.

---

## Interactive Features

### SYNTHI — Audio Synthesizer (`synthi/`)

Full Web Audio API drum machine and synthesizer. Key files:
- `synthi/index.js` — core engine (~36 KB): oscillators, drum synthesis, sequencer
- `synthi/js/synthi-audio.js` — audio processing module
- `synthi/generator.html` — parameter generator UI
- `synthi/rec.html` — recording interface

Sound transformed into visual forms using oscilloscope techniques — this is the core artistic concept of the project.

### p5.js Generator (`pixel-p5.html`)

Interactive sketch generator with user-controllable speed and quality parameters. Source sketch logic in `js/pixel-p5.js`.

### WebGL / GLSL Visualizer (`yohei-glsl.html`)

Real-time GLSL shader-based visual renderer. Two fixed shaders (a raymarcher and
the "Yohei Tweet" fold), parameterized by sliders — the motif itself is fixed.

### GLSL Lab (`glsl-lab.html`)

Modular shader lab: **one** fragment shader assembled from swappable modules, so
the motif is chosen by the user rather than baked in.

```
scene   coords → DOMAIN → WARP → FIELD (2D) / SDF + MARCH (3D) → SHADE → PALETTE
        → exposure, written LINEAR and UNCLAMPED into an RGBA16F texture
bright  scene → threshold on luminance, downsampled to ¼
blur    separable 9-tap gaussian, horizontal then vertical
post    scene + bloom → RGB split → GRADE (tone map, gamma, contrast, sat,
        vignette, grain, posterize+dither) → scanlines → trails
```

The grade lives in `GRADE`, a string shared by the scene shader (when it is the
only pass) and the post shader (when effects are on). **Tone mapping must come
after bloom** — the first version graded inside the scene shader, so bloom read
an already-clamped image and did visibly nothing. The chain only runs when an
effect is switched on; otherwise it is a single pass as before. Without
`EXT_color_buffer_float` the targets fall back to RGBA8 and bloom is weaker.

Trails are the one effect that does not loop: they carry state across frames,
so a clip with trails on will not close seamlessly.

- `js/glsl-lab-shader.js` — the module library and the source builder.
  Structural choices (which module, iteration counts) are `#define`-injected;
  `GLSLLabShader.build(cfg)` returns the fragment source, `key(cfg)` is the
  program-cache key. Module name tables (`DOMAINS`, `FIELDS`, `SDFS`, …) are
  exported and drive the UI.
- `js/glsl-lab.js` — engine and UI. A single `SCHEMA` array is the one source of
  truth for every control: default, range, visibility (`when`), whether it is
  structural (`struct` → recompile, cached) and what goes in the URL. Presets,
  the dice roller and the exports live here too.
- **WebGL2 required** (no WebGL1 fallback).

Design notes worth keeping:
- **Panel contrast.** The control panel has its own lighter colour scale
  (`--panelBg`, `--grpBg`, `--grpHead`, `--label`) — the first version reused
  the page's dark tokens and the rows were unreadable dark-on-dark.
- **The fold family is the form engine.** `Fold engine` (2D field) and
  `Kleinian fold` (3D SDF) implement the shape of Yohei Nishitsuji's tweet
  shader — `e = intensity/dot(p,p)`, `p = offset - abs(abs(p)*e - params)` —
  with the same control names as the Yohei page (Fold X/Y/Z, Param A/B/C,
  Intensity, Scale). `params.y` feeds back on `e`, and **Morph drive** walks the
  params around a circle over one loop, so the geometry itself animates rather
  than just rotating. `foldRot` adds a rotation between iterations, which is
  also what rescues Menger / Mandelbox / Apollonian from looking regular.
  Its DE is steep: keep Step scale ≈ 0.2–0.35 and Glow falloff in the hundreds
  to low thousands, or the volume washes out to fog.
- **Angularity.** Round, regular output was the first complaint. The levers
  against it: `noiseShape` (smooth / ridged / billow octave folding) with
  `roughness` + `lacunarity`, the `Angular fold` 2D warp (abs-fold + rotate, no
  inversion → straight edges), the **Mandelbox** SDF, and a bounding *box*
  rather than only a sphere. Kaleidoscope/polar domains impose the regularity —
  `Plane` is the way out.
- **Palette input is squashed** through `palIn(v) = v/(1+|v|)` before the ramp,
  but only where the input is a raw field value (TINT 1 and 2) — shading masks
  are already 0..1 and stay linear. Without this, `Ramp spread` did nothing on
  one motif and strobed on the next, since every field has its own range.
- **Frame budget is held by the render scale, not by the parameters.** These
  shaders cost whatever the user asks; `scale: auto` shrinks the buffer when
  frames pass ~42 ms and grows it back below ~19 ms, capped at the display's
  own pixel ratio. A `webglcontextlost` handler recovers (and explains) a GPU
  reset instead of freezing silently.
- **Never write the URL on every input event.** `persist()` is debounced 300 ms:
  `history.replaceState` at slider rate trips Chrome's navigation throttle and
  stalls the tab. Slider drags also skip the full panel re-sync — visibility
  only ever keys off selects and toggles.

Notes:
- **Seamless loops.** All animation is driven by `PH = TAU*(uTime/uPeriod + phase)`
  and every time-dependent term advances by a whole number of turns per loop, so
  frame 0 and frame N are identical. Rates are rounded to integers while
  `loop` is on. Verified: a full phase turn leaves every preset pixel-identical.
- **Exports.** PNG up to 4K, and a clip: WebCodecs H.264 → MP4 via `mp4-muxer`
  (CDN, optional) with a MediaRecorder fallback. Frames are rendered at a fixed
  dt, so a clip is frame-exact rather than dependent on real-time frame rate.
  Downloads go through blobs — Chrome refuses multi-megabyte data-URL downloads.
- `window.GLSLLabApp` exposes `render(size)`, `patch(obj)`, `preset(i)` for
  headless/automated checks; `window.__glslLabSweep()` compiles every module
  variant and reports failures.

### NFT Viewer (`viewer.html`)

Grid/card layout for browsing both NFT collections. Includes filtering and minting links.

---

## Styling

**Design system** — dark theme with glassmorphism:
- Background: radial gradient `#121623` → `#050608`
- Accent: cyan `#00c4ff`
- Text: light gray `#f5f5f5`
- Glassmorphic panels: `backdrop-filter: blur(...)`, semi-transparent backgrounds

**CSS layers** (load order):
1. Bootstrap 4.4.1
2. `beautifuljekyll.css` (theme base)
3. `bootstrap-social.css`
4. `pygment_highlights.css` (code blocks)
5. `/assets/css/custom-styles.css` (project-specific overrides)

Custom styles include:
- Page title sizing (`3rem`)
- Italic centered tagline
- Card hover effects (`4px border-radius`)
- Post preview max-width (`900px`)

---

## Multilingual Support

`_data/ui-text.yml` provides UI strings in 40+ languages (for comment system labels, buttons, etc.). Controlled by the `lang` front matter field on pages/posts.

---

## Notable Constraints

- **`.env` exists at repo root** — holds X API credentials and OpenSea API key for local tooling only. Never commit it (gitignored). See `.env.example` for required keys.
- **No npm/Node.js** — adding JS dependencies requires either bundling manually or loading via CDN and updating the HTML directly.
- **Image assets are large** (~47 MB of images in `assets/img/`). Avoid committing uncompressed images.
- **Beautiful Jekyll upstream** — the repo has `https://github.com/daattali/beautiful-jekyll.git` set as upstream. Theme changes should be reconciled carefully to avoid merge conflicts.
- **`oldviewer.html.BACKUP`** — stale backup file in root; not served by Jekyll but present in the repo.

---

## X Posting Commands

Slash commands in `.claude/commands/`:

- **`/post --artist <name>`** — pick random media from `~/Desktop/pixel-exports/{artist}/`, generate posts for all three profiles, post after approval
- **`/mint-post --collection <name>`** — NFT mint announcement post

### Profiles
| Handle | Voice |
|--------|-------|
| `@PixelonKas` | Project voice — clean, direct, EN |
| `@marekozor` | Personal voice — reflective, first person, EN only |
| `@synthicoin` | Punk experimental — raw, poetic, never promotional |

All posts require per-profile approval before sending. All posts include `pixel-on-kaspa.fyi`.

### API credentials (`.env`, never commit)
- `PIXELONKAS_`, `MAREKOZOR_`, `SYNTHICOIN_` prefixes for X API (API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_TOKEN_SECRET, BEARER_TOKEN)
- `OPENSEA_API_KEY` — used by `/post --artist marekozor` to fetch NFT images

### Media folders
| Folder | Source |
|--------|--------|
| `~/Desktop/pixel-exports/yohei/` | GLSL shader exports |
| `~/Desktop/pixel-exports/koma/` | Koma exports |
| `~/Desktop/pixel-exports/sykora/` | Sykora exports |
| `~/Desktop/pixel-exports/marekozor/` | Fetched live from OpenSea API |

For `--artist marekozor`, images are fetched from OpenSea collections: `deepmemory` (Polygon), `sphericalharmony` (Polygon), `angryheadsv2` (Ethereum).

---

## NFT Collections

- `kaspa.com/nft/collections/PIXELONKAS` — primary pixel art collection (342 max)
- `kaspa.com/nft/collections/SYKORA` — generative art by David Vrbík (2518 max); **Ice NFTs are special/rare** (Style trait = "Ice")

---

## Rewards Tracker

- **File:** `admin/rewards-tracker.html` — password: `pixel2025`
- Loads PIXELONKAS and SYKORA NFT data from `mainnet.krc721.stream` API
- **ICE badge** — SYK rows show a cyan ICE badge (auto-set for Ice trait, toggleable per row, persisted in localStorage under `pxr_ice_SYKORA_{id}`)
- **Mint date column** — fetched via two-step API chain:
  1. `GET /api/v1/krc721/mainnet/history/{tick}/{id}?direction=forward&limit=1` → `opScoreMod`
  2. `GET /api/v1/krc721/mainnet/ops/score/{opScoreMod}` → `mtsAdd` (Unix ms timestamp)

---

## Git & GitHub

- **Remote**: `https://github.com/Pixel-on-Kaspa/Pixel-on-Kaspa.github.io.git`
- **Branch**: `master` (default and deployment branch)
- **Upstream**: Beautiful Jekyll theme repo (for theme updates)
- Comments system (`staticman.yml`) is configured but currently disabled.
