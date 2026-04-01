// Drill-mode Chessground adapter — bridges the drill controller and a Chessground instance.
// Handles opponent-move animation, user-input gating, correct-move display, and feedback flash.
// Phase 5 Task 5.1 (CCP-549).
// Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts board state management patterns.

import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';

export type FeedbackType = 'correct' | 'incorrect';

export interface DrillBoardAdapter {
  /** Set board to a position (clears last move, disables input). */
  setPosition(fen: string, orientation: 'white' | 'black'): void;
  /** Animate opponent piece movement, then freeze board. */
  animateOpponentMove(from: Key, to: Key, afterFen: string): void;
  /**
   * Enable user input for their color (the orientation color).
   * @param legalDests  pre-computed legal destinations for the current position
   * @param onMove      callback fired after user completes a move
   */
  enableUserInput(legalDests: Map<Key, Key[]>, onMove: (orig: Key, dest: Key) => void): void;
  /** Disable all user input (opponent turn, feedback display, etc.). */
  disableUserInput(): void;
  /** Animate the correct move onto the board (called after too many failures). */
  showCorrectMove(from: Key, to: Key): void;
  /** Brief CSS flash on the board wrapper (green = correct, red = incorrect). */
  flashFeedback(type: FeedbackType): void;
}

/**
 * Create a DrillBoardAdapter wrapping the given Chessground API and container element.
 *
 * @param cg          Chessground API instance for this drill board
 * @param wrapEl      Container element that receives `drill-flash--correct` / `drill-flash--incorrect`
 */
export function createDrillBoardAdapter(cg: CgApi, wrapEl: HTMLElement): DrillBoardAdapter {
  let _orientation: 'white' | 'black' = 'white';

  return {
    setPosition(fen, orientation) {
      _orientation = orientation;
      // Pass 'both' with empty dests to freeze the board between moves.
      cg.set({
        fen,
        orientation,
        lastMove: [] as Key[],
        movable: { color: 'both', free: false, dests: new Map() },
        animation: { enabled: true },
        drawable: { shapes: [] },
      });
    },

    animateOpponentMove(from, to, afterFen) {
      cg.set({
        fen:      afterFen,
        lastMove: [from, to],
        movable:  { color: 'both', free: false, dests: new Map() },
        animation: { enabled: true },
      });
    },

    enableUserInput(legalDests, onMove) {
      cg.set({
        movable: {
          color:  _orientation,
          free:   false,
          dests:  legalDests,
          events: { after: onMove },
        },
        animation: { enabled: true },
      });
    },

    disableUserInput() {
      cg.set({
        movable: { color: 'both', free: false, dests: new Map() },
      });
    },

    showCorrectMove(from, to) {
      cg.move(from, to);
    },

    flashFeedback(type) {
      const cls = type === 'correct' ? 'drill-flash--correct' : 'drill-flash--incorrect';
      wrapEl.classList.add(cls);
      setTimeout(() => wrapEl.classList.remove(cls), 350);
    },
  };
}
