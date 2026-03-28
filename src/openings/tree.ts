/**
 * Opening tree aggregation engine.
 *
 * Builds a position-frequency graph from imported research games.
 * Positions are keyed by normalized FEN (without halfmove/fullmove counters)
 * so transpositions merge into the same node.
 *
 * The graph is presented as a tree structure (OpeningTreeNode) where each
 * node's children are the moves played from that position across all games.
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
  /** FEN at this position (full FEN). */
  fen: string;
  /** Normalized FEN (without halfmove/fullmove) used as position key. */
  posKey: string;
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
  /** Whether this position is reachable by multiple move orders (transposition). */
  transposition: boolean;
  /** Average rating of games passing through this edge (0 if no ratings). */
  avgRating: number;
  /** Most recent game date passing through this edge (empty if unknown). */
  lastPlayed: string;
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

// Internal mutable position node for building phase.
interface BuildPosition {
  fen: string;
  posKey: string;
  results: ResultCounts;
  /** Edges keyed by UCI — each edge leads to a child position. */
  edges: Map<string, BuildEdge>;
  /** How many distinct parent positions lead here. */
  parentCount: number;
}

interface BuildEdge {
  san: string;
  uci: string;
  targetPosKey: string;
  results: ResultCounts;
  ratingSum: number;
  ratingCount: number;
  lastPlayed: string;
}

/**
 * Normalize FEN by stripping halfmove clock and fullmove number.
 * This makes "same position, different move number" merge as one node.
 */
function normalizeFen(fen: string): string {
  // FEN has 6 fields: pieces, turn, castling, en-passant, halfmove, fullmove
  // Keep first 4 fields only for position identity.
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
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

function newCounts(): ResultCounts {
  return { total: 0, white: 0, draws: 0, black: 0 };
}

function avgGameRating(game: ResearchGame): number {
  const ratings = [game.whiteRating, game.blackRating].filter((r): r is number => r !== undefined && r > 0);
  return ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
}

/** Maximum ply depth to aggregate (15 moves = 30 plies).
 *  Opening theory rarely extends beyond move 15. Deeper plies add
 *  processing cost with diminishing prep value. */
const MAX_PLY = 30;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_KEY = normalizeFen(START_FEN);

/** Mutable tree builder — processes games incrementally. */
export class OpeningTreeBuilder {
  readonly positions = new Map<string, BuildPosition>();
  readonly root: BuildPosition;

  constructor() {
    this.root = this._getOrCreate(START_FEN, START_KEY);
  }

  private _getOrCreate(fen: string, posKey: string): BuildPosition {
    let pos = this.positions.get(posKey);
    if (!pos) {
      pos = { fen, posKey, results: newCounts(), edges: new Map(), parentCount: 0 };
      this.positions.set(posKey, pos);
    }
    return pos;
  }

  /** Add a batch of games to the graph. */
  addGames(games: readonly ResearchGame[]): void {
    for (const game of games) {
      try {
        const parsed = parsePgn(game.pgn);
        if (parsed.length === 0) continue;
        const pgnGame = parsed[0]!;
        const setup = startingPosition(pgnGame.headers);
        if (setup.isErr) continue;
        const pos = setup.value;

        const result = parseResult(game.result);
        addResult(this.root.results, result);

        const gameRating = avgGameRating(game);
        const gameDate = game.date ?? '';

        let currentKey = START_KEY;
        let pgnNode = pgnGame.moves.children[0];
        let ply = 0;

        while (pgnNode && ply < MAX_PLY) {
          const move = parseSan(pos, pgnNode.data.san);
          if (!move) break;

          const uci = makeUci(move);
          const san = makeSanAndPlay(pos, move);
          const fen = makeFen(pos.toSetup());
          const childKey = normalizeFen(fen);

          const childPos = this._getOrCreate(fen, childKey);
          addResult(childPos.results, result);

          const currentPos = this.positions.get(currentKey)!;
          let edge = currentPos.edges.get(uci);
          if (!edge) {
            edge = { san, uci, targetPosKey: childKey, results: newCounts(), ratingSum: 0, ratingCount: 0, lastPlayed: '' };
            currentPos.edges.set(uci, edge);
            childPos.parentCount++;
          }
          addResult(edge.results, result);
          if (gameRating > 0) {
            edge.ratingSum += gameRating;
            edge.ratingCount++;
          }
          if (gameDate > edge.lastPlayed) edge.lastPlayed = gameDate;

          currentKey = childKey;
          pgnNode = pgnNode.children[0];
          ply++;
        }
      } catch {
        continue;
      }
    }
  }

  /** Freeze the mutable graph into an immutable tree. */
  freeze(): OpeningTreeNode {
    return freezeGraph(this.root, this.positions, new Set());
  }
}

/**
 * Build an opening frequency graph from a set of research games (synchronous).
 * For large collections, prefer OpeningTreeBuilder + chunked addGames().
 */
export function buildOpeningTree(games: readonly ResearchGame[]): OpeningTreeNode {
  const builder = new OpeningTreeBuilder();
  builder.addGames(games);
  return builder.freeze();
}

function freezeGraph(
  pos: BuildPosition,
  allPositions: Map<string, BuildPosition>,
  visited: Set<string>,
): OpeningTreeNode {
  visited.add(pos.posKey);

  const children: OpeningTreeNode[] = [];
  const edgesSorted = [...pos.edges.values()].sort((a, b) => b.results.total - a.results.total);

  for (const edge of edgesSorted) {
    const targetPos = allPositions.get(edge.targetPosKey);
    if (!targetPos) continue;

    const edgeAvgRating = edge.ratingCount > 0 ? Math.round(edge.ratingSum / edge.ratingCount) : 0;

    if (visited.has(edge.targetPosKey)) {
      // Circular — render as a leaf with stats but no children
      children.push({
        fen: targetPos.fen,
        posKey: targetPos.posKey,
        san: edge.san,
        uci: edge.uci,
        total: edge.results.total,
        white: edge.results.white,
        draws: edge.results.draws,
        black: edge.results.black,
        avgRating: edgeAvgRating,
        lastPlayed: edge.lastPlayed,
        transposition: true,
        children: [],
      });
    } else {
      const childTree = freezeGraph(targetPos, allPositions, new Set(visited));
      children.push({
        ...childTree,
        san: edge.san,
        uci: edge.uci,
        total: edge.results.total,
        white: edge.results.white,
        draws: edge.results.draws,
        black: edge.results.black,
        avgRating: edgeAvgRating,
        lastPlayed: edge.lastPlayed,
        transposition: targetPos.parentCount > 1,
      });
    }
  }

  return {
    fen: pos.fen,
    posKey: pos.posKey,
    san: '',
    uci: '',
    total: pos.results.total,
    white: pos.results.white,
    draws: pos.results.draws,
    black: pos.results.black,
    avgRating: 0,
    lastPlayed: '',
    transposition: pos.parentCount > 1,
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
