import type { StudySortDir, StudySortKey, StudyViewMode } from './studyCtrl';
import type { StudySource } from './types';

export type StudyRouteSource = StudySource;
export type StudyRouteSortToken = 'created' | 'updated' | 'title';
export type StudyRouteDuplicatePolicy = 'last';
export type StudyRouteField = 'q' | 'source' | 'tag' | 'folder' | 'fav' | 'sort' | 'view' | 'pages';

export interface StudyRouteState {
  q: string;
  source: StudyRouteSource | null;
  tag: string | null;
  folder: string | null;
  fav: boolean;
  sortKey: StudySortKey;
  sortDir: StudySortDir;
  view: StudyViewMode;
  pages: number;
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
  folders?: Iterable<string>;
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

const PARAM_ORDER: readonly StudyRouteField[] = ['q', 'source', 'tag', 'folder', 'fav', 'sort', 'view', 'pages'];
const KNOWN_PARAMS = new Set<StudyRouteField>(PARAM_ORDER);
const SOURCES = new Set<StudyRouteSource>(['analysis', 'openings', 'puzzles', 'manual', 'import']);
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
  field: 'q' | 'tag' | 'folder',
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
  field: 'q' | 'tag' | 'folder',
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
  if (state.source) params.set('source', state.source);
  if (tag) params.set('tag', tag);
  if (folder) params.set('folder', folder);
  if (state.fav) params.set('fav', '1');

  const sortToken = `${sortTokenFromKey(state.sortKey)}.${state.sortDir}`;
  if (sortToken !== 'created.desc') params.set('sort', sortToken);
  if (state.view === 'grid') params.set('view', 'grid');
  if (Number.isInteger(state.pages) && state.pages > 1) {
    params.set('pages', String(Math.min(state.pages, MAX_STUDY_ROUTE_PAGES)));
  }

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

  const tag = parseBoundedText(grouped, 'tag', LABEL_MAX_LENGTH, invalidParams, duplicateParams);
  if (tag !== null) state.tag = tag;

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
  return Boolean(state.q || state.source || state.tag || state.folder || state.fav);
}

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
