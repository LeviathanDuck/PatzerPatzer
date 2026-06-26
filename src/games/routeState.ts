export type GamesRouteResult = 'win' | 'loss' | 'draw';
export type GamesRouteSpeed = 'bullet' | 'blitz' | 'rapid';
export type GamesRouteColor = '' | 'white' | 'black';
export type GamesRouteMiss = '!' | '!!' | '!!!' | 'M?!';
export type GamesRouteReview = 'all' | 'failed-skipped';
export type GamesRouteSortField = 'date' | 'result' | 'opponent' | 'timeClass';
export type GamesRouteSortDirection = 'asc' | 'desc';
export type GamesRouteAccountOverride =
  | { mode: 'all' }
  | { mode: 'custom'; includeMine: boolean; accountIds: string[] };

export type GamesRouteAccountSource = 'saved-default' | 'route-override';
export type GamesRouteDuplicatePolicy = 'last' | 'merge' | 'ignored';

export interface GamesRouteSort {
  field: GamesRouteSortField;
  direction: GamesRouteSortDirection;
}

export interface GamesRouteState {
  accountOverride: GamesRouteAccountOverride | null;
  accountSource: GamesRouteAccountSource;
  results: GamesRouteResult[];
  speeds: GamesRouteSpeed[];
  opponent: string;
  opening: string;
  color: GamesRouteColor;
  misses: GamesRouteMiss[];
  review: GamesRouteReview;
  sort: GamesRouteSort;
  page: number;
}

export interface GamesRouteInvalidParam {
  field: GamesRouteField;
  value: string;
  fallback: string;
  reason: string;
}

export interface GamesRouteIgnoredParam {
  field: string;
  values: string[];
}

export interface GamesRouteDuplicateParam {
  field: string;
  values: string[];
  chosenValue?: string;
  policy: GamesRouteDuplicatePolicy;
}

export interface GamesRouteCanonicalization {
  hadUnknownParams: boolean;
  hadDuplicateParams: boolean;
  hadInvalidParams: boolean;
  canonicalRoute: string;
}

export interface GamesRouteStateParseOptions {
  validAccountIds?: Iterable<string>;
}

export interface GamesRouteStateParseResult {
  state: GamesRouteState;
  invalidParams: GamesRouteInvalidParam[];
  ignoredParams: GamesRouteIgnoredParam[];
  duplicateParams: GamesRouteDuplicateParam[];
  canonical: GamesRouteCanonicalization;
}

export interface GamesRoutePageResolution {
  requestedPage: number;
  resolvedPage: number;
  internalPageIndex: number;
  totalPages: number;
  status: 'default' | 'exact' | 'invalid' | 'clamped';
  canonicalRoute: string;
}

export interface GamesRouteViewStateApplication {
  results: GamesRouteResult[];
  speeds: GamesRouteSpeed[];
  opponent: string;
  opening: string;
  color: GamesRouteColor;
  misses: GamesRouteMiss[];
  review: GamesRouteReview;
  sort: GamesRouteSort;
  pageIndex: number;
  accountOverride: GamesRouteAccountOverride | null;
  accountSource: GamesRouteAccountSource;
}

export type GamesRouteField =
  | 'lens'
  | 'includeMine'
  | 'accounts'
  | 'results'
  | 'speeds'
  | 'opponent'
  | 'opening'
  | 'color'
  | 'misses'
  | 'review'
  | 'sort'
  | 'page';

const GAMES_ROUTE = '#/games';
const SEARCH_MAX_LENGTH = 80;
const ACCOUNT_ID_MAX_LENGTH = 128;
const ACCOUNT_ID_MAX_COUNT = 20;
const URL_WARNING_LENGTH = 1500;

const DEFAULT_STATE: GamesRouteState = {
  accountOverride: null,
  accountSource:   'saved-default',
  results:         [],
  speeds:          [],
  opponent:        '',
  opening:         '',
  color:           '',
  misses:          [],
  review:          'all',
  sort:            { field: 'date', direction: 'desc' },
  page:            1,
};

const PARAM_ORDER: readonly GamesRouteField[] = [
  'lens',
  'includeMine',
  'accounts',
  'results',
  'speeds',
  'opponent',
  'opening',
  'color',
  'misses',
  'review',
  'sort',
  'page',
];

const KNOWN_PARAMS = new Set<GamesRouteField>(PARAM_ORDER);
const RESULT_ORDER: readonly GamesRouteResult[] = ['win', 'loss', 'draw'];
const SPEED_ORDER: readonly GamesRouteSpeed[] = ['bullet', 'blitz', 'rapid'];
const MISS_ORDER: readonly GamesRouteMiss[] = ['!', '!!', '!!!', 'M?!'];
const SORT_FIELDS = new Set<GamesRouteSortField>(['date', 'result', 'opponent', 'timeClass']);
const SORT_DIRECTIONS = new Set<GamesRouteSortDirection>(['asc', 'desc']);

