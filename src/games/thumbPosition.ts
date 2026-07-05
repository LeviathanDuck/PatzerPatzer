







import { makeFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { makeSanAndPlay, parseSan } from 'chessops/san';

import type { ImportedGame } from '../import/types';

// Ply count for "start of move 11" (10 full moves played: White's 10th + Black's 10th).
const THUMBNAIL_PLY = 20;





const CACHE_LIMIT = 2000;
const cache = new Map<string, string | null>();

function rememberInCache(id: string, fen: string | null): void {
  if (!cache.has(id) && cache.size >= CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(id, fen);
}

/**
 * Walk the mainline (children[0] at every node) up to THUMBNAIL_PLY, playing each move on a
 * mutable Position. Stops early at the end of the mainline (short game) or at the first
 * unparseable/illegal SAN (malformed PGN), returning whatever legal position was last reached.
 */
function mainlineFenAtThumbnailPly(pgn: string): string | null {
  const game = parsePgn(pgn)[0];
  if (!game || game.moves.children.length === 0) return null;

  const pos = startingPosition(game.headers).unwrap();
  let fen = makeFen(pos.toSetup());

  let node = game.moves.children[0];
  let ply = 0;
  while (node && ply < THUMBNAIL_PLY) {
    const move = parseSan(pos, node.data.san);
    if (!move) break; // stop at the last legal position reached
    makeSanAndPlay(pos, move);
    ply++;
    fen = makeFen(pos.toSetup());
    node = node.children[0];
  }

  return fen;
}

/**
 * Returns the FEN for a game's thumbnail position: the mainline position after 10 full moves
 * (ply 20, start of move 11), or the final mainline position for games shorter than 21 plies.
 * Memoized per game.id in a bounded cache. Never throws; unparseable/illegal PGN returns null.
 */
export function thumbnailFen(game: ImportedGame): string | null {
  const cached = cache.get(game.id);
  if (cached !== undefined) return cached;

  let fen: string | null;
  try {
    fen = mainlineFenAtThumbnailPly(game.pgn);
  } catch {
    fen = null;
  }

  rememberInCache(game.id, fen);
  return fen;
}
