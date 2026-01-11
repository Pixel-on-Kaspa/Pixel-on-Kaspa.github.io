// synthi/index.js
// Goal:
// - NO SHAKE: no full redraw polylines; instead pixel accumulation + smooth visual feedback.
// - More complex structure: visual feedback >= 0.8 (video feedback style).
// - Signal structure:
//   x uses frequency f:    x = mix( sin(f) + tri(f) )
//   y uses frequency 2f:   y = mix( sin(2f) + tri(2f) )
//   => X:Y ratio is strictly 1:2.
// - Drift: very slow phase drift, optional.
// - Controls (from your HTML):
//   Start audio, Mute, Re-render, Drift ON/OFF, Feedback ON/OFF,
//   Frequency slider (multiplies f), Feedback slider (scales BOTH: visual feedback and audio feedback scale).

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
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function frac(x) { return x - Math.floor(x); }
function triFromPhase(p) { return 1 - 4 * Math.abs(p - 0.5); }
function logUniform(rng, min, max) {
  const lo = Math.log(min);
  const hi = Math.log(max);
  return Math.exp(lo + (hi - lo) * rng());
}

// ---------- PARAMS ----------
function makeParams(rng) {
  // base visible frequency
  const rare = rng() < 0.10;
  const f_vis = rare ? logUniform(rng, 6000, 7000) : logUniform(rng, 1200, 5200);

  // base phase in cycles
  const phi = rng();

  // keep your 0.25 concept, but now it’s applied consistently (optional small offset)
  const phiOffset = 0.25;

  // mix weights for sin/tri in X and Y (more structure comes from imbalance)
  const xSin = 1.0;
  const xTri = 0.85 + rng() * 0.35;   // 0.85..1.20
  const ySin = 1.0;
  const yTri = 0.85 + rng() * 0.35;

  // scale framing
  const padFrac = 0.08 + rng() * 0.06; // 0.08..0.14
  const gain = 0.86 + rng() * 0.10;    // 0.86..0.96

  // pixel style
  const pixel = rng() < 0.55 ? 1 : 2;     // pixel size 1 or 2
  const pointAlpha = 0.55;                // alpha per plotted sample (we also use globalCompositeOperation)

  // drift variety
  const phaseJitter = (rng() - 0.5) * 0.20; // ±0.10 cycles

  // audio mix
  const a = 0.7;
  const b = 0.4;

  // audio delays (kept)
  const t1 = (5 + rng() * 15) / 1000;
  const t2 = (40 + rng() * 80) / 1000;
  const t3 = (180 + rng() * 420) / 1000;

  const fb1 = 0.18 + rng() * 0.22;
  const fb2 = 0.28 + rng() * 0.25;
  const fb3 = 0.38 + rng() * 0.30;

  // visual feedback baseline: already “high”
  const visFbBase = 0.86 + rng() * 0.10; // 0.86..0.96

  // micro transform per frame (video feedback) - tiny values = stability
  const fbScale = 1.0015 + rng() * 0.0025;     // 1.0015..1.004
  const fbRotate = (rng() - 0.5) * 0.006;      // ~ +/- 0.003 rad
  const fbShift = (rng() - 0.5) * 1.4;         // px shift (applied in device pixels later)

  return {
    rare, f_vis, phi, phiOffset, phaseJitter,
    xSin, xTri, ySin, yTri,
    padFrac, gain,
    pixel, pointAlpha,
    t1, t2, t3, fb1, fb2, fb3,
    visFbBase, fbScale, fbRotate, fbShift,
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

// Signal: x at f, y at 2f, both are sin+tri sums
function xyAt(t, p, phiCycles) {
  const f = p.f_vis;
  const phi = phiCycles;

  // phase in radians
  const px = TAU * (f * t + phi);
  const py = TAU * (2 * f * t + (phi + p.phiOffset)); // 2f with offset

  // sin components
  const sx = Math.sin(px);
  const sy = Math.sin(py);

  // tri components via phase (cycles)
  const tx = triFromPhase(frac(f * t + phi));
  const ty = triFromPhase(frac(2 * f * t + (phi + p.phiOffset)));

  // sums
  const x = (p.xSin * sx + p.xTri * tx);
  const y = (p.ySin * sy + p.yTri * ty);

  // normalize-ish: weights can exceed 1, so soft clamp
  const xn = Math.tanh(0.85 * x);
  const yn = Math.tanh(0.85 * y);

  return { x: xn, y: yn };
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
  oscTri.frequency.value = f_aud * 2; // ratio 1:2 in audio too (consistent with visuals)

  const gSin = ctx.createGain(); gSin.gain.value = pEff.a;
  const gTri = ctx.createGain(); gTri.gain.value = pEff.b;

  oscSin.connect(gSin);
  oscTri.connect(gTri);

  const sum = ctx.createGain();
  gSin.connect(sum);
  gTri.connect(sum);

  const pre = ctx.createGain();
  pre.gain.value = 0.25;

  // If feedback toggle OFF => feedback gains forced to 0
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
  // Keep your "0.25 cycle" notion by starting tri delayed by quarter period
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

// ---------- UI / RENDER LOOP ----------
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

  // toggles
  let driftOn = true;
  let feedbackOn = true;

  // sliders (you already have them)
  let freqMul = parseFloat(freqSlider.value); // 0.5..2
  let fbMul = parseFloat(fbSlider.value);     // 0..1.5

  // MUCH slower drift than before
  const DRIFT_CPS = 0.0016; // 1 cycle ~ 625s (very slow)
  let driftStart = performance.now();

  // frame scheduling
  const FPS = 30;
  const DT = 1000 / FPS;
  let last = 0;

  // samples per frame (pixel fill look)
  const SAMPLES_PER_FRAME = 14000; // raise if you want faster fill

  // “pixel filling” style
  // Using additive blend for points makes the “screen fill” effect.
  // We keep feedback projection in normal blend, then add points in "lighter".
  function clearHard() {
    ensureCanvasSize(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function phiDriftCycles(now) {
    if (!driftOn) return 0;
    const t = (now - driftStart) / 1000;
    return (t * DRIFT_CPS) % 1;
  }

  function effective() {
    // frequency multiplier affects f_vis; audio derived from f_vis/16
    const f_vis = clamp(base.f_vis * freqMul, 200, 12000);

    // Feedback slider controls BOTH:
    // - visual feedback (must be high for complexity)
    // - audio feedback scaling (but still clamped)
    const fbScale = feedbackOn ? fbMul : 0.0;

    // Visual feedback should be "over 0.8" per your ask.
    // We'll map slider to [0.80..0.98] multiplied by base.
    const visFb = feedbackOn
      ? clamp(0.80 + 0.12 * clamp(fbMul, 0, 1), 0.80, 0.98) * (base.visFbBase / 0.90)
      : 0.0;

    // audio feedback scale -> clamp each stage <= 0.95
    const fb1 = clamp(base.fb1 * fbScale, 0, 0.95);
    const fb2 = clamp(base.fb2 * fbScale, 0, 0.95);
    const fb3 = clamp(base.fb3 * fbScale, 0, 0.95);

    return {
      ...base,
      f_vis,
      visFb: clamp(visFb, 0, 0.985),
      fb1, fb2, fb3,
      // audio mix constants reused
      a: 0.7, b: 0.4
    };
  }

  function updateLabels(now) {
    const p = effective();
    const drift = phiDriftCycles(now);
    const f_aud = p.f_vis / 16;

    meta.textContent =
      `ratio 1:2 • x(f)=(sin+tri) • y(2f)=(sin+tri) • ` +
      `f_vis ${p.f_vis.toFixed(1)} Hz • f_aud ${f_aud.toFixed(1)} Hz • ` +
      `drift ${drift.toFixed(3)} • visFB ${p.visFb.toFixed(3)}`;

    freqVal.textContent = `${freqMul.toFixed(2)}×`;
    fbVal.textContent = `${(feedbackOn ? fbMul : 0).toFixed(2)}×`;
  }

  function projectFeedback(p) {
    // self-draw with tiny transform (video feedback). This is where complexity comes from.
    // Use source-over with alpha = visFb (>= 0.8)
    if (!feedbackOn) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = p.visFb;

    // transform around center
    const cx = W / 2;
    const cy = H / 2;

    const rot = p.fbRotate;
    const sc = p.fbScale;

    // shift in device pixels (scale with dpr feel)
    const shift = p.fbShift * Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));

    ctx.translate(cx + shift, cy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);

    // draw current canvas onto itself
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

    // additive points for "pixel filling"
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = p.pointAlpha;

    // we draw filled rects (pixel look)
    ctx.fillStyle = "rgba(221,221,221,1)";

    const phiCycles = p.phi + p.phaseJitter + phiDriftCycles(now);

    // fixed time window for each frame (stable): sample across a fixed T window
    // (avoid using now directly in t mapping; only phase drifts)
    const T = 0.02; // 20ms window
    const N = SAMPLES_PER_FRAME;

    for (let i = 0; i < N; i++) {
      const t = (i * T) / (N - 1);
      const { x, y } = xyAt(t, p, phiCycles);

      const px = (cx + x * sx) | 0; // integer pixel for stability
      const py = (cy - y * sy) | 0;

      // bounds check
      if (px < 0 || py < 0 || px >= W || py >= H) continue;

      ctx.fillRect(px, py, p.pixel, p.pixel);
    }

    ctx.restore();
  }

  function tick(now) {
    if (now - last >= DT) {
      last = now;

      const resized = ensureCanvasSize(canvas);
      if (resized) clearHard();

      const p = effective();

      // 1) visual feedback projection (complexity)
      projectFeedback(p);

      // 2) slight darkening to prevent infinite burn-in (very subtle)
      //    This avoids runaway brightness with "lighter".
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.06; // small decay per frame (tune)
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // 3) draw new points (pixel fill)
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

  // -------- UI bindings --------
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
    rng = getRand();
    base = makeParams(rng);
    driftStart = performance.now();
    clearHard();
    updateLabels(performance.now());
    restartAudioIfRunning();
    if (window.$fx && typeof window.$fx.preview === "function") window.$fx.preview();
  });

  btnDrift.addEventListener("click", () => {
    driftOn = !driftOn;
    btnDrift.textContent = driftOn ? "Drift: ON" : "Drift: OFF";
    driftStart = performance.now(); // reset baseline (no jump)
  });

  btnFb.addEventListener("click", () => {
    feedbackOn = !feedbackOn;
    btnFb.textContent = feedbackOn ? "Feedback: ON" : "Feedback: OFF";
    // when turning feedback off, clear a bit to avoid “ghost domination”
    clearHard();
    restartAudioIfRunning();
  });

  freqSlider.addEventListener("input", () => {
    freqMul = parseFloat(freqSlider.value);
    // no hard clear; let it morph
    restartAudioIfRunning();
  });

  fbSlider.addEventListener("input", () => {
    fbMul = parseFloat(fbSlider.value);
    // no hard clear; let it morph
    restartAudioIfRunning();
  });

  window.addEventListener("resize", () => {
    clearHard();
  });

  // init UI text
  btnDrift.textContent = driftOn ? "Drift: ON" : "Drift: OFF";
  btnFb.textContent = feedbackOn ? "Feedback: ON" : "Feedback: OFF";

  clearHard();
  updateLabels(performance.now());
  requestAnimationFrame(tick);
})();
