# Daily Visual Post
Post a visual (PNG or MP4) from a local artist export folder to X profiles.

## Usage
```
/post --artist <name>
/post --artist <name> --profile <handle>
/post --artist <name> --wip                # work in progress — show what's being built
/post --artist <name> --promo              # weekly collection promotion post
/post --kaspa                              # Kaspa educational post (post 3 in cycle)
/post --kaspa --topic <slug>               # specific Kaspa topic
/post --nft <collection>                   # NFT visual post — fetch random NFT from chain
```

`--artist` (required for visual posts): folder name inside `~/pixel-exports/` — e.g. `yohei`, `koma`, `deep-memory`
`--profile` (optional): `pixelonkas`, `marekozor`, `synthicoin` — if omitted, show all three and let user pick
`--wip` (optional): work in progress mode — different tone, shows process not result — see Step 1e
`--promo` (optional): weekly collection promotion mode — see Step 1b
`--kaspa` (optional): Kaspa educational post — see Step 1c
`--nft` (optional): fetch random minted NFT from chain — see Step 1d

---

## Posting cycle (6 posts)

| Post | Type | Command |
|------|------|---------|
| 1 | Visual — artist work | `/post --artist <name>` |
| 2 | Content — project info | `/post --kaspa --topic collections` nebo manuální |
| 3 | Kaspa educational #1 | `/post --kaspa` |
| 4 | Promo — collection spotlight | `/post --artist <name> --promo` |
| 5 | Visual — NFT from chain | `/post --nft <collection>` |
| 6 | Kaspa educational #2 | `/post --kaspa` |

