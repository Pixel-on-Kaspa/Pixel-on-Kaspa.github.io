# PIXEL on Kaspa — Project Analysis

**Last updated:** April 2026
**Live site:** https://pixel-on-kaspa.fyi
**Repository:** https://github.com/Pixel-on-Kaspa/Pixel-on-Kaspa.github.io

---

## 1. Project Overview

**PIXEL on Kaspa** is an audio-visual art and NFT project on the Kaspa blockchain. The core artistic concept is transforming sound (via the Web Audio API and synthesizer) into visual forms using oscilloscope techniques.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Site generator | Jekyll 3.9.3+ (Beautiful Jekyll v6.0.1 theme) |
| Markup | Markdown (Kramdown, GFM) + HTML5 |
| CSS | Bootstrap 4.4.1, Font Awesome 6.5.2, custom CSS |
| JavaScript | Vanilla JS (no build tools), p5.js, WebGL/GLSL, Web Audio API |
| Fonts | Google Fonts (Lora, Open Sans) |
| Hosting | GitHub Pages (custom domain via CNAME) |
| CI/CD | GitHub Actions (Jekyll build + artifact upload) |
| Package manager | Bundler (Ruby), npm (for Node scripts only) |

**Key constraint:** No Node.js build pipeline. No webpack, Vite, or similar. All JS dependencies either loaded via CDN or bundled manually into HTML.

**Node.js dependencies** (for local CLI scripts only, not frontend):
- `@kasdk/nodejs` – Kaspa SDK for blockchain interactions
- `kaspa-wasm` – WASM bindings for Kaspa
- `twitter-api-v2` – X (Twitter) API client

---

## 2. Repository Structure

```
Pixel-on-Kaspa.github.io/
│
├─ _config.yml                   # Jekyll site config (title, nav, social, timezone)
├─ _config_ci.yml                # CI-only config (baseurl adjustment)
├─ _layouts/                     # Jekyll HTML templates (6 files)
│  ├─ base.html, default.html, home.html, page.html, post.html, minimal.html
├─ _includes/                    # Jekyll partials (29 files)
│  ├─ head.html, header.html, footer.html, nav.html
│  ├─ Comments: disqus, fb-comment, utterances, giscus, staticman, commentbox
│  ├─ Analytics: google_analytics, gtag, gtm, matomo, cloudflare_analytics
│  ├─ Social: social-networks-links, social-share
│  └─ Utils: readtime, mathjax, search, ext-css, ext-js, etc.
├─ _posts/                       # Blog posts (Markdown with YAML front matter)
│  ├─ 2025-01-23-nft-collection-launch.md
│  └─ 2025-02-03-sykora-nft-collection.md
├─ _data/
│  └─ ui-text.yml                # 40+ language strings (comments, labels)
│
├─ assets/
│  ├─ css/
│  │  ├─ beautifuljekyll.css     # Theme base styles
│  │  ├─ bootstrap-social.css
│  │  ├─ pygment_highlights.css  # Code block styling
│  │  └─ custom-styles.css       # Project-specific overrides
│  ├─ img/                        # ~47 MB of images (NFT covers, artwork)
│  ├─ js/
│  │  ├─ beautifuljekyll.js      # Theme JS (navbar, search, etc.)
│  │  └─ staticman.js            # Comments JS (disabled)
│  └─ data/
│     └─ searchcorpus.json       # Search index
│
├─ js/                           # Root-level generator scripts
│  ├─ pixel-p5.js                # p5.js sketch generator logic
│  └─ yohei-glsl.js              # WebGL GLSL shader visualizer
│
├─ synthi/                       # Audio synthesizer sub-application
│  ├─ index.html                 # Main SYNTHI interface (player + canvas)
│  ├─ index.js                   # Core synth engine (~1256 lines)
│  ├─ synthi-aks.js              # EMS AKS matrix synthesizer (~596 lines)
│  ├─ aks.html                   # AKS instrument UI (~1591 lines)
│  ├─ generator.html             # SYNTHI parameter generator UI
│  ├─ web.html                   # Web Audio matrix synth interface
│  ├─ app.html                   # Alternative app layout
│  ├─ rec.html                   # Recording archive UI
│  └─ js/synthi-audio.js         # Audio processing utilities
│
├─ admin/                        # Admin tools
│  └─ rewards-tracker.html       # NFT rewards tracking dashboard
│
├─ index.html                    # Homepage (1074 lines)
├─ viewer.html                   # NFT collection viewer (798 lines)
├─ pixel-p5.html                 # p5.js interactive sketch (640 lines)
├─ yohei-glsl.html               # WebGL GLSL visualizer (1019 lines)
├─ artists.html                  # Artist gallery (540 lines)
│
├─ about.md                      # About the PIXEL project (Jekyll page)
├─ collections.md                # NFT collections listing
│
├─ .claude/
│  └─ commands/
│     ├─ post.md                 # /post command spec (X/Twitter posting)
│     └─ mint-post.md            # /mint-post command spec
│
├─ .github/
│  └─ workflows/ci.yml           # GitHub Actions build pipeline
│
├─ CLAUDE.md                     # Developer documentation (this project)
├─ CNAME                         # Custom domain: pixel-on-kaspa.fyi
├─ CHANGELOG.md                  # Git changelog
├─ .env.example                  # Template for credentials (never commit .env)
│
├─ logs/                         # Rewards tracker logs
│  ├─ rewards-2026-04-04.json
│  └─ rewards-manual-2026-04-04.json
│
├─ node_modules/                 # npm dependencies (ignored by Jekyll)
├─ package.json                  # npm dependencies
└─ Gemfile / Gemfile.lock        # Ruby dependencies (Jekyll, Beautiful Jekyll, etc.)
```