function queryFromInput(input: string): string {
  if (input === GAMES_ROUTE) return '';
  if (input.startsWith(`${GAMES_ROUTE}?`)) return input.slice(GAMES_ROUTE.length + 1);
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

function invalid(field: GamesRouteField, value: string, fallback: string, reason: string): GamesRouteInvalidParam {
  return { field, value, fallback, reason };
}

function lastValue(
  grouped: Map<string, string[]>,
  field: GamesRouteField,
  duplicateParams: GamesRouteDuplicateParam[],
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
  field: 'opponent' | 'opening',
  duplicateParams: GamesRouteDuplicateParam[],
): string | null {
  const values = grouped.get(field);
  if (!values || values.length === 0) return null;
  const chosenValue = [...values].reverse().find(value => value.trim()) ?? values[values.length - 1] ?? '';
  if (values.length > 1) {
    duplicateParams.push({ field, values: [...values], chosenValue, policy: 'last' });
  }
  return chosenValue;
}

function mergedValues(
  grouped: Map<string, string[]>,
  field: GamesRouteField,
  duplicateParams: GamesRouteDuplicateParam[],
): string[] {
  const values = grouped.get(field) ?? [];
  if (values.length > 1) duplicateParams.push({ field, values: [...values], policy: 'merge' });
  return values;
}

function parseOrderedList<T extends string>(
  field: GamesRouteField,
  values: readonly string[],
  order: readonly T[],
  invalidParams: GamesRouteInvalidParam[],
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

function looksPayloadLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[{\[]/.test(trimmed)) return true;
  if (/[\r\n]/.test(trimmed)) return true;
  if (/\b(FEN|PGN|Event|Site|Date)\b/i.test(trimmed)) return true;
  if (/^(1\.\s|\*)/.test(trimmed)) return true;
  return false;
}

function parseSearchValue(
  grouped: Map<string, string[]>,
  field: 'opponent' | 'opening',
  invalidParams: GamesRouteInvalidParam[],
  duplicateParams: GamesRouteDuplicateParam[],
): string {
  const value = lastNonEmptyValue(grouped, field, duplicateParams);
  if (value === null) return '';
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length > SEARCH_MAX_LENGTH) {
    invalidParams.push(invalid(field, value, '', 'too-long'));
    return '';
  }
  if (looksPayloadLike(normalized)) {
    invalidParams.push(invalid(field, value, '', 'payload-like'));
    return '';
  }
  return normalized;
}

function serializeSearchValue(value: string | undefined): string {
  const normalized = (value ?? '').trim();
  if (!normalized) return '';
  if (normalized.length > SEARCH_MAX_LENGTH) return '';
  if (looksPayloadLike(normalized)) return '';
  return normalized;
}

function parseColor(value: string | null, invalidParams: GamesRouteInvalidParam[]): GamesRouteColor {
  if (value === null || value === '') return '';
  if (value === 'white' || value === 'black') return value;
  invalidParams.push(invalid('color', value, 'all', 'invalid-value'));
  return '';
}

function parseReview(value: string | null, invalidParams: GamesRouteInvalidParam[]): GamesRouteReview {
  if (value === null || value === '') return 'all';
  if (value === 'failed-skipped') return value;
  invalidParams.push(invalid('review', value, 'all', 'invalid-value'));
  return 'all';
}

function parseSort(value: string | null, invalidParams: GamesRouteInvalidParam[]): GamesRouteSort {
  if (value === null || value === '') return { ...DEFAULT_STATE.sort };
  const [field, direction, extra] = value.split('.');
  if (
    !extra
    && SORT_FIELDS.has(field as GamesRouteSortField)
    && SORT_DIRECTIONS.has(direction as GamesRouteSortDirection)
  ) {
    return { field: field as GamesRouteSortField, direction: direction as GamesRouteSortDirection };
  }
  invalidParams.push(invalid('sort', value, 'date.desc', 'invalid-value'));
  return { ...DEFAULT_STATE.sort };
}

function parsePage(value: string | null, invalidParams: GamesRouteInvalidParam[]): number {
  if (value === null || value === '') return 1;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    invalidParams.push(invalid('page', value, '1', 'malformed'));
    return 1;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    invalidParams.push(invalid('page', value, '1', 'out-of-range'));
    return 1;
  }
  return parsed;
}

