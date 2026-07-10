import type {
  GameFilterFacet,
  GameFilterProjection,
  GameFilterQuery,
  GameFilterRecordFamily,
  GameFilterResult,
  GameFilterSort,
  GameFilterSortKey,
  UnsupportedGameFilterFacet,
} from './types';

const DEFAULT_SORT: GameFilterSort = { key: 'id', direction: 'asc' };








export const RESULT_ABSENT_FACET_VALUE = '__result-absent__';
export const DESTINATION_UNSORTED_FACET_VALUE = '__destination-unsorted__';

export interface CompiledGameFilterEvaluator {
  query: GameFilterQuery;
  sort: GameFilterSort;
  queryHash: string;
  matchesIncludingHidden(projection: GameFilterProjection): boolean;
  matchesVisible(projection: GameFilterProjection): boolean;
}

const SUPPORTED_FACETS: Record<GameFilterRecordFamily, ReadonlySet<GameFilterFacet>> = {
  'imported-game': new Set([
    'recordFamily',
    'text',
    'result',
    'player',
    'opponent',
    'color',
    'source',
    'timeClass',
    'opening',
    'eco',
    'playedDate',
    'rating',
    'missedTactic',
    'reviewIssue',
    'analysisState',
    'recentlyAdded',
    'recentlyModified',
  ]),
  'study-item': new Set([
    'recordFamily',
    'text',
    'result',
    'player',
    'source',
    'opening',
    'eco',
    'recentlyAdded',
    'recentlyModified',
    'tags',
    'folders',
    'destination',
    'favorite',
    'hidden',
  ]),
};

export function filterGameProjections(
  projections: readonly GameFilterProjection[],
  query: GameFilterQuery = {},
): GameFilterResult {
  const evaluator = compileGameFilterQuery(query);
  const requestedFacets = requestedFacetSet(evaluator.query);
  const familiesInScope = resolveFamiliesInScope(projections, evaluator.query);
  const unsupportedFacets = resolveUnsupportedFacets(requestedFacets, familiesInScope);
  const unknownFacetCounts = countUnknownFacets(projections, evaluator.query, requestedFacets);

  const matchedIncludingHidden = projections.filter(evaluator.matchesIncludingHidden);
  const visibleMatches = matchedIncludingHidden.filter(evaluator.matchesVisible);
  const sortedMatches = sortProjections(visibleMatches, evaluator.sort);

  return {
    ids: sortedMatches.map(projection => projection.id),
    projections: sortedMatches,
    totalVisible: sortedMatches.length,
    totalMatchedIncludingHidden: matchedIncludingHidden.length,
    unsupportedFacets,
    unknownFacetCounts,
    queryHash: evaluator.queryHash,
    sort: evaluator.sort,
    runner: 'memory',
  };
}

export function compileGameFilterQuery(
  query: GameFilterQuery = {},
): CompiledGameFilterEvaluator {
  const sort = resolveSort(query.sort);
  const normalizedQuery = canonicalizeGameFilterQuery(query, sort);
  return {
    query: normalizedQuery,
    sort,
    queryHash: stableQueryHash(normalizedQuery, sort),
    matchesIncludingHidden: projection =>
      matchesProjection(projection, normalizedQuery, { includeHiddenGate: false }),
    matchesVisible: projection =>
      matchesProjection(projection, normalizedQuery, { includeHiddenGate: true }),
  };
}

function canonicalizeGameFilterQuery(
  query: GameFilterQuery,
  sort: GameFilterSort,
): GameFilterQuery {
  return stableValue({
    ...query,
    playedDate: canonicalizeRange(query.playedDate),
    opponentRating: canonicalizeRange(query.opponentRating),
    recentlyAdded: canonicalizeRange(query.recentlyAdded),
    recentlyModified: canonicalizeRange(query.recentlyModified),
    sort,
  }) as GameFilterQuery;
}

