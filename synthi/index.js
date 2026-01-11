// synthi/index.js
// Smooth oscilloscope-like rendering with persistence (no flicker)
// Slow drift (toggleable)
// Controls: Drift ON/OFF, Feedback ON/OFF + slider, Frequency slider
// FIXED RATIO: X:Y frequency = 1:2  =>  r = 2.0 always
// Audio: derived f_aud = f_vis/16, 2 oscillators, delay chain with feedback + softclip in loop

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
function getRand() {
  if (typeof window !== "undefined" && window.$fx && typeof window.$fx.rand === "function") {
    return () => window.$fx.rand();
  }
  const seedStr =
    (typeof window !== "undefined" && (window.location.hash || window.location.search || "SYNTHI")) +
    "|SYNTHI";
  const seedFn = xmur3(seedStr);
  return mulberry32(seedFn());
}

const TAU = Math.PI * 2;

function frac(x) { return x - Math.floor(x); }
function triFromPhase(p) { return 1 - 4 * Math.abs(p - 0.5); }
function logUniform(rng, min, max) {
  const lo = Math.log(min);
  const hi = Math.log(max);
  return Math.exp(lo + (hi - lo) * rng());
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function makeParams(rng) {
  const T = 0.02;     // 20ms fixed window
  const dphi = 0.25;  // triangle phase offset fixed

  const rare = rng() < 0.10;
  const f_vis = rare ? logUniform(rng, 6000, 7000) : logUniform(rng, 1000, 5000);

  // ✅ FIX: X:Y = 1:2
  const r = 2.0;

  const phi = rng();

  // small static variety so rerender feels different
  const phaseJitter = (rng() - 0.5) * 0.18; // ±0.09 cycles
  const padFrac = 0.10;
  const gain = 0.84 + rng() * 0.12; // 0.84–0.96

  // audio mix
  const a = 0.7;
  const b = 0.4;

  // delays
  const t1 = (5 + rng() * 15) / 1000;
  const t2 = (40 + rng() * 80) / 1000;
  const t3 = (180 + rng() * 420) / 1000;

  const fb1 = 0.05 + rng() * 0.15;
  const fb2 = 0.15 + rng() * 0.25;
  const fb3 = 0.25 + rng() * 0.30;

  return { T, dphi, f_vis, r, phi, phaseJitter, padFrac, gain, a, b, t1, t2, t3, fb1, fb2, fb3, rare };
}

// ---- Rendering core (polyline) ----
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

function drawFrame(canvas, params, phiEffCycles, N, fadeAlpha) {
  const ctx = canvas.getContext("2d", { alpha: false });
  ensureCanvasSize(canvas);

  const W = canvas.width;
  const H = canvas.height;

  // Persistence fade
  if (fadeAlpha >= 1) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.lineWidth = Math.max(1, Math.floor(1 * (window.devicePixelRatio || 1)));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(221,221,221,0.92)";

  const cx = W / 2;
  const cy = H / 2;
  const pad = Math.min(W, H) * params.padFrac;
  const sx = (W / 2 - pad) * params.gain;
  const sy = (H / 2 - pad) * params.gain;

  const { T, f_vis, r, phi, dphi, phaseJitter } = params;

  // effective phase in cycles
  const phiBase = phi + phaseJitter + phiEffCycles;

  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const t = (i * T) / (N - 1);

    // X = sin(f)
    const x = Math.sin(TAU * (f_vis) * t + TAU * phiBase);

    // Y = tri(2f) (because r=2)
    const p = frac((f_vis * r) * t + (phiBase + dphi));
    const y = triFromPhase(p);

    const px = cx + x * sx;
    const py = cy - y * sy;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

// ---- Audio ----
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

function startAudio(effectiveParams) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContext();

  const f_aud = effectiveParams.f_vis / 16;

  const oscSin = ctx.createOscillator();
  oscSin.type = "sine";
  oscSin.frequency.value = f_aud;

  const oscTri = ctx.createOscillator();
  oscTri.type = "triangle";
  oscTri.frequency.value = f_aud * effectiveParams.r; // r=2

  const gSin = ctx.createGain(); gSin.gain.value = effectiveParams.a;
  const gTri = ctx.createGain(); gTri.gain.value = effectiveParams.b;

  oscSin.connect(gSin);
  oscTri.connect(gTri);

  const sum = ctx.createGain();
  gSin.connect(sum);
  gTri.connect(sum);

  const pre = ctx.createGain();
  pre.gain.value = 0.25;

  const d1 = buildDelayStage(ctx, effectiveParams.t1, effectiveParams.fb1, 0.8);
  const d2 = buildDelayStage(ctx, effectiveParams.t2, effectiveParams.fb2, 0.9);
  const d3 = buildDelayStage(ctx, effectiveParams.t3, effectiveParams.fb3, 1.0);

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

  // phase offset 0.25 cycle for triangle by start-time offset
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

// ---- UI / Controls / Drift ----
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

  let rng = getRand();
  let baseParams = makeParams(rng);

  // Live settings (user controlled)
  let driftOn = true;
  let feedbackOn = true;
  let freqMul = parseFloat(freqSlider.value); // 0.5..2
  let fbMul = parseFloat(fbSlider.value);     // 0..1.5

  // Slower drift
  const DRIFT_CPS = 0.004; // 1 cycle per ~250s
  let driftStart = performance.now();

  // Rendering cadence
  const LIVE_FPS = 24;
  const LIVE_DT = 1000 / LIVE_FPS;

  const LIVE_N = 24000;
  const HQ_N = 80000;

  const FADE_ALPHA = 0.18;

  let lastDraw = 0;

  function phiDriftCycles(nowMs) {
    if (!driftOn) return 0;
    const tSec = (nowMs - driftStart) / 1000;
    return (tSec * DRIFT_CPS) % 1;
  }

  function effectiveParams() {
    const f_vis_eff = clamp(baseParams.f_vis * freqMul, 200, 12000);
    const fbScale = feedbackOn ? fbMul : 0.0;

    return {
      ...baseParams,
      f_vis: f_vis_eff,
      fb1: clamp(baseParams.fb1 * fbScale, 0, 0.90),
      fb2: clamp(baseParams.fb2 * fbScale, 0, 0.90),
      fb3: clamp(baseParams.fb3 * fbScale, 0, 0.90),
    };
  }

  function updateLabels(nowMs) {
    const p = effectiveParams();
    const f_aud = p.f_vis / 16;
    const drift = phiDriftCycles(nowMs);

    meta.textContent =
      `ratio 1:2 • f_vis ${p.f_vis.toFixed(1)} Hz • f_aud ${f_aud.toFixed(1)} Hz • ` +
      `φ ${p.phi.toFixed(3)} • drift ${drift.toFixed(3)} • N ${LIVE_N}`;

    freqVal.textContent = `${freqMul.toFixed(2)}× (f_vis ${p.f_vis.toFixed(0)} Hz)`;
    fbVal.textContent = `${(feedbackOn ? fbMul : 0).toFixed(2)}× (on fb1–fb3)`;
  }

  function renderHQ(fullClear = true) {
    const now = performance.now();
    const p = effectiveParams();
    ensureCanvasSize(canvas);
    drawFrame(canvas, p, phiDriftCycles(now), HQ_N, fullClear ? 1 : FADE_ALPHA);
    updateLabels(now);
    if (window.$fx && typeof window.$fx.preview === "function") window.$fx.preview();
  }

  function loop(now) {
    if (now - lastDraw >= LIVE_DT) {
      lastDraw = now;
      const p = effectiveParams();
      const resized = ensureCanvasSize(canvas);
      drawFrame(canvas, p, phiDriftCycles(now), LIVE_N, resized ? 1 : FADE_ALPHA);
      updateLabels(now);
    }
    requestAnimationFrame(loop);
  }

  function restartAudioIfRunning() {
    if (!audio) return;
    const wasMuted = audio.muted;
    audio.stop();
    audio = null;
    audio = startAudio(effectiveParams());
    audio.setMute(wasMuted);
    btnMute.textContent = wasMuted ? "Unmute" : "Mute";
  }

  // UI events
  btnStart.addEventListener("click", async () => {
    if (!audio) startAudio(effectiveParams());
    if (audio && audio.ctx.state !== "running") await audio.ctx.resume();
  });

  btnMute.addEventListener("click", () => {
    if (!audio) return;
    audio.setMute(!audio.muted);
    btnMute.textContent = audio.muted ? "Unmute" : "Mute";
  });

  btnReroll.addEventListener("click", () => {
    rng = getRand();
    baseParams = makeParams(rng);
    driftStart = performance.now();
    renderHQ(true);
    restartAudioIfRunning();
  });

  btnDrift.addEventListener("click", () => {
    driftOn = !driftOn;
    btnDrift.textContent = driftOn ? "Drift: ON" : "Drift: OFF";
    driftStart = performance.now();
    renderHQ(false);
  });

  btnFb.addEventListener("click", () => {
    feedbackOn = !feedbackOn;
    btnFb.textContent = feedbackOn ? "Feedback: ON" : "Feedback: OFF";
    renderHQ(false);
    restartAudioIfRunning();
  });

  freqSlider.addEventListener("input", () => {
    freqMul = parseFloat(freqSlider.value);
    renderHQ(false);
    restartAudioIfRunning();
  });

  fbSlider.addEventListener("input", () => {
    fbMul = parseFloat(fbSlider.value);
    renderHQ(false);
    restartAudioIfRunning();
  });

  window.addEventListener("resize", () => {
    renderHQ(true);
  });

  // Init
  btnDrift.textContent = driftOn ? "Drift: ON" : "Drift: OFF";
  btnFb.textContent = feedbackOn ? "Feedback: ON" : "Feedback: OFF";
  updateLabels(performance.now());
  renderHQ(true);
  requestAnimationFrame(loop);
})();
