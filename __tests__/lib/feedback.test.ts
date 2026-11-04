import type * as FeedbackModule from '@/lib/feedback';

type FeedbackApi = typeof FeedbackModule;
type FeedbackKind = FeedbackModule.FeedbackKind;

const KINDS: FeedbackKind[] = ['tap', 'flip', 'match', 'thud', 'correct', 'wrong', 'streak', 'tick', 'finish', 'win'];

const PATTERNS: Record<FeedbackKind, number[]> = {
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

// Loads a fresh copy of the module, so its listeners, audio context and mute state start clean.
function loadFeedback(): FeedbackApi {
  let loaded: FeedbackApi | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@/lib/feedback') as FeedbackApi;
  });
  if (!loaded) throw new Error('lib/feedback did not load');
  return loaded;
}

function param() {
  return {
    value: jest.fn(),
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
  };
}

function audioNode() {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    type: 'sine',
    frequency: param(),
    gain: param(),
    Q: param(),
  };
}

interface FakeAudio {
  AudioContext: jest.Mock;
  createOscillator: jest.Mock;
  resume: jest.Mock;
}

// A fake AudioContext on window. The constructor is a mock, so tests can see when a context is created.
function installAudioContext(): FakeAudio {
  const createOscillator = jest.fn(() => audioNode());
  const resume = jest.fn(() => Promise.resolve());
  const AudioContext = jest.fn(() => ({
    createGain: jest.fn(() => audioNode()),
    createOscillator,
    createBiquadFilter: jest.fn(() => audioNode()),
    destination: {},
    state: 'running',
    currentTime: 0,
    resume,
  }));
  Object.defineProperty(window, 'AudioContext', { value: AudioContext, configurable: true, writable: true });
  return { AudioContext, createOscillator, resume };
}

function installVibrate(impl?: () => void): jest.Mock {
  const vibrate = jest.fn(impl);
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  return vibrate;
}

// The first gesture is what unlocks audio in the browser.
function pointerDown(): void {
  window.dispatchEvent(new Event('pointerdown'));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'vibrate');
  Reflect.deleteProperty(window, 'AudioContext');
});

describe('feedback', () => {
  it.each(KINDS)('does not throw for %s when AudioContext and vibrate are missing', (kind) => {
    const { feedback } = loadFeedback();
    expect(() => feedback(kind)).not.toThrow();
  });

  it.each(KINDS)('vibrates the pattern for %s', (kind) => {
    const vibrate = installVibrate();
    const { feedback } = loadFeedback();
    feedback(kind);
    expect(vibrate).toHaveBeenCalledWith(PATTERNS[kind]);
  });

  it('does not throw when vibrate throws', () => {
    installVibrate(() => {
      throw new Error('blocked');
    });
    const { feedback } = loadFeedback();
    expect(() => feedback('correct')).not.toThrow();
  });

  it('plays nothing before the first gesture', () => {
    const audio = installAudioContext();
    const { feedback } = loadFeedback();
    feedback('tap');
    expect(audio.AudioContext).not.toHaveBeenCalled();
    expect(audio.resume).not.toHaveBeenCalled();
    expect(audio.createOscillator).not.toHaveBeenCalled();
  });

  it('creates and resumes the context on the first gesture', () => {
    const audio = installAudioContext();
    loadFeedback();
    pointerDown();
    expect(audio.AudioContext).toHaveBeenCalled();
    expect(audio.resume).toHaveBeenCalled();
  });

  it('plays a sound after a gesture when not muted', () => {
    const audio = installAudioContext();
    const { feedback } = loadFeedback();
    pointerDown();
    feedback('tap');
    expect(audio.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('is silent when muted but still vibrates', () => {
    const audio = installAudioContext();
    const vibrate = installVibrate();
    const { feedback, setSoundMuted } = loadFeedback();
    pointerDown();
    setSoundMuted(true);
    feedback('tap');
    expect(audio.createOscillator).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(PATTERNS.tap);
  });
});

describe('sound mute', () => {
  it('is not muted by default', () => {
    const { isSoundMuted } = loadFeedback();
    expect(isSoundMuted()).toBe(false);
  });

  it('stores 1 when muted and 0 when unmuted', () => {
    const { setSoundMuted } = loadFeedback();
    setSoundMuted(true);
    expect(localStorage.getItem('gdscSoundMuted')).toBe('1');
    setSoundMuted(false);
    expect(localStorage.getItem('gdscSoundMuted')).toBe('0');
  });

  it('reads the stored choice in a fresh module', () => {
    loadFeedback().setSoundMuted(true);
    expect(loadFeedback().isSoundMuted()).toBe(true);
  });

  it('does not throw and keeps the in-memory value when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { isSoundMuted, setSoundMuted } = loadFeedback();
    expect(() => isSoundMuted()).not.toThrow();
    expect(isSoundMuted()).toBe(false);
    expect(() => setSoundMuted(true)).not.toThrow();
    expect(isSoundMuted()).toBe(true);
    expect(() => setSoundMuted(false)).not.toThrow();
    expect(isSoundMuted()).toBe(false);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const { setSoundMuted, subscribeSoundMuted } = loadFeedback();
    const listener = jest.fn();
    const unsubscribe = subscribeSoundMuted(listener);
    setSoundMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setSoundMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
