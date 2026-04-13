# /post kaspa — Kaspa vzdělávací post

Vzdělávací post o Kaspa blockchainu. Cíl: vysvětlit technologii, ne prodat NFT.

## Usage
```
/post kaspa --topic <slug>
/post kaspa --topic <slug> --profile <handle>
/post kaspa --topic <slug> --long
```

`--topic` (required): viz seznam níže
`--profile` (optional): `pixelonkas`, `marekozor` — default je `pixelonkas`
`--long` (optional): thread na X (3–5 tweetů), dlouhý caption na IG

## Témata (--topic slugy)

| Slug | O čem je post |
|------|---------------|
| `blockdag` | Co je blockDAG — proč rychlejší a bezpečnější než lineární blockchain. Paralelní bloky, vysoká propustnost. |
| `krc721` | KRC-721 standard — co je, jak se liší od ERC-721, proč Kaspa pro NFT. Immutable on-chain data, žádné IPFS. |
| `kaspa-intro` | Úvod do Kaspa — co to je, jak začít, jak koupit KAS. Pro lidi co Kaspa neznají. |
| `kaspa-speed` | Rychlost, poplatky, finalita Kaspa — konkrétní čísla vs konkurence. |
| `kaspa-vs` | Kaspa vs Ethereum / Solana — fakta, bez FUD, bez hype. |
| `why-nft-kaspa` | Proč dávají NFT na Kaspa smysl — decentralizace, rychlost, nízké poplatky, KRC-721. |

## Step 1 — Vygeneruj post

Téma musí být vysvětleno jasně a fakticky. Žádný hype, žádné cenové spekulace. Styl: vzdělávací, přímý.

### @PixelonKas — X
- Bez `--long`: medium tweet, 220–280 znaků + hashtags
- S `--long`: thread 3–5 tweetů
  - Tweet 1: hook — překvapivý fakt nebo otázka
  - Tweet 2–3: vysvětlení, konkrétní čísla nebo srovnání
  - Tweet 4: jak to souvisí s PIXEL on Kaspa (volitelné, ne vždy)
  - Tweet 5: hashtags
- Hashtags: `#Kaspa` + téma-specifické (např. `#BlockDAG`, `#KRC721`, `#Web3`)
- Žádné `#NFT` pokud téma není přímo o NFT

### @PixelonKas — Instagram
- Střední nebo dlouhý caption dle `--long`
- Vzdělávací tón, příběh nebo analogie která věc vysvětlí
- Prázdný řádek před hashtag blokem
- Hashtags (povinné): `#Kaspa #BlockDAG #KRC721 #CryptoArt #GenerativeArt #Web3 #NFT`

### @marekozor — X (volitelné, pouze pro `kaspa-intro` nebo `why-nft-kaspa`)
- Osobní pohled: proč on jako umělec zvolil Kaspa
- Krátké, max 220 znaků
- Hashtags: `#Kaspa #GenerativeArt` + 1 kontextový

## Step 2 — Doporučený čas
- @PixelonKas: `14:00–16:00 UTC`
- @marekozor: `09:00–11:00 UTC`

## Step 3 — Zobraz a schval
Zobraz vygenerované posty přehledně s profilem, platformou, časem a textem.

Zeptej se:
```
Which profiles do you want to post to? (select one, multiple, or all)
```

## Step 4 — Finální schválení
Pro každý vybraný profil:
```
Post this to @handle now? (yes / edit / skip)
```
- `edit` → nechej uživatele přepsat, pak potvrď
- `skip` → přejdi dál
- `yes` → postuj přes X API

## Step 5 — Potvrzení
```
✓ Posted to @handle at HH:MM UTC
```

---

## Checklist — před každým postem

- [ ] Instagram post obsahuje hashtag blok (min. 5 hashtagů, prázdný řádek před ním)
- [ ] @synthicoin — nikdy kaspa vzdělávací post
- [ ] Post schválen uživatelem před odesláním
- [ ] `pixel-on-kaspa.fyi` — přidat jen někdy (~60% postů), pozici variovat
