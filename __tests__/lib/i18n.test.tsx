import { act, render, screen } from '@testing-library/react';
import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';
import { QUESTIONS_FR, translateQuestion } from '@/lib/questions.fr';
import { LANG_STORAGE, getSavedLang, saveLang, text, useT } from '@/lib/i18n';

describe('French question text', () => {
  const english = new Set<string>();
  RIDDLE_POOL.forEach((r) => [r.hint, ...r.options].forEach((x) => english.add(x)));
  TRIVIA_POOL.forEach((q) => [q.question, ...q.options].forEach((x) => english.add(x)));

  it('translates every riddle hint and every trivia question', () => {
    const missing = [
      ...RIDDLE_POOL.map((r) => r.hint),
      ...TRIVIA_POOL.map((q) => q.question),
    ].filter((x) => !(x in QUESTIONS_FR));
    expect(missing).toEqual([]);
  });

  it('has no entries for text that is not in the pools', () => {
    expect(Object.keys(QUESTIONS_FR).filter((key) => !english.has(key))).toEqual([]);
  });

  it('keeps every answer distinct from the other options of its question once translated', () => {
    for (const q of [...RIDDLE_POOL, ...TRIVIA_POOL]) {
      const shown = q.options.map(translateQuestion);
      expect(new Set(shown).size).toBe(q.options.length);
    }
  });

  it('falls back to the English text when it reads the same in French', () => {
    expect(translateQuestion('GPU')).toBe('GPU');
    expect(translateQuestion('Black Hole')).toBe('Trou noir');
  });
});

describe('language choice', () => {
  beforeEach(() => localStorage.clear());

  it('has no language until one is picked, then remembers it', () => {
    expect(getSavedLang()).toBeNull();
    saveLang('fr');
    expect(getSavedLang()).toBe('fr');
    expect(localStorage.getItem(LANG_STORAGE)).toBe('fr');
  });

  it('fills in values', () => {
    expect(text('en', 'result.total', { total: 120, rank: 3 })).toBe("Your total: 120 pts · You're #3");
    expect(text('fr', 'riddles.question', { n: 2, total: 5 })).toBe('Question 2 sur 5');
  });

  it('re-renders components when the language changes', () => {
    function Probe() {
      const { t, tq } = useT();
      return <p>{`${t('game.continue')} / ${tq('Microscope')} / ${tq('Telescope')}`}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('Continue / Microscope / Telescope')).toBeInTheDocument();
    act(() => saveLang('fr'));
    expect(screen.getByText('Continuer / Microscope / Télescope')).toBeInTheDocument();
  });
});
