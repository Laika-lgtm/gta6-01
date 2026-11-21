// Procedural WebAudio only: no audio files. A low engine hum whose pitch
// follows speed, soft footstep ticks while walking, a two-note UI blip and
// a short police siren swell. Everything is built from oscillators and
// noise buffers at boot; nothing is fetched.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;
  let sirenOn = false;
  let sirenNodes = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    ctx._master = master;
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function setEngine(speed, maxSpeed, driving) {
    if (!ctx || muted) return;
    const target = driving ? 0.05 + (Math.abs(speed) / maxSpeed) * 0.09 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(52 + Math.abs(speed) * 3.2, ctx.currentTime, 0.08);
  }

  function footstep() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, 2205, 44100);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx._master);
    src.start(t);
  }

  function blip(high) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 880 : 620, t);
    osc.frequency.setValueAtTime(high ? 1320 : 880, t + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(ctx._master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function setSiren(on) {
    if (on === sirenOn) return;
    sirenOn = on;
    if (!ctx) return;
    if (!on) {
      if (sirenNodes) {
        try { sirenNodes.osc.stop(); } catch { /* already stopped */ }
        sirenNodes = null;
      }
      return;
    }
    if (muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 750;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(ctx._master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo };
  }

  function toggleMute() {
    muted = !muted;
    if (ctx) ctx._master.gain.value = muted ? 0 : 0.5;
    if (muted) setSiren(false);
    return muted;
  }

  return { resume, setEngine, footstep, blip, setSiren, toggleMute, isMuted: () => muted };
}
