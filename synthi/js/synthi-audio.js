// synthi/js/synthi-audio.js
// SYNTHI Audio Module (SoundCloud Widget API)

window.SynthiAudio = (() => {
  let widget = null;
  let ready = false;
  let volume = 80;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function init({ iframeId, sliderId, labelId, initialVolume = 80 }) {
    const iframe = document.getElementById(iframeId);
    const slider = document.getElementById(sliderId);
    const label  = document.getElementById(labelId);

    if (!iframe || !slider || !window.SC) {
      console.warn("[SynthiAudio] Missing iframe/slider or SoundCloud API.");
      return;
    }

    volume = clamp(parseInt(initialVolume, 10) || 80, 0, 100);
    slider.value = String(volume);
    if (label) label.textContent = `${volume}%`;

    widget = window.SC.Widget(iframe);

    widget.bind(window.SC.Widget.Events.READY, () => {
      ready = true;
      try { widget.setVolume(volume); } catch {}
    });

    slider.addEventListener("input", () => {
      volume = clamp(parseInt(slider.value, 10) || 0, 0, 100);
      if (label) label.textContent = `${volume}%`;
      if (ready && widget) {
        try { widget.setVolume(volume); } catch {}
      }
    });
  }

  function setVolume(v) {
    volume = clamp(parseInt(v, 10) || 0, 0, 100);
    if (ready && widget) { try { widget.setVolume(volume); } catch {} }
  }

  function getVolume() { return volume; }

  function play()  { if (ready && widget) { try { widget.play(); } catch {} } }
  function pause() { if (ready && widget) { try { widget.pause(); } catch {} } }

  return { init, setVolume, getVolume, play, pause };
})();
