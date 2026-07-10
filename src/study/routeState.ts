import type { StudySortDir, StudySortKey, StudyViewMode } from './studyCtrl';
import type { StudySource } from './types';

export type StudyRouteSource = StudySource;
export type StudyRouteSortToken = 'created' | 'updated' | 'title';
// 'last' = single-value fields (last occurrence wins). 'merge' = multi-value advanced fields
// (every occurrence accepted; recorded for diagnostics as "multiple accepted", not "picked last").
// Mirrors src/games/routeState.ts's `mergedValues` policy (design §2.3).
export type StudyRouteDuplicatePolicy = 'last' | 'merge';
// Advanced-search Result facet uses RAW PGN outcome, not owner-color Win/Loss (design §3.3): a
// library-wide Study item has no single reliable owner side without a sourceGameId join, so the
// vocabulary is White won / Black won / Draw / Unknown.
export type StudyRouteResult = 'white' | 'black' | 'draw' | 'unknown';
// Advanced-search Destination tokens (design §3.1). Stable URL slugs mapping 1:1 to
// SAVE_FLOW_GAME_DESTINATIONS (src/save/saveFlowCtrl.ts) plus a synthetic 'uncategorized' bucket for
// StudyItem.uncategorized / absent destination. Kept as slugs (not the display names) so the URL is
// stable across display-name changes; slice 2 (query-plan wiring) owns the token->display mapping:
//   played -> 'My Played Games', masters -> 'Masters Game Study',
//   repertoire -> 'Repertoire Library', prep -> 'Opponent Prep', uncategorized -> Unsorted bucket.
export type StudyRouteDestination = 'played' | 'masters' | 'repertoire' | 'prep' | 'uncategorized';
// Tri-state hidden-item visibility (design §2.3/§4). Unset/absent = the plain eye-toggle governs
// (studyCtrl's showHiddenItems()); an explicit token overrides it in slice 2's plan construction.
export type StudyRouteVisibility = 'exclude' | 'include' | 'only';
export type StudyRouteField =
  | 'q' | 'source' | 'tag' | 'folder' | 'fav' | 'sort' | 'view' | 'pages'


  | 'srcs' | 'tags' | 'players' | 'result' | 'dest'
  | 'addedFrom' | 'addedTo' | 'modifiedFrom' | 'modifiedTo' | 'vis';

export interface StudyRouteState {
  q: string;
  source: StudyRouteSource | null;
  tag: string | null;
  folder: string | null;  // StudyFolder.id (P2-LIB-11) — display name is resolved via a lookup, never stored here
  fav: boolean;
  sortKey: StudySortKey;
  sortDir: StudySortDir;
  view: StudyViewMode;
  pages: number;




  srcs?: StudyRouteSource[];        // multi sources; supersedes single-value `source`
  tags?: string[];                  // multi tags; supersedes single-value `tag`
  players?: string;                 // free-text player/opponent substring, bounded
  results?: StudyRouteResult[];     // raw PGN outcome multi-select (serialized as repeated `result=`)
  dest?: StudyRouteDestination[];   // destination multi-select
  addedFrom?: string;               // recentlyAdded range, inclusive, 'YYYY-MM-DD'
  addedTo?: string;
  modifiedFrom?: string;            // recentlyModified range, inclusive, 'YYYY-MM-DD'
  modifiedTo?: string;
  vis?: StudyRouteVisibility;       // tri-state hidden-item visibility
}

export interface StudyRouteInvalidParam {
  field: StudyRouteField;
  value: string;
  fallback: string;
  reason: string;
}

export interface StudyRouteIgnoredParam {
  field: string;
  values: string[];
}

export interface StudyRouteDuplicateParam {
  field: string;
  values: string[];
  chosenValue?: string;
  policy: StudyRouteDuplicatePolicy;
}

export interface StudyRouteCanonicalization {
  hadUnknownParams: boolean;
  hadDuplicateParams: boolean;
  hadInvalidParams: boolean;
  canonicalRoute: string;
}

export interface StudyRouteStateParseResult {
  state: StudyRouteState;
  invalidParams: StudyRouteInvalidParam[];
  ignoredParams: StudyRouteIgnoredParam[];
  duplicateParams: StudyRouteDuplicateParam[];
  canonical: StudyRouteCanonicalization;
}

