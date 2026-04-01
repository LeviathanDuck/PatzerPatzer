export type EngineMode = 'analysis' | 'play';

export interface EngineStrengthConfig {
  level: number;
  label: string;
  uciElo: number;
  maxDepth: number;
  description: string;
}

export const STRENGTH_LEVELS: EngineStrengthConfig[] = [
  { level: 1, label: 'Beginner',     uciElo: 1320, maxDepth:  1, description: 'Frequent blunders' },
  { level: 2, label: 'Casual',       uciElo: 1500, maxDepth:  3, description: 'Weak tactics' },
  { level: 3, label: 'Club Novice',  uciElo: 1650, maxDepth:  5, description: 'Basic tactics' },
  { level: 4, label: 'Club Player',  uciElo: 1800, maxDepth:  8, description: 'Solid tactics' },
  { level: 5, label: 'Tournament',   uciElo: 2000, maxDepth: 12, description: 'Strong tactics' },
  { level: 6, label: 'Expert',       uciElo: 2200, maxDepth: 16, description: 'Few mistakes' },
  { level: 7, label: 'Master',       uciElo: 2500, maxDepth: 22, description: 'Near-optimal' },
  { level: 8, label: 'Full Strength',uciElo: 3190, maxDepth: 30, description: 'UCI_LimitStrength off' },
];

export const DEFAULT_STRENGTH_LEVEL = 4;
