import { GAMES, GAME_LIST } from '@/lib/games';
import { TABS } from '@/lib/types';

describe('game metadata', () => {
  it('defines exactly the six TABS', () => {
    expect(TABS).toEqual(['riddles', 'trivia', 'password', 'wordle', 'memory', 'bugs']);
  });

  it('has an entry for every tab with matching id', () => {
    for (const tab of TABS) {
      expect(GAMES[tab].id).toBe(tab);
    }
  });

  it('lists games in TABS order', () => {
    expect(GAME_LIST.map((g) => g.id)).toEqual(TABS);
  });

  it('has the expected max raw scores', () => {
    expect(GAMES.riddles.maxRaw).toBe(200);
    expect(GAMES.trivia.maxRaw).toBe(300);
    expect(GAMES.password.maxRaw).toBe(200);
    expect(GAMES.wordle.maxRaw).toBe(300);
    expect(GAMES.memory.maxRaw).toBe(1000);
    expect(GAMES.bugs.maxRaw).toBe(200);
  });

  it('describes scoring without revealing per-item values, caps or totals', () => {
    for (const game of GAME_LIST) {
      expect(game.howItScores).not.toMatch(/\d/);
      expect(game.howItScores).not.toMatch(/max|out of|\/\s*1000|of 1000/i);
    }
  });

  it('has non-empty display fields for every game', () => {
    for (const game of GAME_LIST) {
      expect(game.emoji.length).toBeGreaterThan(0);
      expect(game.title.length).toBeGreaterThan(0);
      expect(game.tagline.length).toBeGreaterThan(0);
      expect(game.howItScores.length).toBeGreaterThan(0);
    }
  });
});
