// synthi/index.js
// Fix: "pořád stejné" -> true reseed + richer structure (PM + cross-warp) while keeping X:Y base ratio 1:2.
// X base: f (sin+tri), Y base: 2f (sin+tri)
// Extra: phase modulation + gentle nonlinear cross-warp (creates different attractors)
// Drift: stable integrator (no irregular jumps)

const TAU = Math.PI * 2;

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
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function frac(x) { return x - Math.floor(x); }
function triFromPhase(p) { return 1 - 4 * Math.abs(p - 0.5); }
function logUniform(rng, min, max) {
  const lo = Math.log(min);
  const hi = Math.log(max);
  return Math.exp(lo + (hi - lo) * rng());
}
function randU32() {
  // strong reseed even without fxhash
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

// If fxhash exists, use it. Otherwise reseed per rerender.
let rerollCounter = 0;
function getRand() {
  if (typeof window !== "undefined" && window.$fx && typeof window.$fx.rand === "function") {
    return () => window.$fx.rand();
  }
  const seedStr =
    (typeof window !== "undefined" ? (window.location.pathname + window.location.search + window.location.hash) : "SYNTHI") +
    `|SYNTHI|${rerollCounter}|${randU32()}`;
  const seedFn = xmur3(seedStr);
  return mulberry32(seedFn());
}

// ---------- PARAMS ----------
function makeParams(rng) {
  const rare = rng() < 0.12;
  const f_vis = rare ? logUniform(rng, 5500, 7500) : logUniform(rng, 900, 5200);

  const phi = rng();
  const phiOffset = 0.05 + rng() * 0.45; // not fixed 0.25 -> more variety while still "2f branch offset"

  // (sin+tri) weights
  const xSin = 0.85 + rng() * 0.35;
  const xTri = 0.65 + rng() * 0.85;
  const ySin = 0.85 + rng() * 0.35;
  const yTri = 0.65 + rng() * 0.85;

  const padFrac = 0.06 + rng() * 0.09;
  const gain = 0.84 + rng() * 0.14;

  const pixel = rng() < 0.45 ? 2 : 3;
  const pointAlpha = 0.40;

  const phaseJitter = (rng() - 0.5) * 0.30;

  // ✅ NEW: Phase modulation (drives different attractors)
  // PM freq is slow-ish relative to window sampling; used with (now) time too.
  const pmHz = 0.08 + rng() * 0.65;      // 0.08–0.73 Hz
  const pmDepth = 0.010 + rng() * 0.060; // cycles (0.01–0.07)
  const pmPhase = rng();

  // ✅ NEW: cross-warp nonlinearity (small, stable)
  const warp = 0.08 + rng() * 0.22;      // 0.08–0.30
  const warp2 = 0.02 + rng() * 0.10;     // extra term

  // audio mix
  const a = 0.7, b = 0.4;

  // shorter delays (tight)
  const t1 = (2 + rng() * 6) / 1000;
  const t2 = (10 + rng() * 26) / 1000;
  const t3 = (45 + rng() * 140) / 1000;

  const fb1 = 0.28 + rng() * 0.28;
  const fb2 = 0.40 + rng() * 0.32;
  const fb3 = 0.50 + rng() * 0.35;

  // visual feedback baseline (avoid lock)
  const visFbBase = 0.82 + rng() * 0.12;

  // micro transform stronger variety (still small)
  const fbScale = 1.001 + rng() * 0.005;     // 1.001..1.006
  const fbRotate = (rng() - 0.5) * 0.014;    // +/- 0.007 rad
  const fbShift = (rng() - 0.5) * 2.2;

  return {
    rare, f_vis, phi, phiOffset, phaseJitter,
    xSin, xTri, ySin, yTri,
    padFrac, gain,
    pixel, pointAlpha,
    pmHz, pmDepth, pmPhase,
    warp, warp2,
    a, b,
    t1, t2, t3, fb1, fb2, fb3,
    visFbBase, fbScale, fbRotate, fbShift
  };
}

// ---------- CANVAS ----------
function ensureCanvasSize(canvas) {
  const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  const W = Math.floor(canvas.clientWidth * dpr);
  const H = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
    return true;
  }
  return false;
}

