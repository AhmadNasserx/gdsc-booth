// Sound and vibration for taps, verdicts, flips, matches, streaks and the finish.
// Sounds are synthesized with the Web Audio API, so no audio files are shipped.
// Every browser call is wrapped in try/catch: feedback is decoration and must never break a game.

export type FeedbackKind = 'tap' | 'flip' | 'match' | 'thud' | 'correct' | 'wrong' | 'streak' | 'tick' | 'finish' | 'win';

const MUTE_STORAGE = 'gdscSoundMuted';
const MASTER_GAIN = 0.18;
// Short fade-in so an oscillator never starts with a click.
const ATTACK_S = 0.008;
const SILENCE = 0.0001;

// Vibration patterns in milliseconds. Vibration is not affected by the sound mute.
const VIBRATE: Record<FeedbackKind, number[]> = {
  tap: [6],
  flip: [4],
  match: [12, 40, 22],
  thud: [28],
  correct: [18, 30, 36],
  wrong: [80],
  streak: [20, 40, 20, 40, 50],
  tick: [4],
  finish: [30, 60, 30, 60, 90],
  win: [40, 40, 40, 120],
};

interface Voice {
  type: OscillatorType;
  freq: number;
  /** Frequency the note glides to by its end. */
  sweepTo?: number;
  /** Seconds after the sound starts. */
  at: number;
  /** Seconds from start until the note is silent. */
  dur: number;
  /** Seconds into the note where the decay begins; the note holds its level until then. */
  hold?: number;
  peak: number;
  /** Lowpass cutoff in Hz, for a duller tone. */
  lowpass?: number;
}

const ARPEGGIO: Voice[] = [
  { type: 'triangle', freq: 523, at: 0, dur: 0.11, peak: 0.4 },
  { type: 'triangle', freq: 659, at: 0.11, dur: 0.11, peak: 0.4 },
  { type: 'triangle', freq: 784, at: 0.22, dur: 0.11, peak: 0.4 },
];

// Each sound stays under about 0.9 seconds.
const SOUNDS: Record<FeedbackKind, Voice[]> = {
  tap: [{ type: 'sine', freq: 880, at: 0, dur: 0.035, peak: 0.5 }],
  flip: [{ type: 'triangle', freq: 520, sweepTo: 780, at: 0, dur: 0.07, peak: 0.2 }],
  match: [
    { type: 'sine', freq: 1047, at: 0, dur: 0.07, peak: 0.35 },
    { type: 'sine', freq: 1319, at: 0.055, dur: 0.07, peak: 0.35 },
    { type: 'sine', freq: 1568, at: 0.11, dur: 0.07, peak: 0.35 },
  ],
  thud: [{ type: 'sine', freq: 140, sweepTo: 70, at: 0, dur: 0.12, peak: 0.35 }],
  correct: [
    { type: 'sine', freq: 659, at: 0, dur: 0.11, peak: 0.4 },
    { type: 'sine', freq: 988, at: 0.11, dur: 0.22, peak: 0.4, hold: 0.03 },
  ],
  // A dull, held buzz; the lowpass keeps it from sounding harsh.
  wrong: [{ type: 'sawtooth', freq: 150, at: 0, dur: 0.22, hold: 0.16, peak: 0.25, lowpass: 420 }],
  streak: [
    { type: 'square', freq: 880, at: 0, dur: 0.045, peak: 0.1 },
    { type: 'square', freq: 1175, at: 0.045, dur: 0.045, peak: 0.1 },
    { type: 'square', freq: 1568, at: 0.09, dur: 0.045, peak: 0.1 },
  ],
  tick: [{ type: 'square', freq: 1000, at: 0, dur: 0.022, peak: 0.08 }],
  finish: [
    ...ARPEGGIO,
    { type: 'triangle', freq: 1047, at: 0.33, dur: 0.42, peak: 0.4 },
  ],
  // The arpeggio ends on a held C6 and G5 chord, kept short enough to stay under 0.9 seconds.
  win: [
    ...ARPEGGIO,
    { type: 'triangle', freq: 1047, at: 0.33, dur: 0.5, peak: 0.35 },
    { type: 'triangle', freq: 784, at: 0.33, dur: 0.5, peak: 0.3 },
  ],
};

