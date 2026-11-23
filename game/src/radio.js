// Vice Point — procedural radio, stage 4. Two stations, zero audio files:
// VICE FM is a synthwave arpeggio in A minor over a pulsing bass, PALM 87
// is a slow major-key drift for the beachfront cruise. Both are step
// sequencers driving the shared SoundBank's blips, so they respect the
// mute key and only start after the first user gesture. R flips stations.
export const STATIONS = [
  {
    id: 'vicefm', name: 'VICE FM — synthwave',
    step: 0.16, wave: 'sawtooth', vol: 0.045,
    // A minor arpeggio, two bars, plus a bass note every 4 steps.
    notes: [220, 261.63, 329.63, 440, 523.25, 440, 329.63, 261.63, 220, 261.63, 329.63, 440, 392, 329.63, 261.63, 220],
    bass: [110, 0, 0, 0, 87.31, 0, 0, 0, 98, 0, 0, 0, 82.41, 0, 0, 0],
  },
  {
    id: 'palm87', name: 'PALM 87 — beach drift',
    step: 0.3, wave: 'sine', vol: 0.06,
    // C major pentatonic, slow and wide.
    notes: [261.63, 329.63, 392, 493.88, 587.33, 493.88, 392, 329.63, 261.63, 329.63, 392, 587.33, 493.88, 392, 329.63, 261.63],
    bass: [130.81, 0, 0, 0, 0, 0, 0, 0, 174.61, 0, 0, 0, 0, 0, 0, 0],
  },
];

export class Radio {
  constructor(sounds) {
    this.sounds = sounds;
    this.station = 0;
    this.stepIdx = 0;
    this.acc = 0;
    this.switches = 0;
  }

  get current() { return STATIONS[this.station]; }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.stepIdx = 0;
    this.acc = 0;
    this.switches++;
    return this.current;
  }

  update(dt) {
    const st = this.current;
    if (!this.sounds || !this.sounds.ctx || this.sounds.muted) return;
    this.acc += dt;
    while (this.acc >= st.step) {
      this.acc -= st.step;
      const i = this.stepIdx % st.notes.length;
      const note = st.notes[i];
      const bass = st.bass[i];
      if (note) this.sounds.blip(note, st.step * 1.8, st.wave, st.vol);
      if (bass) this.sounds.blip(bass, st.step * 3.2, 'triangle', st.vol * 1.4);
      this.stepIdx++;
    }
  }

  serialize() { return { station: this.station, switches: this.switches }; }
  restore(s) {
    if (!s) return;
    if (typeof s.station === 'number' && s.station >= 0 && s.station < STATIONS.length) this.station = s.station;
    if (typeof s.switches === 'number') this.switches = s.switches;
  }
}
