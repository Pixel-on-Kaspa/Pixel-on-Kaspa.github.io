// synthi/index.js — PATCH A + WARP (Video-feedback sculpture)
// FIXED SIZE + BRIGHTER FILL + CONTROLLED WARP
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
    el.style.maxWidth = "min(860px, 92vw)";
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

  /* ---------- find canvas/meta safely ---------- */
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

  /* ---------- RNG ---------- */
  let rerollCounter = 0;
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
    const maxByViewport = window.innerHeight * 0.72; // keep it on one screen
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

      // stable framing
      padFrac: 0.10,
      gain: 0.92,

      // gentle linear geometry
      rot: (rng() - 0.5) * 0.35,
      shear: (rng() - 0.5) * 0.22,

      // drift + PM
      driftCps: 0.0007 + rng() * 0.0006,
      pmHz: 0.04 + rng() * 0.14,
      pmDepth: 0.001 + rng() * 0.006,

      // osc3 detail (detuned octave-ish)
      detune: (rng() < 0.5 ? -1 : 1) * (0.0004 + rng() * 0.0012),
      osc3Mix: 0.10 + rng() * 0.22,
      osc3Phi: rng(),

      // osc4 slow "breathing" fill
      osc4Mul: 0.10 + rng() * 0.22,
      osc4Mix: 0.08 + rng() * 0.16,
      osc4Phi: rng(),

      // pixel
      pixel: rng() < 0.5 ? 2 : 3,

      // feedback transform baseline (slider scales it)
      fbScale: 1.001 + rng() * 0.004,
      fbRotate: (rng() - 0.5) * 0.012,
      fbShift: (rng() - 0.5) * 2.8,

      // ramps
      ampRate: 0.018 + rng() * 0.060,
      densRate: 0.012 + rng() * 0.050,
      phiSpreadBase: 0.010 + rng() * 0.012,

      // ---- WARP (controlled cross-coupling) ----
      warpBase: 0.06 + rng() * 0.18,     // 0.06..0.24 (safe default)
      warpRate: 0.03 + rng() * 0.11,     // slow modulation
      warpPhase: rng(),

      // audio
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

    // base 1:2
    const px = TAU * (f * t + phi);
    const py = TAU * (2 * f * t + (phi + p.phiOffset));

    const sx = Math.sin(px);
    const sy = Math.sin(py);
    const tx = triFromPhase(frac(f * t + phi));
    const ty = triFromPhase(frac(2 * f * t + (phi + p.phiOffset)));

    let x = p.xSin * sx + p.xTri * tx;
    let y = p.ySin * sy + p.yTri * ty;

    // osc3 detail layer
    const f3 = (2 * f) * (1 + p.detune);
    const phi3 = phiCycles + p.osc3Phi + pm * 0.35;
    x += p.osc3Mix * Math.sin(TAU * (f3 * t + phi3));
    y += p.osc3Mix * Math.sin(TAU * (2 * f3 * t + (phi3 + p.phiOffset)));

    // osc4 slow fill layer
    const f4 = f * p.osc4Mul;
    const phi4 = phiCycles + p.osc4Phi + pm * 0.15;
    x += p.osc4Mix * (Math.sin(TAU * (f4 * t + phi4)) + 0.6 * triFromPhase(frac(f4 * t + phi4)));
    y += p.osc4Mix * (Math.sin(TAU * (2 * f4 * t + (phi4 + p.phiOffset))) + 0.6 * triFromPhase(frac(2 * f4 * t + (phi4 + p.phiOffset))));

    // linear transform first
    ({ x, y } = applyLinear(x, y, p));

    // ---- WARP (cross-coupling) ----
    // Controlled & modulated: adds topology without chaos.
    if (p.warpEff > 0) {
      const w = p.warpEff;   // ~0..0.6
      const x0 = x, y0 = y;

      // symmetrical-ish mix
      x = x0 + w * y0;
      y = y0 - w * x0;

      // soft clamp right after warp to prevent pulsing blowups
      x = Math.tanh(0.92 * x);
      y = Math.tanh(0.92 * y);
    }

    // final mastering clamp
    x = Math.tanh(0.78 * x);
    y = Math.tanh(0.78 * y);
    return { x, y };
  }

  /* ---------- audio ---------- */
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
    const actx = new AudioContext();

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
    masterClip.connect(actx.destination);

    const now = actx.currentTime + 0.02;
    const triOffset = 0.25 / (oscTri.frequency.value || 1);
    oscSin.start(now);
    oscTri.start(now + triOffset);
    oscDet.start(now);

    audio = {
      ctx: actx,
      muted: false,
      setMute(on) { post.gain.value = on ? 0 : 0.9; this.muted = on; },
      stop() {
        try { oscSin.stop(); oscTri.stop(); oscDet.stop(); } catch {}
        try { actx.close(); } catch {}
      }
    };
    return audio;
  }

  /* ---------- state ---------- */
  let rng = getRand();
  let base = makeParams(rng);

  let driftOn = true;
  let feedbackOn = true;

  // defaults tuned for “not dark”
  let freqMul = 1.0;
  let fbMul = 1.05;
  let densityMul = 1.25;
  let exposure = 1.25;

  // ---- warp controls ----
  let warpOn = true;
  let warpMul = 1.0;   // scales warpBase; safe range 0..1.6

  // stable drift integrator
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
    const fb = feedbackOn ? clamp(fbMul, 0, 1.5) : 0;

    // clearly visible feedback alpha
    const visAlpha = feedbackOn ? clamp(0.55 + 0.35 * Math.min(1, fb), 0.55, 0.92) : 0;

    const scale = 1 + (base.fbScale - 1) * (0.35 + 1.8 * fb);
    const rotate = base.fbRotate * (0.35 + 2.0 * fb);
    const shift = base.fbShift * (0.35 + 2.4 * fb);

    // WARP: slow modulation so it evolves (but not jittery)
    const nowSec = nowMs / 1000;
    const wMod = 0.65 + 0.35 * Math.sin(TAU * (base.warpRate * nowSec) + TAU * base.warpPhase);
    const warpEff = (warpOn ? clamp(base.warpBase * warpMul * wMod, 0, 0.65) : 0);

    return {
      ...base,
      f_vis,
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
    driftPhase = 0;
    lastT = performance.now();
    clearHard();

    if (audio) {
      const wasMuted = audio.muted;
      audio.stop();
      audio = null;
      audio = startAudio(effective(performance.now()), feedbackOn, fbMul);
      audio.setMute(wasMuted);
    }

    if (window.$fx && typeof window.$fx.preview === "function") window.$fx.preview();
  }

  /* ---------- keyboard controls (always) ---------- */
  window.addEventListener("keydown", async (e) => {
    const k = e.key;

    if (k === "p" || k === "P") savePNG();
    if (k === "r" || k === "R") reroll();

    if (k === "f" || k === "F") { feedbackOn = !feedbackOn; clearHard(); }
    if (k === "d" || k === "D") { driftOn = !driftOn; }

    if (k === "," ) fbMul = clamp(fbMul - 0.05, 0, 1.5);
    if (k === "." ) fbMul = clamp(fbMul + 0.05, 0, 1.5);

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

  /* ---------- optional UI bindings (if your IDs exist) ---------- */
  const btnStart = document.getElementById("synthiStart");
  const btnMute  = document.getElementById("synthiMute");
  const btnReroll = document.getElementById("synthiReroll");
  const btnDrift  = document.getElementById("synthiDriftToggle");
  const btnFb     = document.getElementById("synthiFbToggle");
  const btnShot   = document.getElementById("synthiShot");
  const freqSlider = document.getElementById("freqSlider");
  const fbSlider = document.getElementById("fbSlider");

  if (btnShot) btnShot.addEventListener("click", savePNG);
  if (btnReroll) btnReroll.addEventListener("click", reroll);
  if (btnDrift) btnDrift.addEventListener("click", () => { driftOn = !driftOn; });
  if (btnFb) btnFb.addEventListener("click", () => { feedbackOn = !feedbackOn; clearHard(); });

  if (btnStart) btnStart.addEventListener("click", async () => {
    try {
      if (!audio) audio = startAudio(effective(performance.now()), feedbackOn, fbMul);
      if (audio && audio.ctx.state !== "running") await audio.ctx.resume();
    } catch (err) {
      log("Audio error: " + (err?.message || err));
    }
  });
  if (btnMute) btnMute.addEventListener("click", () => { if (audio) audio.setMute(!audio.muted); });

  if (freqSlider) {
    const v = parseFloat(freqSlider.value);
    if (!Number.isNaN(v)) freqMul = v;
    freqSlider.addEventListener("input", () => {
      const nv = parseFloat(freqSlider.value);
      if (!Number.isNaN(nv)) freqMul = nv;
      if (audio) {
        const wasMuted = audio.muted;
        audio.stop(); audio = null;
        audio = startAudio(effective(performance.now()), feedbackOn, fbMul);
        audio.setMute(wasMuted);
      }
    });
  }
  if (fbSlider) {
    const v = parseFloat(fbSlider.value);
    if (!Number.isNaN(v)) fbMul = v;
    fbSlider.addEventListener("input", () => {
      const nv = parseFloat(fbSlider.value);
      if (!Number.isNaN(nv)) fbMul = nv;
      if (audio) {
        const wasMuted = audio.muted;
        audio.stop(); audio = null;
        audio = startAudio(effective(performance.now()), feedbackOn, fbMul);
        audio.setMute(wasMuted);
      }
    });
  }

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

      const p = effective(now);

      // 1) feedback projection
      projectFeedback(p);

      // 2) decay (LESS aggressive => brighter)
      ctx2d.save();
      ctx2d.globalCompositeOperation = "source-over";
      const decay = feedbackOn ? (0.045 + 0.030 * Math.min(1, fbMul)) : 0.075;
      ctx2d.globalAlpha = decay;
      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.restore();

      // 3) point accumulation
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const pad = Math.min(W, H) * p.padFrac;
      const sx = (W / 2 - pad) * p.gain;
      const sy = (H / 2 - pad) * p.gain;

      // ramps
      const amp = (0.86 + 0.16 * Math.sin(TAU * (p.ampRate * p.nowSec)));
      const dens = (0.62 + 0.38 * Math.sin(TAU * (p.densRate * p.nowSec + 0.2)));
      const phiSpread = p.phiSpreadBase * (0.55 + 1.05 * (1 - dens));
      const phiBase = p.phi + (driftOn ? driftPhase : 0);

      const baseN = 68000;
      const N = Math.floor(baseN * dens * densityMul);

      const TWIN = 0.30;
      const s = p.pixel;

      ctx2d.save();
      ctx2d.globalCompositeOperation = "lighter";

      const alpha = clamp(0.34 * exposure, 0.10, 0.75);
      ctx2d.globalAlpha = alpha;
      ctx2d.fillStyle = "rgba(235,235,235,1)";

      const jitterK = 1.35 * s;

      for (let i = 0; i < N; i++) {
        const t = Math.random() * TWIN;
        const phiPoint = phiBase + (Math.random() * 2 - 1) * phiSpread;

        const { x, y } = xyAt(t, p, phiPoint, p.nowSec);

        const px0 = (cx + x * sx * amp) | 0;
        const py0 = (cy - y * sy * amp) | 0;

        const px = (px0 + (((Math.random() * 2 - 1) * jitterK) | 0));
        const py = (py0 + (((Math.random() * 2 - 1) * jitterK) | 0));

        if (px <= 0 || py <= 0 || px >= W || py >= H) continue;

        ctx2d.fillRect(px, py, s, s);
        if ((i & 31) === 0) ctx2d.fillRect(px + s, py, s, s);
        if ((i & 63) === 0) ctx2d.fillRect(px, py + s, s, s);
      }

      ctx2d.restore();

      // label
      const detCents = 1200 * Math.log2(1 + p.detune);
      const text =
        `PATCH A+WARP • f ${p.f_vis.toFixed(1)}Hz • fb ${feedbackOn ? fbMul.toFixed(2) : "OFF"} • ` +
        `warp ${warpOn ? warpMul.toFixed(2) : "OFF"} (${p.warpEff.toFixed(3)}) • ` +
        `dens ${densityMul.toFixed(2)} • exp ${exposure.toFixed(2)} • drift ${driftOn ? driftPhase.toFixed(3) : "OFF"} • det ${detCents.toFixed(2)}c\n` +
        `Keys: A audio, M mute, R reroll, F fb, D drift, W warp, K/L warp-,+, [,] dens, -/= exp, ,/. fb, P png`;

      log(text);
      if (meta) meta.textContent = text;

    } catch (err) {
      log("RUNTIME ERROR: " + (err?.message || err));
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  log("SYNTHI running. Press W to toggle warp. K/L adjust warp. P saves PNG.");
})();
