export type EngineMode = 'analysis' | 'play';

export interface EngineStrengthConfig {
  level: number;
  uciElo: number;
  maxDepth: number;
}
































export const STRENGTH_LEVELS: EngineStrengthConfig[] = [
  { level: 1, uciElo: 1320, maxDepth:  1 },
  { level: 2, uciElo: 1450, maxDepth:  2 },
  { level: 3, uciElo: 1600, maxDepth:  3 },
  { level: 4, uciElo: 1750, maxDepth:  4 },
  { level: 5, uciElo: 1900, maxDepth:  6 },
  { level: 6, uciElo: 2200, maxDepth:  8 },
  { level: 7, uciElo: 2500, maxDepth: 10 },
  { level: 8, uciElo: 3190, maxDepth: 12 },
];

export const DEFAULT_STRENGTH_LEVEL = 4;
