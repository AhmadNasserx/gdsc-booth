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
  trivia: {
    id: 'trivia',
    emoji: '⚡',
    title: 'Tech Trivia',
    tagline: '15 fast questions',
    howItScores: 'Right answers add, wrong ones cost you',
  },
};

export const GAME_LIST: GameMeta[] = TABS.map((tab) => GAMES[tab]);
