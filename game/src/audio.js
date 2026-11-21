// Vice Point — procedural WebAudio sound.
// Every sound is synthesised live: an engine hum whose pitch follows speed, a
// soft footstep tick, UI blips and a wanted-level sting. No audio files are
// downloaded; the AudioContext starts on the first user gesture.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let started = false;
  let stepTimer = 0;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenOn = false;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  // Call from the first click / keypress so browsers allow sound.
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    if (started) return;
    started = true;
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  // speed 0..1, on = engine audible (driving). Call every frame.
  function updateEngine(speed, on) {
    if (!context || !engineOsc) return;
    const target = on ? 0.05 + speed * 0.11 : 0.0;
    engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(52 + speed * 130, context.currentTime, 0.05);
    engineFilter.frequency.setTargetAtTime(380 + speed * 900, context.currentTime, 0.1);
  }

  function blip(frequency, duration, type, volume) {
    if (!ensure()) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume ?? 0.16, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch {
      // Sound is decoration; never let it break the game.
    }
  }

  function uiClick() {
    blip(660, 0.07, 'triangle', 0.14);
  }

  function missionChime() {
    blip(523, 0.12, 'sine', 0.18);
    setTimeout(() => blip(784, 0.18, 'sine', 0.18), 110);
  }

  function wantedSting() {
    blip(220, 0.16, 'square', 0.12);
    setTimeout(() => blip(174, 0.22, 'square', 0.12), 150);
  }

  // Two-tone police siren: one triangle oscillator alternating 750/950 Hz.
  // Call every frame; `active` is false when no chase is running, `dist` is
  // the distance to the nearest police unit (the siren fades with it).
  function updateSiren(active, dist, time) {
    if (!context) return;
    if (active && !sirenOsc) {
      try {
        sirenOsc = context.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 750;
        sirenGain = context.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      } catch {
        sirenOsc = null;
        return;
      }
    }
    if (!sirenOsc) return;
    sirenOn = !!active;
    const target = active ? Math.max(0.015, 0.085 - Math.max(0, dist - 10) * 0.0012) : 0;
    sirenGain.gain.setTargetAtTime(target, context.currentTime, 0.15);
    if (active) {
      const hi = Math.floor(time * 2.2) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(hi ? 950 : 720, context.currentTime, 0.05);
    }
  }

  // Low thump for a punch; a sharper crack on top when it connects.
  function punchThud(hit) {
    blip(72, 0.13, 'sine', 0.32);
    if (hit) setTimeout(() => blip(190, 0.07, 'square', 0.14), 30);
  }

  // Busted sting: three descending notes.
  function bustedSting() {
    blip(392, 0.14, 'square', 0.13);
    setTimeout(() => blip(311, 0.14, 'square', 0.13), 140);
    setTimeout(() => blip(233, 0.26, 'square', 0.13), 280);
  }

  // Footstep tick while walking/running; dt is the frame delta.
  function footstep(moving, running, dt) {
    if (!context || !moving) return;
    stepTimer -= dt;
    if (stepTimer > 0) return;
    stepTimer = running ? 0.32 : 0.48;
    blip(90 + Math.random() * 30, 0.05, 'sine', 0.07);
  }

  return { unlock, updateEngine, uiClick, missionChime, wantedSting, footstep, updateSiren, punchThud, bustedSting, get sirenActive() { return sirenOn; } };
}
