// Adapted from lichess-org/lila: ui/lib/src/ceval/winningChances.ts
//
// ── Sign convention (critical) ──────────────────────────────────────────────
// Stockfish reports cp from the SIDE-TO-MOVE's perspective (UCI standard).
// When black is to move (odd ply), a positive cp means black is winning.
// We must negate odd-ply scores to get a consistently WHITE-perspective value,
// matching how Lichess stores ceval.cp in its tree nodes.
// This normalization happens in parseEngineLine and is guarded by evalNodePly.
//
// ── Exact Lichess parity ────────────────────────────────────────────────────
// • Sigmoid formula and multiplier −0.00368208 (lila PR #11148)
// • cp clamped to [−1000, 1000] before the sigmoid
// • Mate converted to cp equivalent: (21 − min(10, |mate|)) × 100
// • povDiff formula: loss = (moverPrevWc − moverNodeWc) / 2
// • Classification thresholds: 0.05 / 0.10 / 0.15  (analysis mode; ≡ Lichess 0.1/0.2/0.3 / 2)
// • Best-move short-circuit: if played UCI equals parent engine best, no label
//
// ── Intentional divergence ──────────────────────────────────────────────────
// • Mover perspective: Lichess practice mode uses a fixed bottomColor() (one
//   player's POV). We use node.ply % 2 to identify each move's actual mover,
//   so both players' mistakes are labelled correctly in post-game analysis.
//
// ── Known approximations ────────────────────────────────────────────────────
// • No tablebase / threefold / 50-move-rule overrides: Lichess sets cp=0 for
//   drawn positions. We use raw engine cp.

const WIN_CHANCE_MULTIPLIER = -0.00368208; // https://github.com/lichess-org/lila/pull/11148

export function rawWinChances(cp: number): number {
  return 2 / (1 + Math.exp(WIN_CHANCE_MULTIPLIER * cp)) - 1;
}

export interface WinChancesEval {
  cp?: number;
  mate?: number;
}

// Classification thresholds for post-game analysis.
// Lichess game analysis (Advice.scala) uses 0.1 / 0.2 / 0.3 on the raw
// win-chance delta.  Our loss field = delta / 2, so the equivalents are:
//   inaccuracy: 0.05  (≡ Lichess 0.1)
//   mistake:    0.10  (≡ Lichess 0.2)
//   blunder:    0.15  (≡ Lichess 0.3)
// Previous values (0.025 / 0.06 / 0.14) were ported from practice mode and
// were too sensitive, over-classifying small inaccuracies.
export const LOSS_THRESHOLDS = {
  inaccuracy: 0.05,
  mistake:    0.10,
  blunder:    0.15,
} as const;

export type MoveLabel = 'inaccuracy' | 'mistake' | 'blunder';

export function classifyLoss(loss: number): MoveLabel | null {
  if (loss >= LOSS_THRESHOLDS.blunder)    return 'blunder';
  if (loss >= LOSS_THRESHOLDS.mistake)    return 'mistake';
  if (loss >= LOSS_THRESHOLDS.inaccuracy) return 'inaccuracy';
  return null;
}

export function evalWinChances(ev: WinChancesEval): number | undefined {
  if (ev.mate !== undefined) {
    // Mate in N converted to a large cp equivalent, capped at mate-in-10.
    // Matches lichess-org/lila: ui/lib/src/ceval/winningChances.ts mateWinningChances
    const cp = (21 - Math.min(10, Math.abs(ev.mate))) * 100;
    return rawWinChances(cp * (ev.mate > 0 ? 1 : -1));
  }
  if (ev.cp !== undefined) {
    return rawWinChances(Math.min(Math.max(-1000, ev.cp), 1000));
  }
  return undefined;
}
