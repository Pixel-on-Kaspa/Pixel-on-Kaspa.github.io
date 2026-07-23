# PixelGallery Worker — the platform API

The browser talks **only** to this Worker. Where artwork actually lives is hidden
behind a `StorageAdapter`, so swapping storage never touches the frontend.

```
Browser  →  Cloudflare Worker (/api/v1/*)  →  StorageAdapter
                                               ├─ MemoryAdapter  (dev / tests)
                                               ├─ PinataAdapter  (production)
                                               └─ R2 / Supabase  (future)
```

## API (versioned)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/publish` | `{ png, patch, lab, labId, labUrl, title, parentId }` → `{ id, item }` |
| GET | `/api/v1/gallery?limit=` | `{ items: [...] }` |
| GET | `/api/v1/artwork/:id` | `{ item }` — permalink resolution |
| GET | `/api/v1/artwork/:id/image` | image bytes (memory adapter; prod serves from the CDN/gateway URL) |

The Worker owns validation, id generation, image/permalink URL resolution, CORS,
and (later) auth + rate limiting. Adapters only persist.

## Local dev / tests — no Cloudflare, no Pinata

```bash
bun run worker/dev-server.mjs         # in-memory API on http://localhost:8787
```
Point the frontend at it (before `gallery.js` loads):
```html
<meta name="pixel-gallery-api" content="http://localhost:8787">
```
or `window.PIXEL_GALLERY_API_BASE = "http://localhost:8787"`, or
`PixelGallery.configure({ apiBase: "…" })`. With no API base set, the frontend
falls back to the local browser stub (per-device) so dev works with zero infra.

## Deploy to production (needs Cloudflare + the Pinata JWT)

```bash
cd worker
npx wrangler login
npx wrangler secret put PINATA_JWT          # paste the Pinata JWT — stays server-side
# edit wrangler.toml: PINATA_GATEWAY = your dedicated gateway; STORAGE = "pinata"
npx wrangler deploy
```
Then wire the site to the deployed URL (e.g. add to each Lab page + `gallery.html`,
before `js/gallery.js`):
```html
<meta name="pixel-gallery-api" content="https://pixel-gallery.<account>.workers.dev">
```

## Production-ready checklist (merge `gallery-rail` → `master` only when all pass)

- [x] publish works across browsers *(proven with MemoryAdapter)*
- [x] permalink works across browsers
- [x] remix works across browsers
- [x] gallery is shared
- [ ] same, verified against the **PinataAdapter** with a real JWT + gateway

## Note on storage

Pinata is great for the immutable **image** (and the eventual NFT). The gallery
**index** (list/sort) is a good candidate to move to Workers **KV** or **R2**
later — cheaper and faster to list than `pinList` + per-item gateway GETs. The
adapter interface makes that a one-file change.
