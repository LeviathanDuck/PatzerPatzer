import type {
  ImportedPuzzleFilters,
  ImportedPuzzleLibraryQuery,
  ImportedPuzzleLibraryState,
  ImportedPuzzleManifest,
  ImportedPuzzleRecord,
  ImportedPuzzleRound,
} from './types';

const IMPORTED_PUZZLE_KEY_PREFIX = 'lichess::';
const IMPORTED_PUZZLE_BASE_URL = '/generated/lichess-puzzles';
const DEFAULT_IMPORTED_PAGE_SIZE = 24;

let _redraw: () => void = () => {};

let manifest: ImportedPuzzleManifest | null = null;
let manifestPromise: Promise<ImportedPuzzleManifest | null> | null = null;
const shardCache = new Map<string, Promise<ImportedPuzzleRecord[]>>();

let libraryState: ImportedPuzzleLibraryState = {
  status: 'idle',
  query: defaultImportedPuzzleQuery(),
  manifest: null,
  items: [],
  hasPrev: false,
  hasNext: false,
  loadedShardCount: 0,
};
let libraryRequestKey = '';
let libraryRequestToken = 0;

export function initImportedPuzzles(deps: { redraw: () => void }): void {
  _redraw = deps.redraw;
}

export function defaultImportedPuzzleFilters(): ImportedPuzzleFilters {
  return {
    ratingMin: '',
    ratingMax: '',
    theme: '',
    opening: '',
  };
}

export function defaultImportedPuzzleQuery(): ImportedPuzzleLibraryQuery {
  return {
    page: 0,
    pageSize: DEFAULT_IMPORTED_PAGE_SIZE,
    filters: defaultImportedPuzzleFilters(),
  };
}

export function importedPuzzleLibraryState(): ImportedPuzzleLibraryState {
  return libraryState;
}

export function importedPuzzleKey(shardId: string, id: string): string {
  return `${IMPORTED_PUZZLE_KEY_PREFIX}${shardId}::${id}`;
}

export function importedPuzzleRouteId(shardId: string, id: string): string {
  return encodeURIComponent(importedPuzzleKey(shardId, id));
}

export function isImportedPuzzleRouteId(routeId: string): boolean {
  return parseImportedPuzzleRouteId(routeId) !== null;
}

function parseImportedPuzzleRouteId(routeId: string): { shardId: string; id: string } | null {
  let decoded = routeId;
  try {
    decoded = decodeURIComponent(routeId);
  } catch {
    decoded = routeId;
  }
  if (!decoded.startsWith(IMPORTED_PUZZLE_KEY_PREFIX)) return null;
  const body = decoded.slice(IMPORTED_PUZZLE_KEY_PREFIX.length);
  const sep = body.indexOf('::');
  if (sep < 0) return null;
  const shardId = body.slice(0, sep);
  const id = body.slice(sep + 2);
  return shardId && id ? { shardId, id } : null;
}

function queryKey(query: ImportedPuzzleLibraryQuery): string {
  return JSON.stringify(query);
}

