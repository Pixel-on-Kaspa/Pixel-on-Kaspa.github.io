/* ─────────────────────────────────────────────────────────────
   GLSL LAB — engine + UI
   Pixel on Kaspa · art lab

   Drives the modular shader from js/glsl-lab-shader.js:
   • schema-driven control panel (one source of truth for
     defaults, ranges, visibility, URL state and presets)
   • program cache keyed on the #define block, so switching a
     module recompiles once and then costs nothing
   • exports: PNG at up to 4K, and a frame-exact clip
     (WebCodecs MP4 when available, MediaRecorder otherwise)
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var S = window.GLSLLabShader;
  if (!S) { console.error("[glsl-lab] shader module missing"); return; }

  /* ── helpers ───────────────────────────────────────────────── */
  var is3d    = function (P) { return P.mode === "3d"; };
  var is3dVol = function (P) { return P.mode === "3d" && +P.march === 1; };
  var is2d    = function (P) { return P.mode === "2d"; };
  function sel(list) { return list.map(function (n, i) { return [i, n]; }); }

  /* ── the schema: every control, in panel order ─────────────── */
  var SCHEMA = [
    { group: "Regime", items: [
      { id: "mode", type: "select", label: "Regime", struct: true, def: "2d",
        opts: [["2d", "2D field"], ["3d", "3D raymarch"]] },
      { id: "aspect", type: "select", label: "Format", def: "1:1",
        opts: [["1:1", "Square 1:1"], ["4:5", "Portrait 4:5"], ["16:9", "Wide 16:9"], ["9:16", "Story 9:16"]] },
      { id: "seed", type: "range", label: "Seed", min: 0, max: 999, step: 1, def: 137 },
      { id: "scale", type: "select", label: "Render scale", def: "auto",
        opts: [["auto", "Auto (keeps it smooth)"], ["0.5", "0.5× — fastest"],
               ["0.7", "0.7×"], ["1", "1×"], ["1.4", "1.4×"], ["2", "2× — sharpest"]] }
    ]},

    { group: "Domain", when: is2d, items: [
      { id: "domain", type: "select", label: "Space", struct: true, def: 2, opts: sel(S.DOMAINS) },
      { id: "sym",   type: "range", label: "Symmetry", min: 1, max: 20, step: 1, def: 6,
        when: function (P) { return [1, 2, 3].indexOf(+P.domain) >= 0; } },
      { id: "tile",  type: "range", label: "Tile count", min: 1, max: 16, step: 1, def: 3,
        when: function (P) { return [4, 5].indexOf(+P.domain) >= 0; } },
      { id: "tilemirror", type: "toggle", label: "Mirror tiles", struct: true, def: true,
        when: function (P) { return +P.domain === 4; } },
      { id: "twist", type: "range", label: "Spiral twist", min: -4, max: 4, step: 0.01, def: 1.0,
        when: function (P) { return +P.domain === 3; } },
      { id: "zoom", type: "range", label: "Zoom", min: 0.1, max: 8, step: 0.01, def: 1.0 },
      { id: "offx", type: "range", label: "Offset X", min: -4, max: 4, step: 0.01, def: 0 },
      { id: "offy", type: "range", label: "Offset Y", min: -4, max: 4, step: 0.01, def: 0 },
      { id: "rot",  type: "range", label: "Rotate", min: -0.5, max: 0.5, step: 0.001, def: 0 }
    ]},

    { group: "Warp", items: [
      { id: "warp",  type: "select", label: "Warp", struct: true, def: 1, opts: sel(S.WARPS2), when: is2d },
      { id: "warp3", type: "select", label: "Warp", struct: true, def: 0, opts: sel(S.WARPS3), when: is3d },
      { id: "warpAmt",  type: "range", label: "Amount", min: 0, max: 2, step: 0.005, def: 0.35,
        when: function (P) { return is3d(P) ? +P.warp3 > 0 : +P.warp > 0; } },
      { id: "warpFreq", type: "range", label: "Frequency", min: 0.05, max: 8, step: 0.01, def: 1.2,
        when: function (P) { return is3d(P) ? +P.warp3 > 0 : +P.warp > 0; } },
      { id: "warpIt",   type: "range", label: "Warp iterations", min: 1, max: 6, step: 1, def: 2, struct: true,
        when: function (P) { return is3d(P) ? [2, 3].indexOf(+P.warp3) >= 0 : [1, 2, 4].indexOf(+P.warp) >= 0; } },
      { id: "rateWarp", type: "range", label: "Warp rate", min: 0, max: 6, step: 0.25, def: 1,
        when: function (P) { return is3d(P) ? +P.warp3 > 0 : +P.warp > 0; } }
    ]},

    { group: "Motif", when: is2d, items: [
      { id: "field", type: "select", label: "Field", struct: true, def: 1, opts: sel(S.FIELDS) },
      { id: "shape", type: "select", label: "Shape", struct: true, def: 0, opts: sel(S.SHAPES),
        when: function (P) { return +P.field === 0; } },
      { id: "fscale", type: "range", label: "Scale", min: 0.05, max: 12, step: 0.01, def: 1.6 },
      { id: "fa", type: "range", min: 0, max: 2, step: 0.005, def: 0.5,
        label: function (P) { return ["Radius", "Bias", "Angle spread", "Line width", "Cell mode",
          "Julia c.x", "Noise freq", "Line width", "Wave / radius mix", "Filament ↔ trap"][+P.field]; } },
      { id: "fb", type: "range", min: 0, max: 2, step: 0.005, def: 0.4,
        label: function (P) { return ["Round / points", "Drift", "Freq spread", "—", "Threshold",
          "Julia c.y", "Distortion", "—", "Radius", "—"][+P.field]; },
        when: function (P) { return [3, 7, 9].indexOf(+P.field) < 0; } },
      { id: "fc", type: "range", min: 0, max: 2, step: 0.005, def: 0.5, label: "Orbit radius",
        when: function (P) { return +P.field === 5; } },
      { id: "octaves", type: "range", label: "Noise octaves", min: 1, max: 8, step: 1, def: 5, struct: true,
        when: function (P) { return [1, 6].indexOf(+P.field) >= 0 || +P.warp === 1; } },
      { id: "noiseShape", type: "select", label: "Noise character", struct: true, def: 0, opts: sel(S.NOISES),
        when: function (P) { return [1, 6].indexOf(+P.field) >= 0 || +P.warp === 1; } },
      { id: "roughness", type: "range", label: "Roughness", min: 0.15, max: 0.9, step: 0.005, def: 0.5,
        when: function (P) { return [1, 6].indexOf(+P.field) >= 0 || +P.warp === 1; } },
      { id: "lacunarity", type: "range", label: "Lacunarity", min: 1.3, max: 3.6, step: 0.01, def: 2.03,
        when: function (P) { return [1, 6].indexOf(+P.field) >= 0 || +P.warp === 1; } },
      { id: "gratings", type: "range", label: "Gratings", min: 1, max: 12, step: 1, def: 4, struct: true,
        when: function (P) { return +P.field === 2; } },
      { id: "juliaIt", type: "range", label: "Julia iterations", min: 2, max: 96, step: 1, def: 24, struct: true,
        when: function (P) { return +P.field === 5; } },
      { id: "rateField", type: "range", label: "Motif rate", min: 0, max: 6, step: 0.25, def: 1 }
    ]},

    { group: "Motif", when: is3d, items: [
      { id: "sdf", type: "select", label: "Solid", struct: true, def: 3, opts: sel(S.SDFS) },
      { id: "sSize", type: "range", label: "Size", min: 0.05, max: 2.5, step: 0.005, def: 0.7,
        when: function (P) { return [0, 1, 2, 4].indexOf(+P.sdf) >= 0; } },
      { id: "sFreq", type: "range", label: "Gyroid frequency", min: 0.1, max: 4, step: 0.01, def: 0.8,
        when: function (P) { return +P.sdf === 3; } },
      { id: "sPow", type: "range", label: "Power", min: 2, max: 14, step: 0.05, def: 8,
        when: function (P) { return +P.sdf === 5; } },
      { id: "sK", type: "range", label: "Fold scale", min: 0.4, max: 1.9, step: 0.005, def: 1.1,
        when: function (P) { return +P.sdf === 6; } },
      { id: "sBox", type: "range", label: "Box scale", min: -3, max: 3, step: 0.01, def: 2.4,
        when: function (P) { return +P.sdf === 7; } },
      { id: "sThick", type: "range", min: 0.01, max: 2, step: 0.005, def: 0.35,
        label: function (P) { return +P.sdf === 5 ? "Bulb scale" : "Thickness / round"; },
        when: function (P) { return [0, 6].indexOf(+P.sdf) < 0; } },
      { id: "foldIt", type: "range", label: "Fold iterations", min: 1, max: 20, step: 1, def: 8, struct: true,
        when: function (P) { return [4, 5, 6].indexOf(+P.sdf) >= 0; } },
      { id: "octaves", type: "range", label: "Noise octaves", min: 1, max: 8, step: 1, def: 5, struct: true,
        when: function (P) { return +P.warp3 === 5; } },
      { id: "noiseShape", type: "select", label: "Noise character", struct: true, def: 0, opts: sel(S.NOISES),
        when: function (P) { return +P.warp3 === 5; } },
      { id: "roughness", type: "range", label: "Roughness", min: 0.15, max: 0.9, step: 0.005, def: 0.5,
        when: function (P) { return +P.warp3 === 5; } },
      { id: "lacunarity", type: "range", label: "Lacunarity", min: 1.3, max: 3.6, step: 0.01, def: 2.03,
        when: function (P) { return +P.warp3 === 5; } },
      { id: "rep3", type: "toggle", label: "Infinite repeat", struct: true, def: false },
      { id: "bound", type: "select", label: "Bounding shape", struct: true, def: 0, opts: sel(S.BOUNDS) },
      { id: "boundR", type: "range", label: "Bound size", min: 0.2, max: 6, step: 0.01, def: 1.3,
        when: function (P) { return +P.bound > 0; } },
      { id: "srep", type: "range", label: "Repeat spacing", min: 0.25, max: 6, step: 0.01, def: 2.0,
        when: function (P) { return !!P.rep3; } }
    ]},

    { group: "March", when: is3d, items: [
      { id: "march", type: "select", label: "Render", struct: true, def: 1, opts: sel(S.MARCHES) },
      { id: "marchSteps", type: "range", label: "Steps", min: 20, max: 260, step: 5, def: 110, struct: true },
      { id: "density", type: "range", min: 0, max: 4, step: 0.01, def: 1.0,
        label: function (P) { return is3dVol(P) ? "Glow density" : "Light gain"; } },
      { id: "absorb", type: "range", label: "Absorption", min: 0, max: 1, step: 0.005, def: 0.6,
        when: is3dVol },
      { id: "falloff", type: "range", label: "Glow falloff", min: 0.5, max: 300, step: 0.5, def: 45,
        when: is3dVol },
      { id: "stepScale", type: "range", label: "Step scale", min: 0.08, max: 1, step: 0.005, def: 0.7 },
      { id: "far", type: "range", label: "Far distance", min: 2, max: 40, step: 0.1, def: 12 },
      { id: "fov", type: "range", label: "FOV", min: 0.2, max: 2.5, step: 0.01, def: 1.0 },
      { id: "camDist", type: "range", label: "Camera distance", min: 0.2, max: 10, step: 0.01, def: 2.6 },
      { id: "camYaw", type: "range", label: "Yaw", min: -0.5, max: 0.5, step: 0.001, def: 0 },
      { id: "camPitch", type: "range", label: "Pitch", min: -0.24, max: 0.24, step: 0.001, def: 0.06 },
      { id: "rateCam", type: "range", label: "Orbit rate", min: 0, max: 4, step: 0.25, def: 1 }
    ]},

    { group: "Fold — form engine", when: function (P) {
        return is3d(P) ? [4, 5, 6, 7, 8].indexOf(+P.sdf) >= 0 : +P.field === 9;
      }, items: [
      { id: "foldIt2", type: "range", label: "Fold iterations", min: 1, max: 20, step: 1, def: 10,
        struct: true, when: function (P) { return is2d(P); } },
      { id: "foldOffX", type: "range", label: "Fold X", min: -3, max: 3, step: 0.005, def: -0.7,
        when: function (P) { return is2d(P) || +P.sdf === 8; } },
      { id: "foldOffY", type: "range", label: "Fold Y", min: -3, max: 8, step: 0.005, def: 4.0,
        when: function (P) { return is2d(P) || +P.sdf === 8; } },
      { id: "foldOffZ", type: "range", label: "Fold Z", min: -3, max: 3, step: 0.005, def: 0.4,
        when: function (P) { return is3d(P) && +P.sdf === 8; } },
      { id: "foldParX", type: "range", label: "Param A", min: 0, max: 6, step: 0.005, def: 2.6,
        when: function (P) { return is2d(P) || +P.sdf === 8; } },
      { id: "foldParY", type: "range", label: "Param B", min: 0, max: 7, step: 0.005, def: 3.94,
        when: function (P) { return is2d(P) || +P.sdf === 8; } },
      { id: "foldParZ", type: "range", label: "Param C", min: 0, max: 6, step: 0.005, def: 3.3,
        when: function (P) { return is3d(P) && +P.sdf === 8; } },
      { id: "foldInt", type: "range", label: "Intensity", min: 0.2, max: 15, step: 0.01, def: 5.0,
        when: function (P) { return is2d(P) || +P.sdf === 8; } },
      { id: "foldScale", type: "range", label: "Fold scale", min: 0.2, max: 5, step: 0.01, def: 1.8,
        when: function (P) { return is2d(P) || +P.sdf === 8; } },
      { id: "foldRot", type: "toggle", label: "Rotate between folds", struct: true, def: false },
      { id: "foldRotA", type: "range", label: "Rotation A", min: -3.14, max: 3.14, step: 0.005, def: 0.4,
        when: function (P) { return !!P.foldRot; } },
      { id: "foldRotB", type: "range", label: "Rotation B", min: -3.14, max: 3.14, step: 0.005, def: 0.2,
        when: function (P) { return !!P.foldRot && is3d(P); } },
      { id: "foldDrive", type: "range", label: "Morph drive", min: 0, max: 2, step: 0.005, def: 0 },
      { id: "foldDriveRate", type: "range", label: "Morph rate", min: 0, max: 4, step: 0.25, def: 1,
        when: function (P) { return +P.foldDrive > 0; } }
    ]},

    { group: "Shade", items: [
      { id: "shade", type: "select", label: "Shading", struct: true, def: 1, opts: sel(S.SHADES),
        when: function (P) { return !is3dVol(P); } },
      { id: "shFreq", type: "range", min: 0.05, max: 32, step: 0.01, def: 3,
        label: function (P) { return is3dVol(P) ? "Colour spread" : "Frequency"; } },
      { id: "shThick", type: "range", min: 0, max: 1, step: 0.005, def: 0.12,
        label: function (P) { return is3dVol(P) ? "Colour offset" : "Line thickness"; },
        when: function (P) { return is3dVol(P) || +P.shade === 1; } },
      { id: "shSoft", type: "range", label: "Edge softness", min: 0.0005, max: 0.5, step: 0.0005, def: 0.02,
        when: function (P) { return !is3dVol(P) && +P.shade === 0 && is2d(P); } },
      { id: "shSteps", type: "range", label: "Steps", min: 2, max: 16, step: 1, def: 5,
        when: function (P) { return !is3dVol(P) && +P.shade === 4; } }
    ]},

    { group: "Colour", items: [
      { id: "pal", type: "select", label: "Palette", struct: true, def: 1, opts: sel(S.PALS) },
      { id: "tint", type: "select", label: "Colour by", struct: true, def: 2, opts: sel(S.TINTS),
        when: function (P) { return !is3dVol(P); } },
      { id: "palHue", type: "range", label: "Hue", min: -1, max: 1, step: 0.002, def: 0.1,
        when: function (P) { return [1, 2].indexOf(+P.pal) >= 0; } },
      { id: "palSat", type: "range", label: "Saturation", min: 0, max: 1.5, step: 0.005, def: 0.9,
        when: function (P) { return [1, 2].indexOf(+P.pal) >= 0; } },
      { id: "palSpread", type: "range", label: "Ramp spread", min: -6, max: 6, step: 0.01, def: 1.0 },
      { id: "palOff", type: "range", label: "Ramp offset", min: -2, max: 2, step: 0.005, def: 0 },
      { id: "colA", type: "color", label: "Colour A", def: "#49eacb",
        when: function (P) { return [0, 3].indexOf(+P.pal) >= 0; } },
      { id: "colB", type: "color", label: "Colour B", def: "#12203a",
        when: function (P) { return +P.pal === 3; } },
      { id: "colBg", type: "color", label: "Background", def: "#05070a", when: is3d }
    ]},

    { group: "Post", items: [
      { id: "exposure", type: "range", label: "Exposure", min: 0, max: 8, step: 0.01, def: 1 },
      { id: "tonemap", type: "toggle", label: "Tone map (Reinhard)", struct: true, def: true },
      { id: "gamma", type: "range", label: "Gamma", min: 0.4, max: 2.6, step: 0.01, def: 1 },
      { id: "contrast", type: "range", label: "Contrast", min: 0.2, max: 2.5, step: 0.01, def: 1 },
      { id: "satPost", type: "range", label: "Saturation", min: 0, max: 2, step: 0.01, def: 1 },
      { id: "pixelate", type: "toggle", label: "Pixelate", struct: true, def: false },
      { id: "cells", type: "range", label: "Pixel cells", min: 8, max: 512, step: 1, def: 96,
        when: function (P) { return !!P.pixelate; } },
      { id: "posterize", type: "toggle", label: "Posterize", struct: true, def: false },
      { id: "levels", type: "range", label: "Colour levels", min: 2, max: 16, step: 1, def: 5,
        when: function (P) { return !!P.posterize; } },
      { id: "dither", type: "toggle", label: "Ordered dither", struct: true, def: true,
        when: function (P) { return !!P.posterize; } },
      { id: "vignette", type: "toggle", label: "Vignette", struct: true, def: false },
      { id: "vigAmt", type: "range", label: "Vignette amount", min: 0, max: 2, step: 0.01, def: 0.4,
        when: function (P) { return !!P.vignette; } },
      { id: "grain", type: "toggle", label: "Grain", struct: true, def: false },
      { id: "grainAmt", type: "range", label: "Grain amount", min: 0, max: 0.4, step: 0.005, def: 0.06,
        when: function (P) { return !!P.grain; } },
      { id: "mirrorX", type: "toggle", label: "Mirror X", struct: true, def: false, when: is2d },
      { id: "mirrorY", type: "toggle", label: "Mirror Y", struct: true, def: false, when: is2d }
    ]},

    { group: "Effects", items: [
      { id: "bloom", type: "toggle", label: "Bloom", struct: true, def: false },
      { id: "bloomAmt", type: "range", label: "Bloom amount", min: 0, max: 4, step: 0.01, def: 1.2,
        when: function (P) { return !!P.bloom; } },
      { id: "bloomThresh", type: "range", label: "Bloom threshold", min: 0, max: 3, step: 0.005, def: 0.7,
        when: function (P) { return !!P.bloom; } },
      { id: "bloomRadius", type: "range", label: "Bloom radius", min: 0.5, max: 12, step: 0.05, def: 3,
        when: function (P) { return !!P.bloom; } },
      { id: "rgbsplit", type: "toggle", label: "RGB split", struct: true, def: false },
      { id: "rgbAmt", type: "range", label: "Split amount", min: 0, max: 6, step: 0.01, def: 1.5,
        when: function (P) { return !!P.rgbsplit; } },
      { id: "trails", type: "toggle", label: "Trails (feedback)", struct: true, def: false },
      { id: "trailMode", type: "select", label: "Trail type", struct: true, def: 0,
        opts: [[0, "Motion blur"], [1, "Echo (light piles up)"]],
        when: function (P) { return !!P.trails; } },
      { id: "trailAmt", type: "range", label: "Trail persistence", min: 0, max: 0.985, step: 0.005, def: 0.85,
        when: function (P) { return !!P.trails; } },
      { id: "scanlines", type: "toggle", label: "Scanlines", struct: true, def: false },
      { id: "scanAmt", type: "range", label: "Scanline depth", min: 0, max: 1, step: 0.01, def: 0.5,
        when: function (P) { return !!P.scanlines; } },
      { id: "scanSpacing", type: "range", label: "Scanline spacing (px)", min: 2, max: 24, step: 0.5, def: 4,
        when: function (P) { return !!P.scanlines; } }
    ]},

    { group: "Animation", items: [
      { id: "speed", type: "range", label: "Speed", min: 0, max: 4, step: 0.01, def: 1 },
      { id: "loop", type: "toggle", label: "Seamless loop", def: true },
      { id: "period", type: "range", label: "Loop length (s)", min: 1, max: 30, step: 0.5, def: 8 },
      { id: "phase", type: "range", label: "Phase", min: 0, max: 1, step: 0.002, def: 0 }
    ]},

    { group: "Export", items: [
      { id: "pngSize", type: "select", label: "PNG size", def: "2048",
        opts: [["1024", "1024"], ["2048", "2048"], ["3072", "3072"], ["4096", "4096"]] },
      { id: "recSize", type: "select", label: "Clip size", def: "1080",
        opts: [["720", "720"], ["1080", "1080"], ["1440", "1440"]] },
      { id: "recFps", type: "select", label: "Clip fps", def: "30", opts: [["24", "24"], ["30", "30"], ["60", "60"]] },
      { id: "recSec", type: "select", label: "Clip length", def: "8",
        opts: [["4", "4 s"], ["8", "8 s"], ["15", "15 s"], ["30", "30 s"]] },
      { id: "recShare", type: "toggle", label: "Share clip on X after export", def: false }
    ]}
  ];

  /* ── defaults / state ──────────────────────────────────────── */
  var ITEMS = [], DEF = {};
  SCHEMA.forEach(function (g) {
    g.items.forEach(function (it) {
      it._group = g;
      ITEMS.push(it);
      if (!(it.id in DEF)) DEF[it.id] = it.def;
    });
  });
  var IDS = Object.keys(DEF);
  var P = Object.assign({}, DEF);

  /* ── presets: simple → very complex ────────────────────────── */
  var PRESETS = [
    ["One circle", { mode: "2d", domain: 0, warp: 0, field: 0, shape: 0, fscale: 1, fa: 0.6, tint: 0,
      shade: 0, shSoft: 0.004, pal: 3, colA: "#0b0d12", colB: "#f4f1e8", palSpread: 1, tonemap: false }],
    ["Rings", { mode: "2d", domain: 0, warp: 0, field: 0, shape: 0, fscale: 2.2, fa: 0.2, tint: 0,
      shade: 1, shFreq: 6, shThick: 0.25, pal: 0, colA: "#49eacb", palSpread: 1, tonemap: false }],
    ["Moire", { mode: "2d", domain: 0, warp: 0, field: 2, gratings: 3, fscale: 2.6, fa: 0.4, fb: 0.55,
      tint: 0, shade: 5, shFreq: 2.4, pal: 3, colA: "#0b0d12", colB: "#e8e4d8", rateField: 1,
      tonemap: false }],
    ["Truchet weave", { mode: "2d", domain: 0, warp: 0, field: 3, fscale: 4, fa: 0.25, tint: 0,
      shade: 0, shSoft: 0.006, pal: 3, colA: "#0a1414", colB: "#49eacb", tonemap: false,
      pixelate: true, cells: 160, posterize: true, levels: 4, dither: true }],
    ["Kaleido bloom", { mode: "2d", domain: 2, sym: 8, warp: 1, warpAmt: 0.5, warpFreq: 1.1, warpIt: 1,
      field: 1, octaves: 4, fscale: 1.1, shade: 1, shFreq: 3, shThick: 0.2, tint: 2,
      pal: 1, palHue: 0.12, palSat: 0.95, palSpread: 1.4, exposure: 1.15 }],
    ["Cell tissue", { mode: "2d", domain: 0, warp: 2, warpAmt: 0.18, warpFreq: 2.2, warpIt: 2,
      field: 4, fscale: 3.2, fa: 0.85, fb: 0.35, shade: 1, shFreq: 5, shThick: 0.3, tint: 2,
      pal: 1, palHue: -0.35, palSat: 0.7, palSpread: 2.2 }],
    ["Julia orbit", { mode: "2d", domain: 0, warp: 0, field: 5, juliaIt: 32, fscale: 0.9,
      fa: 0.36, fb: 0.6, fc: 0.5, shade: 3, shFreq: 1.2, tint: 2, pal: 1, palHue: 0.55,
      palSat: 1.0, palSpread: 3.0, exposure: 1.4, rateField: 1 }],
    ["Liquid fold", { mode: "2d", domain: 0, warp: 4, warpAmt: 0.62, warpFreq: 1.1, warpIt: 4,
      field: 1, octaves: 4, fscale: 1.2, shade: 2, shFreq: 2.0, tint: 2,
      pal: 1, palHue: 0.75, palSat: 1.1, palSpread: 3.0, contrast: 1.2 }],
    ["Spiral engine", { mode: "2d", domain: 3, sym: 5, twist: 1.6, warp: 6, warpAmt: 0.3, warpFreq: 2.4,
      tint: 0, field: 7, fscale: 3.0, fa: 0.55, shade: 0, shSoft: 0.03,
      pal: 2, palHue: 0.15, palSat: 0.8, palSpread: 1.0, tonemap: false }],
    ["Gyroid volume", { mode: "3d", sdf: 3, sFreq: 1.1, sThick: 0.25, march: 1, marchSteps: 140,
      bound: 1, boundR: 1.5, density: 1.6, absorb: 0.55, falloff: 45, stepScale: 0.5,
      far: 12, camDist: 2.4, rateCam: 1, pal: 1, palHue: 0.45, palSat: 0.9,
      shFreq: 1.4, palSpread: 2.0, palOff: 0.35, exposure: 1.5, satPost: 1.3, colBg: "#03050a" }],
    ["Apollonian dust", { mode: "3d", sdf: 6, sK: 1.15, foldIt: 10, march: 1, marchSteps: 170,
      density: 1.4, absorb: 0.4, falloff: 250, stepScale: 0.4, far: 6, camDist: 1.6, rateCam: 1,
      pal: 1, palHue: 0.08, palSat: 1.0, shFreq: 2.5, palSpread: 2.4, exposure: 1.7,
      satPost: 1.25, colBg: "#030407" }],
    ["Mandelbulb", { mode: "3d", sdf: 5, sPow: 8, sThick: 1.0, foldIt: 9, march: 0, marchSteps: 160,
      density: 1.2, stepScale: 0.8, far: 6, camDist: 1.9, camPitch: 0.05, rateCam: 0.5,
      shade: 2, shFreq: 1.2, tint: 2, palSpread: 2.5, pal: 1, palHue: 0.62, palSat: 0.85,
      colBg: "#05070c" }],
    ["Menger sponge", { mode: "3d", sdf: 4, sSize: 0.8, foldIt: 4, march: 0, marchSteps: 150,
      density: 1.1, stepScale: 0.85, far: 12, camDist: 3.2, camPitch: 0.12, rateCam: 1,
      shade: 1, shFreq: 8, shThick: 0.35, tint: 0, pal: 3, colA: "#0b0f14", colB: "#49eacb",
      palSpread: 1.4, colBg: "#05070a", tonemap: false }],
    ["Mandelbox", { mode: "3d", sdf: 7, sBox: 2.4, foldIt: 10, march: 0, marchSteps: 150,
      density: 1.1, stepScale: 0.75, far: 14, camDist: 4.5, camPitch: 0.1, rateCam: 1,
      shade: 2, shFreq: 1.4, tint: 2, pal: 1, palHue: 0.05, palSat: 0.9, palSpread: 1.6,
      colBg: "#05070c", bloom: true, bloomAmt: 1.1, bloomThresh: 0.6, bloomRadius: 3 }],
    ["Ridge canyon", { mode: "2d", domain: 0, warp: 0, field: 1, octaves: 4, noiseShape: 1,
      roughness: 0.55, lacunarity: 2.2, fscale: 1.0, fa: 0.5, fb: 0.35, shade: 2, shFreq: 2.5,
      tint: 2, pal: 1, palHue: 0.06, palSat: 0.85, palSpread: 2.2, contrast: 1.15,
      rateField: 1, bloom: true, bloomAmt: 1.2, bloomThresh: 0.65, bloomRadius: 4 }],
    ["Crystal fold", { mode: "2d", domain: 0, warp: 7, warpAmt: 0.62, warpFreq: 1.35, warpIt: 5,
      field: 0, shape: 1, fscale: 1.4, fa: 0.55, fb: 0.2, shade: 1, shFreq: 5, shThick: 0.28,
      tint: 2, pal: 1, palHue: 0.5, palSat: 0.95, palSpread: 2.0, tonemap: false,
      bloom: true, bloomAmt: 1.3, bloomThresh: 0.55, bloomRadius: 2.5 }],
    ["Kleinian fold", { mode: "3d", sdf: 8, foldIt: 10, march: 1, marchSteps: 180,
      foldOffX: -0.7, foldOffY: 4.0, foldOffZ: 0.4, foldParX: 2.6, foldParY: 3.94, foldParZ: 3.3,
      foldInt: 5.0, foldScale: 1.8, foldDrive: 0.12, foldDriveRate: 1,
      density: 1.4, absorb: 0.45, falloff: 1500, stepScale: 0.22, far: 8, camDist: 2.0,
      rateCam: 1, pal: 1, palHue: 0.12, palSat: 1.0, shFreq: 2.0, palSpread: 2.2,
      exposure: 1.6, satPost: 1.2, colBg: "#030407",
      bloom: true, bloomAmt: 1.0, bloomThresh: 0.7, bloomRadius: 3 }],
    ["Fold engine 2D", { mode: "2d", domain: 0, warp: 0, field: 9, foldIt2: 12,
      foldOffX: -0.7, foldOffY: 1.6, foldParX: 1.4, foldParY: 2.2, foldInt: 3.2, foldScale: 1.4,
      foldRot: true, foldRotA: 0.5, foldDrive: 0.15, foldDriveRate: 1,
      fscale: 1.2, fa: 0.8, shade: 3, shFreq: 2.2, tint: 2, pal: 1, palHue: 0.3,
      palSat: 1.0, palSpread: 2.4, exposure: 1.4,
      bloom: true, bloomAmt: 1.1, bloomThresh: 0.6, bloomRadius: 3 }],
    ["Nebula lattice", { mode: "3d", sdf: 0, sSize: 0.32, rep3: true, srep: 1.6, march: 1,
      marchSteps: 150, warp3: 5, warpAmt: 0.5, warpFreq: 0.7, octaves: 4,
      bound: 1, boundR: 2.4, density: 1.3, absorb: 0.45, falloff: 25,
      stepScale: 0.4, far: 14, camDist: 4.2, rateCam: 1, pal: 1, palHue: 0.85, palSat: 1.0,
      shFreq: 1.2, palSpread: 2.0, exposure: 1.5, satPost: 1.2, colBg: "#03050a" }]
  ];

  /* ── DOM ───────────────────────────────────────────────────── */
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("c"), status = $("status"), errEl = $("errEl");
  var panel = $("panel"), hint = $("hint");
  var wrap = document.querySelector(".canvasWrap");
  var rows = []; // {item, el}

  function fmt(v, step) {
    var d = (String(step).split(".")[1] || "").length;
    return (+v).toFixed(d);
  }
  function labelOf(it) { return typeof it.label === "function" ? it.label(P) : it.label; }

  function buildUI() {
    SCHEMA.forEach(function (g) {
      var box = document.createElement("div");
      box.className = "grp";
      var head = document.createElement("div");
      head.className = "grpHead";
      head.innerHTML = "<b>" + g.group + "</b><span class='arrow'>&#9662;</span>";
      var body = document.createElement("div");
      body.className = "grpBody";
      head.addEventListener("click", function () {
        var c = body.classList.toggle("hidden");
        head.classList.toggle("collapsed", c);
      });
      box.appendChild(head); box.appendChild(body);
      g._box = box; g._body = body;

      g.items.forEach(function (it) {
        var row = document.createElement("div");
        row.className = "ctrl";
        var inp;

        if (it.type === "range") {
          row.innerHTML = "<div class='ctrlHead'><span class='ctrlTitle'></span><span class='ctrlVal'></span></div>";
          inp = document.createElement("input");
          inp.type = "range"; inp.min = it.min; inp.max = it.max; inp.step = it.step;
          row.appendChild(inp);
        } else if (it.type === "select") {
          row.innerHTML = "<div class='ctrlHead'><span class='ctrlTitle'></span></div>";
          inp = document.createElement("select");
          it.opts.forEach(function (o) {
            var op = document.createElement("option");
            op.value = String(o[0]); op.textContent = o[1];
            inp.appendChild(op);
          });
          row.appendChild(inp);
        } else if (it.type === "toggle") {
          row.classList.add("ctrlToggle");
          inp = document.createElement("input");
          inp.type = "checkbox";
          var lab = document.createElement("label");
          lab.className = "tgl";
          var span = document.createElement("span");
          span.className = "ctrlTitle";
          lab.appendChild(inp); lab.appendChild(span);
          row.appendChild(lab);
          row._title = span;
        } else { // color
          row.innerHTML = "<div class='ctrlHead'><span class='ctrlTitle'></span></div>";
          inp = document.createElement("input");
          inp.type = "color";
          row.appendChild(inp);
        }

        inp.addEventListener("input", function () {
          if (it.type === "range") {
            P[it.id] = parseFloat(inp.value);
            if (it.struct) needRebuild = true;
            // visibility only ever keys off selects and toggles, so a slider
            // drag just refreshes its own number
            var val = row.querySelector(".ctrlVal");
            if (val) val.textContent = fmt(P[it.id], it.step);
            persist();
            return;
          }
          P[it.id] = (it.type === "toggle") ? inp.checked : inp.value;
          if (it.struct) { needRebuild = true; needPostRebuild = true; }
          persist(); syncUI();
        });

        rows.push({ item: it, row: row, input: inp, group: g });
        body.appendChild(row);
      });

      panel.appendChild(box);
    });
  }

  /* Push P into the widgets and apply visibility. */
  function syncUI() {
    rows.forEach(function (r) {
      var it = r.item;
      var visible = (!it.when || it.when(P)) && (!r.group.when || r.group.when(P));
      r.row.style.display = visible ? "" : "none";
      if (!visible) return;
      var title = r.row._title || r.row.querySelector(".ctrlTitle");
      if (title) title.textContent = labelOf(it);
      if (it.type === "toggle") {
        r.input.checked = !!P[it.id];
      } else if (it.type === "range") {
        r.input.value = String(P[it.id]);
        var val = r.row.querySelector(".ctrlVal");
        if (val) val.textContent = fmt(P[it.id], it.step);
      } else {
        r.input.value = String(P[it.id]);
      }
    });
    SCHEMA.forEach(function (g) {
      var anyVisible = g.items.some(function (it) {
        return (!it.when || it.when(P)) && (!g.when || g.when(P));
      });
      g._box.style.display = anyVisible ? "" : "none";
    });
    applyAspect();
  }

  /* ── state: URL + localStorage ─────────────────────────────── */
  var KEY = "glsl_lab_v1";

  /* Dragging a slider fires ~60 input events a second. Writing the URL that
     often trips Chrome's navigation throttle ("Throttling navigation to prevent
     the browser from hanging") and stalls the tab, so coalesce the writes. */
  var persistTimer = 0;
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 300);
  }

  function persistNow() {
    clearTimeout(persistTimer);
    try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {}
    var u = new URL(location.href);
    IDS.forEach(function (id) { u.searchParams.delete(id); });
    IDS.forEach(function (id) {
      if (P[id] === DEF[id]) return;            // keep shared links short
      var v = P[id];
      if (typeof v === "boolean") v = v ? 1 : 0;
      u.searchParams.set(id, String(v));
    });
    history.replaceState(null, "", u.toString());
  }

  function coerce(it, raw) {
    if (it.type === "toggle") return !(raw === "0" || raw === "false" || raw === false);
    if (it.type === "range") {
      var v = parseFloat(raw);
      if (!isFinite(v)) return it.def;
      return Math.max(it.min, Math.min(it.max, v));
    }
    if (it.type === "select") {
      var ok = it.opts.some(function (o) { return String(o[0]) === String(raw); });
      return ok ? (typeof it.def === "number" ? +raw : String(raw)) : it.def;
    }
    return /^#[0-9a-fA-F]{6}$/.test(String(raw)) ? String(raw) : it.def;
  }

  function restore() {
    var store = {};
    try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
    var q = new URL(location.href).searchParams;
    ITEMS.forEach(function (it) {
      if (it.id in store) P[it.id] = coerce(it, store[it.id]);
      if (q.has(it.id)) P[it.id] = coerce(it, q.get(it.id));
    });
  }

  function applyPatch(patch) {
    P = Object.assign({}, DEF, patch);
    needRebuild = true;
    needPostRebuild = true;
    clearTrails();
    persistNow(); syncUI();
  }

  /* ── canvas sizing / aspect ────────────────────────────────── */
  function aspectRatio() {
    var a = String(P.aspect || "1:1").split(":");
    return (+a[0]) / (+a[1]);
  }
  function applyAspect() {
    if (!wrap) return;
    var host = wrap.parentElement;
    var availW = host.clientWidth - 2, availH = host.clientHeight - 2;
    if (availW <= 0 || availH <= 0) return;
    var ar = aspectRatio();
    var w = availW, h = w / ar;
    if (h > availH) { h = availH; w = h * ar; }
    wrap.style.width = Math.floor(w) + "px";
    wrap.style.height = Math.floor(h) + "px";
  }

  /* ── GL ────────────────────────────────────────────────────── */
  var gl = canvas.getContext("webgl2", {
    antialias: false, alpha: false, preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  if (!gl) {
    errEl.style.display = "block";
    errEl.textContent = "WebGL2 is required for the GLSL Lab. Try a current Chrome, Edge, Firefox or Safari 15+.";
    status.textContent = "no webgl2";
    return;
  }

  var UNIFORMS = ["uRes", "uTime", "uPeriod", "uSeed", "uView", "uSym", "uWarp", "uField",
    "uShade", "uPal", "uPost", "uFx", "uMarch", "uCam", "uAnim", "uNoise",
    "uFold1", "uFold2", "uFold3", "uColA", "uColB", "uColBg"];

  var cache = {}, cur = null, needRebuild = true, vao = gl.createVertexArray();
  var lost = false;

  /* A single frame that takes too long makes the driver reset the context.
     Without these handlers the canvas just freezes with no explanation. */
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    lost = true;
    busy = false;
    errEl.style.display = "block";
    errEl.textContent =
      "The GPU reset the WebGL context — one frame took too long.\n" +
      "Recovering at half render scale. If it repeats, lower Steps, Fold iterations, " +
      "Noise octaves, or raise Step scale.";
    status.textContent = "context lost — recovering";
  }, false);

  canvas.addEventListener("webglcontextrestored", function () {
    lost = false;
    cache = {};                 // every GL object died with the context
    cur = null;
    needRebuild = true;
    vao = gl.createVertexArray();
    scaleIdx = 0;               // come back conservatively
    errEl.style.display = "none";
  }, false);

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh) || "compile error";
      gl.deleteShader(sh);
      throw new Error(log);
    }
    return sh;
  }

  function cfgOf() {
    return {
      mode: P.mode, domain: +P.domain, tilemirror: !!P.tilemirror,
      warp: +P.warp, warp3: +P.warp3, warpIt: +P.warpIt,
      field: +P.field, shape: +P.shape, octaves: +P.octaves,
      gratings: +P.gratings, juliaIt: +P.juliaIt,
      sdf: +P.sdf, rep3: !!P.rep3, bound: +P.bound,
      foldIt: is2d(P) ? +P.foldIt2 : +P.foldIt, foldRot: !!P.foldRot,
      noiseShape: +P.noiseShape,
      march: +P.march, marchSteps: +P.marchSteps,
      shade: +P.shade, pal: +P.pal, tint: +P.tint,
      tonemap: !!P.tonemap, hdr: twoPass(),
      pixelate: !!P.pixelate, posterize: !!P.posterize, dither: !!P.dither,
      vignette: !!P.vignette, grain: !!P.grain,
      mirrorX: !!P.mirrorX, mirrorY: !!P.mirrorY
    };
  }

  function program() {
    var cfg = cfgOf(), k = S.key(cfg);
    if (cache[k]) return cache[k];
    var src = S.build(cfg);
    try {
      var vs = compile(gl.VERTEX_SHADER, S.VERT);
      var fs = compile(gl.FRAGMENT_SHADER, src);
      var pr = gl.createProgram();
      gl.attachShader(pr, vs); gl.attachShader(pr, fs);
      gl.linkProgram(pr);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || "link error");
      var locs = {};
      UNIFORMS.forEach(function (n) { locs[n] = gl.getUniformLocation(pr, n); });
      cache[k] = { prog: pr, locs: locs, src: src };
      errEl.style.display = "none";
      return cache[k];
    } catch (e) {
      errEl.style.display = "block";
      errEl.textContent = String(e.message || e);
      status.textContent = "shader error";
      console.error("[glsl-lab] shader build failed\n", e, "\n", src);
      return cur; // keep the last good program on screen
    }
  }

  function hex2rgb(h) {
    h = String(h || "#000000").replace("#", "");
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }

  function setUniforms(pr, w, h, time) {
    var L = pr.locs, u = gl.useProgram.bind(gl);
    u(pr.prog);
    var loop = !!P.loop;
    var rate = function (r) { return loop ? Math.round(+r) : +r; };
    var period = Math.max(+P.period, 0.1);

    gl.uniform2f(L.uRes, w, h);
    gl.uniform1f(L.uTime, time);
    gl.uniform1f(L.uPeriod, period);
    gl.uniform1f(L.uSeed, +P.seed);

    gl.uniform4f(L.uView, +P.zoom, +P.offx, +P.offy, +P.rot);
    gl.uniform4f(L.uSym, +P.sym, +P.tile, +P.twist, +P.boundR);
    gl.uniform4f(L.uWarp, +P.warpAmt, +P.warpFreq, 0, 0);

    // uField: pA/pB/pC differ per regime
    if (is3d(P)) {
      var sdf = +P.sdf;
      var y = sdf === 3 ? +P.sFreq : sdf === 5 ? +P.sPow
            : sdf === 6 ? +P.sK : sdf === 7 ? +P.sBox : +P.sSize;
      gl.uniform4f(L.uField, 1.0, y, +P.sThick, +P.srep);
    } else {
      gl.uniform4f(L.uField, +P.fscale, +P.fa, +P.fb, +P.fc);
    }

    gl.uniform4f(L.uShade, +P.shFreq, +P.shThick,
      is3dVol(P) ? +P.falloff : +P.shSoft, +P.shSteps);
    gl.uniform4f(L.uPal, +P.palHue, +P.palSat, +P.palSpread, +P.palOff);
    gl.uniform4f(L.uPost, +P.exposure, +P.gamma, +P.contrast, +P.satPost);
    gl.uniform4f(L.uFx, +P.cells, +P.levels, +P.vigAmt, +P.grainAmt);
    gl.uniform4f(L.uMarch, +P.fov, +P.density, +P.stepScale, +P.far);
    gl.uniform4f(L.uCam, +P.camDist, +P.camYaw, +P.camPitch, +P.absorb);
    gl.uniform4f(L.uAnim, rate(P.rateWarp), rate(P.rateField), rate(P.rateCam), +P.phase);
    gl.uniform4f(L.uNoise, +P.roughness, +P.lacunarity, 0, 0);
    gl.uniform4f(L.uFold1, +P.foldOffX, +P.foldOffY, +P.foldOffZ, +P.foldInt);
    gl.uniform4f(L.uFold2, +P.foldParX, +P.foldParY, +P.foldParZ, +P.foldScale);
    gl.uniform4f(L.uFold3, +P.foldRotA, +P.foldRotB, +P.foldDrive, rate(P.foldDriveRate));

    var a = hex2rgb(P.colA), b = hex2rgb(P.colB), bg = hex2rgb(P.colBg);
    gl.uniform3f(L.uColA, a[0], a[1], a[2]);
    gl.uniform3f(L.uColB, b[0], b[1], b[2]);
    gl.uniform3f(L.uColBg, bg[0], bg[1], bg[2]);
  }

  /* ── post-process plumbing ───────────────────────────────────
     Scene renders into a float texture, bloom is built from it at quarter
     resolution, and the grade (tone map, gamma, vignette, dither…) happens in
     the composite. That order is the point: bloom has to see highlights that
     tone mapping would otherwise have already crushed. */
  var hdrOK = !!gl.getExtension("EXT_color_buffer_float");
  var postCache = {}, curPost = null, needPostRebuild = true;
  var brightProg = null, blurProg = null;
  var fboScene = null, fboA = null, fboB = null;
  var sceneTex = null, bloomA = null, bloomB = null, prevTex = null;
  var texW = 0, texH = 0;

  function postCfg() {
    return {
      bloom: !!P.bloom, rgbsplit: !!P.rgbsplit,
      trails: !!P.trails, trailMode: +P.trailMode,
      scanlines: !!P.scanlines, tonemap: !!P.tonemap,
      vignette: !!P.vignette, grain: !!P.grain,
      posterize: !!P.posterize, dither: !!P.dither
    };
  }

  /* Two passes whenever the scene must stay HDR (any effect), one otherwise. */
  function twoPass() {
    return S.postNeeded(postCfg());
  }

  function makeTex(w, h, float) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function attach(fb, tex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }

  function bloomSize(w, h) {
    return [Math.max(4, w >> 2), Math.max(4, h >> 2)];
  }

  function ensureTargets(w, h) {
    if (texW === w && texH === h && fboScene) return;
    [sceneTex, bloomA, bloomB, prevTex].forEach(function (t) { if (t) gl.deleteTexture(t); });
    if (!fboScene) { fboScene = gl.createFramebuffer(); fboA = gl.createFramebuffer(); fboB = gl.createFramebuffer(); }
    var bs = bloomSize(w, h);
    sceneTex = makeTex(w, h, hdrOK);      // without float targets the scene
    bloomA = makeTex(bs[0], bs[1], hdrOK); // clamps at 1.0 and bloom is meeker
    bloomB = makeTex(bs[0], bs[1], hdrOK);
    prevTex = makeTex(w, h, false);
    texW = w; texH = h;
    attach(fboScene, sceneTex);
    attach(fboA, bloomA);
    attach(fboB, bloomB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function clearTrails() {
    if (!prevTex) return;
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texW, texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  function linkFrag(src, names) {
    var vs = compile(gl.VERTEX_SHADER, S.VERT);
    var fs = compile(gl.FRAGMENT_SHADER, src);
    var pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs);
    gl.linkProgram(pr);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    var locs = {};
    names.forEach(function (n) { locs[n] = gl.getUniformLocation(pr, n); });
    return { prog: pr, locs: locs };
  }

  var POST_UNIFORMS = ["uScene", "uBloomTex", "uPrev", "uRes", "uTime", "uPeriod",
    "uBloom", "uFx2", "uPost", "uFx"];

  function postProgram() {
    var cfg = postCfg(), k = S.postKey(cfg);
    if (postCache[k]) return postCache[k];
    try {
      postCache[k] = linkFrag(S.buildPost(cfg), POST_UNIFORMS);
      if (!brightProg) brightProg = linkFrag(S.buildBright(), ["uScene", "uRes", "uBloom"]);
      if (!blurProg) blurProg = linkFrag(S.buildBlur(), ["uSrc", "uRes", "uDir", "uRadius"]);
      return postCache[k];
    } catch (e) {
      console.error("[glsl-lab] post shader failed", e);
      return null;
    }
  }

  function drawScene(w, h, time) {
    if (needRebuild) { cur = program(); needRebuild = false; }
    if (!cur) return false;
    gl.viewport(0, 0, w, h);
    setUniforms(cur, w, h, time);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  function fullscreen() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  function bindTex(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  function drawAt(w, h, time) {
    if (lost) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

    if (!twoPass()) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      drawScene(w, h, time);
      return;
    }

    ensureTargets(w, h);
    if (needPostRebuild) { curPost = postProgram(); needPostRebuild = false; }
    if (!curPost) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); drawScene(w, h, time); return; }

    // 1 — scene, linear and unclamped
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
    if (!drawScene(w, h, time)) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return; }

    // 2 — bright pass + blur, at quarter resolution
    if (P.bloom) {
      var bs = bloomSize(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      gl.viewport(0, 0, bs[0], bs[1]);
      gl.useProgram(brightProg.prog);
      bindTex(0, sceneTex, brightProg.locs.uScene);
      gl.uniform2f(brightProg.locs.uRes, bs[0], bs[1]);
      gl.uniform4f(brightProg.locs.uBloom, +P.bloomAmt, +P.bloomThresh, +P.bloomRadius, 0);
      fullscreen();

      gl.useProgram(blurProg.prog);
      gl.uniform2f(blurProg.locs.uRes, bs[0], bs[1]);
      gl.uniform1f(blurProg.locs.uRadius, Math.max(+P.bloomRadius, 0.5));
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
      bindTex(0, bloomA, blurProg.locs.uSrc);
      gl.uniform2f(blurProg.locs.uDir, 1, 0);
      fullscreen();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      bindTex(0, bloomB, blurProg.locs.uSrc);
      gl.uniform2f(blurProg.locs.uDir, 0, 1);
      fullscreen();
    }

    // 3 — composite: split, bloom, grade, scanlines, trails
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(curPost.prog);
    bindTex(0, sceneTex, curPost.locs.uScene);
    bindTex(1, bloomA, curPost.locs.uBloomTex);
    bindTex(2, prevTex, curPost.locs.uPrev);
    gl.uniform2f(curPost.locs.uRes, w, h);
    gl.uniform1f(curPost.locs.uTime, time);
    gl.uniform1f(curPost.locs.uPeriod, Math.max(+P.period, 0.1));
    gl.uniform4f(curPost.locs.uBloom, +P.bloomAmt, +P.bloomThresh, +P.bloomRadius, 0);
    gl.uniform4f(curPost.locs.uFx2, +P.rgbAmt, +P.trailAmt, +P.scanAmt, +P.scanSpacing);
    gl.uniform4f(curPost.locs.uPost, +P.exposure, +P.gamma, +P.contrast, +P.satPost);
    gl.uniform4f(curPost.locs.uFx, +P.cells, +P.levels, +P.vigAmt, +P.grainAmt);
    fullscreen();

    if (P.trails) {                       // keep the composite for the next frame
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, prevTex);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  /* ── time ──────────────────────────────────────────────────── */
  var animT = 0, lastNow = performance.now(), paused = false;

  function shaderTime() {
    var period = Math.max(+P.period, 0.1);
    return P.loop ? (animT % period + period) % period : animT;
  }

  /* ── render loop ───────────────────────────────────────────────
     These shaders cost whatever the user asks them to cost, so the frame
     budget is held by the render scale rather than by the parameters: when
     frames get slow the buffer shrinks, when there is headroom it grows back
     (never past the display's own pixel ratio). "Render scale: auto" in the
     panel is this; a fixed value pins it. */
  var busy = false;         // true while exporting — loop stands down
  var fpsAcc = 0, fpsN = 0, fpsShown = 60;
  var SCALES = [0.5, 0.7, 1.0, 1.4, 2.0];
  var scaleIdx = 2;         // start at 1 CSS pixel per pixel, not at 2× retina

  function maxScaleIdx() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var i = SCALES.length - 1;
    while (i > 0 && SCALES[i] > dpr) i--;
    return i;
  }

  function renderScale() {
    if (P.scale !== "auto") return Math.min(+P.scale, 2);
    return SCALES[Math.min(scaleIdx, maxScaleIdx())];
  }

  function tick(now) {
    requestAnimationFrame(tick);
    var dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    if (busy || lost) return;
    if (!paused) animT += dt * (+P.speed);

    var sc = renderScale();
    var w = Math.max(2, Math.floor(canvas.clientWidth * sc));
    var h = Math.max(2, Math.floor(canvas.clientHeight * sc));
    drawAt(w, h, shaderTime());

    fpsAcc += dt * 1000; fpsN++;
    if (fpsN >= 20) {
      var frameMs = fpsAcc / fpsN;
      fpsShown = Math.round(1000 / Math.max(frameMs, 0.01));
      fpsAcc = 0; fpsN = 0;

      if (P.scale === "auto") {
        if (frameMs > 42 && scaleIdx > 0) scaleIdx--;              // below ~24 fps
        else if (frameMs < 19 && scaleIdx < maxScaleIdx()) scaleIdx++;
      }
      if (errEl.style.display !== "block") {
        status.textContent = w + "×" + h
          + (sc !== 1 ? " @" + sc + "×" : "")
          + " · ~" + Math.min(fpsShown, 999) + " fps"
          + (P.loop ? " · loop " + (+P.period) + "s" : "");
      }
    }
  }

  /* ── PNG ───────────────────────────────────────────────────── */
  function renderStill(size) {
    var ar = aspectRatio();
    var w = Math.round(ar >= 1 ? size : size * ar);
    var h = Math.round(ar >= 1 ? size / ar : size);
    busy = true;
    drawAt(w, h, shaderTime());
    var url = canvas.toDataURL("image/png");
    busy = false;
    return url;
  }
  /* Save via a blob, not a data URL: Chrome refuses multi-megabyte
     data-URL downloads, which a 4K still easily is. */
  function savePNG() {
    var size = +P.pngSize || 2048;
    var ar = aspectRatio();
    var w = Math.round(ar >= 1 ? size : size * ar);
    var h = Math.round(ar >= 1 ? size / ar : size);
    busy = true;
    drawAt(w, h, shaderTime());
    canvas.toBlob(function (blob) {
      busy = false;
      lastNow = performance.now();
      if (!blob) { status.textContent = "PNG export failed"; return; }
      download(blob, "glsl-lab-" + Date.now() + ".png");
      status.textContent = "PNG " + w + "×" + h;
    }, "image/png");
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  /* ── clip export ───────────────────────────────────────────── */
  var overlay = $("recOverlay");

  function clipDims() {
    var ar = aspectRatio(), s = +P.recSize || 1080;
    var w = Math.round(ar >= 1 ? s : s * ar);
    var h = Math.round(ar >= 1 ? s / ar : s);
    // H.264 wants even dimensions
    return [w - (w % 2), h - (h % 2)];
  }

  /* Yield to the browser between encoded frames. MessageChannel keeps
     working in a hidden tab, where rAF is paused and timers are clamped —
     so an export survives the user switching tabs. */
  function yieldToBrowser() {
    return new Promise(function (res) {
      var ch = new MessageChannel();
      ch.port1.onmessage = function () { ch.port1.close(); res(); };
      ch.port2.postMessage(0);
    });
  }

  function setOverlay(txt) {
    overlay.textContent = txt || "";
    overlay.classList.toggle("show", !!txt);
  }

  async function exportClip() {
    var dims = clipDims(), w = dims[0], h = dims[1];
    var fps = +P.recFps || 30, secs = +P.recSec || 8;
    var frames = Math.max(1, Math.round(fps * secs));
    // A seamless clip walks exactly one loop period (or a whole number of them).
    var period = Math.max(+P.period, 0.1);
    var span = P.loop ? period * Math.max(1, Math.round(secs / period)) : secs * (+P.speed || 1);

    busy = true;
    var btn = $("btnRec");
    btn.classList.add("recording"); btn.disabled = true;
    var blob = null, note = "";

    try {
      if (window.VideoEncoder && window.Mp4Muxer) {
        blob = await encodeWebCodecs(w, h, fps, frames, span);
        note = "MP4";
      }
      if (!blob) {
        blob = await encodeMediaRecorder(w, h, fps, frames, span);
        note = /mp4/.test(blob.type) ? "MP4" : "WebM";
      }
    } catch (e) {
      console.error("[glsl-lab] clip export failed", e);
      setOverlay("");
      alert("Clip export failed: " + (e && e.message ? e.message : e));
    }

    btn.classList.remove("recording"); btn.disabled = false;
    btn.textContent = "Clip";
    setOverlay("");
    busy = false;
    lastNow = performance.now();

    if (!blob) return;
    var ext = /mp4/.test(blob.type) ? "mp4" : "webm";
    download(blob, "glsl-lab-" + Date.now() + "." + ext);
    status.textContent = note + " " + w + "×" + h + " · " + frames + " frames";

    if (P.recShare && window.PixelShare) {
      window.PixelShare.share({
        blob: blob,
        text: shareText(),
        url: "https://pixel-on-kaspa.fyi/glsl-lab.html",
        hashtags: ["creativecoding", "glsl"],
        filenamePrefix: "glsl-lab-pixel-on-kaspa"
      });
    }
  }

  /* Frame-exact path: render each frame, hand it to the H.264 encoder. */
  async function encodeWebCodecs(w, h, fps, frames, span) {
    var codecs = ["avc1.640034", "avc1.4d0034", "avc1.42E01E"];
    var conf = null;
    for (var i = 0; i < codecs.length; i++) {
      var c = { codec: codecs[i], width: w, height: h, bitrate: 14000000, framerate: fps };
      try {
        var sup = await VideoEncoder.isConfigSupported(c);
        if (sup && sup.supported) { conf = c; break; }
      } catch (e) {}
    }
    if (!conf) return null;

    var target = new Mp4Muxer.ArrayBufferTarget();
    var muxer = new Mp4Muxer.Muxer({
      target: target,
      video: { codec: "avc", width: w, height: h },
      fastStart: "in-memory"
    });
    var enc = new VideoEncoder({
      output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); },
      error: function (e) { console.error("[glsl-lab] encoder", e); }
    });
    enc.configure(conf);

    var t0 = shaderTime();
    for (var i = 0; i < frames; i++) {
      var time = t0 + span * (i / frames);
      drawAt(w, h, time);
      var frame = new VideoFrame(canvas, {
        timestamp: Math.round(i * 1e6 / fps),
        duration: Math.round(1e6 / fps)
      });
      enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      if (enc.encodeQueueSize > 8 || i % 6 === 0) {
        setOverlay("ENCODING " + Math.round((i + 1) / frames * 100) + "%");
        await yieldToBrowser();
      }
    }
    await enc.flush();
    enc.close();
    muxer.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  }

  /* Fallback: pump a captureStream one frame at a time, paced to real time. */
  async function encodeMediaRecorder(w, h, fps, frames, span) {
    var off = document.createElement("canvas");
    off.width = w; off.height = h;
    var ctx = off.getContext("2d");
    var stream = off.captureStream(0);
    var track = stream.getVideoTracks()[0];
    var mimes = ["video/mp4;codecs=avc1.42E01E", "video/webm;codecs=vp9", "video/webm"];
    var mime = mimes.filter(function (m) {
      return window.MediaRecorder && MediaRecorder.isTypeSupported(m);
    })[0] || "";
    var rec = new MediaRecorder(stream, mime
      ? { mimeType: mime, videoBitsPerSecond: 12000000 }
      : { videoBitsPerSecond: 12000000 });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    var done = new Promise(function (res) { rec.onstop = res; });
    rec.start();

    var t0 = shaderTime(), start = performance.now();
    for (var i = 0; i < frames; i++) {
      drawAt(w, h, t0 + span * (i / frames));
      ctx.drawImage(canvas, 0, 0, w, h);
      if (track.requestFrame) track.requestFrame();
      else if (stream.requestFrame) stream.requestFrame();
      setOverlay("RECORDING " + Math.round((i + 1) / frames * 100) + "%");
      // MediaRecorder timestamps by wall clock, so this path has to run in real time
      var due = start + (i + 1) * 1000 / fps;
      var wait = due - performance.now();
      if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
      else await yieldToBrowser();
    }
    rec.stop();
    await done;
    return new Blob(chunks, { type: rec.mimeType || mime || "video/webm" });
  }

  /* Mean luminance of a tiny render — used to reject dud dice rolls. */
  var probeBuf = new Uint8Array(64 * 64 * 4);
  function probeLuma() {
    drawAt(64, 64, shaderTime());
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, probeBuf);
    var s = 0;
    for (var i = 0; i < probeBuf.length; i += 4) s += probeBuf[i] + probeBuf[i + 1] + probeBuf[i + 2];
    return s / (64 * 64 * 3);
  }

  /* ── dice: random module stack, biased by complexity ───────── */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function snap(it, v) { return Math.max(it.min, Math.min(it.max, Math.round(v / it.step) * it.step)); }
  function item(id) { return ITEMS.filter(function (i) { return i.id === id; })[0]; }
  function setR(id, v) { var it = item(id); if (it) P[id] = snap(it, v); }

  function dice() {
    // A stack can easily land on black or blown-out white; look at the result
    // and re-roll rather than handing the user an empty canvas.
    var best = null, bestScore = -1;
    for (var attempt = 0; attempt < 6; attempt++) {
      roll();
      var l = probeLuma();
      var score = (l < 4 || l > 248) ? 0 : Math.min(l, 120) / 120;
      if (score > bestScore) { bestScore = score; best = Object.assign({}, P); }
      if (score > 0.25) break;
    }
    if (bestScore <= 0.25 && best) { P = best; needRebuild = true; }
    animT = 0;
    persistNow(); syncUI();
  }

  function roll() {
    var cx = (+$("complexity").value) / 100;          // 0 = simple, 1 = dense
    var keep = { aspect: P.aspect, pngSize: P.pngSize, recSize: P.recSize,
                 recFps: P.recFps, recSec: P.recSec, recShare: P.recShare, loop: P.loop };
    P = Object.assign({}, DEF, keep);                  // format/export stay the user's choice
    P.seed = Math.floor(rnd(0, 1000));
    P.mode = Math.random() < 0.25 + 0.35 * cx ? "3d" : "2d";
    P.pal = pick([1, 1, 1, 2, 3, 0]);
    P.tint = pick([0, 2, 2, 1]);
    P.noiseShape = pick([0, 0, 1, 1, 2]);
    // the fold parameters are the form, so give them a proper shake
    P.foldIt2 = Math.round(rnd(6, 18));
    setR("foldOffX", rnd(-1.6, 1.6));
    setR("foldOffY", rnd(-1.0, 5.5));
    setR("foldOffZ", rnd(-1.6, 1.6));
    setR("foldParX", rnd(0.4, 4.5));
    setR("foldParY", rnd(0.4, 5.0));
    setR("foldParZ", rnd(0.4, 4.5));
    setR("foldInt", rnd(1.5, 9));
    setR("foldScale", rnd(0.6, 3.2));
    P.foldRot = Math.random() < 0.5;
    setR("foldRotA", rnd(-1.6, 1.6));
    setR("foldRotB", rnd(-1.6, 1.6));
    P.foldDrive = Math.random() < 0.4 ? +rnd(0.05, 0.6).toFixed(3) : 0;
    setR("roughness", rnd(0.3, 0.75));
    setR("lacunarity", rnd(1.6, 3.2));
    P.palHue = +rnd(-1, 1).toFixed(3);
    P.palSat = +rnd(0.5, 1.2).toFixed(2);
    P.palSpread = +rnd(0.6, 1.0 + 3.0 * cx).toFixed(2);
    P.palOff = +rnd(-1, 1).toFixed(2);
    P.colA = pick(["#49eacb", "#f4f1e8", "#ff5c7a", "#ffd166", "#7ae582", "#0b0d12"]);
    P.colB = pick(["#0b0d12", "#12203a", "#2b1055", "#e8e4d8", "#003b46"]);
    P.colBg = pick(["#05070a", "#030407", "#0a0512", "#000000"]);
    P.exposure = +rnd(0.8, 2.2).toFixed(2);
    P.tonemap = Math.random() < 0.8;
    P.contrast = +rnd(0.9, 1.4).toFixed(2);
    P.period = pick([4, 6, 8, 8, 12, 16]);
    P.rateWarp = pick([0, 1, 1, 2]);
    P.rateField = pick([0, 1, 1, 2]);
    P.rateCam = pick([0, 1, 1, 2]);

    if (P.mode === "2d") {
      P.domain = cx < 0.3 ? pick([0, 0, 2]) : pick([0, 1, 2, 3, 4, 5]);
      P.sym = Math.floor(rnd(3, 4 + 12 * cx));
      P.tile = Math.floor(rnd(1, 3 + 8 * cx));
      P.twist = +rnd(-2.5, 2.5).toFixed(2);
      P.zoom = +rnd(0.6, 1.8).toFixed(2);
      P.rot = +rnd(-0.5, 0.5).toFixed(3);
      P.warp = Math.random() < 0.25 + 0.6 * cx ? pick([1, 2, 3, 4, 5, 6, 7, 7]) : 0;
      P.warpIt = Math.max(1, Math.round(rnd(1, 1 + 4 * cx)));
      setR("warpAmt", rnd(0.1, 0.3 + 0.9 * cx));
      setR("warpFreq", rnd(0.4, 1.5 + 3 * cx));
      P.field = cx < 0.3 ? pick([0, 0, 2, 7, 8]) : pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9]);
      P.shape = Math.floor(rnd(0, 6));
      P.octaves = Math.max(1, Math.round(rnd(2, 3 + 4 * cx)));
      P.gratings = Math.max(1, Math.round(rnd(2, 3 + 6 * cx)));
      P.juliaIt = Math.round(rnd(8, 16 + 60 * cx));
      setR("fscale", rnd(0.8, 2 + 4 * cx));
      setR("fa", rnd(0.1, 1.2));
      setR("fb", rnd(0.1, 1.2));
      setR("fc", rnd(0.1, 1.0));
      P.shade = pick([0, 1, 1, 2, 3, 4, 5]);
      setR("shFreq", rnd(1, 3 + 14 * cx));
      setR("shThick", rnd(0.08, 0.45));
      setR("shSoft", rnd(0.003, 0.08));
      P.shSteps = Math.round(rnd(2, 12));
      P.mirrorX = Math.random() < 0.15;
      P.mirrorY = Math.random() < 0.12;
    } else {
      P.sdf = cx < 0.3 ? pick([0, 1, 2, 3]) : pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 8]);
      P.march = Math.random() < 0.55 ? 1 : 0;
      P.marchSteps = Math.round(rnd(60, 80 + 90 * cx) / 5) * 5;
      P.warp3 = Math.random() < 0.3 + 0.5 * cx ? pick([1, 2, 3, 4, 5]) : 0;
      P.warpIt = Math.max(1, Math.round(rnd(1, 1 + 3 * cx)));
      setR("warpAmt", rnd(0.1, 0.25 + 0.7 * cx));
      setR("warpFreq", rnd(0.3, 1.2 + 2 * cx));
      P.octaves = Math.max(1, Math.round(rnd(2, 3 + 2 * cx)));
      // the bulb pays for a pow() and two trig calls per fold — keep it shorter
      P.foldIt = Math.max(1, Math.round(rnd(3, (P.sdf === 5 ? 4 : 5) + 6 * cx)));
      setR("sSize", rnd(0.25, 1.1));
      setR("sFreq", rnd(0.4, 0.8 + 2 * cx));
      setR("sPow", rnd(3, 12));
      setR("sK", rnd(0.9, 1.4));
      setR("sBox", Math.random() < 0.3 ? rnd(-2.6, -1.6) : rnd(1.8, 2.9));
      setR("sThick", rnd(0.08, 0.7));
      P.rep3 = Math.random() < 0.3 + 0.3 * cx;
    P.bound = ([3, 6, 7].indexOf(P.sdf) >= 0 || P.rep3)
      ? pick([1, 1, 2]) : pick([0, 0, 0, 1, 2]);
    setR("boundR", rnd(0.8, 2.2));
      setR("srep", rnd(1.0, 3.5));
      setR("density", rnd(0.5, 1.6));
    setR("absorb", rnd(0.15, 0.9));
    setR("falloff", rnd(8, 120));
      setR("stepScale", (P.warp3 === 5 || P.sdf === 8) ? rnd(0.2, 0.5) : rnd(0.5, 0.95));
      if (P.sdf === 8) setR("falloff", rnd(400, 2500));
      setR("far", rnd(6, 20));
      setR("camDist", rnd(1.6, 4.0));
      setR("camPitch", rnd(-0.2, 0.2));
      setR("camYaw", rnd(-0.5, 0.5));
      P.shade = pick([1, 2, 2, 3, 4]);
      setR("shFreq", P.march === 1 ? rnd(0.6, 2.5) : rnd(1, 4 + 10 * cx));
      setR("shThick", rnd(0, 0.5));
    }

    if (Math.random() < 0.18) { P.pixelate = true; P.cells = Math.round(rnd(48, 220)); }
    if (Math.random() < 0.18) { P.posterize = true; P.levels = Math.round(rnd(3, 8)); P.dither = Math.random() < 0.7; }
    if (Math.random() < 0.25) { P.vignette = true; setR("vigAmt", rnd(0.2, 0.9)); }
    if (Math.random() < 0.12) { P.grain = true; setR("grainAmt", rnd(0.02, 0.12)); }
    if (Math.random() < 0.35) {
      P.bloom = true;
      setR("bloomAmt", rnd(0.6, 2.2));
      setR("bloomThresh", rnd(0.3, 1.4));
      setR("bloomRadius", rnd(1.5, 7));
    }
    if (Math.random() < 0.12) { P.rgbsplit = true; setR("rgbAmt", rnd(0.6, 3.0)); }
    if (Math.random() < 0.10) {
      P.scanlines = true; setR("scanAmt", rnd(0.2, 0.6)); setR("scanSpacing", rnd(3, 10));
    }

    needRebuild = true;
  }

  /* ── share text ────────────────────────────────────────────── */
  function shareText() {
    var motif = is3d(P) ? S.SDFS[+P.sdf] + " · " + S.MARCHES[+P.march] : S.FIELDS[+P.field];
    return "Built this in the Pixel on Kaspa art lab — GLSL Lab, motif: " + motif + ". Make your own:";
  }

  /* ── wiring ────────────────────────────────────────────────── */
  function wire() {
    var presetSel = $("presets");
    PRESETS.forEach(function (pr, i) {
      var o = document.createElement("option");
      o.value = String(i); o.textContent = pr[0];
      presetSel.appendChild(o);
    });
    presetSel.addEventListener("change", function () {
      var i = +presetSel.value;
      if (!PRESETS[i]) return;
      var keep = { aspect: P.aspect, pngSize: P.pngSize, recSize: P.recSize, recFps: P.recFps, recSec: P.recSec };
      applyPatch(Object.assign({}, PRESETS[i][1], keep));
      animT = 0;
    });

    $("btnDice").addEventListener("click", dice);

    $("btnPause").addEventListener("click", function () {
      paused = !paused;
      $("btnPause").textContent = paused ? "Play" : "Pause";
      $("btnPause").classList.toggle("btnPrimary", !paused);
    });

    $("btnPng").addEventListener("click", savePNG);
    $("btnRec").addEventListener("click", function () { if (!busy) exportClip(); });

    $("btnReset").addEventListener("click", function () {
      applyPatch({ aspect: P.aspect });
      animT = 0;
    });

    $("btnCopy").addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(location.href);
        hint.textContent = "— link copied";
      } catch (e) { hint.textContent = "— copy failed"; }
      setTimeout(function () { hint.textContent = "— state lives in the URL"; }, 1400);
    });

    $("btnFull").addEventListener("click", function () {
      if (!document.fullscreenElement) wrap.requestFullscreen();
      else document.exitFullscreen();
    });
    document.addEventListener("fullscreenchange", function () {
      var full = document.fullscreenElement === wrap;
      wrap.classList.toggle("isFull", full);
      if (!full) applyAspect();
      else { wrap.style.width = ""; wrap.style.height = ""; }
    });

    $("btnCode").addEventListener("click", function () {
      var cfg = cfgOf();
      var win = window.open("", "_blank");
      if (!win) return;
      var pre = win.document.createElement("pre");
      pre.style.cssText = "background:#05070a;color:#d8f5ee;font:12px/1.5 ui-monospace,monospace;padding:20px;white-space:pre-wrap";
      pre.textContent = S.build(cfg);
      win.document.title = "GLSL Lab — compiled shader";
      win.document.body.style.margin = "0";
      win.document.body.appendChild(pre);
    });

    if (window.PixelShare) {
      window.PixelShare.mount({
        buttonId: "btnShareX",
        getDataURL: function () { return renderStill(2048); },
        text: shareText(),
        url: "https://pixel-on-kaspa.fyi/glsl-lab.html",
        hashtags: ["creativecoding", "glsl"],
        filenamePrefix: "glsl-lab-pixel-on-kaspa"
      });
    }

    if (window.PixelGallery) {
      window.PixelGallery.registerLab({
        id: "glsl-lab",
        name: "GLSL Lab",
        labUrl: "/glsl-lab.html",
        title: "GLSL Lab",
        publishButtonId: "btnPublish",
        renderThumbnail: function () { return renderStill(1024); },
        captureState: function () { return Object.assign({}, P); },
        restoreState: function (st) { applyPatch(st || {}); }
      });
    }

    window.addEventListener("resize", applyAspect);
    window.addEventListener("keydown", function (e) {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); $("btnPause").click(); }
      if (e.key === "r" || e.key === "R") dice();
      if (e.key === "p" || e.key === "P") savePNG();
    });

    /* Small debug/automation surface: render a frame on demand, read or
       replace the patch. Handy for tests and for driving the lab headlessly. */
    window.GLSLLabApp = {
      render: function (size) { return renderStill(size || 512); },
      patch: function (obj) { if (obj) applyPatch(obj); return Object.assign({}, P); },
      preset: function (i) {
        if (!PRESETS[i]) return null;
        applyPatch(Object.assign({}, PRESETS[i][1], { aspect: P.aspect }));
        animT = 0;
        return PRESETS[i][0];
      },
      presets: PRESETS.map(function (p) { return p[0]; })
    };

    // exposed for a quick sanity sweep from the console
    window.__glslLabSweep = function () {
      var fails = [];
      function tryCfg(cfg, note) {
        var src = S.build(cfg);
        try {
          var sh = compile(gl.FRAGMENT_SHADER, src);
          gl.deleteShader(sh);
        } catch (e) { fails.push([note, String(e.message || e).split("\n")[0]]); }
      }
      var base2 = cfgOf(); base2.mode = "2d";
      S.DOMAINS.forEach(function (_, d) { var c = Object.assign({}, base2, { domain: d }); tryCfg(c, "domain " + d); });
      S.WARPS2.forEach(function (_, x) { var c = Object.assign({}, base2, { warp: x }); tryCfg(c, "warp " + x); });
      S.FIELDS.forEach(function (_, f) {
        S.SHAPES.forEach(function (_s, sp) {
          if (f !== 0 && sp > 0) return;
          tryCfg(Object.assign({}, base2, { field: f, shape: sp }), "field " + f + " shape " + sp);
        });
      });
      S.SHADES.forEach(function (_, s) { tryCfg(Object.assign({}, base2, { shade: s }), "shade " + s); });
      S.PALS.forEach(function (_, s) { tryCfg(Object.assign({}, base2, { pal: s }), "pal " + s); });
      var base3 = Object.assign({}, cfgOf(), { mode: "3d" });
      S.SDFS.forEach(function (_, s) {
        [0, 1].forEach(function (m) {
          S.WARPS3.forEach(function (_w, x) {
            tryCfg(Object.assign({}, base3, { sdf: s, march: m, warp3: x }), "sdf " + s + " march " + m + " warp3 " + x);
          });
        });
      });
      [["pixelate"], ["posterize", "dither"], ["vignette"], ["grain"], ["mirrorX"], ["mirrorY"]].forEach(function (keys) {
        var c = Object.assign({}, base2);
        keys.forEach(function (k) { c[k] = true; });
        tryCfg(c, "fx " + keys.join("+"));
      });
      console.log(fails.length ? fails : "all shader variants compile ✓");
      return fails;
    };
  }

  /* ── boot ──────────────────────────────────────────────────── */
  restore();
  buildUI();
  wire();
  syncUI();
  persistNow();
  applyAspect();
  requestAnimationFrame(tick);
})();
