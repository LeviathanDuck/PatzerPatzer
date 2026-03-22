import type { StoredAnalysis } from '../idb/index';
import type { ImportedGame } from '../import/types';
import { pathInit } from '../tree/ops';
import type { PuzzleCandidate } from '../tree/types';
import type { PuzzleRound } from './types';

const LOCAL_PUZZLE_GAME_ID = 'local';

export function puzzleKey(candidate: Pick<PuzzleCandidate, 'gameId' | 'path'>): string {
  return `${candidate.gameId ?? LOCAL_PUZZLE_GAME_ID}::${candidate.path}`;
}

export function puzzleRouteIdFromKey(key: string): string {
  return encodeURIComponent(key);
}

export function decodePuzzleRouteId(routeId: string): string {
  try {
    return decodeURIComponent(routeId);
  } catch {
    return routeId;
  }
}

export function puzzleRouteHref(candidate: Pick<PuzzleCandidate, 'gameId' | 'path'>): string {
  return `#/puzzles/${puzzleRouteIdFromKey(puzzleKey(candidate))}`;
}

export function findSavedPuzzleByRouteId(
  puzzles: readonly PuzzleCandidate[],
  routeId: string,
): PuzzleCandidate | null {
  const decoded = decodePuzzleRouteId(routeId);
  return puzzles.find(p => puzzleKey(p) === decoded) ?? null;
}

export function getPuzzleSolutionLine(
  candidate: PuzzleCandidate,
  storedAnalysis?: StoredAnalysis,
): string[] {
  const parentPath = pathInit(candidate.path);
  const persisted = storedAnalysis?.nodes[parentPath]?.bestLine ?? [];
  if (persisted.length === 0) return [candidate.bestMove];
  if (persisted[0] === candidate.bestMove) return persisted;
  return [candidate.bestMove, ...persisted];
}

export function buildPuzzleRound(
  candidate: PuzzleCandidate,
  opts: {
    sourceGame?: ImportedGame | null;
    storedAnalysis?: StoredAnalysis;
  } = {},
): PuzzleRound {
  const key = puzzleKey(candidate);
  return {
    key,
    routeId: puzzleRouteIdFromKey(key),
    source: candidate,
    sourceGame: opts.sourceGame ?? null,
    parentPath: pathInit(candidate.path),
    startFen: candidate.fen,
    solution: getPuzzleSolutionLine(candidate, opts.storedAnalysis),
    toMove: candidate.ply % 2 === 1 ? 'white' : 'black',
  };
}
