// ---------------------------------------------------------------------------
// Puzzle V1 — Adapter seams
//
// Pure conversion functions that bridge legacy / external puzzle sources into
// the canonical PuzzleDefinition model (src/puzzles/types.ts).
//
// Two adapters:
//   1. candidateToDefinition  — PuzzleCandidate (analysis/retro workflow)
//                               → UserLibraryPuzzleDefinition
//   2. lichessShardRecordToDefinition — Lichess shard JSON record
//                               → ImportedLichessPuzzleDefinition
//
// These adapters produce objects ready for savePuzzleDefinition() but do NOT
// call persistence themselves — callers decide when and whether to persist.
// ---------------------------------------------------------------------------

import type { PuzzleCandidate } from '../tree/types';
import type { RetroCandidate } from '../analyse/retro';
import type {
  ImportedLichessPuzzleDefinition,
  UserLibraryPuzzleDefinition,
} from './types';

// ---------------------------------------------------------------------------
// Lichess shard record shape
// ---------------------------------------------------------------------------

/**
 * Shape of a single puzzle record inside a downloaded Lichess puzzle shard
 * (public/generated/lichess-puzzles/shard-NNNNN.json).
 *
 * This mirrors the Lichess puzzle CSV schema:
 *   PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
 *
 * `moves` is the full UCI move array from the CSV. The first move is the
 * opponent trigger move that sets up the puzzle position; the remaining
 * moves form the solution line the solver must find.
 */
export interface LichessShardRecord {
  id: string;
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

// ---------------------------------------------------------------------------
// Adapter 1: PuzzleCandidate → UserLibraryPuzzleDefinition
// ---------------------------------------------------------------------------

/**
 * Convert a legacy PuzzleCandidate (from the analysis/retro extraction
 * workflow) into a canonical UserLibraryPuzzleDefinition.
 *
 * The legacy candidate only stores the engine best move from the parent
 * position — not a full solution line. The adapter places that single move
 * as the solution line. Downstream round logic can later extend the line
 * via live engine analysis if needed.
 *
 * @param candidate - Legacy puzzle candidate from extract.ts or retro.ts.
 * @param opts      - Optional overrides (source PGN, title, notes, tags).
 */
export function candidateToDefinition(
  candidate: PuzzleCandidate,
  opts?: {
    title?: string;
    notes?: string;
    tags?: string[];
    sourcePgn?: string;
  },
): UserLibraryPuzzleDefinition {
  // Stable id: prefix with source game id when available, fall back to fen hash.
  const idBase = candidate.gameId
    ? `${candidate.gameId}_${candidate.path}`
    : `user_${simpleHash(candidate.fen + candidate.bestMove)}`;

  const def: UserLibraryPuzzleDefinition = {
    id: idBase,
    sourceKind: 'user-library',
    startFen: candidate.fen,
    solutionLine: [candidate.bestMove],
    strictSolutionMove: candidate.bestMove,
    createdAt: Date.now(),
    sourcePath: candidate.path,
    sourceReason: candidate.reason?.code ?? 'swing',
  };
  if (candidate.gameId != null) def.sourceGameId = candidate.gameId;
  if (opts?.title != null)      def.title = opts.title;
  if (opts?.notes != null)      def.notes = opts.notes;
  if (opts?.tags != null)       def.tags = opts.tags;
  if (opts?.sourcePgn != null)  def.sourcePgn = opts.sourcePgn;
  return def;
}

// ---------------------------------------------------------------------------
// Adapter 1b: RetroCandidate → UserLibraryPuzzleDefinition
// ---------------------------------------------------------------------------

/**
 * Convert a RetroCandidate (from the Learn From Your Mistakes session) into a
 * canonical UserLibraryPuzzleDefinition.
 *
 * RetroCandidate carries richer data than PuzzleCandidate: fenBefore, bestMove,
 * bestLine (full PV), reason with code/label/summary, classification, loss, etc.
 * This adapter maps those directly into the user-library puzzle model.
 *
 * @param candidate - Retro candidate from the active retrospection session.
 * @param opts      - Optional overrides (title, notes, tags, sourcePgn).
 */
export function retroCandidateToDefinition(
  candidate: RetroCandidate,
  opts?: {
    title?: string;
    notes?: string;
    tags?: string[];
    sourcePgn?: string;
  },
): UserLibraryPuzzleDefinition {
  // Stable id: prefix with source game id when available, fall back to fen hash.
  const idBase = candidate.gameId
    ? `${candidate.gameId}_${candidate.path}`
    : `user_${simpleHash(candidate.fenBefore + candidate.bestMove)}`;

  // Solution line: use the full PV when available, fall back to single best move.
  const solutionLine = candidate.bestLine && candidate.bestLine.length > 0
    ? candidate.bestLine
    : [candidate.bestMove];

  const def: UserLibraryPuzzleDefinition = {
    id: idBase,
    sourceKind: 'user-library',
    startFen: candidate.fenBefore,
    solutionLine,
    strictSolutionMove: candidate.bestMove,
    createdAt: Date.now(),
    sourcePath: candidate.parentPath,
    sourceReason: candidate.reason.code,
  };
  if (candidate.gameId != null)  def.sourceGameId = candidate.gameId;
  if (opts?.title != null)       def.title = opts.title;
  if (opts?.notes != null)       def.notes = opts.notes;
  if (opts?.tags != null)        def.tags = opts.tags;
  if (opts?.sourcePgn != null)   def.sourcePgn = opts.sourcePgn;
  return def;
}

// ---------------------------------------------------------------------------
// Adapter 2: LichessShardRecord → ImportedLichessPuzzleDefinition
// ---------------------------------------------------------------------------

/**
 * Convert a Lichess shard JSON record into a canonical
 * ImportedLichessPuzzleDefinition.
 *
 * Per the Lichess puzzle CSV spec, `moves[0]` is the opponent trigger move
 * that reaches the puzzle start position. The remaining moves are the
 * solution line the solver must find.
 *
 * If the record contains fewer than 2 moves, it is malformed and the
 * function returns `undefined`.
 */
export function lichessShardRecordToDefinition(
  record: LichessShardRecord,
): ImportedLichessPuzzleDefinition | undefined {
  // moves[0] = opponent trigger move; moves[1..] = solution line.
  if (record.moves.length < 2) return undefined;

  const solutionLine = record.moves.slice(1);

  const def: ImportedLichessPuzzleDefinition = {
    id: `lichess_${record.id}`,
    sourceKind: 'imported-lichess',
    startFen: record.fen,
    solutionLine,
    strictSolutionMove: solutionLine[0]!,
    createdAt: Date.now(),
    lichessPuzzleId: record.id,
    rating: record.rating,
    themes: record.themes,
    openingTags: record.openingTags,
  };
  if (record.ratingDeviation != null) def.ratingDeviation = record.ratingDeviation;
  if (record.popularity != null)      def.popularity = record.popularity;
  if (record.plays != null)           def.plays = record.plays;
  if (record.gameUrl != null)         def.gameUrl = record.gameUrl;
  return def;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic string hash for generating stable puzzle ids when no game id
 * is available. Not cryptographic — only needs to be collision-resistant
 * enough within a single user's library.
 */
export function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  // Convert to unsigned hex string.
  return (h >>> 0).toString(16).padStart(8, '0');
}
