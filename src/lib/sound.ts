let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  const a = ac();
  if (!a || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number) {
  const a = ac();
  if (!a || muted) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = vol;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1800;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  unlock: () => ac(),
  select: () => tone(660, 0.06, "triangle", 0.08),
  move: () => {
    tone(220, 0.08, "sine", 0.2, 0, 140);
    noise(0.05, 0.15);
  },
  capture: (combo = 1) => {
    noise(0.18, 0.4);
    tone(140, 0.2, "square", 0.12, 0, 60);
    tone(440 * Math.pow(1.12, Math.min(combo, 8)), 0.12, "triangle", 0.1, 0.05);
  },
  check: () => {
    tone(880, 0.1, "sawtooth", 0.08);
    tone(660, 0.15, "sawtooth", 0.08, 0.1);
  },
  illegal: () => tone(120, 0.12, "square", 0.08, 0, 90),
  promote: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, "triangle", 0.1, i * 0.06)),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, "triangle", 0.12, i * 0.1)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, "sine", 0.12, i * 0.15)),
  click: () => tone(520, 0.04, "square", 0.05),
};
