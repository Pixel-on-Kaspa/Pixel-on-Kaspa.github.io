# NFT Collection Fetch — Endpoint Map

**Updated:** 2026-07-04 · **Why:** the public KSPR indexer `mainnet.krc721.stream` had a full origin outage (HTTP 521), which broke NFT rendering on `index.html` and `viewer.html`. Root cause was the **host**: kaspa.com runs its own KSPR-compatible indexer mirrors that stay up, and we were pointed at the dead public host. The fetch layer now uses kaspa.com's own live, CORS-`*` sources.

## Sources (all verified live + browser-callable from pixel-on-kaspa.fyi)

| Data | Endpoint | CORS |
|------|----------|------|
| ranges (per-id mint status), owners, nfts, ops/history | `https://krc721-indexer.kaspa.com/api/v1/krc721/mainnet/…` (primary)<br>`https://krc721-indexer-2.kaspa.com/api/v1/krc721/mainnet/…` (fallback) | `*` |
| Per-token **metadata** | `https://krc721-cache.kaspa.com/krc721/mainnet/metadata/{TICK}/{id}` | `*` |
| Per-token **image** (optimized, CDN) | `https://krc721-cache.kaspa.com/krc721/mainnet/optimized/{TICK}/{id}` | `*` |
| Collection stats + holders | `https://api.kaspa.com/krc721/{TICK}` → `totalSupply`, `totalMinted`, `totalHolders`, `holders[]` | our domain |

These are the exact hosts kaspa.com's own frontend uses (found in its bundle config: `krc721Api`, `krc721ApiFallback`, `krc721CacheStreamUrl`). The indexer mirrors are **KSPR-API-compatible** (`{message, result}` envelope, same `ranges` / `owners/{tick}` / `nfts/{tick}/{id}` / `ops/score/{id}` paths) — so existing KSPR-shaped code works with just a base-URL swap.

Dead: `mainnet.krc721.stream` (521). Not useful for our collections: `api.kaspa.com/api/krc721/tokens` (marketplace only — empty for PIXELONKAS/SYKORA), `api.kasplex.org` (KRC-20 only).

## Implementation (index.html + viewer.html)

- **Indexer**: `API_BASES` array + `fetchIndexer(suffix)` helper that tries the primary mirror then the `-2` fallback. Used for `ranges`, `owners`/`nfts` (owner), and `ops/score` (recent mint).
- **Images**: optimized CDN first (`optimizedImg`), IPFS gateways (viewer) / static bundled cover (index) as fallback — faster than the old IPFS-only path.
- **Metadata**: kaspa.com cache first (`fetchTokenMeta`), IPFS gateways as fallback.
- **Collection stats**: `api.kaspa.com/krc721/{TICK}` for accurate minted count/supply.
- **Result**: `viewer.html` shows only minted tokens (from `ranges`) with the "Minted" badge and per-token owner in the lightbox; `index.html` hero shows the real most-recent mint. If both indexer mirrors ever go down, the code degrades gracefully (viewer shows the full collection sans badge; hero falls back to the configured `featured` id).

## Not migrated

`admin/rewards-tracker.html` still points at `mainnet.krc721.stream`. It needs `ranges` + `history` + `ops/score`, all of which the mirrors provide — fix is the same base-URL swap to `API_BASES` when needed.

## Re-verify quickly

```
curl -s https://krc721-indexer.kaspa.com/api/v1/krc721/mainnet/ranges/PIXELONKAS
curl -s https://krc721-indexer.kaspa.com/api/v1/krc721/mainnet/nfts/PIXELONKAS/259   # → result.owner
curl -s https://krc721-cache.kaspa.com/krc721/mainnet/metadata/PIXELONKAS/259
curl -s https://api.kaspa.com/krc721/PIXELONKAS | head -c 120
```