function parseIncludeMine(value: string): boolean | null {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return null;
}

function isSafeAccountId(value: string): boolean {
  if (!value || value.length > ACCOUNT_ID_MAX_LENGTH) return false;
  if (looksPayloadLike(value)) return false;
  return /^[A-Za-z0-9._:-]+$/.test(value);
}

function normalizeAccounts(
  grouped: Map<string, string[]>,
  validAccountIds: Set<string> | null,
  invalidParams: GamesRouteInvalidParam[],
  duplicateParams: GamesRouteDuplicateParam[],
): string[] {
  const seen = new Set<string>();
  const accountIds: string[] = [];
  const values = mergedValues(grouped, 'accounts', duplicateParams);
  for (const value of values) {
    for (const token of value.split(',')) {
      const id = token.trim();
      if (!id) continue;
      if (!isSafeAccountId(id)) {
        invalidParams.push(invalid('accounts', id, 'omitted', 'invalid-id'));
        continue;
      }
      if (validAccountIds && !validAccountIds.has(id)) {
        invalidParams.push(invalid('accounts', id, 'omitted', 'unknown-account'));
        continue;
      }
      if (!seen.has(id) && accountIds.length < ACCOUNT_ID_MAX_COUNT) {
        seen.add(id);
        accountIds.push(id);
      }
    }
  }
  return accountIds;
}

function parseAccountOverride(
  grouped: Map<string, string[]>,
  invalidParams: GamesRouteInvalidParam[],
  duplicateParams: GamesRouteDuplicateParam[],
  opts: GamesRouteStateParseOptions,
): { override: GamesRouteAccountOverride | null; source: GamesRouteAccountSource } {
  const lens = lastValue(grouped, 'lens', duplicateParams);
  const includeMineValue = lastValue(grouped, 'includeMine', duplicateParams);
  const validAccountIds = opts.validAccountIds ? new Set(opts.validAccountIds) : null;

  if (lens !== null) {
    if (lens === 'all') {
      if (grouped.has('includeMine')) {
        duplicateParams.push({ field: 'includeMine', values: grouped.get('includeMine') ?? [], policy: 'ignored' });
      }
      if (grouped.has('accounts')) {
        duplicateParams.push({ field: 'accounts', values: grouped.get('accounts') ?? [], policy: 'ignored' });
      }
      return { override: { mode: 'all' }, source: 'route-override' };
    }
    invalidParams.push(invalid('lens', lens, 'saved-default', 'invalid-value'));
  }

  const hasCustomRouteState = grouped.has('includeMine') || grouped.has('accounts');
  if (!hasCustomRouteState) return { override: null, source: 'saved-default' };

  let includeMine = true;
  if (includeMineValue !== null) {
    const parsed = parseIncludeMine(includeMineValue);
    if (parsed === null) invalidParams.push(invalid('includeMine', includeMineValue, '1', 'invalid-value'));
    else includeMine = parsed;
  }

  const accountIds = normalizeAccounts(grouped, validAccountIds, invalidParams, duplicateParams);
  if (!includeMine && accountIds.length === 0) includeMine = true;
  return {
    override: { mode: 'custom', includeMine, accountIds },
    source:   'route-override',
  };
}

function encodeRouteValue(value: string): string {
  return encodeURIComponent(value).replace(/!/g, '%21').replace(/%2C/gi, ',');
}

function appendParam(params: string[], field: GamesRouteField, value: string): void {
  params.push(`${field}=${encodeRouteValue(value)}`);
}

