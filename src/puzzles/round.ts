import type { StoredAnalysis } from '../idb/index';
import type { ImportedGame } from '../import/types';
import { parseFen } from 'chessops/fen';
import { pathInit } from '../tree/ops';
import type { PuzzleCandidate, TreeNode } from '../tree/types';
import type { SavedPuzzleRound } from './types';

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
): SavedPuzzleRound {
  const key = puzzleKey(candidate);
  return {
    key,
    routeId: puzzleRouteIdFromKey(key),
    sourceKind: 'saved',
    source: candidate,
    sourceGame: opts.sourceGame ?? null,
    imported: null,
    parentPath: pathInit(candidate.path),
    startFen: candidate.fen,
    solution: getPuzzleSolutionLine(candidate, opts.storedAnalysis),
    toMove: candidate.ply % 2 === 1 ? 'white' : 'black',
  };
}

export function buildStandalonePuzzleRoot(fen: string): TreeNode {
  const setup = parseFen(fen).unwrap();
  const initialPly = (setup.fullmoves - 1) * 2 + (setup.turn === 'white' ? 0 : 1);
  return {
    id: '',
    ply: initialPly,
    fen,
    children: [],
  };
}