// Base signal: x at f, y at 2f, both sin+tri
// Then: PM + gentle cross-warp -> new structures.
function xyAt(t, p, phiCycles, nowSec) {
  const f = p.f_vis;

  // phase modulation in cycles
  const pm = p.pmDepth * Math.sin(TAU * (p.pmHz * nowSec) + TAU * p.pmPhase);

  const phi = phiCycles + pm;

  const px = TAU * (f * t + phi);
  const py = TAU * (2 * f * t + (phi + p.phiOffset));

  const sx = Math.sin(px);
  const sy = Math.sin(py);

  const tx = triFromPhase(frac(f * t + phi));
  const ty = triFromPhase(frac(2 * f * t + (phi + p.phiOffset)));

  let x = (p.xSin * sx + p.xTri * tx);
  let y = (p.ySin * sy + p.yTri * ty);

  // normalize-ish
  x = Math.tanh(0.80 * x);
  y = Math.tanh(0.80 * y);

  // ✅ Cross-warp (nonlinear coupling) — makes it stop being the same "U"
  // Keep small so it stays stable.
  const wx = p.warp;
  const wy = p.warp * 0.85;
  const w2 = p.warp2;

  const x2 = Math.tanh(x + wx * y + w2 * x * y);
  const y2 = Math.tanh(y - wy * x + w2 * (x * x - y * y) * 0.5);

  return { x: x2, y: y2 };
}

// ---------- AUDIO ----------
let audio = null;

function makeSoftClipper(ctx, drive = 1.0) {
  const shaper = ctx.createWaveShaper();
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const k = 2.0 * drive;
    curve[i] = Math.tanh(k * x);
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

  return { delay, fbGain, clip };
}
function startAudio(pEff, fbOn) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContext();

  const f_aud = pEff.f_vis / 16;

  const oscSin = ctx.createOscillator();
  oscSin.type = "sine";
  oscSin.frequency.value = f_aud;

  const oscTri = ctx.createOscillator();
  oscTri.type = "triangle";
  oscTri.frequency.value = f_aud * 2; // keep 1:2

  const gSin = ctx.createGain(); gSin.gain.value = pEff.a;
  const gTri = ctx.createGain(); gTri.gain.value = pEff.b;

  oscSin.connect(gSin);
  oscTri.connect(gTri);

  const sum = ctx.createGain();
  gSin.connect(sum);
  gTri.connect(sum);

  const pre = ctx.createGain();
  pre.gain.value = 0.25;

  const fb1 = fbOn ? pEff.fb1 : 0.0;
  const fb2 = fbOn ? pEff.fb2 : 0.0;
  const fb3 = fbOn ? pEff.fb3 : 0.0;

  const d1 = buildDelayStage(ctx, pEff.t1, fb1, 0.85);
  const d2 = buildDelayStage(ctx, pEff.t2, fb2, 0.95);
  const d3 = buildDelayStage(ctx, pEff.t3, fb3, 1.05);

  const post = ctx.createGain();
  post.gain.value = 0.9;

  const masterClip = makeSoftClipper(ctx, 0.9);

  sum.connect(pre);
  pre.connect(d1.delay);
  d1.delay.connect(d2.delay);
  d2.delay.connect(d3.delay);
  d3.delay.connect(post);
  post.connect(masterClip);
  masterClip.connect(ctx.destination);

  const now = ctx.currentTime + 0.02;
  const triOffset = 0.25 / (oscTri.frequency.value || 1);

  oscSin.start(now);
  oscTri.start(now + triOffset);

  audio = {
    ctx,
    muted: false,
    setMute(on) {
      post.gain.value = on ? 0.0 : 0.9;
      this.muted = on;
    },
    stop() {
      try { oscSin.stop(); oscTri.stop(); } catch {}
      try { ctx.close(); } catch {}
    }
  };

  return audio;
}

