import type { ImportedGame } from '../import/types';
import type { PuzzleCandidate } from '../tree/types';

export type PuzzleFeedback = 'find' | 'good' | 'fail' | 'win' | 'view';
export type PuzzleRoundResult = 'active' | 'solved' | 'failed' | 'viewed';

export interface PuzzleRound {
  key: string;
  routeId: string;
  source: PuzzleCandidate;
  sourceGame: ImportedGame | null;
  parentPath: string;
  startFen: string;
  solution: string[];
  toMove: 'white' | 'black';
}

export interface PuzzleRoundSnapshot {
  key: string;
  progressPly: number;
  currentPath: string;
  feedback: PuzzleFeedback;
  result: PuzzleRoundResult;
  updatedAt: number;
}

export interface PuzzleSessionRecent {
  key: string;
  result: Exclude<PuzzleRoundResult, 'active'>;
  updatedAt: number;
}

export interface StoredPuzzleSession {
  current: PuzzleRoundSnapshot | null;
  recent: PuzzleSessionRecent[];
  updatedAt: number;
}

export interface PuzzleMoveOutcome {
  accepted: boolean;
  replies: string[];
}
