// synthi/index.js
// Goal:
// - NO SHAKE: pixel accumulation + smooth video feedback (no polyline redraw).
// - More complex structure: visual feedback high but NOT locking (avoid visFB ~ 0.99).
// - Signal structure:
//   x uses frequency f:    x = (sin(f) + tri(f)) mix
//   y uses frequency 2f:   y = (sin(2f) + tri(2f)) mix
//   => X:Y ratio strictly 1:2.
// - Drift: very slow, STABLE integrator (no irregular jumps on frame drops).
// - Fill plane: random time sampling + spray + phase diffusion per point.
// - Controls from HTML: Start audio, Mute, Re-render, Drift ON/OFF, Feedback ON/OFF,
//   Frequency slider (multiplies f), Feedback slider (scales visual+audio feedback).

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

  // offset for 2f branch
  const phiOffset = 0.25;

  // mix weights for sin/tri in X and Y
  const xSin = 1.0;
  const xTri = 0.85 + rng() * 0.55;   // 0.85..1.40
  const ySin = 1.0;
  const yTri = 0.85 + rng() * 0.55;

  // framing
  const padFrac = 0.08 + rng() * 0.06; // 0.08..0.14
  const gain = 0.86 + rng() * 0.10;    // 0.86..0.96

  // pixel stamp (bigger fills faster)
  const pixel = rng() < 0.40 ? 2 : 3; // 2 or 3
  const pointAlpha = 0.40;            // lower alpha; we draw MANY more points

  // drift variety
  const phaseJitter = (rng() - 0.5) * 0.20; // ±0.10 cycles

  // audio mix
  const a = 0.7;
  const b = 0.4;

  // ✅ SHORTER delays (tight / metallic)
  const t1 = (2 + rng() * 6) / 1000;      // 2–8 ms
  const t2 = (12 + rng() * 28) / 1000;    // 12–40 ms
  const t3 = (60 + rng() * 120) / 1000;   // 60–180 ms

  // ✅ stronger feedback baseline (still safe due to softclip in loop)
  const fb1 = 0.30 + rng() * 0.22; // ~0.30..0.52
  const fb2 = 0.45 + rng() * 0.25; // ~0.45..0.70
  const fb3 = 0.55 + rng() * 0.30; // ~0.55..0.85

  // visual feedback baseline
  const visFbBase = 0.84 + rng() * 0.10; // 0.84..0.94 (lower than before)

  // micro transform per frame
  const fbScale = 1.0015 + rng() * 0.0025; // 1.0015..1.004
  const fbRotate = (rng() - 0.5) * 0.006;  // ~ +/- 0.003 rad
  const fbShift = (rng() - 0.5) * 1.4;     // px shift

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

  const px = TAU * (f * t + phi);
  const py = TAU * (2 * f * t + (phi + p.phiOffset));

  const sx = Math.sin(px);
  const sy = Math.sin(py);

  const tx = triFromPhase(frac(f * t + phi));
  const ty = triFromPhase(frac(2 * f * t + (phi + p.phiOffset)));

  const x = (p.xSin * sx + p.xTri * tx);
  const y = (p.ySin * sy + p.yTri * ty);

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
  oscTri.frequency.value = f_aud * 2; // ratio 1:2

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

  let driftOn = true;
  let feedbackOn = true;

  let freqMul = parseFloat(freqSlider.value);
  let fbMul = parseFloat(fbSlider.value);

  // ✅ Stable drift integrator
  const DRIFT_CPS = 0.0012; // cycles/sec (slow)
  let driftPhase = 0;       // cycles
  let lastTime = performance.now();

  function stepDrift(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000)); // clamp 0..50ms
    lastTime = now;
    if (!driftOn) return;
    driftPhase = (driftPhase + DRIFT_CPS * dt) % 1;
  }
  function phiDriftCycles() {
    return driftOn ? driftPhase : 0;
  }

  // frame scheduling
  const FPS = 30;
  const DT = 1000 / FPS;
  let last = 0;

  // ✅ denser fill
  const SAMPLES_PER_FRAME = 65000;

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

    // ✅ prevent “locking”: keep visFB away from ~0.99
    const visFb = feedbackOn
      ? clamp(0.78 + 0.14 * clamp(fbMul, 0, 1), 0.78, 0.94) * (base.visFbBase / 0.90)
      : 0.0;

    const fb1 = clamp(base.fb1 * fbScale, 0, 0.95);
    const fb2 = clamp(base.fb2 * fbScale, 0, 0.95);
    const fb3 = clamp(base.fb3 * fbScale, 0, 0.95);

    return {
      ...base,
      f_vis,
      visFb: clamp(visFb, 0, 0.955),
      fb1, fb2, fb3,
      a: 0.7, b: 0.4
    };
  }

  function updateLabels(now) {
    const p = effective();
    const f_aud = p.f_vis / 16;

    meta.textContent =
      `ratio 1:2 • x(f)=(sin+tri) • y(2f)=(sin+tri) • ` +
      `f_vis ${p.f_vis.toFixed(1)} Hz • f_aud ${f_aud.toFixed(1)} Hz • ` +
      `drift ${phiDriftCycles().toFixed(3)} • visFB ${p.visFb.toFixed(3)}`;

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

  function plotPoints(p) {
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

    const phiBase = p.phi + p.phaseJitter + phiDriftCycles();

    // ✅ key to “fill plane”
    const PHI_SPREAD = 0.028; // 0.015..0.040 (more = more area)
    const TWIN = 0.14;        // time window in seconds
    const N = SAMPLES_PER_FRAME;

    const s = p.pixel;
    const jitterK = 2.2 * s;

    for (let i = 0; i < N; i++) {
      const t = Math.random() * TWIN;

      // per-point phase diffusion
      const phiPoint = phiBase + (Math.random() * 2 - 1) * PHI_SPREAD;

      const { x, y } = xyAt(t, p, phiPoint);

      const px0 = (cx + x * sx) | 0;
      const py0 = (cy - y * sy) | 0;

      // spray around the point
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

      // 1) video feedback projection
      projectFeedback(p);

      // 2) stronger decay -> prevents “one bright band”
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // 3) plot points
      plotPoints(p);

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
