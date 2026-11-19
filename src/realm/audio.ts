/** Tiny synthesised sound set: no asset files, works offline. */
type Tone = { freq: number; to?: number; dur: number; type?: OscillatorType; gain?: number; delay?: number };

const CUES: Record<string, Tone[]> = {
  tick: [{ freq: 520, dur: 0.05, gain: 0.08 }],
  hit: [{ freq: 660, to: 880, dur: 0.09, type: "triangle" }],
  perfect: [{ freq: 780, dur: 0.08, type: "triangle" }, { freq: 1170, dur: 0.14, type: "triangle", delay: 0.07 }],
  pass: [{ freq: 220, to: 110, dur: 0.12, type: "square", gain: 0.1 }],
  warn: [{ freq: 300, dur: 0.12, type: "sawtooth", gain: 0.07 }, { freq: 300, dur: 0.12, type: "sawtooth", gain: 0.07, delay: 0.18 }],
  cast: [{ freq: 196, to: 392, dur: 0.5, type: "sawtooth", gain: 0.08 }],
  boom: [{ freq: 140, to: 50, dur: 0.25, type: "sawtooth", gain: 0.12 }],
  hurt: [{ freq: 180, to: 70, dur: 0.3, type: "square", gain: 0.12 }],
  dodge: [{ freq: 500, to: 900, dur: 0.12, gain: 0.08 }],
  interrupt: [{ freq: 440, dur: 0.08, type: "square", gain: 0.1 }, { freq: 880, dur: 0.2, type: "square", gain: 0.1, delay: 0.08 }],
  signature: [
    { freq: 392, dur: 0.12, type: "triangle" },
    { freq: 523, dur: 0.12, type: "triangle", delay: 0.1 },
    { freq: 784, dur: 0.3, type: "triangle", delay: 0.2 }
  ],
  down: [{ freq: 300, to: 80, dur: 0.6, type: "triangle", gain: 0.14 }],
  revive: [{ freq: 330, to: 660, dur: 0.3, type: "triangle" }],
  victory: [
    { freq: 523, dur: 0.14, type: "triangle" },
    { freq: 659, dur: 0.14, type: "triangle", delay: 0.14 },
    { freq: 784, dur: 0.14, type: "triangle", delay: 0.28 },
    { freq: 1047, dur: 0.4, type: "triangle", delay: 0.42 }
  ],
  ready: [{ freq: 440, dur: 0.1 }, { freq: 660, dur: 0.18, delay: 0.1 }]
};

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/** Browsers only allow audio after a click or key press; call this from one. */
export function unlockAudio(): void {
  try {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctx && Ctor) ctx = new Ctor();
    if (ctx?.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function playCue(name: string): void {
  const tones = CUES[name];
  if (!ctx || muted || !tones || ctx.state !== "running") return;
  const now = ctx.currentTime;
  for (const tone of tones) {
    const start = now + (tone.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.dur);
    gain.gain.setValueAtTime(tone.gain ?? 0.12, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + tone.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.dur + 0.02);
  }
}