// One AudioContext for the page. Browsers only allow audio after a user gesture, so it is created then.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// null until the stored value is first needed in the browser.
let muted: boolean | null = null;
const listeners = new Set<() => void>();

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | undefined {
  // Older Safari only exposes the prefixed constructor.
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    const created = new Ctor();
    const gain = created.createGain();
    gain.gain.value = MASTER_GAIN;
    gain.connect(created.destination);
    ctx = created;
    master = gain;
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

function removeGestureListeners(): void {
  GESTURE_EVENTS.forEach((type) => window.removeEventListener(type, unlock, { capture: true }));
}

function unlock(): void {
  removeGestureListeners();
  const audio = ensureContext();
  if (!audio) return;
  try {
    void audio.resume().catch(() => {});
  } catch {
    // Some browsers return no promise; the context still starts on its own.
  }
}

// Module load: listen for the first gesture in the browser. Nothing runs on the server.
if (typeof window !== 'undefined') {
  GESTURE_EVENTS.forEach((type) => window.addEventListener(type, unlock, { capture: true, passive: true }));
}

function currentMuted(): boolean {
  if (muted !== null) return muted;
  if (typeof window === 'undefined') return false;
  try {
    muted = localStorage.getItem(MUTE_STORAGE) === '1';
  } catch {
    // Storage blocked: sound stays on for this page load.
    muted = false;
  }
  return muted;
}

function playVoice(audio: AudioContext, out: AudioNode, voice: Voice): void {
  const t0 = audio.currentTime + voice.at;
  const hold = voice.hold ?? ATTACK_S;

  const osc = audio.createOscillator();
  osc.type = voice.type;
  osc.frequency.setValueAtTime(voice.freq, t0);
  if (voice.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(voice.sweepTo, t0 + voice.dur);
  }

  const env = audio.createGain();
  env.gain.setValueAtTime(SILENCE, t0);
  env.gain.linearRampToValueAtTime(voice.peak, t0 + ATTACK_S);
  env.gain.setValueAtTime(voice.peak, t0 + hold);
  env.gain.exponentialRampToValueAtTime(SILENCE, t0 + voice.dur);

  if (voice.lowpass !== undefined) {
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.lowpass;
    filter.Q.value = 1;
    osc.connect(filter);
    filter.connect(env);
  } else {
    osc.connect(env);
  }
  env.connect(out);

  osc.start(t0);
  osc.stop(t0 + voice.dur + 0.02);
  // Release the nodes once the note has finished.
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}

function play(kind: FeedbackKind): void {
  if (currentMuted()) return;
  // Never create the context here: a sound before the first gesture is a silent no-op.
  if (!ctx || !master) return;
  const audio = ctx;
  const out = master;
  try {
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    for (const voice of SOUNDS[kind]) playVoice(audio, out, voice);
  } catch {
    // A failed sound must not break the game.
  }
}

function vibrate(kind: FeedbackKind): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([...VIBRATE[kind]]);
    }
  } catch {
    // Vibration is blocked or unsupported; the sound and visuals still show the result.
  }
}

/** Plays the sound for `kind` (unless muted) and fires its vibration. Never throws. */
export function feedback(kind: FeedbackKind): void {
  if (typeof window === 'undefined') return;
  vibrate(kind);
  play(kind);
}

/** Whether the player has turned game sounds off. Always false on the server. */
export function isSoundMuted(): boolean {
  return currentMuted();
}

/** Turns game sounds on or off and remembers the choice in this browser. */
export function setSoundMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_STORAGE, next ? '1' : '0');
  } catch {
    // The choice still applies for this page load.
  }
  listeners.forEach((listener) => listener());
}

/** Calls `listener` whenever the mute setting changes. Returns the unsubscribe function. */
export function subscribeSoundMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
