// PGN → move tree (mainline + variations)
// Adapted from lichess-org/lila: ui/analyse/src/pgnImport.ts

import { makeUci } from 'chessops';
import type { Position } from 'chessops/chess';
import { scalachessCharPair } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import type { ChildNode, PgnNodeData } from 'chessops/pgn';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { makeSanAndPlay, parseSan } from 'chessops/san';

import type { TreeNode } from './types';

/**
 * Recursively build a TreeNode from a PGN child node.
 * pos is mutated in-place (caller must clone if reusing).
 * Returns undefined if the SAN cannot be parsed.
 *
 * Adapted from lichess-org/lila: ui/analyse/src/pgnImport.ts readNode
 */
function buildNode(pgnNode: ChildNode<PgnNodeData>, pos: Position, ply: number): TreeNode | undefined {
  const move = parseSan(pos, pgnNode.data.san);
  if (!move) return undefined;

  // makeSanAndPlay mutates pos in-place and returns canonical SAN
  const san = makeSanAndPlay(pos, move);

  // Build all children from the post-move position.
  // Clone pos for each child so variations don't interfere with each other.
  // First child = mainline, rest = variations — order preserved from PGN.
  const children = pgnNode.children
    .map(child => buildNode(child, pos.clone(), ply + 1))
    .filter((n): n is TreeNode => n !== undefined);

  return {
    id: scalachessCharPair(move), // 2-char id, same scheme as Lichess
    ply,
    san,
    uci: makeUci(move),
    fen: makeFen(pos.toSetup()), // FEN after the move
    children,
  };
}

/**
 * Parse a PGN string and return a root TreeNode with the full move tree.
 * Mainline is always children[0] at each node; variations are children[1+].
 * Throws if the PGN cannot be parsed or the starting position is invalid.
 */
export function pgnToTree(pgn: string): TreeNode {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error('No game found in PGN');

  const startPos = startingPosition(game.headers).unwrap();
  const startFen = makeFen(startPos.toSetup());
  const setup = startPos.toSetup();
  const initialPly = (setup.fullmoves - 1) * 2 + (startPos.turn === 'white' ? 0 : 1);

  // Each top-level child gets a fresh clone of the starting position
  const children = game.moves.children
    .map(child => buildNode(child, startPos.clone(), initialPly + 1))
    .filter((n): n is TreeNode => n !== undefined);

  return {
    id: '',
    ply: initialPly,
    fen: startFen,
    children,
  };
}
