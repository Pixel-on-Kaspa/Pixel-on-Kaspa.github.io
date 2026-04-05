/**
 * synthi-aks.js — EMS Synthi AKS-inspired voice layer
 *
 * PHASE 1  Core voice: 3 oscillators (waveform-selectable), white noise at
 *          mixer level, pre-filter drive, resonant VCF, VCA with full ADSR,
 *          modulation envelope (ConstantSource), 2 LFOs, glide/portamento,
 *          per-oscillator analog drift.
 *
 * PHASE 2  5×6 routing matrix: signed strengths (−3…+3), audio-rate sources
 *          routed to AudioParam destinations via GainNodes.
 *
 * PHASE 3  16-step pitch sequencer (pitch, velocity, accent, active, swing),
 *          keyboard note input (number row 1-8), preset save/load (JSON).
 *
 * Integration:
 *   Listens for 'synthiAudioReady' dispatched by index.js.
 *   Injects voice output at the mixBus exposed in that event.
 *   window._aksEngine = AKSEngine instance (available after 'aksReady').
 */

'use strict';

// ── Utilities ──────────────────────────────────────────────────────────────────

const _clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const _midiToHz = (n) => 440 * 2 ** ((n - 69) / 12);
const _semisToRatio = (s) => 2 ** (s / 12);
const _NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const _midiName = (n) => `${_NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

// ── Matrix: sources & destinations ────────────────────────────────────────────

const SRC_LABELS  = ['LFO1', 'LFO2', 'MOD ENV', 'OSC3', 'NOISE'];
const DEST_LABELS = ['OSC1 ƒ', 'OSC2 ƒ', 'OSC3 ƒ', 'FILTER', 'AMP', 'LFO1 ƒ'];
const N_SRC = SRC_LABELS.length;   // 5
const N_DST = DEST_LABELS.length;  // 6

/**
 * Scale: source signal is ±1.  Strength ±3 = full scale deviation.
 *   OSC pitch  : ±200 Hz total   (strong = ±200, med = ±133, weak = ±67)
 *   Filter freq: ±3000 Hz total
 *   Amp        : ±0.45 gain
 *   LFO1 rate  : ±2 Hz
 */
const DEST_SCALE = [200, 200, 200, 3000, 0.45, 2.0];

const _nextStrength = (s) => {
  if (s === 0)  return 1;
  if (s === 3)  return -1;
  if (s === -3) return 0;
  return s > 0 ? s + 1 : s - 1;
};

const _strengthToGain = (strength, di) =>
  (Math.abs(strength) / 3) * DEST_SCALE[di] * Math.sign(strength || 1) * (strength === 0 ? 0 : 1);

// ── Default state (also used as preset template) ──────────────────────────────

function _defaultState() {
  return {
    // Oscillators
    osc1Wave:  'sawtooth', osc1Level: 0.65, osc1Tune:   0,     // tune = semitones
    osc2Wave:  'square',   osc2Level: 0.45, osc2Tune:   0.06,  // slight detune (+6 cents)
    osc3Wave:  'triangle', osc3Level: 0.30, osc3Tune: -12,     // sub -1 oct

    // Noise source
    noiseLevel: 0.06,

    // Filter (VCF)
    filterCutoff: 1800, // Hz
    filterRes:    7.0,  // Q
    filterDrive:  0.28, // 0-1 pre-VCF soft-clip drive

    // Amp envelope ADSR (seconds)
    ampA: 0.008,
    ampD: 0.20,
    ampS: 0.62,
    ampR: 0.55,

    // Modulation envelope ADSR (modulates destinations via matrix)
    modA: 0.05,
    modD: 0.42,
    modS: 0.22,
    modR: 0.88,

    // LFO 1
    lfo1Rate: 0.55,
    lfo1Wave: 'sine',

    // LFO 2
    lfo2Rate: 0.12,
    lfo2Wave: 'triangle',

    // Glide / portamento (seconds, 0 = off)
    glide: 0.0,

    // Analog drift (instability per oscillator, 0-1)
    driftAmt: 0.30,

    // Current playing note
    currentNote: 60,

    // Sequencer
    seqRunning: false,
    seqSwing:   0.0,   // 0-0.5 (fraction of step duration added to odd steps)
    seqSteps: Array.from({ length: 16 }, (_, i) => ({
      note:     60 + [0, 0, 3, 5, 7, 7, 10, 12, 12, 10, 7, 5, 3, 0, -2, 0][i],
      velocity: 0.78,
      active:   i % 2 === 0,
      accent:   i % 8 === 0,
    })),

    // Routing matrix [N_SRC][N_DST], values −3…+3
    // Defaults: LFO1→FILTER +2, MODENV→FILTER +3
    matrix: (() => {
      const m = Array.from({ length: N_SRC }, () => new Array(N_DST).fill(0));
      m[0][3] = 2;  // LFO1 → FILTER +2
      m[2][3] = 3;  // MOD ENV → FILTER +3
      return m;
    })(),
  };
}

// ── AKSEngine ─────────────────────────────────────────────────────────────────

class AKSEngine {
  /**
   * @param {AudioContext}  actx       Shared Web Audio context (from index.js)
   * @param {AudioNode}     outputNode Inject voice into this node (mixBus)
   */
  constructor(actx, outputNode) {
    this.actx        = actx;
    this.outputNode  = outputNode;
    this.state       = _defaultState();
    this.nodes       = {};
    this.matrixGains = []; // [N_SRC][N_DST] of GainNodes

    this._noteHeld        = false;
    this._scheduledSustain = 0;
    this._lastFreq         = _midiToHz(60);
    this._seqStep          = 0;
    this._seqNextTime      = 0;
    this._seqRafId         = null;
    this._selectedSeqStep  = 0; // for UI editing

    this._buildVoice();
    this._buildEnvelopes();
    this._buildModulation();
    this._buildDrift();
    this._buildMatrix();
    this._bindKeyboard();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phase 1 — Voice
  // ──────────────────────────────────────────────────────────────────────────

  _buildVoice() {
    const ac = this.actx;
    const st = this.state;
    const n  = this.nodes;
    const baseFreq = _midiToHz(st.currentNote);

    // 3 oscillators
    n.osc1 = ac.createOscillator(); n.osc1.type = st.osc1Wave;
    n.osc2 = ac.createOscillator(); n.osc2.type = st.osc2Wave;
    n.osc3 = ac.createOscillator(); n.osc3.type = st.osc3Wave;
    n.osc1.frequency.value = baseFreq;
    n.osc2.frequency.value = baseFreq * _semisToRatio(st.osc2Tune);
    n.osc3.frequency.value = baseFreq * _semisToRatio(st.osc3Tune);

    n.osc1Gain = ac.createGain(); n.osc1Gain.gain.value = st.osc1Level;
    n.osc2Gain = ac.createGain(); n.osc2Gain.gain.value = st.osc2Level;
    n.osc3Gain = ac.createGain(); n.osc3Gain.gain.value = st.osc3Level;

    // Noise source (looped white-noise buffer, 3 s)
    n.noiseSource = ac.createBufferSource();
    n.noiseSource.buffer = this._makeNoiseBuf(3.0);
    n.noiseSource.loop   = true;
    n.noiseGain = ac.createGain(); n.noiseGain.gain.value = st.noiseLevel;

    // Voice mixer
    n.mixer = ac.createGain(); n.mixer.gain.value = 0.55;
    n.osc1.connect(n.osc1Gain); n.osc1Gain.connect(n.mixer);
    n.osc2.connect(n.osc2Gain); n.osc2Gain.connect(n.mixer);
    n.osc3.connect(n.osc3Gain); n.osc3Gain.connect(n.mixer);
    n.noiseSource.connect(n.noiseGain); n.noiseGain.connect(n.mixer);

    // Pre-VCF drive: mild asymmetric soft-clip → harmonic richness ("dirty" Synthi character)
    n.preDrive = ac.createWaveShaper();
    n.preDrive.curve = this._makeDriveCurve(st.filterDrive);
    n.preDrive.oversample = '2x';
    n.mixer.connect(n.preDrive);

    // VCF — resonant low-pass (Synthi's filter is the centrepiece)
    n.vcf = ac.createBiquadFilter();
    n.vcf.type = 'lowpass';
    n.vcf.frequency.value = st.filterCutoff;
    n.vcf.Q.value = st.filterRes;
    n.preDrive.connect(n.vcf);

    // VCA — amplitude envelope controlled
    n.vca = ac.createGain(); n.vca.gain.value = 0;
    n.vcf.connect(n.vca);

    // Output stage
    n.voiceOut = ac.createGain(); n.voiceOut.gain.value = 0.82;
    n.vca.connect(n.voiceOut);
    n.voiceOut.connect(this.outputNode);

    // Start oscillators (always running; VCA = gatekeeper)
    const t0 = ac.currentTime + 0.02;
    n.osc1.start(t0);
    n.osc2.start(t0);
    n.osc3.start(t0);
    n.noiseSource.start(t0);

    // OSC3 and noise taps for matrix (audio-rate CV sources)
    n.osc3Tap = ac.createGain(); n.osc3Tap.gain.value = 0.5;
    n.osc3.connect(n.osc3Tap);

    n.noiseTap = ac.createGain(); n.noiseTap.gain.value = 0.4;
    n.noiseSource.connect(n.noiseTap);
  }

  _buildEnvelopes() {
    const ac = this.actx;
    const n  = this.nodes;
    // Modulation envelope: ConstantSourceNode automated on note events
    // Output (0-1) scales via matrix gains to destination AudioParams
    n.modEnv = ac.createConstantSource();
    n.modEnv.offset.value = 0;
    n.modEnv.start(ac.currentTime + 0.02);
  }

  _buildModulation() {
    const ac = this.actx;
    const st = this.state;
    const n  = this.nodes;
    n.lfo1 = ac.createOscillator(); n.lfo1.type = st.lfo1Wave; n.lfo1.frequency.value = st.lfo1Rate;
    n.lfo2 = ac.createOscillator(); n.lfo2.type = st.lfo2Wave; n.lfo2.frequency.value = st.lfo2Rate;
    const t0 = ac.currentTime + 0.02;
    n.lfo1.start(t0);
    n.lfo2.start(t0);
  }

  _buildDrift() {
    // Per-oscillator very-slow oscillators → frequency AudioParams
    // Simulates the voltage instability of analog VCOs
    const ac = this.actx;
    const n  = this.nodes;
    const dHz = _clamp(this.state.driftAmt * 2.5, 0, 5);

    const makeDriftOsc = (baseRate) => {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.value = baseRate + Math.random() * 0.025;
      const g = ac.createGain(); g.gain.value = dHz;
      o.connect(g); o.start(ac.currentTime + 0.02);
      return { osc: o, gain: g };
    };

    n.drift1 = makeDriftOsc(0.022); n.drift1.gain.connect(n.osc1.frequency);
    n.drift2 = makeDriftOsc(0.031); n.drift2.gain.connect(n.osc2.frequency);
    n.drift3 = makeDriftOsc(0.018); n.drift3.gain.connect(n.osc3.frequency);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phase 2 — Routing Matrix
  //  Sources  : [lfo1, lfo2, modEnv, osc3Tap, noiseTap]
  //  Dests    : [osc1.freq, osc2.freq, osc3.freq, vcf.freq, vca.gain, lfo1.freq]
  // ──────────────────────────────────────────────────────────────────────────

  _buildMatrix() {
    const ac = this.actx;
    const n  = this.nodes;

    const srcs = [n.lfo1, n.lfo2, n.modEnv, n.osc3Tap, n.noiseTap];
    const dsts = [
      n.osc1.frequency,
      n.osc2.frequency,
      n.osc3.frequency,
      n.vcf.frequency,
      n.vca.gain,
      n.lfo1.frequency,
    ];

    this.matrixGains = srcs.map((src, si) =>
      dsts.map((dst, di) => {
        const g = ac.createGain(); g.gain.value = 0;
        src.connect(g); g.connect(dst);
        return g;
      })
    );

    // Apply defaults from state
    this.state.matrix.forEach((row, si) =>
      row.forEach((strength, di) => this._applyCell(si, di, strength))
    );
  }

  _applyCell(si, di, strength) {
    const gain = _strengthToGain(strength, di);
    this.matrixGains[si][di].gain.setTargetAtTime(gain, this.actx.currentTime, 0.02);
  }

  setMatrix(si, di, strength) {
    this.state.matrix[si][di] = strength;
    this._applyCell(si, di, strength);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Note events (immediate + scheduled for sequencer)
  // ──────────────────────────────────────────────────────────────────────────

  noteOn(midiNote, velocity = 0.8) {
    this.noteOnAt(midiNote, velocity, this.actx.currentTime);
  }

  noteOnAt(midiNote, velocity, when) {
    const ac = this.actx;
    const n  = this.nodes;
    const st = this.state;
    const freq = _midiToHz(midiNote);

    // Pitch (portamento via time-constant glide)
    const tc = st.glide > 0.001 ? st.glide / 3.5 : 0.0015;
    n.osc1.frequency.setTargetAtTime(freq,                                  when, tc);
    n.osc2.frequency.setTargetAtTime(freq * _semisToRatio(st.osc2Tune),     when, tc);
    n.osc3.frequency.setTargetAtTime(freq * _semisToRatio(st.osc3Tune),     when, tc);

    this._lastFreq = freq;
    st.currentNote = midiNote;
    this._noteHeld = true;

    // Amp ADSR
    const peak = _clamp(0.92 * velocity, 0, 1);
    const sus  = peak * st.ampS;
    this._scheduledSustain = sus;

    const vg = n.vca.gain;
    vg.cancelScheduledValues(when);
    vg.setValueAtTime(0.0, when);
    vg.linearRampToValueAtTime(peak, when + st.ampA);
    vg.linearRampToValueAtTime(sus,  when + st.ampA + st.ampD);

    // Mod envelope (fires in sync)
    const me = n.modEnv.offset;
    me.cancelScheduledValues(when);
    me.setValueAtTime(0.0, when);
    me.linearRampToValueAtTime(1.0,      when + st.modA);
    me.linearRampToValueAtTime(st.modS,  when + st.modA + st.modD);
  }

  noteOff() {
    this.noteOffAt(this.actx.currentTime);
  }

  noteOffAt(when) {
    this._noteHeld = false;
    const n  = this.nodes;
    const st = this.state;

    // Release from tracked sustain level (avoids click on sequencer lookahead)
    const vg = n.vca.gain;
    vg.cancelScheduledValues(when);
    vg.setValueAtTime(this._scheduledSustain, when);
    vg.linearRampToValueAtTime(0, when + st.ampR);

    const me = n.modEnv.offset;
    me.cancelScheduledValues(when);
    me.setValueAtTime(st.modS, when);
    me.linearRampToValueAtTime(0, when + st.modR);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Parameter setters
  // ──────────────────────────────────────────────────────────────────────────

  setParam(key, value) {
    this.state[key] = value;
    const n = this.nodes;
    const t = this.actx.currentTime;
    const ramp = (param, v, tc = 0.02) => param.setTargetAtTime(v, t, tc);

    switch (key) {
      case 'osc1Wave': n.osc1.type = value; break;
      case 'osc2Wave': n.osc2.type = value; break;
      case 'osc3Wave': n.osc3.type = value; break;

      case 'osc1Level': ramp(n.osc1Gain.gain, value); break;
      case 'osc2Level': ramp(n.osc2Gain.gain, value); break;
      case 'osc3Level': ramp(n.osc3Gain.gain, value); break;

      case 'osc2Tune':
        ramp(n.osc2.frequency, this._lastFreq * _semisToRatio(value)); break;
      case 'osc3Tune':
        ramp(n.osc3.frequency, this._lastFreq * _semisToRatio(value)); break;

      case 'noiseLevel': ramp(n.noiseGain.gain, value); break;

      case 'filterCutoff': ramp(n.vcf.frequency, value); break;
      case 'filterRes':    ramp(n.vcf.Q, value); break;
      case 'filterDrive':  n.preDrive.curve = this._makeDriveCurve(value); break;

      case 'lfo1Rate': ramp(n.lfo1.frequency, value); break;
      case 'lfo2Rate': ramp(n.lfo2.frequency, value); break;
      case 'lfo1Wave': n.lfo1.type = value; break;
      case 'lfo2Wave': n.lfo2.type = value; break;

      case 'driftAmt': {
        const dHz = _clamp(value * 2.5, 0, 5);
        ramp(n.drift1.gain.gain, dHz,       0.1);
        ramp(n.drift2.gain.gain, dHz * 0.65, 0.1);
        ramp(n.drift3.gain.gain, dHz * 0.40, 0.1);
        break;
      }
      // envelope params (ampA/D/S/R, modA/D/S/R, glide) are stored in state
      // and read on the next noteOnAt() — no live node changes needed
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phase 3 — Pitch Sequencer
  // ──────────────────────────────────────────────────────────────────────────

  seqStart(getBpm) {
    if (this._seqRafId) cancelAnimationFrame(this._seqRafId);
    this._seqStep     = 0;
    this._seqNextTime = this.actx.currentTime + 0.05;
    this.state.seqRunning = true;
    this._seqSchedule(getBpm);
  }

  seqStop() {
    this.state.seqRunning = false;
    if (this._seqRafId) { cancelAnimationFrame(this._seqRafId); this._seqRafId = null; }
    this.noteOff();
  }

  _seqSchedule(getBpm) {
    if (!this.state.seqRunning) return;
    const ac      = this.actx;
    const bpm     = _clamp(getBpm() || 120, 30, 280);
    const baseDur = 60 / bpm / 4; // 16th-note duration
    const ahead   = 0.14;

    while (this._seqNextTime < ac.currentTime + ahead) {
      const idx  = this._seqStep % 16;
      const step = this.state.seqSteps[idx];
      const when = this._seqNextTime;

      if (step.active) {
        const vel = step.accent ? _clamp(step.velocity * 1.38, 0, 1) : step.velocity;
        this.noteOnAt(step.note, vel, when);
        this.noteOffAt(when + baseDur * 0.82);
      }

      // Swing: push odd steps slightly later
      const swingOff = (idx % 2 === 1) ? this.state.seqSwing * baseDur * 0.55 : 0;
      this._seqNextTime += baseDur + swingOff;
      this._seqStep++;
    }

    this._seqRafId = requestAnimationFrame(() => this._seqSchedule(getBpm));
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Keyboard note input (number row 1-8, +/- for octave)
  // ──────────────────────────────────────────────────────────────────────────

  _bindKeyboard() {
    // 1-8 = C4 through C5 (white keys of one octave)
    // 9 = octave up, 0 = octave down
    const NOTE_MAP = { '1':60,'2':62,'3':64,'4':65,'5':67,'6':69,'7':71,'8':72 };
    let baseOctaveShift = 0;
    let activeKeyNote = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't interfere if user is typing in an input/select
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === '9') { baseOctaveShift = _clamp(baseOctaveShift + 12, -24, 24); return; }
      if (e.key === '0') { baseOctaveShift = _clamp(baseOctaveShift - 12, -24, 24); return; }

      const baseNote = NOTE_MAP[e.key];
      if (baseNote === undefined) return;

      const note = _clamp(baseNote + baseOctaveShift, 0, 127);
      activeKeyNote = note;
      this.noteOn(note, 0.82);

      // Update current note display if element exists
      const el = document.getElementById('aks-current-note');
      if (el) el.textContent = _midiName(note);
    });

    window.addEventListener('keyup', (e) => {
      if (NOTE_MAP[e.key] !== undefined && this._noteHeld) this.noteOff();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Presets
  // ──────────────────────────────────────────────────────────────────────────

  savePreset(label = 'SYNTHI AKS') {
    const s = JSON.parse(JSON.stringify(this.state));
    // seqRunning is transient — don't save it
    s.seqRunning = false;
    return JSON.stringify({ label, version: 2, ts: Date.now(), state: s }, null, 2);
  }

  loadPreset(jsonStr) {
    try {
      const { state } = JSON.parse(jsonStr);
      if (!state) throw new Error('no state');
      // Restore non-structural params via setParam
      const SKIP = new Set(['matrix', 'seqSteps', 'seqRunning', 'currentNote']);
      Object.entries(state).forEach(([k, v]) => { if (!SKIP.has(k)) this.setParam(k, v); });
      // Matrix
      if (Array.isArray(state.matrix)) {
        state.matrix.forEach((row, si) =>
          row.forEach((strength, di) => this.setMatrix(si, di, strength))
        );
      }
      // Sequencer steps
      if (Array.isArray(state.seqSteps)) {
        this.state.seqSteps = state.seqSteps.map(s => ({ ...s }));
      }
      return true;
    } catch (err) {
      console.error('[AKS] loadPreset failed:', err);
      return false;
    }
  }

  // Expose labels for external UI builders
  static get SRC_LABELS()  { return SRC_LABELS; }
  static get DEST_LABELS() { return DEST_LABELS; }
  static get N_SRC()       { return N_SRC; }
  static get N_DST()       { return N_DST; }
  static get midiToHz()    { return _midiToHz; }
  static get midiName()    { return _midiName; }

  // ──────────────────────────────────────────────────────────────────────────
  //  Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  _makeNoiseBuf(seconds) {
    const ac  = this.actx;
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d   = buf.getChannelData(0);
    // Slightly pink-ish: each sample is current rand + 0.2 × prev
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const w = (Math.random() * 2 - 1) * 0.88;
      d[i] = prev = w + 0.18 * prev;
    }
    return buf;
  }

  _makeDriveCurve(drive) {
    const n = 1024;
    const c = new Float32Array(n);
    const k = drive * 90 + 1;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      // Asymmetric soft-clip (even harmonics) — more Synthi-like than tanh
      c[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    return c;
  }
}

// ── Bootstrap: wait for audio context ready from index.js ─────────────────────

window.addEventListener('synthiAudioReady', ({ detail }) => {
  const { actx, mixBus } = detail;
  if (!actx || !mixBus) {
    console.warn('[AKS] synthiAudioReady fired but actx/mixBus missing');
    return;
  }

  const engine = new AKSEngine(actx, mixBus);
  window._aksEngine = engine;

  // Expose class so UI script can read static labels
  window._AKSEngine = AKSEngine;

  window.dispatchEvent(new CustomEvent('aksReady', { detail: engine }));
  console.log('[AKS] engine ready — voice injected at mixBus');
});
