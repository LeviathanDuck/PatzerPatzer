// Study drill session builder — selects and orders sequences for review/learn sessions.
// Pure functions only: no IDB, no DOM, no side effects.
// Phase 4 Task 4.4 (CCP-546).
// Adapted from lichess-org/lila: modules/practice/src/main/PracticeStudyApi.scala session building.

import type { TrainableSequence, PositionProgress } from '../types';
import { isDue, positionKey } from './scheduler';

/**
 * Build a review session: sequences that have at least one due position,
 * sorted by most-overdue first (earliest nextDueAt first).
 *
 * @param sequences - all active sequences for the study
 * @param progressMap - map from positionKey → PositionProgress (from IDB)
 * @param maxSequences - maximum sequences to include (default 20)
 */
export function buildReviewSession(
  sequences:    TrainableSequence[],
  progressMap:  Map<string, PositionProgress>,
  now:          number = Date.now(),
  maxSequences: number = 20,
): TrainableSequence[] {
  const withDue = sequences
    .filter(seq => seq.status === 'active')
    .filter(seq => hasDuePosition(seq, progressMap, now));

  // Sort by earliest nextDueAt across the sequence's positions
  withDue.sort((a, b) => {
    const aEarliest = earliestDueAt(a, progressMap);
    const bEarliest = earliestDueAt(b, progressMap);
    return aEarliest - bEarliest;
  });

  return withDue.slice(0, maxSequences);
}

/**
 * Build a learn session: sequences that have NOT yet been learned
 * (no PositionProgress entry, or level === 0 for all positions).
 * Sorted by createdAt ascending (learn in order they were saved).
 *
 * @param maxSequences - maximum sequences to include (default 10)
 */
export function buildLearnSession(
  sequences:    TrainableSequence[],
  progressMap:  Map<string, PositionProgress>,
  maxSequences: number = 10,
): TrainableSequence[] {
  const unlearned = sequences
    .filter(seq => seq.status === 'active')
    .filter(seq => isUnlearned(seq, progressMap));

  unlearned.sort((a, b) => a.createdAt - b.createdAt);

  return unlearned.slice(0, maxSequences);
}

/**
 * Count how many positions across all sequences are currently due.
 * Used to render the "X due" badge on the study page.
 */
export function countDuePositions(
  sequences:   TrainableSequence[],
  progressMap: Map<string, PositionProgress>,
  now:         number = Date.now(),
): number {
  let count = 0;
  for (const seq of sequences) {
    if (seq.status !== 'active') continue;
    for (const fen of seq.fens) {
      const key      = positionKey(fen);
      const progress = progressMap.get(key);
      if (!progress || isDue(progress, now)) count++;
    }
  }
  return count;
}

// --- Helpers ---

function hasDuePosition(
  seq:         TrainableSequence,
  progressMap: Map<string, PositionProgress>,
  now:         number,
): boolean {
  for (const fen of seq.fens) {
    const key      = positionKey(fen);
    const progress = progressMap.get(key);
    if (!progress || isDue(progress, now)) return true;
  }
  return false;
}

function isUnlearned(
  seq:         TrainableSequence,
  progressMap: Map<string, PositionProgress>,
): boolean {
  for (const fen of seq.fens) {
    const key      = positionKey(fen);
    const progress = progressMap.get(key);
    if (!progress || progress.level === 0) return true;
  }
  return false;
}

function earliestDueAt(
  seq:         TrainableSequence,
  progressMap: Map<string, PositionProgress>,
): number {
  let earliest = Infinity;
  for (const fen of seq.fens) {
    const key      = positionKey(fen);
    const progress = progressMap.get(key);
    const due      = progress?.nextDueAt ?? 0; // unlearned = overdue
    if (due < earliest) earliest = due;
  }
  return earliest;
}
