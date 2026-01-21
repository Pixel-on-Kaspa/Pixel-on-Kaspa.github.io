// synthi/js/synthi-audio.js
// SoundCloud audio-only controller (hidden iframe, no click-through)
(() => {
  "use strict";

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function fmt(ms) {
    ms = Math.max(0, ms | 0);
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${String(m).padStart(2, "0")}:${ss}`;
  }

  function safeQS(id) {
    return id ? document.getElementById(id) : null;
  }

  function makeSynthiAudio() {
    let widget = null;
    let duration = 0;
    let isSeeking = false;
    let lastPos = 0;

    let els = {};

    function setText(el, txt) {
      if (el) el.textContent = txt;
    }

    function syncTimeUI(posMs) {
      const pos = clamp(posMs || 0, 0, duration || 0);
      const d = duration || 0;

      setText(els.timeLabel, `${fmt(pos)} / ${fmt(d)}`);
      setText(els.posLabel, fmt(pos));

      if (els.posSlider && !isSeeking) {
        const max = Number(els.posSlider.max || 1000);
        const v = d > 0 ? Math.round((pos / d) * max) : 0;
        els.posSlider.value = String(v);
      }
    }

    function syncVolUI(vol) {
      if (!els.volSlider) return;
      const v = clamp(Math.round(vol), 0, 100);
      els.volSlider.value = String(v);
      setText(els.volLabel, `${v}%`);
    }

    function bindUI(cfg) {
      els.playBtn = safeQS(cfg.playBtnId);
      els.pauseBtn = safeQS(cfg.pauseBtnId);
      els.rewBtn = safeQS(cfg.rewindBtnId);

      els.posSlider = safeQS(cfg.posSliderId);
      els.posLabel = safeQS(cfg.posLabelId);
      els.timeLabel = safeQS(cfg.timeLabelId);

      els.volSlider = safeQS(cfg.volSliderId);
      els.volLabel = safeQS(cfg.volLabelId);

      if (els.playBtn) els.playBtn.addEventListener("click", () => widget && widget.play());
      if (els.pauseBtn) els.pauseBtn.addEventListener("click", () => widget && widget.pause());
      if (els.rewBtn) els.rewBtn.addEventListener("click", () => widget && widget.seekTo(0));

      if (els.posSlider) {
        els.posSlider.addEventListener("input", () => {
          // show preview time while dragging
          isSeeking = true;
          const max = Number(els.posSlider.max || 1000);
          const v = Number(els.posSlider.value || 0);
          const target = duration > 0 ? (v / max) * duration : 0;
          setText(els.posLabel, fmt(target));
        });

        const commitSeek = () => {
          if (!widget) return;
          const max = Number(els.posSlider.max || 1000);
          const v = Number(els.posSlider.value || 0);
          const target = duration > 0 ? (v / max) * duration : 0;
          widget.seekTo(target);
          isSeeking = false;
        };

        els.posSlider.addEventListener("change", commitSeek);
        els.posSlider.addEventListener("pointerup", commitSeek);
        els.posSlider.addEventListener("touchend", commitSeek);
      }

      if (els.volSlider) {
        els.volSlider.addEventListener("input", () => {
          const v = clamp(Number(els.volSlider.value || 0), 0, 100);
          setText(els.volLabel, `${Math.round(v)}%`);
          if (widget) widget.setVolume(v);
        });
      }

      // init label
      syncTimeUI(0);
      if (els.volSlider) syncVolUI(cfg.initialVolume ?? 80);
    }

    function hookWidgetEvents() {
      if (!widget) return;

      widget.bind(SC.Widget.Events.READY, () => {
        widget.getDuration((d) => {
          duration = Number(d || 0);
          syncTimeUI(lastPos);
        });

        // set initial volume
        if (els.volSlider) {
          const v = clamp(Number(els.volSlider.value || 80), 0, 100);
          widget.setVolume(v);
          syncVolUI(v);
        }
      });

      widget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
        lastPos = Number(e?.currentPosition || 0);
        syncTimeUI(lastPos);
      });

      widget.bind(SC.Widget.Events.FINISH, () => {
        lastPos = duration || 0;
        syncTimeUI(lastPos);
      });
    }

    return {
      init(cfg) {
        const iframe = safeQS(cfg.iframeId);
        if (!iframe || !window.SC || !window.SC.Widget) {
          console.warn("[SynthiAudio] missing iframe or SoundCloud Widget API");
          return;
        }

        widget = window.SC.Widget(iframe);

        bindUI(cfg);
        hookWidgetEvents();
      }
    };
  }

  window.SynthiAudio = makeSynthiAudio();
})();
