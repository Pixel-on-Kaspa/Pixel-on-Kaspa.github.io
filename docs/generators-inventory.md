# Generators Inventory — Pixel on Kaspa

Stav repozitáře k **2026-05-25**. Pokrývá všechny interaktivní/generativní stránky a sketche v rootu projektu `pixel-on-kaspa.fyi`. Pomocné stránky (galerie, viewer NFT, rewards tracker, landing) nejsou generátory a v seznamu nejsou.

## Přehled

| Název | Cesta | Technologie | Inspirace / autor předlohy | Status | Popis |
|---|---|---|---|---|---|
| **Koma Tebe p5** | `pixel-p5.html` + `js/pixel-p5.js` | p5.js (Canvas 2D) | **Koma Tebe** ([@KomaTebe](https://x.com/KomaTebe)) — one-liner z tweetu | ✅ funkční | Generativní p5 sketch postavený na původním one-lineru. UI přidává zoom, step (PI/64), warp, rotaci, fade a seed. |
| **Yohei GLSL** | `yohei-glsl.html` + `js/yohei-glsl.js` | WebGL (fragment shader, WebGL2) | **Yohei Nishitsuji** — つぶやきGLSL tweet shader | ✅ funkční | Fragment shader renderovaný na fullscreen quad. Plně parametrizovaná verze ("Yohei Tweet" + "Iteration"/"Fold"/"Yohei Color" sloty). |
| **SYNTHI AKS** | `synthi/aks.html` | Web Audio API + Canvas 2D (VU/joystick) | **EMS Synthi AKS** (UK 1972, návrh Peter Zinovieff / David Cockerell) | ✅ funkční (kompletně přepsáno 2026-05) | Plnohodnotný patchovatelný analogově laděný syntezátor: 3 OSC (Hz/Level/Phase), VCF, trapezoid envelope, 8×7 patch matrix, spring reverb, XY joystick, MIDI in. |
| **SYNTHI Generator** | `synthi/generator.html` + `synthi/index.js` | Web Audio + Canvas 2D (multi-layer Lissajous, ~52k bodů) | EMS Synthi AKS (sound design); vlastní vizuál (žádný creditovaný předlohu) | ✅ funkční | Hlavní "produkční" generátor SYNTHI: audio-reaktivní vícevrstvý Lissajous obraz (basy → exposure, výšky → warp, kick flash). Beat sequencer + AKS voice ve sloupcích, canvas uprostřed. Re-render seed. |
| **SYNTHI Visual Engine** | `synthi/visual-engine.html` | Web Audio + Canvas 2D | EMS Synthi AKS-inspired (4-osc verze) | ✅ funkční | Alternativní 4-oscilátorový stack s drum synth (kick/snare/hat/perc) + 16-step sequencer. Vizuál je čistě matematický Lissajous z `oState` (ne z audio bufferu) s envelope reactivity. |
| **SYNTHI Web** | `synthi/web.html` | Web Audio API | EMS Synthi AKS-inspired (ring mod, XY joystick) | 🟡 funkční / starší UI | Starší AKS-like patch UI před `aks.html`. Ring modulator jako first-class modul, XY joystick CV. Stále nalinkováno ze `synthi/index.html`. |

---

## Detaily

### 1. Koma Tebe p5 — `pixel-p5.html`

- **Tech:** p5.js (instance mode), Canvas 2D, pixelDensity ≤ 2
- **Předloha:** original one-liner od **Koma Tebe** (`@KomaTebe`), zachovaný v `js/pixel-p5.js` (komentář "Original one-liner core (kept faithful)") a otištěný v UI v `<pre id="creditCode">` v `pixel-p5.html:408`.
- **Co dělá:** nekonečně iteruje vnořené smyčky `for j in [-π, 2π)` a `for i in [0, π)`, počítá `n = (f + cos(j+f)) mod B` a vykresluje kruhy do `(x,y)` plátna o šířce `W`. UI nad rámec originálu přidává: rychlost přehrávání (0.05–10×), kvalitu/rozlišení (260–1400 px), parametry zoom/step/warp/rot/fade/seed (`pixel-p5.html:282` localStorage klíč `koma_p5_params_v2`), PNG export a fullscreen.
- **Trvalý odkaz na autora:** ano (X profile link + jméno v UI).

### 2. Yohei GLSL — `yohei-glsl.html`

- **Tech:** WebGL2 fragment shader (jediný fullscreen quad, žádná geometrie), `preserveDrawingBuffer: true` pro PNG export.
- **Předloha:** **Yohei Nishitsuji** — žánr "つぶやきGLSL" (twitter-sized shader). V kódu (`js/yohei-glsl.js:2`) komentář: *"Minimal WebGL fragment viewer for Yohei Nishitsuji tweet shader style"*. V UI tlačítko **"Yohei Tweet"** (`yohei-glsl.html:257`) a sekce `FRAG_TWEET_WEBGL2` v `yohei-glsl.html:870`.
- **Co dělá:** raymarching ve scéně mapované log-polar souřadnicemi (`vec3(log2(R)-t, exp2(-p.z/R+1), atan(p.x,p.y))`), 99 iterací, vnitřní noise via `sin(p.xzx*s)+sin(p.zyy*s+e)`. Plně parametrizovaná verze s tabulkami "Iteration" / "Fold" / "Yohei Color" v UI.
- **Trvalý odkaz na autora:** v UI + ve zdrojáku.

### 3. SYNTHI AKS — `synthi/aks.html`

- **Tech:** Web Audio API (OscillatorNode + custom PeriodicWave, BiquadFilter, ConvolverNode pro spring reverb, DynamicsCompressor jako limiter, WaveShaper pro soft tanh saturator), Canvas 2D pro VU meter a XY joystick.
- **Předloha:** **EMS Synthi AKS** (Electronic Music Studios, Londýn, 1972 — návrh **Peter Zinovieff** a **David Cockerell**). Komentáře v kódu odkazují na trapezoid envelope ve stylu EMS, pin-matrix patching, soft-clip drive.
- **Co dělá (po přepisu 2026-05):**
  - 3 oscilátory: OSC1/OSC2 audio-rate (1 Hz – 10 kHz, tracking klávesnice ratiometricky), OSC3 sub-audio (0.01 – 50 Hz, slow modulator místo LFO). Každý má knoby Hz/Level/Phase + výběr wave (sin/tri/saw/sqr).
  - Fáze implementovaná přes `PeriodicWave` s Fourier-fázovou rotací harmonik.
  - **Trapezoid envelope** A → ON → D → OFF, jeden trigger = celý cyklus, LOOP = auto-retrigger.
  - **Patch matrix 8 zdrojů × 7 cílů** (OSC1/2/3, NOISE, TRAP ENV, JOY X/Y, VCF Out → O1/O2/O3 ƒ, VCF ƒ, VCF In, VCA, Out L).
  - Soft tanh saturátory na audio busech (1 pin ≈ 4 piny v hlasitosti), DC blocker (5 Hz HP), limiter −6 dB.
  - Spring reverb (procedurální IR), MIDI input, lokální klávesnice C3–B4 + PC keyboard mapping.
- **Status:** funkční, čerstvě overhaul commit `0f78b5e` (2026-05-24).

### 4. SYNTHI Generator — `synthi/generator.html`

- **Tech:** Canvas 2D (multi-layer Lissajous, až ~92k bodů na frame), Web Audio API (drum synth + AKS voice via `synthi-aks.js`), seedovaný RNG (`mulberry32`).
- **Předloha:** EMS Synthi AKS pro zvukovou část (engine z `synthi/index.js` + `synthi/synthi-aks.js`). Vizuální koncept (audio-reaktivní Lissajous s harmonickými vrstvami a feedback projekcí) **bez zmíněné předlohy** — vypadá jako autorský sketch Marek Ozor / projekt PIXEL on Kaspa.
- **Co dělá:** v reálném čase počítá `nLayers = 1 + harmonicsMix·6` vrstev Lissajous křivek, kde každý frame je nascaleovaný seedem `renderSeed ^ now`. Audio FFT analýza (`readEnv` → bass/mid/hi) řídí density, exposure, warp, jitter, alpha, line-width. Feedback projekce přes `projectFeedback(p)`. Beat sequencer + AKS voice ve scrollovacích panelech vpravo, "Re-render" tlačítko resetuje seed.
- **Status:** funkční. Hlavní generátorový tool projektu.

### 5. SYNTHI Visual Engine — `synthi/visual-engine.html`

- **Tech:** Canvas 2D (matematický Lissajous, **ne** z audio bufferu), Web Audio API se 4 oscilátory + drum synth (kick/snare/hat/perc) + 16-step sequencer + L/R analyzéry.
- **Předloha:** EMS Synthi AKS (`SYNTHI Visual Engine` v titulu, ne přímý credit jednotlivce). Vizuální koncept opět autorský.
- **Co dělá:** routes OSC1+OSC3 → L analyser (cyan), OSC2+OSC4 → R analyser (magenta). Vizualizace ale **nečerpá z audio dat** — `drawViz()` (`synthi/visual-engine.html:735`) počítá Lissajous přímo ze `oState[i].freq / .phase / .wave`, modulováno envelope (`level/bass/mid/hi` z FFT) jen pro decay, exposure, line-width. 8000 segmentů na cyklus, dvojí stroke pass (glow + main).
- **Status:** funkční. Samostatný experiment vedle `aks.html`.

### 6. SYNTHI Web — `synthi/web.html`

- **Tech:** Web Audio API (BiquadFilter, ring modulator jako GainNode multiplikace, XY joystick CV), žádný vlastní vizuál — UI only.
- **Předloha:** "EMS AKS Inspired" v titulu (`synthi/web.html:6`). Komentář v `synthi/web.html:607`: *"AKS-inspired: ring mod is a first-class patchable module."*. Žádný jmenovitý autor předlohy.
- **Co dělá:** alternativní/starší syntezátorové UI před `aks.html`. Patch matrix, ring mod modul, XY joystick s dvěma nezávislými CV výstupy patchovatelnými přes matrix, výchozí patch `ENV → VCA`. Nyní překrytý nadřazeným `aks.html`, ale stále nalinkován ze `synthi/index.html`.
- **Status:** funkční, ale **starší UI** (recommended path je nyní AKS). Hodí se k případnému archivování až bude AKS feature-complete.

---

## ⚠️ Chybí credit

Tyto generátory **nezmiňují konkrétního autora předlohy** ve zdrojáku ani v UI. Pro EMS Synthi AKS by stálo za to do `aks.html`, `generator.html`, `visual-engine.html` a `web.html` přidat jednotnou poznámku typu *"Inspired by the EMS Synthi AKS (1972, Peter Zinovieff & David Cockerell, Electronic Music Studios London)"* — buď do `panel-title` / footer, nebo do komentáře v `<head>`.

| Generátor | Co chybí | Doporučení |
|---|---|---|
| **SYNTHI AKS** (`synthi/aks.html`) | Zmiňuje "EMS Synthi style" v komentáři ke trapezoid envelope, ale v UI ani v `<head>` není credit původního hardware/designérů. | Přidat do topbaru/footeru: *"after EMS Synthi AKS (1972) — Zinovieff / Cockerell"*. |
| **SYNTHI Generator** (`synthi/generator.html`) | Vizuální koncept (multi-layer audio-reactive Lissajous) je autorský, ale audio engine je EMS-inspired bez creditu. | Stejně jako u AKS — přidat credit EMS / Zinovieff. |
| **SYNTHI Visual Engine** (`synthi/visual-engine.html`) | Žádný credit ani v titulu ani v kódu, jen interní komentáře. | Doplnit "EMS AKS Inspired" + jméno do `<title>` nebo `#topbar`. |
| **SYNTHI Web** (`synthi/web.html`) | V titulu *"EMS AKS Inspired"*, ale jména designérů chybí. | Doplnit jména do credit poznámky. |

> **Pozn.:** Koma Tebe a Yohei Nishitsuji jsou plně creditovaní v UI i v komentářích — viz `pixel-p5.html:174` (X profil link) a `js/yohei-glsl.js:2`. Žádné akce nepotřebují.
