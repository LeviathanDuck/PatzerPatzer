











import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops';

/**
 * True when `uci` is a legal move in `fen`.
 *
 * Used as the review storage-boundary guard: a search result's `best` move must be legal in the
 * position we asked the engine to analyse. A well-formed best that is illegal in that position
 * proves the result was computed for a different position (off-by-one / position-desync signature).
 *
 * Fails OPEN (returns true) on unparseable FEN/UCI — this is a corruption safety net keyed to the
 * "well-formed move, wrong position" signature, not a general validity gate; a malformed FEN/UCI is
 * a separate concern and must not block an otherwise-valid review.
 */
export function uciMoveIsLegalInFen(fen: string, uci: string): boolean {
  try {
    const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    const move = parseUci(uci);
    if (!move) return true;
    return pos.isLegal(move);
  } catch {
    return true;
  }
}
