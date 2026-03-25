import type { ImportedGame } from '../import/types';
import type { PuzzleCandidate } from '../tree/types';

export type PuzzleFeedback = 'find' | 'good' | 'fail' | 'win' | 'view';
export type PuzzleRoundResult = 'active' | 'solved' | 'failed' | 'viewed';
export type PuzzleLibrarySource = 'saved' | 'lichess';

export interface ImportedPuzzleRecord {
  id: string;
  shardId: string;
  key: string;
  routeId: string;
  fen: string;
  moves: string[];
  rating: number;
  ratingDeviation?: number;
  popularity?: number;
  plays?: number;
  themes: string[];
  openingTags: string[];
  gameUrl?: string;
}

export interface ImportedPuzzleShardMeta {
  id: string;
  file: string;
  count: number;
  ratingMin?: number;
  ratingMax?: number;
  themes: string[];
  openings: string[];
}

export interface ImportedPuzzleManifest {
  version: number;
  generatedAt: string;
  totalCount: number;
  shardSize: number;
  shards: ImportedPuzzleShardMeta[];
  ratingMin?: number;
  ratingMax?: number;
  themes: string[];
  openings: string[];
  source: {
    file: string;
    license: string;
    url: string;
  };
}

export interface ImportedPuzzleFilters {
  ratingMin: string;
  ratingMax: string;
  theme: string;
  opening: string;
}

export interface ImportedPuzzleLibraryQuery {
  page: number;
  pageSize: number;
  filters: ImportedPuzzleFilters;
}

export interface ImportedPuzzleLibraryState {
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  query: ImportedPuzzleLibraryQuery;
  manifest: ImportedPuzzleManifest | null;
  items: ImportedPuzzleRecord[];
  hasPrev: boolean;
  hasNext: boolean;
  loadedShardCount: number;
  error?: string;
}

interface PuzzleRoundBase {
  key: string;
  routeId: string;
  parentPath: string;
  startFen: string;
  solution: string[];
  toMove: 'white' | 'black';
}

export interface SavedPuzzleRound extends PuzzleRoundBase {
  sourceKind: 'saved';
  source: PuzzleCandidate;
  sourceGame: ImportedGame | null;
  imported: null;
}

export interface ImportedPuzzleRound extends PuzzleRoundBase {
  sourceKind: 'imported';
  source: null;
  sourceGame: null;
  imported: ImportedPuzzleRecord;
  /** The opponent's triggering move (moves[0] from the Lichess CSV).
   *  Auto-played during board setup before the user gets control.
   *  Excluded from `solution` so progressPly 0 maps to the user's first move. */
  initialMove: string;
}

export type PuzzleRound = SavedPuzzleRound | ImportedPuzzleRound;

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