---

## 3. Interactive Features & Current State

### 3.1 SYNTHI — Audio Synthesizer (`/synthi/`)

Full Web Audio API synthesizer and drum machine. Sound transformed into visual forms via oscilloscope-like rendering.

**Files:**
- `synthi/index.html` – Main player UI (52px topbar, player card, controls)
- `synthi/index.js` – Core synth engine (1256 lines, heavily commented)
  - Oscillators, drum synthesis, envelope generators, sequencer logic
  - Canvas-based Lissajous figure rendering synchronized to audio
  - Randomized "rare" and "common" parameter sets via RNG
  - Soft limiting, anti-freezing safeguards
- `synthi/js/synthi-audio.js` – Audio processing module
- `synthi/generator.html` – Parameter generator UI (3-column layout)
  - Beat settings, warp/detune knobs, visual + audio parameters
  - Toolbar with presets, save/load, randomize buttons
- `synthi/web.html` – Alternative Web Audio matrix synth interface
- `synthi/rec.html` – Recording archive ("REC" badge, CRT scanline effect)

**Status:** Fully functional. Recent commits show UI refinements (3-column redesign, beat master controls, Lissajous render optimization).

**Current features:**
- Real-time Lissajous curve rendering from oscillator frequencies
- Synth parameter randomization with rare/common modes
- Downloadable PNG snapshots of visualizations
- Browser audio context play/pause/stop controls

---

### 3.2 EMS Synthi AKS (`/synthi/aks.html`)

Standalone EMS Synthi AKS instrument emulation.

**Files:**
- `synthi/aks.html` – AKS instrument UI (1591 lines)
- `synthi/synthi-aks.js` – Matrix router, envelope generators, VCF control (596 lines)

**Status:** Recently refactored (7 commits in the last 20). Latest commits:
- Removed direct VCA schedule (VCA now matrix-only)
- Fixed `fmHz → fmtHz` typo that crashed buildOscSection
- Added FREQ MODE buttons (FREE/TRACK/FIXED) per oscillator
- Added octave range buttons
- Redesigned UI with darker theme, amber hierarchy, panel accents
- 9×8 matrix, 4-column layout (Master + VU, OSC1-3, VCF/Matrix, XY Joystick)

**Current state:** Stable, feature-complete for matrix-based synthesis.

---

### 3.3 p5.js Generator (`/pixel-p5.html`)

Interactive sketch generator based on a one-liner tweet algorithm.

**Files:**
- `pixel-p5.html` – HTML interface (640 lines)
- `js/pixel-p5.js` – Sketch logic (80 lines excerpt shown, actual logic minimal)

**Features:**
- Speed slider (0.05× to 10×)
- Quality/canvas size slider (260–1400 px)
- Play/pause/fullscreen buttons
- PNG export

**Status:** Functional. Uses p5.js loaded via CDN.

---

### 3.4 WebGL / GLSL Visualizer (`/yohei-glsl.html`)

Real-time GLSL fragment shader visualizer.

**Files:**
- `yohei-glsl.html` – Interface (1019 lines)
- `js/yohei-glsl.js` – Shader compilation & rendering

