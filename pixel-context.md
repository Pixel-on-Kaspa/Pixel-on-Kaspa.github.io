# PIXEL on Kaspa — Context File
> Tento soubor čti vždy na začátku každého chatu týkajícího se projektu PIXEL.

---

## Projekt Overview

**PIXEL** je NFT projekt na blockchainu Kaspa (KRC-721 standard).  
Součástí ekosystému jsou kolekce **PIXELONKAS**, **SYKORA**, token **$PIXEL** a audio-vizuální projekt **SYNTHI**.  
Treasury adresa: `kaspa:qpxdmujaujsse6gqxdhkcnh934ptr3s5mf444aw5lpr9xlsj579uuppf88vkl`

---

## Rewards Systém

### Stav (update: 2026-04-16, z logů `logs/`)
- **Vyplaceno:** 5,117,000,000 $PIXEL
- **Minterů:** 26
- **Nedoplatků:** 0

### Reward tabulka (z `scripts/pay-rewards.ts`)
| Kolekce | Rarity/Trait | Reward ($PIXEL) |
|---------|-------------|-----------------|
| PIXELONKAS | Super Broken | 1,000,000,000 |
| PIXELONKAS | Broken | 100,000,000 |
| PIXELONKAS | Grey | 80,000,000 |
| PIXELONKAS | Orange | 50,000,000 |
| PIXELONKAS | Yellow | 30,000,000 |
| PIXELONKAS | Pink | 26,000,000 |
| PIXELONKAS | Red | 24,000,000 |
| PIXELONKAS | Purple | 22,000,000 |
| PIXELONKAS | White | 20,000,000 |
| PIXELONKAS | Green | 15,000,000 |
| PIXELONKAS | Black | 12,000,000 |
| PIXELONKAS | Blue | 12,000,000 |
| SYKORA | Ice | 100,000,000 |
| SYKORA | Black | 80,000,000 |
| SYKORA | Pink | 40,000,000 |

### Skripty (`scripts/`)
| Soubor | Popis |
|--------|-------|
| `pay-rewards.ts` | Automatické vyplácení $PIXEL rewards pro SYKORA + PIXELONKAS |
| `import-onchain-payouts.ts` | Načte odchozí $PIXEL transfery z treasury přes Kasplex API a zapíše do `logs/` |
| `fetch-paid-from-x.ts` | Import plateb z X postů |
| `post-to-x.ts` | Postování na X (Twitter) přes API — podporuje obrázky i videa |

### Důležité technické detaily
- KRC-20 decimal: `×10^8` (log `amount` je v display jednotkách $PIXEL, skript násobí při odesílání)
- Idempotence je implementována (duplicitní platby jsou filtrovány přes `logs/`)
- SYKORA premint #1–30 je vyloučen z rewards
- Logy jsou ve formátu JSON v adresáři `logs/`

---

## Rewards Tracker (`admin/rewards-tracker.html`)

### Funkce
- **SYKORA Ice trait fix:** Rarity=Special → Ice color
- **Sloupce:** Minter | Aktuální vlastník | Status
- **Status hodnoty:**
  - ✅ Paid
  - ⚠️ Partial
  - ⏳ Pending
  - — (nevztahuje se)
- **Žluté zvýraznění** prodaných NFT (minter ≠ aktuální vlastník)
- **Horní lišta:** $PIXEL Owed / Paid / Unpaid přehled
- Logs načítány přes `fetch('../logs/*.json')`
- **SYKORA premint #1–30 je vyloučen z rewards**

---

## SYNTHI (`synthi/`)

Audio-vizuální projekt živý na `pixel-on-kaspa.fyi/synthi/`. Obsahuje několik sub-stránek:

| Stránka | Soubor | Popis |
|---------|--------|-------|
| Landing | `index.html` | Hlavní stránka — nový design (2026-04), navigace na všechny nástroje |
| Visual Engine | `app.html` | Lissajous canvas vizualizér — oscilátory, HUE/CONT/DECAY/BRIGHT/THICK knoby, offscreen canvas recording (1440px, 25 Mbps, 5s) |
| SYNTHI AKS | `aks.html` | EMS Synthi AKS emulátor — patch bay, oscilátory |
| SYNTHI Web | `web.html` | Web Audio API syntetizér inspirovaný EMS AKS |
| Generator | `generator.html` | Audio-parametry → generátor vizuálů |
| REC Archive | `rec.html` | Archiv nahrávacích sessions |

### Technické soubory
- `index.js` — Web Audio API engine (~36 KB)
- `synthi-aks.js` — AKS patch bay logika
- `js/synthi-audio.js` — audio processing modul
- `img/card-1..4.png` — obrázky karet na landing page

---

## Posting Pravidla (`/.claude/commands/post.md`)

### Cyklus 6 postů (opakuje se)
1. **Vizuální** — artist export (yohei GLSL, koma p5.js)
2. **Obsahový** — info o projektu
3. **Kaspa vzdělávací #1**
4. **Promo** — rotace kolekcí
5. **Vizuální** — NFT z chainu
6. **Kaspa vzdělávací #2**

### Promo rotace
`PIXELONKAS → SYKORA → $PIXEL → SYNTHI → (opakovat)`

### Export složky
| Složka | Obsah |
|--------|-------|
| `~/Desktop/pixel-exports/yohei/` | GLSL shader exporty (PNG/MP4) |
| `~/Desktop/pixel-exports/koma/` | p5.js Koma exporty (PNG/MP4) |
| `~/Desktop/pixel-exports/synthi/` | SYNTHI AKS exporty |

### Profily
| Handle | Hlas |
|--------|------|
| `@PixelonKas` | Projektový hlas — čistý, přímý, EN |
| `@marekozor` | Osobní hlas — reflexivní, první osoba, EN |
| `@synthicoin` | Experimentální elektronika — raw, poetický, nikdy promo |

---

## Otevřené úkoly

- [ ] `synthi/rec.html` — úprava pro pump.fun video streamy
- [x] Posting commands — dokončeny a funkční
- [x] Rewards tracker Status sloupec — commitnut a pushnut

---

## Kolekce přehled

| Kolekce | Standard | Poznámka |
|---------|----------|----------|
| PIXELONKAS | KRC-721 | Hlavní kolekce, 342 max, mint 287 KAS |
| SYKORA | KRC-721 | 2518 max, premint #1–30 vyloučen z rewards, minting probíhá |
| $PIXEL | KRC-20 | Utility token, decimal ×10^8 |
| SYNTHI | — | Audio-vizuální projekt živý na pixel-on-kaspa.fyi/synthi/ |
