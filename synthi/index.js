// synthi/index.js
// PATCH A — "Video-feedback sculpture (2.5D)"
// - Locked square canvas (NO jumping window)
// - Strong visible video feedback (rotate/scale/shift) + controlled decay + exposure
// - No nonlinear warp (no X<->Y coupling), only linear transforms + layered oscillators
// - More functional parameters (Exposure, Density, Feedback, Spin, Scale, Grain, Drift)
// - Screenshot: key P (+ optional button #synthiShot)
// - Audio: sine + triangle + subtle detuned sine -> 3-stage delay w/ feedback + saturating clip

(() => {
  const TAU = Math.PI * 2;

  /* ---------------- helpers ---------------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const frac = (x) => x - Math.floor(x);
  const triFromPhase = (p) => 1 - 4 * Math.abs(p - 0.5);

  function $(id) { return document.getElementById(id); }

  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function logUniform(rng, min, max) {
    const lo = Math.log(min), hi = Math.log(max);
    return Math.exp(lo + (hi - lo) * rng());
  }

  /* ---------------- RNG ---------------- */
  let rerollCounter = 0;
  function getRand() {
    if (window.$fx && typeof window.$fx.rand === "function") return () => window.$fx.rand();
    const s = `${location.pathname}|${location.search}|${location.hash}|SYNTHI|${rerollCounter}|${Date.now()}`;
    return mulberry32(xmur3(s)());
  }

  /* ---------------- LOCKED square canvas sizing ---------------- */
  let _locked = { w: 0, h: 0, dpr: 1, sideCss: 0 };

  function ensureCanvasSizeLocked(canvas) {
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();

    // lock to square based on smaller side
    const sideCss = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
    const W = Math.floor(sideCss * dpr);
    const H = Math.floor(sideCss * dpr);

    const changed = (W !== _locked.w) || (H !== _locked.h) || (dpr !== _locked.dpr) || (sideCss !== _locked.sideCss);
    if (changed) {
      _locked = { w: W, h: H, dpr, sideCss };
      canvas.width = W;
      canvas.height = H;

      // CSS lock prevents layout jitter
      canvas.style.width = `${sideCss}px`;
      canvas.style.height = `${sideCss}px`;
    }
    return changed;
  }

  /* ---------------- params (patch A) ---------------- */
  function makeParams(rng) {
    const rare = rng() < 0.12;
    const f_vis = rare ? logUniform(rng, 4200, 7600) : logUniform(rng, 900, 5200);

    // base weights
    const xSin = 0.95;
    const xTri = 0.95 + rng() * 0.55;
    const ySin = 0.95;
    const yTri = 0.95 + rng() * 0.55;

    // LOCKED frame (no jump)
    const padFrac = 0.10;
    const gain = 0.92;

    // linear transform only
    const rot = (rng() - 0.5) * 0.35;
    const shear = (rng() - 0.5) * 0.22;

    const phi = rng();
    const phiOffset = 0.25;

    // drift + PM (very gentle)
    const driftCps = 0.00075;           // cycles/sec
    const pmHz = 0.04 + rng() * 0.12;
    const pmDepth = 0.001 + rng() * 0.006; // cycles

    // osc3 detail (detuned octave-ish)
    const detune = (rng() < 0.5 ? -1 : 1) * (0.0004 + rng() * 0.0012);
    const osc3Mix = 0.10 + rng() * 0.18;
    const osc3Phi = rng();

    // osc4 slow sculpt layer (adds "volume")
    const osc4Mul = 0.10 + rng() * 0.30; // f*0.10..0.40
    const osc4Mix = 0.05 + rng() * 0.12;
    const osc4Phi = rng();

    // visual feedback micro-transform baseline
    const fbScale = 1.0009 + rng() * 0.0040;
    const fbRotate = (rng() - 0.5) * 0.012;
    const fbShift = (rng() - 0.5) * 2.6;

    // drawing
    const pixel = rng() < 0.55 ? 2 : 3;
    const pointAlpha = 0.32;

    // ramps (sculpt)
    const ampRate = 0.016 + rng() * 0.050;
    const densRate = 0.012 + rng() * 0.040;
    const phiSpreadBase = 0.010 + rng() * 0.012;

    // audio
    const a = 0.70, b = 0.40;
    const t1 = (2 + rng() * 6) / 1000;
    const t2 = (10 + rng() * 26) / 1000;
    const t3 = (45 + rng() * 140) / 1000;
    const fb1 = 0.24 + rng() * 0.26;
    const fb2 = 0.34 + rng() * 0.30;
    const fb3 = 0.48 + rng() * 0.36;

    return {
      rare, f_vis, phi, phiOffset,
      xSin, xTri, ySin, yTri,
      padFrac, gain,
      rot, shear,
      driftCps, pmHz, pmDepth,
      detune, osc3Mix, osc3Phi,
      osc4Mul, osc4Mix, osc4Phi,
      fbScale, fbRotate, fbShift,
      pixel, pointAlpha,
      ampRate, densRate, phiSpreadBase,
      a, b, t1, t2, t3, fb1, fb2, fb3
    };
  }

  /* ---------------- signal (NO warp) ---------------- */
  function applyLinearTransform(x, y, p) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    let xr = x * c - y * s;
    let yr = x * s + y * c;
    xr = xr + p.shear * yr;
    return { x: xr, y: yr };
  }

  function xyAt(t, p, phiCycles, nowSec) {
    const f = p.f_vis;

    // gentle PM
    const pm = p.pmDepth * Math.sin(TAU * (p.pmHz * nowSec));
    const phi = phiCycles + pm;

    // base layer
    const px = TAU * (f * t + phi);
    const py = TAU * (2 * f * t + (phi + p.phiOffset));

    const sx = Math.sin(px);
    const sy = Math.sin(py);

    const tx = triFromPhase(frac(f * t + phi));
    const ty = triFromPhase(frac(2 * f * t + (phi + p.phiOffset)));

    let x = (p.xSin * sx + p.xTri * tx);
    let y = (p.ySin * sy + p.yTri * ty);

    // osc3 detail (detuned octave-ish, still 1:2 inside)
    const f3 = (2 * f) * (1 + p.detune);
    const phi3 = phiCycles + p.osc3Phi + pm * 0.35;

    x += p.osc3Mix * Math.sin(TAU * (f3 * t + phi3));
    y += p.osc3Mix * Math.sin(TAU * (2 * f3 * t + (phi3 + p.phiOffset)));

    // osc4 slow sculpt volume
    const f4 = f * p.osc4Mul;
    const phi4 = phiCycles + p.osc4Phi + pm * 0.15;

    x += p.osc4Mix * (Math.sin(TAU * (f4 * t + phi4)) + 0.55 * triFromPhase(frac(f4 * t + phi4)));
    y += p.osc4Mix * (Math.sin(TAU * (2 * f4 * t + (phi4 + p.phiOffset))) + 0.55 * triFromPhase(frac(2 * f4 * t + (phi4 + p.phiOffset))));

    // linear transform only
    ({ x, y } = applyLinearTransform(x, y, p));

    // soft clamp
    x = Math.tanh(0.78 * x);
    y = Math.tanh(0.78 * y);

    return { x, y };
  }

  /* ---------------- audio ---------------- */
  let audio = null;

  function makeSoftClipper(ctx, drive = 1.0) {
    const shaper = ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(2.0 * drive * x);
    }
    shaper.curve = curve;
    shaper.oversample = "2x";
    return shaper;
  }

  function buildDelayStage(ctx, delayTime, feedback, drive = 1.0) {
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = delayTime;

    const fbGain = ctx.createGain();
    fbGain.gain.value = feedback;

    const clip = makeSoftClipper(ctx, drive);

    delay.connect(fbGain);
    fbGain.connect(clip);
    clip.connect(delay);

    return { delay };
  }

  function startAudio(pEff, fbOn, fbMul) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();

    const f_aud = pEff.f_vis / 16;

    const oscSin = ctx.createOscillator();
    oscSin.type = "sine";

