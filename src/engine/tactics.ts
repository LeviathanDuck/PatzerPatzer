/**
 * Missed-moment detection — shared logic for foreground (batch.ts) and
 * background (reviewQueue.ts) review pipelines.
 *
 * A "missed moment" is a position where a significant winning opportunity was
 * available but not taken.  Three independent categories are detected, each
 * with its own threshold that can be tuned via setMissedMomentConfig().
 *
 * Adapted from lichess-org/lila: ui/analyse/src/nodeFinder.ts evalSwings
 */

import { evalWinChances } from './winchances';
import type { TreeNode } from '../tree/types';

// ── Config ───────────────────────────────────────────────────────────────────

export interface MissedMomentConfig {
  /**
   * Win-chance loss threshold for a plain tactical swing.
   * Uses our scaled `loss` field (= raw win-chance delta / 2).
   *   0.05 = Lichess inaccuracy floor  (≡ raw 0.10 — any real mistake)
   *   0.10 = Lichess mistake floor     (≡ raw 0.20)
   *   0.15 = Lichess blunder floor     (≡ raw 0.30)
   */
  swingThreshold: number;

  /**
   * Flag a missed forced mate when the user had mate in ≤ N plies before
   * their move but the played move does not deliver/maintain mate.
   * Phase gate does not apply to this category.  Set to 0 to disable.
   */
  missedMateMaxN: number;

  /**
   * "Near-win collapse": mover's win-chances before the move must be at least
   * this value for the collapse category to trigger.  Range [0, 1].
   * Set to 1.0 to disable.
   */
  collapseWcFloor: number;

  /**
   * Minimum `loss` required to trigger a collapse flag.  Intentionally lower
   * than swingThreshold because context (already winning) amplifies significance.
   */
  collapseDropMin: number;

  /**
   * Phase gate: skip moves at ply >= this value (0-indexed half-moves).
   * Ply 80 = move 40 covers opening + middlegame.
   * Set to 0 to check all positions regardless of phase.
   */
  maxPly: number;
}

export const missedMomentConfig: MissedMomentConfig = {
  swingThreshold:  0.05,   // Lichess inaccuracy floor — any real mistake is flagged
  missedMateMaxN:  5,      // mate in 1–5 (was hardcoded 3; extend to longer forcing lines)
  collapseWcFloor: 0.55,   // mover had > 55% win chances (~+50–100 cp)
  collapseDropMin: 0.08,   // and dropped by ≥ 0.08 (mistake-sized in a winning position)
  maxPly:          80,     // up to move 40 (was 60 = move 30)
};

export function setMissedMomentConfig(patch: Partial<MissedMomentConfig>): void {
  Object.assign(missedMomentConfig, patch);
}

// ── Types ────────────────────────────────────────────────────────────────────

export type MissedMomentKind = 'swing' | 'missed-mate' | 'collapse';

export interface MissedMoment {
  kind: MissedMomentKind;
  ply:  number;
}

// Structural subset of PositionEval — avoids importing from engine/ctrl.ts
// which would create a circular dependency.
type EvalEntry = { cp?: number; mate?: number; loss?: number; best?: string };

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Scan the mainline and return every missed tactical moment for the given
 * user color.  Call after analysis is complete.
 */
export function detectMissedMoments(
  mainline:  readonly TreeNode[],
  cache:     Map<string, EvalEntry>,
  userColor: 'white' | 'black' | null,
  config:    MissedMomentConfig = missedMomentConfig,
): MissedMoment[] {
  const moments: MissedMoment[] = [];
  let path = '';

  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i]!;
    path += node.id;

    // Color filter: only examine moves made by the user.
    const isWhiteMove = node.ply % 2 === 1;
    const isUserMove  =
      userColor === null ||
      (userColor === 'white' && isWhiteMove) ||
      (userColor === 'black' && !isWhiteMove);
    if (!isUserMove) continue;

    const parentPath = path.slice(0, -2);
    const nodeEval   = cache.get(path);
    const parentEval = cache.get(parentPath);
    if (!nodeEval || !parentEval) continue;

    // ── MISSED FORCED MATE ────────────────────────────────────────────────
    // Phase gate does not apply — a forced mate is always significant.
    // Mirrors the mate special-case in Lichess nodeFinder.ts evalSwings.
    // Requires a parent best-move (engine had an alternative stored).
    if (config.missedMateMaxN > 0 && parentEval.best) {
      const userMate = isWhiteMove
        ? parentEval.mate
        : (parentEval.mate !== undefined ? -parentEval.mate : undefined);
      if (
        userMate !== undefined &&
        userMate > 0 &&
        userMate <= config.missedMateMaxN &&
        !nodeEval.mate
      ) {
        moments.push({ kind: 'missed-mate', ply: node.ply });
        continue;
      }
    }

    // Phase gate: discard late endgame moves for the remaining categories.
    if (config.maxPly > 0 && node.ply >= config.maxPly) continue;

    if (nodeEval.loss === undefined) continue;

    // ── NEAR-WIN COLLAPSE ─────────────────────────────────────────────────
    // User was clearly winning but squandered the advantage in one move.
    // Flagged as its own category so it can be labelled and filtered
    // independently from generic swings in neutral positions.
    const parentWc = evalWinChances(parentEval);
    if (parentWc !== undefined) {
      const moverParentWc = isWhiteMove ? parentWc : -parentWc;
      if (
        moverParentWc >= config.collapseWcFloor &&
        nodeEval.loss >= config.collapseDropMin
      ) {
        moments.push({ kind: 'collapse', ply: node.ply });
        continue;
      }
    }

    // ── TACTICAL SWING ────────────────────────────────────────────────────
    // Significant win-chance loss from any position.  Requires a parent
    // best-move so we only flag positions where the engine had a clear
    // alternative — mirrors hasCompChild() in Lichess nodeFinder.ts.
    if (nodeEval.loss > config.swingThreshold && parentEval.best) {
      moments.push({ kind: 'swing', ply: node.ply });
    }
  }

  return moments;
}

/** Returns true if any missed moment was detected. */
export function hasMissedMoments(
  mainline:  readonly TreeNode[],
  cache:     Map<string, EvalEntry>,
  userColor: 'white' | 'black' | null,
  config?:   MissedMomentConfig,
): boolean {
  return detectMissedMoments(mainline, cache, userColor, config).length > 0;
}
