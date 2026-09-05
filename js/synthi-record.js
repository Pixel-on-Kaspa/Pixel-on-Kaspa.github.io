/* ─────────────────────────────────────────────────────────────
   SynthiRecord — reusable "record what you play" for the SYNTHI synths.

   Taps the final post-limiter node of a live Web Audio graph via a
   PARALLEL MediaStreamDestination (fan-out), so what reaches the speakers
   is never altered. Records up to N seconds to WebM/Opus, then shows a
   floating clip bar with inline playback, a direct Save (WebM download),
   a lossless WAV master (parallel PCM tap), and Share (via PixelShare → X).
   Silently snapshots a provenance blob so a remix/gallery layer can be
   turned on later without re-recording.

   Free tier = 15s; unlimited length is planned behind membership.

   Usage:
     var rec = SynthiRecord.mount({
       container:   el|id,          // where the REC button goes (inline)
       getContext:  () => AudioContext|null,
       getTap:      () => AudioNode|null,   // final post-limiter/ceiling node
       ensureAudio: () => {},               // optional: start audio on REC
       getPatch:    () => string|null,      // optional: provenance snapshot
       engineVersion: 'aks-2026.07',
       maxSec: 15,                          // number OR () => seconds (re-read per take)
       syncStart: () => Promise,            // optional: resolve when it's time to roll
       share: { text, url, hashtags, filenamePrefix }
     });
     rec.enable(true|false);   // toggle the REC button with audio on/off
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var STYLE_ID = "synthi-rec-style";
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".srec{display:inline-flex;align-items:center;gap:8px;vertical-align:middle;" +
        "font:600 11px/1 system-ui,-apple-system,'Segoe UI',sans-serif}" +
      ".srec-btn{cursor:pointer;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.05);" +
        "color:inherit;border-radius:6px;padding:6px 10px;font:inherit;letter-spacing:.02em}" +
      ".srec-btn:hover{background:rgba(255,255,255,.12)}" +
      ".srec-btn[disabled]{opacity:.4;cursor:not-allowed}" +
      ".srec-btn.rec{border-color:#e53935;background:rgba(229,57,53,.16);color:#e53935;" +
        "animation:srecPulse 1s ease-in-out infinite}" +
      "@keyframes srecPulse{0%,100%{opacity:1}50%{opacity:.55}}" +
      ".srec-time{min-width:28px;text-align:center;opacity:.85}" +
      ".srec-result{display:none;position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
        "z-index:99999;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;" +
        "border:1px solid rgba(255,255,255,.14);background:rgba(12,12,16,.92);color:#e8eef6;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.6);font:600 11px/1 system-ui,-apple-system,sans-serif;max-width:92vw}" +
      ".srec-result.on{display:flex}" +
      ".srec-result audio{height:32px;max-width:300px}" +
      ".srec-lbl{letter-spacing:.14em;text-transform:uppercase;font-weight:800;opacity:.8}";
    document.head.appendChild(s);
  }

  function elById(x) { return typeof x === "string" ? document.getElementById(x) : x; }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  // ── inline AudioWorklet: captures PCM off the main thread (no dropout risk),
  //    loaded from a Blob so there's no separate module file to deploy ──
  var PCM_WORKLET_CODE =
    "class PcmCapture extends AudioWorkletProcessor{" +
      "process(inputs){var input=inputs[0];" +
        "if(input&&input.length){var chans=[],b=[];" +
          "for(var c=0;c<input.length;c++){var cp=input[c]?input[c].slice():new Float32Array(128);chans.push(cp);b.push(cp.buffer);}" +
          "this.port.postMessage(chans,b);}" +
        "return true;}}" +
    "registerProcessor('synthi-pcm-capture',PcmCapture);";
  var pcmWorkletUrl = null;
  function workletUrl() {
    if (!pcmWorkletUrl) pcmWorkletUrl = URL.createObjectURL(new Blob([PCM_WORKLET_CODE], { type: "application/javascript" }));
    return pcmWorkletUrl;
  }
  function ensureWorklet(ctx) {
    if (!ctx || !ctx.audioWorklet) return Promise.reject(new Error("no audioWorklet"));
    if (!ctx.__synthiPcmWorklet) ctx.__synthiPcmWorklet = ctx.audioWorklet.addModule(workletUrl());
    return ctx.__synthiPcmWorklet;
  }

  function mount(cfg) {
    injectStyle();
    var container = elById(cfg.container);
    if (!container) return { enable: function () {} };

    // maxSec may be a NUMBER or a FUNCTION — a function is re-read on every REC,
    // so a synth can make the clip length follow its own loop (see SOS·DJ).
    var maxSecCfg = cfg.maxSec != null ? cfg.maxSec : 15;   // TODO: unlimited behind membership
    function maxSecNow() {
      var v = typeof maxSecCfg === "function" ? maxSecCfg() : maxSecCfg;
      v = +v;
      if (!isFinite(v) || v <= 0) v = 15;
      return Math.min(120, Math.max(1, v));
    }
    function fmtSec(v) { return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + "s"; }
    function syncTitle() { btn.title = "Record a " + fmtSec(maxSecNow()) + " clip of what you play"; }
    var engineVersion = cfg.engineVersion || "unknown";
    var share = cfg.share || {};

    // ── inline control (REC + countdown) ──
    var wrap = mk("span", "srec");
    var btn = mk("button", "srec-btn", "● REC"); btn.type = "button"; btn.disabled = true;
    var timeEl = mk("span", "srec-time", fmtSec(maxSecNow()));
    syncTitle();
    wrap.appendChild(btn); wrap.appendChild(timeEl);
    container.appendChild(wrap);

    // ── floating clip bar ──
    var result = mk("div", "srec-result");
    var audio = mk("audio"); audio.controls = true; audio.preload = "metadata";
    var saveBtn = mk("button", "srec-btn", "↓ Save"); saveBtn.type = "button"; saveBtn.title = "Save the WebM/Opus clip";
    var wavBtn = mk("button", "srec-btn", "↓ WAV"); wavBtn.type = "button"; wavBtn.title = "Save a lossless WAV master";
    var shareBtn = mk("button", "srec-btn", "Share ↗"); shareBtn.type = "button";
    result.appendChild(mk("span", "srec-lbl", "Clip"));
    result.appendChild(audio); result.appendChild(saveBtn); result.appendChild(wavBtn); result.appendChild(shareBtn);
    document.body.appendChild(result);

    var mediaRecorder = null, chunks = [], countdown = null, timeout = null, msDest = null, tapNode = null, arming = false;
    var lastBlob = null, lastUrl = null, lastTs = 0, lastPatch = null;
    var workletNode = null, silentGain = null, pcmBuffers = [], pcmRate = 44100, recToken = 0;

    function supportedMime() {
      var c = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      for (var i = 0; i < c.length; i++) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i]; }
      return "";
    }
    function filename() {
      return (share.filenamePrefix || "synthi") + "-" + (lastTs || Date.now()) +
             (lastBlob && /ogg/.test(lastBlob.type) ? ".ogg" : ".webm");
    }
    function setRecording(on) {
      if (on) { btn.textContent = "■ STOP"; btn.classList.add("rec"); result.classList.remove("on"); }
      else { btn.textContent = "● REC"; btn.classList.remove("rec"); timeEl.textContent = fmtSec(maxSecNow()); syncTitle(); }
    }
    function clearTimers() {
      if (countdown) { clearInterval(countdown); countdown = null; }
      if (timeout) { clearTimeout(timeout); timeout = null; }
    }
    function cleanupTap() {
      try { if (tapNode && msDest) tapNode.disconnect(msDest); } catch (e) {}
      try { if (tapNode && workletNode) tapNode.disconnect(workletNode); } catch (e) {}
      try { if (workletNode) { workletNode.port.onmessage = null; workletNode.disconnect(); } } catch (e) {}
      try { if (silentGain) silentGain.disconnect(); } catch (e) {}
      msDest = null; tapNode = null; workletNode = null; silentGain = null;
    }

    async function start() {
      if (cfg.ensureAudio) { try { cfg.ensureAudio(); } catch (e) {} }
      var ctx = cfg.getContext && cfg.getContext();
      tapNode = cfg.getTap && cfg.getTap();
      if (!ctx || !tapNode) return;
      var myToken = ++recToken;
      pcmBuffers = []; pcmRate = ctx.sampleRate || 44100;
      // ── WAV master via AudioWorklet (off main thread); best-effort, WebM below is the fallback ──
      try {
        await ensureWorklet(ctx);
        if (recToken !== myToken || !tapNode) return;   // stopped/restarted while the module loaded
        workletNode = new AudioWorkletNode(ctx, "synthi-pcm-capture");
        workletNode.port.onmessage = function (e) {
          var chans = e.data, c;
          if (!pcmBuffers.length) for (c = 0; c < chans.length; c++) pcmBuffers.push([]);
          for (c = 0; c < chans.length && c < pcmBuffers.length; c++) pcmBuffers[c].push(chans[c]);
        };
        silentGain = ctx.createGain(); silentGain.gain.value = 0;
        tapNode.connect(workletNode);
        workletNode.connect(silentGain);
        silentGain.connect(ctx.destination);   // worklet needs a sink; gain 0 → adds silence, never touches the mix
      } catch (e) { /* no AudioWorklet in this browser — WebM still records, WAV button will report it */ }
      try {
        msDest = ctx.createMediaStreamDestination();
        tapNode.connect(msDest);   // parallel fan-out — does NOT alter the speaker path
      } catch (e) { cleanupTap(); return; }
      var mime = supportedMime();
      try {
        mediaRecorder = mime
          ? new MediaRecorder(msDest.stream, { mimeType: mime, audioBitsPerSecond: 128000 })
          : new MediaRecorder(msDest.stream);
      } catch (e) { alert("Recording is not supported in this browser."); cleanupTap(); return; }
      chunks = [];
      mediaRecorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = function () {
        clearTimers();
        var type = mediaRecorder.mimeType || mime || "audio/webm";
        lastBlob = new Blob(chunks, { type: type });
        lastTs = Date.now();
        try { lastPatch = cfg.getPatch ? cfg.getPatch() : null; } catch (e) { lastPatch = null; }
        cleanupTap();
        setRecording(false);
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = URL.createObjectURL(lastBlob);
        audio.src = lastUrl;
        result.classList.add("on");
      };
      // ARM: hold until the host says it is musically time to roll (loop downbeat),
      // so the clip starts on beat 1 and can loop seamlessly.
      if (cfg.syncStart) {
        arming = true;
        btn.textContent = "◌ ARM"; btn.classList.add("rec"); timeEl.textContent = "…";
        try { await cfg.syncStart(); } catch (e) {}
        arming = false;
        if (recToken !== myToken) { cleanupTap(); setRecording(false); return; }
        pcmBuffers = [];                       // drop the pre-roll from the WAV master
      }
      var limit = maxSecNow();
      var started = Date.now();
      mediaRecorder.start();
      setRecording(true);
      countdown = setInterval(function () {
        var left = Math.max(0, limit - (Date.now() - started) / 1000);
        timeEl.textContent = (left >= 10 ? Math.ceil(left) : Math.ceil(left * 10) / 10) + "s";
      }, 250);
      timeout = setTimeout(stop, limit * 1000);
    }
    function stop() {
      recToken++;                              // invalidates an in-flight ARM / worklet load
      arming = false;
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
      else { cleanupTap(); setRecording(false); }
      clearTimers();
    }
    function isRecording() { return mediaRecorder && mediaRecorder.state === "recording"; }

    btn.addEventListener("click", function () { (isRecording() || arming) ? stop() : start(); });
    saveBtn.addEventListener("click", function () {
      if (!lastBlob) return;
      var u = lastUrl || URL.createObjectURL(lastBlob);
      var a = document.createElement("a");
      a.href = u; a.download = filename();
      document.body.appendChild(a); a.click(); a.remove();
    });
    function wavFilename() { return (share.filenamePrefix || "synthi") + "-" + (lastTs || Date.now()) + ".wav"; }
    function flatten(list) {
      var len = 0, i; for (i = 0; i < list.length; i++) len += list[i].length;
      var out = new Float32Array(len), o = 0;
      for (i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
      return out;
    }
    function encodeWav(chans, rate) {
      var numCh = chans.length, len = chans[0] ? chans[0].length : 0;
      var view = new DataView(new ArrayBuffer(44 + len * numCh * 2));
      function str(off, s) { for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
      str(0, "RIFF"); view.setUint32(4, 36 + len * numCh * 2, true); str(8, "WAVE");
      str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
      str(36, "data"); view.setUint32(40, len * numCh * 2, true);
      var off = 44;
      for (var i = 0; i < len; i++) for (var ch = 0; ch < numCh; ch++) {
        var s = Math.max(-1, Math.min(1, chans[ch][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
      }
      return new Blob([view], { type: "audio/wav" });
    }
    function buildWavBlob() {
      if (!pcmBuffers.length || !pcmBuffers[0] || !pcmBuffers[0].length) return null;
      var chans = []; for (var c = 0; c < pcmBuffers.length; c++) chans.push(flatten(pcmBuffers[c]));
      return encodeWav(chans, pcmRate);
    }
    wavBtn.addEventListener("click", function () {
      var blob = buildWavBlob();
      if (!blob) { alert("No PCM was captured for WAV in this browser."); return; }
      var u = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = u; a.download = wavFilename();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    });
    shareBtn.addEventListener("click", function () {
      if (!lastBlob || !window.PixelShare) return;
      PixelShare.share({
        blob: lastBlob,
        filenamePrefix: share.filenamePrefix || "synthi",
        text: share.text || "Made a patch on SYNTHI — make your own:",
        url: share.url || location.href,
        hashtags: share.hashtags || ["synthesizer", "generativeart"]
      });
    });

    return {
      enable: function (on) {
        btn.disabled = !on;
        if (!on) { setRecording(false); return; }
        try { var c = cfg.getContext && cfg.getContext(); if (c) ensureWorklet(c).catch(function () {}); } catch (e) {}  // pre-warm the worklet module
      },
      getLast: function () { return lastBlob ? { blob: lastBlob, patch: lastPatch, engineVersion: engineVersion, ts: lastTs } : null; },
      // redraw the idle length readout — call when the host's loop length / tempo changes
      refresh: function () { if (!isRecording() && !arming) { timeEl.textContent = fmtSec(maxSecNow()); syncTitle(); } }
    };
  }

  window.SynthiRecord = { mount: mount };
})();
