import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';

export type PositionKey = string;

/**
 * Return the normalized FEN fields that define a standard chess position.
 *
 * Clocks are intentionally ignored. En-passant is canonicalized through
 * chessops so only a currently legal en-passant capture remains distinct.
 */
export function positionKeyFromFen(fen: string): PositionKey {
  const parsed = parseFen(fen.trim().replace(/\s+/g, ' '));
  if (parsed.isErr) throw new Error(`Invalid FEN for position key: ${fen}`);

  const position = Chess.fromSetup(parsed.value);
  if (position.isErr) throw new Error(`Invalid chess position for position key: ${fen}`);

  return makeFen(position.value.toSetup()).split(' ').slice(0, 4).join(' ');
}
