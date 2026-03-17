// PGN → move tree (mainline only)
// Adapted from lichess-org/lila: ui/analyse/src/pgnImport.ts

import { makeUci } from 'chessops';
import { scalachessCharPair } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { makeSanAndPlay, parseSan } from 'chessops/san';

import type { TreeNode } from './types';

/**
 * Parse a PGN string and return a root TreeNode with mainline children.
 * Variations, comments, and NAGs are ignored.
 * Throws if the PGN cannot be parsed or the starting position is invalid.
 */
export function pgnToTree(pgn: string): TreeNode {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error('No game found in PGN');

  const startPos = startingPosition(game.headers).unwrap();
  const startFen = makeFen(startPos.toSetup());
  const setup = startPos.toSetup();
  const initialPly = (setup.fullmoves - 1) * 2 + (startPos.turn === 'white' ? 0 : 1);

  const root: TreeNode = {
    id: '',
    ply: initialPly,
    fen: startFen,
    children: [],
  };

  const pos = startPos;
  let parent = root;
  let node = game.moves;
  let ply = initialPly;

  // Walk mainline only — first child at each step
  while (node.children.length > 0) {
    const mainChild = node.children[0]!;
    ply += 1;

    const move = parseSan(pos, mainChild.data.san);
    if (!move) break; // unrecognised SAN — stop cleanly

    // makeSanAndPlay mutates pos in-place and returns canonical SAN
    const san = makeSanAndPlay(pos, move);
    const uci = makeUci(move);
    const id = scalachessCharPair(move); // 2-char node id, same scheme as Lichess

    const child: TreeNode = {
      id,
      ply,
      san,
      uci,
      fen: makeFen(pos.toSetup()), // FEN after the move
      children: [],
    };

    parent.children.push(child);
    parent = child;
    node = mainChild;
  }

  return root;
}
