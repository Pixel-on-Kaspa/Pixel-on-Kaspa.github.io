# /post Command Audit — `.claude/commands/post.md`

Audit zaměřený na pět konkrétních otázek o tom, jak silně skript brání před AI-tell stylem a generickým "LLM-zníním". Zdroj: `.claude/commands/post.md` (450 řádků, stav 2026-05-30).

---

## 1. Sekce ANTI-PATTERNS (AI-tell vzorce, čemu se vyhnout)

**⚠️ částečně**

Dedikovaná sekce **ANTI-PATTERNS neexistuje**. Negativní pravidla jsou rozptýlená napříč tone sekcemi a pokrývají jen marketing/crypto-slang, ne LLM stylistické tells:

| Kde | Zákaz |
|---|---|
| `:187` (Kaspa mode) | "No 'moon', no price talk" |
| `:239` (WIP mode) | "No 'coming soon' hype language" |
| `:240` (WIP mode) | "No calls to action" |
| `:270` (synthicoin) | "Never use `#NFT`" |
| `:302` (synthicoin) | "Never a direct call to action, never a standard promo post" |
| `:325` (formát) | "No emojis unless user asks" |

Žádná zmínka o klasických AI-tells jako:
- em-dash zneužívání (`—`)
- "X becomes Y" / "X transforms into Y" konstrukce
- "in the realm of", "delve into", "tapestry", "weaving"
- otevírání generickými frázemi ("One frequency, held long enough…")
- nadbytečná abstraktnost bez konkrétního čísla/faktu

> Související: `scripts/post-templates/visual-generator-posts.md` má svoji vlastní anti-pattern sekci (6 položek), ale ta není odkazovaná z `post.md` ani by ji LLM-operátor neviděl při běhu `/post`.

---

## 2. Konkrétní zakázané fráze ("held long enough", "becomes", "One X" struktura)

**❌ chybí**

Jediné explicitně zakázané fráze v souboru jsou:
- `"moon"` (`:187`)
- `"coming soon"` (`:239`)

Obě jsou crypto/marketing termíny, **ne stylistické LLM vzorce**. Žádná zmínka o frázích typu:
- "held long enough to become"
- "becomes geometry / becomes form / becomes X"
- "One frequency / One thing / One X" jako otvírák
- "Sound becomes shape" (mimochodem reálně použito v `scripts/post-templates/visual-generator-posts.md:50` jako pozitivní příklad — vnitřní rozpor)
- "frame by frame", "pulling X out of the Y"

Operátor nemá žádný blacklist konkrétních frází. Nic ho neupozorní, když napíše post, který vypadá jako z LLM playground.

---

## 3. Hard rules — linky, hashtagy, délka, povinný konkrétní fakt

**⚠️ částečně** — první tři pokryté, **povinný konkrétní fakt chybí**.

| Pravidlo | Kde | Stav |
|---|---|---|
| Hashtagy per profil (počet, povinné, rotace) | `:257–277` | ✅ hard rule, číselně specifikované (3–4 / 2–3 / 2–3 / 10–15) |
| Délka postu | `:325` | ⚠️ "under 280 characters **where possible**" — měkčí formulace |
| `pixel-on-kaspa.fyi` link, frekvence, umístění | `:279–280` | ✅ "~60% inclusion rate. Vary placement." |
| Mint linky → `kaspa.com` (ne OpenSea) | `:131`, `:139`, `:446` | ✅ hard rule |
| Formát zalomení řádků (text / blank / link / blank / tags) | `:313–323` | ✅ hard rule s ASCII příkladem |
| OpenSea link u `@marekozor` — jen deep-memory & ≤280 znaků | `:296`, `:444` | ✅ podmíněné, ale explicitní |
| **Povinný konkrétní fakt v každém postu** (číslo, ratio, frekvence, technologie, jméno) | — | ❌ **chybí** |

