import type { EngineStrengthConfig } from './types';
import {
  protocol,
  engineEnabled,
  engineReady,
  engineMode,
  playStrengthConfig,
  enterPlayMode,
  setPlayMoveCallback,
  incrementPendingStopCount,
} from './ctrl';

export interface PlayMoveRequest {
  fen: string;
  strength: EngineStrengthConfig;
  onMove: (uci: string) => void;
  onError?: (reason: string) => void;
}

/**
 * Request a single move from the engine at the given strength level.
 * Routes the bestmove response to req.onMove via a one-shot callback.
 * Does not affect analysis eval state.
 */
export function requestPlayMove(req: PlayMoveRequest): void {
  if (!engineEnabled || !engineReady) {
    req.onError?.('engine not ready');
    return;
  }
  // Switch to play mode at the requested strength if not already there.
  if (engineMode !== 'play' || playStrengthConfig?.level !== req.strength.level) {
    enterPlayMode(req.strength);
  }
  setPlayMoveCallback(req.onMove);
  protocol.setPosition(req.fen);
  protocol.goPlay(req.strength.maxDepth);
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
 * Clears any pending timer so the delayed callback never fires, then stops the engine.
 */
export function cancelPlayMove(): void {
  if (_pendingTimer !== null) { clearTimeout(_pendingTimer); _pendingTimer = null; }
  setPlayMoveCallback(null);
  incrementPendingStopCount();
  protocol.stop();
}
