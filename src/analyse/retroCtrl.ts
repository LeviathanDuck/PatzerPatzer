// Retrospection controller: per-game "Learn From Your Mistakes" session state.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts
//
// Patzer Pro deviations from Lichess RetroCtrl:
// - Candidates are pre-built RetroCandidate[] (from buildRetroCandidates) rather
//   than derived lazily from tree-node eval fields and comp children.
// - Win/fail detection is handled by board/index.ts onUserMove() exact-bestMove
//   comparison, not by onJump() tree-state inspection — so the 'eval' feedback state
//   is never entered by current code paths.
// - onCeval() has a real checkCeval implementation; it is gated on _feedback === 'eval'
//   which is not yet triggered. Near-best acceptance (povDiff > -0.04) is the
//   deferred step that will unlock it.
// - No opening-explorer cancel logic — deferred until explorer integration.
// - No hideComputerLine / showBadNode / preventGoingToNextMove — board coupling deferred.
// - Guidance reveal is Patzer-specific: `_guidanceRevealed` starts false per candidate and
//   is set true by `revealGuidance()` when the user clicks "Show engine".
//   Lichess controls this implicitly via `hideComputerLine(node)` / `showBadNode()` computed
//   per-node on every render — no explicit reveal step or button exists in Lichess.
//   In Patzer, `guidanceRevealed()` gates both the PV box in the tools column and arrow
//   rendering in buildArrowShapes(). `jumpToNext()` resets `_guidanceRevealed = false`
//   so each new candidate starts hidden. Callers that change this state must call
//   syncArrow() before redraw() so Chessground arrows update immediately.
// - No redraw dependency — callers are responsible for triggering redraws.

import type { RetroCandidate } from './retro';
import { evalWinChances } from '../engine/winchances';

/**
 * Snapshot of evals captured at the moment the user plays a move during solving.
 * Used to compute and display dual eval diff boxes (vs engine best, vs game move).
 * All cp values are WHITE-perspective (positive = white winning), matching evalCache.
 */
export interface SolvingMoveSnapshot {
  solvingMoveUci:  string;
  solvingMoveCp:   number | undefined;
  solvingMoveMate: number | undefined;
  engineBestUci:   string;
  engineBestCp:    number | undefined;
  engineBestMate:  number | undefined;
  gameMoveUci:     string;
  gameMoveCp:      number | undefined;
  gameMoveMate:    number | undefined;
  playerColor:     'white' | 'black';
  // Paths for live evalCache lookup in renderDualEvalBoxes.
  // cp fields above are frozen at move time; these allow the view to re-read
  // cache on each render after evalFenSilent() populates asynchronously.
  parentPath:      string;
  solvingPath:     string;
  // True when the user played the engine's exact best move.
  // When set, renderDualEvalBoxes short-circuits directly to ✓ for both boxes,
  // bypassing diff computation entirely (avoids depth-horizon false positives).
  isExactBest:     boolean;
}

/**
 * Mirrors Lichess Feedback union type from retroCtrl.ts.
 * 'find'     — waiting for the user to find the best move
 * 'eval'     — ceval running to judge the played move
 * 'win'      — user found a good move (exact best or near-best)
 * 'fail'     — user played a suboptimal move
 * 'view'     — viewing the solution after skip/viewSolution
 * 'offTrack' — user navigated away from the exercise position
 */
export type RetroFeedback = 'find' | 'eval' | 'win' | 'fail' | 'view' | 'offTrack';

/**
 * Distinguishes how a win was achieved.
 * 'exact'     — user played the engine's exact best move
 * 'near-best' — user played a different move accepted as good enough by ceval (povDiff > -0.04)
 */
export type WinKind = 'exact' | 'near-best';

/**
 * Distinguishes the quality of a failed move relative to the game mistake.
 * 'better' — played move is better than the actual game mistake, but still not good enough
 * 'worse'  — played move is equal to or worse than the actual game mistake
 */
export type FailKind = 'better' | 'worse';

/**
 * Outcome of a single retro candidate after the user has interacted with it.
 * 'win'  — user found a good move (exact or near-best)
 * 'fail' — user played a suboptimal move (may have retried or given up)
 * 'view' — user revealed the solution without solving it
 * 'skip' — user skipped the candidate entirely
 */
