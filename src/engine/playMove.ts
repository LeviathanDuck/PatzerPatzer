import type { EngineStrengthConfig } from './types';
import {
  protocol,
  engineEnabled,
  engineReady,
  engineMode,
  playStrengthConfig,
  enterPlayMode,
  clearPendingPlayDispatch,
  setPlayMoveCallback,
  setPlayMoveRequestPending,
  incrementPendingStopCount,
} from './ctrl';
import type { EnginePositionContext } from './positionContext';

export interface PlayMoveRequest {
  position: EnginePositionContext;
  strength: EngineStrengthConfig;
  onMove: (uci: string) => void;
  onError?: (reason: string) => void;
}












export function requestPlayMove(req: PlayMoveRequest): void {
  setPlayMoveRequestPending(false);
  if (!engineEnabled || !engineReady) {
    req.onError?.('engine not ready');
    return;
  }
  const dispatch = () => {
    setPlayMoveCallback(req.onMove);
    protocol.setPositionContext(req.position);
    protocol.goPlay(req.strength.maxDepth);
  };
  // Switch to play mode at the requested strength if not already there.
  if (engineMode !== 'play' || playStrengthConfig?.level !== req.strength.level) {
    enterPlayMode(req.strength, dispatch);
  } else {
    dispatch();
  }
}

// Pending timer handle — cleared by cancelPlayMove() so stale callbacks never fire.
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Request a play move after a human-feeling delay.
 * Weaker levels think less (shorter delay) so the game feels natural at low strength.
 * Default baseDelayMs matches PRACTICE_OPPONENT_DELAY_MS in the openings view.
 */
export function playMoveWithDelay(req: PlayMoveRequest, baseDelayMs = 400): void {
  if (_pendingTimer !== null) clearTimeout(_pendingTimer);
  setPlayMoveRequestPending(true);
  const jitter = randomInt(100, 400);
  const levelScale = req.strength.level / 8;
  const delay = Math.round((baseDelayMs + jitter) * levelScale);
  _pendingTimer = setTimeout(() => { _pendingTimer = null; requestPlayMove(req); }, delay);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Cancel a pending play-move request.
 * Clears any pending timer and queued play-mode dispatch so nothing fires late, then stops the
 * engine — but only when a search is actually outstanding. Unconditionally calling
 * protocol.stop() + incrementing the pending-stop credit (as this used to do) is only safe if
 * the engine really is searching: a 'stop' sent to an idle engine typically produces no
 * bestmove at all, which would leave the credit permanently undrained and cause every future
 * bestmove (in any mode) to be misclassified as stale and discarded forever — a genuine
 * "reply never arrives" stall (BUG-2026-07-05-014), not just a one-off dropped move.
 */
export function cancelPlayMove(): void {
  if (_pendingTimer !== null) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  setPlayMoveRequestPending(false);
  setPlayMoveCallback(null);
  clearPendingPlayDispatch();
  if (protocol.isAnalyzing()) {
    incrementPendingStopCount();
    protocol.stop();
  }
}
