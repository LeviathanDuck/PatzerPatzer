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

export interface SampleGameMatch extends ResearchGame {
  sampleNextMove?: string;
}

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

export type OpeningTreePathSnapshotStatus = 'exact' | 'partial' | 'root';

export interface OpeningTreePathSnapshot {
  root: OpeningTreeNode;
  current: OpeningTreeNode;
  requestedPath: string[];
  appliedPath: string[];
  status: OpeningTreePathSnapshotStatus;
  positionsCount: number;
  nodeCount: number;
}

/** Result counts for aggregation. */
interface ResultCounts {
  total: number;
  white: number;
  draws: number;
  black: number;
}

export interface OpeningTreeBuildEdgeSnapshot {
  san: string;
  uci: string;
  targetPosKey: string;
  total: number;
  white: number;
  draws: number;
  black: number;
}

export interface OpeningTreeBuildPositionSnapshot {
  fen: string;
  posKey: string;
  edges: OpeningTreeBuildEdgeSnapshot[];
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

  *positionSnapshots(): IterableIterator<OpeningTreeBuildPositionSnapshot> {
    for (const position of this.positions.values()) {
      yield {
        fen: position.fen,
        posKey: position.posKey,
        edges: sortedEdges(position).map(edge => ({
          san: edge.san,
          uci: edge.uci,
          targetPosKey: edge.targetPosKey,
          total: edge.results.total,
          white: edge.results.white,
          draws: edge.results.draws,
          black: edge.results.black,
        })),
      };
    }
  }

  /**
   * Build only the current visible path plus immediate siblings/children.
   *
   * This keeps the Opening Tree surface responsive for large account trees
   * where recursively cloning every position can block the main thread.
   */
  snapshotAtMoves(moves: readonly string[]): OpeningTreePathSnapshot {
    const requestedPath = [...moves];
    const walk = this._walkPath(requestedPath);
    const root = this._buildPathSnapshotRoot(walk.trail);
    const current = nodeAtMoves(root, walk.appliedPath) ?? root;
    const status: OpeningTreePathSnapshotStatus = requestedPath.length === 0 || walk.appliedPath.length === requestedPath.length
      ? 'exact'
      : walk.appliedPath.length > 0
        ? 'partial'
        : 'root';
    return {
      root,
      current,
      requestedPath,
      appliedPath: walk.appliedPath,
      status,
      positionsCount: this.positions.size,
      nodeCount: this.positions.size,
    };
  }

  /** Return the most-popular continuation from a starting path without freezing the whole graph. */
  mostPopularPathFromMoves(moves: readonly string[], maxPlies = MAX_PLY): string[] {
    const walk = this._walkPath(moves);
    const path = [...walk.appliedPath];
    let current = walk.current;
    while (path.length < maxPlies) {
      const edge = sortedEdges(current)[0];
      if (!edge) break;
      const target = this.positions.get(edge.targetPosKey);
      if (!target) break;
      path.push(edge.uci);
      current = target;
    }
    return path;
  }

  private _walkPath(moves: readonly string[]): {
    appliedPath: string[];
    current: BuildPosition;
    trail: Array<{ position: BuildPosition; incomingEdge: BuildEdge | null }>;
  } {
    const appliedPath: string[] = [];
    const trail: Array<{ position: BuildPosition; incomingEdge: BuildEdge | null }> = [
      { position: this.root, incomingEdge: null },
    ];
    let current = this.root;

    for (const uci of moves) {
      const edge = current.edges.get(uci);
      if (!edge) break;
      const target = this.positions.get(edge.targetPosKey);
      if (!target) break;
      appliedPath.push(uci);
      current = target;
      trail.push({ position: target, incomingEdge: edge });
    }

    return { appliedPath, current, trail };
  }

  private _buildPathSnapshotRoot(
    trail: Array<{ position: BuildPosition; incomingEdge: BuildEdge | null }>,
  ): OpeningTreeNode {
    let selectedChild: OpeningTreeNode | null = null;

    for (let index = trail.length - 1; index >= 0; index--) {
      const entry = trail[index]!;
      const nextEntry = trail[index + 1];
      const children = this._shallowChildren(
        entry.position,
        nextEntry?.incomingEdge?.uci,
        selectedChild,
      );
      selectedChild = nodeForPosition(entry.position, entry.incomingEdge, children);
    }

    return selectedChild ?? nodeForPosition(this.root, null, []);
  }

  private _shallowChildren(
    position: BuildPosition,
    selectedUci?: string,
    selectedChild?: OpeningTreeNode | null,
  ): OpeningTreeNode[] {
    const children: OpeningTreeNode[] = [];
    for (const edge of sortedEdges(position)) {
      const target = this.positions.get(edge.targetPosKey);
      if (!target) continue;
      if (selectedUci && edge.uci === selectedUci && selectedChild) {
        children.push(selectedChild);
      } else {
        children.push(nodeForPosition(target, edge, []));
      }
    }
    return children;
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

function sortedEdges(position: BuildPosition): BuildEdge[] {
  return [...position.edges.values()].sort((a, b) => b.results.total - a.results.total);
}

function nodeForPosition(
  position: BuildPosition,
  incomingEdge: BuildEdge | null,
  children: OpeningTreeNode[],
): OpeningTreeNode {
  const counts = incomingEdge?.results ?? position.results;
  return {
    fen: position.fen,
    posKey: position.posKey,
    san: incomingEdge?.san ?? '',
    uci: incomingEdge?.uci ?? '',
    total: counts.total,
    white: counts.white,
    draws: counts.draws,
    black: counts.black,
    avgRating: incomingEdge && incomingEdge.ratingCount > 0
      ? Math.round(incomingEdge.ratingSum / incomingEdge.ratingCount)
      : 0,
    lastPlayed: incomingEdge?.lastPlayed ?? '',
    transposition: position.parentCount > 1,
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
 * Returns matching ResearchGame records, optionally capped by `limit`.
 */
export function findSampleGames(
  games: readonly ResearchGame[], path: readonly string[], limit = Number.POSITIVE_INFINITY,
): SampleGameMatch[] {
  if (path.length === 0) {
    const results: SampleGameMatch[] = [];
    for (const game of games) {
      if (results.length >= limit) break;
      const sampleNextMove = gameNextMoveLabel(game, path);
      results.push({ ...game, ...(sampleNextMove ? { sampleNextMove } : {}) });
    }
    return results;
  }

  const results: SampleGameMatch[] = [];
  for (const game of games) {
    if (results.length >= limit) break;
    const sampleNextMove = gameNextMoveLabel(game, path);
    if (sampleNextMove !== false) results.push({ ...game, ...(sampleNextMove ? { sampleNextMove } : {}) });
  }
  return results;
}

function gameNextMoveLabel(game: ResearchGame, path: readonly string[]): string | null | false {
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
    return node ? formatContinuationMove(path.length, node.data.san) : null;
  } catch {
    return false;
  }
}

function formatContinuationMove(currentPly: number, san: string): string {
  const moveNumber = Math.floor(currentPly / 2) + 1;
  return currentPly % 2 === 0 ? `${moveNumber}.${san}` : `${moveNumber}...${san}`;
}
