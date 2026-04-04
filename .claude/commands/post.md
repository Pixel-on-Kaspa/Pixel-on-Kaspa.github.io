# Daily Visual Post

Post a visual (PNG or MP4) from a local artist export folder to X profiles.

## Usage
```
/post --artist <name>
/post --artist <name> --profile <handle>
/post --artist <name> --promo          # weekly collection promotion post
/post --kaspa                          # Kaspa educational post (post 3 in cycle)
```

**--artist** (required for visual posts): folder name inside `~/Desktop/pixel-exports/` — e.g. `yohei`, `koma`, `sykora`  
**--profile** (optional): `pixelonkas`, `marekozor`, `synthicoin` — if omitted, show all three and let user pick  
**--promo** (optional): weekly collection promotion mode — see Step 1b  
**--kaspa** (optional): generate Kaspa educational post instead of visual — see Step 1c

---

## Posting cycle (4 posts)

Each cycle of 4 posts follows this pattern:

| Post | Type | Content |
|------|------|---------|
| 1 | Visual | Artist work — GLSL, koma, sykora, marekozor |
| 2 | Content | Web, NFT info, artists page, Kaspa ecosystem |
| 3 | Kaspa | Educational post about Kaspa blockchain |
| 4 | Promo | Mint / trade / Synthi app |

Use `--kaspa` for post 3. The user will indicate which post in the cycle they're on.

---

## Step 1 — Find media files

Pick a **separate random file per profile** from `~/Desktop/pixel-exports/$ARTIST/` (or OpenSea for marekozor). Each of the three X profiles gets a different file. Instagram @marekozor reuses the @marekozor X file.

### If --artist is `marekozor`:

Fetch NFT images from OpenSea using the API.

1. Read `OPENSEA_API_KEY` from `.env`. If missing or empty, stop:
   > OPENSEA_API_KEY not set in .env — please add it first.

2. For each profile (up to 3 separate picks), pick a random collection from:
   - `deepmemory` (Polygon)
   - `sphericalharmony` (Polygon)
   - `angryheadsv2` (Ethereum)

3. Fetch NFTs from that collection:
   ```
   GET https://api.opensea.io/api/v2/collection/{slug}/nfts?limit=50
   Header: X-API-Key: {OPENSEA_API_KEY}
   ```

4. Pick a random NFT. Determine media type:
   - If `display_animation_url` is present → **video** (MP4). Use this URL.
   - Otherwise → **image**. Use `original_image_url` (PNG, raw2.seadn.io).

5. Download to a temp file:
   - Video: `/tmp/marekozor_nft_{token_id[-8:]}.mp4`
   - Image: `/tmp/marekozor_nft_{token_id[-8:]}.png`

6. Note the NFT name, collection, token ID, contract, and media type per profile.

**Uploading to X:**
- **Image**: standard upload via `POST /1.1/media/upload.json`.
- **Video**: chunked upload:
  1. `INIT` — `command=INIT`, `media_type=video/mp4`, `media_category=tweet_video`, `total_bytes`
  2. `APPEND` — chunks ≤5 MB, `command=APPEND`, `segment_index`
  3. `FINALIZE` — `command=FINALIZE`
  4. Poll `GET /1.1/media/upload.json?command=STATUS&media_id={id}` until `state=succeeded` (2s interval, 60s max)

If the API call fails or returns no results, try the next collection. If all fail, stop and report the error.

### Otherwise:

Look inside `~/Desktop/pixel-exports/$ARTIST/` and pick a **separate random file per profile**. Each profile gets a different file. If the folder has fewer files than profiles, reuse files as needed.

If the folder is empty or doesn't exist, stop and tell the user:
> No files found in ~/Desktop/pixel-exports/$ARTIST/ — please export a file first.

---

## Step 1c — Kaspa post mode (--kaspa flag)

Used for post 3 in the cycle. Replaces Step 1 — no media file needed.

