// Study drill grader — move correctness evaluation.
// Pure function only: no IDB, no DOM, no side effects.
// Phase 4 Task 4.2 (CCP-544).
// Adapted from lichess-org/lila: ui/puzzle/src/puzzle.ts path checking + answer validation.

/**
 * Grade a user move against an expected SAN and optional alternative acceptable SANs.
 *
 * Returns 'correct' if the user played an acceptable move, 'incorrect' otherwise.
 *
 * Comparison is case-sensitive to preserve chess notation (e.g. Nf3 vs nf3 are different),
 * but leading/trailing whitespace is trimmed.
 */
export function gradeMove(
  userSan:      string,
  expectedSan:  string,
  alternatives?: string[],
): 'correct' | 'incorrect' {
  const user = userSan.trim();
  if (user === expectedSan.trim()) return 'correct';
  if (alternatives) {
    for (const alt of alternatives) {
      if (user === alt.trim()) return 'correct';
    }
  }
  return 'incorrect';
}
