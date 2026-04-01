// Analysis-owned retro solve interception for board user moves.
// Moved out of src/board/index.ts so that board core is not coupled to
// retrospection logic — the board fires hooks, and this handler observes.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts onWin / onFail.

import type { AnalyseCtrl } from './ctrl';
import { evalCache, evalFenSilent } from '../engine/ctrl';
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

    if (info.uci === cand.bestMove) {
      // Pre-win: sets feedback='win' before navigate, suppresses offTrack in onJump.
      retro.onWin();
    }
  });

  // --- After-move hook: handle wrong-move eval state ---
  const unsubAfter = onBoardUserMove((info: MoveHookInfo) => {
    const ctrl = getCtrl();
    // Do NOT gate on isSolving() here: onJump() runs during navigate() and sets
    // feedback='offTrack' before this hook fires, making isSolving() return false
    // even for moves played from the exercise position.
    const retro = ctrl.retro;
    if (!retro) return;
    const cand = retro.current();
    if (!cand) return;

    // The before-move hook captured the path before navigation. After navigation
    // the ctrl.path has moved forward. Reconstruct the pre-move path: if the
    // current path ends with the child id, strip it to get the parent.
    // However, we need the path at move time which is the parent of the new path.
    // The before-hook already handled the win case, so if feedback is already 'win'
    // we skip — the correct move was handled above.
    if (retro.feedback() === 'win') return;

    // For the eval/fail path, check if the move originated from the exercise position.
    // The before-hook info isn't available here, but we can check: the new path should
    // be parentPath + childId (2 chars). If path length == parentPath.length + 2 and
    // path starts with parentPath, then the move came from the exercise position.
    const atRetroExercise = ctrl.path.length === cand.parentPath.length + 2
      && ctrl.path.startsWith(cand.parentPath);
    if (!atRetroExercise) return;

    if (info.uci !== cand.bestMove) {
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