Pick a **random topic** from the list below (rotate, don't repeat the same topic two cycles in a row):

| Topic | Key facts |
|-------|-----------|
| BlockDAG vs blockchain | Parallel blocks, no orphan blocks, all work counts |
| Confirmation speed | 1 BPS now, roadmap to 10 BPS, sub-second finality |
| GHOSTDAG protocol | DAG-based consensus, how it orders parallel blocks |
| PoW without ASIC dominance | GPU-mineable, decentralized hashrate |
| Immutable on-chain data | Why NFT metadata stored on Kaspa is permanent |
| KRC-20 & KRC-721 | Token standards, what they enable (fungible + NFT) |
| Comparison to Bitcoin | Same PoW philosophy, faster and more scalable |
| Kaspa community | Open source, no premine, fair launch |

**Profiles for Kaspa posts:**

- **@PixelonKas**: project context — tie the Kaspa tech fact to why the project builds on Kaspa. 2–4 sentences. EN.
- **@marekozor**: personal perspective — why this blockchain property matters to him as an artist storing creative work on-chain. Reflective, first person. EN.
- **@synthicoin**: **never a Kaspa educational post** — generate a regular experimental/art post for Synthi instead (treat as post type 1 for this profile only, pick any recent yohei/sykora/koma file or skip media entirely).

No media attachment for @PixelonKas and @marekozor on Kaspa posts (text-only tweet). @synthicoin still gets a visual if available.

Tone: educational, not hype. Short facts or context. No "moon", no price talk.

---

## Step 1b — Promo mode (--promo flag)

Used for weekly collection promotion. Replaces Step 1.

1. Ask the user which collection to promote: `PIXELONKAS` or `SYKORA`
2. Fetch a random already-minted NFT from the collection using the krc721.stream API:
   ```
   GET https://mainnet.krc721.stream/api/v1/krc721/mainnet/owners/{tick}?limit=50
   ```
   Pick a random entry, then fetch its IPFS image from the metadata.
3. All profiles share the same NFT image for promo posts.
4. Include the mint link in every promo post:
   - PIXELONKAS: `kaspa.com/nft/collections/PIXELONKAS`
   - SYKORA: `kaspa.com/nft/collections/SYKORA`
5. Generate posts in promo tone: highlight the collection, invite minting. Not a daily post — this is a collection spotlight.

---

## Step 2 — Generate posts

Generate one post per profile. Use the NFT/file metadata, media type, and profile voices below.

### Hashtags

Generate **relevant hashtags per post** based on the specific NFT, artist, collection, and visual style. Do not use a fixed set — vary them each post. Consider: collection name, visual style (GLSL, oscilloscope, generative, geometric, abstract, etc.), blockchain, artist name, mood of the piece. Each profile uses a different register:
- @PixelonKas: 2–4 tags, project/NFT/blockchain focused
- @marekozor: 2–3 tags, art/personal focused
- @synthicoin: 0–2 tags max, never #NFT

### pixel-on-kaspa.fyi link

Include randomly — not every post. When included, vary the placement (end of post, mid-post after a line break, etc.). Aim for roughly 60% inclusion rate across posts.

### Profile voices

**@PixelonKas** — project voice, clean, direct, EN  
Tone: concise update. State what it is, who made it. No hype.

**@marekozor** — personal voice, generative artist, EN  
Tone: reflective, personal, first person. Short observation about this specific piece.  
OpenSea link (marekozor artist only): 50% of the time, append `https://opensea.io/item/polygon/{contract}/{identifier}`. Only if total tweet ≤ 280 chars; otherwise skip silently.

**@synthicoin** — punk electronic experimental, raw, never promotional  
Character: Synthi AKS, Max4Live, Ableton, oscilloscope, images from sound frequencies  
Tone: raw, technical or poetic, very short, unexpected angle. CZ or EN.

**Instagram @marekozor** (marekozor artist only) — longer caption, tell the story behind the artwork. 3–6 sentences. What is this piece, how was it made, what does it mean to the artist. More text than the X post. No OpenSea link (not clickable). Include pixel-on-kaspa.fyi.

Keep X posts under 280 characters where possible. No emojis unless the user asks.

---

## Step 3 — Recommended post time

Suggest an optimal posting time based on today and the profile:

- **@PixelonKas**: 14:00–16:00 UTC (EU afternoon, US morning overlap)
- **@marekozor**: 09:00–11:00 UTC (EU morning, artist audience)
- **@synthicoin**: 20:00–22:00 UTC (EU evening, music/experimental crowd)
- **Instagram @marekozor**: 10:00 UTC

Show the suggested time next to each post.

---

## Step 4 — Show posts and ask for approval

Display all generated posts clearly, each with:
- Profile name and handle
- Suggested post time
- Post text
- Media file that will be attached

When `--artist marekozor`, also show **Instagram @marekozor** as a fourth selectable option with its longer caption.

Then ask:
> Which profiles do you want to post to? (you can select one, multiple, or all)
> Options: @PixelonKas, @marekozor, @synthicoin, Instagram @marekozor

Wait for the user to select profiles.

---

## Step 5 — Final approval per profile

For each selected profile, show the final post and ask:
> Post this to @handle now? (yes / edit / skip)

If user says **edit**: let them rewrite the text, then confirm again.
If user says **skip**: move to next profile.
If user says **yes**: load credentials and post via X API with the media attached.

If the user selected **Instagram @marekozor**, handle it as a separate item in this loop (see Step 5b).

---

## Step 5b — Instagram post (marekozor only)

When Instagram @marekozor is selected and approved:

**Credentials** (from `.env`):
```
INSTAGRAM_USERNAME_MAREKOZOR
INSTAGRAM_PASSWORD_MAREKOZOR
```

If either value is missing, skip Instagram silently.

**Library**: `instagrapi`. Install if needed: `pip install instagrapi`

**Session**: load from `/tmp/ig_session_marekozor.json` if it exists; save after successful login.

**Caption**: the longer Instagram-specific caption (not the X tweet text).

**Posting logic**:
```python
from instagrapi import Client

cl = Client()
cl.delay_range = [1, 3]
# load session if exists, else login fresh and save session
if is_video:
    cl.video_upload(mp4_path, caption=caption)
else:
    cl.photo_upload(png_path, caption=caption)
```

**Error handling**: wrap in try/except. If Instagram fails, print the error and continue — never block the X post.

**Confirm** on success:
> ✓ Posted to Instagram (@marekozor)
> Media: filename.ext
> URL: https://www.instagram.com/p/{code}/

---

## Step 5a — Load credentials from .env

Before posting to a profile, read `.env` from the repo root and extract the credentials for the selected profile using its prefix:

| Profile handle | Prefix |
|---|---|
| pixelonkas | `PIXELONKAS_` |
| marekozor | `MAREKOZOR_` |
| synthicoin | `SYNTHICOIN_` |

Load these five variables for the active prefix:
```
{PREFIX}API_KEY
{PREFIX}API_SECRET
{PREFIX}ACCESS_TOKEN
{PREFIX}ACCESS_TOKEN_SECRET
{PREFIX}BEARER_TOKEN
```

If any of the five values are empty or the file is missing, stop and tell the user:
> Credentials for @handle not found. Fill in the {PREFIX}* values in .env first.

Do not log or display credential values at any point.

---

## Step 6 — Confirm

After posting, confirm:
> ✓ Posted to @handle at HH:MM UTC
> Media: filename.ext
