# Credit Audit — Generators

Audit creditů ve všech generátorech z `docs/generators-inventory.md`.
Kontrola: zdrojový kód, UI, post commands, post templates.

---

## ✅ V pořádku

### Koma Tebe p5 — `pixel-p5.html`

| Kde | Credit |
|-----|--------|
| `<title>` | `Koma Tebe • p5 • Pixel on Kaspa` |
| UI header | `KOMA @KomaTebe • p5` + link na X profil |
| UI popis | `Original one-liner by Koma Tebe (@KomaTebe)` |
| `<pre id="creditCode">` | Kompletní originální one-liner + popis adaptace |
| `js/pixel-p5.js:2` | `based on your one-liner tweet` |
| `js/pixel-p5.js:69` | `Original one-liner core (kept faithful)` |
| Post templates | AFTER pattern s `@KomaTebe` |

**Verdikt:** Plný credit. Autor uveden v UI, v kódu i v post šablonách. Formát „original by / after" je čistý.

---

### Yohei GLSL — `yohei-glsl.html`

| Kde | Credit |
|-----|--------|
| `<title>` | `Yohei • GLSL • Pixel on Kaspa` |
| UI header | `PIXEL ON KASPA GLSL • @YoheiNishitsuji` + link na X profil |
| UI tlačítko | `Yohei Tweet` (pojmenování shaderu) |
| `js/yohei-glsl.js:2` | `Yohei Nishitsuji tweet shader style` |
| `js/yohei-glsl.js:50` | `Original snippet (minimally adapted)` |
| `yohei-glsl.html:869` | `Shader 2: Yohei Tweet (つぶやきGLSL)` |
| Post templates | AFTER pattern s `Yohei Nishitsuji` |

**Verdikt:** Plný credit. Konzistentní napříč UI, kódem a post šablonami.

---

## ⚠️ Credit chybí nebo je nejasný

### SYNTHI AKS — `synthi/aks.html`

| Kde | Co je | Co chybí |
|-----|-------|----------|
| `<title>` | `SYNTHI AKS` | Žádná zmínka o EMS |
| UI topbar | `SYNTHI AKS` + `Electronic Music Studios · Web Audio Edition` | Jména designérů (Zinovieff, Cockerell) |
| Kód `:902` | `TRAPEZOIDAL ENVELOPE (EMS Synthi style)` | Pouze interní komentář, ne user-facing |
| UI/footer | — | Žádný viditelný credit s jmény |

**Problém:** UI říká „Electronic Music Studios" ale nezmiňuje autory hardware — Peter Zinovieff a David Cockerell. Komentář v kódu na ř. 902 zmiňuje „EMS Synthi style" ale není viditelný pro uživatele.

**Řešení:** Přidat do `.brand-sub` nebo nového footeru:

```
After EMS Synthi AKS (1972) — Peter Zinovieff & David Cockerell
```

Kam: `synthi/aks.html` — buď rozšířit `.brand-sub` (ř. 326), nebo přidat footer element.

```
fix(synthi-aks): add Zinovieff & Cockerell credit to topbar
```

---

### SYNTHI Generator — `synthi/generator.html`

| Kde | Co je | Co chybí |
|-----|-------|----------|
| `<title>` | `SYNTHI • GENERATOR` | Žádná zmínka o EMS |
| UI header | `PIXEL ON KASPA — SYNTHI` | Žádný credit |
| Kód | Žádné komentáře o EMS/předloze | Nic |

**Problém:** Audio engine je EMS-inspired (sdílí `synthi-aks.js`), ale nikde v souboru není zmínka o předloze. Vizuální koncept (multi-layer audio-reactive Lissajous) je autorský — nepotřebuje credit. Ale zvuková architektura vychází z EMS AKS.

**Řešení:** Přidat do headeru nebo footeru:

```
Audio engine inspired by EMS Synthi AKS (1972)
```

Kam: `synthi/generator.html` — pod brand element (ř. 362–364).

```
fix(synthi-generator): credit EMS Synthi AKS audio heritage
```

---

### SYNTHI Visual Engine — `synthi/visual-engine.html`

| Kde | Co je | Co chybí |
|-----|-------|----------|
| `<title>` | `SYNTHI Visual Engine` | Žádná zmínka o EMS |
| UI topbar | `SYNTHI` (jen brand text) | Žádný credit |
| Kód | Žádné komentáře o předloze | Nic |