export interface StudyRouteAvailability {
  tags?: Iterable<string>;
  folders?: Iterable<string>;  // known StudyFolder.id values (P2-LIB-11), not display names
}

export interface StudyRouteAvailabilityResolution {
  state: StudyRouteState;
  invalidParams: StudyRouteInvalidParam[];
  canonicalRoute: string;
}

const STUDY_ROUTE = '#/study';
const QUERY_MAX_LENGTH = 100;
const LABEL_MAX_LENGTH = 80;
export const MAX_STUDY_ROUTE_PAGES = 20;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DEFAULT_STATE: StudyRouteState = {
  q:       '',
  source:  null,
  tag:     null,
  folder:  null,
  fav:     false,
  sortKey: 'createdAt',
  sortDir: 'desc',
  view:    'list',
  pages:   1,
};

const PARAM_ORDER: readonly StudyRouteField[] = [
  'q', 'source', 'tag', 'folder', 'fav', 'sort', 'view', 'pages',
  'srcs', 'tags', 'players', 'result', 'dest', 'addedFrom', 'addedTo', 'modifiedFrom', 'modifiedTo', 'vis',
];
const KNOWN_PARAMS = new Set<StudyRouteField>(PARAM_ORDER);
const SOURCE_ORDER: readonly StudyRouteSource[] = ['analysis', 'openings', 'puzzles', 'manual', 'import'];
const SOURCES = new Set<StudyRouteSource>(SOURCE_ORDER);
const RESULT_ORDER: readonly StudyRouteResult[] = ['white', 'black', 'draw', 'unknown'];
const DEST_ORDER: readonly StudyRouteDestination[] = ['played', 'masters', 'repertoire', 'prep', 'uncategorized'];
const VISIBILITIES = new Set<StudyRouteVisibility>(['exclude', 'include', 'only']);
const SORT_TOKENS = new Set<StudyRouteSortToken>(['created', 'updated', 'title']);
const SORT_DIRECTIONS = new Set<StudySortDir>(['asc', 'desc']);
const VIEWS = new Set<StudyViewMode>(['list', 'grid']);

export function defaultStudyRouteState(): StudyRouteState {
  return { ...DEFAULT_STATE };
}

function queryFromInput(input: string): string {
  if (input === STUDY_ROUTE) return '';
  if (input.startsWith(`${STUDY_ROUTE}?`)) return input.slice(STUDY_ROUTE.length + 1);
  const withoutHash = input.replace(/^#\/?/, '');
  const queryStart = withoutHash.indexOf('?');
  if (queryStart >= 0) return withoutHash.slice(queryStart + 1);
  return withoutHash.startsWith('?') ? withoutHash.slice(1) : withoutHash;
}

function groupedQueryParams(input: string): Map<string, string[]> {
  const params = new URLSearchParams(queryFromInput(input));
  const grouped = new Map<string, string[]>();
  params.forEach((value, field) => {
    const values = grouped.get(field);
    if (values) values.push(value);
    else grouped.set(field, [value]);
  });
  return grouped;
}

function invalid(field: StudyRouteField, value: string, fallback: string, reason: string): StudyRouteInvalidParam {
  return { field, value, fallback, reason };
}

function lastValue(
  grouped: Map<string, string[]>,
  field: StudyRouteField,
  duplicateParams: StudyRouteDuplicateParam[],
): string | null {
  const values = grouped.get(field);
  if (!values || values.length === 0) return null;
  const chosenValue = values[values.length - 1] ?? '';
  if (values.length > 1) {
    duplicateParams.push({ field, values: [...values], chosenValue, policy: 'last' });
  }
  return chosenValue;
}

function lastNonEmptyValue(
  grouped: Map<string, string[]>,
  field: 'q' | 'tag' | 'folder' | 'players',
  duplicateParams: StudyRouteDuplicateParam[],
): string | null {
  const values = grouped.get(field);
  if (!values || values.length === 0) return null;
  const chosenValue = [...values].reverse().find(value => value.trim()) ?? values[values.length - 1] ?? '';
  if (values.length > 1) {
    duplicateParams.push({ field, values: [...values], chosenValue, policy: 'last' });
  }
  return chosenValue;
}

function looksPayloadLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[{\[]/.test(trimmed)) return true;
  if (/[\r\n]/.test(trimmed)) return true;
  if (/\b(FEN|PGN|Event|Site|Date)\b/i.test(trimmed)) return true;
  if (/^(1\.\s|\*)/.test(trimmed)) return true;
  if (/^[A-Za-z0-9+/]{120,}={0,2}$/.test(trimmed)) return true;
  return false;
}

function parseBoundedText(
  grouped: Map<string, string[]>,
  field: 'q' | 'tag' | 'folder' | 'players',
  maxLength: number,
  invalidParams: StudyRouteInvalidParam[],
  duplicateParams: StudyRouteDuplicateParam[],
): string | null {
  const value = lastNonEmptyValue(grouped, field, duplicateParams);
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    invalidParams.push(invalid(field, value, field === 'q' ? '' : 'default', 'too-long'));
    return null;
  }
  if (looksPayloadLike(normalized)) {
    invalidParams.push(invalid(field, value, field === 'q' ? '' : 'default', 'payload-like'));
    return null;
  }
  return normalized;
}



