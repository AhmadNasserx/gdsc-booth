import { TABS, type Tab } from './types';

export interface GameMeta {
  id: Tab;
  emoji: string;
  title: string;
  tagline: string;
  howItScores: string;
  maxRaw: number;
}

export const GAMES: Record<Tab, GameMeta> = {
  riddles: {
    id: 'riddles',
    emoji: '🧩',
    title: 'Emoji Riddles',
    tagline: 'Decode 5 emoji puzzles',
    howItScores: '40 pts each',
    maxRaw: 200,
  },
  trivia: {
    id: 'trivia',
    emoji: '⚡',
    title: 'Tech Trivia',
    tagline: '15 fast questions',
    howItScores: '+20 right / −10 wrong',
    maxRaw: 300,
  },
  password: {
    id: 'password',
    emoji: '🔐',
    title: 'Password Challenge',
    tagline: 'Craft the strongest password',
    howItScores: 'Length, variety and no predictable patterns',
    maxRaw: 200,
  },
  wordle: {
    id: 'wordle',
    emoji: '🟩',
    title: 'Tech Wordle',
    tagline: 'Guess the 5-letter tech word in 6 tries',
    howItScores: 'Fewer guesses, more points',
    maxRaw: 300,
  },
  memory: {
    id: 'memory',
    emoji: '🧠',
    title: 'Memory Match',
    tagline: 'Flip cards and match 8 tech pairs',
    howItScores: 'Fewer moves and seconds, more points',
    maxRaw: 1000,
  },
  bugs: {
    id: 'bugs',
    emoji: '🐞',
    title: 'Bug Hunter',
    tagline: 'Spot the bug in Java code',
    howItScores: '40 pts each',
    maxRaw: 200,
  },
};

export const GAME_LIST: GameMeta[] = TABS.map((tab) => GAMES[tab]);
