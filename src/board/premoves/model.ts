import { Chess, normalizeMove } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { Color, NormalMove, Role, SquareName } from 'chessops/types';
import { makeUci, parseSquare, roleToChar } from 'chessops/util';
import type { Fen, San, TreePath, Uci } from '../../tree/types';

export type PremovePromotionRole = Extract<Role, 'queen' | 'knight' | 'rook' | 'bishop'>;

export const PREMOVE_CLOCK_COST_SECONDS = 0.1;

export interface PremoveIntent {
  orig: SquareName;
  dest: SquareName;
  promotion?: PremovePromotionRole;
  originFen?: Fen;
  originPath?: TreePath;
  createdAt?: number;
}

export interface PremoveQueueState {
  intents: readonly PremoveIntent[];
}

export interface PlayedPremove {
  intent: PremoveIntent;
  index: number;
  rawUci: Uci;
  uci: Uci;
  san: San;
  fenBefore: Fen;
  fenAfter: Fen;
}

export type PremoveFailureReason = 'invalid-fen' | 'terminal' | 'invalid-square' | 'illegal';

export interface FailedPremove {
  intent?: PremoveIntent;
  index: number;
  reason: PremoveFailureReason;
  rawUci?: Uci;
  fenBefore?: Fen;
}

export interface PremoveReplayResult {
  status: 'complete' | 'illegal' | 'terminal' | 'invalid-fen';
  initialFen: Fen;
  finalFen: Fen;
  played: readonly PlayedPremove[];
  validIntents: readonly PremoveIntent[];
  remainingIntents: readonly PremoveIntent[];
  droppedIntents: readonly PremoveIntent[];
  failure?: FailedPremove;
}

export type PremovePlayResult =
  | { ok: true; move: PlayedPremove }
  | { ok: false; failure: FailedPremove };

export type NextPremoveResult =
  | {
      status: 'played';
      queue: PremoveQueueState;
      move: PlayedPremove;
      droppedIntents: readonly PremoveIntent[];
    }
  | {
      status: 'empty';
      queue: PremoveQueueState;
      droppedIntents: readonly PremoveIntent[];
    }
  | {
      status: 'illegal' | 'terminal' | 'invalid-fen';
      queue: PremoveQueueState;
      failure: FailedPremove;
      droppedIntents: readonly PremoveIntent[];
    };

export function createPremoveQueue(intents: readonly PremoveIntent[] = []): PremoveQueueState {
  return { intents: intents.map(copyIntent) };
}

export function enqueuePremove(state: PremoveQueueState, intent: PremoveIntent): PremoveQueueState {
  return { intents: [...state.intents, copyIntent(intent)] };
}

export function cancelLastPremove(state: PremoveQueueState): PremoveQueueState {
  return { intents: state.intents.slice(0, -1) };
}

export function setPremovePromotion(
  state: PremoveQueueState,
  index: number,
  promotion: PremovePromotionRole,
): PremoveQueueState {
  return {
    intents: state.intents.map((intent, i) => (
      i === index ? { ...intent, promotion } : copyIntent(intent)
    )),
  };
}

export function clearPremoves(): PremoveQueueState {
  return { intents: [] };
}

export function intentToRawUci(intent: PremoveIntent): Uci {
  const promotion = intent.promotion ? roleToChar(intent.promotion) : '';
  return `${intent.orig}${intent.dest}${promotion}`;
}

export function playPremoveIntent(fen: Fen, intent: PremoveIntent, index = 0): PremovePlayResult {
  const pos = positionFromFen(fen);
  if (!pos) {
    return { ok: false, failure: { intent, index, reason: 'invalid-fen', rawUci: intentToRawUci(intent) } };
  }
  if (pos.isEnd()) {
    return { ok: false, failure: { intent, index, reason: 'terminal', rawUci: intentToRawUci(intent), fenBefore: makeFen(pos.toSetup()) } };
  }
  return playIntentOnPosition(pos, intent, index);
}

export function playNextPremove(fen: Fen, state: PremoveQueueState): NextPremoveResult {
  const [intent, ...remaining] = state.intents;
  if (!intent) return { status: 'empty', queue: createPremoveQueue(), droppedIntents: [] };

  const result = playPremoveIntent(fen, intent, 0);
  if (result.ok) {
    return {
      status: 'played',
      queue: createPremoveQueue(remaining),
      move: result.move,
      droppedIntents: [],
    };
  }

  return {
    status: result.failure.reason === 'invalid-square' ? 'illegal' : result.failure.reason,
    queue: clearPremoves(),
    failure: result.failure,
    droppedIntents: state.intents,
  };
}

