







import type { StatsTimeFilter } from './ctrl';
import { initStatsPage, setTimeFilter } from './ctrl';
import { replaceHashRoute } from '../router';

// ── Schema constants ──────────────────────────────────────────────────────────

/** Stats URL-state length guardrail (mirrors the sprint helper contract). */
export const STATS_ROUTE_URL_LENGTH_GUARDRAIL = 1500;

/** Maximum length for any individual param value (rejects payload-like blobs). */
const MAX_PARAM_VALUE_LENGTH = 20;

const STATS_TIME_FILTER_VALUES: readonly StatsTimeFilter[] = [
  'all', 'bullet', 'blitz', 'rapid', 'classical',
];
const STATS_TIME_FILTER_SET = new Set<StatsTimeFilter>(STATS_TIME_FILTER_VALUES);

const KNOWN_PARAMS = new Set(['tc']);

const DEFAULT_TC: StatsTimeFilter = 'all';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatsUrlState {
  tc: StatsTimeFilter;
}

export interface StatsUrlStateInvalidParam {
  field: string;
  value: string;
  fallback: string;
}

export interface StatsUrlStateDuplicateParam {
  field: string;
  values: string[];
  chosenValue: string;
}

export interface StatsUrlStateIgnoredParam {
  field: string;
  value: string;
}

export interface StatsUrlStateParseResult {
  state: StatsUrlState;
  invalidParams: StatsUrlStateInvalidParam[];
  duplicateParams: StatsUrlStateDuplicateParam[];
  ignoredParams: StatsUrlStateIgnoredParam[];
  /** Canonical URL for replacement when parse produced cleanup. */
  canonical: { canonicalRoute: string; needsCleanup: boolean };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizedQuery(input: string): string {
  // Accept raw query text, `?query`, or full `#/stats?...` hash.
  const withoutHash = input.replace(/^#\/?stats\??/, '').replace(/^#\/?/, '');
  const queryStart = withoutHash.indexOf('?');
  if (queryStart >= 0) return withoutHash.slice(queryStart + 1);
  return withoutHash.startsWith('?') ? withoutHash.slice(1) : withoutHash;
}

function isPayloadLike(value: string): boolean {
  if (value.length > MAX_PARAM_VALUE_LENGTH) return true;
  // Reject JSON-like, base64-like, multiline, or whitespace-containing values.
  if (/[\n\r\t{}[\]"']/.test(value)) return true;
  if (/\s/.test(value)) return true;
  return false;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse raw query text from `route.query` into typed Stats URL state.
 * Never throws — malformed input recovers to defaults.
 */
export function parseStatsUrlState(input: string): StatsUrlStateParseResult {
  const params = new URLSearchParams(normalizedQuery(input));
  const state: StatsUrlState = { tc: DEFAULT_TC };
  const invalidParams: StatsUrlStateInvalidParam[] = [];
  const duplicateParams: StatsUrlStateDuplicateParam[] = [];
  const ignoredParams: StatsUrlStateIgnoredParam[] = [];

  // Collect ignored (unknown) params.
  params.forEach((_value, key) => {
    if (!KNOWN_PARAMS.has(key) && !ignoredParams.some(p => p.field === key)) {
      ignoredParams.push({ field: key, value: params.get(key) ?? '' });
    }
  });

  // Parse `tc` — use last value when duplicated.
  const allTcValues = params.getAll('tc');
  if (allTcValues.length > 1) {
    duplicateParams.push({
      field: 'tc',
      values: allTcValues,
      chosenValue: allTcValues[allTcValues.length - 1] ?? '',
    });
  }
  if (allTcValues.length > 0) {
    const raw = allTcValues[allTcValues.length - 1] ?? '';
    if (raw === '' || isPayloadLike(raw) || !STATS_TIME_FILTER_SET.has(raw as StatsTimeFilter)) {
      invalidParams.push({ field: 'tc', value: raw, fallback: DEFAULT_TC });
      // state.tc stays at DEFAULT_TC
    } else {
      state.tc = raw as StatsTimeFilter;
    }
  }

  // Determine whether canonical cleanup is needed.
  const needsCleanup =
    invalidParams.length > 0 ||
    duplicateParams.length > 0 ||
    ignoredParams.length > 0 ||
    state.tc === DEFAULT_TC && allTcValues.length > 0; // tc=all is valid but redundant

  const canonicalRoute = serializeStatsUrlState(state);

  return { state, invalidParams, duplicateParams, ignoredParams, canonical: { canonicalRoute, needsCleanup } };
}

// ── Serializer ────────────────────────────────────────────────────────────────

/**
 * Serialize Stats URL state to a canonical hash route string.
 * Default `tc='all'` is elided; returns `#/stats` when every field elides.
 */
export function serializeStatsUrlState(state: Partial<StatsUrlState>): string {
  const params: string[] = [];

  // Serialization order: tc (only param).
  const tc = state.tc ?? DEFAULT_TC;
  if (tc !== DEFAULT_TC) params.push(`tc=${encodeURIComponent(tc)}`);

  const route = `#/stats${params.length > 0 ? `?${params.join('&')}` : ''}`;

  // Guardrail: warn if the route approaches the sprint helper length limit.
  if (route.length > STATS_ROUTE_URL_LENGTH_GUARDRAIL) {
    console.warn('[stats/urlState] serialized Stats route exceeds length guardrail', route.length);
    return '#/stats';
  }

  return route;
}

// ── Hydration entry point ─────────────────────────────────────────────────────

/**
 * Hydrate the Stats route from a raw query string.
 * - Parses `tc` from `query` and applies it via `setTimeFilter()`.
 * - Calls `initStatsPage(redraw)` to start the IDB summary load.
 * - Replaces the URL with the canonical form when cleanup is needed.
 *
 * Call this from `src/main.ts` instead of calling `initStatsPage()` directly
 * on the `#/stats` route.
 */
export function hydrateStatsRoute(query: string, redraw: () => void): void {
  const { state, canonical } = parseStatsUrlState(query);

  // Apply time-control filter before first render so the correct tab is active.
  // setTimeFilter() calls _redraw() but _redraw is set by initStatsPage() below.
  // We set the filter state directly without triggering a redundant redraw here;
  // initStatsPage() will drive the initial render via loadSummaries() → _redraw().
  initStatsPage(redraw);

  // Apply the URL-hydrated filter. setTimeFilter sets _timeFilter and invalidates
  // _filteredCache; _redraw is now wired by initStatsPage so the call is safe.
  if (state.tc !== DEFAULT_TC) {
    setTimeFilter(state.tc);
  }

  // Canonical cleanup: replace URL with clean form to avoid Back-button loops.
  if (canonical.needsCleanup) {
    replaceHashRoute(canonical.canonicalRoute);
  }
}

// ── Writer helper ─────────────────────────────────────────────────────────────

/**
 * Write a replace-style URL update for a Stats time-control tab click.
 * Does not push a history entry — prevents Back button from replaying tab changes.
 */
export function writeStatsTimeFilterUrl(tc: StatsTimeFilter): void {
  const url = serializeStatsUrlState({ tc });
  replaceHashRoute(url);
}
