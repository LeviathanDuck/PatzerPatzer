































import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
import { scalachessCharPair } from 'chessops/compat';
import type { Move } from 'chessops';
import type { Fen, San, TreeNodeId, Uci } from './types';

/** A move to apply, tagged by its source notation. */
export type LegalMoveCandidate =
  | { notation: 'uci'; value: string }
  | { notation: 'san'; value: string };

/** Typed reason a candidate could not be legally applied to the supplied position. */
export type LegalMoveRejection =
  | { code: 'invalid-fen'; candidate: LegalMoveCandidate }
  | { code: 'illegal-position'; candidate: LegalMoveCandidate }
  | { code: 'invalid-uci'; candidate: LegalMoveCandidate }
  | { code: 'invalid-or-illegal-san'; candidate: LegalMoveCandidate }
  | { code: 'illegal-move'; candidate: LegalMoveCandidate };

/** Node-ready data derived from a successfully applied legal move. */
export interface AppliedLegalMove {
  /** The parsed move that was applied. */
  move: Move;
  /** The post-move position (a fresh clone; the supplied position is untouched). */
  position: Chess;
  /**
   * Node data ready for tree placement. `ply` and `children` are intentionally
   * absent — they belong to the caller that owns tree placement.
   */
  node: {
    id: TreeNodeId;
    uci: Uci;
    san: San;
    fen: Fen;
  };
}

/** Result of an apply attempt: a legal application, or a typed rejection. */
export type LegalMoveApplyResult =
  | { ok: true; value: AppliedLegalMove }
  | { ok: false; rejection: LegalMoveRejection };
























export function applyLegalMove(
  source: Fen | Chess,
  candidate: LegalMoveCandidate,
): LegalMoveApplyResult {
  // 1. Resolve a working position we own. For a FEN, parse + fromSetup produce a
  //    fresh position. For a Chess, clone so the supplied instance is untouched.
  let position: Chess;
  if (typeof source === 'string') {
    const setup = parseFen(source);
    if (setup.isErr) return { ok: false, rejection: { code: 'invalid-fen', candidate } };
    const pos = Chess.fromSetup(setup.value);
    if (pos.isErr) return { ok: false, rejection: { code: 'illegal-position', candidate } };
    position = pos.value;
  } else {
    position = source.clone();
  }

  // 2. Parse the candidate by notation.
  let move: Move | undefined;
  if (candidate.notation === 'uci') {
    move = parseUci(candidate.value);
    if (!move) return { ok: false, rejection: { code: 'invalid-uci', candidate } };
  } else {
    move = parseSan(position, candidate.value);
    if (!move) return { ok: false, rejection: { code: 'invalid-or-illegal-san', candidate } };
  }

  // 3. Single explicit legality gate for both notations. isLegal() enforces the
  //    full standard-chess rule set: correct side/colour, geometry, obstruction,
  //    pins/king exposure, check resolution, king-destination safety, en passant,
  //    castling rights/path/attacked-square constraints, promotion consistency
  //    (unsuffixed back-rank pawn moves rejected, valid promotion roles only), and
  //    normalized castling destinations (both encodings accepted).
  if (!position.isLegal(move)) {
    return {
      ok: false,
      rejection: {
        code: candidate.notation === 'uci' ? 'illegal-move' : 'invalid-or-illegal-san',
        candidate,
      },
    };
  }

  // 4. Legal — derive node data from the PRE-move position, then play on the clone.
  const san = makeSan(position, move);
  const id = scalachessCharPair(move);
  // UCI preservation: keep the accepted input string for a UCI candidate; use the
  // canonical makeUci form for a SAN candidate (matching the PGN path).
  const uci = candidate.notation === 'uci' ? candidate.value : makeUci(move);
  position.play(move);
  const fen = makeFen(position.toSetup());

  return {
    ok: true,
    value: {
      move,
      position,
      node: { id, uci, san, fen },
    },
  };
}