export function serializeGamesRouteState(state: Partial<GamesRouteState>): string {
  const next: GamesRouteState = {
    ...DEFAULT_STATE,
    ...state,
    sort: {
      ...DEFAULT_STATE.sort,
      ...(state.sort ?? {}),
    },
    results: state.results ? [...state.results] : [],
    speeds:  state.speeds ? [...state.speeds] : [],
    misses:  state.misses ? [...state.misses] : [],
  };
  const params: string[] = [];

  if (next.accountOverride?.mode === 'all') {
    appendParam(params, 'lens', 'all');
  } else if (next.accountOverride?.mode === 'custom') {
    appendParam(params, 'includeMine', next.accountOverride.includeMine ? '1' : '0');
    const accountIds = next.accountOverride.accountIds.filter(isSafeAccountId).slice(0, ACCOUNT_ID_MAX_COUNT);
    if (accountIds.length > 0) appendParam(params, 'accounts', accountIds.join(','));
  }

  const results = RESULT_ORDER.filter(result => next.results.includes(result));
  if (results.length > 0) appendParam(params, 'results', results.join(','));
  const speeds = SPEED_ORDER.filter(speed => next.speeds.includes(speed));
  if (speeds.length > 0) appendParam(params, 'speeds', speeds.join(','));
  const opponent = serializeSearchValue(next.opponent);
  if (opponent) appendParam(params, 'opponent', opponent);
  const opening = serializeSearchValue(next.opening);
  if (opening) appendParam(params, 'opening', opening);
  if (next.color) appendParam(params, 'color', next.color);
  const misses = MISS_ORDER.filter(miss => next.misses.includes(miss));
  if (misses.length > 0) appendParam(params, 'misses', misses.join(','));
  if (next.review !== 'all') appendParam(params, 'review', next.review);
  if (next.sort.field !== DEFAULT_STATE.sort.field || next.sort.direction !== DEFAULT_STATE.sort.direction) {
    appendParam(params, 'sort', `${next.sort.field}.${next.sort.direction}`);
  }
  if (Number.isSafeInteger(next.page) && next.page > 1) appendParam(params, 'page', String(next.page));

  const query = params.join('&');
  const route = `${GAMES_ROUTE}${query ? `?${query}` : ''}`;
  return route.length <= URL_WARNING_LENGTH ? route : GAMES_ROUTE;
}

export function parseGamesRouteState(input: string, opts: GamesRouteStateParseOptions = {}): GamesRouteStateParseResult {
  const grouped = groupedQueryParams(input);
  const invalidParams: GamesRouteInvalidParam[] = [];
  const ignoredParams: GamesRouteIgnoredParam[] = [];
  const duplicateParams: GamesRouteDuplicateParam[] = [];

  for (const [field, values] of grouped) {
    if (!KNOWN_PARAMS.has(field as GamesRouteField)) ignoredParams.push({ field, values });
  }

  const account = parseAccountOverride(grouped, invalidParams, duplicateParams, opts);
  const state: GamesRouteState = {
    accountOverride: account.override,
    accountSource:   account.source,
    results:         parseOrderedList('results', mergedValues(grouped, 'results', duplicateParams), RESULT_ORDER, invalidParams),
    speeds:          parseOrderedList('speeds', mergedValues(grouped, 'speeds', duplicateParams), SPEED_ORDER, invalidParams),
    opponent:        parseSearchValue(grouped, 'opponent', invalidParams, duplicateParams),
    opening:         parseSearchValue(grouped, 'opening', invalidParams, duplicateParams),
    color:           parseColor(lastValue(grouped, 'color', duplicateParams), invalidParams),
    misses:          parseOrderedList('misses', mergedValues(grouped, 'misses', duplicateParams), MISS_ORDER, invalidParams),
    review:          parseReview(lastValue(grouped, 'review', duplicateParams), invalidParams),
    sort:            parseSort(lastValue(grouped, 'sort', duplicateParams), invalidParams),
    page:            parsePage(lastValue(grouped, 'page', duplicateParams), invalidParams),
  };
  const canonicalRoute = serializeGamesRouteState(state);

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

export function resolveGamesRoutePage(
  state: GamesRouteState,
  totalPageCount: number,
): GamesRoutePageResolution {
  const totalPages = Math.max(1, Math.floor(totalPageCount));
  const requestedPage = Number.isSafeInteger(state.page) && state.page > 0 ? state.page : 1;
  const resolvedPage = Math.min(Math.max(1, requestedPage), totalPages);
  const status = state.page !== requestedPage
    ? 'invalid'
    : requestedPage === 1
      ? 'default'
      : resolvedPage === requestedPage ? 'exact' : 'clamped';
  return {
    requestedPage,
    resolvedPage,
    internalPageIndex: resolvedPage - 1,
    totalPages,
    status,
    canonicalRoute: serializeGamesRouteState({ ...state, page: resolvedPage }),
  };
}

export function gamesRouteStateToViewApplication(
  state: GamesRouteState,
  resolvedPage?: GamesRoutePageResolution,
): GamesRouteViewStateApplication {
  const pageIndex = resolvedPage?.internalPageIndex ?? Math.max(0, state.page - 1);
  return {
    results: [...state.results],
    speeds: [...state.speeds],
    opponent: state.opponent,
    opening: state.opening,
    color: state.color,
    misses: [...state.misses],
    review: state.review,
    sort: { ...state.sort },
    pageIndex,
    accountOverride: state.accountOverride === null
      ? null
      : state.accountOverride.mode === 'all'
        ? { mode: 'all' }
        : {
            mode: 'custom',
            includeMine: state.accountOverride.includeMine,
            accountIds: [...state.accountOverride.accountIds],
          },
    accountSource: state.accountSource,
  };
}
