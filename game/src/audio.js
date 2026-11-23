// Vice Point — procedural WebAudio: no audio files, every sound is
// synthesized (engine hum, footsteps, UI blips, a car horn). The context is
// created on the first user gesture so browsers allow it.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.muted = false;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.ctx.destination);
    this.engineGain = g;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 28;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.5;
    o.connect(g); o2.connect(g2); g2.connect(g);
    o.start(); o2.start();
    this.engineOsc = o;
    this.engineOsc2 = o2;
  }
  setEngine(running, speed01) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(running ? 0.05 + speed01 * 0.06 : 0.0, t, 0.1);
    if (this.engineOsc) this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(28 + speed01 * 60, t, 0.08);
  }
  blip(freq = 660, dur = 0.07, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  }
  step(run) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = 0.09;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = run ? 900 : 500;
    const g = this.ctx.createGain();
    g.gain.value = run ? 0.16 : 0.09;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }
  horn() {
    this.blip(370, 0.28, 'square', 0.1);
    setTimeout(() => this.blip(466, 0.28, 'square', 0.1), 30);
  }
}
