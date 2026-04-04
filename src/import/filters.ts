// Import filter state, constants, and date-range filtering.
// Adapted from docs/reference/ImportControls/index.jsx and GameLibraryContext.jsx.

export type ImportSpeed     = 'bullet' | 'blitz' | 'rapid';
export type ImportDateRange = '24h' | '1week' | '1month' | '3months' | '1year' | 'all' | 'custom';

// Read an integer from localStorage, returning def when the key is absent,
// unparseable, or out of [min, max].
// Mirrors lichess-org/lila: ui/lib/src/ceval/ctrl.ts storedIntProp pattern.
function storedInt(key: string, def: number, min: number, max: number): number {
  const v = parseInt(localStorage.getItem(key) ?? '', 10);
  return (!isNaN(v) && v >= min && v <= max) ? v : def;
}

// Mutable filter state — properties may be reassigned by the UI.
// Default date range matches docs/reference/GameLibraryContext.jsx DEFAULT_FILTERS.
export const importFilters = {
  rated:                true,
  speeds:               new Set<ImportSpeed>(), // empty = all speeds
  dateRange:            '1month' as ImportDateRange,
  customFrom:           '',
  customTo:             '',
  autoReview:           localStorage.getItem('patzer.autoReview') === 'true',
  autoReviewConfirmed:  localStorage.getItem('patzer.autoReviewConfirmed') === 'true',
  autoReviewDepth:      storedInt('patzer.autoReviewDepth', 12, 2, 18),
};

export function setAutoReview(v: boolean): void {
  importFilters.autoReview = v;
  localStorage.setItem('patzer.autoReview', String(v));
}

export function setAutoReviewConfirmed(v: boolean): void {
  importFilters.autoReviewConfirmed = v;
  localStorage.setItem('patzer.autoReviewConfirmed', String(v));
}

export function setAutoReviewDepth(v: number): void {
  importFilters.autoReviewDepth = v;
  localStorage.setItem('patzer.autoReviewDepth', String(v));
}

// Icons adapted from lichess-org/lila: ui/lib/src/game/perfIcons.ts + ui/lib/src/licon.ts
export const SPEED_OPTIONS: { value: ImportSpeed; label: string; icon: string }[] = [
  { value: 'bullet', label: 'Bullet', icon: '\ue032' }, // licon.Bullet
  { value: 'blitz',  label: 'Blitz',  icon: '\ue008' }, // licon.FlameBlitz
  { value: 'rapid',  label: 'Rapid',  icon: '\ue002' }, // licon.Rabbit
];

// Adapted from docs/reference/ImportControls/index.jsx DATE_RANGES
export const DATE_RANGE_OPTIONS: { value: ImportDateRange; label: string }[] = [
  { value: '24h',     label: '24h'    },
  { value: '1week',   label: '1 wk'   },
  { value: '1month',  label: '1 mo'   },
  { value: '3months', label: '3 mo'   },
  { value: '1year',   label: '1 yr'   },
  { value: 'all',     label: 'All'    },
  { value: 'custom',  label: 'Custom' },
];

/**
 * Filter a game list by the current date range selection.
 * Applied post-fetch so the API call itself is unchanged.
 * Adapted from docs/reference/GameLibraryContext.jsx importGames filter logic.
 */
export function filterGamesByDate<T extends { date?: string }>(games: T[]): T[] {
  if (importFilters.dateRange === 'all') return games;
  if (importFilters.dateRange === 'custom') {
    return games.filter(g => {
      const d = g.date?.slice(0, 10);
      if (!d) return true;
      if (importFilters.customFrom && d < importFilters.customFrom) return false;
      if (importFilters.customTo   && d > importFilters.customTo)   return false;
      return true;
    });
  }
  const now = new Date();
  let cutoff: Date;
  switch (importFilters.dateRange) {
    case '24h':     cutoff = new Date(now.getTime() - 86_400_000);          break;
    case '1week':   cutoff = new Date(now.getTime() - 7 * 86_400_000);      break;
    case '1month':  cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);          break;
    case '3months': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);          break;
    case '1year':   cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1);    break;
    default: return games;
  }
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return games.filter(g => !g.date || g.date.slice(0, 10) >= cutoffStr);
}
