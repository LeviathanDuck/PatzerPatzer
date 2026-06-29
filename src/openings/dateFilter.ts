















export interface DateFilterGame {
  date?: string;
}

export interface DateFilterResult<T> {
  games: T[];
  /** Number of games excluded because their date is missing or unparseable. */
  excludedUndated: number;
}

/**
 * Filter games to those within an absolute [from, to] date range (YYYY-MM-DD, either bound optional).
 *
 * Policy (consistent with filterGamesByDateCutoff for bounded ranges):
 *   - If neither bound is set: include all games, including undated (treat as all-time).
 *   - If at least one bound is set: exclude undated/unparseable games and count them.
 *
 * Both comparisons are string-based (lexicographic) so games on boundary days are never
 * wrongly dropped by UTC-midnight timezone arithmetic.
 *
 * @param games  Array of games with an optional `date` field (YYYY-MM-DD or YYYY.MM.DD).
 * @param from   Earliest inclusive calendar date string (YYYY-MM-DD), or null for no lower bound.
 * @param to     Latest inclusive calendar date string (YYYY-MM-DD), or null for no upper bound.
 */
export function filterGamesByCustomRange<T extends DateFilterGame>(
  games: T[],
  from: string | null,
  to: string | null,
): DateFilterResult<T> {
  // Neither bound set → treat as all-time; include undated games.
  if (!from && !to) {
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
    if (from && dateStr < from) return false;
    if (to   && dateStr > to)   return false;
    return true;
  });

  return { games: filtered, excludedUndated };
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
