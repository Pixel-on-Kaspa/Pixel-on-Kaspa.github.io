#!/usr/bin/env bun
/**
 * engines.mjs — render SOS·DJ's melodic engines headless and measure them.
 *
 * Why this exists: "the oud sounds gutted" and "the arp clips" are checkable
 * claims, and guessing at gain constants by ear in a browser is slow and wrong.
 * This pulls playMel() straight out of synthi/sos-dj.html, renders it through an
 * OfflineAudioContext, and prints numbers.
 *
 *   bun scripts/synthi-probe/engines.mjs levels
 *   bun scripts/synthi-probe/engines.mjs spectrum [--ref HEAD]
 *   bun scripts/synthi-probe/engines.mjs arp [--amp .45] [--gate 1] [--div 1/16]
 *   bun scripts/synthi-probe/engines.mjs render
 *
 * Flags: --file <path>  probe a different copy of sos-dj.html
 *        --ref <rev>    also render that git revision, for before/after
 *        --wav <dir>    write each render to a WAV so you can listen
 *
 * Requires: bun add -d node-web-audio-api
 */
import { OfflineAudioContext } from "node-web-audio-api";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";

const SR = 44100;
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const args = process.argv.slice(2);
const mode = args[0] || "levels";
const flag = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };

/* ── pull the engines out of the page ──────────────────────────────────────── */
function sourceFor(rev) {
  if (!rev) return readFileSync(flag("file", `${ROOT}/synthi/sos-dj.html`), "utf8");
  return execSync(`git -C ${ROOT} show ${rev}:synthi/sos-dj.html`).toString();
}
function enginesOf(html) {
  const a = html.indexOf("function driveCurve"), b = html.indexOf("function trig(");
  if (a < 0 || b < 0) throw new Error("markers moved — check driveCurve / trig in sos-dj.html");
  const names = html.match(/STB:\[([^\]]+)\]/)[1].split(",").map(s => s.trim().replace(/'/g, ""));
  const order = (html.match(/ENG_ORDER\.STB=\[([^\]]+)\]/) || [, null])[1];
  return {
    code: html.slice(a, b),
    names,
    ids: order ? order.split(",").map(Number) : names.map((_, i) => i),
    /* engines that voice a LINE; the rest get the drawn note as a triad */
    mono: new Set((html.match(/MONO_MEL=new Set\(\[([^\]]+)\]\)/) || [, "6,7,8,9,10,11,13,14"])[1].split(",").map(Number)),
  };
}

/* ksBuf's excitation and every noiseBuf call are Math.random(): without a seed
   the same engine renders differently each run and band ratios swing by tens of
   percent. Seed it, and average over several seeds where it matters. */
function seed(n) { let s = n >>> 0; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

async function render(eng, { engine, notes, amp, gate, seconds, sd = 1, bpm = 120 }) {
  seed(sd);
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  const make = new Function("AC", "STEPS", "patterns", "bpm", eng.code + "\nreturn {playMel};");
  const { playMel } = make(ctx, 16, { STB: Array(16).fill(0) }, bpm);
  for (const n of notes) playMel({ bus: ctx.destination }, n.f, n.t, engine, amp, gate);
  return (await ctx.startRendering()).getChannelData(0);
}

/* ── metrics ───────────────────────────────────────────────────────────────── */
const peakOf = d => { let p = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; } return p; };
/* loudest window, not the average over a fixed span: a fixed span scores a
   sustained organ high and a short pluck low purely because of envelope shape */
function loudest(d, winSec) {
  const W = Math.round(SR * winSec); let acc = 0, best = 0;
  for (let i = 0; i < d.length; i++) {
    acc += d[i] * d[i]; if (i >= W) acc -= d[i - W] * d[i - W];
    if (i >= W) { const r = Math.sqrt(acc / W); if (r > best) best = r; }
  }
  return best;
}
function mag(d, f) {                       // one-bin Goertzel
  const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < d.length; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / d.length;
}
const centroid = d => { let n = 0, q = 0; for (let f = 40; f <= 8000; f += 20) { const m = mag(d, f); n += f * m; q += m; } return q ? Math.round(n / q) : 0; };
const harmonics = (d, f0) => {             // 2..8 in dB relative to the fundamental
  const h = []; for (let k = 1; k <= 8; k++) h.push(mag(d, f0 * k));
  return h.slice(1).map(v => Math.round(20 * Math.log10(Math.max(v, 1e-9) / (h[0] || 1e-9))));
};
const win = (d, a, b) => d.slice(Math.round(a * SR), Math.round(b * SR));

function wav(d, path) {
  const n = d.length, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, d[i] * 32767)), 44 + i * 2);
  writeFileSync(path, b);
}
const wavDir = flag("wav", null);
if (wavDir) mkdirSync(wavDir, { recursive: true });

/* the sequencer voices a drawn step as a triad at amp .32; the arp and the mono
   leads use a single note. Match how trig() actually calls playMel. */
const chord = (eng, e, root = 220) => eng.mono.has(e)
  ? { notes: [{ f: root, t: 0.02 }], amp: 0.75 }
  : { notes: [0, 3, 7].map(st => ({ f: root * Math.pow(2, st / 12), t: 0.02 })), amp: 0.32 };

