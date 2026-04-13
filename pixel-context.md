# PIXEL on Kaspa — Context File
> Tento soubor čti vždy na začátku každého chatu týkajícího se projektu PIXEL.

---

## Projekt Overview

**PIXEL** je NFT projekt na blockchainu Kaspa (KRC-721 standard).  
Součástí ekosystému jsou kolekce **PIXELONKAS**, **SYKORA** a token **$PIXEL**.  
Treasury adresa: `kaspa:qpxdmujaujsse6gqxdhkcnh934ptr3s5mf444aw5lpr9xlsj579uuppf88vkl`

---

## Rewards Systém

### Stav (poslední update)
- **Vyplaceno:** 867,000,000 $PIXEL
- **Minterů:** 15
- **Nedoplatků:** 0

### Skripty (`scripts/`)
| Soubor | Popis |
|--------|-------|
| `pay-rewards.ts` | Automatické vyplácení $PIXEL rewards pro SYKORA + PIXELONKAS |
| `mark-paid.ts` | Ruční zápis plateb do `logs/` |
| `fetch-paid-from-x.ts` | Import plateb z X postů |

### Důležité technické detaily
- KRC-20 decimal: `×10^8` (pozor na přepočty)
- Idempotence je implementována (duplicitní platby jsou filtrovány)
- Pseudo-ID filtrace je aktivní
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

## Posting Pravidla (`/.claude/commands/post.md`)

### Cyklus 4 postů (opakuje se)
1. **Vizuální** — ukázka NFT / artwork
2. **Obsahový** — info o projektu, lore, utility
3. **Kaspa vzdělávací** — co je Kaspa, proč KRC-721 atd.
4. **Promo** — rotace kolekcí (viz níže)

### Promo rotace
`PIXELONKAS → SYKORA → $PIXEL → SYNTHI → (opakovat)`

### Délky a formáty
- X (Twitter): střídat krátké a delší posty
- Instagram: střídat typy captionů
- Kaspa vzdělávací posty: **minimálně 2× týdně**

---

## Otevřené úkoly

- [ ] `synthi/rec.html` — úprava pro pump.fun video streamy
- [ ] Posting commands — dokončit a otestovat
- [ ] Rewards tracker Status sloupec — finální commit push na GitHub

---

## Kolekce přehled

| Kolekce | Standard | Poznámka |
|---------|----------|----------|
| PIXELONKAS | KRC-721 | Hlavní kolekce |
| SYKORA | KRC-721 | Premint #1–30 vyloučen z rewards |
| $PIXEL | KRC-20 | Utility token, decimal ×10^8 |
| SYNTHI | TBD | V přípravě, pump.fun integrace |
