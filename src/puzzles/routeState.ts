import type { PuzzleDifficulty, PuzzleSessionMode, PuzzleSourceKind } from './types';

export type PuzzleRouteLens = 'browse' | 'rated' | 'retry' | 'due';
export type PuzzleRouteSource = PuzzleSourceKind;
export type PuzzleRouteSortToken =
  | 'created.asc'
  | 'created.desc'
  | 'rating.asc'
  | 'rating.desc'
  | 'title.asc'
  | 'title.desc'
  | 'due.asc'
  | 'attempted.desc';
export type PuzzleRouteDuplicatePolicy = 'last';
export type PuzzleRouteField =
  | 'lens'
  | 'source'
  | 'theme'
  | 'opening'
  | 'rating'
  | 'difficulty'
  | 'mode'
  | 'fav'
  | 'sort'
  | 'page';

export interface PuzzleRouteState {
  lens: PuzzleRouteLens;
  source: PuzzleRouteSource | null;
  theme: string | null;
  opening: string | null;
  ratingMin: number;
  ratingMax: number;
  difficulty: PuzzleDifficulty;
  mode: PuzzleSessionMode;
  fav: boolean;
  sort: PuzzleRouteSortToken;
  page: number;
}

export interface PuzzleRouteInvalidParam {
  field: PuzzleRouteField;
  value: string;
  fallback: string;
  reason: string;
}

export interface PuzzleRouteIgnoredParam {
  field: string;
  values: string[];
}

export interface PuzzleRouteDuplicateParam {
  field: string;
  values: string[];
  chosenValue?: string;
  policy: PuzzleRouteDuplicatePolicy;
}

export interface PuzzleRouteCanonicalization {
  hadUnknownParams: boolean;
  hadDuplicateParams: boolean;
  hadInvalidParams: boolean;
  canonicalRoute: string;
}

export interface PuzzleRouteStateParseResult {
  state: PuzzleRouteState;
  invalidParams: PuzzleRouteInvalidParam[];
  ignoredParams: PuzzleRouteIgnoredParam[];
  duplicateParams: PuzzleRouteDuplicateParam[];
  canonical: PuzzleRouteCanonicalization;
}

const PUZZLE_ROUTE = '#/puzzles';
const THEME_MAX_LENGTH = 80;
const OPENING_MAX_LENGTH = 120;
const RATING_MIN = 0;
const RATING_MAX = 4000;
const DEFAULT_RATING_MIN = 0;
const DEFAULT_RATING_MAX = 3200;

export const MAX_PUZZLE_ROUTE_PAGE = 20;
export const PUZZLE_ROUTE_URL_LENGTH_GUARDRAIL = 1500;

const PARAM_ORDER: readonly PuzzleRouteField[] = [
  'lens',
  'source',
  'theme',
  'opening',
  'rating',
  'difficulty',
  'mode',
  'fav',
  'sort',
  'page',
];
const KNOWN_PARAMS = new Set<PuzzleRouteField>(PARAM_ORDER);
const UNAPPROVED_PARAMS = new Set(['collection', 'tag']);
const LENSES = new Set<PuzzleRouteLens>(['browse', 'rated', 'retry', 'due']);
const SOURCES = new Set(['imported', 'user']);
const DIFFICULTIES = new Set<PuzzleDifficulty>(['easiest', 'easier', 'normal', 'harder', 'hardest']);
const MODES = new Set<PuzzleSessionMode>(['practice', 'rated']);
const SORTS = new Set<PuzzleRouteSortToken>([
  'created.asc',
  'created.desc',
  'rating.asc',
  'rating.desc',
  'title.asc',
  'title.desc',
  'due.asc',
  'attempted.desc',
]);

const DEFAULT_STATE: PuzzleRouteState = {
  lens:       'browse',
  source:     null,
  theme:      null,
  opening:    null,
  ratingMin:  DEFAULT_RATING_MIN,
  ratingMax:  DEFAULT_RATING_MAX,
  difficulty: 'normal',
  mode:       'practice',
  fav:        false,
  sort:       'created.desc',
  page:       1,
};

export function defaultPuzzleRouteState(): PuzzleRouteState {
  return { ...DEFAULT_STATE };
}