export type RetroOutcome = 'win' | 'fail' | 'view' | 'skip';

export interface RetroCtrl {
  /** Currently active candidate, or null if the session is exhausted. */
  current(): RetroCandidate | null;

  /** Current feedback state. */
  feedback(): RetroFeedback;

  /** Set feedback state directly (used by board wiring in a later task). */
  setFeedback(f: RetroFeedback): void;

  /**
   * How the most recent win was achieved.
   * null when feedback is not 'win' or before any win has occurred.
   */
  winKind(): WinKind | null;

  /**
   * Quality of the most recently failed move relative to the game mistake.
   * null when feedback is not 'fail' or before any fail has occurred.
   */
  failKind(): FailKind | null;

  /** True when the user is expected to play a move ('find' or 'fail'). */
  isSolving(): boolean;

  /**
   * True when the user has manually revealed engine guidance for the current candidate.
   * False by default; resets to false each time the session advances to the next candidate.
   * Mirrors lichess-org/lila: retroCtrl.ts showBadNode / hideComputerLine visibility logic.
   */
  guidanceRevealed(): boolean;

  /**
   * Reveal engine guidance for the current candidate only.
   * The flag resets automatically in jumpToNext() — no manual reset needed.
   */
  revealGuidance(): void;

  /**
   * Suppress engine guidance for the current candidate.
   * Called when the header ceval toggle is turned OFF during LFYM so that
   * arrows are suppressed again even if guidance was previously revealed.
   */
  hideGuidance(): void;

  /**
   * Reset the current puzzle back to its start state for a retry attempt.
   * Sets feedback to 'find', clears solving-move snapshot and win/fail classification.
   * Does NOT advance to the next candidate — the user stays on the same puzzle.
   * Does NOT reset guidance reveal or engine state.
   */
  resetForRetry(): void;

  /** True if the given ply has already been solved or skipped this session. */
  isPlySolved(ply: number): boolean;

  /**
   * Called after every path change (navigate / keyboard / click).
   * Handles offTrack detection and 'eval'-state navigation-away recovery.
   * Win/fail checking is handled by board/index.ts onUserMove() for the exact-best MVP.
   * Mirrors lichess-org/lila: retroCtrl.ts onJump.
   * @param path — the new active tree path after the jump
   */
  onJump(path: string): void;

  /**
   * Called when a live ceval result arrives for the current node.
   * Implements the checkCeval readiness guard from Lichess.
   * Only acts when feedback === 'eval' (entered when near-best acceptance is implemented).
   * Until then this is correctly gated and dormant — the exact-best solve loop is
   * not affected.
   * Mirrors lichess-org/lila: retroCtrl.ts onCeval / checkCeval.
   */
  onCeval(): void;

  /**
   * Called after batch/IDB analysis data is merged into evalCache.
   * Resumes the session if it started before analysis was available.
   * Mirrors lichess-org/lila: retroCtrl.ts onMergeAnalysisData.
   */
  onMergeAnalysisData(): void;

  /**
   * Called when the user plays the engine best move.
   * Marks current candidate solved and sets feedback to 'win'.
   * Must be called BEFORE navigate() so onJump() sees 'win' and skips offTrack.
   * Mirrors lichess-org/lila: retroCtrl.ts onWin.
   */
  onWin(): void;

  /**
   * Called when the user plays a wrong move.
   * Sets feedback to 'fail'. Caller is responsible for navigating back to parentPath.
   * Must be called AFTER navigate() to overwrite the transient 'offTrack' from onJump.
   * Mirrors lichess-org/lila: retroCtrl.ts onFail.
   */
  onFail(): void;

  /**
   * Advance to the next unsolved candidate.
   * Mirrors lichess-org/lila: retroCtrl.ts jumpToNext.
   */
  jumpToNext(): void;

  /**
   * Mark the current candidate as solved without requiring the user to find
   * the best move, then advance.
   * Mirrors lichess-org/lila: retroCtrl.ts skip.
   */
  skip(): void;

  /**
   * Reveal the solution for the current candidate and mark it solved.
   * Sets feedback to 'view'.
   * Mirrors lichess-org/lila: retroCtrl.ts viewSolution.
   */
  viewSolution(): void;

  /**
   * Return [solvedCount, totalCandidates].
   * Mirrors lichess-org/lila: retroCtrl.ts completion.
   */
  completion(): [number, number];

