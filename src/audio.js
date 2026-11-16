let ctx = null;

function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) ctx = new AudioCtx();
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

export function playCountdownTick() {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(45, ac.currentTime + 0.14);
  gain.gain.setValueAtTime(0.35, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.16);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.17);
}

export function playHorn() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const freqs = [146.83, 220.0, 293.66]; // D3, A3, D4
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = i === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(f * 0.96, now);
    osc.frequency.linearRampToValueAtTime(f, now + 0.08);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.56);
  });
}

export function playWhoosh() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const bufferSize = ac.sampleRate * 0.18;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.exponentialRampToValueAtTime(280, now + 0.18);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  noise.start(now);
}

export function playHit(isHeadshot = false) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = isHeadshot ? 'square' : 'triangle';
  osc.frequency.setValueAtTime(isHeadshot ? 240 : 150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.16);
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.19);
}

export function playMiss() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.1);
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

export function playVictory() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const notes = [293.66, 369.99, 440.0, 587.33]; // D major fanfare
  notes.forEach((f, idx) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    const start = now + idx * 0.11;
    osc.frequency.setValueAtTime(f, start);
    gain.gain.setValueAtTime(0.18, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.36);
  });
}

export function playDefeat() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const notes = [220, 196, 164.81];
  notes.forEach((f, idx) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    const start = now + idx * 0.18;
    osc.frequency.setValueAtTime(f, start);
    gain.gain.setValueAtTime(0.12, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.42);
  });
}
