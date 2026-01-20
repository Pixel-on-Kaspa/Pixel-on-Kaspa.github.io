// /js/yohei-glsl.js
// Minimal WebGL fragment viewer for Yohei Nishitsuji tweet shader style

const canvas = document.getElementById("glslCanvas");
const host = document.getElementById("glslHost");

const playBtn = document.getElementById("gPlay");
const pauseBtn = document.getElementById("gPause");
const pngBtn = document.getElementById("gPng");
const qSlider = document.getElementById("gQ");
const qVal = document.getElementById("gQVal");

let gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
if (!gl) {
  alert("WebGL not supported.");
  throw new Error("No WebGL");
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos*0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Yohei shader snippet wrapped into a working fragment program.
// We map: FC=gl_FragCoord, r=uRes, t=uTime, o=gl_FragColor
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
varying vec2 vUv;

vec3 hsv(float h, float s, float v){
  vec3 c = vec3(h, s, v);
  vec3 rgb = clamp(abs(mod(c.x*6.0 + vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
  rgb = rgb*rgb*(3.0-2.0*rgb);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main(){
  vec2 FC = gl_FragCoord.xy;
  float r = min(uRes.x, uRes.y);
  float t = uTime;

  vec4 o = vec4(0.0);

  // ---- Original snippet (minimally adapted) ----
  float i=0.0,e=0.0,R=0.0,s=0.0;
  vec3 q=vec3(0.0),p=vec3(0.0),d=vec3(FC.xy/r-vec2(.3),.5);

  for(q.zx--; i++<99.;){
    o.rgb += hsv(.1,.2, min(e*s,.4-e)/20.0 );
    s = 1.0;
    p = q += d*e*R*.3;
    p = vec3(
      log2(R=length(p)) - t,
      exp2(-p.z/R + 1.0),
      atan(p.x, p.y) + cos(t*.5)*.8
    );
    for(e = --p.y; s < 5e2; s += s){
      e += dot(sin(p.xzx*s)-.4, sin(p.zyy*s+e)) / s * .3;
    }
  }

  // mild tone
  o.rgb = clamp(o.rgb, 0.0, 1.0);
  gl_FragColor = vec4(o.rgb, 1.0);
}
`;

function compile(type, src){
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(sh) || "compile error";
    console.error(msg);
    throw new Error(msg);
  }
  return sh;
}

function program(vsSrc, fsSrc){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(p) || "link error";
    console.error(msg);
    throw new Error(msg);
  }
  return p;
}

const prog = program(VERT, FRAG);
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1,-1,  1,-1, -1, 1,
  -1, 1,  1,-1,  1, 1
]), gl.STATIC_DRAW);

const locPos = gl.getAttribLocation(prog, "aPos");
gl.enableVertexAttribArray(locPos);
gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

const locRes = gl.getUniformLocation(prog, "uRes");
const locTime = gl.getUniformLocation(prog, "uTime");

let quality = 1.0;
let running = true;
let t0 = performance.now();

function resize(){
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(240, Math.floor(rect.width * dpr * quality));
  const h = Math.max(240, Math.floor(rect.height * dpr * quality));
  if (canvas.width !== w || canvas.height !== h){
    canvas.width = w; canvas.height = h;
    gl.viewport(0,0,w,h);
  }
}

function draw(){
  resize();
  const t = (performance.now() - t0) / 1000;
  gl.uniform2f(locRes, canvas.width, canvas.height);
  gl.uniform1f(locTime, t);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (running) requestAnimationFrame(draw);
}

window.addEventListener("resize", () => { if (running) draw(); });

if (qSlider && qVal) {
  quality = parseFloat(qSlider.value) || 1.0;
  qVal.textContent = `${quality.toFixed(2)}×`;
  qSlider.addEventListener("input", () => {
    quality = Math.max(0.25, Math.min(2.5, parseFloat(qSlider.value) || 1.0));
    qVal.textContent = `${quality.toFixed(2)}×`;
    if (running) draw();
  });
}

if (playBtn) playBtn.addEventListener("click", () => {
  if (running) return;
  running = true;
  // reset timing so it doesn't jump too weird
  t0 = performance.now() - (canvas._t || 0) * 1000;
  draw();
});
if (pauseBtn) pauseBtn.addEventListener("click", () => {
  if (!running) return;
  // store current time offset
  canvas._t = (performance.now() - t0) / 1000;
  running = false;
});

if (pngBtn) pngBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `yohei_glsl_${Date.now()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

draw();