function canonicalizeRange(
  range: { from?: number; to?: number } | undefined,
): { from?: number; to?: number } | undefined {
  if (!range) return undefined;
  const from = range.from !== undefined && Number.isFinite(range.from) ? range.from : undefined;
  const to = range.to !== undefined && Number.isFinite(range.to) ? range.to : undefined;
  if (from === undefined && to === undefined) return undefined;
  return {
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
}

export function namespaceGameFilterId(projection: Pick<GameFilterProjection, 'family' | 'id'>): string {
  return projection.family === 'imported-game'
    ? `imported:${projection.id}`
    : `study:${projection.id}`;
}

function matchesProjection(
  projection: GameFilterProjection,
  query: GameFilterQuery,
  options: { includeHiddenGate: boolean },
): boolean {
  if (options.includeHiddenGate && !matchesHiddenMode(projection, query.hiddenMode ?? 'exclude')) return false;
  if (!matchesFamily(projection, query.recordFamilies)) return false;
  if (!matchesText(projection, query.text)) return false;
  if (!matchesTextAny(projection, query.textAny)) return false;
  if (!matchesResultFacet(projection, query.results)) return false;
  if (!matchesPlayersFacet(projection, query.players)) return false;
  if (!matchesContainsFacet(projection.opponentName, query.opponents, 'opponent', projection.family)) return false;
  if (!matchesStringFacet(projection.userColor, query.colors, 'color', projection.family)) return false;
  if (!matchesStringFacet(projection.source, query.sources, 'source', projection.family)) return false;
  if (!matchesStringFacet(projection.timeClass, query.timeClasses, 'timeClass', projection.family)) return false;
  if (!matchesContainsFacet(projection.opening, query.openings, 'opening', projection.family)) return false;
  if (!matchesPrefixFacet(projection.eco, query.ecos, 'eco', projection.family)) return false;
  if (!matchesRangeFacet(projection.playedAt, query.playedDate, 'playedDate', projection.family)) return false;
  if (!matchesRangeFacet(projection.opponentRating, query.opponentRating, 'rating', projection.family)) return false;
  if (!matchesArrayFacet(projection.missedTacticSeverities, query.missedTactics, 'missedTactic', projection.family)) return false;
  if (!matchesStringFacet(projection.reviewIssueState, query.reviewIssues, 'reviewIssue', projection.family)) return false;
  if (!matchesStringFacet(projection.analysisState, query.analysisStates, 'analysisState', projection.family)) return false;
  if (!matchesRangeFacet(projection.addedAt, query.recentlyAdded, 'recentlyAdded', projection.family)) return false;
  if (!matchesRangeFacet(projection.modifiedAt, query.recentlyModified, 'recentlyModified', projection.family)) return false;
  if (!matchesArrayFacet(projection.tags, query.tags, 'tags', projection.family)) return false;
  if (!matchesArrayFacet(projection.folderIds, query.folders, 'folders', projection.family, projection.homeFolderId)) return false;
  if (!matchesStringFacet(projection.destination, query.destinations, 'destination', projection.family, DESTINATION_UNSORTED_FACET_VALUE)) return false;
  if (!matchesBooleanFacet(projection.favorite, query.favorite, 'favorite', projection.family)) return false;
  return true;
}

function matchesFamily(projection: GameFilterProjection, families: readonly GameFilterRecordFamily[] | undefined): boolean {
  return !families?.length || families.includes(projection.family);
}

function matchesText(projection: GameFilterProjection, text: string | undefined): boolean {
  const tokens = normalizeTokens(text);
  if (!tokens.length) return true;
  const haystack = [
    projection.title,
    ...(projection.playerNames ?? []),
    projection.white,
    projection.black,
    projection.opponentName,
    projection.opening,
    projection.eco,
    projection.result,
    projection.source,
    projection.pgn,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return tokens.every(token => haystack.includes(token));
}

function matchesTextAny(projection: GameFilterProjection, text: string | undefined): boolean {
  const needle = text?.trim().toLowerCase();
  if (!needle) return true;
  if (!facetSupported(projection.family, 'text')) return false;
  const haystacks = projection.textAnyValues !== undefined
    ? projection.textAnyValues
    : [
        projection.title,
        ...(projection.playerNames ?? []),
        projection.white,
        projection.black,
        projection.opponentName,
        projection.opening,
        projection.eco,
        projection.result,
        projection.source,
        projection.pgn,
      ];
  return haystacks
    .filter((value): value is string => Boolean(value))
    .some(value => value.toLowerCase().includes(needle));
}

function matchesResultFacet(
  projection: GameFilterProjection,
  requested: readonly string[] | undefined,
): boolean {
  if (!requested?.length) return true;
  if (!facetSupported(projection.family, 'result')) return false;
  const values = [projection.result, projection.ownerResult]
    .filter((value): value is string => Boolean(value))
    .map(value => value.toLowerCase());
  // Absent result (no PGN outcome, no owner result): matches only when the caller explicitly
  // requested the "Unknown" sentinel (IMP-2a). Otherwise unchanged — an absent result matches nothing.
  if (!values.length) return requested.includes(RESULT_ABSENT_FACET_VALUE);
  return requested.some(candidate =>
    candidate !== RESULT_ABSENT_FACET_VALUE && values.includes(candidate.toLowerCase()));
}

function matchesPlayersFacet(
  projection: GameFilterProjection,
  requested: readonly string[] | undefined,
): boolean {
  if (!requested?.length) return true;
  if (!facetSupported(projection.family, 'player')) return false;
  const candidates = [
    ...(projection.playerNames ?? []),
    projection.white,
    projection.black,
    projection.opponentName,
  ]
    .filter((value): value is string => Boolean(value))
    .map(value => value.toLowerCase());
  if (!candidates.length) return false;
  return requested.some(value => {
    const normalized = value.toLowerCase();
    return candidates.some(candidate => candidate.includes(normalized));
  });
}

function matchesStringFacet(
  value: string | undefined,
  requested: readonly string[] | undefined,
  facet: GameFilterFacet,
  family: GameFilterRecordFamily,
  absentSentinel?: string,
): boolean {
  if (!requested?.length) return true;
  if (!facetSupported(family, facet)) return false;
  // Absent value: matches only when the caller opted into an absent/"Unsorted" sentinel for this
  // facet AND requested it (IMP-2a). Call sites that pass no sentinel keep the exact prior behavior
  // (`absentSentinel === undefined` → an absent value matches nothing).
  if (!value) return absentSentinel !== undefined && requested.includes(absentSentinel);
  const normalizedValue = value.toLowerCase();
  return requested.some(candidate =>
    candidate !== absentSentinel && candidate.toLowerCase() === normalizedValue);
}

function matchesContainsFacet(
  value: string | undefined,
  requested: readonly string[] | undefined,
  facet: GameFilterFacet,
  family: GameFilterRecordFamily,
): boolean {
  if (!requested?.length) return true;
  if (!facetSupported(family, facet)) return false;
  if (!value) return false;
  const normalizedValue = value.toLowerCase();
  return requested.some(candidate => normalizedValue.includes(candidate.toLowerCase()));
}

function matchesPrefixFacet(
  value: string | undefined,
  requested: readonly string[] | undefined,
  facet: GameFilterFacet,
  family: GameFilterRecordFamily,
): boolean {
  if (!requested?.length) return true;
  if (!facetSupported(family, facet)) return false;
  if (!value) return false;
  const normalizedValue = value.toLowerCase();
  return requested.some(candidate => normalizedValue.startsWith(candidate.toLowerCase()));
}

function matchesArrayFacet(
  values: readonly string[] | undefined,
  requested: readonly string[] | undefined,
  facet: GameFilterFacet,
  family: GameFilterRecordFamily,
  extraValue?: string | null,
): boolean {
  if (!requested?.length) return true;
  if (!facetSupported(family, facet)) return false;
  const candidates = [...(values ?? []), ...(extraValue ? [extraValue] : [])].map(value => value.toLowerCase());
  if (!candidates.length) return false;
  return requested.some(value => candidates.includes(value.toLowerCase()));
}

function matchesRangeFacet(
  value: number | undefined,
  range: { from?: number; to?: number } | undefined,
  facet: GameFilterFacet,
  family: GameFilterRecordFamily,
): boolean {
  if (!range || (range.from === undefined && range.to === undefined)) return true;
  if (!facetSupported(family, facet)) return false;
  if (value === undefined) return false;
  if (range.from !== undefined && value < range.from) return false;
  if (range.to !== undefined && value > range.to) return false;
  return true;
}

function matchesBooleanFacet(
  value: boolean | undefined,
  requested: boolean | undefined,
  facet: GameFilterFacet,
  family: GameFilterRecordFamily,
): boolean {
  if (requested === undefined) return true;
  if (!facetSupported(family, facet)) return false;
  return value === requested;
}

function matchesHiddenMode(projection: GameFilterProjection, hiddenMode: 'exclude' | 'include' | 'only'): boolean {
  if (hiddenMode === 'include') return true;
  const hidden = projection.family === 'study-item' && projection.hidden === true;
  return hiddenMode === 'only' ? hidden : !hidden;
}

function sortProjections(projections: readonly GameFilterProjection[], sort: GameFilterSort): GameFilterProjection[] {
  return projections
    .map((projection, index) => ({ projection, index }))
    .sort((left, right) => {
      const leftValue = sortValue(left.projection, sort.key);
      const rightValue = sortValue(right.projection, sort.key);
      const comparison = compareSortValues(leftValue, rightValue, sort.key);
      const hasMissingValue = leftValue === undefined || rightValue === undefined;
      const directed = hasMissingValue && !missingValueFollowsDirection(sort.key)
        ? comparison
        : sort.direction === 'desc' ? -comparison : comparison;
      const tied = sort.key === 'playedAt'
        ? comparePlayedDateTiebreaker(left.projection, right.projection, sort.direction)
        : 0;
      return directed || tied || left.index - right.index;
    })
    .map(entry => entry.projection);
}

function sortValue(projection: GameFilterProjection, key: GameFilterSortKey): string | number | boolean | undefined {
  return projection[key];
}

function compareSortValues(
  left: string | number | boolean | undefined,
  right: string | number | boolean | undefined,
  key: GameFilterSortKey,
): number {
  if (key === 'ownerResult') return ownerResultOrder(left) - ownerResultOrder(right);
  if (key === 'opponentName' || key === 'timeClass') {
    return String(left ?? '').localeCompare(String(right ?? ''));
  }
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function missingValueFollowsDirection(key: GameFilterSortKey): boolean {
  return key === 'opponentName' || key === 'timeClass' || key === 'ownerResult';
}

function ownerResultOrder(value: string | number | boolean | undefined): number {
  return value === 'win' ? 0 : value === 'draw' ? 1 : value === 'loss' ? 2 : 3;
}

function comparePlayedDateTiebreaker(
  left: GameFilterProjection,
  right: GameFilterProjection,
  direction: 'asc' | 'desc',
): number {
  const leftAdded = left.addedAt ?? 0;
  const rightAdded = right.addedAt ?? 0;
  if (leftAdded !== rightAdded) {
    return direction === 'desc' ? rightAdded - leftAdded : leftAdded - rightAdded;
  }
  return left.id.localeCompare(right.id);
}

function resolveSort(sort: Partial<GameFilterSort> | undefined): GameFilterSort {
  return {
    key: sort?.key ?? DEFAULT_SORT.key,
    direction: sort?.direction ?? DEFAULT_SORT.direction,
  };
}

function requestedFacetSet(query: GameFilterQuery): Set<GameFilterFacet> {
  const facets = new Set<GameFilterFacet>();
  if (query.recordFamilies?.length) facets.add('recordFamily');
  if (normalizeTokens(query.text).length || query.textAny?.trim()) facets.add('text');
  if (query.results?.length) facets.add('result');
  if (query.players?.length) facets.add('player');
  if (query.opponents?.length) facets.add('opponent');
  if (query.colors?.length) facets.add('color');
  if (query.sources?.length) facets.add('source');
  if (query.timeClasses?.length) facets.add('timeClass');
  if (query.openings?.length) facets.add('opening');
  if (query.ecos?.length) facets.add('eco');
  if (hasRange(query.playedDate)) facets.add('playedDate');
  if (hasRange(query.opponentRating)) facets.add('rating');
  if (query.missedTactics?.length) facets.add('missedTactic');
  if (query.reviewIssues?.length) facets.add('reviewIssue');
  if (query.analysisStates?.length) facets.add('analysisState');
  if (hasRange(query.recentlyAdded)) facets.add('recentlyAdded');
  if (hasRange(query.recentlyModified)) facets.add('recentlyModified');
  if (query.tags?.length) facets.add('tags');
  if (query.folders?.length) facets.add('folders');
  if (query.destinations?.length) facets.add('destination');
  if (query.favorite !== undefined) facets.add('favorite');
  if (query.hiddenMode === 'only') facets.add('hidden');
  return facets;
}

function resolveFamiliesInScope(
  projections: readonly GameFilterProjection[],
  query: GameFilterQuery,
): GameFilterRecordFamily[] {
  if (query.recordFamilies?.length) return Array.from(new Set(query.recordFamilies)).sort();
  return Array.from(new Set(projections.map(projection => projection.family))).sort();
}

function resolveUnsupportedFacets(
  facets: ReadonlySet<GameFilterFacet>,
  families: readonly GameFilterRecordFamily[],
): UnsupportedGameFilterFacet[] {
  const unsupported: UnsupportedGameFilterFacet[] = [];
  for (const facet of facets) {
    for (const family of families) {
      if (!facetSupported(family, facet)) unsupported.push({ facet, family });
    }
  }
  return unsupported;
}

function countUnknownFacets(
  projections: readonly GameFilterProjection[],
  query: GameFilterQuery,
  facets: ReadonlySet<GameFilterFacet>,
): Partial<Record<GameFilterFacet, number>> {
  const counts: Partial<Record<GameFilterFacet, number>> = {};
  const familyFiltered = projections.filter(projection => matchesFamily(projection, query.recordFamilies));

  for (const facet of facets) {
    for (const projection of familyFiltered) {
      if (!facetSupported(projection.family, facet)) continue;
      if (!facetHasData(projection, facet)) counts[facet] = (counts[facet] ?? 0) + 1;
    }
  }

  return counts;
}

function facetHasData(projection: GameFilterProjection, facet: GameFilterFacet): boolean {
  switch (facet) {
    case 'recordFamily':
    case 'text':
    case 'hidden':
      return true;
    case 'result':
      return Boolean(projection.result || projection.ownerResult);
    case 'player':
      return Boolean(projection.playerNames?.length || projection.white || projection.black || projection.opponentName);
    case 'opponent':
      return Boolean(projection.opponentName);
    case 'color':
      return Boolean(projection.userColor);
    case 'source':
      return Boolean(projection.source);
    case 'timeClass':
      return Boolean(projection.timeClass);
    case 'opening':
      return Boolean(projection.opening);
    case 'eco':
      return Boolean(projection.eco);
    case 'playedDate':
      return projection.playedAt !== undefined;
    case 'rating':
      return projection.opponentRating !== undefined;
    case 'missedTactic':
      return Boolean(projection.missedTacticSeverities?.length);
    case 'reviewIssue':
      return Boolean(projection.reviewIssueState);
    case 'analysisState':
      return Boolean(projection.analysisState);
    case 'recentlyAdded':
      return projection.addedAt !== undefined;
    case 'recentlyModified':
      return projection.modifiedAt !== undefined;
    case 'tags':
      return Boolean(projection.tags?.length);
    case 'folders':
      return Boolean(projection.folderIds?.length || projection.homeFolderId);
    case 'destination':
      return Boolean(projection.destination);
    case 'favorite':
      return projection.favorite !== undefined;
  }
}

function facetSupported(family: GameFilterRecordFamily, facet: GameFilterFacet): boolean {
  return SUPPORTED_FACETS[family].has(facet);
}

function stableQueryHash(query: GameFilterQuery, sort: GameFilterSort): string {
  return `game-filter:${JSON.stringify(stableValue({ ...query, sort }))}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, stableValue(entryValue)]),
  );
}

function hasRange(range: { from?: number; to?: number } | undefined): boolean {
  return range !== undefined && (range.from !== undefined || range.to !== undefined);
}

function normalizeTokens(text: string | undefined): string[] {
  return text
    ? text
        .toLowerCase()
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean)
    : [];
}
