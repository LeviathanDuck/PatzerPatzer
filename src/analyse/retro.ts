// Per-game retrospection: candidate type and pure extraction builder.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts
// and ui/analyse/src/nodeFinder.ts evalSwings.
//
// This module is intentionally rendering-free. It exposes a pure builder that
// later UI and session steps can consume without coupling to the puzzle subsystem.

import { classifyLoss, evalWinChances, type MoveLabel } from '../engine/winchances';
import { computeEvalDiff, type EvalDiff } from './evalDiff';
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
  /**
   * Evaluation difference between the engine best move and the played move,
   * from the mover's perspective. Populated at session-build time when both
   * parentEval and nodeEval are in the cache. Absent when the game has not
   * been reviewed or when the cache was incomplete at build time.
   * Can be refreshed post-build via requestRetroBackgroundEval().
   */
  evalDiff?:      EvalDiff;
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

    // --- Condition 3: collapse (blown win) ---
    // User was clearly winning but squandered advantage in one move.
    // Reuses the same semantics as src/engine/tactics.ts collapse detection.
    const parentWc = evalWinChances(parentEval);
    const moverParentWc = parentWc !== undefined
      ? (isWhiteMove ? parentWc : -parentWc)
      : undefined;
    const isCollapse = (
      retroConfig.collapseEnabled &&
      moverParentWc !== undefined &&
      moverParentWc >= retroConfig.collapseWcFloor &&
      loss !== undefined &&
      loss >= retroConfig.collapseDropMin
    );

    if (!qualifiesByLoss && !isMissedMate && !isCollapse) continue;

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
    // Collapse-only cases use actual loss classification or fall back to 'inaccuracy'.
    let finalClassification: MoveLabel;
    if (classification === 'blunder' || classification === 'mistake') {
      finalClassification = classification;
    } else if (isMissedMate) {
      finalClassification = 'blunder';
    } else {
      // collapse-only: use actual classification if available, else inaccuracy
      finalClassification = classification ?? 'inaccuracy';
    }

    // Derive reason code from detection conditions.
    // Priority: missed-mate > collapse > swing.
    const reason: LearnableReason = isMissedMate && !qualifiesByLoss
      ? LEARNABLE_REASONS['missed-mate']
      : isCollapse && !qualifiesByLoss
        ? LEARNABLE_REASONS['collapse']
        : isCollapse
          ? LEARNABLE_REASONS['collapse']
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
    // Populate eval diff at build time from cache data.
    // nodeEval.loss is the preferred source (same-depth batch consistency).
    // Will be absent only when the game is partially analyzed or loss not yet stored.
    const diff = computeEvalDiff({ parentEval, nodeEval, playerColor });
    if (diff) candidate.evalDiff = diff;
    candidates.push(candidate);
  }

  // ── Defensive-resource pass ────────────────────────────────────────────
  // When enabled, scan for positions where the user was worse but missed a
  // saving move.  Added as a separate family with reason='defensive'.
  if (retroConfig.defensiveEnabled) {
    const existingPaths = new Set(candidates.map(c => c.path));
    let defPath = '';

    for (let i = 1; i < mainline.length; i++) {
      const node   = mainline[i]!;
      const parent = mainline[i - 1]!;
      defPath += node.id;

      const defParentPath = defPath.slice(0, -2);
      const isWhiteMove   = node.ply % 2 === 1;
      const playerColor: 'white' | 'black' = isWhiteMove ? 'white' : 'black';
      if (userColor !== null && playerColor !== userColor) continue;
      if (!node.uci) continue;
      if (existingPaths.has(defPath)) continue;

      const nodeEv   = getEval(defPath);
      const parentEv = getEval(defParentPath);
      if (!nodeEv || !parentEv || !parentEv.best) continue;
      if (nodeEv.loss === undefined) continue;

      const pWc = evalWinChances(parentEv);
      if (pWc === undefined) continue;
      const moverPWc = isWhiteMove ? pWc : -pWc;

      // User must be in a losing/worse position.
      if (moverPWc > retroConfig.defensiveWcCeiling) continue;
      // Gap between best and played must be significant.
      if (nodeEv.loss < retroConfig.defensiveSalvageMin) continue;

      // Opening cancellation
      const openingUcis = getOpeningUcis(parent.fen);
      if (openingUcis && openingUcis.includes(node.uci)) continue;

      const defClassification = classifyLoss(nodeEv.loss) ?? 'inaccuracy';

      candidates.push({
        gameId,
        path:            defPath,
        parentPath:      defParentPath,
        fenBefore:       parent.fen,
        playedMove:      node.uci,
        playedMoveSan:   node.san ?? '',
        bestMove:        parentEv.best,
        ...(parentEv.moves?.length ? { bestLine: parentEv.moves } : {}),
        classification:  defClassification,
        loss:            nodeEv.loss,
        isMissedMate:    false,
        playerColor,
        ply:             node.ply,
        reason:          LEARNABLE_REASONS['defensive'],
      });
    }
  }

  // ── Punish-the-blunder pass ────────────────────────────────────────────
  // When enabled, scan for positions where the opponent blundered but the
  // user failed to exploit it.  Added as a separate family with reason='punish'.
  if (retroConfig.punishEnabled) {
    const existingPaths = new Set(candidates.map(c => c.path));
    const pathArr: string[] = [''];
    for (let i = 1; i < mainline.length; i++) {
      pathArr.push(pathArr[i - 1]! + mainline[i]!.id);
    }

    for (let i = 2; i < mainline.length; i++) {
      const node   = mainline[i]!;
      const parent = mainline[i - 1]!;
      const nodePath = pathArr[i]!;

      if (existingPaths.has(nodePath)) continue;

      const isWhiteMove = node.ply % 2 === 1;
      const playerColor: 'white' | 'black' = isWhiteMove ? 'white' : 'black';
      if (userColor !== null && playerColor !== userColor) continue;
      if (!node.uci) continue;

      const gpPath     = pathArr[i - 2]!;
      const parentPath = pathArr[i - 1]!;

      const gpEval     = getEval(gpPath);
      const parentEval = getEval(parentPath);
      const nodeEval   = getEval(nodePath);
      if (!gpEval || !parentEval || !nodeEval) continue;
      if (!parentEval.best) continue;

      const gpWc     = evalWinChances(gpEval);
      const parentWc = evalWinChances(parentEval);
      const nodeWc   = evalWinChances(nodeEval);
      if (gpWc === undefined || parentWc === undefined || nodeWc === undefined) continue;

      const userSign     = isWhiteMove ? 1 : -1;
      const userGpWc     = gpWc * userSign;
      const userParentWc = parentWc * userSign;
      const userNodeWc   = nodeWc * userSign;

      // Opponent blunder: swing in user's favor (scaled 0–0.5).
      const opponentSwing = (userParentWc - userGpWc) / 2;
      if (opponentSwing < retroConfig.punishOpponentSwingMin) continue;

      // User failure: advantage decreased (scaled 0–0.5).
      const exploitDrop = (userParentWc - userNodeWc) / 2;
      if (exploitDrop < retroConfig.punishExploitDropMin) continue;

      // Opening cancellation
      const openingUcis = getOpeningUcis(parent.fen);
      if (openingUcis && node.uci && openingUcis.includes(node.uci)) continue;

      const punishLoss = nodeEval.loss ?? exploitDrop;
      const punishClassification = classifyLoss(punishLoss) ?? 'inaccuracy';

      candidates.push({
        gameId,
        path:            nodePath,
        parentPath:      parentPath,
        fenBefore:       parent.fen,
        playedMove:      node.uci,
        playedMoveSan:   node.san ?? '',
        bestMove:        parentEval.best,
        ...(parentEval.moves?.length ? { bestLine: parentEval.moves } : {}),
        classification:  punishClassification,
        loss:            punishLoss,
        isMissedMate:    false,
        playerColor,
        ply:             node.ply,
        reason:          LEARNABLE_REASONS['punish'],
      });
    }
  }

  return candidates;
}

