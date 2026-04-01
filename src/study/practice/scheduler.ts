// Study drill scheduler — spaced repetition interval logic.
// Pure functions only: no IDB, no DOM, no side effects.
// Phase 4 Task 4.1 (CCP-543).
// Adapted from lichess-org/lila: modules/practice/src/main/PracticeStudyApi.scala scheduling model.

import type { PositionProgress } from '../types';

// Spaced repetition intervals indexed by mastery level 0–6.
// Fixed-interval spaced repetition ladder.
export const INTERVALS_MS: number[] = [
  0,                    // level 0 — not yet learned (show again immediately)
  24 * 60 * 60 * 1000,  // level 1 — 1 day
  3  * 24 * 60 * 60 * 1000, // level 2 — 3 days
  7  * 24 * 60 * 60 * 1000, // level 3 — 1 week
  14 * 24 * 60 * 60 * 1000, // level 4 — 2 weeks
  30 * 24 * 60 * 60 * 1000, // level 5 — 1 month
  90 * 24 * 60 * 60 * 1000, // level 6 — 3 months (max)
];

export const MAX_LEVEL = INTERVALS_MS.length - 1; // 6

/**
 * Compute the next scheduling state after an attempt.
 * Correct → level up (capped at MAX_LEVEL).
 * Incorrect → level down to max(1, level - 1) so positions never fully reset.
 *
 * Returns { newLevel, nextDueAt } — caller writes back to PositionProgress.
 */
export function scheduleNext(
  currentLevel: number,
  correct: boolean,
  now: number = Date.now(),
): { newLevel: number; nextDueAt: number } {
  const newLevel = correct
    ? Math.min(currentLevel + 1, MAX_LEVEL)
    : Math.max(1, currentLevel - 1);
  const nextDueAt = now + INTERVALS_MS[newLevel]!;
  return { newLevel, nextDueAt };
}

/**
 * Returns true if the position is due for review now.
 * Level 0 positions (unlearned) are always due.
 */
export function isDue(progress: PositionProgress, now: number = Date.now()): boolean {
  return progress.level === 0 || progress.nextDueAt <= now;
}

/**
 * Normalize a FEN into a stable position key:
 *   board + active color + castling + en-passant
 * (strips halfmove clock and fullmove number)
 * Adapted from lichess-org/lila: modules/analyse/src/main/Analysis.scala positionKey
 */
export function positionKey(fen: string): string {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}
