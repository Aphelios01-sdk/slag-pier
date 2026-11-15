/** Procedural SFX via Web Audio — no external samples. */
export function createAudio() {
  let ctx = null;
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function beep(freq, dur, type = 'square', gain = 0.08, slide = 0) {
    const c = ensure();
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, gain = 0.12, filterFreq = 1200) {
    const c = ensure();
    const n = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = n;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }
  return {
    resume: ensure,
    fire(kind) {
      if (kind === 'shotgun') { noise(0.18, 0.22, 900); beep(90, 0.12, 'sawtooth', 0.1, -40); }
      else if (kind === 'pistol') { noise(0.06, 0.1, 2500); beep(220, 0.05, 'square', 0.06, -80); }
      else if (kind === 'smg') { noise(0.04, 0.08, 2800); beep(180, 0.04, 'square', 0.05, -60); }
      else { noise(0.07, 0.14, 1800); beep(140, 0.07, 'sawtooth', 0.08, -50); }
    },
    reload() { beep(420, 0.05, 'triangle', 0.04); setTimeout(() => beep(320, 0.06, 'triangle', 0.05), 120); },
    hit() { beep(880, 0.04, 'sine', 0.05); },
    headshot() { beep(1400, 0.06, 'sine', 0.07); beep(900, 0.08, 'triangle', 0.04); },
    plant() { beep(520, 0.08, 'square', 0.05); },
    defuse() { beep(360, 0.1, 'triangle', 0.05); },
    buy() { beep(660, 0.05, 'sine', 0.04); },
    round() { beep(200, 0.15, 'sawtooth', 0.06, 100); },
    explode() { noise(0.4, 0.28, 400); beep(60, 0.3, 'sawtooth', 0.12, -30); },
    foot() { noise(0.03, 0.03, 600); },
  };
}