/**
 * Refresh a candidate's evalDiff from the current eval cache state.
 *
 * Called from the board move handler after a retro exercise is resolved so
 * that the feedback panel shows the freshest available diff. The live ceval
 * naturally evaluates the played-move position after the user makes a move,
 * so the cache may be deeper than at session-build time by the time this runs.
 *
 * No engine calls are made here — this is a pure cache read. If the engine
 * has not yet produced an improved eval since session build, the existing
 * evalDiff (from batch analysis) is preserved as-is.
 *
 * @param candidate  The retro candidate to refresh.
 * @param getEval    Current eval cache getter (path → PositionEval | undefined).
 * @returns          The refreshed EvalDiff, or the existing one if no improvement.
 */
export function requestRetroBackgroundEval(
  candidate: RetroCandidate,
  getEval: (path: string) => { cp?: number; mate?: number; loss?: number; depth?: number } | undefined,
): EvalDiff | null {
  // Already high-confidence from cp data — no improvement possible from cache alone.
  if (candidate.evalDiff?.confidence === 'cp') return candidate.evalDiff;

  const parentEval = getEval(candidate.parentPath);
  const nodeEval   = getEval(candidate.path);
  if (!parentEval || !nodeEval) return candidate.evalDiff ?? null;

  const diff = computeEvalDiff({
    parentEval,
    nodeEval,
    playerColor: candidate.playerColor,
  });
  // At this point candidate.evalDiff is absent or wc-approx (returned early if 'cp').
  // Always take the new result — any update is an improvement.
  if (diff) candidate.evalDiff = diff;
  return candidate.evalDiff ?? null;
}
