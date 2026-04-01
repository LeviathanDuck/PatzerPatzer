// Shared utility for computing the evaluation difference between the engine's
// best move and the move actually played. Used by the retro (Learn From Your
// Mistakes) interface; designed to be imported by the puzzle interface later.
//
// Sign convention (matches src/engine/winchances.ts):
//   All cp values in evalCache are WHITE-perspective (positive = white winning).
//   This normalization happens in parseEngineLine (negated for odd/black-to-move ply).
//   evalWinChances() also returns white-perspective WC in [-1, 1].

import { evalWinChances } from '../engine/winchances';

/** Source quality of the computed diff. */
export type EvalDiffConfidence = 'cp' | 'wc-approx';

/**
 * The computed evaluation difference between the engine best move and the
 * move actually played, from the mover's perspective.
 *
 * Positive values mean the engine best was better for the mover (expected case).
 * Negative values mean the played move was actually evaluated as better (eval
 * noise at low depth) — clamped to 0 in `formatted` but preserved in raw fields.
 */
export interface EvalDiff {
  /** Win-chance diff, 0–0.5 scale. Mirrors the `loss` field on RetroCandidate. */
  wcDiff: number;
  /**
   * Centipawn diff from mover's perspective (100 = 1 pawn).
   * Null when the source position involves a forced mate (use `formatted` for display).
   */
  cpDiff: number | null;
  /**
   * Human-readable pawn string ready for display, e.g. "+2.0", "+0.5", "M3".
   * Negative raw diffs are shown as "0.0" (eval noise, not a real improvement).
   * Caller supplies surrounding copy ("X better than what was played", etc.).
   */
  formatted: string;
  /** Whether cpDiff is derived from cached cp data or approximated from win-chance loss. */
  confidence: EvalDiffConfidence;
}

export interface EvalDiffInput {
  /**
   * Eval at the parent position (exercise start, before the move).
   * cp is WHITE-perspective (positive = white winning).
   */
  parentEval: { cp?: number; mate?: number; loss?: number };
  /**
   * Eval at the child position (after the played move).
   * cp is WHITE-perspective (positive = white winning).
   */
  nodeEval: { cp?: number; mate?: number; loss?: number };
  /** Which color played the move being evaluated. */
  playerColor: 'white' | 'black';
}

/** Max cpDiff to display — caps extreme values from near-decisive positions. */
const MAX_CP_DISPLAY = 1500;

/**
 * Format a centipawn diff as a pawn string.
 * Negative or zero diffs (played move as good or better) display as "0.0".
 */
export function formatPawns(cpDiff: number): string {
  const clamped = Math.max(0, Math.min(MAX_CP_DISPLAY, cpDiff));
  return `+${(clamped / 100).toFixed(1)}`;
}

/**
 * Compute the eval diff between the engine best move and the played move.
 *
 * Primary source: nodeEval.loss (precomputed mover-perspective win-chance
 * loss from batch analysis). Preferred because both parent and node evals
 * were produced in the same analysis pass, avoiding depth inconsistency.
 *
 * Secondary source: direct cp arithmetic from the cached cp fields.
 * Since both evals are white-perspective, the mover's cp diff is:
 *   sign = playerColor === 'white' ? 1 : -1
 *   cpDiff = sign * parentEval.cp − sign * nodeEval.cp
 *
 * Returns null if no usable data is present.
 */
export function computeEvalDiff(input: EvalDiffInput): EvalDiff | null {
  const { parentEval, nodeEval, playerColor } = input;

  // --- Mate handling ---
  // If the parent position had a forced mate (engine best delivers/maintains
  // mate) but the played move did not, report as a mate miss.
  const sign = playerColor === 'white' ? 1 : -1;
  const moverParentMate = parentEval.mate !== undefined ? sign * parentEval.mate : undefined;
  const moverNodeMate   = nodeEval.mate   !== undefined ? sign * nodeEval.mate   : undefined;

  if (moverParentMate !== undefined && moverParentMate > 0 && !moverNodeMate) {
    // Best move was a forced mate; played move lost it.
    return {
      wcDiff:     nodeEval.loss ?? 0.5,
      cpDiff:     null,
      formatted:  `M${moverParentMate}`,
      confidence: 'cp',
    };
  }

  // --- Primary: loss-based (win-chance) ---
  if (nodeEval.loss !== undefined) {
    const wcDiff = nodeEval.loss; // 0–0.5 mover-perspective

    // Attempt cp derivation from cached values for better accuracy.
    if (parentEval.cp !== undefined && nodeEval.cp !== undefined) {
      const moverParentCp = sign * parentEval.cp;
      const moverNodeCp   = sign * nodeEval.cp;
      const cpDiff = Math.min(MAX_CP_DISPLAY, moverParentCp - moverNodeCp);
      return {
        wcDiff,
        cpDiff,
        formatted:  formatPawns(cpDiff),
        confidence: 'cp',
      };
    }

    // No cp available — approximate from win-chance loss.
    // Inverse sigmoid near the centre: cp ≈ wcFull / 0.00368208 × 0.5
    // where wcFull = wcDiff × 2 (un-halved).
    // This is a first-order approximation; accurate near equal positions.
    const wcFull   = Math.min(1, wcDiff * 2);
    const cpApprox = Math.round(wcFull * 271); // 271 ≈ 0.5 / 0.00368208 / 0.5 ... simplified
    const cpClamped = Math.min(MAX_CP_DISPLAY, cpApprox);
    return {
      wcDiff,
      cpDiff:     cpClamped,
      formatted:  formatPawns(cpClamped),
      confidence: 'wc-approx',
    };
  }

  // --- Secondary: cp-only (no loss field) ---
  if (parentEval.cp !== undefined && nodeEval.cp !== undefined) {
    const moverParentCp = sign * parentEval.cp;
    const moverNodeCp   = sign * nodeEval.cp;
    const cpDiff = Math.min(MAX_CP_DISPLAY, moverParentCp - moverNodeCp);

    // Derive approximate wcDiff from the two evals for completeness.
    const parentWc = evalWinChances(parentEval);
    const nodeWc   = evalWinChances(nodeEval);
    const wcDiff = (parentWc !== undefined && nodeWc !== undefined)
      ? Math.max(0, (sign * parentWc - sign * nodeWc) / 2)
      : 0;

    return {
      wcDiff,
      cpDiff,
      formatted:  formatPawns(cpDiff),
      confidence: 'cp',
    };
  }

  return null;
}