  /**
   * Reset session: clear solved list and restart from the first candidate.
   * Mirrors lichess-org/lila: retroCtrl.ts reset.
   */
  reset(): void;

  /**
   * Returns candidates that the user failed, viewed the solution for, or skipped.
   * These are the "missed" positions suitable for bulk-saving to the puzzle library
   * after a session ends.
   */
  getFailedCandidates(): RetroCandidate[];

  /**
   * Returns the recorded outcome for a candidate (by ply), or undefined if not yet resolved.
   */
  getOutcome(ply: number): RetroOutcome | undefined;

  /** The full ordered candidate list for this session. */
  readonly candidates: readonly RetroCandidate[];

  /** Color filter active for this session, or null for both colors. */
  readonly userColor: 'white' | 'black' | null;

  // --- Live engine tracking ---

  /**
   * The engine's current best move UCI for the active candidate position.
   * Starts as the batch best move; updated by onEngineUpdate() as depth increases.
   */
  liveBestMove(): string | undefined;

  /**
   * The eval backing the current live best move.
   * undefined until the first onEngineUpdate() call for this candidate.
   */
  liveBestEval(): { cp?: number; mate?: number; depth: number } | undefined;

  /**
   * Called by main.ts whenever the live engine reports a new best move for the
   * active candidate position. Ignored if depth is not higher than current.
   * Fires the vindication callback if the engine's best move matches the game move.
   */
  onEngineUpdate(best: string, eval_: { cp?: number; mate?: number; depth: number }): void;

  /**
   * Register a callback fired once when the live engine determines the game move
   * was actually the best move available. Cleared on candidate transition.
   */
  onVindication(cb: () => void): void;

  /** True once the engine has determined the game move was actually best. */
  isVindicated(): boolean;

  // --- Solving move snapshot ---

  /**
   * Store a snapshot of the evals at the moment the user plays a move during solving.
   * Consumed by retroView to render dual eval diff boxes.
   * Cleared on candidate transition.
   */
  setSolvingMoveSnapshot(snapshot: SolvingMoveSnapshot): void;

  /**
   * Returns the snapshot from the most recently played solving move, or undefined
   * if no move has been played for the current candidate yet.
   */
  getSolvingMoveSnapshot(): SolvingMoveSnapshot | undefined;
}

/**
 * Create a retrospection session controller from a pre-built candidate list.
 *
 * @param candidates   - ordered list from buildRetroCandidates (mainline order)
 * @param userColor    - color filter used when building the list; stored for display
 * @param getNodeEval  - returns live ceval for the current node (used by onCeval readiness check)
 *
 * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts make()
 */
