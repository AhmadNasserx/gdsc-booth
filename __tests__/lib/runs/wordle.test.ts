/**
 * @jest-environment node
 */
import { applyWordleGuess, evaluateGuess, hydrateWordle, parseWordleAction, startWordle } from '@/lib/runs/wordle';
import { WORDLE_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';

const C = 'correct';
const P = 'present';
const A = 'absent';

describe('evaluateGuess', () => {
  it('marks an exact match as all correct', () => {
    expect(evaluateGuess('REACT', 'REACT')).toEqual([C, C, C, C, C]);
  });

  it('marks letters not in the word as absent', () => {
    expect(evaluateGuess('QZXJV', 'REACT')).toEqual([A, A, A, A, A]);
  });

  it('marks misplaced letters as present', () => {
    // TRACE against REACT: A and C are in place; T, R and E are elsewhere in the word
    expect(evaluateGuess('TRACE', 'REACT')).toEqual([P, P, C, C, P]);
  });

  it('does not mark extra copies of a letter that the word has once', () => {
    // CCCCC against CACHE (two Cs): only the two Cs in the word are used up
    expect(evaluateGuess('CCCCC', 'CACHE')).toEqual([C, A, C, A, A]);
  });

  it('marks only as many repeats as the word contains', () => {
    // OOOOO against ROBOT (two Os): the two exact matches use up both Os
    expect(evaluateGuess('OOOOO', 'ROBOT')).toEqual([A, C, A, C, A]);
  });

  it('counts a repeated guess letter as present only once per copy in the word', () => {
    // EERIE against SPEED (two Es): both Es in the word are used by the first two guess Es
    expect(evaluateGuess('EERIE', 'SPEED')).toEqual([P, P, A, A, A]);
  });

  it('prefers a correct position over a present one for the same letter', () => {
    // ELVES against LEVEL: the V and the second E are in place, so the first E is present
    expect(evaluateGuess('ELVES', 'LEVEL')).toEqual([P, P, C, C, A]);
  });

  it('gives a letter present when the word has it only in a different position', () => {
    expect(evaluateGuess('ABCDE', 'EDCBA')).toEqual([P, P, C, P, P]);
  });

  it('always returns five states', () => {
    for (const { word } of WORDLE_POOL) {
      expect(evaluateGuess('ABCDE', word)).toHaveLength(5);
    }
  });
});

describe('startWordle', () => {
  it('returns only the game name in the view, never the word or the hint', () => {
    const { view, state } = startWordle();
    expect(view).toEqual({ game: 'wordle' });
    expect(JSON.stringify(view)).not.toContain(state.word);
    expect(state.word).toMatch(/^[A-Z]{5}$/);
  });

  it('picks a word from the pool with its hint', () => {
    const { state } = startWordle(undefined, () => 0);
    expect(WORDLE_POOL[0]).toEqual({ word: state.word, hint: state.hint });
    expect(state.guesses).toEqual([]);
  });
});

describe('hydrateWordle', () => {
  it('turns a missing guesses list (RTDB drops empty arrays) into an empty list', () => {
    expect(hydrateWordle({ word: 'REACT', hint: 'x' }).guesses).toEqual([]);
  });
});

describe('parseWordleAction', () => {
  it('accepts five letters and upper-cases them', () => {
    expect(parseWordleAction({ guess: 'react' })).toEqual({ guess: 'REACT' });
  });

  it.each([
    ['too short', 'REAC'],
    ['too long', 'REACTS'],
    ['digits', 'RE4CT'],
    ['spaces', 'RE CT'],
    ['accented letter', 'RÉACT'],
    ['empty', ''],
  ])('rejects a guess that is %s', (_label, guess) => {
    expect(() => parseWordleAction({ guess })).toThrow(RunError);
  });

  it('rejects a non-string guess', () => {
    expect(() => parseWordleAction({ guess: 12345 })).toThrow(RunError);
    expect(() => parseWordleAction({})).toThrow(RunError);
  });
});

describe('applyWordleGuess', () => {
  const state = { word: 'REACT', hint: 'Component-based UI library by Meta', guesses: [] as string[] };

  it('solves on the first guess with full performance and no word in the response', () => {
    const step = applyWordleGuess(state, { guess: 'REACT' });
    expect(step.performance).toBe(1);
    expect(step.response).toEqual({ states: [C, C, C, C, C], solved: true });
    expect(step.response).not.toHaveProperty('word');
    expect(step.response).not.toHaveProperty('hint');
  });

  it('shows no hint before the second guess', () => {
    const step = applyWordleGuess(state, { guess: 'TRACE' });
    expect(step.response).not.toHaveProperty('hint');
    expect(step.performance).toBeUndefined();
  });

  it('shows the hint from the second guess onwards', () => {
    const first = applyWordleGuess(state, { guess: 'TRACE' });
    const second = applyWordleGuess(first.state, { guess: 'CRANE' });
    expect(second.response.hint).toBe(state.hint);
  });

  it('does not reveal the word while the game continues', () => {
    const step = applyWordleGuess(state, { guess: 'TRACE' });
    expect(JSON.stringify(step.response)).not.toContain('REACT');
  });

  it('finishes after six wrong guesses with zero performance and reveals the word', () => {
    let s = state;
    let last;
    for (let i = 0; i < 6; i++) {
      last = applyWordleGuess(s, { guess: 'QZXJV' });
      s = last.state;
    }
    expect(last?.performance).toBe(0);
    expect(last?.response.solved).toBe(false);
    expect(last?.response.word).toBe('REACT');
  });

  it('scores a sixth-guess solve at 50 out of 300 performance', () => {
    let s = state;
    for (let i = 0; i < 5; i++) s = applyWordleGuess(s, { guess: 'QZXJV' }).state;
    const step = applyWordleGuess(s, { guess: 'REACT' });
    expect(step.performance).toBeCloseTo(50 / 300);
  });

  it('refuses a seventh guess', () => {
    let s = state;
    for (let i = 0; i < 6; i++) s = applyWordleGuess(s, { guess: 'QZXJV' }).state;
    expect(() => applyWordleGuess(s, { guess: 'REACT' })).toThrow(RunError);
  });
});