/* ── modes ─────────────────────────────────────────────────────────────────── */
async function levels(eng) {
  const rows = [];
  for (const e of eng.ids) {
    const { notes, amp } = chord(eng, e);
    const d = await render(eng, { engine: e, notes, amp, gate: 0.9, seconds: 1.5 });
    if (wavDir) wav(d, `${wavDir}/${eng.names[e]}.wav`);
    rows.push({ voice: eng.names[e], peak: +peakOf(d).toFixed(2),
      onset: +loudest(d, 0.05).toFixed(3), sustained: +loudest(d, 1.2).toFixed(3) });
  }
  const med = [...rows].sort((a, b) => a.sustained - b.sustained)[rows.length >> 1].sustained;
  rows.forEach(r => { r.vsMedianDb = +(20 * Math.log10(r.sustained / med)).toFixed(1); });
  rows.sort((a, b) => b.sustained - a.sustained);
  console.log(`levelling on sustained energy (median ${med.toFixed(3)}).`);
  console.log("onset = loudest 50 ms, sustained = loudest 1.2 s. Peak alone lies about");
  console.log("a held voice: an organ and a pluck can share a peak and be 6 dB apart.\n");
  console.table(rows);
}

async function spectrum(eng, ref) {
  const rows = [];
  for (const [label, E] of [["now", eng], ...(ref ? [["ref", ref]] : [])]) {
    for (const e of E.ids) {
      const { notes, amp } = chord(E, e);
      const d = await render(E, { engine: e, notes, amp, gate: 0.6, seconds: 2.5 });
      rows.push({ voice: E.names[e], ver: label, peak: +peakOf(d).toFixed(2),
        attack: centroid(win(d, 0.02, 0.18)), ring: centroid(win(d, 0.35, 1.2)),
        "harm 2-8 dB (ring)": harmonics(win(d, 0.35, 1.2), 220).join(" ") });
    }
  }
  console.log("spectral centroid in Hz (brightness) + harmonics relative to the fundamental.");
  console.log("A 4th harmonic ABOVE the fundamental is the signature of a hollow, nasal voice.\n");
  console.table(rows);
}

async function arp(eng) {
  const div = flag("div", "1/16"), bpm = +flag("bpm", 138);
  const beats = { "1/16": 0.25, "1/8": 0.5, "1/4": 1 }[div] ?? 0.25;
  const iv = beats * 60 / bpm;
  const amp = +flag("amp", 0.45), gate = +flag("gate", 1);
  const rows = [];
  for (const e of eng.ids) {
    const degs = [0, 3, 7, 12, 7, 3];
    const notes = Array.from({ length: 24 }, (_, i) =>
      ({ f: 220 * Math.pow(2, degs[i % degs.length] / 12), t: 0.02 + i * iv }));
    const d = await render(eng, { engine: e, notes, amp, gate: iv * gate, seconds: 4, bpm });
    let over = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 1) over++;
    const p = peakOf(d), last = 0.02 + 23 * iv;
    let ring = 0;
    for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > p * 0.001) { ring = i / SR - last; break; }
    rows.push({ voice: eng.names[e], peak: +p.toFixed(2), clipped: over ? `${over} samp` : "",
      ringAfterLast: +ring.toFixed(2) });
  }
  rows.sort((a, b) => b.peak - a.peak);
  console.log(`arp ${div} @ ${bpm}bpm · amp ${amp} · GT ${Math.round(gate * 100)} · gate ${iv.toFixed(3)}s`);
  console.log("ringAfterLast >> gate means the engine is ignoring the note length it was");
  console.log("handed — GT does nothing for it and its notes pile up.\n");
  console.table(rows);
}

async function renderCheck(eng) {
  const rows = [];
  for (const e of eng.ids) {
    let err = "";
    let d = new Float32Array(1);
    try { d = await render(eng, { engine: e, notes: [{ f: 220, t: 0.02 }], amp: 0.32, gate: 0.5, seconds: 2 }); }
    catch (x) { err = x.message; }
    let nan = 0; for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) nan++;
    const p = peakOf(d);
    rows.push({ n: e, voice: eng.names[e], peak: +p.toFixed(3), nonFinite: nan,
      silent: p < 1e-4 ? "YES" : "", error: err });
  }
  console.table(rows);
  const bad = rows.filter(r => r.error || r.nonFinite || r.silent);
  console.log(bad.length ? `${bad.length} engine(s) need attention` : "all engines render clean");
}

/* ── go ────────────────────────────────────────────────────────────────────── */
const eng = enginesOf(sourceFor(null));
const refRev = flag("ref", null);
const ref = refRev ? enginesOf(sourceFor(refRev)) : null;
if (mode === "levels") await levels(eng);
else if (mode === "spectrum") await spectrum(eng, ref);
else if (mode === "arp") await arp(eng);
else if (mode === "render") await renderCheck(eng);
else { console.error(`unknown mode "${mode}" — levels | spectrum | arp | render`); process.exit(1); }
