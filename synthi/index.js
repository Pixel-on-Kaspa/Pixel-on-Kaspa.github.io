// SYNTHI / IMAGE GENERATOR
// Stable oscilloscope-based generative image system
// - strong visual feedback (video feedback style)
// - no warp, no jitter chaos
// - multi-ramp image shaping
// - screenshot export

const TAU = Math.PI * 2;

/* ================= RNG ================= */

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
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seedCounter = 0;
function getRand() {
  const s = `${location.pathname}|SYNTHI|${seedCounter++}`;
  return mulberry32(xmur3(s)());
}

/* ================= MATH ================= */

function frac(x) { return x - Math.floor(x); }
function tri(p) { return 1 - 4 * Math.abs(p - 0.5); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

/* ================= PARAMS ================= */

function makeParams(rng) {
  return {
    f: 900 + rng() * 4200,

    // sin / tri balance
    sinW: 1.0,
    triW: 1.15,

    // osc3
    detune: (rng() < 0.5 ? -1 : 1) * (0.0006 + rng() * 0.001),
    osc3Mix: 0.12,

    // frame LOCKED
    gain: 0.92,
    pad: 0.10,

    // geometry
    rot: (rng() - 0.5) * 0.35,
    shear: (rng() - 0.5) * 0.22,

    // feedback
    feedback: 0.92,

    // ramps
    ampRate: 0.025 + rng() * 0.05,
    densRate: 0.018 + rng() * 0.04,
    phaseRate: 0.008 + rng() * 0.02,
  };
}

/* ================= SIGNAL ================= */

function xyAt(t, p, phase) {
  const f = p.f;

  const px = TAU * (f * t + phase);
  const py = TAU * (2 * f * t + phase + 0.25);

  let x = p.sinW * Math.sin(px) + p.triW * tri(frac(f * t + phase));
  let y = p.sinW * Math.sin(py) + p.triW * tri(frac(2 * f * t + phase + 0.25));

  // osc3 (detail)
  const f3 = 2 * f * (1 + p.detune);
  x += p.osc3Mix * Math.sin(TAU * (f3 * t));
  y += p.osc3Mix * Math.sin(TAU * (2 * f3 * t));

  // rotate + shear (NO warp)
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);

  let xr = x * c - y * s;
  let yr = x * s + y * c;
  xr += p.shear * yr;

  return {
    x: Math.tanh(0.9 * xr),
    y: Math.tanh(0.9 * yr),
  };
}

/* ================= INIT ================= */

const canvas = document.getElementById("synthiCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

let rng = getRand();
let P = makeParams(rng);

function resize() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
}
resize();
window.addEventListener("resize", resize);

/* ================= SCREENSHOT ================= */

function savePNG() {
  const a = document.createElement("a");
  a.download = `synthi_${Date.now()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
window.addEventListener("keydown", e => {
  if (e.key === "p") savePNG(); // press P
});

/* ================= RENDER ================= */

let phase = 0;
let t0 = performance.now();

function render(now) {
  const dt = (now - t0) / 1000;
  t0 = now;

  // ramps
  const amp = 0.85 + 0.15 * Math.sin(TAU * P.ampRate * now / 1000);
  const dens = 0.6 + 0.4 * Math.sin(TAU * P.densRate * now / 1000);
  phase += dt * P.phaseRate;

  // feedback pass (REAL)
  ctx.save();
  ctx.globalAlpha = P.feedback;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();

  // decay
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // draw points
  ctx.fillStyle = "#ddd";
  ctx.globalCompositeOperation = "lighter";

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const sx = (cx - cx * P.pad) * P.gain * amp;
  const sy = (cy - cy * P.pad) * P.gain * amp;

  const N = Math.floor(40000 * dens);

  for (let i = 0; i < N; i++) {
    const t = Math.random() * 0.2;
    const { x, y } = xyAt(t, P, phase);
    const px = (cx + x * sx) | 0;
    const py = (cy - y * sy) | 0;
    if (px > 0 && py > 0 && px < canvas.width && py < canvas.height)
      ctx.fillRect(px, py, 2, 2);
  }

  ctx.globalCompositeOperation = "source-over";
  requestAnimationFrame(render);
}

/* ================= START ================= */

ctx.fillStyle = "#000";
ctx.fillRect(0, 0, canvas.width, canvas.height);
requestAnimationFrame(render);

/* ================= REROLL ================= */

document.getElementById("synthiReroll")?.addEventListener("click", () => {
  rng = getRand();
  P = makeParams(rng);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
});
