// Analysis-owned retro solve interception for board user moves.
// Moved out of src/board/index.ts so that board core is not coupled to
// retrospection logic — the board fires hooks, and this handler observes.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts onWin / onFail.

import type { AnalyseCtrl } from './ctrl';
import { evalCache, evalCurrentPosition, evalFenSilent, engineEnabled, toggleEngine } from '../engine/ctrl';
import { batchAnalyzing, stopBatchAnalysis } from '../engine/batch';
import { requestRetroBackgroundEval } from './retro';
import {
  onBeforeBoardUserMove,
  onBoardUserMove,
  type BeforeMoveHookInfo,
  type MoveHookInfo,
} from '../board/index';

/**
 * Wire retro solve interception into the board move hook seam.
 *
 * Timing rules (preserved from the original inline implementation):
 *   - onWin() runs in the before-move hook (BEFORE navigate) so onJump()
 *     sees feedback='win' and skips offTrack detection.
 *   - setFeedback('eval') + onCeval() run in the after-move hook (AFTER navigate)
 *     to overwrite the transient 'offTrack' that onJump() sets when the
 *     path leaves c.parentPath.
 *
 * @param getCtrl - getter for the current AnalyseCtrl (deferred because ctrl
 *                  is replaced on game load).
 * @returns an object with an `unsubscribe` method to tear down both hooks.
 */
export function initRetroMoveHandler(getCtrl: () => AnalyseCtrl): { unsubscribe: () => void } {
  // --- Before-move hook: handle correct-move win detection ---
  const unsubBefore = onBeforeBoardUserMove((info: BeforeMoveHookInfo) => {
    const ctrl = getCtrl();
    const retro = ctrl.retro?.isSolving() ? ctrl.retro : undefined;
    if (!retro) return;
    const cand = retro.current();
    if (!cand) return;
    if (info.path !== cand.parentPath) return;

    // Use live best move if available (higher depth wins over batch bestMove).
    const liveOrBatchBest = retro.liveBestMove() ?? cand.bestMove;
    if (info.uci === liveOrBatchBest) {
      // Pre-win: sets feedback='win' before navigate, suppresses offTrack in onJump.
      retro.onWin();
    }
  });

  // --- After-move hook: handle wrong-move eval state and snapshot ---
  const unsubAfter = onBoardUserMove((info: MoveHookInfo) => {
    const ctrl = getCtrl();
    // Do NOT gate on isSolving() here: onJump() runs during navigate() and sets
    // feedback='offTrack' before this hook fires, making isSolving() return false
    // even for moves played from the exercise position.
    const retro = ctrl.retro;
    if (!retro) return;
    const cand = retro.current();
    if (!cand) return;

    // For the eval/win path, check if the move originated from the exercise position.
    // The new path should be parentPath + childId (2 chars).
    const atRetroExercise = ctrl.path.length === cand.parentPath.length + 2
      && ctrl.path.startsWith(cand.parentPath);
    if (!atRetroExercise) return;

    // Capture a snapshot of evals at the moment of the move for dual diff display.
    // All cp values are white-perspective (matching evalCache convention).
    // solvingMoveCp:  eval of the position after the solving move (current path)
    // engineBestCp:   eval of the engine-best child position.
    //                 When the user played the exact engine-best move, ctrl.path IS the
    //                 engine-best child path, so solvingEval and engineBestEval are the same
    //                 node — guaranteeing vs-Engine-Best diff of 0 (✓ display).
    //                 When the user played a different move, fall back to the parent
    //                 position eval as the closest available approximation.
    // gameMoveCp:     eval of the original game-mistake position (cand.path)
    const solvingEval   = evalCache.get(ctrl.path);
    const engineBestUci = retro.liveBestMove() ?? cand.bestMove;
    const isExactBest   = info.uci === engineBestUci;
    // For exact-best: ctrl.path === engine-best child path → solvingEval IS the
    // engine-best child eval; reuse it so the diff resolves to 0.
    // For any other move: use parent eval as the closest available approximation.
    const engineBestForSnapshot = isExactBest ? solvingEval : evalCache.get(cand.parentPath);
    const gameMoveEval  = evalCache.get(cand.path);
    retro.setSolvingMoveSnapshot({
      solvingMoveUci:  info.uci,
      solvingMoveCp:   solvingEval?.cp,
      solvingMoveMate: solvingEval?.mate,
      engineBestUci,
      engineBestCp:    engineBestForSnapshot?.cp,
      engineBestMate:  engineBestForSnapshot?.mate,
      gameMoveUci:     cand.playedMove,
      gameMoveCp:      gameMoveEval?.cp,
      gameMoveMate:    gameMoveEval?.mate,
      playerColor:     cand.playerColor,
      parentPath:      cand.parentPath,
      solvingPath:     ctrl.path,
      isExactBest,
    });

    // Win was already handled by the before-move hook; skip the fail/eval path.
    if (retro.feedback() === 'win') return;

    const liveOrBatchBest = retro.liveBestMove() ?? cand.bestMove;
    if (info.uci !== liveOrBatchBest) {
      // Refresh evalDiff from the current cache before feedback renders.
      // The live ceval has just evaluated the played-move position (after navigate),
      // so the cache may now be deeper than at session-build time.
      const updatedDiff = requestRetroBackgroundEval(cand, path => evalCache.get(path));

      // If the candidate still has no cp-quality diff after the cache refresh,
      // trigger a real silent one-shot background eval of the parent position.
      // This populates evalCache at cand.parentPath without any visible engine noise.
      // Mirrors lichess-org/lila: retroCtrl.ts background eval of the candidate FEN.
      if (!updatedDiff || updatedDiff.confidence !== 'cp') {
        evalFenSilent(
          cand.fenBefore,
          cand.parentPath,
          cand.parentPath.length >= 2 ? cand.parentPath.slice(0, -2) : '',
          cand.ply - 1,
        );
      }

      // Enter eval state so ceval can judge whether the played move is near-best.
      // Mirrors lichess-org/lila: retroCtrl.ts feedback('eval') + checkCeval.
      // If near-best (povDiff > -0.04): onCeval -> onWin().
      // If not near-best: onCeval -> onFail() + navigate back to parentPath.
      retro.setFeedback('eval');
      // LFYM can run from reviewed data even when the visible live engine is off.
      // Make sure the ceval dependency for the 'eval' state is actually available;
      // otherwise the user gets stuck on "evaluating your move" forever.
      if (batchAnalyzing) stopBatchAnalysis();
      if (!engineEnabled) toggleEngine();
      else evalCurrentPosition();
      retro.onCeval(); // may resolve synchronously if batch eval is already in cache
    }
  });

  return {
    unsubscribe() {
      unsubBefore();
      unsubAfter();
    },
  };
}
