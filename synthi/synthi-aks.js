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
// 16×16 patch matrix matching the AKS Patch Sheet (service manual p.19).
// Rows  = signal sources (outputs of modules), cols = destinations (module inputs).
// Cols A–H = signal inputs, cols I–P = control inputs.
// Rows 1–9 = sources, rows 10–16 = treatments.

const SRC_LABELS = [
  'Out Ch 1', 'Out Ch 2',                     // 1,2  amp outputs (feedback)
  'Osc 1',                                    // 3    sine+shape output
  'Osc 2',                                    // 4    tri+shape output
  'Osc 3 ⊓', 'Osc 3 ⩘',                       // 5,6  square + sawtooth outs of OSC3
  'Noise',                                    // 7
  'LFO 1',    'LFO 2',                         // 8,9  low-frequency modulators
  'Filter',                                   // 10
  'Trapezoid','Env signal',                   // 11,12
  'Ring mod', 'Reverb',                       // 13,14
  'Stick X',  'Stick Y',                      // 15,16
];
const DEST_LABELS = [
  'Output ch 1',  'Output ch 2',  'Filter Q', 'Osc 1 lvl',     // A-D
  'Ring mod A',   'Ring mod B',   'Filter',   'Reverb',        // E-H signal
  'Osc freq 1',   'Osc freq 2',   'Osc freq 3','Osc 2 lvl',     // I-L control
  'Reverb mix',   'Filter freq',  'Out ch1 lvl','Out ch2 lvl',  // M-P control
];
const N_SRC = SRC_LABELS.length;   // 16
const N_DST = DEST_LABELS.length;  // 16

/**
 * Per-destination full-scale deviation when a single +3 pin is patched.
 * Multiple pins to the same destination are normalized by 1/√N to keep
 * pile-ups musical (passive-matrix-like loading).
 *
 * Index legend mirrors DEST_LABELS:
 *   0  Out ch1 sig  – audio into output channel 1
 *   1  Out ch2 sig  – audio into output channel 2
 *   2  Filter Q     – ±14 on vcf.Q (resonance)
 *   3  Osc1 lvl     – ±0.6 on osc1Gain.gain (AM / tremolo)
 *   4  Ring mod A   – ring-mod depth (multiplier)
 *   5  Ring mod B   – ring-mod audio input
 *   6  Filter sig   – audio into the filter
 *   7  Reverb sig   – audio into the reverb
 *   8  Osc1 freq    – ±200 Hz on osc1.frequency
 *   9  Osc2 freq    – ±200 Hz on osc2.frequency
 *  10  Osc3 freq    – ±200 Hz on osc3.frequency
 *  11  Osc2 lvl     – ±0.6 on osc2Gain.gain (AM / tremolo)
 *  12  Reverb mix   – wet-level CV
 *  13  Filter freq  – ±2400 Hz on vcf.frequency
 *  14  Out ch1 lvl  – ±1 on outCh1.gain
 *  15  Out ch2 lvl  – ±1 on outCh2.gain
 */
const DEST_SCALE = [
  1,    1,    14,   0.6,  1,    1,    1,    1,     // A–H
  200,  200,  200,  0.6,  1,    2400, 1,    1,     // I–P
];

const _strengthToGain = (strength, di) =>
  strength === 0 ? 0
    : (Math.abs(strength) / 3) * DEST_SCALE[di] * Math.sign(strength);

// ── Default state (also used as preset template) ──────────────────────────────

