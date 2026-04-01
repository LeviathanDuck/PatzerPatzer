/**
 * Practice Against Them — handoff policy and opponent turn planning.
 *
 * This module owns the decision of when the opponent follows imported repertoire
 * data versus when the engine should take over. It is deliberately kept separate
 * from view.ts (rendering) and ctrl.ts (session state) so the policy remains
 * easy to read, test, and change without touching either layer.
 *
 * Usage contract:
 *   1. The view/ctrl layer calls `planOpponentTurn()` when it is the opponent's turn.
 *   2. `planOpponentTurn()` returns an `OpponentTurnPlan` with what to do next.
 *   3. The caller acts on the plan: either play the repertoire move immediately
 *      (after a short delay for UX) or request an engine best-move.
 *   4. After acting, the caller calls `setPracticeOpponentSource()` in ctrl.ts
 *      with the resolved source so the UI banner stays accurate.
 *
 * Reference: lichess-org/lila: ui/analyse/src/practice/practiceCtrl.ts
 *   - Engine-side equivalent: `if (!played() && playable(node)) root.playUci(nodeBestUci(node)!)`
 *   - Here we add a repertoire-first layer before falling back to engine.
 */

import {
  selectPracticeMove,
  type PracticeSelectionResult,
} from './analytics';
import type { OpeningTreeNode } from './tree';
import type { PracticeSession, PracticeOpponentSource } from './types';
import { engineEnabled } from '../engine/ctrl';

// ---------------------------------------------------------------------------
// Handoff policy
// ---------------------------------------------------------------------------

/**
 * Determine the `PracticeOpponentSource` from a move selection result.
 *
 * Policy rules (in priority order):
 *   1. If selection succeeded ('selected') → 'repertoire'.
 *   2. If selection failed ('sparse-handoff' or 'empty-handoff') AND engine is enabled
 *      → 'engine'.
 *   3. If selection failed AND engine is NOT available → 'exhausted'.
 *
 * The `'exhausted'` state is honest: neither repertoire data nor engine can provide a
 * credible opponent response. The UI should surface this clearly so the user knows
 * the practice value of continuing is limited.
 */
export function determineOpponentSource(
  result: PracticeSelectionResult,
): PracticeOpponentSource {
  if (result.outcome === 'selected') return 'repertoire';
  return engineEnabled ? 'engine' : 'exhausted';
}

// ---------------------------------------------------------------------------
// Opponent turn plan
// ---------------------------------------------------------------------------

/**
 * What the practice driver should do on the opponent's turn.
 *
 *  'play-repertoire' — play `move.uci` from the repertoire selection; update source to 'repertoire'.
 *  'request-engine'  — ask the engine for its best move (caller navigates when engine responds).
 *  'exhausted'       — neither repertoire nor engine can provide a move; stop or show message.
 */
export type OpponentTurnAction = 'play-repertoire' | 'request-engine' | 'exhausted';

export interface OpponentTurnPlan {
  /** What the practice driver should do. */
  action: OpponentTurnAction;
  /**
   * The move to play immediately, when action is 'play-repertoire'.
   * Null for 'request-engine' and 'exhausted'.
   */
  moveUci: string | null;
  /**
   * The resolved source for this turn.
   * Caller should call `setPracticeOpponentSource()` with this value.
   */
  source: PracticeOpponentSource;
  /** Selection result for logging/banner text. */
  selectionResult: PracticeSelectionResult;
}

/**
 * Plan the opponent's next move for a practice session.
 *
 * Accepts the current tree node and active session state.
 * Returns an `OpponentTurnPlan` the view layer can act on directly.
 *
 * Relies on `session.minRepertoireFreq` as the confidence threshold.
 * If the session is null (practice not active), returns an exhausted plan.
 */
export function planOpponentTurn(
  node: OpeningTreeNode | null,
  session: PracticeSession | null,
): OpponentTurnPlan {
  if (!session) {
    return {
      action: 'exhausted',
      moveUci: null,
      source: 'exhausted',
      selectionResult: {
        move: null,
        outcome: 'empty-handoff',
        confidence: 'insufficient',
        totalFrequency: 0,
      },
    };
  }

  const result = selectPracticeMove(node, session.minRepertoireFreq);
  const source  = determineOpponentSource(result);

  if (result.outcome === 'selected' && result.move) {
    return {
      action: 'play-repertoire',
      moveUci: result.move.uci,
      source,
      selectionResult: result,
    };
  }

  if (source === 'engine') {
    return {
      action: 'request-engine',
      moveUci: null,
      source,
      selectionResult: result,
    };
  }

  return {
    action: 'exhausted',
    moveUci: null,
    source,
    selectionResult: result,
  };
}
