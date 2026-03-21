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
// - No redraw dependency — callers are responsible for triggering redraws.

import type { RetroCandidate } from './retro';

/**
 * Mirrors Lichess Feedback union type from retroCtrl.ts.
 * 'find'     — waiting for the user to find the best move
 * 'eval'     — ceval running to judge the played move (deferred)
 * 'win'      — user found the best move
 * 'fail'     — user played a bad move
 * 'view'     — viewing the solution after skip/viewSolution
 * 'offTrack' — user navigated away from the exercise position
 */
export type RetroFeedback = 'find' | 'eval' | 'win' | 'fail' | 'view' | 'offTrack';

export interface RetroCtrl {
  /** Currently active candidate, or null if the session is exhausted. */
  current(): RetroCandidate | null;

  /** Current feedback state. */
  feedback(): RetroFeedback;

  /** Set feedback state directly (used by board wiring in a later task). */
  setFeedback(f: RetroFeedback): void;

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

  /** The full ordered candidate list for this session. */
  readonly candidates: readonly RetroCandidate[];

  /** Color filter active for this session, or null for both colors. */
  readonly userColor: 'white' | 'black' | null;
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
): RetroCtrl {
  // Mirrors retroCtrl.ts: solvedPlies (tracks which plies have been resolved)
  let solvedPlies: number[] = [];

  // Index into candidates of the active exercise, or -1 if exhausted.
  let currentIdx = -1;

  // Current feedback state. Mirrors retroCtrl.ts: feedback prop.
  let _feedback: RetroFeedback = 'find';

  // Per-candidate guidance reveal flag.
  // Hidden by default; revealed only when the user explicitly asks.
  // Reset on every candidate transition (jumpToNext).
  let _guidanceRevealed = false;

  const isPlySolved = (ply: number): boolean => solvedPlies.includes(ply);

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
    currentIdx = findNextIdx();
  }

  function skip(): void {
    solveCurrent();
    jumpToNext();
  }

  function viewSolution(): void {
    _feedback = 'view';
    solveCurrent();
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

    isSolving(): boolean { return _feedback === 'find' || _feedback === 'fail'; },
    guidanceRevealed(): boolean { return _guidanceRevealed; },
    revealGuidance(): void { _guidanceRevealed = true; },
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
      // Ceval readiness — mirrors lichess-org/lila: retroCtrl.ts isCevalReady:
      //   node.ceval.depth >= 18 || (node.ceval.depth >= 14 && millis > 6000)
      // Patzer tracks depth only (no millis); require depth >= 14 as the minimum gate.
      if (!ev.depth || ev.depth < 14) return;
      // Near-best povDiff comparison is deferred. When ceval is ready, resolve as fail
      // so the 'eval' state never gets stuck indefinitely.
      // This will be replaced with: if (povDiff > -0.04) onWin(); else onFail();
      _feedback = 'fail';
    },

    onWin(): void {
      // Mark solved BEFORE navigate so onJump sees 'win' and skips offTrack detection.
      // Mirrors lichess-org/lila: retroCtrl.ts onWin → solveCurrent() + feedback('win').
      solveCurrent();
      _feedback = 'win';
    },

    onFail(): void {
      // Set fail AFTER navigate — overwrites the transient 'offTrack' set by onJump.
      // Mirrors lichess-org/lila: retroCtrl.ts onFail → feedback('fail').
      _feedback = 'fail';
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
      jumpToNext();
    },
  };
}