async function loadManifest(): Promise<ImportedPuzzleManifest | null> {
  if (manifest !== null) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const response = await fetch(`${IMPORTED_PUZZLE_BASE_URL}/manifest.json`, { cache: 'no-store' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Manifest request failed with ${response.status}`);
      return await response.json() as ImportedPuzzleManifest;
    } catch (error) {
      console.warn('[puzzles] imported manifest load failed', error);
      return null;
    }
  })();
  manifest = await manifestPromise;
  return manifest;
}

function annotateShardRecords(
  shardId: string,
  rows: Array<Omit<ImportedPuzzleRecord, 'key' | 'routeId' | 'shardId'>>,
): ImportedPuzzleRecord[] {
  return rows.map(row => ({
    ...row,
    shardId,
    key: importedPuzzleKey(shardId, row.id),
    routeId: importedPuzzleRouteId(shardId, row.id),
  }));
}

async function loadShard(file: string, shardId: string): Promise<ImportedPuzzleRecord[]> {
  const cached = shardCache.get(file);
  if (cached) return cached;
  const promise = (async () => {
    const response = await fetch(`${IMPORTED_PUZZLE_BASE_URL}/${file}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Shard request failed with ${response.status}`);
    const rows = await response.json() as Array<Omit<ImportedPuzzleRecord, 'key' | 'routeId' | 'shardId'>>;
    return annotateShardRecords(shardId, rows);
  })();
  shardCache.set(file, promise);
  return promise;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function toOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

function recordMatchesFilters(record: ImportedPuzzleRecord, filters: ImportedPuzzleFilters): boolean {
  const min = toOptionalNumber(filters.ratingMin);
  const max = toOptionalNumber(filters.ratingMax);
  if (min !== null && record.rating < min) return false;
  if (max !== null && record.rating > max) return false;
  if (filters.theme) {
    const wanted = normalizeTag(filters.theme);
    if (!record.themes.some(theme => normalizeTag(theme) === wanted)) return false;
  }
  if (filters.opening) {
    const wanted = normalizeTag(filters.opening);
    if (!record.openingTags.some(opening => normalizeTag(opening) === wanted)) return false;
  }
  return true;
}

function shardMayMatch(
  shard: ImportedPuzzleManifest['shards'][number],
  filters: ImportedPuzzleFilters,
): boolean {
  const min = toOptionalNumber(filters.ratingMin);
  const max = toOptionalNumber(filters.ratingMax);
  if (min !== null && shard.ratingMax !== undefined && shard.ratingMax < min) return false;
  if (max !== null && shard.ratingMin !== undefined && shard.ratingMin > max) return false;
  if (filters.theme) {
    const wanted = normalizeTag(filters.theme);
    if (!shard.themes.some(theme => normalizeTag(theme) === wanted)) return false;
  }
  if (filters.opening) {
    const wanted = normalizeTag(filters.opening);
    if (!shard.openings.some(opening => normalizeTag(opening) === wanted)) return false;
  }
  return true;
}

export function requestImportedPuzzleLibrary(query: ImportedPuzzleLibraryQuery): void {
  const nextKey = queryKey(query);
  if (libraryRequestKey === nextKey && libraryState.status !== 'idle') return;
  libraryRequestKey = nextKey;
  const token = ++libraryRequestToken;
  libraryState = {
    status: 'loading',
    query,
    manifest,
    items: [],
    hasPrev: query.page > 0,
    hasNext: false,
    loadedShardCount: 0,
  };
  _redraw();
  void (async () => {
    const loadedManifest = await loadManifest();
    if (token !== libraryRequestToken) return;
    if (!loadedManifest) {
      libraryState = {
        status: 'missing',
        query,
        manifest: null,
        items: [],
        hasPrev: query.page > 0,
        hasNext: false,
        loadedShardCount: 0,
      };
      _redraw();
      return;
    }

    const matchingShards = loadedManifest.shards.filter(shard => shardMayMatch(shard, query.filters));
    const start = query.page * query.pageSize;
    const end = start + query.pageSize;
    const target = end + 1;
    const matches: ImportedPuzzleRecord[] = [];
    let loadedShardCount = 0;
    let hasMorePossible = false;

    try {
      for (let i = 0; i < matchingShards.length; i++) {
        const shard = matchingShards[i]!;
        const rows = await loadShard(shard.file, shard.id);
        if (token !== libraryRequestToken) return;
        loadedShardCount += 1;
        for (const row of rows) {
          if (!recordMatchesFilters(row, query.filters)) continue;
          matches.push(row);
          if (matches.length > target) break;
        }
        if (matches.length > target) {
          hasMorePossible = true;
          break;
        }
      }
    } catch (error) {
      console.warn('[puzzles] imported shard load failed', error);
      if (token !== libraryRequestToken) return;
      libraryState = {
        status: 'error',
        query,
        manifest: loadedManifest,
        items: [],
        hasPrev: query.page > 0,
        hasNext: false,
        loadedShardCount,
        error: error instanceof Error ? error.message : 'Imported shard load failed',
      };
      _redraw();
      return;
    }

    const pageItems = matches.slice(start, end);
    const hasNext = matches.length > end || hasMorePossible;
    libraryState = {
      status: 'ready',
      query,
      manifest: loadedManifest,
      items: pageItems,
      hasPrev: query.page > 0,
      hasNext,
      loadedShardCount,
    };
    _redraw();
  })();
}

export async function findImportedPuzzleRoundByRouteId(routeId: string): Promise<ImportedPuzzleRound | null> {
  const parsed = parseImportedPuzzleRouteId(routeId);
  if (!parsed) return null;
  const loadedManifest = await loadManifest();
  if (!loadedManifest) return null;
  const shard = loadedManifest.shards.find(entry => entry.id === parsed.shardId);
  if (!shard) return null;
  const rows = await loadShard(shard.file, shard.id);
  const record = rows.find(row => row.id === parsed.id);
  if (!record) return null;
  const toMove = record.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  return {
    key: record.key,
    routeId: record.routeId,
    sourceKind: 'imported',
    source: null,
    sourceGame: null,
    imported: record,
    parentPath: '',
    startFen: record.fen,
    solution: [...record.moves],
    toMove,
  };
}
