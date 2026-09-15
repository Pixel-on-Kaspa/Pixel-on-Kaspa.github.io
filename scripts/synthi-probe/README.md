# synthi-probe

Headless measurement for `synthi/sos-dj.html`. Built while fixing the oud, the
guitar and the arp, because "sounds gutted", "too loud" and "it clips" are all
checkable claims, and tuning gain constants by ear through a browser is slow and
gets the wrong answer.

`engines.mjs` lifts `playMel()` straight out of the page and renders it through
an `OfflineAudioContext`, so it always measures the shipped code — there is no
second copy of the synth to drift out of date. It keys off two markers,
`function driveCurve` and `function trig(`; if those are renamed it says so.

```bash
bun add -d node-web-audio-api          # once

bun scripts/synthi-probe/engines.mjs levels
bun scripts/synthi-probe/engines.mjs spectrum --ref master
bun scripts/synthi-probe/engines.mjs arp --amp 0.45 --gate 1
bun scripts/synthi-probe/engines.mjs render
bun scripts/synthi-probe/styles.mjs
```

## Reading the numbers

**Seed every render.** `ksBuf`'s excitation and every `noiseBuf` call are
`Math.random()`. Unseeded, the same engine measures differently each run and band
ratios swing by tens of percent — enough to "confirm" a change that did nothing.
`engines.mjs` seeds a deterministic PRNG before each render.

**Peak lies about a held voice.** An organ that sustains flat and a pluck that
decays can share a peak and sit 6 dB apart to the ear. `levels` reports the
loudest 50 ms (onset) and the loudest 1.2 s (sustained energy) instead, and ranks
against the median. That is what caught ORGAN sitting +5.5 dB above everything
while its peak looked modest.

**Band ratios confound level with balance.** Summing raw FFT bins reports
broadband noise as "94 % treble" purely because the 1.5–6 kHz band holds 450 bins
against the low band's 25. `spectrum` reports spectral centroid and the harmonic
profile in dB relative to the fundamental instead. A 4th harmonic *above* the
fundamental is the signature of a hollow, nasal voice — that is exactly what the
old oud measured (`-9 -6 +10 -1`).

**The arp plays a stream, not a note.** `arp` renders 24 overlapping notes.
`ringAfterLast` much larger than the gate means the engine is discarding the note
length it was handed: GT does nothing for it and its notes pile up. That single
column explained both "the oud is too long" and most of the clipping.

`--wav <dir>` writes each render out so you can listen instead of reading a table.

## reframe.swift

Reframes a square clip to 9:16 (or any size) and remuxes it properly, using
AVFoundation — no ffmpeg install.

```bash
swiftc -O scripts/synthi-probe/reframe.swift -o /tmp/reframe
/tmp/reframe in.mp4 out.mp4 1080 1920
```

The generators record via `MediaRecorder`, which emits a *fragmented* MP4 with
zero duration in its header. Players cope; upload APIs sometimes do not. The
export writes a normal `moov` with faststart and keeps the audio track. It prints
the source's real duration and bitrate — worth checking, since X re-encodes
everything and dense line-fields want 8–15 Mb/s to survive it.
