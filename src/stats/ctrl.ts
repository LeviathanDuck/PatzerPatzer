/**
 * Stats subsystem controller — improvement intelligence dashboard.
 *
 * Owns all stats page state: summary data loading, filter management,
 * and derived aggregates.  Follows the Lichess ctrl + view module pattern
 * used by openings and puzzles subsystems.
 */

import { listGameSummaries, loadGamesFromIdb } from '../idb/index';
import type { ImportedGame } from '../import/types';
import type { GameSummary } from './types';

// ── Filter state ──────────────────────────────────────────────────────────────

/** Time-control filter applied to stats aggregation. */
export type StatsTimeFilter = 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical';

let _timeFilter: StatsTimeFilter = 'all';

// ── Summaries state ───────────────────────────────────────────────────────────

let _summaries:       GameSummary[] = [];
let _summariesLoaded  = false;
let _summariesLoading = false;
let _importedGames:   ImportedGame[] = [];
let _redraw: () => void = () => {};
let _filteredCache: GameSummary[] | null = null;

// Generation counter: bumped when external changes (e.g. batch analysis) invalidate cached data.
let _dataGeneration = 0;
let _loadedGeneration = -1;

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialise the stats controller.
 * Call once when entering the /stats route.  Safe to call on re-entry:
 * summaries are re-loaded to pick up any games analyzed since the last visit.
 */
export function initStatsPage(redraw: () => void): void {
  _redraw = redraw;
  // Skip IDB reload if summaries are already loaded and data hasn't changed.
  if (_summariesLoaded && _loadedGeneration === _dataGeneration) return;
  _summariesLoaded  = false;
  _summariesLoading = false;
  loadSummaries();
}

/** Bump the generation counter so the next initStatsPage() reloads from IDB. */
export function invalidateSummariesCache(): void {
  _dataGeneration++;
}

function loadSummaries(): void {
  if (_summariesLoading) return;
  _summariesLoading = true;
  void Promise.all([listGameSummaries(), loadGamesFromIdb()]).then(([summaries, stored]) => {
    _summaries        = summaries;
    _importedGames    = stored?.games ?? [];
    _summariesLoaded  = true;
    _summariesLoading = false;
    _filteredCache    = null;
    _loadedGeneration = _dataGeneration;
    _redraw();
  }).catch(() => {
    _summariesLoaded = true;
    _summariesLoading = false;
    _filteredCache   = null;
    _redraw();
  });
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function summariesLoaded(): boolean { return _summariesLoaded; }

/** All summaries after applying the active time-control filter. */
export function filteredSummaries(): GameSummary[] {
  if (_filteredCache !== null) return _filteredCache;
  _filteredCache = _timeFilter === 'all' ? _summaries : _summaries.filter(s => s.timeClass === _timeFilter);
  return _filteredCache;
}

/** Raw (unfiltered) summaries. */
export function allSummaries(): GameSummary[] { return _summaries; }

export function timeFilter(): StatsTimeFilter { return _timeFilter; }

export function setTimeFilter(f: StatsTimeFilter): void {
  _timeFilter = f;
  _filteredCache = null;
  _redraw();
}

/** All raw imported games (not filtered by time control). */
export function importedGames(): ImportedGame[] { return _importedGames; }

/** Total analyzed game count across all time controls. */
export function totalGameCount(): number { return _summaries.length; }

/** Filtered game count. */
export function filteredGameCount(): number { return filteredSummaries().length; }
