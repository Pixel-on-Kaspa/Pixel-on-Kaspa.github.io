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
├── yohei-glsl.html      # WebGL GLSL shader visualizer
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
- `viewer.html`, `pixel-p5.html`, `yohei-glsl.html`, `artists.html` — standalone HTML pages with embedded JS/CSS

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

Real-time GLSL shader-based visual renderer. Source in `js/yohei-glsl.js`.

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

- **No environment variables or secrets** — the site is fully static; GitHub Pages doesn't support server-side secrets. No `.env` files exist or are needed.
- **No npm/Node.js** — adding JS dependencies requires either bundling manually or loading via CDN and updating the HTML directly.
- **Image assets are large** (~47 MB of images in `assets/img/`). Avoid committing uncompressed images.
- **Beautiful Jekyll upstream** — the repo has `https://github.com/daattali/beautiful-jekyll.git` set as upstream. Theme changes should be reconciled carefully to avoid merge conflicts.
- **`oldviewer.html.BACKUP`** — stale backup file in root; not served by Jekyll but present in the repo.

---

## Git & GitHub

- **Remote**: `https://github.com/Pixel-on-Kaspa/Pixel-on-Kaspa.github.io.git`
- **Branch**: `master` (default and deployment branch)
- **Upstream**: Beautiful Jekyll theme repo (for theme updates)
- Comments system (`staticman.yml`) is configured but currently disabled.