**Promo rotace:** `PIXELONKAS → SYKORA → $PIXEL → SYNTHI → (opakovat)`
**Kaspa vzdělávací minimum:** 2× týdně (pozice #3 a #6)

---

## Step 1 — Find media files

Pick a separate random file per profile from `~/pixel-exports/$ARTIST/`. Each of the three X profiles gets a different file. Instagram @marekozor reuses the @marekozor X file.

### Export složky
```
~/pixel-exports/yohei/        — GLSL shader exporty (PNG/MP4)
~/pixel-exports/koma/         — p5.js Koma exporty (PNG/MP4)
~/pixel-exports/synthi/       — SYNTHI AKS exporty (PNG/MP4)
~/pixel-exports/deep-memory/  — marekozor OpenSea kolekce (fetch live)
```

> PIXELONKAS a SYKORA nemají lokální složku — média se načítají přes krc721.stream API a IPFS. Použij `--nft PIXELONKAS` nebo `--nft SYKORA`.

If the folder is empty or doesn't exist, stop:
```
No files found in ~/pixel-exports/$ARTIST/ — please export a file first.
```

### If --artist deep-memory (marekozor OpenSea collections)
Read `OPENSEA_API_KEY` from `.env`. If missing, stop:
```
OPENSEA_API_KEY not set in .env — please add it first.
```

For each profile (up to 3 separate picks), pick a random collection from:
- `deepmemory` (Polygon)
- `sphericalharmony` (Polygon)
- `angryheadsv2` (Ethereum)

Fetch NFTs:
```
GET https://api.opensea.io/api/v2/collection/{slug}/nfts?limit=50
Header: X-API-Key: {OPENSEA_API_KEY}
```

Pick a random NFT. Determine media type:
- If `display_animation_url` is present → video (MP4)
- Otherwise → image, use `original_image_url` (PNG)

Download to temp file:
- Video: `/tmp/marekozor_nft_{token_id[-8:]}.mp4`
- Image: `/tmp/marekozor_nft_{token_id[-8:]}.png`

Note: NFT name, collection, token ID, contract, media type per profile.

**Uploading to X:**
- Image: standard upload via `POST /1.1/media/upload.json`
- Video: chunked upload — INIT → APPEND (≤5 MB chunks) → FINALIZE → poll STATUS until `state=succeeded` (2s interval, 60s max)

If all collections fail, stop and report the error.

---

## Step 1b — Promo mode (--promo flag)

Weekly collection promotion. Replaces Step 1.

**Promo rotace:** `PIXELONKAS → SYKORA → $PIXEL → SYNTHI`

Ask the user which collection to promote if not clear from context.

### PIXELONKAS
- 342 unikátních NFT, KRC-721, mint 287 KAS
- Reward pool 10 miliard $PIXEL, rewards podle rarity
- Fetch random minted NFT přes krc721.stream (viz Step 1d)
- Mint link: `kaspa.com/nft/collections/PIXELONKAS`
- Tón: limitovaná kolekce, rewards systém, on-chain generativní umění

### SYKORA
- 2 518 NFT, minting stále probíhá
- Inspirováno Zdeňkem Sýkorou, osciloskop + Lissajous figury, matice 12×12
- Ice trait: 23 kusů, 100M $PIXEL + airdrop bonus
- Fetch random minted NFT přes krc721.stream
- Mint link: `kaspa.com/nft/collections/SYKORA`
- Tón: kulturní kontext, vzácné Ice traity, minting probíhá

### $PIXEL
- KRC-20 utilitní token
- 867M $PIXEL vyplaceno, 15 minterů, 0 nedoplatků
- Získáváš držením PIXELONKAS nebo SYKORA
- Trade link: `kaspa.com/tokens/marketplace/token/PIXEL`
- Žádné médium — text only nebo použij synthi/yohei export
- Tón: transparentnost, pasivní příjem, treasury je public

### SYNTHI
- V přípravě — audio-vizuální kolekce ze SYNTHI AKS syntezátoru
- Zvuk → vizuál → chain
- Médium: náhodný soubor z `~/pixel-exports/synthi/`
- Link: `pixel-on-kaspa.fyi/synthi/`
- Tón: teaser, experimentální — žádné konkrétní datum

All profiles share the same NFT image for promo posts. Include mint/trade link in every promo post.

---

## Step 1c — Kaspa post mode (--kaspa flag)

Post 3 and 6 in the cycle. Replaces Step 1 — no media needed.

Pick a topic — rotate, don't repeat same topic two cycles in a row. Or use `--topic <slug>` to specify.

| Slug | Topic | Key facts |
|------|-------|-----------|
| `blockdag` | BlockDAG vs blockchain | Parallel blocks, no orphan blocks, all work counts |
| `speed` | Confirmation speed | 1 BPS now, roadmap to 10 BPS, sub-second finality |
| `ghostdag` | GHOSTDAG protocol | DAG-based consensus, how it orders parallel blocks |
| `pow` | PoW without ASIC dominance | GPU-mineable, decentralized hashrate |
| `onchain` | Immutable on-chain data | Why NFT metadata stored on Kaspa is permanent |
| `standards` | KRC-20 & KRC-721 | Token standards, what they enable |
| `vs-bitcoin` | Kaspa vs Bitcoin | Same PoW philosophy, faster and more scalable |
| `intro` | Kaspa intro | What is Kaspa, how to start, how to buy KAS |
| `vs-eth` | Kaspa vs Ethereum/Solana | Facts, no FUD, no hype |
| `why-nft` | Why NFT on Kaspa | Decentralization, speed, low fees, KRC-721 |

**Profiles:**
- `@PixelonKas`: project context — tie Kaspa fact to why the project builds on it. 2–4 sentences. EN. Thread with `--long`.
- `@marekozor`: personal perspective — why this matters to him as an artist storing work on-chain. Reflective, first person. EN.
- `@synthicoin`: never a straight Kaspa educational post — generate experimental/art post instead. Pick any recent file from `~/pixel-exports/` or skip media. May touch on Kaspa or tech themes but through its own lens — raw, unexpected angle.

No media for @PixelonKas and @marekozor (text-only). @synthicoin still gets a visual if available.

Tone: educational, not hype. Short facts. No "moon", no price talk.

---

## Step 1d — NFT Visual mode (--nft flag)

Fetch a random minted NFT from a project collection.

**Supported collections:**

| Value | Chain | API |
|-------|-------|-----|
| `PIXELONKAS` | Kaspa | krc721.stream |
| `SYKORA` | Kaspa | krc721.stream |

> PIXELONKAS a SYKORA nejsou na OpenSea — pouze na kaspa.com.

**Fetch flow:**
```
GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/owners/{TICK}?limit=50
```
Pick random entry → note `tokenId`.

```
GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/token/{TICK}/{tokenId}
```
Extract image URL from metadata. If `ipfs://` → convert to `https://ipfs.io/ipfs/{CID}/{path}`.

Download to `/tmp/{tick}_{tokenId}.png`.

Fallback: if API fails → use random file from `assets/img/` matching collection.

**NFT link in post:** include `kaspa.com/nft/collections/{TICK}/{tokenId}` in every profile's post. Vary placement.

All three X profiles get the same NFT image but different post texts. Tone: regular visual post, not promo. No "mint now" unless combined with `--promo`.

---

## Step 1e — WIP mode (--wip flag)

Work in progress — shows process, not a finished piece. Tone: open, factual, "this is what we're building."

Pick a file from `~/pixel-exports/$ARTIST/` as usual. The difference is in the post text tone.

**What WIP posts cover:**
- New SYNTHI feature or UI change
- Generator parameter experiment (yohei, koma)
- Rewards tracker update
- New artist collaboration in progress

**Tone rules:**
- Describe what it is and where it's heading — one or two concrete sentences
- No "coming soon" hype language
- No calls to action
- @synthicoin: treat as regular visual post, apply synthicoin voice normally

**Example (@PixelonKas):**
> "Reworking the SYNTHI AKS matrix UI — 9×8 patch bay, oscillator frequency modes. Still rough."

**Example (@marekozor):**
> "Playing with the raymarching parameters. Not sure where this ends up yet."

---

## Step 2 — Generate posts

Generate one post per profile using file metadata, media type, and voices below.

### Hashtags

#### @PixelonKas — X
- Always include: `#Kaspa` `#KRC721` `#PIXELONKAS`
- Rotate from: `#KRC20` `#NFT` `#NFTcommunity` `#BlockDAG` `#SYKORA` `#SYNTHI` `#creativecoding`
- Educational posts add: `#crypto` `#Web3` `#blockchain`
- Total per post: **3–4 tags**

#### @marekozor — X
- Always include: `#Kaspa`
- Rotate from: `#generativeart` `#algorithmicart` `#digitalart` `#cryptoart` `#creativecoding`
- Total per post: **2–3 tags**

#### @synthicoin — X
- Rotate from: `#synth` `#synthesizer` `#electronicmusic` `#soundart` `#experimentalmusic` `#creativecoding`
- Never use `#NFT`
- Total per post: **2–3 tags**

#### Instagram @marekozor — hashtag blok VŽDY
Always include: `#Kaspa` `#KaspaNetwork` `#PIXELONKAS`
NFT/community pool: `#NFTart` `#NFTcollector` `#NFTcommunity` `#cryptoart` `#digitalart` `#creativecoding`
Broad reach (educational posts): `#blockchain` `#Web3` `#crypto` `#DeFi`
Total per post: **10–15 tags** — prázdný řádek před blokem vždy

### pixel-on-kaspa.fyi link
Include randomly — not every post. Vary placement. ~60% inclusion rate.

### Profile voices

**@PixelonKas** — project voice, clean, direct, EN
- Modrý ✓ stamp — autoritativní hlas projektu
- Tone per post type:
  - Visual: short & punchy, 1–2 sentences, let the image speak
  - Content/info: friendly & direct, explain clearly, no jargon overload
  - Kaspa educational: confident, approachable — "here's why this matters"
  - Promo: energetic but not salesy, community-first
- May write threads (3–5 tweets) — use for Kaspa posts or content posts
- Thread format: Tweet 1 hook → Tweet 2–3 content → last tweet hashtags + link

**@marekozor** — personal voice, generative artist, EN
- Tone: reflective, personal, first person. Short observation about this specific piece.
- OpenSea link (deep-memory only): 50% of the time append `https://opensea.io/item/polygon/{contract}/{identifier}`. Only if total tweet ≤ 280 chars.

**@synthicoin** — experimental electronic, raw, unexpected
- Character: Synthi AKS, Max4Live, Ableton, oscilloscope, images from sound
- Tone: raw, technical or poetic, unexpected angle. CZ or EN. Length is free — can be one word or a paragraph, whatever fits the piece.
- May touch on promo or educational themes but only through its own experimental lens — never a straight announcement or tutorial
- Never a direct call to action, never a standard promo post

**Instagram @marekozor** (deep-memory artist only)
- Tone per caption type (alternate between them):
  - Short: 1–2 sentences + hashtag block
  - Long: hook line → body (3–5 lines) → CTA → blank line → hashtag block
- Tell the story behind the artwork — what is it, how was it made, what does it mean.
- No OpenSea link (not clickable). Include `pixel-on-kaspa.fyi`.
- Promo posts: CTA at end + reference "link in bio"
- **Hashtag blok povinný** — 10–15 tagů, prázdný řádek před blokem

Keep X posts under 280 characters where possible. No emojis unless user asks.

---

## Step 3 — Recommended post time

| Profile | Time (UTC) |
|---------|------------|
| @PixelonKas | 14:00–16:00 |
| @marekozor | 09:00–11:00 |
| @synthicoin | 20:00–22:00 |
| Instagram @marekozor | 10:00 |

---

## Step 4 — Show posts and ask for approval

Display all generated posts clearly, each with:
- Profile name and handle
- Platform (X / Instagram)
- Suggested post time
- Post text
- Media file attached

When `--artist deep-memory`, also show Instagram @marekozor as fourth option.

Then ask:
```
Which profiles do you want to post to?
Options: @PixelonKas / @marekozor / @synthicoin / Instagram @marekozor
```

---

## Step 5 — Final approval per profile

For each selected profile:
```
Post this to @handle now? (yes / edit / skip)
```
- `edit` → let user rewrite, then confirm again
- `skip` → move to next profile
- `yes` → load credentials and post via X API

---

## Step 5a — Load credentials from .env

| Profile | Prefix |
|---------|--------|
| @PixelonKas | `PIXELONKAS_` |
| @marekozor | `MAREKOZOR_` |
| @synthicoin | `SYNTHICOIN_` |

Load five variables per prefix:
```
{PREFIX}API_KEY
{PREFIX}API_SECRET
{PREFIX}ACCESS_TOKEN
{PREFIX}ACCESS_TOKEN_SECRET
{PREFIX}BEARER_TOKEN
```

If any value is empty or file missing:
```
Credentials for @handle not found. Fill in the {PREFIX}* values in .env first.
```

Never log or display credential values.

---

## Step 5b — Instagram post (deep-memory only)

Credentials from `.env`:
```
INSTAGRAM_USERNAME_MAREKOZOR
INSTAGRAM_PASSWORD_MAREKOZOR
```
If missing, skip Instagram silently.

Library: `instagrapi`. Install if needed: `pip install instagrapi`

Session: load from `/tmp/ig_session_marekozor.json` if exists; save after login.

```python
from instagrapi import Client

cl = Client()
cl.delay_range = [1, 3]
if is_video:
    cl.video_upload(mp4_path, caption=caption)
else:
    cl.photo_upload(png_path, caption=caption)
```

Wrap in try/except — Instagram failure never blocks X posts.

Confirm on success:
```
✓ Posted to Instagram (@marekozor)
  Media: filename.ext
  URL: https://www.instagram.com/p/{code}/
```

---

## Step 6 — Confirm

```
✓ Posted to @handle at HH:MM UTC
  Media: filename.ext
```

---

## Checklist před každým postem

- [ ] Instagram caption obsahuje hashtag blok (10–15 tagů, prázdný řádek před ním)
- [ ] @marekozor X post — OpenSea link jen pro deep-memory, jen pokud ≤ 280 znaků
- [ ] @synthicoin — experimental lens vždy, 2–3 hashtags, nikdy #NFT, nikdy přímé promo/CTA
- [ ] PIXELONKAS a SYKORA mint linky → `kaspa.com` (ne OpenSea)
- [ ] Každý profil dostane jiný soubor média
- [ ] Post schválen před odesláním
- [ ] `pixel-on-kaspa.fyi` — ~60% postů, pozici variovat
- [ ] #creativecoding — zařadit do rotace u vizuálních postů
