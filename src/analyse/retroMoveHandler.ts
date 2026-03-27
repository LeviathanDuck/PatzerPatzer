// Analysis-owned retro solve interception for board user moves.
// Moved out of src/board/index.ts so that board core is not coupled to
// retrospection logic — the board fires hooks, and this handler observes.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts onWin / onFail.

import type { AnalyseCtrl } from './ctrl';
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
    const retro = ctrl.retro?.isSolving() ? ctrl.retro : undefined;
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
