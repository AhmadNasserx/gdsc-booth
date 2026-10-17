import { TABS, type Tab } from './types';

export interface GameMeta {
  id: Tab;
  emoji: string;
  title: string;
  tagline: string;
  howItScores: string;
}

export const GAMES: Record<Tab, GameMeta> = {
  riddles: {
    id: 'riddles',
    emoji: '🧩',
    title: 'Emoji Riddles',
    tagline: 'Decode 5 emoji puzzles',
    howItScores: 'Every correct answer scores',
  },
  memory: {
    id: 'memory',
    emoji: '🧠',
    title: 'Memory Match',
    tagline: 'Flip cards and match 8 tech pairs',
    howItScores: 'Fewer moves and less time, bigger score',
  },
  bugs: {
    id: 'bugs',
    emoji: '🐞',
    title: 'Bug Hunter',
    tagline: 'Spot the bug in Java code',
    howItScores: 'Every bug you catch scores',
  },
};

export const GAME_LIST: GameMeta[] = TABS.map((tab) => GAMES[tab]);
