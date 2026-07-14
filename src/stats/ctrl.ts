/**
 * Stats subsystem controller — improvement intelligence dashboard.
 *
 * Owns all stats page state: summary data loading, filter management,
 * and derived aggregates.  Follows the Lichess ctrl + view module pattern
 * used by openings and puzzles subsystems.
 */

import { listGameSummaries, loadGamesFromIdb } from '../idb/index';
import type { ImportedGame } from '../import/types';
import { record, Severity } from '../diagnostics';
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
let _requestedGeneration = -1;
let _loadRequestSequence = 0;
let _activeLoadRequest = 0;

// ── Diagnostics ───────────────────────────────────────────────────────────────

function classifyStatsError(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function statsRouteLabel(): string {
  const hash = window.location.hash || '';
  if (hash.startsWith('#/stats')) return 'stats';
  return hash ? 'other' : 'unknown';
}

function recordStatsLoadFail(error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'stats/ctrl',
    sourceTag: 'stats-load-fail',
    message: 'stats-load-fail',
    metadata: {
      errorClass: classifyStatsError(error),
      route: statsRouteLabel(),
    },
    redactionClass: 'safe',
  });
}

function recordStatsMissingSummary(count: number): void {
  record({
    kind: 'render',
    severity: Severity.Warn,
    source: 'stats/ctrl',
    sourceTag: 'stats-missing-summary',
    message: 'stats-missing-summary',
    metadata: { count },
    redactionClass: 'safe',
  });
}

export function recordStatsAggregateError(aggregation: string, error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'stats/view',
    sourceTag: 'stats-aggregate-error',
    message: 'stats-aggregate-error',
    metadata: {
      aggregation,
      errorClass: classifyStatsError(error),
    },
    redactionClass: 'safe',
  });
}

function isCompleteStatsSummary(summary: GameSummary): boolean {
  return Boolean(summary.gameId)
    && Number.isFinite(summary.accuracy)
    && Number.isFinite(summary.blunderCount)
    && Number.isFinite(summary.totalMoves)
    && Boolean(summary.analyzedAt);
}

function countMissingOrIncompleteSummaries(games: ImportedGame[], summaries: GameSummary[]): number {
  if (games.length === 0) return 0;
  const summariesById = new Map<string, GameSummary>();
  for (const summary of summaries) {
    if (summary.gameId) summariesById.set(summary.gameId, summary);
  }
  let missing = 0;
  for (const game of games) {
    const summary = game.id ? summariesById.get(game.id) : undefined;
    if (!summary || !isCompleteStatsSummary(summary)) missing++;
  }
  return missing;
}

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
  _summariesLoaded = false;
  _requestedGeneration = _dataGeneration;
  if (!_summariesLoading) loadSummaries(_requestedGeneration);
}

/** Bump the generation counter so the next initStatsPage() reloads from IDB. */
export function invalidateSummariesCache(): void {
  _dataGeneration++;
}

function loadSummaries(generation: number): void {
  _summariesLoading = true;
  const requestId = ++_loadRequestSequence;
  _activeLoadRequest = requestId;
  const reads = [listGameSummaries(), loadGamesFromIdb()] as const;
  void Promise.all(reads).catch(async (error) => {
    await Promise.allSettled(reads);
    throw error;
  }).then(([summaries, stored]) => {
    if (requestId !== _activeLoadRequest || generation !== _dataGeneration) return;
    _summaries        = summaries;
    _importedGames    = stored?.games ?? [];
    const missingSummaries = countMissingOrIncompleteSummaries(_importedGames, _summaries);
    if (missingSummaries > 0) recordStatsMissingSummary(missingSummaries);
    _summariesLoaded  = true;
    _filteredCache    = null;
    _loadedGeneration = generation;
    _redraw();
  }).catch((error) => {
    if (requestId !== _activeLoadRequest || generation !== _dataGeneration) return;
    recordStatsLoadFail(error);
    _summariesLoaded = true;
    _filteredCache   = null;
    _redraw();
  }).finally(() => {
    if (requestId !== _activeLoadRequest) return;
    _summariesLoading = false;
    if (_requestedGeneration !== generation) loadSummaries(_requestedGeneration);
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
