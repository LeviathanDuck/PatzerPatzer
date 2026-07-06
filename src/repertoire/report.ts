import type { ImportedGame } from '../import/types';
import type {
  RepertoireDivergenceCategory,
  RepertoireLinePrefixMove,
  RepertoireMatchRecord,
  RepertoireSide,
  RepertoireSource,
} from './index';
import type { San, Uci } from '../tree/types';

export type RepertoireComplianceOutcome = 'win' | 'loss' | 'draw';
export type RepertoireComplianceOwnerColorFilter = 'white' | 'black';
export type RepertoireComplianceDateFilter = 'all' | 'last-30' | 'last-90' | 'last-365' | 'undated';
/**
 * 'owner' (default) counts only divergences that were the owner's own fault
 * (i.e. category !== 'opponent-left'); 'opponent' shows only opponent-left divergences (for
 * inspection/audit, e.g. measuring the false-flag ratio); 'all' restores the pre-T7-A1 blended
 * behavior. See P2-LIB-7 / P2-REP-3 T0 note.
 */
export type RepertoireComplianceCategoryFilter = 'owner' | 'opponent' | 'all';

export interface RepertoireComplianceReportFilters {
  accountId: string | null;
  ownerColor: RepertoireComplianceOwnerColorFilter | null;
  result: RepertoireComplianceOutcome | null;
  timeClass: string | null;
  date: RepertoireComplianceDateFilter;
  category: RepertoireComplianceCategoryFilter;
}

export interface RepertoireComplianceFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface RepertoireComplianceReportFilterOptions {
  accounts: RepertoireComplianceFilterOption[];
  timeClasses: RepertoireComplianceFilterOption[];
  categories: RepertoireComplianceFilterOption[];
}

export interface RepertoireComplianceReportGame {
  gameId: string;
  game: ImportedGame | null;
  outcome: RepertoireComplianceOutcome | null;
  firstDivergencePly: number | null;
  gameDate: string | null;
}

export interface RepertoireComplianceReportGroup {
  key: string;
  sourceId: string;
  sourceName: string;
  sourceSide: RepertoireSide;
  sourceAccentIndex: number;
  ownerColor: 'white' | 'black' | 'mixed';
  category: Exclude<RepertoireDivergenceCategory, null>;
  categoryLabel: string;
  firstDivergencePly: number | null;
  matchedDepthPly: number;
  playedUci: Uci | null;
  missedUci: Uci | null;
  missedSan: San | null;
  linePrefix: RepertoireLinePrefixMove[];
  lineLabel: string;
  seenCount: number;
  lostCount: number;
  nonLossCount: number;
  lossRate: number;
  games: RepertoireComplianceReportGame[];
}

export interface RepertoireComplianceReport {
  groups: RepertoireComplianceReportGroup[];
  studyNextGroups: RepertoireComplianceReportGroup[];
  // T7-A8: the same exact-line grouping as `groups` (Divergences tab), but ranked by the
  // Study-Next score instead of sortGroups's seen/lost/loss-rate order — backs the "Group by:
  // Exact line" toggle so switching grouping never also silently swaps the ranking algorithm.
  studyNextGroupsByLine: RepertoireComplianceReportGroup[];
  filters: RepertoireComplianceReportFilters;
  filterOptions: RepertoireComplianceReportFilterOptions;
  totalDivergenceCount: number;
  filteredDivergenceCount: number;
}

export interface BuildRepertoireComplianceReportInput {
  records: readonly RepertoireMatchRecord[];
  sources: readonly RepertoireSource[];
  games: readonly ImportedGame[];
  filters?: Partial<RepertoireComplianceReportFilters>;
  now?: number;
}