// Collects EVERY occurrence of a repeated multi-value param (design §2.3: `srcs=a&srcs=b`), still
// recording >1 occurrences in duplicateParams for diagnostics but as "multiple accepted" (policy
// 'merge'), not "duplicate, picked last". Mirrors src/games/routeState.ts's `mergedValues`.
function allValues(
  grouped: Map<string, string[]>,
  field: StudyRouteField,
  duplicateParams: StudyRouteDuplicateParam[],
): string[] {
  const values = grouped.get(field) ?? [];
  if (values.length > 1) duplicateParams.push({ field, values: [...values], policy: 'merge' });
  return values;
}

// Validates each occurrence against a fixed enum, dropping unrecognized tokens individually
// (partial-good-values-kept) and returning the accepted set in the enum's canonical order. Accepts
// both repeated params and comma-joined tokens, matching Games' `parseOrderedList`.
function parseEnumList<T extends string>(
  field: StudyRouteField,
  values: readonly string[],
  order: readonly T[],
  invalidParams: StudyRouteInvalidParam[],
): T[] {
  const allowed = new Set<T>(order);
  const seen = new Set<T>();
  for (const value of values) {
    for (const token of value.split(',')) {
      const normalized = token.trim() as T;
      if (!normalized) continue;
      if (allowed.has(normalized)) seen.add(normalized);
      else invalidParams.push(invalid(field, normalized, 'default', 'invalid-token'));
    }
  }
  return order.filter(value => seen.has(value));
}

