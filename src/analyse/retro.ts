// Per-game retrospection: candidate type and pure extraction builder.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts
// and ui/analyse/src/nodeFinder.ts evalSwings.
//
// This module is intentionally rendering-free. It exposes a pure builder that
// later UI and session steps can consume without coupling to the puzzle subsystem.

import { classifyLoss, type MoveLabel } from '../engine/winchances';
import { retroConfig } from './retroConfig';
import { LEARNABLE_REASONS, type LearnableReason, type TreeNode } from '../tree/types';

// Classification rank: higher = stricter. Used to compare against retroConfig.minClassification.
const CLASSIFICATION_RANK: Readonly<Record<MoveLabel, number>> = {
  inaccuracy: 1,
  mistake:    2,
  blunder:    3,
};

/**
 * Opening/book lookup boundary.
 * Returns the list of book UCI moves for a given FEN, or undefined when the
 * position is not in the book (or no provider is available).
 *
 * Mirrors lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts
 * `root.explorer.fetchMasterOpening(fen)` — the cancellation seam between
 * retrospection candidate selection and the opening explorer.
 * Actual book lookup is deferred until an opening provider is wired in.
 */
export type OpeningProvider = (fen: string) => string[] | undefined;

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RETRO_OPENING_CANCEL_MAX_PLY = 20;

/**
 * Build the smallest live opening provider Patzer currently has available.
 *
 * Lichess uses explorer-backed master opening data keyed by FEN. Patzer does not
 * yet have an explorer/book subsystem, so the honest local fallback is the
 * current game's own early mainline when the PGN has opening metadata.
 *
 * This is intentionally limited:
 * - only for standard-start games
 * - only when the imported game carried opening/eco metadata
 * - only for the early opening window, before a later dedicated book source exists
 */
export function buildMainlineOpeningProvider(
  mainline: readonly TreeNode[],
  hasOpeningMetadata: boolean,
): OpeningProvider {
  if (!hasOpeningMetadata) return () => undefined;
  if (mainline[0]?.fen !== STANDARD_START_FEN) return () => undefined;

  const openingMovesByFen = new Map<string, string[]>();
  for (let i = 1; i < mainline.length; i++) {
    const parent = mainline[i - 1];
    const node = mainline[i];
    if (!parent || !node?.uci) continue;
    if (node.ply > RETRO_OPENING_CANCEL_MAX_PLY) break;
    const moves = openingMovesByFen.get(parent.fen) ?? [];
    if (!moves.includes(node.uci)) moves.push(node.uci);
    openingMovesByFen.set(parent.fen, moves);
  }

  return (fen: string) => openingMovesByFen.get(fen);
}