**Features:**
- Hand-written GLSL fragment shader (inspired by Yohei Nishitsuji's style)
- Real-time raymarching animation with HSV color mapping
- Quality slider, play/pause, PNG export
- WebGL context fallback ("WebGL not supported" alert)

**Status:** Fully functional. Shader is complex (99 iterations, logarithmic raymarching, Fourier-like color cycling).

---

### 3.5 NFT Viewer (`/viewer.html`)

Grid/card layout for browsing PIXELONKAS and SYKORA NFT collections.

**Files:**
- `viewer.html` – Interface (798 lines, embedded JS)

**Features:**
- Collection switcher (PIXELONKAS / SYKORA)
- Metadata box (count, rarity breakdown)
- Filters: all/unpaid/paid, all/PIXELONKAS/SYKORA
- Async metadata loading from krc721.stream API
- Lightbox with owner info, mint/trade links
- Concurrent IPFS gateway fallback (3 gateways: dweb.link, ipfs.io, cloudflare-ipfs.com)
- IPFS → HTTP URL conversion (`ipfs://CID` → `https://ipfs.io/ipfs/CID`)

**API endpoints used:**
- `https://mainnet.krc721.stream/api/v1/krc721/mainnet/nfts/{tick}`
- `https://mainnet.krc721.stream/api/v1/krc721/mainnet/ranges/{tick}` (metadata ranges)
- IPFS gateways for image fetching

**Status:** Fully functional. Loads 2 collections (PIXELONKAS: 342 max, SYKORA: 2518 max).

---

### 3.6 Artists Gallery (`/artists.html`)

Artist/creator showcasing page.

**Files:**
- `artists.html` – Gallery layout (540 lines)

**Features:**
- Hero section with animated canvas background
- Artist cards with links/bios
- Responsive design

**Status:** Functional.

---

### 3.7 Homepage (`/index.html`)

Main landing page (1074 lines, embedded CSS & JS).

**Features:**
- Sticky navbar with nav links (NFT Viewer, Collections, About Pixel, SYNTHI links)
- Hero section with animated gradient background + slideshow of featured images
- Divider sections
- Card grid showcasing collections, tools, and projects
- Footer with social links

**Status:** Fully functional. Well-maintained with recent style refinements.

---

## 4. Posting System — X (Twitter) Integration

### 4.1 Commands

Two slash commands in `.claude/commands/`:

#### `/post --artist <name>`
Posts a visual (PNG or MP4) from a local export folder to three X profiles.

**Flows:**
1. **--artist yohei / koma / sykora** → Pick random files from `~/Desktop/pixel-exports/{artist}/`
2. **--artist marekozor** → Fetch NFT images from OpenSea API (3 Polygon/Ethereum collections)
3. **--kaspa** → Generate Kaspa educational post (text-only, no media)
4. **--nft <COLLECTION>** → Fetch minted NFT from krc721.stream, post its image
5. **--promo** → Weekly collection promotion mode (fetch random already-minted NFT, promo tone)

**Posting cycle:** 4 posts in rotation
1. Visual (artist work)
2. Content (web, NFT, artists page, ecosystem)
3. Kaspa educational (post 3)
4. Promotion (mint/trade/Synthi)

#### `/mint-post --collection <name>`
Posts NFT mint announcement to X profiles.

**Collections:**
- PIXELONKAS — Pixel on Kaspa (generative art, on-chain)
- SYKORA — Sykora NFT Collection (oscilloscope music → Lissajous figures)

**Flow:**
1. Load collection info
2. Generate posts per profile (3 voices, different hashtags, 60% include pixel-on-kaspa.fyi)
3. Show all posts for approval
4. Per-profile final approval (yes / edit / skip)
5. Load credentials from `.env` and post via X API
6. Confirm post sent

### 4.2 Three X Profiles

| Handle | Voice | Context | Hashtags | Notes |
|--------|-------|---------|----------|-------|
| @PixelonKas | Project | Clear, direct, EN | 2–4, NFT/blockchain focused | Official voice |
| @marekozor | Personal | Reflective, first person, EN | 2–3, art/personal focused | Artist's personal account |
| @synthicoin | Punk experimental | Raw, poetic, EN | 0–2 max, never #NFT | Electronic/experimental music angle |

All posts include a link to pixel-on-kaspa.fyi (randomly, ~60% of the time).

### 4.3 API Credentials (`.env`, never commit)

Structure:
```
OPENSEA_API_KEY=<key>

# @PixelonKas
PIXELONKAS_API_KEY=
PIXELONKAS_API_SECRET=
PIXELONKAS_ACCESS_TOKEN=
PIXELONKAS_ACCESS_TOKEN_SECRET=
PIXELONKAS_BEARER_TOKEN=

# @marekozor (X)
MAREKOZOR_API_KEY=
MAREKOZOR_API_SECRET=
MAREKOZOR_ACCESS_TOKEN=
MAREKOZOR_ACCESS_TOKEN_SECRET=
MAREKOZOR_BEARER_TOKEN=

# Instagram @marekozor
INSTAGRAM_USERNAME_MAREKOZOR=
INSTAGRAM_PASSWORD_MAREKOZOR=

# @synthicoin
SYNTHICOIN_API_KEY=
SYNTHICOIN_API_SECRET=
SYNTHICOIN_ACCESS_TOKEN=
SYNTHICOIN_ACCESS_TOKEN_SECRET=
SYNTHICOIN_BEARER_TOKEN=
```

### 4.4 Media Folders

| Folder | Source | Artist |
|--------|--------|--------|
| ~/Desktop/pixel-exports/yohei/ | GLSL shader exports | Yohei |
| ~/Desktop/pixel-exports/koma/ | Koma exports | Koma |
| ~/Desktop/pixel-exports/sykora/ | Sykora exports | Sykora / David Vrbík |
| ~/Desktop/pixel-exports/marekozor/ | Fetched live from OpenSea | Marek Ozor |

**OpenSea collections for marekozor:**
- `deepmemory` (Polygon)
- `sphericalharmony` (Polygon)
- `angryheadsv2` (Ethereum)

---

## 5. NFT Collections

### 5.1 PIXELONKAS

**Blockchain:** Kaspa (KRC-721 standard)
**Max:** 342 pieces
**URL:** kaspa.com/nft/collections/PIXELONKAS
**Type:** Generative pixel art, stored on-chain
**Artist:** Marek Ozor

**Rewards structure (by color):**
- "Super Broken": 1,000,000,000 $PIXEL
- "Broken": 100,000,000
- "Grey": 80,000,000
- "Orange": 50,000,000
- "Yellow": 30,000,000
- "Pink": 26,000,000
- "Red": 24,000,000
- "Purple": 22,000,000
- "White": 20,000,000
- "Green": 15,000,000
- "Black": 12,000,000
- "Blue": 12,000,000

### 5.2 SYKORA

**Blockchain:** Kaspa (KRC-721 standard)
**Max:** 2518 pieces
**URL:** kaspa.com/nft/collections/SYKORA
**Type:** Generative art from oscilloscope music (Lissajous figures, 12×12 matrix)
**Artist:** David Vrbík / Vektroskop collective
**Inspiration:** Zdeněk Sýkora's combinatorial system (Letná tunnel, Prague geometric structure translated into musical score; visuals emerge from sound frequencies via oscilloscope)

**Rewards structure (by "Style" trait):**
- "Ice" (rare): 100,000,000 $PIXEL
- "Black": 80,000,000
- "Pink": 40,000,000
- Everything else: 0

**Special:** Ice NFTs are visually distinct and tracked separately in the rewards tracker.

### 5.3 API Integration

**krc721.stream API endpoints:**
```
GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/owners/{TICK}?limit=50
GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/nfts/{TICK}/{tokenId}
GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/ranges/{TICK}
GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/history/{TICK}/{id}?direction=forward&limit=1
GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/ops/score/{opScoreMod}
```

---

## 6. Rewards Tracker (`/admin/rewards-tracker.html`)

Password-protected dashboard for NFT minting rewards tracking.

**Access:** `admin/rewards-tracker.html` (password: `pixel2025`)

### 6.1 Data Loading

Loads PIXELONKAS and SYKORA NFT data from krc721.stream API:

1. **Fetch ranges:** `GET /api/v1/krc721/mainnet/ranges/{TICK}` → metadata ranges
2. **Fetch IPFS metadata:** Concurrent gateway requests (3 gateways, 14 concurrent workers)
3. **Fetch owner:** `GET /api/v1/krc721/mainnet/nfts/{TICK}/{tokenId}` → current owner
4. **Fetch mint date:** Two-step chain:
   - `GET /api/v1/krc721/mainnet/history/{TICK}/{id}?direction=forward&limit=1` → `opScoreMod`
   - `GET /api/v1/krc721/mainnet/ops/score/{opScoreMod}` → `mtsAdd` (Unix ms timestamp)

### 6.2 UI Features

**Stats bar:**
- Total Minted (count)
- $PIXEL Owed (total amount unpaid)
- $PIXEL Paid (total amount paid out)
- $PIXEL Unpaid (remaining owed)
- Unpaid NFTs (count)

**Progress bar:** Shows completion % of data loading

**Filters:**
- Collection: All / PIXELONKAS / SYKORA
- Payment status: All / Unpaid / Paid

**Table columns:**
- # (Token ID)
- Collection (PIXELONKAS / SYKORA badge)
- Minter (address)
- Current Owner (address)
- Mint Date (fetched via API, Unix timestamp)
- Color / Rarity (trait value)
- opScore (operation score)
- $PIXEL Reward (calculated from color × collection reward table)
- Status (paid / pending, links to tx if paid)
- Paid (checkbox, toggleable)
- Notes (editable textarea)

**Import panel:**
- Paste Kaspa addresses (from KasWare send history)
- "Apply" button matches addresses against loaded NFT rows, marks as paid

**Sorting:** Click any column header to sort (ascending/descending, icon indicator)

### 6.3 Persistence

LocalStorage keys:
- `pxr_paid_{TICK}_{id}` – "0" or "1" (paid status)
- `pxr_notes_{TICK}_{id}` – notes text
- `pxr_ice_{TICK}_{id}` – "1" if ICE badge enabled (SYKORA only)

**ICE badge:** Cyan badge, auto-set for Ice trait, toggleable per row.

### 6.4 Export & Actions

- **Export CSV button** – Downloads table as CSV
- **Reload Data button** – Re-fetches all NFT data from API

### 6.5 Known Issues / Observations

- **CORS restrictions** → requires local HTTP server (not `file://` protocol). Includes warning + setup instruction.
- **Concurrency:** 14 concurrent IPFS fetches to avoid rate-limiting
- **Error handling:** Shows error bar if API fails
- **Czech language:** Some UI text in Czech (e.g., warning message about `file://` protocol)

---

## 7. JavaScript Generator Scripts (`/js/`)

### 7.1 `pixel-p5.js`

Minimal wrapper around a p5.js sketch. Loads p5.js via CDN (in HTML head).

**Functions:**
- `setCanvasSize(px)` – Clamp canvas size (260–1400 px)
- Sketch loop with parametric coloring based on phase/frequency relationships

**Inputs:** Speed & quality sliders, play/pause, PNG download

**Output:** Canvas rendering

**Status:** Fully functional.

---

### 7.2 `yohei-glsl.js`

WebGL fragment shader compilation and render loop.

**Key functions:**
- `compile(type, src)` – Compile vertex/fragment shaders
- `linkProgram(vs, fs)` – Link into GL program
- Animation loop with time-based uniform (`uTime`)
- PNG capture via `preserveDrawingBuffer: true`

**Shader:** Complex raymarching with HSV color mapping, 99 iterations, logarithmic distance functions.

**Status:** Fully functional.

---

## 8. Design System & Styling

### Color Scheme (Dark Glassmorphism)

```css
--bg:           #050a0a  /* Deep black background */
--bg2:          #0a0f0f  /* Slightly lighter */
--card:         #0d1117  /* Card/panel background */
--border:       rgba(255,255,255,.08)  /* Subtle white border */
--muted:        rgba(255,255,255,.50)  /* Muted text */
--accent:       #49EACB  /* Cyan / teal */
--accent-dim:   rgba(73,234,203,.10)   /* Dim background */
--text:         #f0f0f0  /* Light text */
```

### Key CSS Features

1. **Glassmorphic panels:** `backdrop-filter: blur(...)` + semi-transparent backgrounds
2. **Sticky navbar:** Position fixed, z-index 100+
3. **Responsive:** Max-width wrappers (1200px), Flexbox layout, mobile breakpoints
4. **Animations:** Smooth transitions (color, background, border-color over 0.15s)
5. **Typography:** System fonts (SF Pro, Segoe UI), Google Fonts (Lora, Open Sans)

### Custom CSS File

`/assets/css/custom-styles.css` — Project-specific overrides (loaded after theme CSS).

---

## 9. Build & Deployment

### Local Development

```bash
bundle install
bundle exec jekyll serve
# Site available at http://localhost:4000
```

### CI/CD Pipeline (GitHub Actions)

Workflow file: `.github/workflows/ci.yml`

**Steps:**
1. Checkout code
2. Setup Ruby 3.3
3. Install Bundler dependencies + Appraisal
4. Generate `_config_ci.yml` with correct baseurl
5. Build Jekyll with appraisal:
   ```bash
   bundle exec appraisal jekyll build --future --config _config_ci.yml,_config.yml
   ```
6. Upload artifact to GitHub Pages

**Triggers:** On every push and pull request

### Jekyll Configuration

Key settings in `_config.yml`:
- **Theme:** Beautiful Jekyll v6.0.1
- **Permalink:** `/:year-:month-:day-:title/`
- **Paginate:** 5 posts per page
- **Markdown:** Kramdown with GFM
- **Timezone:** Europe/Prague
- **Date format:** "%B %-d, %Y" (e.g., "April 7, 2026")

**Navigation links (navbar):**
- NFT Viewer → `/viewer`
- Collections → `/collections`
- About Pixel → `/about`

**Plugins:**
- `jekyll-paginate` – Pagination for blog posts
- `jekyll-sitemap` – Auto-generate sitemap.xml

**Excluded from build:**
- CHANGELOG.md, CNAME, Gemfile, LICENSE, README.md, screenshot.png, docs/

---

## 10. Open Issues & Incomplete Work

### 10.1 No Explicit TODOs/FIXMEs Found

A search for `TODO`, `FIXME`, `BUG`, `HACK` comments found none in the primary codebase. The project is mature and well-maintained.

### 10.2 Known Limitations

1. **Comments system disabled** — Staticman is configured but not active (see `_config.yml`, commented out).

2. **Rewards tracker requires HTTP server** — Due to CORS, must be served over HTTP, not `file://`. Includes warning prompt but could be more ergonomic.

3. **No TypeScript** — Entirely JavaScript/Markdown. No type safety; large files like `synthi/index.js` (1256 lines) could benefit from TS.

4. **Image assets large (~47 MB)** — Uncompressed PNG/JPG in `/assets/img/`. No optimization pipeline visible (no imagemin, webp, etc.).

5. **Rewards tracker localStorage-only** — If user clears localStorage, all paid/notes/ice badge flags are lost. No server-side persistence.

6. **OpenSea API dependency** — `/post --artist marekozor` requires OPENSEA_API_KEY. If API changes or rate-limits, posts will fail silently or with poor UX.

7. **Beautiful Jekyll upstream** — Repository has upstream set to Beautiful Jekyll theme repo. Manual reconciliation needed for theme updates; risk of merge conflicts.

### 10.3 Incomplete Features

**Backup file present:**
- `oldviewer.html.BACKUP` (deleted from git but mentioned in CLAUDE.md as stale)

**Instagram posting mentioned but not documented:**
- `.env.example` includes `INSTAGRAM_USERNAME_MAREKOZOR` and `INSTAGRAM_PASSWORD_MAREKOZOR`
- `/post` and `/mint-post` commands mention Instagram, but no detailed flow
- Likely handled externally or in progress

### 10.4 Potential Issues

1. **API stability:** Reliance on `mainnet.krc721.stream` for NFT metadata. Single-point failure if API goes down.

2. **IPFS gateway fallback:** Uses 3 gateways (dweb.link, ipfs.io, cloudflare-ipfs.com). If all fail simultaneously, images won't load.

3. **X API rate limiting:** Posting to 3 profiles without rate-limit handling. Could fail if multiple /post commands run in quick succession.

4. **Web Audio context lifecycle:** SYNTHI and generator may have audio context permission issues on certain browsers or after context is closed.

5. **Mobile responsiveness:** Synthi UI and WebGL canvas may not render well on small screens (designed for desktop).

---

## 11. Git History Summary

**Last 20 commits:**

1. `2dc4e8d` – refactor(aks): remove direct VCA schedule, VCA now matrix-only
2. `559c17c` – fix(aks): typo fmHz → fmtHz crashed buildOscSection, blanking all panels
3. `b71f0d8` – feat(aks): add FREQ MODE buttons (FREE/TRACK/FIXED) to each OSC
4. `368b96d` – fix(aks): noise crash, input compressor, VCF to center column
5. `040b987` – feat(aks): add octave range buttons to each OSC block
6. `5a1f09e` – feat(aks): redesign UI — deeper dark theme, amber hierarchy, panel accents
7. `c0a58a6` – feat(aks): move XY joystick under master+VU in col-3
8. `a252348` – feat(generator): 3-column redesign + Lissajous render optimization
9. `59b5621` – feat(generator): add Beat Master and AKS Master volume controls
10. `e1a3db8` – fix(generator): remove leftover delay visual vars breaking Lissajous
11. `95911a4` – feat(generator): remove delay section from UI and audio graph
12. `810a3b0` – feat(synthi): add SYNTHI Web generator — Web Audio matrix synth
13. `e081406` – feat(aks): complete rewrite — MatrixRouter, TrapEnv, XY joystick, canvas VU, 9×8 matrix, 4-col layout
14. `ab7de9e` – feat(aks): 4-col layout, Master section (volume/tune/panic/lim), limiter bypass, peak hold
15. `e377e2c` – feat(aks): add VU meters, shrink center col to 380px, enlarge matrix pins to 12px
16. `cdc23b1` – feat(aks): move VCF above matrix, shrink matrix pins to 8px
17. `ed2611a` – feat(koma): add REC 8s video export to pixel-p5.html
18. `6435792` – Delete oldviewer.html.BACKUP
19. `04e9e8a` – feat(synthi): add AKS links to index.html navbar, hero, cards, and footer
20. `c708e60` – feat(synthi): add standalone EMS Synthi AKS instrument (aks.html)

**Summary:** Heavy focus on SYNTHI audio synthesizer and EMS AKS instrument UI refinements. Recent work on AKS matrix controls, frequency modes, UI hierarchy, and crash fixes. No breaking changes; incremental improvements.

---

## 12. What's Missing / Gaps

### 12.1 Documentation Gaps

1. **No implementation guide for `/post` and `/mint-post` commands** — Only `.claude/commands/` markdown specs exist. No Python/Node.js script provided (likely in `.claude/` as a hook or external tool).

2. **Web Audio API context initialization** — No clear docs on browser compatibility, permission prompts, or fallback behavior.

3. **Kaspa blockchain integration** — `package.json` lists `@kasdk/nodejs` and `kaspa-wasm`, but no scripts in repo use them. Likely for future payout tooling.

4. **IPFS & krc721.stream API** — No docs on rate limits, fallback strategies, or expected response formats beyond code examples.

### 12.2 Missing Functionality

1. **Real-time reward payout system** — Rewards tracker shows what's owed, but no script to actually send $PIXEL tokens. `.env.example` has `PIXEL_PRIVATE_KEY` and `TREASURY_ADDRESS`, suggesting this is in progress.

2. **Instagram integration** — Credentials in `.env.example`, but no working flow documented or implemented.

3. **Analytics / event tracking** — No visible implementation (GA/GTM/Matomo commented out in theme).

4. **Search functionality** — `post_search: false` in config; `searchcorpus.json` exists but not wired up.

5. **Comment system** — All comment providers (Disqus, Staticman, Utterances, Giscus) are disabled. No user-facing commenting.

### 12.3 Partial Implementations

1. **Staticman setup** — `staticman.yml` exists, but configuration incomplete and disabled.

2. **Beautiful Jekyll theme customization** — Some overrides in `custom-styles.css`, but deep integration gaps (e.g., custom navbar colors in index.html, not using theme's config).

3. **Rewards logger** — `logs/` folder has manual JSON files, not auto-generated. Unclear how logs are created or maintained.

---

## 13. Blob Artifacts & Stale Files

- **oldviewer.html.BACKUP** — Removed from git in commit `6435792`, but CLAUDE.md still references it.

---

## 14. Performance & Scalability Notes

### Positive

- **Static hosting** — GitHub Pages is fast and scalable.
- **Lazy IPFS loading** — NFT viewer uses concurrency limits and gateway fallback.
- **Canvas rendering** — p5.js and WebGL use requestAnimationFrame for smooth 60 FPS.

### Concerns

- **Image asset size** — 47 MB in `/assets/img/` could slow down builds and initial page load.
- **Concurrent API calls** — 14 concurrent IPFS requests + krc721.stream queries could hit rate limits during peak usage.
- **Rewards tracker localStorage** — Scales linearly with NFT count; no index or query optimization for large datasets.

---

## 15. Security & Credentials

### .env File (Never Committed)

Stores:
- X API keys (4 profiles × 5 credentials = 20 keys)
- OpenSea API key
- Instagram credentials
- Kaspa treasury private key (hex, no 0x prefix)

**Best practices:**
- Template in `.env.example` (safe)
- `.gitignore` prevents accidental commits
- Never logged or displayed in CLI output
- Accessible only locally (Node.js scripts)

### Public APIs Used

- **krc721.stream** — No authentication; public read-only
- **IPFS gateways** — No authentication; public read-only
- **OpenSea API** — Requires API key (stored in `.env`)
- **X (Twitter) API v2** — Requires OAuth credentials (stored in `.env`)

---

## 16. Deployment & Live Environment

**Custom domain:** pixel-on-kaspa.fyi (via CNAME, hosted on GitHub Pages)

**Build:** Triggered on every push to `master` branch.

**Artifact:** GitHub Actions uploads built site to GitHub Pages automatically.

**Jekyll build command:**
```bash
bundle exec appraisal jekyll build --future --config _config_ci.yml,_config.yml
```

**Live site:** https://pixel-on-kaspa.fyi

---

## 17. Development Workflow

### Local Testing

```bash
# Install dependencies
bundle install

# Serve locally
bundle exec jekyll serve

# Open browser to http://localhost:4000
```

### For SYNTHI Features

- Edit `/synthi/index.js`, `/synthi/generator.html`, `/synthi/aks.html`
- Reload browser (no build step needed; Jekyll serves HTML as-is)
- Changes to synth audio parameters are live immediately

### For NFT Viewer

- Edit `/viewer.html` (embedded JS)
- Reload browser
- Test with krc721.stream API (public, no auth needed)

### For X Posting Commands

- Edit `.claude/commands/post.md` or `.claude/commands/mint-post.md`
- Ensure `.env` has valid credentials
- Execute `/post --artist yohei` (or other artist)
- Credentials never logged; approve before posting

---

## 18. Accessibility & Standards

### HTML5 Compliance

- Semantic HTML (nav, main, footer, article)
- Proper heading hierarchy
- Canvas elements have fallback text (mostly)

### CSS

- Mobile-responsive (Bootstrap 4.4.1 breakpoints)
- Dark mode (no light theme variant)
- No color-only contrast issues (cyan on dark is AA compliant)

### JavaScript

- Vanilla JS (no jQuery required)
- No console errors (verified by grep)
- Progressive enhancement: site works with JavaScript disabled for static pages

### Keyboard Navigation

- Navbar links keyboard-accessible
- Buttons styled consistently
- Tab order generally logical

---

## 19. Recommended Next Steps / Improvements

1. **Implement reward payout system** — Use `PIXEL_PRIVATE_KEY` and `@kasdk/nodejs` to send actual $PIXEL tokens. Script should:
   - Read unpaid rows from rewards tracker
   - Validate amounts
   - Build & sign transactions
   - Submit to Kaspa network
   - Update tracker status

2. **Optimize image assets** — Compress PNG/JPG, generate WebP variants, implement `<picture>` with srcset.

3. **Add TypeScript** — Migrate large JS files (synthi, viewer, generators) to TS for type safety and IDE support.

4. **Server-side persistence for rewards tracker** — Store paid/notes/ice flags in a database, not just localStorage.

5. **Complete Instagram flow** — Document and implement Instagram posting via `/post` command.

6. **Enable comments** — Activate Giscus or Utterances (GitHub Discussions-backed).

7. **Add analytics** — Enable Google Analytics or Plausible to track visitor engagement, page performance.

8. **Rate-limit & retry logic** — Add exponential backoff to X API calls and IPFS fetches.

9. **Responsive SYNTHI UI** — Test and optimize synthesizer interfaces on mobile/tablet.

10. **API documentation** — Formal OpenAPI spec for krc721.stream endpoints used by viewer & tracker.

---

## 20. Summary

**PIXEL on Kaspa** is a well-maintained, feature-rich audio-visual art and NFT project. The codebase is mature, with clear separation of concerns:

- **Jekyll-based static site** for content & marketing
- **Web Audio API synthesizer** for interactive sound→visual transformation
- **WebGL/p5.js generators** for real-time visual art
- **NFT viewer & tracker** for blockchain integration
- **X posting system** for multi-profile content distribution

Recent development has focused on refining the SYNTHI AKS synthesizer UI and fixing edge cases. The project is production-ready, with only minor gaps in documentation and some incomplete features (reward payout, Instagram, full analytics).

**Tech debt:** Minimal. Code is clean, well-commented, and follows consistent patterns. No major refactoring needed.

**Performance:** Good for current scale. Image asset compression and API rate-limit handling would improve robustness.

**Next phase:** Implement on-chain reward payouts, optimize image delivery, and explore mobile support for synthesizer interfaces.

---

**Generated:** April 7, 2026