// Free-text multi-value tags: each occurrence individually length/payload validated (no
// comma-splitting — a tag is one occurrence = one value), invalid occurrences dropped and recorded,
// insertion order and de-duplication preserved.
function parseTagList(
  field: StudyRouteField,
  values: readonly string[],
  invalidParams: StudyRouteInvalidParam[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const normalized = raw.trim();
    if (!normalized) continue;
    if (normalized.length > LABEL_MAX_LENGTH) { invalidParams.push(invalid(field, raw, 'default', 'too-long')); continue; }
    if (looksPayloadLike(normalized)) { invalidParams.push(invalid(field, raw, 'default', 'payload-like')); continue; }
    if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}

function dedupeTrimmed(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized && !seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}





function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

function parseDateBound(
  field: 'addedFrom' | 'addedTo' | 'modifiedFrom' | 'modifiedTo',
  value: string | null,
  invalidParams: StudyRouteInvalidParam[],
): string | undefined {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  const match = DATE_PATTERN.exec(normalized);
  if (!match) {
    invalidParams.push(invalid(field, value, 'omitted', 'invalid-date'));
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) {
    invalidParams.push(invalid(field, value, 'omitted', 'invalid-date'));
    return undefined;
  }
  return normalized;
}

function sortTokenFromKey(sortKey: StudySortKey): StudyRouteSortToken {
  if (sortKey === 'updatedAt') return 'updated';
  if (sortKey === 'title') return 'title';
  return 'created';
}

function sortKeyFromToken(token: StudyRouteSortToken): StudySortKey {
  if (token === 'updated') return 'updatedAt';
  if (token === 'title') return 'title';
  return 'createdAt';
}

export function serializeStudyRouteState(state: StudyRouteState): string {
  const params = new URLSearchParams();
  const q = state.q.trim();
  const tag = state.tag?.trim() ?? '';
  const folder = state.folder?.trim() ?? '';

  if (q) params.set('q', q);
  // Sources / tags: the multi-value fields supersede their legacy single sibling (design §2.3).
  const srcs = state.srcs ? SOURCE_ORDER.filter(source => state.srcs!.includes(source)) : [];
  if (srcs.length > 0) for (const source of srcs) params.append('srcs', source);
  else if (state.source) params.set('source', state.source);
  const tags = state.tags ? dedupeTrimmed(state.tags) : [];
  if (tags.length > 0) for (const t of tags) params.append('tags', t);
  else if (tag) params.set('tag', tag);
  if (folder) params.set('folder', folder);
  if (state.fav) params.set('fav', '1');

  const sortToken = `${sortTokenFromKey(state.sortKey)}.${state.sortDir}`;
  if (sortToken !== 'created.desc') params.set('sort', sortToken);
  if (state.view === 'grid') params.set('view', 'grid');
  if (Number.isInteger(state.pages) && state.pages > 1) {
    params.set('pages', String(Math.min(state.pages, MAX_STUDY_ROUTE_PAGES)));
  }

  // Advanced-search fields (design §2.3), appended after the pre-existing params so canonical URLs
  // for non-advanced states are byte-identical to before this slice.
  const players = state.players?.trim() ?? '';
  if (players) params.set('players', players);
  const results = state.results ? RESULT_ORDER.filter(result => state.results!.includes(result)) : [];
  for (const result of results) params.append('result', result);
  const dest = state.dest ? DEST_ORDER.filter(d => state.dest!.includes(d)) : [];
  for (const d of dest) params.append('dest', d);
  if (state.addedFrom) params.set('addedFrom', state.addedFrom);
  if (state.addedTo) params.set('addedTo', state.addedTo);
  if (state.modifiedFrom) params.set('modifiedFrom', state.modifiedFrom);
  if (state.modifiedTo) params.set('modifiedTo', state.modifiedTo);
  if (state.vis) params.set('vis', state.vis);

  const query = params.toString();
  return query ? `${STUDY_ROUTE}?${query}` : STUDY_ROUTE;
}

export function parseStudyRouteState(input: string): StudyRouteStateParseResult {
  const grouped = groupedQueryParams(input);
  const invalidParams: StudyRouteInvalidParam[] = [];
  const ignoredParams: StudyRouteIgnoredParam[] = [];
  const duplicateParams: StudyRouteDuplicateParam[] = [];
  const state = defaultStudyRouteState();

  for (const [field, values] of grouped) {
    if (!KNOWN_PARAMS.has(field as StudyRouteField)) {
      ignoredParams.push({ field, values });
    }
  }

  const q = parseBoundedText(grouped, 'q', QUERY_MAX_LENGTH, invalidParams, duplicateParams);
  if (q !== null) state.q = q;

  const sourceValue = lastValue(grouped, 'source', duplicateParams);
  if (sourceValue !== null) {
    const normalized = sourceValue.trim() as StudyRouteSource;
    if (!normalized) {
      state.source = null;
    } else if (SOURCES.has(normalized)) {
      state.source = normalized;
    } else {
      invalidParams.push(invalid('source', sourceValue, 'default', 'invalid-source'));
    }
  }

  // Multi-value sources (design §2.3): supersede the legacy single `source` when present. The
  // legacy value is folded away and recorded as ignored-but-not-invalid so the canonical URL emits
  // only `srcs`; old single-filter links keep working when `srcs` is absent.
  const srcs = parseEnumList('srcs', allValues(grouped, 'srcs', duplicateParams), SOURCE_ORDER, invalidParams);
  if (srcs.length > 0) {
    state.srcs = srcs;
    if (state.source !== null) {
      ignoredParams.push({ field: 'source', values: grouped.get('source') ?? [] });
      state.source = null;
    }
  }

  const tag = parseBoundedText(grouped, 'tag', LABEL_MAX_LENGTH, invalidParams, duplicateParams);
  if (tag !== null) state.tag = tag;

  // Multi-value tags (design §2.3): supersede the legacy single `tag` the same way `srcs` supersedes
  // `source`.
  const tags = parseTagList('tags', allValues(grouped, 'tags', duplicateParams), invalidParams);
  if (tags.length > 0) {
    state.tags = tags;
    if (state.tag !== null) {
      ignoredParams.push({ field: 'tag', values: grouped.get('tag') ?? [] });
      state.tag = null;
    }
  }

  const folder = parseBoundedText(grouped, 'folder', LABEL_MAX_LENGTH, invalidParams, duplicateParams);
  if (folder !== null) state.folder = folder;

  const favValue = lastValue(grouped, 'fav', duplicateParams);
  if (favValue !== null) {
    const normalized = favValue.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') state.fav = true;
    else if (normalized === '' || normalized === '0' || normalized === 'false') state.fav = false;
    else invalidParams.push(invalid('fav', favValue, 'false', 'invalid-boolean'));
  }

  const sortValue = lastValue(grouped, 'sort', duplicateParams);
  if (sortValue !== null) {
    const [field, dir, extra] = sortValue.trim().split('.');
    const sortField = field as StudyRouteSortToken;
    const sortDir = dir as StudySortDir;
    if (!extra && SORT_TOKENS.has(sortField) && SORT_DIRECTIONS.has(sortDir)) {
      state.sortKey = sortKeyFromToken(sortField);
      state.sortDir = sortDir;
    } else if (sortValue.trim()) {
      invalidParams.push(invalid('sort', sortValue, 'created.desc', 'invalid-sort'));
    }
  }

  const viewValue = lastValue(grouped, 'view', duplicateParams);
  if (viewValue !== null) {
    const normalized = viewValue.trim() as StudyViewMode;
    if (!normalized) state.view = 'list';
    else if (VIEWS.has(normalized)) state.view = normalized;
    else invalidParams.push(invalid('view', viewValue, 'list', 'invalid-view'));
  }

  const pagesValue = lastValue(grouped, 'pages', duplicateParams);
  if (pagesValue !== null) {
    const normalized = pagesValue.trim();
    if (/^(0|[1-9]\d*)$/.test(normalized)) {
      const pages = Number(normalized);
      if (Number.isSafeInteger(pages) && pages >= 1) {
        state.pages = Math.min(pages, MAX_STUDY_ROUTE_PAGES);
        if (pages > MAX_STUDY_ROUTE_PAGES) {
          invalidParams.push(invalid('pages', pagesValue, String(MAX_STUDY_ROUTE_PAGES), 'too-large'));
        }
      } else {
        invalidParams.push(invalid('pages', pagesValue, '1', 'invalid-pages'));
      }
    } else if (normalized) {
      invalidParams.push(invalid('pages', pagesValue, '1', 'invalid-pages'));
    }
  }

  // --- Advanced-search fields (design §2.3) — parsed/serialized/round-tripped, UNCONSUMED by the
  // query plan until slice 2. Only assigned when a real value is present so absent keys stay absent
  // (deep-equal parity with defaultStudyRouteState()).
  const players = parseBoundedText(grouped, 'players', QUERY_MAX_LENGTH, invalidParams, duplicateParams);
  if (players !== null) state.players = players;

  const results = parseEnumList('result', allValues(grouped, 'result', duplicateParams), RESULT_ORDER, invalidParams);
  if (results.length > 0) state.results = results;

  const dest = parseEnumList('dest', allValues(grouped, 'dest', duplicateParams), DEST_ORDER, invalidParams);
  if (dest.length > 0) state.dest = dest;

  let addedFrom = parseDateBound('addedFrom', lastValue(grouped, 'addedFrom', duplicateParams), invalidParams);
  let addedTo = parseDateBound('addedTo', lastValue(grouped, 'addedTo', duplicateParams), invalidParams);
  if (addedFrom !== undefined && addedTo !== undefined && addedFrom > addedTo) {
    invalidParams.push(invalid('addedFrom', addedFrom, 'omitted', 'inverted-range'));
    invalidParams.push(invalid('addedTo', addedTo, 'omitted', 'inverted-range'));
    addedFrom = undefined;
    addedTo = undefined;
  }
  if (addedFrom !== undefined) state.addedFrom = addedFrom;
  if (addedTo !== undefined) state.addedTo = addedTo;

  let modifiedFrom = parseDateBound('modifiedFrom', lastValue(grouped, 'modifiedFrom', duplicateParams), invalidParams);
  let modifiedTo = parseDateBound('modifiedTo', lastValue(grouped, 'modifiedTo', duplicateParams), invalidParams);
  if (modifiedFrom !== undefined && modifiedTo !== undefined && modifiedFrom > modifiedTo) {
    invalidParams.push(invalid('modifiedFrom', modifiedFrom, 'omitted', 'inverted-range'));
    invalidParams.push(invalid('modifiedTo', modifiedTo, 'omitted', 'inverted-range'));
    modifiedFrom = undefined;
    modifiedTo = undefined;
  }
  if (modifiedFrom !== undefined) state.modifiedFrom = modifiedFrom;
  if (modifiedTo !== undefined) state.modifiedTo = modifiedTo;

  const visValue = lastValue(grouped, 'vis', duplicateParams);
  if (visValue !== null) {
    const normalized = visValue.trim() as StudyRouteVisibility;
    if (normalized && VISIBILITIES.has(normalized)) state.vis = normalized;
    else if (normalized) invalidParams.push(invalid('vis', visValue, 'default', 'invalid-visibility'));
  }

  const canonicalRoute = serializeStudyRouteState(state);
  return {
    state,
    invalidParams,
    ignoredParams,
    duplicateParams,
    canonical: {
      hadUnknownParams:   ignoredParams.length > 0,
      hadDuplicateParams: duplicateParams.length > 0,
      hadInvalidParams:   invalidParams.length > 0,
      canonicalRoute,
    },
  };
}

export function studyRouteNeedsFullLibraryScan(state: StudyRouteState): boolean {
  return Boolean(
    state.q || state.source || state.tag || state.folder || state.fav
    // Advanced-search fields (design §2.3): a direct link narrowed by any of them must hydrate the
    // full library so the query plan (slice 2) filters the whole set, not just page 1. This is
    // route-state/hydration plumbing only — it does not consume the fields in the query plan.
    || (state.srcs?.length ?? 0) > 0
    || (state.tags?.length ?? 0) > 0
    || (state.results?.length ?? 0) > 0
    || (state.dest?.length ?? 0) > 0
    || Boolean(state.players)
    || Boolean(state.addedFrom) || Boolean(state.addedTo)
    || Boolean(state.modifiedFrom) || Boolean(state.modifiedTo)
    || Boolean(state.vis),
  );
}

/**
 * Clears route fields that no longer resolve against the caller-supplied availability sets.
 * `availability.folders` must be known StudyFolder ids (P2-LIB-11): a pre-migration
 * `#/study?folder=<name>` link will not match any id and is cleared here via the same
 * recovery path already used for an unavailable tag — accepted breakage, not silently kept.
 */
export function resolveStudyRouteAvailability(
  state: StudyRouteState,
  availability: StudyRouteAvailability,
): StudyRouteAvailabilityResolution {
  const invalidParams: StudyRouteInvalidParam[] = [];
  const next = { ...state };
  const tags = availability.tags ? new Set(availability.tags) : null;
  const folders = availability.folders ? new Set(availability.folders) : null;

  if (next.tag && tags && !tags.has(next.tag)) {
    invalidParams.push(invalid('tag', next.tag, 'default', 'missing-tag'));
    next.tag = null;
  }
  if (next.folder && folders && !folders.has(next.folder)) {
    invalidParams.push(invalid('folder', next.folder, 'default', 'missing-folder'));
    next.folder = null;
  }

  return {
    state: next,
    invalidParams,
    canonicalRoute: serializeStudyRouteState(next),
  };
}