// Eval lookup: structural type matching PositionEval without importing it.
type EvalLookup = (path: string) => {
  cp?:    number;
  mate?:  number;
  best?:  string;
  loss?:  number;
  moves?: string[];
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
 * - bestLine: now persisted as the primary-PV move sequence from parentEval.moves.
 *   Single-PV only (batch runs at MultiPV=1). Multi-PV best lines are deferred.
 *   Absent when the parent position had no PV stored at review time.
 * - openingUcis: the cancellation boundary is defined (OpeningProvider below).
 *   Actual book lookup is deferred until an opening provider is available.
 */
export interface RetroCandidate {
  gameId:         string | null;
  path:           string;            // TreePath to the mistake node (fault)
  parentPath:     string;            // TreePath to the position before the mistake
  fenBefore:      string;            // FEN of the parent position (the puzzle-start square)
  playedMove:     string;            // UCI of the move that was played
  playedMoveSan:  string;            // SAN of the move that was played
  bestMove:       string;            // UCI of the engine best move from fenBefore
  /**
   * Primary PV line starting from fenBefore, in UCI notation.
   * Persisted from the parent position's PositionEval.moves at review time.
   * Absent when no PV was stored (older records, or positions where the engine
   * produced a score but no PV sequence).
   * Single-PV only — mirrors lichess-org/lila: retroCtrl.ts solution node moves array.
   */
  bestLine?:      string[];
  classification: MoveLabel;         // 'inaccuracy' | 'mistake' | 'blunder'
  loss:           number;            // win-chance loss (mover perspective, 0–0.5 scale)
  isMissedMate:   boolean;           // parent had forced mate ≤ 3 but it was not played
  playerColor:    'white' | 'black'; // which player made this mistake
  ply:            number;            // ply number of the mistake node (for move-number display)
  /**
   * Why this position was flagged as a learnable moment.
   * Derived from detection conditions: 'missed-mate' when isMissedMate dominates the
   * classification; 'swing' otherwise (win-chance loss meets threshold).
   * Carried forward to PuzzleCandidate when a RetroCandidate is promoted to a saved puzzle.
   */
  reason:         LearnableReason;
}

/**
 * Scan the reviewed mainline and return retrospection candidates.
 *
 * Inclusion criteria mirror lichess-org/lila: ui/analyse/src/nodeFinder.ts evalSwings:
 *   1. Win-chance loss for the mover meets or exceeds retroConfig.minClassification, OR
 *   2. The parent position had a forced mate in ≤ retroConfig.missedMateDistance available,
 *      but the played move did not deliver or maintain that mate.
 *
 * Threshold note: Lichess evalSwings uses |povDiff| > 0.1 (un-halved scale). Patzer Pro
 * stores loss = (moverPrevWc − moverNodeWc) / 2, so the equivalent inaccuracy floor is
 * loss > 0.05 (= LOSS_THRESHOLDS.inaccuracy). The default minClassification of 'mistake'
 * corresponds to loss >= 0.10 (= LOSS_THRESHOLDS.mistake), which is somewhat stricter
 * than the raw Lichess floor. Setting minClassification to 'inaccuracy' matches Lichess parity.
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
  mainline:       readonly TreeNode[],
  getEval:        EvalLookup,
  gameId:         string | null,
  userColor:      'white' | 'black' | null = null,
  getOpeningUcis: OpeningProvider = () => undefined,
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
    // Threshold is retroConfig.missedMateDistance (default: 3, matching Lichess).
    const parentMatePov = isWhiteMove
      ? parentEval.mate
      : (parentEval.mate !== undefined ? -parentEval.mate : undefined);
    const isMissedMate = (
      retroConfig.missedMateDistance > 0 &&
      parentMatePov !== undefined &&
      parentMatePov > 0 &&
      parentMatePov <= retroConfig.missedMateDistance &&
      !nodeEval.mate
    );

    // --- Condition 1: significant win-chance loss ---
    // Floor is retroConfig.minClassification (default: 'mistake' = loss >= 0.10).
    const loss           = nodeEval.loss;
    const classification = loss !== undefined ? classifyLoss(loss) : null;
    const minRank        = CLASSIFICATION_RANK[retroConfig.minClassification];
    const qualifiesByLoss = (
      classification !== null &&
      CLASSIFICATION_RANK[classification] >= minRank
    );

    if (!qualifiesByLoss && !isMissedMate) continue;

    // --- Opening cancellation ---
    // Mirrors lichess-org/lila: retroCtrl.ts findNextNode openingUcis check:
    // `if (openingUcis.includes(node.uci)) continue`.
    // Skip positions where the played move appears in the opening book — even if
    // the loss threshold is exceeded, book deviations are often intentional and
    // should not be surfaced as mistakes.
    const openingUcis = getOpeningUcis(parent.fen);
    if (openingUcis && node.uci && openingUcis.includes(node.uci)) continue;

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

    // Derive reason code from detection conditions.
    // 'missed-mate' takes priority when it is the primary reason for inclusion —
    // i.e. when the win-chance loss alone would not have qualified but the missed mate did,
    // or when the missed mate is the dominant signal (blunder classification with isMissedMate).
    // 'swing' covers all other qualified positions.
    const reason: LearnableReason = isMissedMate && !qualifiesByLoss
      ? LEARNABLE_REASONS['missed-mate']
      : LEARNABLE_REASONS['swing'];

    const candidate: RetroCandidate = {
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
      reason,
    };
    // Attach the persisted PV line when available for answer reveal and near-best parity.
    // Mirrors lichess-org/lila: retroCtrl.ts solution node (comp child with moves array).
    if (parentEval.moves && parentEval.moves.length > 0) {
      candidate.bestLine = parentEval.moves;
    }
    candidates.push(candidate);
  }

  return candidates;
}
