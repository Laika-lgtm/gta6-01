// Vice Point — procedural WebAudio sound. No audio files: every sound is
// synthesized with oscillators and filtered noise at run time. The engine
// hums with speed, footsteps tick with the walk cycle, the UI blips, mission
// completions play a little arpeggio, the sea murmurs underneath it all,
// three radio stations play procedurally generated loops in the car, and
// gunshots crack through a band-passed noise burst.

export const RADIO_CHANNELS = [
  { name: 'VICE FM 88.1 — Neon Nights', bpm: 100, root: 110, wave: 'sawtooth', minor: true },
  { name: 'PALM 102.4 — Sunset Drive', bpm: 80, root: 130.81, wave: 'triangle', minor: false },
  { name: 'PIER 9 95.5 — Bassline', bpm: 116, root: 98, wave: 'square', minor: true },
];

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

// Deterministic patterns per channel, so every station sounds the same
// on every load: a 16-step bass line and a sparse lead line.
function channelPatterns(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const bass = [];
  const lead = [];
  for (let i = 0; i < 16; i++) {
    bass.push(next() < 0.25 ? -1 : Math.floor(next() * 7));
    lead.push(next() < 0.62 ? -1 : Math.floor(next() * 7));
  }
  return { bass, lead };
}
const RADIO_PATTERNS = RADIO_CHANNELS.map((_, i) => channelPatterns(7919 * (i + 1) + 13));

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.engineOn = false;
    this.wavesStarted = false;
    this.lastStep = 0;
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
    this.sirenOn = false;
    // Radio: channel index, on-air flag, scheduler state.
    this.radioChannel = 0;
    this.radioOn = false;
    this.radioGain = null;
    this.radioTimer = null;
    this.radioStep = 0;
    this.radioNextTime = 0;
  }

  // Must be called from a user gesture (the start button) so the browser
  // allows audio. Safe to call twice.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0.13;
    this.radioGain.connect(this.master);
    this.startWaves();
    this.startRadioScheduler();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  // --- ambient sea: a looped buffer of brown noise through a lowpass ---
  startWaves() {
    if (!this.ctx || this.wavesStarted) return;
    this.wavesStarted = true;
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    // A slow swell so the sea breathes instead of sitting flat.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    lfo.start();
  }

  // --- radio: three procedural stations, scheduled a few notes ahead ---
  // The scheduler only runs while the radio is on-air (in the car) and
  // the context is actually running, so a suspended context never queues
  // a backlog of notes in the past.
  startRadioScheduler() {
    if (this.radioTimer) return;
    this.radioTimer = window.setInterval(() => this.radioTick(), 60);
  }

  setRadioActive(on) {
    if (on === this.radioOn) return;
    this.radioOn = on;
    if (on && this.ctx) {
      this.radioStep = 0;
      this.radioNextTime = this.ctx.currentTime + 0.05;
    }
  }

  cycleRadio() {
    this.radioChannel = (this.radioChannel + 1) % RADIO_CHANNELS.length;
    if (this.radioOn && this.ctx) {
      this.radioStep = 0;
      this.radioNextTime = this.ctx.currentTime + 0.05;
    }
    return RADIO_CHANNELS[this.radioChannel].name;
  }

  radioTick() {
    if (!this.ctx || !this.radioOn || this.ctx.state !== 'running') return;
    const ch = RADIO_CHANNELS[this.radioChannel];
    const stepDur = 60 / ch.bpm / 4;
    let guard = 0;
    while (this.radioNextTime < this.ctx.currentTime + 0.18 && guard < 32) {
      this.scheduleRadioStep(ch, this.radioStep, this.radioNextTime, stepDur);
      this.radioStep = (this.radioStep + 1) % 64;
      this.radioNextTime += stepDur;
      guard++;
    }
  }

  scheduleRadioStep(ch, step, t, stepDur) {
    const scale = ch.minor ? MINOR_SCALE : MAJOR_SCALE;
    const pat = RADIO_PATTERNS[this.radioChannel];
    const bar = step % 16;
    // Kick on the quarters (laid back on the chill station).
    const kickSteps = this.radioChannel === 1 ? [0, 8] : [0, 4, 8, 12];
    if (kickSteps.includes(bar)) this.radioKick(t);
    // Hat on the off-beats.
    if (bar % 2 === 1) this.radioHat(t);
    // Bass line, one octave under the root.
    const bassDeg = pat.bass[bar];
    if (bassDeg >= 0) {
      const freq = (ch.root / 2) * Math.pow(2, scale[bassDeg] / 12);
      this.radioNote(t, freq, ch.wave, stepDur * 0.9, 0.5);
    }
    // Sparse lead, two octaves up, quieter.
    const leadDeg = pat.lead[bar];
    if (leadDeg >= 0) {
      const freq = ch.root * 2 * Math.pow(2, scale[leadDeg] / 12);
      this.radioNote(t, freq, 'triangle', stepDur * 0.7, 0.22);
    }
  }

  radioNote(t, freq, wave, dur, gainVal) {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainVal, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.radioGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  radioKick(t) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain);
    gain.connect(this.radioGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  radioHat(t) {
    const dur = 0.04;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.radioGain);
    src.start(t);
  }

  // --- gunshot: a band-passed noise crack plus a low thump ---
  shot(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = kind === 'smg' ? 0.06 : 0.1;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'smg' ? 2400 : 1700;
    filter.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(kind === 'smg' ? 0.35 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(110, t);
    thump.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.3, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    thump.connect(tg);
    tg.connect(this.master);
    thump.start(t);
    thump.stop(t + 0.12);
  }

  // --- engine: two detuned saws through a lowpass, pitch follows speed ---
  startEngine() {
    if (!this.ctx || this.engineOn) return;
    this.engineOn = true;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 620;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 26;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  setEngine(speed01, throttle) {
    if (!this.ctx || !this.engineOn) return;
    const t = this.ctx.currentTime;
    const rpm = 46 + speed01 * 130 + throttle * 22;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(500 + speed01 * 1600, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.075 + throttle * 0.02, t, 0.1);
  }

  stopEngine() {
    if (!this.ctx || !this.engineOn) return;
    this.engineOn = false;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, t, 0.05);
    const osc = this.engineOsc;
    const osc2 = this.engineOsc2;
    window.setTimeout(() => {
      try { osc.stop(); osc2.stop(); } catch (_e) { /* already stopped */ }
    }, 300);
    this.engineOsc = null;
    this.engineOsc2 = null;
  }

  // --- one footstep: a short burst of band-passed noise ---
  footstep(running) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastStep < 140) return;
    this.lastStep = now;
    const t = this.ctx.currentTime;
    const dur = 0.07;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = running ? 300 : 220;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.value = running ? 0.16 : 0.1;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // --- UI blip ---
  ui() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.setValueAtTime(880, t + 0.06);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // --- police siren: a two-tone wail, an LFO swinging the pitch ---
  startSiren() {
    if (!this.ctx || this.sirenOn) return;
    this.sirenOn = true;
    const t = this.ctx.currentTime;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 780;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 190;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.setValueAtTime(0, t);
    this.sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  stopSiren() {
    if (!this.ctx || !this.sirenOn) return;
    this.sirenOn = false;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(0, t, 0.1);
    const osc = this.sirenOsc;
    const lfo = this.sirenLfo;
    window.setTimeout(() => {
      try { osc.stop(); lfo.stop(); } catch (_e) { /* already stopped */ }
    }, 400);
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
  }

  // --- punch: a short low thud of filtered noise ---
  punch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.12;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  // --- busted: three descending notes, the fun is over ---
  busted() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const notes = [440, 349.23, 261.63];
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.16;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  // --- mission complete: a bright four-note arpeggio ---
  jingle() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const notes = [659.25, 783.99, 987.77, 1318.51];
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.09;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }
}
