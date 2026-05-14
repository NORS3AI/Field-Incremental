// Web Audio: procedural FX + simple looping ambient music.
// Music and FX have independent gain nodes routed through a master mute.
(function () {
  let ctx = null;
  let masterGain, musicGain, fxGain;
  let musicTimer = null;
  let musicOn = false;
  let started = false;

  const state = {
    musicVolume: 0.5,
    fxVolume: 0.5,
    muted: false
  };

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    musicGain = ctx.createGain();
    fxGain = ctx.createGain();
    musicGain.connect(masterGain);
    fxGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    applyVolumes();
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const m = state.muted ? 0 : 1;
    masterGain.gain.value = m;
    musicGain.gain.value = state.musicVolume * 0.25; // ambient is quiet by design
    fxGain.gain.value = state.fxVolume * 0.6;
  }

  function setMusicVolume(v) { state.musicVolume = clamp01(v); applyVolumes(); }
  function setFxVolume(v) { state.fxVolume = clamp01(v); applyVolumes(); }
  function setMuted(b) { state.muted = !!b; applyVolumes(); }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // Resume on first user gesture (browser policy).
  function unlock() {
    ensureCtx();
    if (ctx && ctx.state === "suspended") ctx.resume();
    started = true;
  }

  // --- FX ---
  function playTap() {
    if (!ensureCtx() || state.muted) return;
    const t = ctx.currentTime;
    // short noise burst
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(bp).connect(g).connect(fxGain);
    src.start(t);
    src.stop(t + 0.1);
  }

  function playHarvest(pitch) {
    if (!ensureCtx() || state.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const base = pitch || 660;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(fxGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function playPurchase() {
    if (!ensureCtx() || state.muted) return;
    const t = ctx.currentTime;
    [0, 0.08, 0.16].forEach((dt, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = [523, 659, 784][i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.4, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.18);
      osc.connect(g).connect(fxGain);
      osc.start(t + dt);
      osc.stop(t + dt + 0.2);
    });
  }

  // --- Music (slow ambient pad arpeggio) ---
  // Pentatonic over a gentle C major-ish pad. Notes every ~1.2s.
  const SCALE = [261.63, 329.63, 392.00, 440.00, 523.25, 659.25]; // C E G A C E
  let stepIdx = 0;

  function scheduleNote() {
    if (!ctx || !musicOn) return;
    const t = ctx.currentTime + 0.02;
    const f = SCALE[stepIdx % SCALE.length];
    stepIdx++;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;

    // Soft pad voice: detuned second osc
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = f * 0.5; // octave down
    osc2.detune.value = 6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;

    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(g).connect(musicGain);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + 2.1);
    osc2.stop(t + 2.1);
  }

  function startMusic() {
    if (musicOn) return;
    ensureCtx();
    if (!ctx) return;
    musicOn = true;
    scheduleNote();
    musicTimer = setInterval(scheduleNote, 1400);
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  window.Audio2 = {
    unlock,
    setMusicVolume, setFxVolume, setMuted,
    playTap, playHarvest, playPurchase,
    startMusic, stopMusic,
    get started() { return started; }
  };
})();