// ---------- UI / RENDER ----------
function $(id) { return document.getElementById(id); }

(function initSynthi() {
  const canvas = $("synthiCanvas");
  const meta = $("synthiMeta");

  const btnStart = $("synthiStart");
  const btnMute = $("synthiMute");
  const btnReroll = $("synthiReroll");

  const btnDrift = $("synthiDriftToggle");
  const btnFb = $("synthiFbToggle");

  const freqSlider = $("freqSlider");
  const fbSlider = $("fbSlider");
  const freqVal = $("freqVal");
  const fbVal = $("fbVal");

  if (!canvas || !meta || !btnStart || !btnMute || !btnReroll || !btnDrift || !btnFb || !freqSlider || !fbSlider) {
    console.warn("SYNTHI: Missing UI elements.");
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: false });

  let rng = getRand();
  let base = makeParams(rng);

  let driftOn = true;
  let feedbackOn = true;

  let freqMul = parseFloat(freqSlider.value);
  let fbMul = parseFloat(fbSlider.value);

  // stable drift integrator
  const DRIFT_CPS = 0.0010;
  let driftPhase = 0;
  let lastTime = performance.now();

  function stepDrift(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!driftOn) return;
    driftPhase = (driftPhase + DRIFT_CPS * dt) % 1;
  }
  function phiDriftCycles() { return driftOn ? driftPhase : 0; }

  const FPS = 30;
  const DT = 1000 / FPS;
  let last = 0;

  // fill faster
  const SAMPLES_PER_FRAME = 70000;

  function clearHard() {
    ensureCanvasSize(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function effective() {
    const f_vis = clamp(base.f_vis * freqMul, 200, 12000);
    const fbScale = feedbackOn ? fbMul : 0.0;

    // visual feedback: high but avoid lock
    const visFb = feedbackOn
      ? clamp(0.76 + 0.16 * clamp(fbMul, 0, 1), 0.76, 0.93) * (base.visFbBase / 0.88)
      : 0.0;

    const fb1 = clamp(base.fb1 * fbScale, 0, 0.95);
    const fb2 = clamp(base.fb2 * fbScale, 0, 0.95);
    const fb3 = clamp(base.fb3 * fbScale, 0, 0.95);

    return {
      ...base,
      f_vis,
      visFb: clamp(visFb, 0, 0.945),
      fb1, fb2, fb3
    };
  }

  function updateLabels(now) {
    const p = effective();
    const f_aud = p.f_vis / 16;

    meta.textContent =
      `ratio 1:2 • x(f)=(sin+tri) • y(2f)=(sin+tri) • ` +
      `f_vis ${p.f_vis.toFixed(1)} Hz • f_aud ${f_aud.toFixed(1)} Hz • ` +
      `drift ${phiDriftCycles().toFixed(3)} • visFB ${p.visFb.toFixed(3)} • warp ${p.warp.toFixed(2)}`;

    freqVal.textContent = `${freqMul.toFixed(2)}×`;
    fbVal.textContent = `${(feedbackOn ? fbMul : 0).toFixed(2)}×`;
  }

  function projectFeedback(p) {
    if (!feedbackOn) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = p.visFb;

    const cx = W / 2;
    const cy = H / 2;

    const rot = p.fbRotate;
    const sc = p.fbScale;
    const shift = p.fbShift * Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));

    ctx.translate(cx + shift, cy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);

    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  function plotPoints(p, now) {
    const W = canvas.width;
    const H = canvas.height;

    const cx = W / 2;
    const cy = H / 2;
    const pad = Math.min(W, H) * p.padFrac;
    const sx = (W / 2 - pad) * p.gain;
    const sy = (H / 2 - pad) * p.gain;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = p.pointAlpha;
    ctx.fillStyle = "rgba(221,221,221,1)";

    const nowSec = now / 1000;

    const phiBase = p.phi + p.phaseJitter + phiDriftCycles();

    // diffusion + time window
    const PHI_SPREAD = 0.030;
    const TWIN = 0.18;
    const N = SAMPLES_PER_FRAME;

    const s = p.pixel;
    const jitterK = 2.6 * s;

    for (let i = 0; i < N; i++) {
      const t = Math.random() * TWIN;
      const phiPoint = phiBase + (Math.random() * 2 - 1) * PHI_SPREAD;

      const { x, y } = xyAt(t, p, phiPoint, nowSec);

      const px0 = (cx + x * sx) | 0;
      const py0 = (cy - y * sy) | 0;

      const jx = ((Math.random() * 2 - 1) * jitterK) | 0;
      const jy = ((Math.random() * 2 - 1) * jitterK) | 0;

      const px = px0 + jx;
      const py = py0 + jy;

      if (px < 0 || py < 0 || px >= W || py >= H) continue;

      ctx.fillRect(px, py, s, s);
      if ((i & 7) === 0) ctx.fillRect(px + s, py, s, s);
      if ((i & 15) === 0) ctx.fillRect(px, py + s, s, s);
    }

    ctx.restore();
  }

  function tick(now) {
    stepDrift(now);

    if (now - last >= DT) {
      last = now;

      const resized = ensureCanvasSize(canvas);
      if (resized) clearHard();

      const p = effective();

      projectFeedback(p);

      // stronger decay prevents one band dominating
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      plotPoints(p, now);
      updateLabels(now);
    }

    requestAnimationFrame(tick);
  }

  function restartAudioIfRunning() {
    if (!audio) return;
    const wasMuted = audio.muted;
    audio.stop();
    audio = null;
    audio = startAudio(effective(), feedbackOn);
    audio.setMute(wasMuted);
    btnMute.textContent = wasMuted ? "Unmute" : "Mute";
  }

  // UI
  btnStart.addEventListener("click", async () => {
    if (!audio) startAudio(effective(), feedbackOn);
    if (audio && audio.ctx.state !== "running") await audio.ctx.resume();
  });

  btnMute.addEventListener("click", () => {
    if (!audio) return;
    audio.setMute(!audio.muted);
    btnMute.textContent = audio.muted ? "Unmute" : "Mute";
  });

  btnReroll.addEventListener("click", () => {
    rerollCounter++;
    rng = getRand();
    base = makeParams(rng);

    driftPhase = 0;
    lastTime = performance.now();

    clearHard();
    updateLabels(performance.now());
    restartAudioIfRunning();

    if (window.$fx && typeof window.$fx.preview === "function") window.$fx.preview();
  });

  btnDrift.addEventListener("click", () => {
    driftOn = !driftOn;
    btnDrift.textContent = driftOn ? "Drift: ON" : "Drift: OFF";
    lastTime = performance.now();
  });

  btnFb.addEventListener("click", () => {
    feedbackOn = !feedbackOn;
    btnFb.textContent = feedbackOn ? "Feedback: ON" : "Feedback: OFF";
    clearHard();
    restartAudioIfRunning();
  });

  freqSlider.addEventListener("input", () => {
    freqMul = parseFloat(freqSlider.value);
    restartAudioIfRunning();
  });

  fbSlider.addEventListener("input", () => {
    fbMul = parseFloat(fbSlider.value);
    restartAudioIfRunning();
  });

  window.addEventListener("resize", () => {
    clearHard();
  });

  btnDrift.textContent = driftOn ? "Drift: ON" : "Drift: OFF";
  btnFb.textContent = feedbackOn ? "Feedback: ON" : "Feedback: OFF";

  clearHard();
  updateLabels(performance.now());
  requestAnimationFrame(tick);
})();
