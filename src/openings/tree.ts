/**
 * Opening tree aggregation engine.
 *
 * Builds a position-frequency tree from imported research games.
 * Each node represents a position reached by one or more games,
 * with children representing moves played from that position.
 *
 * Uses chessops for move replay and FEN generation.
 */

import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan, makeSanAndPlay } from 'chessops/san';
import { makeUci } from 'chessops';
import type { ResearchGame } from './types';

/** A node in the opening frequency tree. */
export interface OpeningTreeNode {
  /** FEN at this position. */
  fen: string;
  /** SAN of the move that reached this position (empty string for root). */
  san: string;
  /** UCI of the move that reached this position (empty string for root). */
  uci: string;
  /** Number of games that reached this position. */
  total: number;
  /** Wins from white's perspective. */
  white: number;
  /** Draws. */
  draws: number;
  /** Wins from black's perspective. */
  black: number;
  /** Child moves from this position, sorted by frequency (most common first). */
  children: OpeningTreeNode[];
}

/** Result counts for aggregation. */
interface ResultCounts {
  total: number;
  white: number;
  draws: number;
  black: number;
}

// Internal mutable node for building phase.
interface BuildNode {
  fen: string;
  san: string;
  uci: string;
  results: ResultCounts;
  children: Map<string, BuildNode>; // keyed by UCI
}

function newBuildNode(fen: string, san: string, uci: string): BuildNode {
  return { fen, san, uci, results: { total: 0, white: 0, draws: 0, black: 0 }, children: new Map() };
}

function parseResult(result: string | undefined): 'white' | 'black' | 'draw' | null {
  if (result === '1-0') return 'white';
  if (result === '0-1') return 'black';
  if (result === '1/2-1/2') return 'draw';
  return null;
}

function addResult(counts: ResultCounts, result: 'white' | 'black' | 'draw' | null): void {
  counts.total++;
  if (result === 'white') counts.white++;
  else if (result === 'black') counts.black++;
  else if (result === 'draw') counts.draws++;
}

/** Maximum ply depth to aggregate (30 moves = 60 plies). */
const MAX_PLY = 60;

/**
 * Build an opening frequency tree from a set of research games.
 * Walks the mainline of each game up to MAX_PLY, recording move frequencies and results.
 */
export function buildOpeningTree(games: readonly ResearchGame[]): OpeningTreeNode {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const root = newBuildNode(startFen, '', '');

  for (const game of games) {
    try {
      const parsed = parsePgn(game.pgn);
      if (parsed.length === 0) continue;
      const pgnGame = parsed[0]!;
      const setup = startingPosition(pgnGame.headers);
      if (setup.isErr) continue;
      const pos = setup.value;

      const result = parseResult(game.result);
      addResult(root.results, result);

      let current = root;
      let node = pgnGame.moves.children[0]; // first child of root = first move
      let ply = 0;

      while (node && ply < MAX_PLY) {
        const move = parseSan(pos, node.data.san);
        if (!move) break;

        const uci = makeUci(move);
        const san = makeSanAndPlay(pos, move);
        const fen = makeFen(pos.toSetup());

        let child = current.children.get(uci);
        if (!child) {
          child = newBuildNode(fen, san, uci);
          current.children.set(uci, child);
        }
        addResult(child.results, result);

        current = child;
        node = node.children[0]; // mainline continuation
        ply++;
      }
    } catch {
      // Skip games that fail to parse
      continue;
    }
  }

  return freezeTree(root);
}

/** Convert mutable build tree to immutable output. Children sorted by frequency. */
function freezeTree(node: BuildNode): OpeningTreeNode {
  const children = [...node.children.values()]
    .sort((a, b) => b.results.total - a.results.total)
    .map(freezeTree);

  return {
    fen: node.fen,
    san: node.san,
    uci: node.uci,
    total: node.results.total,
    white: node.results.white,
    draws: node.results.draws,
    black: node.results.black,
    children,
  };
}

/** Find the node at a given path of UCI moves from the root. */
export function nodeAtMoves(root: OpeningTreeNode, moves: string[]): OpeningTreeNode | undefined {
  let current: OpeningTreeNode | undefined = root;
  for (const uci of moves) {
    if (!current) return undefined;
    current = current.children.find(c => c.uci === uci);
  }
  return current;
}

/**
 * Find games from the collection whose mainline passes through the given move path.
 * Returns up to `limit` matching ResearchGame records.
 */
export function findSampleGames(
  games: readonly ResearchGame[], path: readonly string[], limit = 5,
): ResearchGame[] {
  if (path.length === 0) return games.slice(0, limit);

  const results: ResearchGame[] = [];
  for (const game of games) {
    if (results.length >= limit) break;
    if (gameMatchesPath(game, path)) results.push(game);
  }
  return results;
}

function gameMatchesPath(game: ResearchGame, path: readonly string[]): boolean {
  try {
    const parsed = parsePgn(game.pgn);
    if (parsed.length === 0) return false;
    const pgnGame = parsed[0]!;
    const setup = startingPosition(pgnGame.headers);
    if (setup.isErr) return false;
    const pos = setup.value;

    let node = pgnGame.moves.children[0];
    for (let i = 0; i < path.length; i++) {
      if (!node) return false;
      const move = parseSan(pos, node.data.san);
      if (!move) return false;
      const uci = makeUci(move);
      if (uci !== path[i]) return false;
      makeSanAndPlay(pos, move);
      node = node.children[0];
    }
    return true;
  } catch {
    return false;
  }
}
