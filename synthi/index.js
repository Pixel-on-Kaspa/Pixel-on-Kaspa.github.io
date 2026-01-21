// synthi/index.js — PATCH A + WARP + BEAT (no-samples drum synth)
// Video-feedback sculpture + audio-reactive visuals + step sequencer
//
// Keys:
//  A = start/resume audio
//  M = mute
//  R = reroll
//  F = toggle feedback
//  D = toggle drift
//  [ ] = density -/+
//  - = = exposure -/+
//  , . = feedback strength -/+
//  W = warp on/off
//  K / L = warp -/+
//  P = screenshot PNG

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
  const canvas =
    document.getElementById("synthiCanvas") ||
    document.querySelector("canvas");
  const meta = document.getElementById("synthiMeta") || null;

  if (!canvas) {
    log("ERROR: canvas not found. Need <canvas id='synthiCanvas'> or any <canvas>.");
    return;
  }
  const ctx2d = canvas.getContext("2d", { alpha: false });
  if (!ctx2d) {
    log("ERROR: cannot get 2D context.");
    return;
  }

  /* ---------- RNG / reroll ---------- */
  let rerollCounter = 0;
  let renderSeed = 123456;

  function getRand() {
    if (window.$fx && typeof window.$fx.rand === "function") return () => window.$fx.rand();
    const s = `${location.pathname}|${location.search}|${location.hash}|SYNTHI|${rerollCounter}|${Date.now()}`;
    return mulberry32(xmur3(s)());
  }

  /* ---------- LOCKED square canvas sizing (with caps) ---------- */
  let _locked = { w: 0, h: 0, dpr: 1, css: 0 };
  function ensureCanvasSizeLocked() {
    const dpr = Math.max(1, Math.min(2.25, window.devicePixelRatio || 1)); // keep sane
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();

    const maxByWidth = rect.width;
    const maxByViewport = window.innerHeight * 0.72;
    const HARD_MAX = 860;

    const sideCss = Math.max(240, Math.floor(Math.min(maxByWidth, maxByViewport, HARD_MAX)));
    const W = Math.floor(sideCss * dpr);
    const H = Math.floor(sideCss * dpr);

    const changed =
      (W !== _locked.w) || (H !== _locked.h) || (dpr !== _locked.dpr) || (sideCss !== _locked.css);

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

      xSin: 0.95,
      ySin: 0.95,
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

      // audio “space” parameters (delays)
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

  /* ---------- audio: master + limiter + analyser + drum synth ---------- */
  let audio = null;

  let masterVol = 0.70;
  let analyser = null;
  let fft = null;
  let env = { level: 0, bass: 0, mid: 0, hi: 0 };

  // beat seq
  let seqOn = false;
  let bpm = 120;
  let seqStep = 0;
  let seqNextTime = 0;
  const seq = {
    kick: new Array(16).fill(0),
    snare: new Array(16).fill(0),
    hat: new Array(16).fill(0),
    perc: new Array(16).fill(0),
  };

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

  // drum synth helpers
  function noiseBuffer(actx, seconds = 1.0) {
    const len = Math.max(1, Math.floor(actx.sampleRate * seconds));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.9;
    return buf;
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
    osc.connect(g);
    g.connect(drive);
    drive.connect(out);

    osc.start(when);
    osc.stop(when + 0.30);
  }

  function drumSnare(actx, when, out, vel = 1.0) {
    const nbuf = audio._noiseBuf || (audio._noiseBuf = noiseBuffer(actx, 1.0));
    const n = actx.createBufferSource();
    n.buffer = nbuf;

    const hp = actx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(900, when);

    const bp = actx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1900, when);
    bp.Q.value = 0.9;

    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.65 * vel, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);

    n.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(out);

    n.start(when);
    n.stop(when + 0.20);

    const osc = actx.createOscillator();
    osc.type = "triangle";
    const tg = actx.createGain();
    tg.gain.setValueAtTime(0.0001, when);
    tg.gain.exponentialRampToValueAtTime(0.18 * vel, when + 0.004);
    tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.frequency.setValueAtTime(210, when);
    osc.connect(tg);
    tg.connect(out);
    osc.start(when);
    osc.stop(when + 0.12);
  }

  function drumHat(actx, when, out, vel = 1.0) {
    const nbuf = audio._noiseBuf || (audio._noiseBuf = noiseBuffer(actx, 1.0));
    const n = actx.createBufferSource();
    n.buffer = nbuf;

    const hp = actx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(6500, when);

    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.35 * vel, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);

    n.connect(hp);
    hp.connect(g);
    g.connect(out);

    n.start(when);
    n.stop(when + 0.08);
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

    osc.connect(g);
    g.connect(bp);
    bp.connect(out);

    osc.start(when);
    osc.stop(when + 0.18);
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

    analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    fft = new Uint8Array(analyser.frequencyBinCount);

    const f_aud = pEff.f_vis / 16;

    const oscSin = actx.createOscillator();
    oscSin.type = "sine";
    oscSin.frequency.value = f_aud;

    const oscTri = actx.createOscillator();
    oscTri.type = "triangle";
    oscTri.frequency.value = f_aud * 2;

    const oscDet = actx.createOscillator();
    oscDet.type = "sine";
    oscDet.frequency.value = f_aud * (1 + pEff.detune * 0.5);

    const gSin = actx.createGain(); gSin.gain.value = pEff.a;
    const gTri = actx.createGain(); gTri.gain.value = pEff.b;
    const gDet = actx.createGain(); gDet.gain.value = 0.12;

    oscSin.connect(gSin);
    oscTri.connect(gTri);
    oscDet.connect(gDet);

    const sum = actx.createGain();
    gSin.connect(sum); gTri.connect(sum); gDet.connect(sum);

    const pre = actx.createGain();
    pre.gain.value = 0.22;

    const s = fbOn ? clamp(fbMul, 0, 1.2) : 0.0;

    const d1 = buildDelayStage(actx, pEff.t1, clamp(pEff.fb1 * s, 0, 0.95), 0.85);
    const d2 = buildDelayStage(actx, pEff.t2, clamp(pEff.fb2 * s, 0, 0.95), 0.95);
    const d3 = buildDelayStage(actx, pEff.t3, clamp(pEff.fb3 * s, 0, 0.95), 1.05);

    const post = actx.createGain();
    post.gain.value = 0.9;

    const masterClip = makeSoftClipper(actx, 0.9);

    sum.connect(pre);
    pre.connect(d1.delay);
    d1.delay.connect(d2.delay);
    d2.delay.connect(d3.delay);
    d3.delay.connect(post);
    post.connect(masterClip);

    masterClip.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(actx.destination);

    const now = actx.currentTime + 0.02;
    const triOffset = 0.25 / (oscTri.frequency.value || 1);
    oscSin.start(now);
    oscTri.start(now + triOffset);
    oscDet.start(now);

    audio = {
      ctx: actx,
      masterGain,
      muted: false,
      _noiseBuf: null,

      oscSin, oscTri, oscDet,
      d1, d2, d3,

      setMute(on) {
        this.muted = on;
        this.masterGain.gain.value = on ? 0 : masterVol;
      },
      setVol(v) {
        masterVol = clamp(v, 0, 1);
        if (!this.muted) this.masterGain.gain.value = masterVol;
      },
      setFreqMul(pEffNow) {
        // update osc freqs live
        const f_aud2 = pEffNow.f_vis / 16;
        this.oscSin.frequency.setTargetAtTime(f_aud2, this.ctx.currentTime, 0.015);
        this.oscTri.frequency.setTargetAtTime(f_aud2 * 2, this.ctx.currentTime, 0.015);
        this.oscDet.frequency.setTargetAtTime(f_aud2 * (1 + pEffNow.detune * 0.5), this.ctx.currentTime, 0.015);
      },
      setFeedback(pEffNow, fbOnNow, fbMulNow) {
        const s2 = fbOnNow ? clamp(fbMulNow, 0, 1.2) : 0.0;
        this.d1.fbGain.gain.setTargetAtTime(clamp(pEffNow.fb1 * s2, 0, 0.95), this.ctx.currentTime, 0.02);
        this.d2.fbGain.gain.setTargetAtTime(clamp(pEffNow.fb2 * s2, 0, 0.95), this.ctx.currentTime, 0.02);
        this.d3.fbGain.gain.setTargetAtTime(clamp(pEffNow.fb3 * s2, 0, 0.95), this.ctx.currentTime, 0.02);
      },
      stop() {
        try { this.oscSin.stop(); this.oscTri.stop(); this.oscDet.stop(); } catch {}
        try { actx.close(); } catch {}
      }
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

  function updateAnalysis() {
    if (!analyser || !fft) return env;

    analyser.getByteFrequencyData(fft);
    const N = fft.length;

    const band = (a, b) => {
      const i0 = Math.floor(clamp(a, 0, 1) * (N - 1));
      const i1 = Math.floor(clamp(b, 0, 1) * (N - 1));
      let s = 0, c = 0;
      for (let i = i0; i <= i1; i++) { s += fft[i]; c++; }
      return c ? (s / c) / 255 : 0;
    };

    const bass = band(0.00, 0.10);
    const mid  = band(0.10, 0.35);
    const hi   = band(0.35, 0.90);
    const level = clamp(0.55 * bass + 0.35 * mid + 0.20 * hi, 0, 1);

    env.level = env.level * 0.86 + level * 0.14;
    env.bass  = env.bass  * 0.86 + bass  * 0.14;
    env.mid   = env.mid   * 0.86 + mid   * 0.14;
    env.hi    = env.hi    * 0.86 + hi    * 0.14;

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

  // extra “form knobs” (default = base values)
  let ui = {
    rot: null,
    shear: null,
    phiOffset: null,
    pmDepth: null,
    osc3Mix: null,
    osc4Mul: null,
    warpBase: null,
  };

  let driftPhase = 0;
  let lastT = performance.now();
  function stepDrift(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (!driftOn) return;
    driftPhase = (driftPhase + base.driftCps * dt) % 1;
  }

  function effective(nowMs) {
    const f_vis = clamp(base.f_vis * freqMul, 200, 12000);

    const nowSec = nowMs / 1000;
    const wMod = 0.65 + 0.35 * Math.sin(TAU * (base.warpRate * nowSec) + TAU * base.warpPhase);

    // apply UI overrides (if set)
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
    const rotate = base.fbRotate * (0.35 + 2.0 * fb);
    const shift = base.fbShift * (0.35 + 2.4 * fb);

    const warpEff = (warpOn ? clamp(warpBase * warpMul * wMod, 0, 0.65) : 0);

    return {
      ...base,
      f_vis,
      rot,
      shear,
      phiOffset,
      pmDepth,
      osc3Mix,
      osc4Mul,
      warpBase,

      fbMulEff: fb,
      visAlpha,
      fbScaleEff: scale,
      fbRotateEff: rotate,
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

    // keep UI knobs as “manual overrides” (don’t wipe)
    driftPhase = 0;
    lastT = performance.now();

    // new render seed so the “point cloud” changes
    renderSeed = xmur3(`${Date.now()}|${Math.random()}|${rerollCounter}`)();

    clearHard();

    // keep audio running; just retune live if already running
    if (audio) {
      const p = effective(performance.now());
      audio.setFreqMul(p);
      audio.setFeedback(p, feedbackOn, fbMul);
    }

    if (window.$fx && typeof window.$fx.preview === "function") window.$fx.preview();
  }

  /* ---------- keyboard controls ---------- */
  window.addEventListener("keydown", async (e) => {
    const k = e.key;

    if (k === "p" || k === "P") savePNG();
    if (k === "r" || k === "R") reroll();

    if (k === "f" || k === "F") { feedbackOn = !feedbackOn; clearHard(); if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul); }
    if (k === "d" || k === "D") { driftOn = !driftOn; }

    if (k === "," ) { fbMul = clamp(fbMul - 0.05, 0, 1.5); if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul); }
    if (k === "." ) { fbMul = clamp(fbMul + 0.05, 0, 1.5); if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul); }

    if (k === "[" ) densityMul = clamp(densityMul - 0.05, 0.2, 2.0);
    if (k === "]" ) densityMul = clamp(densityMul + 0.05, 0.2, 2.0);

    if (k === "-" ) exposure = clamp(exposure - 0.05, 0.4, 2.0);
    if (k === "=" ) exposure = clamp(exposure + 0.05, 0.4, 2.0);

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
    if (k === "m" || k === "M") {
      if (audio) audio.setMute(!audio.muted);
    }
  });

  /* ---------- UI bindings ---------- */
  const btnStart = document.getElementById("synthiStart");
  const btnMute  = document.getElementById("synthiMute");
  const btnReroll = document.getElementById("synthiReroll");
  const btnDrift  = document.getElementById("synthiDriftToggle");
  const btnFb     = document.getElementById("synthiFbToggle");

  const freqSlider = document.getElementById("freqSlider");
  const fbSlider = document.getElementById("fbSlider");

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

  // NEW optional “form” sliders
  const rotSlider = document.getElementById("rotSlider");
  const shearSlider = document.getElementById("shearSlider");
  const phiOffSlider = document.getElementById("phiOffsetSlider");
  const pmDepthSlider = document.getElementById("pmDepthSlider");
  const osc3MixSlider = document.getElementById("osc3MixSlider");
  const osc4MulSlider = document.getElementById("osc4MulSlider");
  const warpBaseSlider = document.getElementById("warpBaseSlider");

  const setUIFloat = (slider, key, fallback) => {
    if (!slider) return;
    // init from base unless slider already has value set in HTML
    const v0 = parseFloat(slider.value);
    ui[key] = Number.isFinite(v0) ? v0 : fallback;

    slider.addEventListener("input", () => {
      const nv = parseFloat(slider.value);
      if (Number.isFinite(nv)) ui[key] = nv;
      // no need to clear; just continuous morph
    });
  };

  setUIFloat(rotSlider, "rot", base.rot);
  setUIFloat(shearSlider, "shear", base.shear);
  setUIFloat(phiOffSlider, "phiOffset", base.phiOffset);
  setUIFloat(pmDepthSlider, "pmDepth", base.pmDepth);
  setUIFloat(osc3MixSlider, "osc3Mix", base.osc3Mix);
  setUIFloat(osc4MulSlider, "osc4Mul", base.osc4Mul);
  setUIFloat(warpBaseSlider, "warpBase", base.warpBase);

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
    } catch (err) {
      log("Audio error: " + (err?.message || err));
    }
  });
  if (btnMute) btnMute.addEventListener("click", () => {
    if (audio) {
      audio.setMute(!audio.muted);
      btnMute.textContent = audio.muted ? "Unmute" : "Mute";
    }
  });

  // freq
  if (freqSlider) {
    const v = parseFloat(freqSlider.value);
    if (!Number.isNaN(v)) freqMul = v;
    freqSlider.addEventListener("input", () => {
      const nv = parseFloat(freqSlider.value);
      if (!Number.isNaN(nv)) freqMul = nv;
      if (audio) audio.setFreqMul(effective(performance.now()));
    });
  }

  // fb
  if (fbSlider) {
    const v = parseFloat(fbSlider.value);
    if (!Number.isNaN(v)) fbMul = v;
    fbSlider.addEventListener("input", () => {
      const nv = parseFloat(fbSlider.value);
      if (!Number.isNaN(nv)) fbMul = nv;
      if (audio) audio.setFeedback(effective(performance.now()), feedbackOn, fbMul);
    });
  }

  // volume
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

  // bpm
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
        const on = !!seq[tr.key][i];
        b.style.opacity = on ? "1" : "0.35";
        b.addEventListener("click", () => {
          seq[tr.key][i] = seq[tr.key][i] ? 0 : 1;
          b.style.opacity = seq[tr.key][i] ? "1" : "0.35";
        });
        seqGrid.appendChild(b);
      }
    }
  }

  function setDefaultPattern() {
    [0, 8].forEach(i => seq.kick[i] = 1);
    [4, 12].forEach(i => seq.snare[i] = 1);
    for (let i = 0; i < 16; i += 2) seq.hat[i] = 1;
    [7, 15].forEach(i => seq.perc[i] = 1);
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
      if (audio) {
        seqStep = 0;
        seqNextTime = audio.ctx.currentTime + 0.05;
      }
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

  window.addEventListener("resize", () => clearHard());

  /* ---------- render ---------- */
  clearHard();

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

  function tick(now) {
    try {
      stepDrift(now);
      ensureCanvasSizeLocked();

      if (audio) {
        scheduleBeat(audio.ctx.currentTime);
        updateAnalysis();
      }

      // audio-reactive multipliers (subtle but visible)
      const aL = env.level;
      const aB = env.bass;
      const aH = env.hi;

      const densityMulEff = clamp(densityMul * (0.85 + 0.90 * aL), 0.2, 2.0);
      const exposureEff   = clamp(exposure   * (0.95 + 0.70 * aB), 0.4, 2.0);
      const warpMulEff    = clamp(warpMul    * (0.85 + 1.10 * aH), 0, 1.6);

      // temporary warp strength audio-react
      const warpMulUser = warpMul;
      if (audio && warpOn) warpMul = warpMulEff;
      const p = effective(now);
      warpMul = warpMulUser;

      // keep audio parameters synced live
      if (audio) {
        audio.setFreqMul(p);
        audio.setFeedback(p, feedbackOn, fbMul);
      }

      // 1) feedback projection
      projectFeedback(p);

      // 2) decay
      ctx2d.save();
      ctx2d.globalCompositeOperation = "source-over";
      const decay = feedbackOn ? (0.045 + 0.030 * Math.min(1, fbMul)) : 0.075;
      ctx2d.globalAlpha = decay;
      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.restore();

      // 3) point accumulation (seeded RNG per frame)
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const pad = Math.min(W, H) * p.padFrac;
      const sx = (W / 2 - pad) * p.gain;
      const sy = (H / 2 - pad) * p.gain;

      const amp = (0.86 + 0.16 * Math.sin(TAU * (p.ampRate * p.nowSec)));
      const dens = (0.62 + 0.38 * Math.sin(TAU * (p.densRate * p.nowSec + 0.2)));
      const phiSpread = p.phiSpreadBase * (0.55 + 1.05 * (1 - dens));
      const phiBase = p.phi + (driftOn ? driftPhase : 0);

      const baseN = 68000;
      const N = Math.floor(baseN * dens * densityMulEff);

      const TWIN = 0.30;
      const s = p.pixel;

      // seeded RNG for stability of “form”
      const frameSeed = (renderSeed ^ (now | 0) ^ (N * 2654435761)) >>> 0;
      const rr = mulberry32(frameSeed);

      ctx2d.save();
      ctx2d.globalCompositeOperation = "lighter";

      const alpha = clamp(0.34 * exposureEff, 0.10, 0.75);
      ctx2d.globalAlpha = alpha;
      ctx2d.fillStyle = "rgba(235,235,235,1)";

      const jitterK = 1.35 * s * (0.90 + 0.70 * env.hi);

      for (let i = 0; i < N; i++) {
        const t = rr() * TWIN;
        const phiPoint = phiBase + (rr() * 2 - 1) * phiSpread;

        const { x, y } = xyAt(t, p, phiPoint, p.nowSec);

        const px0 = (cx + x * sx * amp) | 0;
        const py0 = (cy - y * sy * amp) | 0;

        const px = (px0 + (((rr() * 2 - 1) * jitterK) | 0));
        const py = (py0 + (((rr() * 2 - 1) * jitterK) | 0));

        if (px <= 0 || py <= 0 || px >= W || py >= H) continue;

        ctx2d.fillRect(px, py, s, s);
        if ((i & 31) === 0) ctx2d.fillRect(px + s, py, s, s);
        if ((i & 63) === 0) ctx2d.fillRect(px, py + s, s, s);
      }

      ctx2d.restore();

      const detCents = 1200 * Math.log2(1 + p.detune);
      const text =
        `PATCH A+WARP+BEAT • f ${p.f_vis.toFixed(1)}Hz • fb ${feedbackOn ? fbMul.toFixed(2) : "OFF"} • ` +
        `warp ${warpOn ? warpMul.toFixed(2) : "OFF"} (${p.warpEff.toFixed(3)}) • ` +
        `dens ${densityMul.toFixed(2)}→${densityMulEff.toFixed(2)} • exp ${exposure.toFixed(2)}→${exposureEff.toFixed(2)} • ` +
        `beat ${seqOn ? "ON" : "OFF"} ${Math.round(bpm)}bpm • lvl ${env.level.toFixed(2)} • det ${detCents.toFixed(2)}c\n` +
        `Form: rot ${p.rot.toFixed(3)} shear ${p.shear.toFixed(3)} phiOff ${p.phiOffset.toFixed(3)} pm ${p.pmDepth.toFixed(4)} osc3 ${p.osc3Mix.toFixed(3)} osc4Mul ${p.osc4Mul.toFixed(3)} warpBase ${p.warpBase.toFixed(3)}\n` +
        `Keys: A audio, M mute, R reroll, F fb, D drift, W warp, K/L warp-,+, [,] dens, -/= exp, ,/. fb, P png`;

      log(text);
      if (meta) meta.textContent = text;

    } catch (err) {
      log("RUNTIME ERROR: " + (err?.message || err));
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  log("SYNTHI running. Press A for audio. Beat toggle in UI.");
})();
