// synthi/index.js
// SYNTHI Generator – embed do existující stránky
// Render (4A): XY polyline z osc1/osc2, fix T=20ms, N=80k
// Audio: a*sin + b*tri -> 3× delay chain with feedback + softclip in loop
// No switch: audio is always derived: f_aud = f_vis / 16

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

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function frac(x) { return x - Math.floor(x); }
function triFromPhase(p) { return 1 - 4 * Math.abs(p - 0.5); }

function logUniform(rng, min, max) {
  const lo = Math.log(min);
  const hi = Math.log(max);
  return Math.exp(lo + (hi - lo) * rng());
}

function makeParams(rng) {
  const T = 0.02;
  const N = 80000;
  const dphi = 0.25;

  const rare = rng() < 0.10;
  const f_vis = rare ? logUniform(rng, 6000, 7000) : logUniform(rng, 1000, 5000);

  const r = pick(rng, [1.25, 1.5, 1.75, 2.0]);
  const phi = rng();

  const a = 0.7;
  const b = 0.4;

  const t1 = (5 + rng() * 15) / 1000;
  const t2 = (40 + rng() * 80) / 1000;
  const t3 = (180 + rng() * 420) / 1000;

  const fb1 = 0.05 + rng() * 0.15;
  const fb2 = 0.15 + rng() * 0.25;
  const fb3 = 0.25 + rng() * 0.30;

  const padFrac = 0.10;
  const gain = 0.88;

  return { T, N, dphi, f_vis, r, phi, a, b, t1, t2, t3, fb1, fb2, fb3, padFrac, gain, rare };
}

function renderXY(canvas, params) {
  const ctx = canvas.getContext("2d", { alpha: false });

  const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  const W = Math.floor(canvas.clientWidth * dpr);
  const H = Math.floor(canvas.clientHeight * dpr);
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ddd";

  const cx = W / 2;
  const cy = H / 2;
  const pad = Math.min(W, H) * params.padFrac;
  const sx = (W / 2 - pad) * params.gain;
  const sy = (H / 2 - pad) * params.gain;

  const { T, N, f_vis, r, phi, dphi } = params;

  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const t = (i * T) / (N - 1);
    const x = Math.sin(TAU * f_vis * t + TAU * phi);
    const p = frac(f_vis * r * t + (phi + dphi));
    const y = triFromPhase(p);
    const px = cx + x * sx;
    const py = cy - y * sy;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

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

function startAudio(params, postGainNode) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContext();

  const f_aud = params.f_vis / 16;

  const oscSin = ctx.createOscillator();
  oscSin.type = "sine";
  oscSin.frequency.value = f_aud;

  const oscTri = ctx.createOscillator();
  oscTri.type = "triangle";
  oscTri.frequency.value = f_aud * params.r;

  const gSin = ctx.createGain(); gSin.gain.value = params.a;
  const gTri = ctx.createGain(); gTri.gain.value = params.b;

  oscSin.connect(gSin);
  oscTri.connect(gTri);

  const sum = ctx.createGain();
  gSin.connect(sum);
  gTri.connect(sum);

  const pre = ctx.createGain();
  pre.gain.value = 0.25;

  const d1 = buildDelayStage(ctx, params.t1, params.fb1, 0.8);
  const d2 = buildDelayStage(ctx, params.t2, params.fb2, 0.9);
  const d3 = buildDelayStage(ctx, params.t3, params.fb3, 1.0);

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

  // Expose a "mute" control via provided node reference
  if (postGainNode) postGainNode._post = post;

  const now = ctx.currentTime + 0.02;
  const triOffset = 0.25 / (oscTri.frequency.value || 1);

  oscSin.start(now);
  oscTri.start(now + triOffset);

  audio = {
    ctx,
    oscSin,
    oscTri,
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

function $(id) { return document.getElementById(id); }

(function initSynthi() {
  const canvas = $("synthiCanvas");
  const meta = $("synthiMeta");
  const btnStart = $("synthiStart");
  const btnMute = $("synthiMute");
  const btnReroll = $("synthiReroll");

  if (!canvas || !meta || !btnStart || !btnMute || !btnReroll) {
    console.warn("SYNTHI: Missing embed elements.");
    return;
  }

  let rng = getRand();
  let params = makeParams(rng);

  function updateMeta() {
    const f_aud = params.f_vis / 16;
    meta.textContent =
      `f_vis ${params.f_vis.toFixed(1)} Hz • f_aud ${f_aud.toFixed(1)} Hz • r ${params.r} • φ ${params.phi.toFixed(3)} • T ${(params.T*1000).toFixed(0)} ms • N ${params.N}`;
  }

  function render() {
    renderXY(canvas, params);
    updateMeta();
    if (window.$fx && typeof window.$fx.preview === "function") window.$fx.preview();
  }

  function reroll() {
    rng = getRand();
    params = makeParams(rng);
    render();
    // pokud už audio běží, nech ho běžet (nebo můžeš stopnout a startnout znovu)
  }

  window.addEventListener("resize", render);

  btnStart.addEventListener("click", async () => {
    if (!audio) startAudio(params, {});
    if (audio && audio.ctx.state !== "running") await audio.ctx.resume();
  });

  btnMute.addEventListener("click", () => {
    if (!audio) return;
    audio.setMute(!audio.muted);
    btnMute.textContent = audio.muted ? "Unmute" : "Mute";
  });

  btnReroll.addEventListener("click", () => {
    reroll();
  });

  render();
})();
