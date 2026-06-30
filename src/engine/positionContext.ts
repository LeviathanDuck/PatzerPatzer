import type { TreeNode, TreePath } from '../tree/types';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops';

export type EnginePositionContextSource = 'history' | 'fen-only';

export interface EnginePositionContext {
  initialFen: string;
  moves: string[];
  currentFen: string;
  source: EnginePositionContextSource;
  surface: string;
  path?: string;
  reason?: string;
}

const STOCKFISH_CASTLING_UCI = {
  e1a1: 'e1c1',
  e1h1: 'e1g1',
  e8a8: 'e8c8',
  e8h8: 'e8g8',
} as const;

type StockfishCastlingAlias = keyof typeof STOCKFISH_CASTLING_UCI;

function isStockfishCastlingAlias(uci: string): uci is StockfishCastlingAlias {
  return uci in STOCKFISH_CASTLING_UCI;
}

export type EnginePositionReplayFailureReason =
  | 'missing-initial-fen'
  | 'missing-expected-fen'
  | 'invalid-initial-fen'
  | 'invalid-expected-fen'
  | 'invalid-initial-position'
  | 'invalid-uci'
  | 'illegal-uci'
  | 'fen-mismatch';

export interface EnginePositionReplayResult {
  ok: boolean;
  reason?: EnginePositionReplayFailureReason;
  expectedFen: string;
  replayedFen: string;
  expectedFenHash: string;
  replayedFenHash: string;
  moveCount: number;
  failedMoveIndex?: number;
  failedMove?: string;
}

export function engineFenHash(fen: string): string {
  const setup = parseFen(fen);
  const hashInput = setup.isOk ? makeFen(setup.value) : fen;
  let hash = 0x811c9dc5;
  for (let i = 0; i < hashInput.length; i++) {
    hash ^= hashInput.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fen-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeEngineFen(fen: string): string | null {
  const setup = parseFen(fen);
  if (!setup.isOk) return null;
  return makeFen(setup.value);
}

export function engineFenEquals(left: string, right: string): boolean {
  const normalizedLeft = normalizeEngineFen(left);
  const normalizedRight = normalizeEngineFen(right);
  return normalizedLeft !== null && normalizedRight !== null && normalizedLeft === normalizedRight;
}

export function replayEnginePositionContext(
  context: EnginePositionContext,
  expectedFen = context.currentFen,
): EnginePositionReplayResult {
  const fail = (
    reason: EnginePositionReplayFailureReason,
    replayedFen = '',
    failedMoveIndex?: number,
    failedMove?: string,
  ): EnginePositionReplayResult => ({
    ok: false,
    reason,
    expectedFen,
    replayedFen,
    expectedFenHash: engineFenHash(expectedFen),
    replayedFenHash: engineFenHash(replayedFen),
    moveCount: context.moves.length,
    ...(failedMoveIndex !== undefined ? { failedMoveIndex } : {}),
    ...(failedMove !== undefined ? { failedMove } : {}),
  });

  if (!context.initialFen) return fail('missing-initial-fen');
  if (!expectedFen) return fail('missing-expected-fen');

  const initialSetup = parseFen(context.initialFen);
  if (!initialSetup.isOk) return fail('invalid-initial-fen');
  const expected = normalizeEngineFen(expectedFen);
  if (expected === null) return fail('invalid-expected-fen');
  const initialPosition = Chess.fromSetup(initialSetup.value);
  if (!initialPosition.isOk) return fail('invalid-initial-position');

  const position = initialPosition.value;
  for (let index = 0; index < context.moves.length; index++) {
    const uci = context.moves[index]!;
    const move = parseUci(uci);
    if (!move) return fail('invalid-uci', makeFen(position.toSetup()), index, uci);
    if (!position.isLegal(move)) return fail('illegal-uci', makeFen(position.toSetup()), index, uci);
    position.play(move);
  }

  const replayed = makeFen(position.toSetup());
  if (replayed !== expected) return fail('fen-mismatch', replayed);

  return {
    ok: true,
    expectedFen: expected,
    replayedFen: replayed,
    expectedFenHash: engineFenHash(expected),
    replayedFenHash: engineFenHash(replayed),
    moveCount: context.moves.length,
  };
}

export function historyPositionContext(args: {
  initialFen: string;
  moves: readonly string[];
  currentFen: string;
  surface: string;
  path?: string;
}): EnginePositionContext {
  return {
    initialFen: args.initialFen,
    moves: [...args.moves],
    currentFen: args.currentFen,
    source: 'history',
    surface: args.surface,
    ...(args.path !== undefined ? { path: args.path } : {}),
  };
}

export function fenOnlyPositionContext(
  currentFen: string,
  surface: string,
  reason: string,
): EnginePositionContext {
  return {
    initialFen: currentFen,
    moves: [],
    currentFen,
    source: 'fen-only',
    surface,
    reason,
  };
}

export function contextFromNodeList(
  nodes: readonly TreeNode[],
  surface: string,
  path?: TreePath | string,
): EnginePositionContext {
  const root = nodes[0];
  const current = nodes[nodes.length - 1];
  if (!root || !current) {
    return fenOnlyPositionContext('', surface, 'missing-node-list');
  }

  const moves: string[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const uci = nodes[i]?.uci;
    if (!uci) {
      return fenOnlyPositionContext(current.fen, surface, `missing-uci-at-ply-index-${i}`);
    }
    moves.push(uci);
  }

  return historyPositionContext({
    initialFen: root.fen,
    moves,
    currentFen: current.fen,
    surface,
    ...(path !== undefined ? { path } : {}),
  });
}

export function contextFromRootAndMoves(args: {
  initialFen: string;
  moves: readonly string[];
  currentFen: string;
  surface: string;
  path?: string;
}): EnginePositionContext {
  if (!args.initialFen || !args.currentFen) {
    return fenOnlyPositionContext(
      args.currentFen || args.initialFen,
      args.surface,
      'missing-root-or-current-fen',
    );
  }

  return historyPositionContext(args);
}

export function stockfishUciMoves(context: EnginePositionContext): string[] {
  const initialSetup = parseFen(context.initialFen);
  if (!initialSetup.isOk) return [...context.moves];
  const initialPosition = Chess.fromSetup(initialSetup.value);
  if (!initialPosition.isOk) return [...context.moves];

  const position = initialPosition.value;
  const moves: string[] = [];
  for (const uci of context.moves) {
    const move = parseUci(uci);
    if (!move || !position.isLegal(move)) return [...context.moves];
    moves.push(isStockfishCastlingAlias(uci) ? STOCKFISH_CASTLING_UCI[uci] : uci);
    position.play(move);
  }
  return moves;
}

export function uciPositionCommand(context: EnginePositionContext): string {
  const prefix = `position fen ${context.initialFen}`;
  const moves = stockfishUciMoves(context);
  return moves.length > 0
    ? `${prefix} moves ${moves.join(' ')}`
    : prefix;
}
