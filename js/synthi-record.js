/* ─────────────────────────────────────────────────────────────
   SynthiRecord — reusable "record what you play" for the SYNTHI synths.

   Taps the final post-limiter node of a live Web Audio graph via a
   PARALLEL MediaStreamDestination (fan-out), so what reaches the speakers
   is never altered. Records up to N seconds to WebM/Opus, then shows a
   floating clip bar with inline playback, a direct Save (download), and
   Share (via PixelShare → X). Silently snapshots a provenance blob so a
   remix/gallery layer can be turned on later without re-recording.

   Free tier = 15s; unlimited length is planned behind membership.

   Usage:
     var rec = SynthiRecord.mount({
       container:   el|id,          // where the REC button goes (inline)
       getContext:  () => AudioContext|null,
       getTap:      () => AudioNode|null,   // final post-limiter/ceiling node
       ensureAudio: () => {},               // optional: start audio on REC
       getPatch:    () => string|null,      // optional: provenance snapshot
       engineVersion: 'aks-2026.07',
       maxSec: 15,
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

  function mount(cfg) {
    injectStyle();
    var container = elById(cfg.container);
    if (!container) return { enable: function () {} };

    var maxSec = cfg.maxSec || 15;                // TODO: unlimited behind membership
    var engineVersion = cfg.engineVersion || "unknown";
    var share = cfg.share || {};

    // ── inline control (REC + countdown) ──
    var wrap = mk("span", "srec");
    var btn = mk("button", "srec-btn", "● REC"); btn.type = "button"; btn.title = "Record a " + maxSec + "s clip of what you play"; btn.disabled = true;
    var timeEl = mk("span", "srec-time", maxSec + "s");
    wrap.appendChild(btn); wrap.appendChild(timeEl);
    container.appendChild(wrap);

    // ── floating clip bar ──
    var result = mk("div", "srec-result");
    var audio = mk("audio"); audio.controls = true; audio.preload = "metadata";
    var saveBtn = mk("button", "srec-btn", "↓ Save"); saveBtn.type = "button";
    var shareBtn = mk("button", "srec-btn", "Share ↗"); shareBtn.type = "button";
    result.appendChild(mk("span", "srec-lbl", "Clip"));
    result.appendChild(audio); result.appendChild(saveBtn); result.appendChild(shareBtn);
    document.body.appendChild(result);

    var mediaRecorder = null, chunks = [], countdown = null, timeout = null, msDest = null, tapNode = null;
    var lastBlob = null, lastUrl = null, lastTs = 0, lastPatch = null;

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
      else { btn.textContent = "● REC"; btn.classList.remove("rec"); timeEl.textContent = maxSec + "s"; }
    }
    function clearTimers() {
      if (countdown) { clearInterval(countdown); countdown = null; }
      if (timeout) { clearTimeout(timeout); timeout = null; }
    }
    function cleanupTap() { try { if (tapNode && msDest) tapNode.disconnect(msDest); } catch (e) {} msDest = null; tapNode = null; }

    function start() {
      if (cfg.ensureAudio) { try { cfg.ensureAudio(); } catch (e) {} }
      var ctx = cfg.getContext && cfg.getContext();
      tapNode = cfg.getTap && cfg.getTap();
      if (!ctx || !tapNode) return;
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
      var started = Date.now();
      mediaRecorder.start();
      setRecording(true);
      countdown = setInterval(function () {
        var left = Math.max(0, maxSec - Math.floor((Date.now() - started) / 1000));
        timeEl.textContent = left + "s";
      }, 250);
      timeout = setTimeout(stop, maxSec * 1000);
    }
    function stop() { if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop(); clearTimers(); }
    function isRecording() { return mediaRecorder && mediaRecorder.state === "recording"; }

    btn.addEventListener("click", function () { isRecording() ? stop() : start(); });
    saveBtn.addEventListener("click", function () {
      if (!lastBlob) return;
      var u = lastUrl || URL.createObjectURL(lastBlob);
      var a = document.createElement("a");
      a.href = u; a.download = filename();
      document.body.appendChild(a); a.click(); a.remove();
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
      enable: function (on) { btn.disabled = !on; if (!on) setRecording(false); },
      getLast: function () { return lastBlob ? { blob: lastBlob, patch: lastPatch, engineVersion: engineVersion, ts: lastTs } : null; }
    };
  }

  window.SynthiRecord = { mount: mount };
})();
