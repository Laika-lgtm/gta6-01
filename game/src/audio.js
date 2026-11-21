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

  // Footstep tick while walking/running; dt is the frame delta.
  function footstep(moving, running, dt) {
    if (!context || !moving) return;
    stepTimer -= dt;
    if (stepTimer > 0) return;
    stepTimer = running ? 0.32 : 0.48;
    blip(90 + Math.random() * 30, 0.05, 'sine', 0.07);
  }

  return { unlock, updateEngine, uiClick, missionChime, wantedSting, footstep };
}
