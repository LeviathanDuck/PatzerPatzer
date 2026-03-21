// Per-game retrospection: candidate type and pure extraction builder.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts
// and ui/analyse/src/nodeFinder.ts evalSwings.
//
// This module is intentionally rendering-free. It exposes a pure builder that
// later UI and session steps can consume without coupling to the puzzle subsystem.

import { classifyLoss, LOSS_THRESHOLDS, type MoveLabel } from '../engine/winchances';
import type { TreeNode } from '../tree/types';

// Eval lookup: structural type matching PositionEval without importing it.
type EvalLookup = (path: string) => {
  cp?:   number;
  mate?: number;
  best?: string;
  loss?: number;
} | undefined;

/**
 * A position where the user made a classifiable mistake, forming the basic unit
 * of per-game retrospective review.
 *
 * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts Retrospection.
 *
 * Parity notes vs Lichess Retrospection { fault, prev, solution, openingUcis }:
 * - fault/prev: represented here as path + parentPath (tree node references are
 *   not stored because Patzer Pro's batch analysis populates evalCache rather than
 *   tree-node ceval/eval fields).
 * - solution: Lichess derives this from `prev.node.children.find(n => n.comp)`, a
 *   "comp" child added during server analysis. Patzer Pro stores only the best-move
 *   UCI in evalCache (parentEval.best), so the solution node cannot be reconstructed
 *   without additional multi-PV storage. bestMove is the functional equivalent.
 * - bestLine: deferred. Lichess derives the PV line from the comp child's moves array
 *   (multi-PV output). Patzer Pro batch review runs at MultiPV=1 and stores only the
 *   best move UCI. Include bestLine once multi-PV batch output is persisted.
 * - openingUcis: deferred. Lichess cancels opening-book moves via explorer lookup.
 */
export interface RetroCandidate {
  gameId:         string | null;
  path:           string;            // TreePath to the mistake node (fault)
  parentPath:     string;            // TreePath to the position before the mistake
  fenBefore:      string;            // FEN of the parent position (the puzzle-start square)
  playedMove:     string;            // UCI of the move that was played
  playedMoveSan:  string;            // SAN of the move that was played
  bestMove:       string;            // UCI of the engine best move from fenBefore
  classification: MoveLabel;         // 'inaccuracy' | 'mistake' | 'blunder'
  loss:           number;            // win-chance loss (mover perspective, 0–0.5 scale)
  isMissedMate:   boolean;           // parent had forced mate ≤ 3 but it was not played
  playerColor:    'white' | 'black'; // which player made this mistake
  ply:            number;            // ply number of the mistake node (for move-number display)
}

/**
 * Scan the reviewed mainline and return retrospection candidates.
 *
 * Inclusion criteria mirror lichess-org/lila: ui/analyse/src/nodeFinder.ts evalSwings:
 *   1. Win-chance loss for the mover is at or above the mistake threshold (≥ 0.06), OR
 *   2. The parent position had a forced mate in ≤ 3 available, but the played move
 *      did not deliver or maintain that mate.
 *
 * Threshold note: Lichess evalSwings uses |povDiff| > 0.1 (un-halved scale). Patzer Pro
 * stores loss = (moverPrevWc − moverNodeWc) / 2, so the equivalent threshold is
 * loss > 0.05. We use LOSS_THRESHOLDS.mistake (0.06) instead, which is the nearest named
 * boundary and produces functionally equivalent candidate sets in practice. Deviations
 * occur only for moves in the 0.05–0.06 loss band, which are marginal and rare.
 *
 * The `userColor` parameter mirrors the per-color filter in retroCtrl.ts findNextNode
 * (`n.ply % 2 === colorModulo`). Pass a color to restrict to one player's mistakes,
 * or omit/null to include both players.
 *
 * @param mainline  - ordered list of tree nodes from root through last move
 * @param getEval   - evalCache lookup by path
 * @param gameId    - source game identifier, carried into each candidate
 * @param userColor - if provided, restrict to mistakes made by this player
 */
export function buildRetroCandidates(
  mainline:  readonly TreeNode[],
  getEval:   EvalLookup,
  gameId:    string | null,
  userColor: 'white' | 'black' | null = null,
): RetroCandidate[] {
  const candidates: RetroCandidate[] = [];
  let path = '';

  for (let i = 1; i < mainline.length; i++) {
    const node   = mainline[i]!;
    const parent = mainline[i - 1]!;
    path += node.id;

    const parentPath  = path.slice(0, -2);
    const isWhiteMove = node.ply % 2 === 1;
    const playerColor: 'white' | 'black' = isWhiteMove ? 'white' : 'black';

    // Color filter: mirrors retroCtrl.ts `n.ply % 2 === colorModulo` in findNextNode.
    if (userColor !== null && playerColor !== userColor) continue;

    const nodeEval   = getEval(path);
    const parentEval = getEval(parentPath);

    // Require both positions to have engine data and the parent to have a best move.
    // Mirrors nodeFinder.ts: `curr.eval && prev.eval && hasCompChild(prev)`.
    // Patzer Pro stores best-move UCI in evalCache rather than as a comp child node —
    // this is functionally equivalent for candidate detection and move display.
    if (!nodeEval || !parentEval || !parentEval.best) continue;

    // Played move UCI is required to form a candidate.
    if (!node.uci) continue;

    // --- Condition 2: missed forced mate ---
    // Mirrors nodeFinder.ts: `prev.eval.mate && !curr.eval.mate && |prev.eval.mate| <= 3`
    // parentMatePov: mate count from the mover's perspective (positive = mover wins).
    const parentMatePov = isWhiteMove
      ? parentEval.mate
      : (parentEval.mate !== undefined ? -parentEval.mate : undefined);
    const isMissedMate = (
      parentMatePov !== undefined &&
      parentMatePov > 0 &&
      parentMatePov <= 3 &&
      !nodeEval.mate
    );

    // --- Condition 1: significant win-chance loss ---
    const loss           = nodeEval.loss;
    const classification = loss !== undefined ? classifyLoss(loss) : null;
    const qualifiesByLoss = (
      classification === 'mistake' || classification === 'blunder'
    );

    if (!qualifiesByLoss && !isMissedMate) continue;

    // Resolve final classification.
    // Missed-mate cases that do not already reach the mistake threshold are labelled
    // blunder (a forced mate was available and was missed — that is a blunder by definition).
    let finalClassification: MoveLabel;
    if (classification === 'blunder' || classification === 'mistake') {
      finalClassification = classification;
    } else {
      // isMissedMate must be true to reach here
      finalClassification = 'blunder';
    }

    candidates.push({
      gameId,
      path,
      parentPath,
      fenBefore:      parent.fen,
      playedMove:     node.uci,
      playedMoveSan:  node.san ?? '',
      bestMove:       parentEval.best,
      classification: finalClassification,
      loss:           loss ?? 0,
      isMissedMate,
      playerColor,
      ply:            node.ply,
    });
  }

  return candidates;
}
