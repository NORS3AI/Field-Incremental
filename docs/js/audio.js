// Web Audio: procedural FX + step-sequenced synthwave music.
// Music and FX have independent gain nodes routed through a master mute.
(function () {
  let ctx = null;
  let masterGain, musicGain, fxGain, leadDelay, leadFb, leadDelayMix;
  let musicOn = false;
  let started = false;

  // Sequencer state
  const BPM = 96;
  const SEC_PER_STEP = 60 / BPM / 4; // 16th notes
  const PATTERN_LEN = 64; // 4 bars × 16 steps
  let currentStep = 0;
  let nextNoteTime = 0;
  let schedulerTimer = null;
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.12;

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

    // Lead delay line: dotted-8th (3 × 16th)
    leadDelay = ctx.createDelay(1.5);
    leadDelay.delayTime.value = SEC_PER_STEP * 3;
    leadFb = ctx.createGain();
    leadFb.gain.value = 0.38;
    leadDelayMix = ctx.createGain();
    leadDelayMix.gain.value = 0.55;
    leadDelay.connect(leadFb);
    leadFb.connect(leadDelay);
    leadDelay.connect(leadDelayMix);
    leadDelayMix.connect(musicGain);

    applyVolumes();
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const m = state.muted ? 0 : 1;
    masterGain.gain.value = m;
    musicGain.gain.value = state.musicVolume * 0.5;
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

  // --- Synthwave music ---
  // A-minor progression: Am – F – C – G, one bar each.
  // Frequencies are bass-register roots; lead plays an octave higher.
  const CHORDS = [
    { root: 110.00, third: 130.81, fifth: 164.81 }, // A2 Am  (A C E)
    { root:  87.31, third: 110.00, fifth: 130.81 }, // F2 F   (F A C)
    { root: 130.81, third: 164.81, fifth: 196.00 }, // C3 C   (C E G)
    { root:  98.00, third: 123.47, fifth: 146.83 }  // G2 G   (G B D)
  ];

  // 16-step bar patterns (1 = play, 0 = rest).
  const KICK  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0];
  const SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
  const HAT   = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1]; // 8ths + one ghost 16th
  const BASS  = [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0]; // sync'd 8th pulse

  // Lead arpeggio plays every 16th over chord tones [R, 3rd, 5th, octave].
  // Index pattern across the bar (1 octave up over chord).
  const ARP   = [0,2,1,3, 2,0,3,1, 0,2,1,3, 4,3,2,1]; // 4 = upper-octave root

  function chordToneFreq(chord, idx) {
    switch (idx) {
      case 0: return chord.root * 2;
      case 1: return chord.third * 2;
      case 2: return chord.fifth * 2;
      case 3: return chord.root * 4;
      case 4: return chord.root * 4;
      default: return chord.root * 2;
    }
  }

  function scheduleStep(step, t) {
    const stepInBar = step % 16;
    const barIdx = Math.floor(step / 16) % 4;
    const chord = CHORDS[barIdx];

    if (KICK[stepInBar])  playKick(t);
    if (SNARE[stepInBar]) playSnare(t);
    if (HAT[stepInBar])   playHat(t, stepInBar === 15);
    if (BASS[stepInBar])  playBass(chord.root, t);
    // Lead on every odd step (off-beats) for a driving 8th-note arp
    if (stepInBar % 2 === 0) {
      const arpIdx = ARP[stepInBar];
      playLead(chordToneFreq(chord, arpIdx), t);
    }
    if (stepInBar === 0) playPad(chord, t, SEC_PER_STEP * 16);
  }

  function playKick(t) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.10);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
    osc.connect(g).connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  function playSnare(t) {
    const dur = 0.18;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(hp).connect(g).connect(musicGain);
    src.start(t);

    // Body tone for snap
    const tone = ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = 220;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.18, t + 0.003);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    tone.connect(tg).connect(musicGain);
    tone.start(t);
    tone.stop(t + 0.1);
  }

  function playHat(t, open) {
    const dur = open ? 0.10 : 0.04;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    const peak = open ? 0.10 : 0.08;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp).connect(g).connect(musicGain);
    src.start(t);
  }

  function playBass(freq, t) {
    const dur = 0.28;
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = freq;
    osc2.detune.value = -10;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq / 2;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(250, t + 0.2);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc1.connect(lp);
    osc2.connect(lp);
    lp.connect(g);
    sub.connect(g);
    g.connect(musicGain);

    osc1.start(t); osc2.start(t); sub.start(t);
    osc1.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  function playLead(freq, t) {
    const dur = 0.18;
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = freq;
    osc2.detune.value = 9;
    const osc3 = ctx.createOscillator();
    osc3.type = "square";
    osc3.frequency.value = freq * 0.5;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.18);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc1.connect(lp); osc2.connect(lp); osc3.connect(lp);
    lp.connect(g);
    g.connect(musicGain);
    g.connect(leadDelay); // send to delay line

    osc1.start(t); osc2.start(t); osc3.start(t);
    osc1.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
    osc3.stop(t + dur + 0.02);
  }

  function playPad(chord, t, dur) {
    const freqs = [chord.root, chord.third, chord.fifth];
    freqs.forEach(f => {
      const osc1 = ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = f * 2;
      const osc2 = ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = f * 2;
      osc2.detune.value = 8;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.6);
      g.gain.setValueAtTime(0.07, t + dur - 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc1.connect(lp); osc2.connect(lp);
      lp.connect(g).connect(musicGain);

      osc1.start(t); osc2.start(t);
      osc1.stop(t + dur + 0.05);
      osc2.stop(t + dur + 0.05);
    });
  }

  function scheduler() {
    if (!ctx || !musicOn) return;
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(currentStep, nextNoteTime);
      nextNoteTime += SEC_PER_STEP;
      currentStep = (currentStep + 1) % PATTERN_LEN;
    }
  }

  function startMusic() {
    if (musicOn) return;
    ensureCtx();
    if (!ctx) return;
    musicOn = true;
    currentStep = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    scheduler();
    schedulerTimer = setInterval(scheduler, LOOKAHEAD_MS);
  }

  function stopMusic() {
    musicOn = false;
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
  }

  window.Audio2 = {
    unlock,
    setMusicVolume, setFxVolume, setMuted,
    playTap, playHarvest, playPurchase,
    startMusic, stopMusic,
    get started() { return started; }
  };
})();