Nikde není pravidlo typu *"každý post musí obsahovat alespoň jeden konkrétní fakt: číslo, jméno, ratio, technologii nebo měřitelný parametr"*. Bez toho LLM defaultně vyrobí abstraktní poetickou prózu (přesně to, co generuje AI-tell vibe).

---

## 4. Few-shot příklady ✅ DOBRÝ vs ❌ ŠPATNÝ ze skutečných postů

**❌ chybí**

V `post.md` jsou jen **dva kladné WIP příklady** (`:244`, `:247`) bez negativního protějšku:

```
Example (@PixelonKas):
> "Reworking the SYNTHI AKS matrix UI — 9×8 patch bay, oscillator frequency modes. Still rough."

Example (@marekozor):
> "Playing with the raymarching parameters. Not sure where this ends up yet."
```

Žádný ✅/❌ kontrast, žádný "this is good because X / this is bad because Y", žádné before/after, žádné side-by-side přiklady per voice (PixelonKas / marekozor / synthicoin).

> Side-by-side anti-pattern příklady existují **mimo soubor** v `scripts/post-templates/visual-generator-posts.md:122–154` (6 anti-patternů s odůvodněním). Ale `post.md` na ně neodkazuje a LLM-operátor je při `/post` runu nenačítá.

---

## 5. Operátor má před každým postem projít kontrolní seznam

**⚠️ částečně**

Checklist **existuje** (`:441–450`, 8 položek) a název říká "Checklist před každým postem":

```
- [ ] Instagram caption obsahuje hashtag blok …
- [ ] @marekozor X post — OpenSea link jen pro deep-memory …
- [ ] @synthicoin — experimental lens vždy, 2–3 hashtags, nikdy #NFT …
- [ ] PIXELONKAS a SYKORA mint linky → kaspa.com …
- [ ] Každý profil dostane jiný soubor média
- [ ] Post schválen před odesláním
- [ ] pixel-on-kaspa.fyi — ~60% postů, pozici variovat
- [ ] #creativecoding — zařadit do rotace u vizuálních postů
```

Ale:
- Checklist je **pasivní seznam na konci souboru**, ne procedurální krok
- **Žádný Step (1–6) ho neaktivuje** — Step 4 ("Show posts") ani Step 5 ("Final approval") na něj neodkazuje
- Žádná instrukce typu "Před Step 4 projdi checklist a u každé položky odpověz ✓/✗"
- Položky checklistu jsou většinou logistické (linky, soubory, schválení), **žádná se netýká stylu textu** (žádné "post neobsahuje 'becomes' / em-dash / abstraktní otvírák / chybí konkrétní fakt")

Operátor (LLM) by checklist musel vědomě otevřít a aplikovat — což default neudělá, protože workflow ho na to nevede.

---

## Souhrn

| # | Bod | Stav |
|---|---|---|
| 1 | ANTI-PATTERNS sekce s AI-tells | ⚠️ částečně (jen marketing-tone zákazy, žádné stylistické) |
| 2 | Konkrétní zakázané fráze | ❌ chybí (jen "moon" + "coming soon") |
| 3 | Hard rules — linky / hashtagy / délka / **konkrétní fakt** | ⚠️ částečně (povinný fakt chybí) |
| 4 | ✅/❌ few-shot kontrast | ❌ chybí (jen kladné WIP příklady) |
| 5 | Operátor projde checklist před postem | ⚠️ částečně (checklist je, ale není wired do workflow ani nepokrývá styl) |

**Žádné ✅.** Hlavní mezery:
1. Stylistické anti-patterny (LLM-tells) v souboru úplně chybí.
2. Side-by-side ✅/❌ příklady existují v jiném souboru (`visual-generator-posts.md`), ale `post.md` na ně neodkazuje.
3. Checklist není aktivně volaný ze Step workflow a nepokrývá styl textu.
4. Chybí pravidlo "každý post musí obsahovat ≥1 konkrétní fakt".
