// synthi/js/synthi-audio.js
// SYNTHI Audio Module — custom UI (no click-through)
// Uses SoundCloud Widget API with a hidden iframe engine.

window.SynthiAudio = (() => {
  let widget = null;
  let ready = false;

  let durationMs = 0;
  let lastPosMs = 0;
  let isSeeking = false;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function fmtTime(ms) {
    ms = Math.max(0, ms|0);
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
  }

  function setText(el, txt){ if (el) el.textContent = txt; }

  function init(cfg) {
    const iframe = document.getElementById(cfg.iframeId);
    if (!iframe || !window.SC) {
      console.warn("[SynthiAudio] Missing iframe or SoundCloud API.");
      return;
    }

    const btnPlay   = document.getElementById(cfg.playBtnId);
    const btnPause  = document.getElementById(cfg.pauseBtnId);
    const btnRew    = document.getElementById(cfg.rewindBtnId);

    const posSlider = document.getElementById(cfg.posSliderId);
    const posLabel  = document.getElementById(cfg.posLabelId);
    const timeLabel = document.getElementById(cfg.timeLabelId);

    const volSlider = document.getElementById(cfg.volSliderId);
    const volLabel  = document.getElementById(cfg.volLabelId);

    widget = window.SC.Widget(iframe);

    // initial UI defaults
    const initVol = clamp(parseInt(cfg.initialVolume ?? 80, 10) || 80, 0, 100);
    if (volSlider) volSlider.value = String(initVol);
    setText(volLabel, `${initVol}%`);
    if (posSlider) posSlider.value = "0";
    setText(posLabel, "0%");
    setText(timeLabel, "00:00 / 00:00");

    widget.bind(window.SC.Widget.Events.READY, () => {
      ready = true;

      // volume
      try { widget.setVolume(initVol); } catch {}

      // duration
      widget.getDuration((d) => {
        durationMs = d || 0;
        setText(timeLabel, `${fmtTime(lastPosMs)} / ${fmtTime(durationMs)}`);
      });

      // keep duration updated (some tracks load duration late)
      widget.getCurrentSound((sound) => {
        if (sound && sound.duration) durationMs = sound.duration;
        setText(timeLabel, `${fmtTime(lastPosMs)} / ${fmtTime(durationMs)}`);
      });
    });

    // Progress updates
    widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (e) => {
      if (!e) return;
      lastPosMs = e.currentPosition || 0;
      if (!durationMs && e.duration) durationMs = e.duration;

      if (!isSeeking && posSlider && durationMs > 0) {
        const t = clamp(lastPosMs / durationMs, 0, 1);
        posSlider.value = String(Math.round(t * 1000));
        setText(posLabel, `${Math.round(t * 100)}%`);
      }
      setText(timeLabel, `${fmtTime(lastPosMs)} / ${fmtTime(durationMs)}`);
    });

    // Buttons
    if (btnPlay) btnPlay.addEventListener("click", () => {
      if (!ready) return;
      try { widget.play(); } catch {}
    });
    if (btnPause) btnPause.addEventListener("click", () => {
      if (!ready) return;
      try { widget.pause(); } catch {}
    });
    if (btnRew) btnRew.addEventListener("click", () => {
      if (!ready) return;
      try { widget.seekTo(0); } catch {}
    });

    // Position slider (0..1000)
    if (posSlider) {
      posSlider.addEventListener("pointerdown", () => { isSeeking = true; });
      posSlider.addEventListener("pointerup", () => {
        isSeeking = false;
        if (!ready || durationMs <= 0) return;
        const v = clamp(parseInt(posSlider.value, 10) || 0, 0, 1000) / 1000;
        const toMs = Math.round(v * durationMs);
        try { widget.seekTo(toMs); } catch {}
      });
      posSlider.addEventListener("input", () => {
        if (durationMs <= 0) return;
        const v = clamp(parseInt(posSlider.value, 10) || 0, 0, 1000) / 1000;
        setText(posLabel, `${Math.round(v * 100)}%`);
        const previewMs = Math.round(v * durationMs);
        setText(timeLabel, `${fmtTime(previewMs)} / ${fmtTime(durationMs)}`);
      });
      // if pointerup doesn’t fire (mobile), also commit on change
      posSlider.addEventListener("change", () => {
        isSeeking = false;
        if (!ready || durationMs <= 0) return;
        const v = clamp(parseInt(posSlider.value, 10) || 0, 0, 1000) / 1000;
        try { widget.seekTo(Math.round(v * durationMs)); } catch {}
      });
    }

    // Volume slider
    if (volSlider) {
      volSlider.addEventListener("input", () => {
        const v = clamp(parseInt(volSlider.value, 10) || 0, 0, 100);
        setText(volLabel, `${v}%`);
        if (!ready) return;
        try { widget.setVolume(v); } catch {}
      });
    }
  }

  return { init };
})();
