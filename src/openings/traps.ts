// Repeated loss pattern detection for opponent research.
// Walks the opponent's opening tree to find positions where the opponent
// repeatedly plays a specific move and loses, suggesting a vulnerability.

import type { OpeningTreeNode } from './tree';
import type { ResearchGame } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrapPattern {
  /** UCI moves from root to the position where the vulnerable move is played. */
  path: string[];
  /** SAN moves for display. */
  sans: string[];
  /** FEN at the position before the opponent's vulnerable move. */
  fen: string;
  /** SAN of the move the opponent keeps playing. */
  opponentMove: string;
  /** Number of losses after this move at this node. */
  losses: number;
  /** Total times the opponent reached this position and played this move. */
  totalAtNode: number;
  /** Average game length (in moves) for the losses — lower = faster collapse. */
  avgLossLength: number;
  /** True if losses >= 3 AND loss rate > 60%. */
  isSignificant: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_DEPTH = 10;
const MIN_LOSSES = 3;
const MIN_LOSS_RATE = 0.6;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect positions where the opponent repeatedly loses after playing a specific move.
 * Uses the opening tree's per-node win/loss data.
 *
 * @param tree - Frozen opening tree root
 * @param perspective - Which color the prep user is studying as (opponent plays the other)
 * @param games - Full game list (for game-length cross-reference)
 * @param target - Target player name
 * @returns Array of TrapPattern entries, sorted by significance
 */
export function detectTrapPatterns(
  tree: OpeningTreeNode,
  perspective: 'white' | 'black' | 'both',
  games: readonly ResearchGame[],
  target: string,
): TrapPattern[] {
  const patterns: TrapPattern[] = [];

  // Build a game-length lookup for loss cross-referencing
  const tgt = target.toLowerCase();
  const gameLengthMap = new Map<string, number[]>();
  for (const g of games) {
    if (!g.pgn) continue;
    const isWhite = g.white?.toLowerCase() === tgt;
    const isBlack = g.black?.toLowerCase() === tgt;
    if (!isWhite && !isBlack) continue;
    const lost = (isWhite && g.result === '0-1') || (isBlack && g.result === '1-0');
    if (!lost) continue;
    // Count moves
    const body = g.pgn.replace(/\[[^\]]*\]\s*/g, '').trim();
    const moveNums = body.match(/\d+\./g);
    const moveCount = moveNums ? moveNums.length : 0;
    // We can't perfectly match games to tree paths, so we track global avg loss length
    const key = g.opening?.toLowerCase() ?? 'unknown';
    if (!gameLengthMap.has(key)) gameLengthMap.set(key, []);
    gameLengthMap.get(key)!.push(moveCount);
  }

  // Average loss length across all games (fallback)
  const allLossLengths = [...gameLengthMap.values()].flat();
  const globalAvgLossLength = allLossLengths.length > 0
    ? Math.round(allLossLengths.reduce((s, v) => s + v, 0) / allLossLengths.length)
    : 30;

  // DFS walk
  function walk(
    node: OpeningTreeNode,
    path: string[],
    sans: string[],
    depth: number,
  ): void {
    if (depth > MAX_DEPTH) return;

    for (const child of node.children) {
      if (child.total < MIN_LOSSES) continue;

      // Determine opponent's losses at this child.
      // In the tree, 'white' and 'black' count wins from that side's perspective.
      // The opponent's losses depend on which side they are.
      let losses: number;
      if (perspective === 'white') {
        // User is studying as white, opponent plays black → opponent losses = child.white (white wins)
        losses = child.white;
      } else if (perspective === 'black') {
        // User is studying as black, opponent plays white → opponent losses = child.black (black wins)
        losses = child.black;
      } else {
        // Both — count losses from both sides
        losses = child.white + child.black;
      }

      const lossRate = losses / child.total;

      if (losses >= MIN_LOSSES && lossRate >= MIN_LOSS_RATE) {
        patterns.push({
          path: [...path, child.uci],
          sans: [...sans, child.san],
          fen: node.fen,
          opponentMove: child.san,
          losses,
          totalAtNode: child.total,
          avgLossLength: globalAvgLossLength,
          isSignificant: true,
        });
      }

      // Continue walking
      walk(child, [...path, child.uci], [...sans, child.san], depth + 1);
    }
  }

  walk(tree, [], [], 0);

  // Sort by significance: highest loss count * loss rate first
  patterns.sort((a, b) => {
    const scoreA = a.losses * (a.losses / a.totalAtNode);
    const scoreB = b.losses * (b.losses / b.totalAtNode);
    return scoreB - scoreA;
  });

  return patterns;
}
