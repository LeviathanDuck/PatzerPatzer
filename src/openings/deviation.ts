// Deviation detection engine for opponent research.
// Walks the opponent's opening tree and compares each node's top move
// against the Lichess explorer's top move for the same position.
//
// Adapted from lichess-org/lila explorer patterns.

import type { OpeningTreeNode } from './tree';
import type { ExplorerCtrl } from './explorerCtrl';
import type { OpeningData } from './explorer';
import { openingFetch, type LichessParams } from './explorer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviationPoint {
  /** UCI moves from root to this position. */
  path: string[];
  /** SAN moves from root for display. */
  sans: string[];
  /** FEN at the deviation position. */
  fen: string;
  /** SAN of the move the opponent most commonly plays. */
  opponentMove: string;
  /** SAN of the explorer's top move. */
  theoryMove: string;
  /** How many times opponent chose their move at this node. */
  opponentFrequency: number;
  /** Total games at this node. */
  gamesAtNode: number;
  /** Ply depth from start position. */
  depth: number;
}

// ---------------------------------------------------------------------------
// Scan configuration
// ---------------------------------------------------------------------------

const MAX_DEPTH = 12;
const MIN_GAMES_AT_NODE = 3;
const MAX_QUERIES = 50;
const QUERY_DELAY_MS = 300;

// ---------------------------------------------------------------------------
// Internal: collect candidate nodes via BFS
// ---------------------------------------------------------------------------

interface CandidateNode {
  node: OpeningTreeNode;
  path: string[];
  sans: string[];
  depth: number;
}

function collectCandidates(root: OpeningTreeNode): CandidateNode[] {
  const result: CandidateNode[] = [];
  const queue: CandidateNode[] = [{ node: root, path: [], sans: [], depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > MAX_DEPTH) continue;
    if (item.node.total < MIN_GAMES_AT_NODE && item.depth > 0) continue;

    // Only add non-root nodes as candidates
    if (item.depth > 0) {
      result.push(item);
    }

    // Enqueue children (sorted by frequency, most common first)
    for (const child of item.node.children) {
      if (child.total < MIN_GAMES_AT_NODE) continue;
      queue.push({
        node: child,
        path: [...item.path, child.uci],
        sans: [...item.sans, child.san],
        depth: item.depth + 1,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const deviationCache = new Map<string, DeviationPoint[]>();

function cacheKey(collectionId: string, color: string): string {
  return `${collectionId}:${color}`;
}

export function getCachedDeviations(collectionId: string, color: string): DeviationPoint[] | undefined {
  return deviationCache.get(cacheKey(collectionId, color));
}

export function clearDeviationCache(): void {
  deviationCache.clear();
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

export interface DeviationScanProgress {
  queried: number;
  total: number;
  results: DeviationPoint[];
  done: boolean;
}

/**
 * Scan the opponent's opening tree for deviations from Lichess explorer theory.
 *
 * This is async and calls `onProgress` as each node is queried, allowing
 * progressive UI updates. The caller should trigger `redraw()` inside onProgress.
 *
 * @param tree - Frozen opening tree root
 * @param collectionId - Collection ID for caching
 * @param colorFilter - Current color perspective
 * @param onProgress - Callback for progressive updates
 * @param signal - AbortSignal for cancellation
 * @returns Final list of deviation points
 */
export async function scanDeviations(
  tree: OpeningTreeNode,
  collectionId: string,
  colorFilter: 'white' | 'black' | 'both',
  onProgress: (progress: DeviationScanProgress) => void,
  signal?: AbortSignal,
): Promise<DeviationPoint[]> {
  const key = cacheKey(collectionId, colorFilter);
  const cached = deviationCache.get(key);
  if (cached) {
    onProgress({ queried: 0, total: 0, results: cached, done: true });
    return cached;
  }

  const candidates = collectCandidates(tree);
  // Cap at MAX_QUERIES, prioritizing by game count (most-played positions first)
  candidates.sort((a, b) => b.node.total - a.node.total);
  const toQuery = candidates.slice(0, MAX_QUERIES);

  const results: DeviationPoint[] = [];

  for (let i = 0; i < toQuery.length; i++) {
    if (signal?.aborted) break;

    const candidate = toQuery[i]!;
    const fen = candidate.node.fen;

    try {
      // Fetch from Lichess explorer (lichess DB by default)
      const params: LichessParams = {
        db: 'lichess',
        fen,
        variant: 'standard',
        speeds: ['blitz', 'rapid', 'classical'],
        ratings: [1600, 1800, 2000, 2200, 2500],
        topGames: false,
        recentGames: false,
      };

      // Collect streamed data into a single response
      let explorerData: Partial<OpeningData> = {};
      await openingFetch(params, chunk => { explorerData = { ...explorerData, ...chunk }; }, signal);

      // Compare: opponent's top move at this node's parent vs explorer's top move
      // We need the parent node's children to see what opponent plays FROM this position
      const moves = explorerData.moves ?? [];
      if (moves.length > 0 && candidate.node.children.length > 0) {
        const theoryTop = moves[0]!;
        const opponentTop = candidate.node.children[0]!;

        if (theoryTop.uci !== opponentTop.uci) {
          results.push({
            path: [...candidate.path, opponentTop.uci],
            sans: [...candidate.sans, opponentTop.san],
            fen,
            opponentMove: opponentTop.san,
            theoryMove: theoryTop.san,
            opponentFrequency: opponentTop.total,
            gamesAtNode: candidate.node.total,
            depth: candidate.depth,
          });
        }
      }
    } catch (_e) {
      // Skip failed queries (rate limited, network error, etc.)
    }

    onProgress({
      queried: i + 1,
      total: toQuery.length,
      results: [...results],
      done: false,
    });

    // Rate limiting delay between queries
    if (i < toQuery.length - 1 && !signal?.aborted) {
      await new Promise(resolve => setTimeout(resolve, QUERY_DELAY_MS));
    }
  }

  // Sort results by depth (shallowest deviations first — most important)
  results.sort((a, b) => a.depth - b.depth);

  // Cache
  deviationCache.set(key, results);

  onProgress({ queried: toQuery.length, total: toQuery.length, results, done: true });
  return results;
}