export const DEFAULT_REPERTOIRE_COMPLIANCE_REPORT_FILTERS: RepertoireComplianceReportFilters = {
  accountId: null,
  ownerColor: null,
  result: null,
  timeClass: null,
  date: 'all',
  category: 'owner',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function sourceSort(a: RepertoireSource, b: RepertoireSource): number {
  return a.createdAt - b.createdAt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function normalizedFilters(
  filters: Partial<RepertoireComplianceReportFilters> | undefined,
): RepertoireComplianceReportFilters {
  return {
    ...DEFAULT_REPERTOIRE_COMPLIANCE_REPORT_FILTERS,
    ...(filters ?? {}),
  };
}

export function repertoireDivergenceCategoryLabel(
  category: Exclude<RepertoireDivergenceCategory, null>,
): string {
  if (category === 'owner-left') return 'left repertoire';
  if (category === 'opponent-left') return 'opponent left';
  return 'missed line';
}

export function repertoireComplianceOutcomeFromRecord(
  record: Pick<RepertoireMatchRecord, 'gameResult' | 'ownerColor'>,
): RepertoireComplianceOutcome | null {
  const result = record.gameResult?.trim();
  if (!result || result === '*') return null;
  if (result.includes('1/2')) return 'draw';
  if (record.ownerColor === 'white') {
    if (result === '1-0') return 'win';
    if (result === '0-1') return 'loss';
  } else {
    if (result === '0-1') return 'win';
    if (result === '1-0') return 'loss';
  }
  return null;
}

function normalizeDateString(date: string | null): string | null {
  const value = date?.trim().slice(0, 10).replace(/\./g, '-');
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function dateMs(date: string | null): number | null {
  const normalized = normalizeDateString(date);
  if (!normalized) return null;
  const parsed = Date.parse(`${normalized}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordMatchesDateFilter(record: RepertoireMatchRecord, filter: RepertoireComplianceDateFilter, now: number): boolean {
  if (filter === 'all') return true;
  const playedAt = dateMs(record.gameDate);
  if (filter === 'undated') return playedAt === null;
  if (playedAt === null) return false;
  const days = filter === 'last-30' ? 30 : filter === 'last-90' ? 90 : 365;
  return playedAt >= now - days * DAY_MS;
}

function recordMatchesFilters(
  record: RepertoireMatchRecord,
  filters: RepertoireComplianceReportFilters,
  now: number,
): boolean {
  if (record.status !== 'diverged' || record.category === null) return false;
  if (filters.category === 'owner' && record.category === 'opponent-left') return false;
  if (filters.category === 'opponent' && record.category !== 'opponent-left') return false;
  if (filters.accountId !== null && record.accountId !== filters.accountId) return false;
  if (filters.ownerColor !== null && record.ownerColor !== filters.ownerColor) return false;
  if (filters.result !== null && repertoireComplianceOutcomeFromRecord(record) !== filters.result) return false;
  if (filters.timeClass !== null && record.timeClass !== filters.timeClass) return false;
  return recordMatchesDateFilter(record, filters.date, now);
}

function sourceFallbackAccentIndex(sourceId: string): number {
  let hash = 0;
  for (let i = 0; i < sourceId.length; i += 1) hash = (hash * 31 + sourceId.charCodeAt(i)) >>> 0;
  return hash % 8;
}

function sourceIdentity(
  sourceId: string,
  sourceById: ReadonlyMap<string, { source: RepertoireSource; index: number }>,
): { name: string; side: RepertoireSide; accentIndex: number; order: number } {
  const known = sourceById.get(sourceId);
  if (known) {
    return {
      name: known.source.name,
      side: known.source.side,
      accentIndex: known.index % 8,
      order: known.index,
    };
  }
  return {
    name: sourceId,
    side: 'both',
    accentIndex: sourceFallbackAccentIndex(sourceId),
    order: Number.MAX_SAFE_INTEGER,
  };
}

function accountLabel(accountId: string, games: readonly ImportedGame[]): string {
  const firstGame = games.find(game => game.accountId === accountId);
  const username = firstGame?.importedUsername?.trim();
  const separator = accountId.indexOf(':');
  if (separator > 0) {
    const platform = accountId.slice(0, separator);
    const accountName = accountId.slice(separator + 1);
    return `${username || accountName} (${platform})`;
  }
  return username || accountId;
}

function addOptionCount(map: Map<string, number>, value: string | null): void {
  if (!value) return;
  map.set(value, (map.get(value) ?? 0) + 1);
}

function optionList(
  counts: ReadonlyMap<string, number>,
  labelForValue: (value: string) => string = value => value,
): RepertoireComplianceFilterOption[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labelForValue(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
}

function validLinePrefixMove(move: unknown): move is RepertoireLinePrefixMove {
  if (!move || typeof move !== 'object') return false;
  const candidate = move as Partial<RepertoireLinePrefixMove>;
  return Number.isFinite(candidate.ply)
    && typeof candidate.san === 'string'
    && candidate.san.trim() !== ''
    && typeof candidate.uci === 'string'
    && candidate.uci.trim() !== '';
}

function recordLinePrefix(record: RepertoireMatchRecord): RepertoireLinePrefixMove[] {
  return Array.isArray(record.linePrefix)
    ? record.linePrefix.filter(validLinePrefixMove).map(move => ({
        ply: move.ply,
        san: move.san,
        uci: move.uci,
      }))
    : [];
}

function lineMoveLabel(move: RepertoireLinePrefixMove, isFirst: boolean): string {
  const turn = Math.ceil(move.ply / 2);
  const prefix = move.ply % 2 === 1 ? `${turn}.` : isFirst ? `${turn}...` : '';
  return `${prefix}${move.san}`;
}

function linePrefixText(linePrefix: readonly RepertoireLinePrefixMove[]): string {
  return linePrefix.map((move, index) => lineMoveLabel(move, index === 0)).join(' ');
}

function linePrefixIdentity(record: RepertoireMatchRecord): string {
  const linePrefix = recordLinePrefix(record);
  if (linePrefix.length === 0) return 'legacy';
  return linePrefix
    .map(move => `${move.ply}:${move.uci}:${move.san}`)
    .join('|');
}

function categoryFilterOptionLabel(value: string): string {
  return value === 'opponent' ? 'Opponent' : 'Your divergences';
}

function buildFilterOptions(
  records: readonly RepertoireMatchRecord[],
  games: readonly ImportedGame[],
): RepertoireComplianceReportFilterOptions {
  const accountCounts = new Map<string, number>();
  const timeClassCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const record of records) {
    if (record.status !== 'diverged' || record.category === null) continue;
    addOptionCount(accountCounts, record.accountId);
    addOptionCount(timeClassCounts, record.timeClass);
    addOptionCount(categoryCounts, record.category === 'opponent-left' ? 'opponent' : 'owner');
  }
  return {
    accounts: optionList(accountCounts, value => accountLabel(value, games)),
    timeClasses: optionList(timeClassCounts, value => value.charAt(0).toUpperCase() + value.slice(1)),
    categories: optionList(categoryCounts, categoryFilterOptionLabel),
  };
}

function groupKey(record: RepertoireMatchRecord): string {
  return [
    record.sourceId,
    record.category ?? 'unknown',
    linePrefixIdentity(record),
    record.firstDivergencePly ?? 'na',
    record.matchedDepthPly,
    record.playedUci ?? '-',
    record.missedUci ?? '-',
  ].join('::');
}

// T7-A8 (Audit C F16, consumption half): a position-first key for the Study-Next tab only, so a
// recurring mistake reached via two different move orders (a transposition) accumulates into ONE
// row instead of fragmenting across each move order's own linePrefixIdentity, which dilutes
// repertoireStudyNextScore = seenCount * lostCount. Keeps sourceId + category (so unrelated
// sources/categories never merge) but DROPS firstDivergencePly/matchedDepthPly relative to
// groupKey: two records reaching the identical divergence position via move orders of different
// length can legitimately carry different values for those two fields, so keeping either would
// defeat exactly the transposition merge this key exists to produce. The `??` fallback to
// linePrefixIdentity keeps pre-A7 records (scanned before divergencePositionKey existed) grouping
// exactly as they do today instead of silently disappearing or over-merging. groupKey above
// (Divergences tab) is intentionally left untouched.
function studyNextGroupKey(record: RepertoireMatchRecord): string {
  return [
    record.sourceId,
    record.category ?? 'unknown',
    record.divergencePositionKey ?? linePrefixIdentity(record),
    record.playedUci ?? '-',
    record.missedUci ?? '-',
  ].join('::');
}

function lineLabel(params: {
  sourceName: string;
  categoryLabel: string;
  firstDivergencePly: number | null;
  playedUci: Uci | null;
  missedUci: Uci | null;
  missedSan: San | null;
  linePrefix: readonly RepertoireLinePrefixMove[];
}): string {
  const line = linePrefixText(params.linePrefix);
  if (line) {
    const missed = params.missedSan ?? params.missedUci ?? '?';
    return `${line} - ${params.categoryLabel} - expected ${missed}`;
  }
  const plyLabel = params.firstDivergencePly === null ? 'ply ?' : `ply ${params.firstDivergencePly}`;
  const played = params.playedUci ? `played ${params.playedUci}` : 'played ?';
  const missed = params.missedUci ? `expected ${params.missedUci}` : 'expected ?';
  return `${params.sourceName} - ${params.categoryLabel} - ${plyLabel} - ${played} - ${missed}`;
}

function sortReportGames(a: RepertoireComplianceReportGame, b: RepertoireComplianceReportGame): number {
  const aDate = dateMs(a.gameDate) ?? 0;
  const bDate = dateMs(b.gameDate) ?? 0;
  return bDate - aDate || a.gameId.localeCompare(b.gameId);
}

function sortGroups(
  sourceById: ReadonlyMap<string, { source: RepertoireSource; index: number }>,
): (a: RepertoireComplianceReportGroup, b: RepertoireComplianceReportGroup) => number {
  return (a, b) => {
    if (b.seenCount !== a.seenCount) return b.seenCount - a.seenCount;
    if (b.lostCount !== a.lostCount) return b.lostCount - a.lostCount;
    if (b.lossRate !== a.lossRate) return b.lossRate - a.lossRate;
    const aOrder = sourceIdentity(a.sourceId, sourceById).order;
    const bOrder = sourceIdentity(b.sourceId, sourceById).order;
    return aOrder - bOrder || a.lineLabel.localeCompare(b.lineLabel) || a.key.localeCompare(b.key);
  };
}

function repertoireStudyNextScore(group: RepertoireComplianceReportGroup): number {
  return group.seenCount * group.lostCount;
}

function sortStudyNextGroups(a: RepertoireComplianceReportGroup, b: RepertoireComplianceReportGroup): number {
  const aScore = repertoireStudyNextScore(a);
  const bScore = repertoireStudyNextScore(b);
  return bScore - aScore
    || b.lostCount - a.lostCount
    || b.seenCount - a.seenCount
    || a.lineLabel.localeCompare(b.lineLabel)
    || a.key.localeCompare(b.key);
}

// T7-A8: the per-line-prefix accumulation loop, factored behind a key function so it can be run
// twice over the same filteredRecords — once with groupKey (Divergences tab, unchanged) and once
// with studyNextGroupKey (Study-Next tab, position-first) — as two independent grouping passes
// rather than one grouping pass re-sorted two different ways.
function accumulateRepertoireComplianceGroups(
  records: readonly RepertoireMatchRecord[],
  gamesById: ReadonlyMap<string, ImportedGame>,
  sourceById: ReadonlyMap<string, { source: RepertoireSource; index: number }>,
  keyFn: (record: RepertoireMatchRecord) => string,
): RepertoireComplianceReportGroup[] {
  const grouped = new Map<string, RepertoireComplianceReportGroup>();
  for (const record of records) {
    const category = record.category;
    if (category === null) continue;
    const key = keyFn(record);
    const existing = grouped.get(key);
    const outcome = repertoireComplianceOutcomeFromRecord(record);
    const gameEntry: RepertoireComplianceReportGame = {
      gameId: record.gameId,
      game: gamesById.get(record.gameId) ?? null,
      outcome,
      firstDivergencePly: record.firstDivergencePly,
      gameDate: record.gameDate,
    };

    if (existing) {
      if (existing.ownerColor !== record.ownerColor) existing.ownerColor = 'mixed';
      existing.seenCount += 1;
      if (outcome === 'loss') existing.lostCount += 1;
      existing.nonLossCount = existing.seenCount - existing.lostCount;
      existing.lossRate = existing.seenCount > 0 ? existing.lostCount / existing.seenCount : 0;
      existing.games.push(gameEntry);
      continue;
    }

    const identity = sourceIdentity(record.sourceId, sourceById);
    const categoryLabel = repertoireDivergenceCategoryLabel(category);
    const linePrefix = recordLinePrefix(record);
    const lostCount = outcome === 'loss' ? 1 : 0;
    grouped.set(key, {
      key,
      sourceId: record.sourceId,
      sourceName: identity.name,
      sourceSide: identity.side,
      sourceAccentIndex: identity.accentIndex,
      ownerColor: record.ownerColor,
      category,
      categoryLabel,
      firstDivergencePly: record.firstDivergencePly,
      matchedDepthPly: record.matchedDepthPly,
      playedUci: record.playedUci,
      missedUci: record.missedUci,
      missedSan: record.missedSan ?? null,
      linePrefix,
      lineLabel: lineLabel({
        sourceName: identity.name,
        categoryLabel,
        firstDivergencePly: record.firstDivergencePly,
        playedUci: record.playedUci,
        missedUci: record.missedUci,
        missedSan: record.missedSan ?? null,
        linePrefix,
      }),
      seenCount: 1,
      lostCount,
      nonLossCount: 1 - lostCount,
      lossRate: lostCount,
      games: [gameEntry],
    });
  }

  return [...grouped.values()].map(group => ({
    ...group,
    games: [...group.games].sort(sortReportGames),
  }));
}

export function buildRepertoireComplianceReport(
  input: BuildRepertoireComplianceReportInput,
): RepertoireComplianceReport {
  const filters = normalizedFilters(input.filters);
  const now = input.now ?? Date.now();
  const gamesById = new Map(input.games.map(game => [game.id, game]));
  const sourceById = new Map(
    [...input.sources].sort(sourceSort).map((source, index) => [source.id, { source, index }] as const),
  );
  // Enabled-aware exclusion (P2-REP-3 T0 note): a record whose source is missing entirely or has
  // been disabled never counts as a divergence at all. Independent of the category filter below —
  // there is no "show disabled sources" toggle, disabled means disabled.
  const divergenceRecords = input.records.filter(record => {
    if (record.status !== 'diverged' || record.category === null) return false;
    const known = sourceById.get(record.sourceId);
    return known !== undefined && known.source.enabled;
  });
  const filteredRecords = divergenceRecords.filter(record => recordMatchesFilters(record, filters, now));

  const groups = accumulateRepertoireComplianceGroups(filteredRecords, gamesById, sourceById, groupKey);
  // T7-A8 (Audit C F16, consumption half): a SECOND, separately-keyed pass over the same
  // filteredRecords — not a re-sort of `groups` — so a recurring mistake reached via two different
  // move orders accumulates seenCount/lostCount into one Study-Next row instead of two smaller,
  // diluted ones. `groups` above (Divergences tab) keeps its original groupKey pass unchanged.
  const studyNextGroups = accumulateRepertoireComplianceGroups(filteredRecords, gamesById, sourceById, studyNextGroupKey);

  return {
    groups: [...groups].sort(sortGroups(sourceById)),
    studyNextGroups: [...studyNextGroups].sort(sortStudyNextGroups),
    studyNextGroupsByLine: [...groups].sort(sortStudyNextGroups),
    filters,
    filterOptions: buildFilterOptions(divergenceRecords, input.games),
    totalDivergenceCount: divergenceRecords.length,
    filteredDivergenceCount: filteredRecords.length,
  };
}

export function repertoireComplianceReportFiltersActive(filters: RepertoireComplianceReportFilters): boolean {
  return filters.accountId !== null
    || filters.ownerColor !== null
    || filters.result !== null
    || filters.timeClass !== null
    || filters.date !== 'all'
    || filters.category !== 'owner';
}