function _defaultState() {
  return {
    // Oscillators — each has a fixed waveform per manual + a Shape control
    // (WaveShaper drive that morphs the wave toward harder shapes).
    // OSC1: sine (with shape → quasi-square). Sawtooth output is internal.
    // OSC2: triangle (with shape → asymmetric/saw-ish). Square output is internal.
    // OSC3: square + sawtooth as two simultaneous outputs (matrix rows 5, 6).
    osc1Level: 0.65, osc1Shape: 0.0,
    osc2Level: 0.45, osc2Shape: 0.0, osc2Tune:  0.06,
    osc3Level: 0.30, osc3Shape: 0.0, osc3Tune: -12,

    // Noise source
    noiseLevel: 0.06,

    // Filter / Oscillator (manual p.38)
    //   Range: 5 Hz – 10 kHz · Q: variable up to ~20 (self-oscillates)
    //   Note: BiquadFilterNode is 12 dB/oct; manual spec is 18 dB/oct.
    //   True 3-pole resonant LP needs AudioWorklet — deferred.
    filterCutoff: 1800, // Hz
    filterRes:    7.0,  // Q

    // Trapezoid Envelope Shaper (manual p.39)
    //   Attack 2ms-1s · On 0-2.5s · Decay 3ms-15s · Off 10ms-5s (+OFF)
    // The trapezoid CV gates the VCA AND is exposed in the matrix (row 11).
    // When envRepeat is true and envOff < envOffMax, the cycle auto-retriggers.
    envAttack:      0.008, // s, 0.002 – 1.0
    envOn:          0.08,  // s, 0    – 2.5  (short so seq steps stay distinct)
    envDecay:       0.16,  // s, 0.003 – 15.0
    envOff:         0.30,  // s, 0.010 – 5.0  (>= envOffMax → infinite Off)
    envSignalLevel: 0.82,  // 0-1, scales the trapezoid peak
    envRepeat:      false, // auto-retrigger after Off completes

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

    // Dual sequencer (AKS-style: two independent 16-step patterns sharing
    // memory). Both can be active at once; on note collision the later step
    // wins (engine is monophonic).
    seqRunning:  false,
    seqSwing:    0.0,   // 0-0.5 (fraction of step duration added to odd steps)
    seqBActive:  false, // Seq B starts disabled
    seqSteps: Array.from({ length: 16 }, (_, i) => ({
      note:     60 + [0, 0, 3, 5, 7, 7, 10, 12, 12, 10, 7, 5, 3, 0, -2, 0][i],
      velocity: 0.78,
      active:   i % 2 === 0,
      accent:   i % 8 === 0,
    })),
    seqStepsB: Array.from({ length: 16 }, (_, i) => ({
      note:     48 + [0, 7, 0, 7, 0, 7, 0, 5, 0, 7, 0, 7, 0, 7, 0, 5][i],
      velocity: 0.65,
      active:   i % 4 === 0,
      accent:   false,
    })),

    // 16×16 patch matrix — empty by default (AKS philosophy: user patches).
    // The implicit voice path (osc mix → filter → VCA → output) stays wired
    // outside the matrix so the synth is audible without any pins inserted.
    matrix: Array.from({ length: N_SRC }, () => new Array(N_DST).fill(0)),
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

    this._noteHeld         = false;
    this._lastFreq         = _midiToHz(60);
    this._seqStep          = 0;
    this._seqNextTime      = 0;
    this._seqRafId         = null;
    this._selectedSeqStep  = 0; // for UI editing
    this.onStep            = null; // UI playhead callback: (stepIndex 0-15) => void
    this._lastNotifiedStep = -1;

    this._buildVoice();
    this._buildEnvelopes();
    this._buildEffects();
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

    // OSC1: sine oscillator with shape (wavefolder) — single output
    n.osc1 = ac.createOscillator(); n.osc1.type = 'sine';
    n.osc1.frequency.value = baseFreq;
    n.osc1Shape = ac.createWaveShaper();
    n.osc1Shape.curve = this._makeShapeCurve(st.osc1Shape);
    n.osc1Shape.oversample = '2x';
    n.osc1.connect(n.osc1Shape);
    n.osc1Gain = ac.createGain(); n.osc1Gain.gain.value = st.osc1Level;
    n.osc1Shape.connect(n.osc1Gain);

    // OSC2: triangle oscillator with shape — single output
    n.osc2 = ac.createOscillator(); n.osc2.type = 'triangle';
    n.osc2.frequency.value = baseFreq * _semisToRatio(st.osc2Tune);
    n.osc2Shape = ac.createWaveShaper();
    n.osc2Shape.curve = this._makeShapeCurve(st.osc2Shape);
    n.osc2Shape.oversample = '2x';
    n.osc2.connect(n.osc2Shape);
    n.osc2Gain = ac.createGain(); n.osc2Gain.gain.value = st.osc2Level;
    n.osc2Shape.connect(n.osc2Gain);

    // OSC3: TWO oscillators (square + sawtooth) — both exposed to matrix
    // separately on rows 5 and 6. Both share frequency/drift, mixed for voice.
    const f3 = baseFreq * _semisToRatio(st.osc3Tune);
    n.osc3sq  = ac.createOscillator(); n.osc3sq.type  = 'square';   n.osc3sq.frequency.value  = f3;
    n.osc3saw = ac.createOscillator(); n.osc3saw.type = 'sawtooth'; n.osc3saw.frequency.value = f3;
    n.osc3Gain = ac.createGain(); n.osc3Gain.gain.value = st.osc3Level;
    n.osc3sq.connect(n.osc3Gain);
    n.osc3saw.connect(n.osc3Gain);
    // OSC3 shape: lazy approximation — crossfade sq↔saw via WaveShaper isn't right.
    // For now Shape adds wave-folding to the sq+saw sum (cosmetic; PWM not done).
    n.osc3Shape = ac.createWaveShaper();
    n.osc3Shape.curve = this._makeShapeCurve(st.osc3Shape);
    n.osc3Shape.oversample = '2x';
    // Apply shape between osc3Gain and mixer (insert below)

    // Noise source (looped white-noise buffer, 3 s)
    n.noiseSource = ac.createBufferSource();
    n.noiseSource.buffer = this._makeNoiseBuf(3.0);
    n.noiseSource.loop   = true;
    n.noiseGain = ac.createGain(); n.noiseGain.gain.value = st.noiseLevel;

    // Voice mixer — sum of shaped OSC outputs + noise
    n.mixer = ac.createGain(); n.mixer.gain.value = 0.55;
    n.osc1Gain.connect(n.mixer);
    n.osc2Gain.connect(n.mixer);
    n.osc3Gain.connect(n.osc3Shape); n.osc3Shape.connect(n.mixer);
    n.noiseSource.connect(n.noiseGain); n.noiseGain.connect(n.mixer);

    // VCF — resonant low-pass (Synthi's filter is the centrepiece)
    // 12 dB/oct biquad LP. Manual spec is 18 dB/oct; high Q (up to 30)
    // gives strong resonance that self-oscillates on transient input.
    n.vcf = ac.createBiquadFilter();
    n.vcf.type = 'lowpass';
    n.vcf.frequency.value = st.filterCutoff;
    n.vcf.Q.value = st.filterRes;
    n.mixer.connect(n.vcf);

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
    n.osc3sq.start(t0);
    n.osc3saw.start(t0);
    n.noiseSource.start(t0);

    // Audio-rate taps for matrix sources. These feed ONLY the matrix (not the
    // voice), so they're set near unity so a single patched pin is clearly
    // audible against the always-on implicit voice path.
    // OSC1 tap = post-shape sine output (matrix row 3)
    n.osc1Tap = ac.createGain(); n.osc1Tap.gain.value = 1.0;
    n.osc1Shape.connect(n.osc1Tap);
    // OSC2 tap = post-shape triangle output (matrix row 4)
    n.osc2Tap = ac.createGain(); n.osc2Tap.gain.value = 1.0;
    n.osc2Shape.connect(n.osc2Tap);
    // OSC3 has TWO taps — square (row 5) and sawtooth (row 6)
    n.osc3sqTap  = ac.createGain(); n.osc3sqTap.gain.value  = 1.0;
    n.osc3sq.connect(n.osc3sqTap);
    n.osc3sawTap = ac.createGain(); n.osc3sawTap.gain.value = 1.0;
    n.osc3saw.connect(n.osc3sawTap);

    n.noiseTap = ac.createGain(); n.noiseTap.gain.value = 0.8;
    n.noiseSource.connect(n.noiseTap);

    n.filterTap = ac.createGain(); n.filterTap.gain.value = 0.9;
    n.vcf.connect(n.filterTap);

    // Silent dummy source kept for any matrix row without a live audio tap.
    n.dummySrc = ac.createConstantSource(); n.dummySrc.offset.value = 0;
    n.dummySrc.start(ac.currentTime + 0.02);

    // DC blocker
    n.dcBlock = ac.createBiquadFilter();
    n.dcBlock.type = 'highpass';
    n.dcBlock.frequency.value = 18;
    n.dcBlock.Q.value = 0.707;
    n.vca.disconnect();
    n.vca.connect(n.dcBlock);

    // Output channels (matrix cols A,B = signal in; O,P = level CV; rows 1,2 = feedback taps)
    // dcBlock fans out to both channels which feed the master voice bus.
    n.outCh1 = ac.createGain(); n.outCh1.gain.value = 1.0;
    n.outCh2 = ac.createGain(); n.outCh2.gain.value = 1.0;
    n.dcBlock.connect(n.outCh1);
    n.dcBlock.connect(n.outCh2);
    n.outCh1.connect(n.voiceOut);
    n.outCh2.connect(n.voiceOut);

    n.outCh1Tap = ac.createGain(); n.outCh1Tap.gain.value = 0.5;
    n.outCh2Tap = ac.createGain(); n.outCh2Tap.gain.value = 0.5;
    n.outCh1.connect(n.outCh1Tap);
    n.outCh2.connect(n.outCh2Tap);

    // Post-VCA "env signal" tap (matrix row 12) — the envelope-gated voice audio
    n.envSigTap = ac.createGain(); n.envSigTap.gain.value = 0.5;
    n.vca.connect(n.envSigTap);
  }

  _buildEffects() {
    const ac = this.actx;
    const n  = this.nodes;
    const t0 = ac.currentTime + 0.02;

    // Ring modulator: gain.value=0; col E feeds the multiplier (gain AudioParam),
    // col F feeds the audio input. Output ≈ A × B at audio rate.
    n.ringMod = ac.createGain(); n.ringMod.gain.value = 0;
    n.ringModTap = ac.createGain(); n.ringModTap.gain.value = 0.7;
    n.ringMod.connect(n.ringModTap);

    // Reverb — synthetic IR through ConvolverNode (approximates AKS spring).
    // col H feeds reverbIn; col M modulates reverbMix.gain (wet level).
    n.reverbIn  = ac.createGain(); n.reverbIn.gain.value  = 0.7;
    n.reverb    = ac.createConvolver(); n.reverb.buffer = this._makeReverbIR(2.4);
    n.reverbMix = ac.createGain(); n.reverbMix.gain.value = 0.6;
    n.reverbIn.connect(n.reverb);
    n.reverb.connect(n.reverbMix);
    n.reverbTap = ac.createGain(); n.reverbTap.gain.value = 0.6;
    n.reverbMix.connect(n.reverbTap);

    // Joystick X/Y CV sources (rows 15, 16). UI updates offset on pointer move.
    n.stickX = ac.createConstantSource(); n.stickX.offset.value = 0;
    n.stickY = ac.createConstantSource(); n.stickY.offset.value = 0;
    n.stickX.start(t0);
    n.stickY.start(t0);
  }

  /**
   * Synthetic spring-reverb IR — band-limited exponential-decay noise.
   * Decay length controls "size"; bandpass shapes the spring character.
   */
  _makeReverbIR(seconds) {
    const sr = this.actx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.actx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0, hp = 0;
      for (let i = 0; i < len; i++) {
        // Exponential decay envelope with subtle modulation (spring-ish)
        const t = i / sr;
        const env = Math.exp(-t * 3.2) * (1 + 0.18 * Math.sin(2 * Math.PI * 4.5 * t));
        const noise = (Math.random() * 2 - 1);
        // 1-pole LP + HP bandpass around 1.4 kHz
        lp += 0.08 * (noise - lp);
        hp += 0.001 * (lp - hp);
        d[i] = (lp - hp) * env;
      }
    }
    return buf;
  }

  _buildEnvelopes() {
    const ac = this.actx;
    const n  = this.nodes;
    // Trapezoid envelope generator (CV source):
    //   offset 0 → peak over Attack → hold for On → 0 over Decay → 0 for Off
    // The CV drives the VCA directly (implicit gating) AND is exposed in the
    // matrix as the "Trapezoid" source (row 11).
    n.trap = ac.createConstantSource();
    n.trap.offset.value = 0;
    n.trap.start(ac.currentTime + 0.02);
    n.trap.connect(n.vca.gain);

    this._trapRepeatTimer = null;
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

    // Matrix-source taps — the LFOs are only heard through the patch matrix
    // (rows 8, 9). Output is ±1; per-destination DEST_SCALE sets the depth.
    n.lfo1Tap = ac.createGain(); n.lfo1Tap.gain.value = 1.0; n.lfo1.connect(n.lfo1Tap);
    n.lfo2Tap = ac.createGain(); n.lfo2Tap.gain.value = 1.0; n.lfo2.connect(n.lfo2Tap);
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
    n.drift3 = makeDriftOsc(0.018);
    n.drift3.gain.connect(n.osc3sq.frequency);
    n.drift3.gain.connect(n.osc3saw.frequency);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Patch matrix — 16×16 (rows = sources, cols = destinations).
  //  Slots without a real-audio target are wired to dummy nodes so the matrix
  //  can be populated by the UI; they'll become audible in later phases.
  // ──────────────────────────────────────────────────────────────────────────

  _buildMatrix() {
    const ac = this.actx;
    const n  = this.nodes;
    const D  = n.dummySrc;

    // Sources (rows 1–16) — order MUST match SRC_LABELS
    const srcs = [
      n.outCh1Tap, n.outCh2Tap,      // 1,2  Output ch1/2 feedback
      n.osc1Tap,                     // 3    Osc 1 (sine+shape)
      n.osc2Tap,                     // 4    Osc 2 (tri+shape)
      n.osc3sqTap, n.osc3sawTap,     // 5,6  Osc 3 square + sawtooth
      n.noiseTap,                    // 7
      n.lfo1Tap, n.lfo2Tap,          // 8,9  LFO 1 / LFO 2
      n.filterTap,                   // 10
      n.trap,                        // 11  Trapezoid CV
      n.envSigTap,                   // 12  Env signal (post-VCA audio)
      n.ringModTap,                  // 13  Ring mod output
      n.reverbTap,                   // 14  Reverb output
      n.stickX, n.stickY,            // 15,16  Joystick X/Y
    ];
    // Dummy dest sinks for unwired columns: a GainNode whose audio output
    // goes nowhere; its .gain serves as the AudioParam target.
    const mkSink = () => {
      const g = ac.createGain();
      g.gain.value = 0;
      return g.gain;
    };
    // Destinations (cols A–P) — order MUST match DEST_LABELS.
    // Each slot is an ARRAY of AudioParams OR AudioNodes (signal inputs).
    //   `g.connect(target)` works for both — AudioParams get modulated,
    //   AudioNodes receive audio signal.
    const dsts = [
      [n.outCh1], [n.outCh2],              // A,B  Output ch1/2 signal IN
      [n.vcf.Q],                           // C    Filter Q (resonance CV)
      [n.osc1Gain.gain],                   // D    Osc 1 level CV (AM)
      [n.ringMod.gain],                    // E    Ring mod A → multiplier param
      [n.ringMod],                         // F    Ring mod B → audio in
      [n.vcf],                             // G    Filter signal IN (sums with implicit voice)
      [n.reverbIn],                        // H    Reverb signal IN
      [n.osc1.frequency],                  // I    Osc freq 1
      [n.osc2.frequency],                  // J    Osc freq 2
      [n.osc3sq.frequency, n.osc3saw.frequency], // K  Osc 3 freq (both sub-oscs)
      [n.osc2Gain.gain],                   // L    Osc 2 level CV (AM)
      [n.reverbMix.gain],                  // M    Reverb mix CV
      [n.vcf.frequency],                   // N    Filter freq
      [n.outCh1.gain], [n.outCh2.gain],    // O,P  Out Ch1/2 level CV
    ];

    this.matrixGains = srcs.map((src, si) =>
      dsts.map((dstParams, di) => {
        const g = ac.createGain(); g.gain.value = 0;
        src.connect(g);
        dstParams.forEach(p => g.connect(p));
        return g;
      })
    );

    for (let di = 0; di < N_DST; di++) this._reapplyDestination(di);
  }

  /**
   * Re-compute and apply gains for ALL sources routing to destination `di`.
   * Per-destination normalization: with N active pins, divide each by √N.
   * This makes a passive matrix behave musically: pile-ups don't blow up
   * the level, but adding a pin still has audible effect.
   */
  _reapplyDestination(di) {
    let active = 0;
    for (let si = 0; si < N_SRC; si++) {
      if (this.state.matrix[si][di] !== 0) active++;
    }
    const norm = active > 0 ? 1 / Math.sqrt(active) : 1;
    const t   = this.actx.currentTime;
    for (let si = 0; si < N_SRC; si++) {
      const g = _strengthToGain(this.state.matrix[si][di], di) * norm;
      this.matrixGains[si][di].gain.setTargetAtTime(g, t, 0.04);
    }
  }

  setMatrix(si, di, strength) {
    this.state.matrix[si][di] = strength;
    this._reapplyDestination(di);
  }

  /**
   * Set joystick X/Y CV outputs (matrix rows 15, 16). Values in [-1, 1].
   * Smoothed via setTargetAtTime to avoid clicks on rapid pointer moves.
   */
  setStick(x, y) {
    const t = this.actx.currentTime;
    this.nodes.stickX.offset.setTargetAtTime(_clamp(x, -1, 1), t, 0.008);
    this.nodes.stickY.offset.setTargetAtTime(_clamp(y, -1, 1), t, 0.008);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Note events (immediate + scheduled for sequencer)
  // ──────────────────────────────────────────────────────────────────────────

  noteOn(midiNote, velocity = 0.8) {
    this.noteOnAt(midiNote, velocity, this.actx.currentTime);
  }

  noteOnAt(midiNote, velocity, when) {
    const n  = this.nodes;
    const st = this.state;
    const freq = _midiToHz(midiNote);

    // Pitch (portamento via time-constant glide)
    const tc = st.glide > 0.001 ? st.glide / 3.5 : 0.0015;
    const f3 = freq * _semisToRatio(st.osc3Tune);
    n.osc1.frequency.setTargetAtTime(freq,                              when, tc);
    n.osc2.frequency.setTargetAtTime(freq * _semisToRatio(st.osc2Tune), when, tc);
    n.osc3sq.frequency.setTargetAtTime(f3,                              when, tc);
    n.osc3saw.frequency.setTargetAtTime(f3,                             when, tc);

    this._lastFreq = freq;
    st.currentNote = midiNote;
    this._noteHeld = true;

    // Trapezoid: peak = velocity × envSignalLevel
    const peak = _clamp(velocity * st.envSignalLevel, 0, 1);
    this._scheduleTrap(when, peak);
  }

  /**
   * Schedule one trapezoid cycle on n.trap.offset starting at `when`.
   * If envRepeat is true and envOff is finite, re-arm a timer to fire the next
   * cycle near the end of Off (while a note is still held).
   */
  _scheduleTrap(when, peak) {
    const n  = this.nodes;
    const st = this.state;
    const A  = Math.max(0.001, st.envAttack);
    const On = Math.max(0,     st.envOn);
    const D  = Math.max(0.001, st.envDecay);
    const Off= Math.max(0.001, st.envOff);

    const trap = n.trap.offset;
    trap.cancelScheduledValues(when);
    let t = when;
    trap.setValueAtTime(0,    t);
    trap.linearRampToValueAtTime(peak, t += A);
    if (On > 0) trap.setValueAtTime(peak, t += On);
    trap.linearRampToValueAtTime(0, t += D);
    trap.setValueAtTime(0, t);

    if (this._trapRepeatTimer) { clearTimeout(this._trapRepeatTimer); this._trapRepeatTimer = null; }
    // envOff >= 5.0 means OFF position (no auto-retrigger)
    if (st.envRepeat && Off < 4.999) {
      const cycleSec = A + On + D + Off;
      const fireAt   = when + cycleSec;
      const delayMs  = Math.max(0, (fireAt - this.actx.currentTime) * 1000 - 6);
      this._trapRepeatTimer = setTimeout(() => {
        if (!this._noteHeld || !this.state.envRepeat) return;
        this._scheduleTrap(this.actx.currentTime + 0.005, peak);
      }, delayMs);
    }
  }

  noteOff() {
    this.noteOffAt(this.actx.currentTime);
  }

  noteOffAt(when) {
    this._noteHeld = false;
    const n  = this.nodes;
    const st = this.state;

    if (this._trapRepeatTimer) { clearTimeout(this._trapRepeatTimer); this._trapRepeatTimer = null; }

    // Ramp the trapezoid CV down over Decay time from whatever value it
    // currently holds (AKS lets the cycle finish; we compromise for playability).
    const trap = n.trap.offset;
    trap.cancelScheduledValues(when);
    trap.linearRampToValueAtTime(0, when + Math.max(0.005, st.envDecay));
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
      case 'osc1Shape': n.osc1Shape.curve = this._makeShapeCurve(value); break;
      case 'osc2Shape': n.osc2Shape.curve = this._makeShapeCurve(value); break;
      case 'osc3Shape': n.osc3Shape.curve = this._makeShapeCurve(value); break;

      case 'aksLevel':  ramp(n.voiceOut.gain, value); break;
      case 'osc1Level': ramp(n.osc1Gain.gain, value); break;
      case 'osc2Level': ramp(n.osc2Gain.gain, value); break;
      case 'osc3Level': ramp(n.osc3Gain.gain, value); break;

      case 'osc2Tune':
        ramp(n.osc2.frequency, this._lastFreq * _semisToRatio(value)); break;
      case 'osc3Tune': {
        const f3 = this._lastFreq * _semisToRatio(value);
        ramp(n.osc3sq.frequency, f3);
        ramp(n.osc3saw.frequency, f3);
        break;
      }

      case 'noiseLevel': ramp(n.noiseGain.gain, value); break;

      case 'filterCutoff': ramp(n.vcf.frequency, value); break;
      case 'filterRes':    ramp(n.vcf.Q, value); break;

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
      case 'reverbMix':
        ramp(n.reverbMix.gain, value); break;
      case 'envRepeat': {
        // Toggling repeat mid-note: if turning ON and a note is held, arm a
        // timer for the next cycle; OFF cancels any pending timer.
        if (this._trapRepeatTimer) { clearTimeout(this._trapRepeatTimer); this._trapRepeatTimer = null; }
        if (value && this._noteHeld && this.state.envOff < 4.999) {
          const peak = _clamp(0.82 * this.state.envSignalLevel, 0, 1);
          this._scheduleTrap(this.actx.currentTime + 0.01, peak);
        }
        break;
      }
      // envAttack / envOn / envDecay / envOff / envSignalLevel / glide are
      // stored in state and consumed on the next noteOnAt() — no live retune.
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Phase 3 — Pitch Sequencer
  // ──────────────────────────────────────────────────────────────────────────

  seqStart(getBpm) {
    if (this._seqRafId) cancelAnimationFrame(this._seqRafId);
    this._seqStep     = 0;
    this._seqNextTime = this.actx.currentTime + 0.05;
    this._scheduledSteps = []; // [{ step, when }] pending UI playhead notifications
    this._lastNotifiedStep = -1;
    this.state.seqRunning = true;
    this._seqSchedule(getBpm);
  }

  seqStop() {
    this.state.seqRunning = false;
    if (this._seqRafId) { cancelAnimationFrame(this._seqRafId); this._seqRafId = null; }
    this._scheduledSteps = [];
    this._lastNotifiedStep = -1;
    if (this.onStep) this.onStep(-1); // clear playhead
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
      const stepA = this.state.seqSteps[idx];
      const stepB = this.state.seqBActive ? this.state.seqStepsB[idx] : null;
      const when  = this._seqNextTime;

      // Queue a playhead notification for this step (fired when audio time reaches it)
      if (this.onStep) this._scheduledSteps.push({ step: idx, when });

      // Seq A fires first; Seq B (if active) overrides on the same tick.
      // Both sequencers run in lockstep (one BPM, both 16 steps).
      if (stepA.active) {
        const vel = stepA.accent ? _clamp(stepA.velocity * 1.38, 0, 1) : stepA.velocity;
        this.noteOnAt(stepA.note, vel, when);
        this.noteOffAt(when + baseDur * 0.82);
      }
      if (stepB && stepB.active) {
        const vel = stepB.accent ? _clamp(stepB.velocity * 1.38, 0, 1) : stepB.velocity;
        // Tiny offset so it lands after A in the schedule queue
        this.noteOnAt(stepB.note, vel, when + 0.0005);
        this.noteOffAt(when + baseDur * 0.82 + 0.0005);
      }

      // Swing: push odd steps slightly later
      const swingOff = (idx % 2 === 1) ? this.state.seqSwing * baseDur * 0.55 : 0;
      this._seqNextTime += baseDur + swingOff;
      this._seqStep++;
    }

    // Fire the UI playhead for any queued step whose start time has arrived.
    if (this.onStep && this._scheduledSteps.length) {
      const now = ac.currentTime;
      let due = -1;
      while (this._scheduledSteps.length && this._scheduledSteps[0].when <= now) {
        due = this._scheduledSteps.shift().step;
      }
      if (due >= 0 && due !== this._lastNotifiedStep) {
        this._lastNotifiedStep = due;
        this.onStep(due);
      }
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
      // Matrix — only apply if dimensions match (skips legacy 5×6 presets)
      if (Array.isArray(state.matrix) &&
          state.matrix.length === N_SRC &&
          Array.isArray(state.matrix[0]) &&
          state.matrix[0].length === N_DST) {
        state.matrix.forEach((row, si) =>
          row.forEach((strength, di) => { this.state.matrix[si][di] = strength; })
        );
        for (let di = 0; di < N_DST; di++) this._reapplyDestination(di);
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

  /**
   * Shape curve for OSC wavefolders. 0 = identity (pass-through), 1 = hard
   * tanh saturation that pushes sine toward square / triangle toward harsher
   * symmetric clipping. Approximates the "shape" knob on Synthi oscillators.
   */
  _makeShapeCurve(shape) {
    const n = 1024;
    const c = new Float32Array(n);
    if (shape <= 0.001) {
      for (let i = 0; i < n; i++) c[i] = (i / (n - 1)) * 2 - 1;
      return c;
    }
    const drive = 1 + shape * 18;
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) / norm;
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