/**
 * Replays intents as consecutive legal half-moves from one concrete FEN. This is a pure validation
 * and preview helper, not the execution API for practice/drill play. Runtime consumers should call
 * playNextPremove() after each validated computer reply so only one queued premove can execute per
 * reply.
 */
export function replayPremoves(fen: Fen, intents: readonly PremoveIntent[]): PremoveReplayResult {
  const pos = positionFromFen(fen);
  if (!pos) {
    return {
      status: 'invalid-fen',
      initialFen: fen,
      finalFen: fen,
      played: [],
      validIntents: [],
      remainingIntents: intents,
      droppedIntents: intents,
      failure: { index: 0, reason: 'invalid-fen' },
    };
  }

  const played: PlayedPremove[] = [];

  for (let index = 0; index < intents.length; index++) {
    const intent = intents[index];
    if (!intent) break;
    const fenBefore = makeFen(pos.toSetup());
    if (pos.isEnd()) {
      const remaining = intents.slice(index);
      return {
        status: 'terminal',
        initialFen: fen,
        finalFen: fenBefore,
        played,
        validIntents: intents.slice(0, index),
        remainingIntents: remaining,
        droppedIntents: remaining,
        failure: { intent, index, reason: 'terminal', rawUci: intentToRawUci(intent), fenBefore },
      };
    }

    const result = playIntentOnPosition(pos, intent, index);
    if (!result.ok) {
      const remaining = intents.slice(index);
      return {
        status: 'illegal',
        initialFen: fen,
        finalFen: makeFen(pos.toSetup()),
        played,
        validIntents: intents.slice(0, index),
        remainingIntents: remaining,
        droppedIntents: remaining,
        failure: result.failure,
      };
    }
    played.push(result.move);
  }

  const finalFen = makeFen(pos.toSetup());
  return {
    status: pos.isEnd() ? 'terminal' : 'complete',
    initialFen: fen,
    finalFen,
    played,
    validIntents: intents.slice(),
    remainingIntents: [],
    droppedIntents: [],
  };
}

export function trimInvalidPremoves(fen: Fen, state: PremoveQueueState): {
  queue: PremoveQueueState;
  replay: PremoveReplayResult;
  droppedIntents: readonly PremoveIntent[];
} {
  const replay = replayPremoves(fen, state.intents);
  return {
    queue: createPremoveQueue(replay.validIntents),
    replay,
    droppedIntents: replay.droppedIntents,
  };
}

export function isPremovePromotionCandidate(fen: Fen, intent: PremoveIntent, color: Color): boolean {
  if (intent.promotion !== undefined) return false;
  return isPremovePromotionMove(fen, intent, color);
}

export function isPremovePromotionMove(fen: Fen, intent: PremoveIntent, color: Color): boolean {
  const pos = positionFromFen(fen);
  if (!pos) return false;
  const from = parseSquare(intent.orig);
  if (from === undefined) return false;
  const piece = pos.board.get(from);
  if (piece?.role !== 'pawn' || piece.color !== color) return false;
  return color === 'white' ? intent.dest.endsWith('8') : intent.dest.endsWith('1');
}

function positionFromFen(fen: Fen): Chess | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : undefined;
}

function playIntentOnPosition(pos: Chess, intent: PremoveIntent, index: number): PremovePlayResult {
  const rawUci = intentToRawUci(intent);
  const from = parseSquare(intent.orig);
  const to = parseSquare(intent.dest);
  if (from === undefined || to === undefined) {
    return { ok: false, failure: { intent, index, reason: 'invalid-square', rawUci, fenBefore: makeFen(pos.toSetup()) } };
  }

  const candidate = intent.promotion === undefined
    ? { from, to }
    : { from, to, promotion: intent.promotion };
  const normalized = normalizeMove(pos, candidate);
  if (!('from' in normalized)) {
    return { ok: false, failure: { intent, index, reason: 'illegal', rawUci, fenBefore: makeFen(pos.toSetup()) } };
  }
  const move = normalized as NormalMove;
  const fenBefore = makeFen(pos.toSetup());
  if (!pos.isLegal(move)) {
    return { ok: false, failure: { intent, index, reason: 'illegal', rawUci, fenBefore } };
  }

  const san = makeSan(pos, move);
  const uci = makeUci(move);
  pos.play(move);
  return {
    ok: true,
    move: {
      intent,
      index,
      rawUci,
      uci,
      san,
      fenBefore,
      fenAfter: makeFen(pos.toSetup()),
    },
  };
}

function copyIntent(intent: PremoveIntent): PremoveIntent {
  return { ...intent };
}
