# Mint Post

Post an NFT mint announcement to X profiles.

## Usage
```
/mint-post --collection <name>
/mint-post --collection <name> --profile <handle>
```

**--collection** (required): collection identifier — `PIXELONKAS` or `SYKORA` (or future collections)  
**--profile** (optional): `pixelonkas`, `marekozor`, `synthicoin` — if omitted, show all three and let user pick

---

## Step 1 — Load collection info

### PIXELONKAS
- Name: Pixel on Kaspa
- Artist: Marek Ozor
- Type: generative art, on-chain
- Mint link: kaspa.com/nft/collections/PIXELONKAS
- Context: generative visual art stored permanently on Kaspa blockchain

### SYKORA
- Name: Sykora NFT Collection
- Artist: David Vrbík / Vektroskop collective
- Type: generative art from oscilloscope music, Lissajous figures, 12×12 matrix
- Mint link: kaspa.com/nft/collections/SYKORA
- Context: based on Zdeněk Sýkora's combinatorial system (Letná tunnel, Prague). David Vrbík translated Sýkora's geometric structure into a musical score — visuals emerge from sound frequencies via oscilloscope. Each piece is a fragment of a 12×12 matrix.

For unknown collections: ask the user for name, artist, type, and mint link before continuing.

---

## Step 2 — Generate posts

Generate one mint announcement post per profile. Draw from the collection context above.

### Profile voices

**@PixelonKas** — project voice, EN  
Tone: clear, direct announcement. What is it, who made it, why it matters. No hype.  
Structure: 2–3 short lines + mint link + hashtags  
Hashtags: #Kaspa #NFT #GenerativeArt

**@marekozor** — personal voice, EN/CZ mix ok  
Tone: personal angle — what does this collection mean to him as an artist? Genuine, not promotional.  
For PIXELONKAS: first person, his own work  
For SYKORA: collegial, genuine appreciation for Vrbík's process  
Hashtags: #GenerativeArt #Kaspa + 1 relevant

**@synthicoin** — punk experimental electronic, raw, no marketing  
Tone: find the sound/frequency angle. For SYKORA: oscilloscope, Lissajous, signal. For PIXELONKAS: structure, pattern, noise.  
Never write like a press release. Short, unexpected, technical or poetic.  
Hashtags: max 2, no #NFT

All posts must include the mint link for the collection.  
Keep under 280 characters where possible. No emojis.

---

## Step 3 — Recommended post time

Suggest an optimal posting time for a mint announcement:

- **@PixelonKas**: 15:00 UTC (maximum EU+US overlap)
- **@marekozor**: 10:00 UTC (EU morning)
- **@synthicoin**: 21:00 UTC (EU evening, experimental music crowd)

Show the suggested time next to each post.

---

## Step 4 — Show posts and ask for approval

Display all generated posts clearly, each with:
- Profile name and handle
- Suggested post time
- Post text

Then ask:
> Which profiles do you want to post to? (you can select one, multiple, or all)

Wait for the user to select profiles.

---

## Step 5 — Final approval per profile

For each selected profile, show the final post and ask:
> Post this to @handle now? (yes / edit / skip)

If user says **edit**: let them rewrite the text, then confirm again.  
If user says **skip**: move to next profile.  
If user says **yes**: post via X API.

---

## Step 6 — Confirm

After posting, confirm:
> ✓ Posted to @handle at HH:MM UTC
> Collection: COLLECTION_NAME