export function makeRetroCtrl(
  candidates: RetroCandidate[],
  userColor: 'white' | 'black' | null = null,
  getNodeEval: () => { cp?: number; mate?: number; depth?: number } | undefined = () => undefined,
  getEval: (path: string) => { cp?: number; mate?: number } | undefined = () => undefined,
  navigateTo: (path: string) => void = () => {},
  /**
   * Optional callback fired after any candidate outcome is recorded.
   * Receives the current outcomes map and total candidate count so the caller
   * can persist partial and complete sessions without probing internal state.
   * Does not affect solve behavior.
   */
  onPersist?: (outcomes: Map<number, RetroOutcome>, total: number) => void,
): RetroCtrl {
  // Mirrors retroCtrl.ts: solvedPlies (tracks which plies have been resolved)
  let solvedPlies: number[] = [];

  // Per-candidate outcome tracking, keyed by ply.
  // Records how each candidate was resolved during the session.
  let outcomes = new Map<number, RetroOutcome>();

  // Index into candidates of the active exercise, or -1 if exhausted.
  let currentIdx = -1;

  // Current feedback state. Mirrors retroCtrl.ts: feedback prop.
  let _feedback: RetroFeedback = 'find';

  // Per-candidate guidance reveal flag.
  // Hidden by default; revealed only when the user explicitly asks.
  // Reset on every candidate transition (jumpToNext).
  let _guidanceRevealed = false;

  // Win/fail sub-classification — set when feedback transitions to 'win' or 'fail'.
  // Reset on each candidate transition.
  let _winKind:  WinKind  | null = null;
  let _failKind: FailKind | null = null;

  // Live engine best move tracking — updated by onEngineUpdate().
  let _liveBestMove: string | undefined                                   = undefined;
  let _liveBestDepth: number                                              = 0;
  let _liveBestEval: { cp?: number; mate?: number; depth: number } | undefined = undefined;
  let _vindicationCb: (() => void) | undefined                           = undefined;
  let _vindicated: boolean                                                = false;

  // Snapshot of evals at the moment the user plays a move during solving.
  let _solvingMoveSnapshot: SolvingMoveSnapshot | undefined              = undefined;

  function mergeLiveEvalIntoSolvingSnapshot(
    candidate: RetroCandidate,
    liveEval: { cp?: number; mate?: number },
  ): void {
    const parentEval = getEval(candidate.parentPath);
    const gameEval = getEval(candidate.path);
    const prev = _solvingMoveSnapshot;
    _solvingMoveSnapshot = {
      solvingMoveUci: prev?.solvingMoveUci ?? '',
      solvingMoveCp: liveEval.cp,
      solvingMoveMate: liveEval.mate,
      engineBestUci: prev?.engineBestUci ?? _liveBestMove ?? candidate.bestMove,
      engineBestCp: prev?.engineBestCp ?? parentEval?.cp,
      engineBestMate: prev?.engineBestMate ?? parentEval?.mate,
      gameMoveUci: prev?.gameMoveUci ?? candidate.playedMove,
      gameMoveCp: prev?.gameMoveCp ?? gameEval?.cp,
      gameMoveMate: prev?.gameMoveMate ?? gameEval?.mate,
      playerColor: prev?.playerColor ?? candidate.playerColor,
      parentPath: prev?.parentPath ?? candidate.parentPath,
      solvingPath: prev?.solvingPath ?? '',
      isExactBest: prev?.isExactBest ?? false,
    };
  }

  const isPlySolved = (ply: number): boolean => solvedPlies.includes(ply);

  // Fire the optional persistence callback after any outcome is recorded.
  // Called with the live outcomes map and candidate count so the caller can
  // persist partial and complete sessions without probing internal state.
  const notifyPersist = (): void => {
    if (onPersist) onPersist(outcomes, candidates.length);
  };

  // Mirrors retroCtrl.ts findNextNode: find the first unsolved candidate.
  function findNextIdx(): number {
    return candidates.findIndex(c => !isPlySolved(c.ply));
  }

  // Mirrors retroCtrl.ts solveCurrent: record the current candidate's ply as solved.
  function solveCurrent(): void {
    const c = candidates[currentIdx];
    if (c && !isPlySolved(c.ply)) solvedPlies.push(c.ply);
  }

  function jumpToNext(): void {
    _feedback = 'find';
    _guidanceRevealed = false;
    _winKind  = null;
    _failKind = null;
    _vindicated         = false;
    _vindicationCb      = undefined;
    _solvingMoveSnapshot = undefined;
    currentIdx = findNextIdx();
    // Seed live best from batch so liveBestMove() is never undefined for a valid candidate.
    const c = currentIdx >= 0 ? candidates[currentIdx] : undefined;
    _liveBestMove  = c?.bestMove;
    _liveBestDepth = 0;
    _liveBestEval  = undefined;
  }

  function skip(): void {
    const c = candidates[currentIdx];
    if (c) outcomes.set(c.ply, 'skip');
    solveCurrent();
    notifyPersist();
    jumpToNext();
  }

  function viewSolution(): void {
    _feedback = 'view';
    const c = candidates[currentIdx];
    // Only record 'view' if not already recorded as 'fail' (fail takes priority —
    // viewing the solution after failing is still a fail for bulk-save purposes).
    if (c && !outcomes.has(c.ply)) outcomes.set(c.ply, 'view');
    solveCurrent();
    notifyPersist();
  }

  // Initialise: jump to the first unsolved candidate immediately.
  // Mirrors retroCtrl.ts: jumpToNext() call at end of make().
  jumpToNext();

  return {
    candidates,
    userColor,

    current(): RetroCandidate | null {
      return currentIdx >= 0 ? (candidates[currentIdx] ?? null) : null;
    },

    feedback(): RetroFeedback { return _feedback; },
    setFeedback(f: RetroFeedback): void { _feedback = f; },
    winKind():  WinKind  | null { return _winKind; },
    failKind(): FailKind | null { return _failKind; },

    isSolving(): boolean { return _feedback === 'find' || _feedback === 'fail'; },
    guidanceRevealed(): boolean { return _guidanceRevealed; },
    revealGuidance(): void { _guidanceRevealed = true; },
    hideGuidance(): void { _guidanceRevealed = false; },
    resetForRetry(): void {
      _feedback = 'find';
      _winKind  = null;
      _failKind = null;
      _solvingMoveSnapshot = undefined;
    },
    isPlySolved,

    jumpToNext,
    skip,
    viewSolution,

    onJump(path: string): void {
      // Mirrors lichess-org/lila: retroCtrl.ts onJump.
      const c = currentIdx >= 0 ? (candidates[currentIdx] ?? null) : null;
      if (!c) return;
      if (_feedback === 'win' || _feedback === 'view') {
        // Win/view state is set before navigate — do not overwrite with offTrack.
        return;
      }
      if (_feedback === 'eval' && path !== c.path) {
        // User navigated away while ceval was still judging the played move.
        // Reset to 'find' so the exercise can be retried.
        // Mirrors lichess-org/lila: retroCtrl.ts onJump `fb === 'eval' && fault.ply !== node.ply`.
        _feedback = 'find';
        return;
      }
      if (_feedback === 'offTrack' && path === c.parentPath) {
        // User navigated back to the exercise start — resume solving.
        _feedback = 'find';
      } else if ((_feedback === 'find' || _feedback === 'fail') && path !== c.parentPath) {
        // User navigated away from the exercise start position — mark off-track.
        _feedback = 'offTrack';
      }
    },

    onCeval(): void {
      // Mirrors lichess-org/lila: retroCtrl.ts checkCeval (the real implementation).
      //
      // This is not a stub — the guard structure and readiness check are complete.
      // It is currently dormant because _feedback === 'eval' is never set:
      // win/fail are determined by the exact-bestMove check in board/index.ts,
      // which bypasses the 'eval' state entirely.
      //
      // The 'eval' path will be activated when near-best acceptance is implemented
      // (allowing ceval to judge moves that are close but not exactly the bestMove).
      // At that point, the board interception will set _feedback = 'eval' instead of
      // immediately calling onFail(), and this function will resolve the session state.
      //
      // Near-best acceptance (povDiff > -0.04 per lichess-org/lila: retroCtrl.ts
      // checkCeval) is deferred to the near-best parity task.
      if (_feedback !== 'eval') return;
      const c = currentIdx >= 0 ? (candidates[currentIdx] ?? null) : null;
      if (!c) return;
      const ev = getNodeEval();
      if (!ev) return;
      // Keep the dual eval-box snapshot aligned with the same live ceval that
      // is about to judge the move. This avoids relying on a later evalCache
      // promotion that may be skipped once LFYM navigates away from the played node.
      mergeLiveEvalIntoSolvingSnapshot(c, ev);
      // Ceval readiness — mirrors lichess-org/lila: retroCtrl.ts isCevalReady:
      //   node.ceval.depth >= 18 || (node.ceval.depth >= 14 && millis > 6000)
      // Patzer tracks depth only (no millis); require depth >= 14 as the minimum gate.
      if (!ev.depth || ev.depth < 14) return;
      // Near-best acceptance — mirrors lichess-org/lila: retroCtrl.ts checkCeval + winningChances.ts povDiff.
      // povDiff(color, nodeEval, parentEval) = (toColor(nodeWc) - toColor(parentWc)) / 2
      // Accept the played move if diff > -0.04 (within 4% win-chance of the parent position).
      const parentEv = getEval(c.parentPath);
      if (parentEv) {
        // toPov: convert white-perspective win chance to color-perspective.
        // Mirrors lichess-org/lila: winningChances.ts toPov (negate for black).
        const toColor = (wc: number): number => c.playerColor === 'white' ? wc : -wc;
        const nodeWc   = toColor(evalWinChances(ev) ?? 0);
        const parentWc = toColor(evalWinChances(parentEv) ?? 0);
        const diff = (nodeWc - parentWc) / 2;
        if (diff > -0.04) {
          // Near-best: accept. Mirrors lichess-org/lila: retroCtrl.ts onWin().
          solveCurrent();
          if (c) outcomes.set(c.ply, 'win');
          _winKind  = 'near-best';
          _feedback = 'win';
          notifyPersist();
        } else {
          // Classify fail: compare played move against the actual game mistake.
          // 'better' = played move is better than what they played in the game
          //            (nodeWc > gameNodeWc) but still not good enough.
          // 'worse'  = played move is equal to or worse than the game mistake.
          const gameEv = getEval(c.path);
          if (gameEv) {
            const gameNodeWc = toColor(evalWinChances(gameEv) ?? 0);
            _failKind = nodeWc > gameNodeWc ? 'better' : 'worse';
          } else {
            _failKind = 'worse'; // no game eval to compare — treat as worse
          }
          if (c) outcomes.set(c.ply, 'fail');
          _feedback = 'fail';
          // Board holds at the wrong-move position; user resets via "Try another move".
          notifyPersist();
        }
      } else {
        // No parent eval available — cannot compute povDiff; fall back to fail.
        if (c) outcomes.set(c.ply, 'fail');
        _failKind = null;
        _feedback = 'fail';
        // Board holds at the wrong-move position; user resets via "Try another move".
        notifyPersist();
      }
    },

    onWin(): void {
      // Mark solved BEFORE navigate so onJump sees 'win' and skips offTrack detection.
      // Mirrors lichess-org/lila: retroCtrl.ts onWin → solveCurrent() + feedback('win').
      solveCurrent();
      const c = candidates[currentIdx];
      if (c) outcomes.set(c.ply, 'win');
      _winKind  = 'exact';
      _feedback = 'win';
      notifyPersist();
    },

    onFail(): void {
      // Set fail AFTER navigate — overwrites the transient 'offTrack' set by onJump.
      // Mirrors lichess-org/lila: retroCtrl.ts onFail → feedback('fail').
      const c = candidates[currentIdx];
      if (c) outcomes.set(c.ply, 'fail');
      _feedback = 'fail';
      notifyPersist();
    },

    onMergeAnalysisData(): void {
      // If solving but no current candidate, analysis may have just arrived — try again.
      // Mirrors lichess-org/lila: retroCtrl.ts onMergeAnalysisData.
      if ((_feedback === 'find' || _feedback === 'fail') && (currentIdx < 0)) jumpToNext();
    },

    completion(): [number, number] {
      return [solvedPlies.length, candidates.length];
    },

    reset(): void {
      solvedPlies = [];
      outcomes = new Map();
      jumpToNext();
    },

    getFailedCandidates(): RetroCandidate[] {
      // Return candidates where the user failed, viewed the solution, or skipped.
      // These are all "missed" moments suitable for saving to the puzzle library.
      return candidates.filter(c => {
        const o = outcomes.get(c.ply);
        return o === 'fail' || o === 'view' || o === 'skip';
      });
    },

    getOutcome(ply: number): RetroOutcome | undefined {
      return outcomes.get(ply);
    },

    // --- Live engine tracking ---

    liveBestMove(): string | undefined {
      return _liveBestMove;
    },

    liveBestEval(): { cp?: number; mate?: number; depth: number } | undefined {
      return _liveBestEval;
    },

    onEngineUpdate(best: string, eval_: { cp?: number; mate?: number; depth: number }): void {
      if (eval_.depth <= _liveBestDepth) return;
      _liveBestMove  = best;
      _liveBestDepth = eval_.depth;
      _liveBestEval  = eval_;
      // Vindication: engine now considers the original game move to be best.
      const c = currentIdx >= 0 ? (candidates[currentIdx] ?? null) : null;
      if (c && !_vindicated && best === c.playedMove) {
        _vindicated = true;
        _vindicationCb?.();
      }
    },

    onVindication(cb: () => void): void {
      _vindicationCb = cb;
      // If already vindicated before the callback was registered, fire immediately.
      if (_vindicated) cb();
    },

    isVindicated(): boolean {
      return _vindicated;
    },

    // --- Solving move snapshot ---

    setSolvingMoveSnapshot(snapshot: SolvingMoveSnapshot): void {
      _solvingMoveSnapshot = snapshot;
    },

    getSolvingMoveSnapshot(): SolvingMoveSnapshot | undefined {
      return _solvingMoveSnapshot;
    },
  };
}
