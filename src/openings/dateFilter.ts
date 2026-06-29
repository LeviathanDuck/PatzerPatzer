















export interface DateFilterGame {
  date?: string;
}

export interface DateFilterResult<T> {
  games: T[];
  /** Number of games excluded because their date is missing or unparseable. */
  excludedUndated: number;
}

/**
 * Filter games to those on or after `cutoffDateStr` (YYYY-MM-DD local calendar date).
 *
 * Dates are compared as calendar-date strings, not UTC timestamps, so games on
 * the boundary day are never wrongly dropped due to UTC-midnight timezone issues.
 *
 * @param games       Array of games with an optional `date` field (YYYY-MM-DD or YYYY.MM.DD).
 * @param cutoffDateStr  Local calendar date string (YYYY-MM-DD), or null for all-time.
 */
export function filterGamesByDateCutoff<T extends DateFilterGame>(
  games: T[],
  cutoffDateStr: string | null,
): DateFilterResult<T> {
  if (cutoffDateStr === null) {
    // All-time: include everything, including undated games.
    return { games, excludedUndated: 0 };
  }

  let excludedUndated = 0;
  const filtered = games.filter(g => {
    if (!g.date) {
      excludedUndated++;
      return false;
    }
    // Normalize YYYY.MM.DD → YYYY-MM-DD, take date portion only.
    const dateStr = g.date.replace(/\./g, '-').slice(0, 10);
    // Validate format: must be YYYY-MM-DD.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      excludedUndated++;
      return false;
    }
    // String comparison is safe for ISO date strings: lexicographic == chronological.
    return dateStr >= cutoffDateStr;
  });

  return { games: filtered, excludedUndated };
}
