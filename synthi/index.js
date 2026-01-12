// synthi/index.js
// SYNTHI Generator (stable frame, visible feedback, complex image, working audio + UI)
//
// - NO WARP (no nonlinear X<->Y coupling)
// - Base: X = sin(f)+tri(f), Y = sin(2f)+tri(2f) with phiOffset
// - Extra layers for complexity:
//    * osc3: octave layer around 2f with slight detune (detail texture)
//    * osc4: very low "breathing" layer (fills surface + breaks U tendency gently)
// - Visible video feedback: self-draw with tiny rotate/scale/shift controlled by feedback slider
// - Locked projection window: padFrac/gain fixed (no zoom jump on reroll)
// - Screenshot: button id synthiShot (optional) + key "P"
// - Audio: sine+triangle + optional detuned voice -> 3-stage delay with feedback + safety clip

(() => {
  const TAU = Math.PI * 2;

  /* ---------------- utils ---------------- */
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function frac(x) { return x - Math.floor(x); }
  function triFromPhase(p) { return 1 - 4 * Math.abs(p - 0.5); }
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

  function $(id) { return document.getElementById(id); }

  /* ---------------- RNG ---------------- */
  let rerollCounter = 0;
  function getRand() {
    if (window.$fx && typeof window.$fx.rand === "function") return () => window.$fx.rand();
    const s = `${location.pathname}|${location.search}|${location.hash}|SYNTHI|${rerollCounter}|${Date.now()}`;
    return mulberry32(xmur3(s)());
  }

  /* ---------------- params ---------------- */
  function makeParams(rng) {
    const rare = rng() < 0.12;
    const f_vis = rare ? logUniform(rng, 3800, 7200) : logUniform(rng, 900, 5200);

    // weights
    const xSin = 0.95;
    const xTri = 0.95 + rng() * 0.55;
    const ySin = 0.95;
    const yTri = 0.95 + rng() * 0.55;

    // LOCKED frame (no jump)
    const padFrac = 0.10;
    const gain = 0.92;

    // geometry (linear only)
    const rot = (rng() - 0.5) * 0.35;
    const shear = (rng() - 0.5) * 0.20;

    // base phase
    const phi = rng();
    const phiOffset = 0.25;

    // slow drift + PM
    const driftCps = 0.0008;          // cycles/sec (very slow)
    const pmHz = 0.04 + rng() * 0.12; // 0.04..0.16 Hz
    const pmDepth = 0.001 + rng() * 0.006; // cycles

    // osc3 (detail layer)
    const detune = (rng() < 0.5 ? -1 : 1) * (0.0004 + rng() * 0.0012); // ~0.04..0.16%
    const osc3Mix = 0.08 + rng() * 0.16;
    const osc3Phi = rng();

    // osc4 (slow fill layer) — very low freq relative to f (stable complexity)
    const osc4Mul = 0.125 + rng() * 0.25; // f * 0.125..0.375
    const osc4Mix = 0.04 + rng() * 0.10;
    const osc4Phi = rng();

    // drawing
    const pixel = rng() < 0.5 ? 2 : 3;
    const pointAlpha = 0.34;

    // feedback micro-transform baseline (slider scales it)
    const fbScale = 1.0008 + rng() * 0.0035;
    const fbRotate = (rng() - 0.5) * 0.010;
    const fbShift = (rng() - 0.5) * 2.2;

    // ramps (image shaping)
    const ampRate = 0.020 + rng() * 0.050;
    const densRate = 0.016 + rng() * 0.040;
    const phiSpreadBase = 0.010 + rng() * 0.010;

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
      pixel, pointAlpha,
      fbScale, fbRotate, fbShift,
      ampRate, densRate, phiSpreadBase,
      a, b, t1, t2, t3, fb1, fb2, fb3
    };
  }

  /* ---------------- canvas sizing ---------------- */
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

  /* ---------------- signal ---------------- */
  function applyLinearTransform(x, y, p) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    let xr = x * c - y * s;
    let yr = x * s + y * c;
    xr = xr + p.shear * yr;
    return { x: xr, y: yr };
  }

  function xyAt(t, p, phiCycles, nowSec) {
    const f = p.f_vis;

    // gentle PM in cycles
    const pm = p.pmDepth * Math.sin(TAU * (p.pmHz * nowSec));
    const phi = phiCycles + pm;

    // base: x(f), y(2f)
    const px = TAU * (f * t + phi);
    const py = TAU * (2 * f * t + (phi + p.phiOffset));

    const sx = Math.sin(px);
    const sy = Math.sin(py);

    const tx = triFromPhase(frac(f * t + phi));
    const ty = triFromPhase(frac(2 * f * t + (phi + p.phiOffset)));

    let x = (p.xSin * sx + p.xTri * tx);
    let y = (p.ySin * sy + p.yTri * ty);

    // osc3: octave-ish detail (2f*(1+detune)), still 1:2 inside osc3
    const f3 = (2 * f) * (1 + p.detune);
    const phi3 = phiCycles + p.osc3Phi + pm * 0.35;

    x += p.osc3Mix * Math.sin(TAU * (f3 * t + phi3));
    y += p.osc3Mix * Math.sin(TAU * (2 * f3 * t + (phi3 + p.phiOffset)));

    // osc4: slow fill layer (very low freq relative to f), still 1:2 inside osc4
    const f4 = f * p.osc4Mul;
    const phi4 = phiCycles + p.osc4Phi + pm * 0.15;

    x += p.osc4Mix * (Math.sin(TAU * (f4 * t + phi4)) + 0.6 * triFromPhase(frac(f4 * t + phi4)));
    y += p.osc4Mix * (Math.sin(TAU * (2 * f4 * t + (phi4 + p.phiOffset))) + 0.6 * triFromPhase(frac(2 * f4 * t + (phi4 + p.phiOffset))));

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

    // feedback loop: delay -> fbGain -> clip -> delay
    delay.connect(fbGain);
    fbGain.connect(clip);
    clip.connect(delay);

    return { delay, fbGain };
  }

  function startAudio(pEff, fbOn, fbMul) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();

    const f_aud = pEff.f_vis / 16;

    const oscSin = ctx.createOscillator();
    oscSin.type = "sine";
    oscSin.frequency.value = f_aud;

    const oscTri = ctx.createOscillator();
    oscTri.type = "triangle";
    oscTri.frequency.value = f_aud * 2;

    // optional 3rd voice: subtle detuned sine (adds richness but quiet)
    const oscDet = ctx.createOscillator();
    oscDet.type = "sine";
    oscDet.frequency.value = f_aud * (1 + (pEff.detune * 0.5));

    const gSin = ctx.createGain(); gSin.gain.value = pEff.a;
    const gTri = ctx.createGain(); gTri.gain.value = pEff.b;
    const gDet = ctx.createGain(); gDet.gain.value = 0.10;

    oscSin.connect(gSin);
    oscTri.connect(gTri);
    oscDet.connect(gDet);

    const sum = ctx.createGain();
    gSin.connect(sum);
    gTri.connect(sum);
    gDet.connect(sum);

    const pre = ctx.createGain();
    pre.gain.value = 0.22;

    // feedback scaling for audio
    const s = fbOn ? clamp(fbMul, 0, 1.2) : 0.0;
    const fb1 = clamp(pEff.fb1 * s, 0, 0.95);
    const fb2 = clamp(pEff.fb2 * s, 0, 0.95);
    const fb3 = clamp(pEff.fb3 * s, 0, 0.95);

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
    oscDet.start(now);

    audio = {
      ctx,
      muted: false,
      setMute(on) { post.gain.value = on ? 0.0 : 0.9; this.muted = on; },
      stop() {
        try { oscSin.stop(); oscTri.stop(); oscDet.stop(); } catch {}
        try { ctx.close(); } catch {}
      }
    };
    return audio;
  }

  /* ---------------- init UI + render loop ---------------- */
  function init() {
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

    if (!canvas || !meta || !btnStart || !btnMute || !btnReroll || !btnDrift || !btnFb || !freqSlider || !fbSlider || !freqVal || !fbVal) {
      console.warn("SYNTHI: Missing UI elements. Check IDs in your HTML.");
      return;
    }

    const ctx2d = canvas.getContext("2d", { alpha: false });

    // screenshot button optional
    const btnShot = $("synthiShot");
    function savePNG() {
      // Save canvas as PNG
      const a = document.createElement("a");
      a.download = `synthi_${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    }
    if (btnShot) btnShot.addEventListener("click", savePNG);
    window.addEventListener("keydown", (e) => {
      if (e.key === "p" || e.key === "P") savePNG();
    });

    // state
    let rng = getRand();
    let base = makeParams(rng);

    let driftOn = true;
    let feedbackOn = true;

    let freqMul = parseFloat(freqSlider.value);
    let fbMul = parseFloat(fbSlider.value);

    // drift integrator (stable, no jitter)
    let driftPhase = 0;
    let lastTime = performance.now();

    function stepDrift(now) {
      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      if (!driftOn) return;
      driftPhase = (driftPhase + base.driftCps * dt) % 1;
    }
    function phiDriftCycles() { return driftOn ? driftPhase : 0; }

    // render pacing
    const FPS = 30;
    const DT = 1000 / FPS;
    let lastFrame = 0;

    function clearHard() {
      ensureCanvasSize(canvas);
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.globalAlpha = 1;
      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }

    function effective() {
      const f_vis = clamp(base.f_vis * freqMul, 200, 12000);

      // visual feedback strength from slider (and toggle)
      const fb = feedbackOn ? clamp(fbMul, 0, 1.5) : 0.0;

      // make feedback definitely visible:
      // - alpha high
      // - transform also scaled by fb
      const visAlpha = feedbackOn ? clamp(0.70 + 0.20 * clamp(fbMul, 0, 1), 0.70, 0.92) : 0.0;

      // transform intensity
      const scale = 1 + (base.fbScale - 1) * (0.35 + 0.85 * fb);
      const rotate = base.fbRotate * (0.25 + 1.0 * fb);
      const shift = base.fbShift * (0.25 + 1.0 * fb);

      return {
        ...base,
        f_vis,
        // for feedback projection
        visAlpha,
        fbScaleEff: scale,
        fbRotateEff: rotate,
        fbShiftEff: shift,
        // audio feedback multiplier shares slider
        fbMulEff: fb
      };
    }

    function updateLabels(now) {
      const p = effective();
      const f_aud = p.f_vis / 16;
      const detCents = 1200 * Math.log2(1 + p.detune);

      meta.textContent =
        `x=f(sin+tri) • y=2f(sin+tri) • osc3 detune ${detCents.toFixed(2)}c • osc4 slow fill • ` +
        `f_vis ${p.f_vis.toFixed(1)}Hz • f_aud ${f_aud.toFixed(1)}Hz • ` +
        `drift ${phiDriftCycles().toFixed(3)} • vFB ${(feedbackOn ? p.visAlpha : 0).toFixed(3)}`;

      freqVal.textContent = `${freqMul.toFixed(2)}×`;
      fbVal.textContent = `${(feedbackOn ? fbMul : 0).toFixed(2)}×`;
    }

    function projectFeedback(p) {
      if (!feedbackOn) return;

      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      ctx2d.save();
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.globalAlpha = p.visAlpha;

      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const shift = p.fbShiftEff * dpr;

      ctx2d.translate(cx + shift, cy);
      ctx2d.rotate(p.fbRotateEff);
      ctx2d.scale(p.fbScaleEff, p.fbScaleEff);
      ctx2d.translate(-cx, -cy);

      ctx2d.drawImage(canvas, 0, 0);
      ctx2d.restore();
    }

    function plotPoints(p, now) {
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      const pad = Math.min(W, H) * p.padFrac;
      const sx = (W / 2 - pad) * p.gain;
      const sy = (H / 2 - pad) * p.gain;

      // ramps for image tuning
      const tsec = now / 1000;
      const amp = 0.86 + 0.14 * Math.sin(TAU * (p.ampRate * tsec));         // amplitude breath
      const dens = 0.55 + 0.45 * Math.sin(TAU * (p.densRate * tsec + 0.2)); // density fill
      const phiSpread = p.phiSpreadBase * (0.65 + 0.70 * (1 - dens));       // when dense, reduce spread a bit

      const nowSec = tsec;
      const phiBase = p.phi + phiDriftCycles();

      // samples per frame scales with density and canvas size
      const baseN = 52000;
      const N = Math.floor(baseN * dens);

      // time window: longer = more “surface”
      const TWIN = 0.22; // seconds in "t" domain (not audio seconds)
      const s = p.pixel;
      const jitterK = 1.4 * s;

      ctx2d.save();
      ctx2d.globalCompositeOperation = "lighter";
      ctx2d.globalAlpha = p.pointAlpha;
      ctx2d.fillStyle = "rgba(221,221,221,1)";

      for (let i = 0; i < N; i++) {
        const t = Math.random() * TWIN;
        const phiPoint = phiBase + (Math.random() * 2 - 1) * phiSpread;

        const { x, y } = xyAt(t, p, phiPoint, nowSec);

        const px0 = (cx + x * sx * amp) | 0;
        const py0 = (cy - y * sy * amp) | 0;

        // mild diffusion (not chaos)
        const px = (px0 + ((Math.random() * 2 - 1) * jitterK) | 0);
        const py = (py0 + ((Math.random() * 2 - 1) * jitterK) | 0);

        if (px < 0 || py < 0 || px >= W || py >= H) continue;

        ctx2d.fillRect(px, py, s, s);

        // occasional extra dots to fill "pixels"
        if ((i & 15) === 0) ctx2d.fillRect(px + s, py, s, s);
        if ((i & 31) === 0) ctx2d.fillRect(px, py + s, s, s);
      }

      ctx2d.restore();
    }

    function tick(now) {
      stepDrift(now);

      if (now - lastFrame >= DT) {
        lastFrame = now;

        const resized = ensureCanvasSize(canvas);
        if (resized) clearHard();

        const p = effective();

        // 1) visible feedback projection
        projectFeedback(p);

        // 2) decay (controls persistence)
        ctx2d.save();
        ctx2d.globalCompositeOperation = "source-over";
        // decay slightly depends on feedback: more feedback => slightly more decay to avoid burn-in
        const decay = feedbackOn ? (0.10 + 0.05 * clamp(fbMul, 0, 1)) : 0.12;
        ctx2d.globalAlpha = decay;
        ctx2d.fillStyle = "#000";
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.restore();

        // 3) plot new points (complex structure)
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
      const p = effective();
      audio = startAudio(p, feedbackOn, p.fbMulEff);
      audio.setMute(wasMuted);
      btnMute.textContent = wasMuted ? "Unmute" : "Mute";
    }

    /* ---- UI bindings ---- */
    btnStart.addEventListener("click", async () => {
      const p = effective();
      if (!audio) audio = startAudio(p, feedbackOn, p.fbMulEff);
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

      // reset drift without jump
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
      updateLabels(performance.now());
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

    window.addEventListener("resize", () => clearHard());

    // init texts
    btnDrift.textContent = driftOn ? "Drift: ON" : "Drift: OFF";
    btnFb.textContent = feedbackOn ? "Feedback: ON" : "Feedback: OFF";
    btnMute.textContent = "Mute";

    clearHard();
    updateLabels(performance.now());
    requestAnimationFrame(tick);
  }

  // Ensure DOM exists
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

