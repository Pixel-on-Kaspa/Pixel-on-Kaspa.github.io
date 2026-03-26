// synthi/index.js — PATCH A + WARP + BEAT (no-samples drum synth)
// v2 refactor (FIXED): single IIFE (no premature close), anti-freeze, stronger audio-react, optional color
(() => {
  "use strict";
  const TAU = Math.PI * 2;

  /* ---------- helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const frac = (x) => x - Math.floor(x);
  const triFromPhase = (p) => 1 - 4 * Math.abs(p - 0.5);

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

  /* ---------- diagnostics overlay ---------- */
  function makeOverlay() {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.left = "12px";
    el.style.bottom = "12px";
    el.style.zIndex = "999999";
    el.style.background = "rgba(0,0,0,.55)";
    el.style.border = "1px solid rgba(255,255,255,.15)";
    el.style.backdropFilter = "blur(8px)";
    el.style.color = "rgba(255,255,255,.9)";
    el.style.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "12px";
    el.style.maxWidth = "min(980px, 94vw)";
    el.style.pointerEvents = "none";
    el.textContent = "SYNTHI boot…";
    document.body.appendChild(el);
    return el;
  }
  const overlay = makeOverlay();
  function log(msg) {
    console.log("[SYNTHI]", msg);
    overlay.textContent = msg;
  }

  /* ---------- canvas/meta ---------- */
  const canvas = document.getElementById("synthiCanvas") || document.querySelector("canvas");
  const meta = document.getElementById("synthiMeta") || null;

  if (!canvas) { log("ERROR: canvas not found (#synthiCanvas)."); return; }
  const ctx2d = canvas.getContext("2d", { alpha: false });
  if (!ctx2d) { log("ERROR: cannot get 2D context."); return; }

  /* ---------- RNG / reroll ---------- */
  let rerollCounter = 0;
  let renderSeed = 123456;

  function getRand() {
    if (window.$fx && typeof window.$fx.rand === "function") return () => window.$fx.rand();
    const s = `${location.pathname}|${location.search}|${location.hash}|SYNTHI|${rerollCounter}|${Date.now()}`;
    return mulberry32(xmur3(s)());
  }

  /* ---------- square canvas sizing (locked, capped) ---------- */
  let _locked = { w: 0, h: 0, dpr: 1, css: 0 };
  function ensureCanvasSizeLocked() {
    const dpr = Math.max(1, Math.min(2.25, window.devicePixelRatio || 1));
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();

    const maxByWidth = rect.width || 600;
    const maxByViewport = window.innerHeight * 0.72;
    const HARD_MAX = 860;

    const sideCss = Math.max(240, Math.floor(Math.min(maxByWidth, maxByViewport, HARD_MAX)));
    const W = Math.floor(sideCss * dpr);
    const H = Math.floor(sideCss * dpr);

    const changed = (W !== _locked.w) || (H !== _locked.h) || (dpr !== _locked.dpr) || (sideCss !== _locked.css);
    if (changed) {
      _locked = { w: W, h: H, dpr, css: sideCss };
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${sideCss}px`;
      canvas.style.height = `${sideCss}px`;
      canvas.style.display = "block";
      canvas.style.maxWidth = "100%";
    }
    return changed;
  }

  function clearHard() {
    ensureCanvasSizeLocked();
    ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    ctx2d.globalCompositeOperation = "source-over";
    ctx2d.globalAlpha = 1;
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  }

  /* ---------- params ---------- */
  function makeParams(rng) {
    const rare = rng() < 0.12;
    const f_vis = rare ? logUniform(rng, 4200, 7800) : logUniform(rng, 900, 5200);

    return {
      rare,
      f_vis,
      phi: rng(),
      phiOffset: 0.25,

      xSin: 0.95, ySin: 0.95,
      xTri: 0.95 + rng() * 0.65,
      yTri: 0.95 + rng() * 0.65,

      padFrac: 0.10,
      gain: 0.92,

      rot: (rng() - 0.5) * 0.35,
      shear: (rng() - 0.5) * 0.22,

      driftCps: 0.0007 + rng() * 0.0006,
      pmHz: 0.04 + rng() * 0.14,
      pmDepth: 0.001 + rng() * 0.006,

      detune: (rng() < 0.5 ? -1 : 1) * (0.0004 + rng() * 0.0012),
      osc3Mix: 0.10 + rng() * 0.22,
      osc3Phi: rng(),

      osc4Mul: 0.10 + rng() * 0.22,
      osc4Mix: 0.08 + rng() * 0.16,
      osc4Phi: rng(),

      pixel: rng() < 0.5 ? 2 : 3,

      fbScale: 1.001 + rng() * 0.004,
      fbRotate: (rng() - 0.5) * 0.012,
      fbShift: (rng() - 0.5) * 2.8,

      ampRate: 0.018 + rng() * 0.060,
      densRate: 0.012 + rng() * 0.050,
      phiSpreadBase: 0.010 + rng() * 0.012,

      warpBase: 0.06 + rng() * 0.18,
      warpRate: 0.03 + rng() * 0.11,
      warpPhase: rng(),

      // audio delay params
      a: 0.70,
      b: 0.40,
      t1: (2 + rng() * 7) / 1000,
      t2: (10 + rng() * 30) / 1000,
      t3: (45 + rng() * 150) / 1000,
      fb1: 0.24 + rng() * 0.26,
      fb2: 0.34 + rng() * 0.30,
      fb3: 0.48 + rng() * 0.36,
    };
  }

  function applyLinear(x, y, p) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    let xr = x * c - y * s;
    let yr = x * s + y * c;
    xr = xr + p.shear * yr;
    return { x: xr, y: yr };
  }

  function xyAt(t, p, phiCycles, nowSec) {
    const f = p.f_vis;
    const pm = p.pmDepth * Math.sin(TAU * (p.pmHz * nowSec));
    const phi = phiCycles + pm;

    const px = TAU * (f * t + phi);
    const py = TAU * (2 * f * t + (phi + p.phiOffset));

    const sx = Math.sin(px);
    const sy = Math.sin(py);
    const tx = triFromPhase(frac(f * t + phi));
    const ty = triFromPhase(frac(2 * f * t + (phi + p.phiOffset)));

    let x = p.xSin * sx + p.xTri * tx;
    let y = p.ySin * sy + p.yTri * ty;

    const f3 = (2 * f) * (1 + p.detune);
    const phi3 = phiCycles + p.osc3Phi + pm * 0.35;
    x += p.osc3Mix * Math.sin(TAU * (f3 * t + phi3));
    y += p.osc3Mix * Math.sin(TAU * (2 * f3 * t + (phi3 + p.phiOffset)));

    const f4 = f * p.osc4Mul;
    const phi4 = phiCycles + p.osc4Phi + pm * 0.15;
    x += p.osc4Mix * (Math.sin(TAU * (f4 * t + phi4)) + 0.6 * triFromPhase(frac(f4 * t + phi4)));
    y += p.osc4Mix * (Math.sin(TAU * (2 * f4 * t + (phi4 + p.phiOffset))) + 0.6 * triFromPhase(frac(2 * f4 * t + (phi4 + p.phiOffset))));

    ({ x, y } = applyLinear(x, y, p));

    if (p.warpEff > 0) {
      const w = p.warpEff;
      const x0 = x, y0 = y;
      x = x0 + w * y0;
      y = y0 - w * x0;
      x = Math.tanh(0.92 * x);
      y = Math.tanh(0.92 * y);
    }

    x = Math.tanh(0.78 * x);
    y = Math.tanh(0.78 * y);
    return { x, y };
  }

  /* ---------- audio ---------- */
  let audio = null;
  let masterVol = 0.70;

  let analyserF = null;
  let analyserT = null;
  let fft = null;
  let tbuf = null;

  let env = { level: 0, bass: 0, mid: 0, hi: 0, rms: 0, transient: 0 };

  const seq = {
    kick: new Array(16).fill(0),
    snare: new Array(16).fill(0),
    hat: new Array(16).fill(0),
    perc: new Array(16).fill(0),
  };
  let seqOn = false;
  let bpm = 120;
  let seqStep = 0;
  let seqNextTime = 0;

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

    return { delay, fbGain };
  }

  function noiseBuffer(actx, seconds = 1.0) {
    const len = Math.max(1, Math.floor(actx.sampleRate * seconds));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.9;
    return buf;
  }

  function makeReverbIR(actx, duration = 2.5, decay = 3.0) {
    const len = Math.floor(actx.sampleRate * duration);
    const buf = actx.createBuffer(2, len, actx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function makeDistortionCurve(drive) {
    const n = 2048;
    const curve = new Float32Array(n);
    const k = drive * 100 + 1;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function drumKick(actx, when, out, vel = 1.0) {
    const osc = actx.createOscillator();
    osc.type = "sine";
    const g = actx.createGain();

    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.9 * vel, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);

    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(52, when + 0.08);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.18);

    const drive = makeSoftClipper(actx, 0.9);
    osc.connect(g); g.connect(drive); drive.connect(out);

    osc.start(when);
    osc.stop(when + 0.30);
  }

  function drumSnare(actx, when, out, vel = 1.0) {
    const nbuf = audio._noiseBuf || (audio._noiseBuf = noiseBuffer(actx, 1.0));
    const n = actx.createBufferSource(); n.buffer = nbuf;

    const hp = actx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.setValueAtTime(900, when);

    const bp = actx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.setValueAtTime(1900, when); bp.Q.value = 0.9;

    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.65 * vel, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);

    n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
    n.start(when); n.stop(when + 0.20);

    const osc = actx.createOscillator();
    osc.type = "triangle";
    const tg = actx.createGain();
    tg.gain.setValueAtTime(0.0001, when);
    tg.gain.exponentialRampToValueAtTime(0.18 * vel, when + 0.004);
    tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.frequency.setValueAtTime(210, when);
    osc.connect(tg); tg.connect(out);
    osc.start(when); osc.stop(when + 0.12);
  }

  function drumHat(actx, when, out, vel = 1.0) {
    const nbuf = audio._noiseBuf || (audio._noiseBuf = noiseBuffer(actx, 1.0));
    const n = actx.createBufferSource(); n.buffer = nbuf;

    const hp = actx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.setValueAtTime(6500, when);

    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.35 * vel, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);

    n.connect(hp); hp.connect(g); g.connect(out);
    n.start(when); n.stop(when + 0.08);
  }

  function drumPerc(actx, when, out, vel = 1.0) {
    const osc = actx.createOscillator();
    osc.type = "sine";

    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.28 * vel, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);

    const f0 = 420 + Math.random() * 240;
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.6, when + 0.12);

    const bp = actx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1600 + Math.random() * 900, when);
    bp.Q.value = 6;

    osc.connect(g); g.connect(bp); bp.connect(out);
    osc.start(when); osc.stop(when + 0.18);
  }

  function startAudio(pEff, fbOn, fbMul) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const actx = new AudioContext();

    const masterGain = actx.createGain();
    masterGain.gain.value = masterVol;

    const limiter = actx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    analyserF = actx.createAnalyser();
    analyserF.fftSize = 2048;
    fft = new Uint8Array(analyserF.frequencyBinCount);

    analyserT = actx.createAnalyser();
    analyserT.fftSize = 1024;
    tbuf = new Uint8Array(analyserT.fftSize);

    const f_aud = pEff.f_vis / 16;

    const oscSin = actx.createOscillator();
    oscSin.type = "sine"; oscSin.frequency.value = f_aud;

    const oscTri = actx.createOscillator();
    oscTri.type = "triangle"; oscTri.frequency.value = f_aud * 2;

    const oscDet = actx.createOscillator();
    oscDet.type = "sine"; oscDet.frequency.value = f_aud * (1 + pEff.detune * 0.5);

    const gSin = actx.createGain(); gSin.gain.value = pEff.a;
    const gTri = actx.createGain(); gTri.gain.value = pEff.b;
    const gDet = actx.createGain(); gDet.gain.value = 0.12;

    const sum = actx.createGain();
    oscSin.connect(gSin); gSin.connect(sum);
    oscTri.connect(gTri); gTri.connect(sum);
    oscDet.connect(gDet); gDet.connect(sum);

    const pre = actx.createGain();
    pre.gain.value = 0.65; // pre-gain raised for analyser sensitivity
    sum.connect(pre);

    // ── 4 parallel delay lines ──
    const delayOut = actx.createGain();

    function makeParallelDelay(time, fb, wet) {
      const dNode = actx.createDelay(2.0);
      dNode.delayTime.value = clamp(time, 0, 2);
      const fbGain = actx.createGain();
      fbGain.gain.value = clamp(fb, 0, 0.95);
      const clip = makeSoftClipper(actx, 0.85);
      const wetGain = actx.createGain();
      wetGain.gain.value = clamp(wet, 0, 1);
      pre.connect(dNode);
      dNode.connect(fbGain);
      fbGain.connect(clip);
      clip.connect(dNode);
      dNode.connect(wetGain);
      wetGain.connect(delayOut);
      return { dNode, fbGain, wetGain };
    }

    const pd1 = makeParallelDelay(d1Time, d1Fb, d1Wet);
    const pd2 = makeParallelDelay(d2Time, d2Fb, d2Wet);
    const pd3 = makeParallelDelay(d3Time, d3Fb, d3Wet);
    const pd4 = makeParallelDelay(d4Time, d4Fb, d4Wet);

    const dryGain = actx.createGain();
    dryGain.gain.value = 0.60;
    pre.connect(dryGain);

    // master delay mix gain — scales all 4 delay wet outputs together
    const delayMixGain = actx.createGain();
    delayMixGain.gain.value = delayMix;
    delayOut.connect(delayMixGain);

    const mixBus = actx.createGain();
    dryGain.connect(mixBus);
    delayMixGain.connect(mixBus);

    // tap mixBus directly into analysers so delay echoes register
    // before the limiter can suppress them
    mixBus.connect(analyserF);
    mixBus.connect(analyserT);

    // ── Reverb ──
    const convolver = actx.createConvolver();
    convolver.buffer = makeReverbIR(actx, 2.5, 3.0);
    const rvWet = actx.createGain(); rvWet.gain.value = reverbWet;
    const rvDry = actx.createGain(); rvDry.gain.value = 1 - reverbWet;
    mixBus.connect(convolver); convolver.connect(rvWet);
    mixBus.connect(rvDry);
    const afterReverb = actx.createGain();
    rvWet.connect(afterReverb); rvDry.connect(afterReverb);

    // ── Distortion ──
    const distNode = actx.createWaveShaper();
    distNode.curve = makeDistortionCurve(distDrive);
    distNode.oversample = "2x";
    afterReverb.connect(distNode);

    // ── Lowpass Filter ──
    const filterNode = actx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.value = filterCutoff;
    filterNode.Q.value = filterRes;
    distNode.connect(filterNode);

    // ── Chorus ──
    const chorusDelay = actx.createDelay(0.1);
    chorusDelay.delayTime.value = 0.025;
    const chorusLFO = actx.createOscillator();
    chorusLFO.type = "sine";
    chorusLFO.frequency.value = chorusRate;
    const chorusLFOGain = actx.createGain();
    chorusLFOGain.gain.value = chorusDepth * 0.015;
    const chorusWetGain = actx.createGain();
    chorusWetGain.gain.value = 0.5;
    chorusLFO.connect(chorusLFOGain);
    chorusLFOGain.connect(chorusDelay.delayTime);
    filterNode.connect(chorusDelay);
    chorusDelay.connect(chorusWetGain);
    const chorusOut = actx.createGain();
    filterNode.connect(chorusOut);
    chorusWetGain.connect(chorusOut);

    const masterClip = makeSoftClipper(actx, 0.9);
    chorusOut.connect(masterClip);
    masterClip.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(actx.destination);
    // analysers are already tapped at mixBus (pre-limiter); no second connection needed

    const now = actx.currentTime + 0.02;
    const triOffset = 0.25 / (oscTri.frequency.value || 1);
    oscSin.start(now);
    oscTri.start(now + triOffset);
    oscDet.start(now);
    chorusLFO.start(now);

    audio = {
      ctx: actx,
      masterGain,
      muted: false,
      _noiseBuf: null,
      oscSin, oscTri, oscDet,
      pd1, pd2, pd3, pd4,
      delayMixGain,
      distNode, filterNode, rvWet, rvDry,
      chorusDelay, chorusLFO, chorusLFOGain, chorusWetGain,
      setMute(on) {
        this.muted = on;
        this.masterGain.gain.value = on ? 0 : masterVol;
      },
      setVol(v) {
        masterVol = clamp(v, 0, 1);
        if (!this.muted) this.masterGain.gain.value = masterVol;
      },
      setFreqMul(pEffNow) {
        const f2 = pEffNow.f_vis / 16;
        this.oscSin.frequency.setTargetAtTime(f2, this.ctx.currentTime, 0.015);
        this.oscTri.frequency.setTargetAtTime(f2 * 2, this.ctx.currentTime, 0.015);
        this.oscDet.frequency.setTargetAtTime(f2 * (1 + pEffNow.detune * 0.5), this.ctx.currentTime, 0.015);
      },
      setFeedback(pEffNow, fbOnNow, fbMulNow) {
        const s2 = fbOnNow ? clamp(fbMulNow, 0, 1.2) : 0.0;
        const t = this.ctx.currentTime;
        this.pd1.fbGain.gain.setTargetAtTime(clamp(d1Fb * s2, 0, 0.95), t, 0.02);
        this.pd2.fbGain.gain.setTargetAtTime(clamp(d2Fb * s2, 0, 0.95), t, 0.02);
        this.pd3.fbGain.gain.setTargetAtTime(clamp(d3Fb * s2, 0, 0.95), t, 0.02);
        this.pd4.fbGain.gain.setTargetAtTime(clamp(d4Fb * s2, 0, 0.95), t, 0.02);
      },
      setDelayParams() {
        const t = this.ctx.currentTime;
        this.pd1.dNode.delayTime.setTargetAtTime(clamp(d1Time,0,2), t, 0.02);
        this.pd1.fbGain.gain.setTargetAtTime(clamp(d1Fb,0,0.95), t, 0.02);
        this.pd1.wetGain.gain.setTargetAtTime(d1Wet, t, 0.02);
        this.pd2.dNode.delayTime.setTargetAtTime(clamp(d2Time,0,2), t, 0.02);
        this.pd2.fbGain.gain.setTargetAtTime(clamp(d2Fb,0,0.95), t, 0.02);
        this.pd2.wetGain.gain.setTargetAtTime(d2Wet, t, 0.02);
        this.pd3.dNode.delayTime.setTargetAtTime(clamp(d3Time,0,2), t, 0.02);
        this.pd3.fbGain.gain.setTargetAtTime(clamp(d3Fb,0,0.95), t, 0.02);
        this.pd3.wetGain.gain.setTargetAtTime(d3Wet, t, 0.02);
        this.pd4.dNode.delayTime.setTargetAtTime(clamp(d4Time,0,2), t, 0.02);
        this.pd4.fbGain.gain.setTargetAtTime(clamp(d4Fb,0,0.95), t, 0.02);
        this.pd4.wetGain.gain.setTargetAtTime(d4Wet, t, 0.02);
        this.delayMixGain.gain.setTargetAtTime(delayMix, t, 0.02);
      },
      setDelayMix() {
        this.delayMixGain.gain.setTargetAtTime(delayMix, this.ctx.currentTime, 0.02);
      },
      setEffectParams() {
        const t = this.ctx.currentTime;
        this.rvWet.gain.setTargetAtTime(reverbWet, t, 0.05);
        this.rvDry.gain.setTargetAtTime(1 - reverbWet, t, 0.05);
        this.distNode.curve = makeDistortionCurve(distDrive);
        this.filterNode.frequency.setTargetAtTime(filterCutoff, t, 0.02);
        this.filterNode.Q.setTargetAtTime(filterRes, t, 0.02);
        this.chorusLFO.frequency.setTargetAtTime(chorusRate, t, 0.02);
        this.chorusLFOGain.gain.setTargetAtTime(chorusDepth * 0.015, t, 0.02);
      },
    };

    seqNextTime = actx.currentTime + 0.05;
    seqStep = 0;
    return audio;
  }
  function scheduleBeat(nowSec) {
    if (!audio || !seqOn) return;
    const actx = audio.ctx;
    const stepDur = 60 / Math.max(1, bpm) / 4; // 16th
    const lookahead = 0.12;

    while (seqNextTime < nowSec + lookahead) {
      const s = seqStep & 15;
      if (seq.kick[s])  drumKick(actx, seqNextTime, audio.masterGain, 1.0);
      if (seq.snare[s]) drumSnare(actx, seqNextTime, audio.masterGain, 1.0);
      if (seq.hat[s])   drumHat(actx, seqNextTime, audio.masterGain, 1.0);
      if (seq.perc[s])  drumPerc(actx, seqNextTime, audio.masterGain, 1.0);
      seqStep = (seqStep + 1) & 15;
      seqNextTime += stepDur;
    }
  }

  // freq bands + RMS + transient
  let _prevRms = 0;
  function updateAnalysis() {
    if (!analyserF || !fft || !analyserT || !tbuf) return env;

    analyserF.getByteFrequencyData(fft);
    analyserT.getByteTimeDomainData(tbuf);

    const N = fft.length;
    const band = (a, b) => {
      const i0 = Math.floor(clamp(a, 0, 1) * (N - 1));
      const i1 = Math.floor(clamp(b, 0, 1) * (N - 1));
      let s = 0, c = 0;
      for (let i = i0; i <= i1; i++) { s += fft[i]; c++; }
      return c ? (s / c) / 255 : 0;
    };

    // Bands focused on low-frequency content where the oscillators live
    const bass = band(0.00, 0.05);  // sub/kick range
    const mid  = band(0.05, 0.20);  // main melodic range
    const hi   = band(0.20, 0.60);  // presence/air

    let acc = 0;
    for (let i = 0; i < tbuf.length; i++) {
      const v = (tbuf[i] - 128) / 128;
      acc += v * v;
    }
    const rms = Math.sqrt(acc / tbuf.length);

    const trans = clamp((rms - _prevRms) * 6.0, 0, 1);
    _prevRms = _prevRms * 0.92 + rms * 0.08;

    const level = clamp(0.45 * rms + 0.30 * bass + 0.20 * mid + 0.20 * hi, 0, 1);

    // IIR smoothing: 0.35 hold → fast transient response (~25 ms at 60 fps)
    env.level = env.level * 0.35 + level * 0.65;
    env.bass  = env.bass  * 0.35 + bass  * 0.65;
    env.mid   = env.mid   * 0.35 + mid   * 0.65;
    env.hi    = env.hi    * 0.35 + hi    * 0.65;
    env.rms   = env.rms   * 0.75 + rms   * 0.25;
    env.transient = env.transient * 0.70 + trans * 0.30;

    return env;
  }

  /* ---------- state ---------- */
  let rng = getRand();
  let base = makeParams(rng);

  let driftOn = true;
  let feedbackOn = true;

  let freqMul = 1.0;
  let fbMul = 1.05;
  let densityMul = 1.25;
  let exposure = 1.25;

  let warpOn = true;
  let warpMul = 1.0;

  // optional sliders
  let reactMul = 0.85;
  let colorAmt = 0.35;
  let quality  = 0.80;

  // manual overrides (optional)
  const ui = {
    rot: null, shear: null, phiOffset: null, pmDepth: null,
    osc3Mix: null, osc4Mul: null, warpBase: null,
  };

  // ── delay bank state ──
  let d1Time = 0.15, d1Fb = 0.60, d1Wet = 0.50;
  let d2Time = 0.30, d2Fb = 0.50, d2Wet = 0.40;
  let d3Time = 0.70, d3Fb = 0.40, d3Wet = 0.30;
  let d4Time = 0.08, d4Fb = 0.60, d4Wet = 0.40;
  let delayMix = 0.75;

  // ── effects state ──
  let reverbWet    = 0.30;
  let distDrive    = 0.20;
  let filterCutoff = 8000;
  let filterRes    = 2.0;
  let chorusDepth  = 0.30;
  let chorusRate   = 0.50;

  // ── harmonics state ──
  const HARMONIC_RATIOS = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 7.0];
  let harmonicsMix   = 0.50;
  let phaseDriftRate = 0.30;
  let layerPhases    = [0, 0.14, 0.28, 0.42, 0.56, 0.70, 0.84];

  let driftPhase = 0;
  let lastT = performance.now();
  function stepDrift(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (!driftOn) return;
    driftPhase = (driftPhase + base.driftCps * dt) % 1;
    for (let i = 0; i < 7; i++)
      layerPhases[i] = (layerPhases[i] + phaseDriftRate * (i + 1) * 0.003 * dt) % 1;
  }

  function effective(nowMs) {
    const f_vis = clamp(base.f_vis * freqMul, 200, 12000);
    const nowSec = nowMs / 1000;
    const wMod = 0.65 + 0.35 * Math.sin(TAU * (base.warpRate * nowSec) + TAU * base.warpPhase);

    const rot = (ui.rot !== null) ? ui.rot : base.rot;
    const shear = (ui.shear !== null) ? ui.shear : base.shear;
    const phiOffset = (ui.phiOffset !== null) ? ui.phiOffset : base.phiOffset;
    const pmDepth = (ui.pmDepth !== null) ? ui.pmDepth : base.pmDepth;
    const osc3Mix = (ui.osc3Mix !== null) ? ui.osc3Mix : base.osc3Mix;
    const osc4Mul = (ui.osc4Mul !== null) ? ui.osc4Mul : base.osc4Mul;
    const warpBase = (ui.warpBase !== null) ? ui.warpBase : base.warpBase;

    const fb = feedbackOn ? clamp(fbMul, 0, 1.5) : 0;
    const visAlpha = feedbackOn ? clamp(0.55 + 0.35 * Math.min(1, fb), 0.55, 0.92) : 0;

    const scale = 1 + (base.fbScale - 1) * (0.35 + 1.8 * fb);
    const rotate2 = base.fbRotate * (0.35 + 2.0 * fb);
    const shift = base.fbShift * (0.35 + 2.4 * fb);

    const warpEff = (warpOn ? clamp(warpBase * warpMul * wMod, 0, 0.65) : 0);

    return {
      ...base,
      f_vis, rot, shear, phiOffset, pmDepth, osc3Mix, osc4Mul, warpBase,
      fbMulEff: fb,
      visAlpha,
      fbScaleEff: scale,
      fbRotateEff: rotate2,
      fbShiftEff: shift,
      nowSec,
      warpEff,
    };
  }

  function savePNG() {
    const a = document.createElement("a");
    a.download = `synthi_${Date.now()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  function reroll() {
    rerollCounter++;
    rng = getRand();
    base = makeParams(rng);

    driftPhase = 0;
    lastT = performance.now();
    renderSeed = xmur3(`${Date.now()}|${Math.random()}|${rerollCounter}`)();

    clearHard();

    if (audio) {
      const p = effective(performance.now());
      audio.setFreqMul(p);
      audio.setFeedback(p, feedbackOn, fbMul);
    }
    if (window.$fx && typeof window.$fx.preview === "function") window.$fx.preview();
  }

  /* ---------- keyboard ---------- */
  window.addEventListener("keydown", async (e) => {
    const k = e.key;
    if (k === "p" || k === "P") savePNG();
    if (k === "r" || k === "R") reroll();

    if (k === "f" || k === "F") { feedbackOn = !feedbackOn; clearHard(); if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul); }
    if (k === "d" || k === "D") driftOn = !driftOn;

    if (k === ",") { fbMul = clamp(fbMul - 0.05, 0, 1.5); if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul); }
    if (k === ".") { fbMul = clamp(fbMul + 0.05, 0, 1.5); if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul); }

    if (k === "[") densityMul = clamp(densityMul - 0.05, 0.2, 2.0);
    if (k === "]") densityMul = clamp(densityMul + 0.05, 0.2, 2.0);

    if (k === "-") exposure = clamp(exposure - 0.05, 0.4, 2.0);
    if (k === "=") exposure = clamp(exposure + 0.05, 0.4, 2.0);

    if (k === "w" || k === "W") { warpOn = !warpOn; clearHard(); }
    if (k === "k" || k === "K") warpMul = clamp(warpMul - 0.05, 0, 1.6);
    if (k === "l" || k === "L") warpMul = clamp(warpMul + 0.05, 0, 1.6);

    if (k === "a" || k === "A") {
      try {
        if (!audio) audio = startAudio(effective(performance.now()), feedbackOn, fbMul);
        if (audio && audio.ctx.state !== "running") await audio.ctx.resume();
      } catch (err) {
        log("Audio error: " + (err?.message || err));
      }
    }
    if (k === "m" || k === "M") if (audio) audio.setMute(!audio.muted);
  });

  /* ---------- UI bindings ---------- */
  const btnStart = document.getElementById("synthiStart");
  const btnMute  = document.getElementById("synthiMute");
  const btnReroll = document.getElementById("synthiReroll");
  const btnDrift  = document.getElementById("synthiDriftToggle");
  const btnFb     = document.getElementById("synthiFbToggle");

  const freqSlider = document.getElementById("freqSlider");
  const fbSlider = document.getElementById("fbSlider");
  const freqVal = document.getElementById("freqVal");
  const fbVal = document.getElementById("fbVal");

  const volSlider = document.getElementById("volSlider");
  const bpmSlider = document.getElementById("bpmSlider");
  const volVal = document.getElementById("volVal");
  const bpmVal = document.getElementById("bpmVal");

  const seqToggle = document.getElementById("seqToggle");
  const seqGrid = document.getElementById("seqGrid");
  const padKick = document.getElementById("padKick");
  const padSnare = document.getElementById("padSnare");
  const padHat = document.getElementById("padHat");
  const padPerc = document.getElementById("padPerc");

  const reactSlider = document.getElementById("reactSlider");
  const colorSlider = document.getElementById("colorSlider");
  const qualitySlider = document.getElementById("qualitySlider");
  const reactVal = document.getElementById("reactVal");
  const colorVal = document.getElementById("colorVal");
  const qualityVal = document.getElementById("qualityVal");

  if (btnReroll) btnReroll.addEventListener("click", reroll);
  if (btnDrift) btnDrift.addEventListener("click", () => {
    driftOn = !driftOn;
    btnDrift.textContent = `Drift: ${driftOn ? "ON" : "OFF"}`;
  });
  if (btnFb) btnFb.addEventListener("click", () => {
    feedbackOn = !feedbackOn;
    btnFb.textContent = `Feedback: ${feedbackOn ? "ON" : "OFF"}`;
    clearHard();
    if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul);
  });
  if (btnStart) btnStart.addEventListener("click", async () => {
    try {
      if (!audio) audio = startAudio(effective(performance.now()), feedbackOn, fbMul);
      if (audio && audio.ctx.state !== "running") await audio.ctx.resume();
    } catch (err) { log("Audio error: " + (err?.message || err)); }
  });
  if (btnMute) btnMute.addEventListener("click", () => {
    if (!audio) return;
    audio.setMute(!audio.muted);
    btnMute.textContent = audio.muted ? "Unmute" : "Mute";
  });

  function syncFreqUI() {
    if (freqVal) freqVal.textContent = `×${freqMul.toFixed(2)}`;
    if (freqSlider) freqSlider.value = String(freqMul);
  }
  if (freqSlider) {
    const v = parseFloat(freqSlider.value);
    if (!Number.isNaN(v)) freqMul = v;
    syncFreqUI();
    freqSlider.addEventListener("input", () => {
      const nv = parseFloat(freqSlider.value);
      if (!Number.isNaN(nv)) freqMul = nv;
      syncFreqUI();
      if (audio) audio.setFreqMul(effective(performance.now()));
    });
  }

  function syncFbUI() {
    if (fbVal) fbVal.textContent = feedbackOn ? fbMul.toFixed(2) : "OFF";
    if (fbSlider) fbSlider.value = String(fbMul);
  }
  if (fbSlider) {
    const v = parseFloat(fbSlider.value);
    if (!Number.isNaN(v)) fbMul = v;
    syncFbUI();
    fbSlider.addEventListener("input", () => {
      const nv = parseFloat(fbSlider.value);
      if (!Number.isNaN(nv)) fbMul = nv;
      syncFbUI();
      if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul);
    });
  }

  function syncVolUI() {
    if (volVal) volVal.textContent = masterVol.toFixed(2);
    if (volSlider) volSlider.value = String(masterVol);
  }
  if (volSlider) {
    masterVol = clamp(parseFloat(volSlider.value) || masterVol, 0, 1);
    syncVolUI();
    volSlider.addEventListener("input", () => {
      masterVol = clamp(parseFloat(volSlider.value) || 0, 0, 1);
      if (audio) audio.setVol(masterVol);
      syncVolUI();
    });
  }

  function syncBpmUI() {
    if (bpmVal) bpmVal.textContent = `${Math.round(bpm)} BPM`;
    if (bpmSlider) bpmSlider.value = String(Math.round(bpm));
  }
  if (bpmSlider) {
    bpm = clamp(parseFloat(bpmSlider.value) || bpm, 30, 240);
    syncBpmUI();
    bpmSlider.addEventListener("input", () => {
      bpm = clamp(parseFloat(bpmSlider.value) || 120, 30, 240);
      syncBpmUI();
    });
  }

  function syncReactUI() {
    if (reactVal) reactVal.textContent = reactMul.toFixed(2);
    if (reactSlider) reactSlider.value = String(reactMul);
  }
  if (reactSlider) {
    reactMul = clamp(parseFloat(reactSlider.value) || reactMul, 0, 2);
    syncReactUI();
    reactSlider.addEventListener("input", () => {
      reactMul = clamp(parseFloat(reactSlider.value) || 0, 0, 2);
      syncReactUI();
    });
  }

  function syncColorUI() {
    if (colorVal) colorVal.textContent = colorAmt.toFixed(2);
    if (colorSlider) colorSlider.value = String(colorAmt);
  }
  if (colorSlider) {
    colorAmt = clamp(parseFloat(colorSlider.value) || colorAmt, 0, 1);
    syncColorUI();
    colorSlider.addEventListener("input", () => {
      colorAmt = clamp(parseFloat(colorSlider.value) || 0, 0, 1);
      syncColorUI();
    });
  }

  function syncQualityUI() {
    if (qualityVal) qualityVal.textContent = quality.toFixed(2);
    if (qualitySlider) qualitySlider.value = String(quality);
  }
  if (qualitySlider) {
    quality = clamp(parseFloat(qualitySlider.value) || quality, 0.2, 1);
    syncQualityUI();
    qualitySlider.addEventListener("input", () => {
      quality = clamp(parseFloat(qualitySlider.value) || 0.8, 0.2, 1);
      syncQualityUI();
    });
  }

  /* ---------- sequencer UI ---------- */
  function setDefaultPattern() {
    for (let i = 0; i < 16; i++) { seq.kick[i]=0; seq.snare[i]=0; seq.hat[i]=0; seq.perc[i]=0; }
    [0, 8].forEach(i => seq.kick[i] = 1);
    [4, 12].forEach(i => seq.snare[i] = 1);
    for (let i = 0; i < 16; i += 2) seq.hat[i] = 1;
    [7, 15].forEach(i => seq.perc[i] = 1);
  }

  function refreshSeqBtn() {
    if (seqToggle) seqToggle.textContent = seqOn ? "Beat: ON" : "Beat: OFF";
  }

  function drawSeqGrid() {
    if (!seqGrid) return;
    seqGrid.innerHTML = "";
    seqGrid.style.gridTemplateColumns = "80px repeat(16, 1fr)";
    seqGrid.style.gap = "6px";

    const tracks = [
      { key: "kick",  label: "Kick" },
      { key: "snare", label: "Snare" },
      { key: "hat",   label: "Hat" },
      { key: "perc",  label: "Perc" },
    ];

    for (const tr of tracks) {
      const lab = document.createElement("div");
      lab.textContent = tr.label;
      lab.style.font = "12px ui-monospace, Menlo, monospace";
      lab.style.opacity = "0.75";
      lab.style.alignSelf = "center";
      seqGrid.appendChild(lab);

      for (let i = 0; i < 16; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btnSm";
        b.style.padding = "8px 0";
        b.style.justifyContent = "center";
        b.textContent = String(i + 1);

        b.style.opacity = seq[tr.key][i] ? "1" : "0.35";
        b.addEventListener("click", () => {
          seq[tr.key][i] = seq[tr.key][i] ? 0 : 1;
          b.style.opacity = seq[tr.key][i] ? "1" : "0.35";
        });
        seqGrid.appendChild(b);
      }
    }
  }

  setDefaultPattern();
  drawSeqGrid();

  if (seqToggle) {
    refreshSeqBtn();
    seqToggle.addEventListener("click", async () => {
      try {
        if (!audio) audio = startAudio(effective(performance.now()), feedbackOn, fbMul);
        if (audio && audio.ctx.state !== "running") await audio.ctx.resume();
      } catch {}
      seqOn = !seqOn;
      if (audio) { seqStep = 0; seqNextTime = audio.ctx.currentTime + 0.05; }
      refreshSeqBtn();
    });
  }

  function firePad(kind) {
    if (!audio) return;
    const t = audio.ctx.currentTime + 0.005;
    if (kind === "kick") drumKick(audio.ctx, t, audio.masterGain, 1.0);
    if (kind === "snare") drumSnare(audio.ctx, t, audio.masterGain, 1.0);
    if (kind === "hat") drumHat(audio.ctx, t, audio.masterGain, 1.0);
    if (kind === "perc") drumPerc(audio.ctx, t, audio.masterGain, 1.0);
  }
  if (padKick) padKick.addEventListener("click", () => firePad("kick"));
  if (padSnare) padSnare.addEventListener("click", () => firePad("snare"));
  if (padHat) padHat.addEventListener("click", () => firePad("hat"));
  if (padPerc) padPerc.addEventListener("click", () => firePad("perc"));

  // ── delay bank UI bindings ──
  function bindRangeSlider(id, valId, getter, setter, fmt, onSet) {
    const el = document.getElementById(id);
    const vEl = document.getElementById(valId);
    if (!el) return;
    const sync = () => { if (vEl) vEl.textContent = fmt(getter()); el.value = String(getter()); };
    sync();
    el.addEventListener("input", () => {
      setter(parseFloat(el.value));
      sync();
      if (onSet) onSet();
    });
  }

  bindRangeSlider("d1TimeSlider","d1TimeVal", ()=>d1Time, v=>{d1Time=v;}, v=>v.toFixed(2)+"s", ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d1FbSlider",  "d1FbVal",   ()=>d1Fb,   v=>{d1Fb=clamp(v,0,0.95);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d1WetSlider", "d1WetVal",  ()=>d1Wet,  v=>{d1Wet=clamp(v,0,1);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d2TimeSlider","d2TimeVal", ()=>d2Time, v=>{d2Time=v;}, v=>v.toFixed(2)+"s", ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d2FbSlider",  "d2FbVal",   ()=>d2Fb,   v=>{d2Fb=clamp(v,0,0.95);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d2WetSlider", "d2WetVal",  ()=>d2Wet,  v=>{d2Wet=clamp(v,0,1);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d3TimeSlider","d3TimeVal", ()=>d3Time, v=>{d3Time=v;}, v=>v.toFixed(2)+"s", ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d3FbSlider",  "d3FbVal",   ()=>d3Fb,   v=>{d3Fb=clamp(v,0,0.95);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d3WetSlider", "d3WetVal",  ()=>d3Wet,  v=>{d3Wet=clamp(v,0,1);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d4TimeSlider","d4TimeVal", ()=>d4Time, v=>{d4Time=v;}, v=>v.toFixed(2)+"s", ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d4FbSlider",  "d4FbVal",   ()=>d4Fb,   v=>{d4Fb=clamp(v,0,0.95);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("d4WetSlider", "d4WetVal",  ()=>d4Wet,  v=>{d4Wet=clamp(v,0,1);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayParams(); });
  bindRangeSlider("delayMixSlider", "delayMixVal", ()=>delayMix, v=>{delayMix=clamp(v,0,1);}, v=>v.toFixed(2), ()=>{ if(audio) audio.setDelayMix(); });

  // ── effects UI bindings ──
  bindRangeSlider("reverbWetSlider",    "reverbWetVal",    ()=>reverbWet,    v=>{reverbWet=clamp(v,0,1);},       v=>v.toFixed(2),        ()=>{ if(audio) audio.setEffectParams(); });
  bindRangeSlider("distDriveSlider",    "distDriveVal",    ()=>distDrive,    v=>{distDrive=clamp(v,0,1);},       v=>v.toFixed(2),        ()=>{ if(audio) audio.setEffectParams(); });
  bindRangeSlider("filterCutoffSlider", "filterCutoffVal", ()=>filterCutoff, v=>{filterCutoff=clamp(v,200,20000);}, v=>Math.round(v)+"Hz", ()=>{ if(audio) audio.setEffectParams(); });
  bindRangeSlider("filterResSlider",    "filterResVal",    ()=>filterRes,    v=>{filterRes=clamp(v,0,20);},      v=>v.toFixed(1),        ()=>{ if(audio) audio.setEffectParams(); });
  bindRangeSlider("chorusDepthSlider",  "chorusDepthVal",  ()=>chorusDepth,  v=>{chorusDepth=clamp(v,0,1);},     v=>v.toFixed(2),        ()=>{ if(audio) audio.setEffectParams(); });
  bindRangeSlider("chorusRateSlider",   "chorusRateVal",   ()=>chorusRate,   v=>{chorusRate=clamp(v,0.1,5);},    v=>v.toFixed(2)+"Hz",   ()=>{ if(audio) audio.setEffectParams(); });

  // ── harmonics UI bindings ──
  bindRangeSlider("harmonicsSlider",  "harmonicsVal",  ()=>harmonicsMix,   v=>{harmonicsMix=clamp(v,0,1);},   v=>v.toFixed(2), null);
  bindRangeSlider("phaseDriftSlider", "phaseDriftVal", ()=>phaseDriftRate, v=>{phaseDriftRate=clamp(v,0,2);}, v=>v.toFixed(2), null);

  window.addEventListener("resize", () => clearHard());

  clearHard();
  syncFreqUI(); syncFbUI(); syncVolUI(); syncBpmUI();
  syncReactUI(); syncColorUI(); syncQualityUI();
  function projectFeedback(p) {
    if (!feedbackOn) return;

    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    ctx2d.save();
    ctx2d.globalCompositeOperation = "source-over";
    ctx2d.globalAlpha = p.visAlpha;

    const dpr = _locked.dpr || 1;
    const shift = p.fbShiftEff * dpr;

    ctx2d.translate(cx + shift, cy);
    ctx2d.rotate(p.fbRotateEff);
    ctx2d.scale(p.fbScaleEff, p.fbScaleEff);
    ctx2d.translate(-cx, -cy);

    ctx2d.drawImage(canvas, 0, 0);
    ctx2d.restore();
  }

  function rgbFromBands(bass, mid, hi, amt) {
    const r = clamp(0.15 + 1.20 * bass, 0, 1);
    const g = clamp(0.12 + 1.05 * mid, 0, 1);
    const b = clamp(0.10 + 1.35 * hi, 0, 1);

    if (amt <= 0.001) return "rgba(235,235,235,1)";
    const mix = clamp(amt, 0, 1);

    const R = Math.round(235 * (1 - mix) + (255 * r) * mix);
    const G = Math.round(235 * (1 - mix) + (255 * g) * mix);
    const B = Math.round(235 * (1 - mix) + (255 * b) * mix);
    return `rgba(${R},${G},${B},1)`;
  }

  /* ---------- anti-freeze adaptive quality ---------- */
  let fpsAvg = 60;
  let lastFpsT = performance.now();
  let frames = 0;
  let qAuto = 1.0;

  function updateFps(now) {
    frames++;
    const dt = now - lastFpsT;
    if (dt >= 500) {
      const fps = (frames * 1000) / dt;
      fpsAvg = fpsAvg * 0.85 + fps * 0.15;
      frames = 0;
      lastFpsT = now;

      if (fpsAvg < 40) qAuto = clamp(qAuto * 0.92, 0.35, 1.10);
      else if (fpsAvg > 56) qAuto = clamp(qAuto * 1.02, 0.35, 1.25);
    }
  }

  /* ---------- beat flashes ---------- */
  let lastBeatStep = -1;
  let kickFlash = 0;
  let snareFlash = 0;

  function updateBeatFlash() {
    if (!audio || !seqOn) return;
    const s = seqStep & 15;
    if (s !== lastBeatStep) {
      lastBeatStep = s;
      if (seq.kick[s]) kickFlash = 1.0;
      if (seq.snare[s]) snareFlash = 1.0;
    }
    kickFlash *= 0.86;
    snareFlash *= 0.84;
  }

  /* ---------- meta throttle ---------- */
  let lastMeta = "";
  let lastMetaAt = 0;
  function setMetaThrottled(text, nowMs) {
    if (text === lastMeta) return;
    if (nowMs - lastMetaAt < 125) return;
    lastMetaAt = nowMs;
    lastMeta = text;
    log(text);
    if (meta) meta.textContent = text;
  }

  /* ---------- render loop ---------- */
  function tick(now) {
    try {
      updateFps(now);
      stepDrift(now);
      ensureCanvasSizeLocked();

      if (audio) {
        scheduleBeat(audio.ctx.currentTime);
        updateAnalysis();
      }
      updateBeatFlash();

      const aL = env.level;
      const aB = env.bass;
      const aM = env.mid;
      const aH = env.hi;

      const R = reactMul;

      const densReact = clamp(0.75 + (2.80 * aL + 0.55 * kickFlash) * R, 0.30, 2.50);
      const expoReact = clamp(0.85 + (3.20 * aB + 0.35 * snareFlash) * R, 0.40, 3.00);
      const warpReact = clamp(0.80 + (3.50 * aH) * R, 0.00, 2.40);

      // ── delay → visual modulation ──
      const dMix = delayMix;
      const d1VisWarp    = d1Fb * d1Wet * dMix * 0.55;  // d1 short echo → warp
      const d2VisDens    = 1 + d2Fb * d2Wet * dMix * 0.90; // d2 medium → density
      const d3VisPhiSprd = d3Fb * d3Wet * dMix * 0.10;  // d3 long → phiSpread boost
      const d4VisFlutter = d4Fb * d4Wet * dMix * 10.0;  // d4 flutter → pixel jitter

      const densityMulEff = clamp(densityMul * densReact * d2VisDens, 0.2, 3.5);
      const exposureEff   = clamp(exposure   * expoReact, 0.4, 3.2);

      const warpMulUser = warpMul;
      if (audio && warpOn) warpMul = clamp(warpMul * warpReact + d1VisWarp, 0, 2.0);
      const p = effective(now);
      warpMul = warpMulUser;

      if (audio) {
        audio.setFreqMul(p);
        audio.setFeedback(p, feedbackOn, fbMul);
      }

      projectFeedback(p);

      ctx2d.save();
      ctx2d.globalCompositeOperation = "source-over";
      const decayBase = feedbackOn ? (0.040 + 0.030 * Math.min(1, fbMul)) : 0.070;
      const decay = clamp(decayBase * (1.05 - 1.10 * aL * R), 0.012, 0.11);
      ctx2d.globalAlpha = decay;
      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.restore();

      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const pad = Math.min(W, H) * p.padFrac;
      const sx = (W / 2 - pad) * p.gain;
      const sy = (H / 2 - pad) * p.gain;

      const amp = (0.86 + 0.16 * Math.sin(TAU * (p.ampRate * p.nowSec)));
      const dens = (0.62 + 0.38 * Math.sin(TAU * (p.densRate * p.nowSec + 0.2)));
      const phiSpread = p.phiSpreadBase * (0.55 + 1.05 * (1 - dens)) + d3VisPhiSprd;
      const phiBase = p.phi + (driftOn ? driftPhase : 0);

      const q = clamp(quality * qAuto, 0.20, 1.20);
      const baseN = 52000;
      const Nraw = baseN * dens * densityMulEff * Math.pow(q, 1.20);
      const Ncap = 92000;
      const N = Math.max(2000, Math.min(Ncap, Math.floor(Nraw)));

      const TWIN = 0.30;
      const pix = p.pixel;
      const s = Math.max(1, Math.round(pix * (1.0 + (1.0 - q) * 0.65)));

      const frameSeed = (renderSeed ^ (now | 0) ^ (N * 2654435761)) >>> 0;
      const rr = mulberry32(frameSeed);

      // ── multi-layer Lissajous ──
      const beatLift = 0.55 * kickFlash + 0.25 * snareFlash;
      const jitterK = (1.20 + 1.90 * aH * R + 0.55 * beatLift) * s;
      const nLayers = Math.max(1, Math.round(1 + harmonicsMix * 6));
      const fillColor = rgbFromBands(aB, aM, aH, colorAmt);

      for (let li = 0; li < nLayers; li++) {
        const ratio = HARMONIC_RATIOS[li];
        const pLayer = { ...p, f_vis: p.f_vis * ratio };
        const layerAlphaScale = li === 0 ? 1.0 : 0.45 / Math.sqrt(li);
        const alphaBase = (0.24 + 0.76 * aL * R + 0.22 * beatLift) * layerAlphaScale;
        const alpha = clamp(alphaBase * exposureEff, 0.04, 0.95);

        ctx2d.save();
        ctx2d.globalCompositeOperation = "lighter";
        ctx2d.globalAlpha = alpha;
        ctx2d.fillStyle = fillColor;

        const layerN = li === 0
          ? Math.floor(N * 0.5)
          : Math.floor(N * 0.5 / Math.max(1, nLayers - 1));
        const layerPhi = phiBase + layerPhases[li];

        for (let i = 0; i < layerN; i++) {
          const t = rr() * TWIN;
          const phiPoint = layerPhi + (rr() * 2 - 1) * phiSpread;
          const { x, y } = xyAt(t, pLayer, phiPoint, p.nowSec);

          const flutterX = d4VisFlutter * Math.sin(p.nowSec * 47.3 + i * 0.11);
          const flutterY = d4VisFlutter * Math.cos(p.nowSec * 53.7 + i * 0.07);
          const px0 = (cx + x * sx * amp + flutterX) | 0;
          const py0 = (cy - y * sy * amp + flutterY) | 0;
          const px = (px0 + (((rr() * 2 - 1) * jitterK) | 0));
          const py = (py0 + (((rr() * 2 - 1) * jitterK) | 0));

          if (px <= 0 || py <= 0 || px >= W || py >= H) continue;
          ctx2d.fillRect(px, py, s, s);
          if ((i & 31) === 0 && (rr() < 0.65 + 0.30 * aH)) ctx2d.fillRect(px + s, py, s, s);
          if ((i & 63) === 0 && (rr() < 0.55 + 0.35 * aH)) ctx2d.fillRect(px, py + s, s, s);
        }

        ctx2d.restore();
      }

      const detCents = 1200 * Math.log2(1 + p.detune);
      const text =
        `SYNTHI • f ${p.f_vis.toFixed(0)}Hz • fb ${feedbackOn ? fbMul.toFixed(2) : "OFF"} • ` +
        `warp ${warpOn ? warpMul.toFixed(2) : "OFF"} (${p.warpEff.toFixed(3)}) • ` +
        `dens ${densityMul.toFixed(2)}→${densityMulEff.toFixed(2)} • exp ${exposure.toFixed(2)}→${exposureEff.toFixed(2)} • ` +
        `beat ${seqOn ? "ON" : "OFF"} ${Math.round(bpm)}bpm • lvl ${env.level.toFixed(2)} • ` +
        `react ${reactMul.toFixed(2)} • col ${colorAmt.toFixed(2)} • q ${q.toFixed(2)} • fps~${fpsAvg.toFixed(0)} • det ${detCents.toFixed(1)}c`;

      setMetaThrottled(text, now);

    } catch (err) {
      log("RUNTIME ERROR: " + (err?.message || err));
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  log("SYNTHI running. Press A for audio. Beat toggle in UI.");
})();
