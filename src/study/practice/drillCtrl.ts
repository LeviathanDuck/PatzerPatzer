// Study drill session controller — state machine for a single drill session.
// Pure factory + closure: no IDB, no DOM, no side effects.
// Phase 4 Task 4.3 (CCP-545).
// Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts attempt/feedback state machine.

import type { TrainableSequence } from '../types';
import { gradeMove } from './grader';

// --- Types ---

export type DrillFeedback =
  | 'waiting'      // awaiting user move
  | 'correct'      // last move was correct, brief animation then advance
  | 'incorrect'    // last move was wrong, highlight hint or retry
  | 'showAnswer'   // too many incorrect — reveal the answer
  | 'complete';    // sequence fully drilled

/**
 * Drill session mode:
 * - 'learn'  — system auto-plays the full line first (no user input); after first pass, transitions to 'quiz'.
 * - 'quiz'   — standard interactive quiz mode (default).
 */
export type DrillMode = 'learn' | 'quiz';

export interface DrillSession {
  /** Current position index within the active sequence (0-based, advances on correct) */
  readonly positionIndex: number;
  /** Index into the sequences list */
  readonly sequenceIndex: number;
  /** Current feedback state */
  readonly feedback: DrillFeedback;
  /** How many attempts at the current position (resets on advance) */
  readonly attemptsAtPosition: number;
  /**
   * Current mode — 'learn' (auto-play pass) or 'quiz' (interactive).
   * Starts as 'learn' when `createDrillSession` is called with mode='learn'.
   */
  readonly mode: DrillMode;
  /** Submit a user move (SAN) and return updated session */
  submitMove: (userSan: string) => DrillSession;
  /** Advance past the current position (e.g. after showAnswer) */
  advance: () => DrillSession;
  /** Helpers */
  readonly currentSequence: TrainableSequence | undefined;
  readonly currentExpectedSan: string | undefined;
  readonly isDone: boolean;
}

// Maximum wrong attempts before revealing the answer.
const MAX_WRONG_BEFORE_SHOW_ANSWER = 3;

// --- Factory ---

/**
 * Create a new drill session for the given sequences.
 * @param mode  'learn' auto-plays the line first, then switches to quiz; 'quiz' goes straight to quiz.
 * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts puzzle session lifecycle.
 */
export function createDrillSession(sequences: TrainableSequence[], mode: DrillMode = 'quiz'): DrillSession {
  return makeSession(sequences, 0, 0, 'waiting', 0, mode);
}

function makeSession(
  sequences:          TrainableSequence[],
  sequenceIndex:      number,
  positionIndex:      number,
  feedback:           DrillFeedback,
  attemptsAtPosition: number,
  mode:               DrillMode = 'quiz',
): DrillSession {
  const currentSequence    = sequences[sequenceIndex];
  const currentExpectedSan = currentSequence?.sans[positionIndex];
  const isDone = sequenceIndex >= sequences.length;

  const submitMove = (userSan: string): DrillSession => {
    // In learn mode, submitMove is a no-op — the view should use advance() instead.
    if (mode === 'learn') return makeSession(sequences, sequenceIndex, positionIndex, feedback, attemptsAtPosition, mode);
    if (feedback === 'complete' || isDone) return makeSession(sequences, sequenceIndex, positionIndex, feedback, attemptsAtPosition, mode);
    if (!currentExpectedSan) return makeSession(sequences, sequenceIndex, positionIndex, 'complete', attemptsAtPosition, mode);

    const result = gradeMove(userSan, currentExpectedSan);
    if (result === 'correct') {
      return makeSession(sequences, sequenceIndex, positionIndex, 'correct', attemptsAtPosition, mode);
    } else {
      const newAttempts = attemptsAtPosition + 1;
      if (newAttempts >= MAX_WRONG_BEFORE_SHOW_ANSWER) {
        return makeSession(sequences, sequenceIndex, positionIndex, 'showAnswer', newAttempts, mode);
      }
      return makeSession(sequences, sequenceIndex, positionIndex, 'incorrect', newAttempts, mode);
    }
  };

  const advance = (): DrillSession => {
    if (!currentSequence) return makeSession(sequences, sequenceIndex, positionIndex, 'complete', 0, mode);

    const nextPositionIndex = positionIndex + 1;
    if (nextPositionIndex >= currentSequence.sans.length) {
      // Sequence complete — move to next sequence (in learn mode) or transition to quiz.
      const nextSeqIndex = sequenceIndex + 1;
      if (mode === 'learn' && nextSeqIndex >= sequences.length) {
        // Learn pass complete: restart from beginning in quiz mode.
        return makeSession(sequences, 0, 0, 'waiting', 0, 'quiz');
      }
      if (nextSeqIndex >= sequences.length) {
        return makeSession(sequences, nextSeqIndex, 0, 'complete', 0, mode);
      }
      return makeSession(sequences, nextSeqIndex, 0, 'waiting', 0, mode);
    }
    return makeSession(sequences, sequenceIndex, nextPositionIndex, 'waiting', 0, mode);
  };

  return {
    positionIndex,
    sequenceIndex,
    feedback,
    attemptsAtPosition,
    mode,
    submitMove,
    advance,
    currentSequence,
    currentExpectedSan,
    isDone,
  };
}
