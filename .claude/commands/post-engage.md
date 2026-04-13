# /post engage — Community engagement post

Krátký interaktivní post. Cíl: reakce, odpovědi, zvýšení dosahu. Bez prodeje.

## Usage
```
/post engage --type <slug>
/post engage --type <slug> --collection <name>
/post engage --type <slug> --profile <handle>
```

`--type` (required): viz typy níže
`--collection` (optional): `pixelonkas`, `sykora` — upřesní kontext
`--profile` (optional): `pixelonkas`, `marekozor` — default `pixelonkas`

## Typy (--type slugy)

### `poll-trait`
Hlasování o oblíbeném traitu nebo barvě.
- Formát: otázka + 2–4 možnosti (X poll nebo prosté "reply below")
- Příklad: "Which PIXELONKAS color is your favorite? Reply below."
- Krátké, max 200 znaků + možnosti
- Hashtags: `#Kaspa #GenerativeArt` + 1 kontextový

### `guess-rarity`
Zobraz NFT, zeptej se na raritu — reveal v reply nebo follow-up postu.
- Vyžaduje médium — specifikuj `--collection` pro kontext
- Formát: "What rarity is this? Guess below."
- Médium: náhodný soubor z export složky nebo z krc721.stream API
- Hashtags: `#Kaspa #NFT #GenerativeArt`

### `wip`
Work in progress ukázka — co se právě vyvíjí nebo tvoří.
- Může být o SYNTHI, novém artworku, rewards trackeru, novém generátoru
- Tón: otevřený, "tohle děláme" — ne announcement
- Krátké až střední
- Hashtags: `#GenerativeArt #Kaspa` + 1 kontextový

### `milestone`
Oznámení milníku — počet vyplacených $PIXEL, nový minter, vyprodáno atd.
- Fakta, čísla, žádný hype
- Příklad: "867,000,000 $PIXEL distributed. 15 minters. 0 outstanding."
- Krátké, úderné
- Hashtags: `#Kaspa #KRC721`

### `question`
Otevřená otázka komunitě — o umění, Kaspa, generativním přístupu.
- Příklad: "What draws you to generative art?" nebo "Have you tried the SYNTHI synthesizer?"
- Krátké, max 200 znaků
- Hashtags: max 2

## Step 1 — Vygeneruj post

### @PixelonKas — X
- Vždy short — max 220 znaků
- U `poll-trait` a `guess-rarity`: přidat médium pokud je dostupné
- U `milestone`: přidat treasury adresu nebo link jako důkaz
- Hashtags: podle typu (viz výše)

### @marekozor — X (pouze pro `wip` nebo `question`)
- Osobní úhel pohledu
- Krátké, neformální, EN nebo CZ
- Hashtags: `#GenerativeArt` + 1

> @synthicoin: engage posty nepublikovat — není jeho styl.

## Step 2 — Médium (volitelné)
Pro `guess-rarity` a `wip`:
- Najdi náhodný soubor v `~/Desktop/pixel-exports/<collection>/`
- Nebo použij krc721.stream API pro PIXELONKAS/SYKORA NFT

## Step 3 — Doporučený čas
- @PixelonKas: `14:00–16:00 UTC`
- @marekozor: `09:00–11:00 UTC`

## Step 4–6 — Schválení a posting
Stejný flow jako `/post` Step 4–6.

---

## Checklist — před každým postem

- [ ] @synthicoin — engage posty nepublikovat
- [ ] U `guess-rarity`: médium připraveno před odesláním
- [ ] U `milestone`: čísla ověřena (rewards tracker nebo krc721.stream)
- [ ] Post schválen uživatelem před odesláním
- [ ] `pixel-on-kaspa.fyi` — přidat jen někdy (~60% postů), pozici variovat
