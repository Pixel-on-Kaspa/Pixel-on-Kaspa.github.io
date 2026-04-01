# Daily Visual Post

Post a visual (PNG or MP4) from a local artist export folder to X profiles.

## Usage
```
/post --artist <name>
/post --artist <name> --profile <handle>
```

**--artist** (required): folder name inside `~/pixel-exports/` — e.g. `yohei`, `koma`, `sykora`  
**--profile** (optional): `pixelonkas`, `marekozor`, `synthicoin` — if omitted, show all three and let user pick

---

## Step 1 — Find media file

Look inside `~/pixel-exports/$ARTIST/` and pick a **random file** (PNG or MP4).

If the folder is empty or doesn't exist, stop and tell the user:
> No files found in ~/pixel-exports/$ARTIST/ — please export a file first.

---

## Step 2 — Generate posts

Generate one post per profile. Use the artist, the media file type (image/video), and the profiles below.

### Profile voices

**@PixelonKas** — project voice, clean, direct, EN  
Tone: concise NFT/art project update. No hype. State what it is.  
Hashtags: #Kaspa #GenerativeArt #NFT

**@marekozor** — personal voice, generative artist, EN/CZ mix ok  
Tone: reflective, personal, first person. What does this piece mean to him? Short observation.  
Hashtags: #GenerativeArt #Kaspa + 1 relevant tag

**@synthicoin** — punk electronic experimental music, raw, no marketing  
Character: Synthi AKS, Max4Live, Ableton, oscilloscope music, images from sound frequencies  
Tone: syrový, technický nebo poetický — nikdy promotional. Může být velmi krátký, fragment, nečekaný úhel.  
Hashtags: max 2, nepovinné, žádné #NFT

All posts must include: `pixel-on-kaspa.fyi`  
Keep posts under 280 characters where possible. No emojis.

---

## Step 3 — Recommended post time

Suggest an optimal posting time based on today and the profile:

- **@PixelonKas**: 14:00–16:00 UTC (EU afternoon, US morning overlap)
- **@marekozor**: 09:00–11:00 UTC (EU morning, artist audience)
- **@synthicoin**: 20:00–22:00 UTC (EU evening, music/experimental crowd)

Show the suggested time next to each post.

---

## Step 4 — Show posts and ask for approval

Display all generated posts clearly, each with:
- Profile name and handle
- Suggested post time
- Post text
- Media file that will be attached

Then ask:
> Which profiles do you want to post to? (you can select one, multiple, or all)

Wait for the user to select profiles.

---

## Step 5 — Final approval per profile

For each selected profile, show the final post and ask:
> Post this to @handle now? (yes / edit / skip)

If user says **edit**: let them rewrite the text, then confirm again.  
If user says **skip**: move to next profile.  
If user says **yes**: post via X API with the media attached.

---

## Step 6 — Confirm

After posting, confirm:
> ✓ Posted to @handle at HH:MM UTC
> Media: filename.ext
