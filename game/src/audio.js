// Vice Point — procedural WebAudio sound. No audio files: every sound is
// synthesized with oscillators and filtered noise at run time. The engine
// hums with speed, footsteps tick with the walk cycle, the UI blips, mission
// completions play a little arpeggio, and the sea murmurs underneath it all.

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
    this.startWaves();
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