function queryFromInput(input: string): string {
  if (input === PUZZLE_ROUTE) return '';
  if (input.startsWith(`${PUZZLE_ROUTE}?`)) return input.slice(PUZZLE_ROUTE.length + 1);
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

function invalid(field: PuzzleRouteField, value: string, fallback: string, reason: string): PuzzleRouteInvalidParam {
  return { field, value, fallback, reason };
}

function lastValue(
  grouped: Map<string, string[]>,
  field: PuzzleRouteField,
  duplicateParams: PuzzleRouteDuplicateParam[],
): string | null {
  const values = grouped.get(field);
  if (!values || values.length === 0) return null;
  const chosenValue = values[values.length - 1] ?? '';
  if (values.length > 1) duplicateParams.push({ field, values: [...values], chosenValue, policy: 'last' });
  return chosenValue;
}

function lastNonEmptyValue(
  grouped: Map<string, string[]>,
  field: 'theme' | 'opening',
  duplicateParams: PuzzleRouteDuplicateParam[],
): string | null {
  const values = grouped.get(field);
  if (!values || values.length === 0) return null;
  const chosenValue = [...values].reverse().find(value => value.trim()) ?? values[values.length - 1] ?? '';
  if (values.length > 1) duplicateParams.push({ field, values: [...values], chosenValue, policy: 'last' });
  return chosenValue;
}

function looksPayloadLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[{\[]/.test(trimmed)) return true;
  if (/[\r\n]/.test(trimmed)) return true;
  if (/\b(FEN|PGN|Event|Site|Date)\b/i.test(trimmed)) return true;
  if (/^(1\.\s|\*)/.test(trimmed)) return true;
  if (/\b[prnbqkPRNBQK1-8]{1,8}\/[prnbqkPRNBQK1-8/]+\s[wb]\s[-KQkq]+\s[-a-h1-8]+\s\d+\s\d+\b/.test(trimmed)) {
    return true;
  }
  if (looksMoveArrayLike(trimmed)) return true;
  if (/^[A-Za-z0-9+/]{120,}={0,2}$/.test(trimmed)) return true;
  return false;
}

function looksMoveArrayLike(value: string): boolean {
  const parts = value
    .split(/[.,\s]+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every(part => looksUciMoveLike(part) || looksSanMoveLike(part));
}

function looksUciMoveLike(value: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(value);
}

function looksSanMoveLike(value: string): boolean {
  return /^(?:O-O(?:-O)?|0-0(?:-0)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[KQRBN]x?[a-h][1-8][+#]?)$/.test(value);
}

function normalizeBoundedTextForRoute(value: string | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) return null;
  if (looksPayloadLike(normalized)) return null;
  return normalized;
}

function parseBoundedText(
  grouped: Map<string, string[]>,
  field: 'theme' | 'opening',
  maxLength: number,
  invalidParams: PuzzleRouteInvalidParam[],
  duplicateParams: PuzzleRouteDuplicateParam[],
): string | null {
  const value = lastNonEmptyValue(grouped, field, duplicateParams);
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeBoundedTextForRoute(value, maxLength);
  if (normalized !== null) return normalized;
  if (trimmed.length > maxLength) {
    invalidParams.push(invalid(field, value, 'default', 'too-long'));
    return null;
  }
  if (looksPayloadLike(trimmed)) {
    invalidParams.push(invalid(field, value, 'default', 'payload-like'));
    return null;
  }
  return null;
}

function sourceFromAlias(value: string): PuzzleRouteSource | null {
  if (value === 'imported') return 'imported-lichess';
  if (value === 'user') return 'user-library';
  return null;
}

function sourceAlias(source: PuzzleRouteSource | null): string | null {
  if (source === 'imported-lichess') return 'imported';
  if (source === 'user-library') return 'user';
  return null;
}

function defaultSortFor(state: Pick<PuzzleRouteState, 'lens' | 'source'>): PuzzleRouteSortToken {
  if (state.lens === 'due') return 'due.asc';
  if (state.lens === 'retry') return 'attempted.desc';
  if (state.lens === 'rated') return 'rating.asc';
  if (state.source === 'imported-lichess') return 'rating.asc';
  return 'created.desc';
}

function isSortCompatible(sort: PuzzleRouteSortToken, state: Pick<PuzzleRouteState, 'lens' | 'source'>): boolean {
  if (state.lens === 'due') return sort === 'due.asc';
  if (state.lens === 'retry') return sort === 'attempted.desc';
  if (state.lens === 'rated') return sort === 'rating.asc' || sort === 'rating.desc';
  if (state.source === 'imported-lichess') return sort === 'rating.asc' || sort === 'rating.desc';
  if (state.source === 'user-library') {
    return sort === 'created.asc' || sort === 'created.desc' || sort === 'title.asc' || sort === 'title.desc' || sort === 'attempted.desc';
  }
  return sort === 'created.asc' || sort === 'created.desc' || sort === 'title.asc' || sort === 'title.desc';
}

function supportsImportedFilters(state: PuzzleRouteState): boolean {
  return state.source === 'imported-lichess' || state.lens === 'rated';
}

function normalizeForSerialization(state: PuzzleRouteState): PuzzleRouteState {
  const next: PuzzleRouteState = {
    ...defaultPuzzleRouteState(),
    ...state,
  };

  if (next.lens !== 'browse') next.source = null;
  if (!supportsImportedFilters(next)) {
    next.theme = null;
    next.opening = null;
    next.ratingMin = DEFAULT_RATING_MIN;
    next.ratingMax = DEFAULT_RATING_MAX;
    if (next.mode === 'rated') next.mode = 'practice';
  }
  next.theme = normalizeBoundedTextForRoute(next.theme, THEME_MAX_LENGTH);
  next.opening = normalizeBoundedTextForRoute(next.opening, OPENING_MAX_LENGTH);
  next.page = Number.isInteger(next.page) && next.page > 1 ? Math.min(next.page, MAX_PUZZLE_ROUTE_PAGE) : 1;
  if (!isSortCompatible(next.sort, next)) next.sort = defaultSortFor(next);
  return next;
}

export function serializePuzzleRouteState(state: PuzzleRouteState): string {
  const normalized = normalizeForSerialization(state);
  const params = new URLSearchParams();

  if (normalized.lens !== 'browse') params.set('lens', normalized.lens);
  const source = normalized.lens === 'browse' ? sourceAlias(normalized.source) : null;
  if (source) params.set('source', source);
  if (normalized.theme) params.set('theme', normalized.theme.trim());
  if (normalized.opening) params.set('opening', normalized.opening.trim());
  if (normalized.ratingMin !== DEFAULT_RATING_MIN || normalized.ratingMax !== DEFAULT_RATING_MAX) {
    params.set('rating', `${normalized.ratingMin}-${normalized.ratingMax}`);
  }
  if (normalized.difficulty !== 'normal') params.set('difficulty', normalized.difficulty);
  if (normalized.mode === 'rated') params.set('mode', 'rated');
  if (normalized.fav) params.set('fav', '1');
  const defaultSort = defaultSortFor(normalized);
  if (normalized.sort !== defaultSort) params.set('sort', normalized.sort);
  if (normalized.page > 1) params.set('page', String(normalized.page));

  const query = params.toString();
  return query ? `${PUZZLE_ROUTE}?${query}` : PUZZLE_ROUTE;
}

function parseRating(value: string): { min: number; max: number } | null {
  const match = value.trim().match(/^(\d{1,4})-(\d{1,4})$/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return null;
  if (min < RATING_MIN || max > RATING_MAX || min >= max) return null;
  return { min, max };
}

export function parsePuzzleRouteState(input: string): PuzzleRouteStateParseResult {
  const grouped = groupedQueryParams(input);
  const invalidParams: PuzzleRouteInvalidParam[] = [];
  const ignoredParams: PuzzleRouteIgnoredParam[] = [];
  const duplicateParams: PuzzleRouteDuplicateParam[] = [];
  const state = defaultPuzzleRouteState();
  let sortWasSpecified = false;
  let validRatingWasSpecified = false;

  for (const [field, values] of grouped) {
    if (!KNOWN_PARAMS.has(field as PuzzleRouteField)) {
      ignoredParams.push({ field, values });
    }
  }

  const lensValue = lastValue(grouped, 'lens', duplicateParams);
  if (lensValue !== null) {
    const normalized = lensValue.trim() as PuzzleRouteLens;
    if (!normalized) state.lens = 'browse';
    else if (LENSES.has(normalized)) state.lens = normalized;
    else invalidParams.push(invalid('lens', lensValue, 'browse', 'invalid-lens'));
  }

  const sourceValue = lastValue(grouped, 'source', duplicateParams);
  if (sourceValue !== null) {
    const normalized = sourceValue.trim();
    if (!normalized) {
      state.source = null;
    } else if (SOURCES.has(normalized)) {
      state.source = sourceFromAlias(normalized);
    } else {
      invalidParams.push(invalid('source', sourceValue, 'default', 'invalid-source'));
    }
  }

  const theme = parseBoundedText(grouped, 'theme', THEME_MAX_LENGTH, invalidParams, duplicateParams);
  if (theme !== null) state.theme = theme;

  const opening = parseBoundedText(grouped, 'opening', OPENING_MAX_LENGTH, invalidParams, duplicateParams);
  if (opening !== null) state.opening = opening;

  const ratingValue = lastValue(grouped, 'rating', duplicateParams);
  if (ratingValue !== null) {
    const rating = parseRating(ratingValue);
    if (rating) {
      state.ratingMin = rating.min;
      state.ratingMax = rating.max;
      validRatingWasSpecified = true;
    } else if (ratingValue.trim()) {
      invalidParams.push(invalid('rating', ratingValue, `${DEFAULT_RATING_MIN}-${DEFAULT_RATING_MAX}`, 'invalid-rating'));
    }
  }

  if (state.lens === 'browse' && state.source === null && (state.theme || state.opening || validRatingWasSpecified)) {
    state.source = 'imported-lichess';
  }

  const difficultyValue = lastValue(grouped, 'difficulty', duplicateParams);
  if (difficultyValue !== null) {
    const normalized = difficultyValue.trim() as PuzzleDifficulty;
    if (!normalized) state.difficulty = 'normal';
    else if (DIFFICULTIES.has(normalized)) state.difficulty = normalized;
    else invalidParams.push(invalid('difficulty', difficultyValue, 'normal', 'invalid-difficulty'));
  }

  const modeValue = lastValue(grouped, 'mode', duplicateParams);
  if (modeValue !== null) {
    const normalized = modeValue.trim() as PuzzleSessionMode;
    if (!normalized) state.mode = 'practice';
    else if (MODES.has(normalized)) state.mode = normalized;
    else invalidParams.push(invalid('mode', modeValue, 'practice', 'invalid-mode'));
  }

  const favValue = lastValue(grouped, 'fav', duplicateParams);
  if (favValue !== null) {
    const normalized = favValue.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') state.fav = true;
    else if (normalized === '' || normalized === '0' || normalized === 'false') state.fav = false;
    else invalidParams.push(invalid('fav', favValue, 'false', 'invalid-boolean'));
  }

  const sortValue = lastValue(grouped, 'sort', duplicateParams);
  if (sortValue !== null) {
    sortWasSpecified = true;
    const normalized = sortValue.trim() as PuzzleRouteSortToken;
    if (!normalized) state.sort = defaultSortFor(state);
    else if (SORTS.has(normalized) && isSortCompatible(normalized, state)) state.sort = normalized;
    else if (SORTS.has(normalized)) invalidParams.push(invalid('sort', sortValue, defaultSortFor(state), 'unsupported-sort'));
    else invalidParams.push(invalid('sort', sortValue, defaultSortFor(state), 'invalid-sort'));
  }

  const pageValue = lastValue(grouped, 'page', duplicateParams);
  if (pageValue !== null) {
    const normalized = pageValue.trim();
    if (/^(0|[1-9]\d*)$/.test(normalized)) {
      const page = Number(normalized);
      if (Number.isSafeInteger(page) && page >= 1) {
        state.page = Math.min(page, MAX_PUZZLE_ROUTE_PAGE);
        if (page > MAX_PUZZLE_ROUTE_PAGE) {
          invalidParams.push(invalid('page', pageValue, String(MAX_PUZZLE_ROUTE_PAGE), 'too-large'));
        }
      } else {
        invalidParams.push(invalid('page', pageValue, '1', 'invalid-page'));
      }
    } else if (normalized) {
      invalidParams.push(invalid('page', pageValue, '1', 'invalid-page'));
    }
  }

  if (!sortWasSpecified) state.sort = defaultSortFor(state);
  const canonicalState = normalizeForSerialization(state);
  const canonicalRoute = serializePuzzleRouteState(canonicalState);

  return {
    state: canonicalState,
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
