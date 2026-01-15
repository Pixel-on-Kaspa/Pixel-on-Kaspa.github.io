// /js/pixel-p5.js
// PIXEL p5 generator — based on your one-liner tweet

(() => {
  const host = document.getElementById("p5host");
  if (!host) {
    console.warn("[PIXEL p5] Missing #p5host");
    return;
  }

  const playBtn  = document.getElementById("pxPlay");
  const pauseBtn = document.getElementById("pxPause");
  const pngBtn   = document.getElementById("pxPng");
  const fsBtn    = document.getElementById("pxFs");

  const speed = document.getElementById("pxSpeed");
  const speedVal = document.getElementById("pxSpeedVal");
  const q = document.getElementById("pxQ");
  const qVal = document.getElementById("pxQVal");

  let W = 400;
  let f = 0;
  let speedMul = 1.0;
  let needResize = false;

  const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));

  function setCanvasSize(px){
    W = (px|0);
    W = clamp(W, 260, 1400);
  }

  if (q && qVal) {
    setCanvasSize(parseInt(q.value,10) || 400);
    qVal.textContent = String(W);
    q.addEventListener("input", () => {
      setCanvasSize(parseInt(q.value,10) || 400);
      qVal.textContent = String(W);
      needResize = true;
    });
  }

  if (speed && speedVal) {
    speedMul = parseFloat(speed.value) || 1;
    speedVal.textContent = `${speedMul.toFixed(2)}×`;
    speed.addEventListener("input", () => {
      speedMul = clamp(parseFloat(speed.value) || 1, 0.05, 10);
      speedVal.textContent = `${speedMul.toFixed(2)}×`;
    });
  }

  let p5i = null;

  const sketch = (p) => {
    p.setup = () => {
      const c = p.createCanvas(W, W);
      c.parent(host);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.frameRate(60);
      p.background(0);
    };

    p.draw = () => {
      if (needResize) {
        p.resizeCanvas(W, W);
        needResize = false;
      }

      // Original one-liner core (kept faithful)
      const B = Math.PI / 64;
      const P = Math.PI;

      p.background(B);
      p.noStroke();

      for (let j = -P; j < p.TAU; j += B) {
        for (let i = 0; i < P; i += B) {
          const n = (f + Math.cos(j + f)) % B;
          const g = f + Math.cos(i + n);
          const x = (i + n) * (W / P);
          const y = (j + 2 * Math.sin(g)) * (W / P);
          p.circle(y, x, 4 * Math.cos(g));
        }
      }

      f += (B / 8) * speedMul;
    };
  };

  p5i = new p5(sketch);

  if (playBtn)  playBtn.addEventListener("click", () => p5i.loop());
  if (pauseBtn) pauseBtn.addEventListener("click", () => p5i.noLoop());

  if (pngBtn) pngBtn.addEventListener("click", () => {
    p5i.saveCanvas(`pixel_p5_${Date.now()}`, "png");
  });

  if (fsBtn) fsBtn.addEventListener("click", () => {
    const el = host;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
})();