**Problém:** Stejný jako Generator — oscilátorová architektura je EMS-derived, ale žádný credit. Horší než Generator, protože nemá ani interní komentáře.

**Řešení:** Přidat do topbaru vedle `SYNTHI`:

```html
<span class="brand">SYNTHI</span>
<span style="font-size:9px;color:var(--muted);letter-spacing:.1em">after EMS Synthi AKS</span>
```

Kam: `synthi/visual-engine.html` — topbar (ř. 99).

```
fix(synthi-visual-engine): add EMS Synthi AKS credit to topbar
```

---

### SYNTHI Web — `synthi/web.html`

| Kde | Co je | Co chybí |
|-----|-------|----------|
| `<title>` | `SYNTHI Web — EMS AKS Inspired` | ✅ Zmínka o EMS |
| UI `<h1>` (ř. 463) | `SYNTHI WEB — EMS AKS Inspired / Web Audio API` | Jména designérů |
| Kód (ř. 607) | `AKS-inspired: ring mod is a first-class patchable module` | Pouze komentář |
| Kód (ř. 719+) | Mnohočetné `AKS`/`AKS-authentic` komentáře | Pouze interní |

**Problém:** Nejlepší z SYNTHI řady — má „EMS AKS Inspired" v titulu i v H1. Ale stále chybí jména Zinovieff/Cockerell.

**Řešení:** Rozšířit `<h1>` nebo přidat pod něj:

```
After EMS Synthi AKS (1972) — Zinovieff / Cockerell
```

Kam: `synthi/web.html` — pod H1 (ř. 463).

```
fix(synthi-web): add designer names to EMS credit
```

---

## 🔴 Kritické

Žádný generátor nepoužívá cizí estetiku bez jakéhokoli creditu. Všechny případy výše jsou „incomplete credit" (⚠️), ne „zero credit" (🔴).

---

## Cross-cutting: Post command nemá credit pravidlo

**Problém:** `.claude/commands/post.md` neobsahuje žádné pravidlo vyžadující credit autora předlohy ve vizuálních postech. Post šablony (`visual-generator-posts.md`) mají AFTER pattern, ale posting command ho nevynucuje.

**Řešení:** Přidat do `post.md` Step 2 sekce pravidlo:

```markdown
### Credit rule
Visual posts from generators with external inspiration MUST include
the original author. Format: "after @handle" or "after Name".

| Artist folder | Credit required |
|---------------|----------------|
| `yohei`       | after @YoheiNishitsuji or after Yohei Nishitsuji |
| `koma`        | after @KomaTebe |
| `synthi`      | No external credit needed (original visual concept) |
| `deep-memory` | No external credit needed (own collections) |
```

```
fix(post-command): add mandatory credit rule for visual posts
```

---

## Souhrnná tabulka

| Generátor | UI credit | Kód credit | Post credit | Jména designérů | Akce |
|-----------|-----------|------------|-------------|-----------------|------|
| Koma Tebe p5 | ✅ plný | ✅ plný | ✅ šablona | ✅ @KomaTebe | — |
| Yohei GLSL | ✅ plný | ✅ plný | ✅ šablona | ✅ @YoheiNishitsuji | — |
| SYNTHI AKS | ⚠️ částečný | ⚠️ komentář | — | ❌ chybí | přidat Zinovieff/Cockerell do UI |
| SYNTHI Generator | ❌ žádný | ❌ žádný | — | ❌ chybí | přidat EMS credit do UI |
| SYNTHI Visual Engine | ❌ žádný | ❌ žádný | — | ❌ chybí | přidat EMS credit do UI |
| SYNTHI Web | ⚠️ částečný | ✅ bohatý | — | ❌ chybí | doplnit jména designérů |
| Post command | — | — | ❌ žádné pravidlo | — | přidat credit rule |

**Priorita oprav:**
1. Post command credit rule (ovlivňuje každý budoucí post)
2. SYNTHI AKS — hlavní nástroj, nejvíc na očích
3. SYNTHI Visual Engine — aktivně vyvíjený
4. SYNTHI Generator — produkční generátor
5. SYNTHI Web — starší UI, nižší priorita
