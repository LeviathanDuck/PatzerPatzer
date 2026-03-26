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
    themes: [],
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
  if (filters.themes.length > 0) {
    const wanted = filters.themes.map(normalizeTag);
    if (!record.themes.some(t => wanted.includes(normalizeTag(t)))) return false;
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
  if (filters.themes.length > 0) {
    // Shard must contain at least one of the selected themes.
    // If the shard has no theme metadata, don't skip it (treat as unknown).
    if (shard.themes.length > 0) {
      const wanted = filters.themes.map(normalizeTag);
      if (!shard.themes.some(t => wanted.includes(normalizeTag(t)))) return false;
    }
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

// --- Training queue ---
// Tracks a continuous training session through a filtered puzzle set, independent
// of the display library page state. Pre-fetches the next page so page-boundary
// transitions are seamless.
// Adapted from lichess-org/lila: ui/puzzle/src/session.ts sequential delivery model

interface TrainingPageResult {
  items: ImportedPuzzleRecord[];
  hasNext: boolean;
}

async function loadTrainingPage(
  query: ImportedPuzzleLibraryQuery,
  page: number,
): Promise<TrainingPageResult> {
  const loadedManifest = await loadManifest();
  if (!loadedManifest) return { items: [], hasNext: false };

  const { pageSize, filters } = query;
  const matchingShards = loadedManifest.shards.filter(shard => shardMayMatch(shard, filters));
  const start = page * pageSize;
  const end = start + pageSize;
  const matches: ImportedPuzzleRecord[] = [];
  let hasMorePossible = false;

  for (const shard of matchingShards) {
    const rows = await loadShard(shard.file, shard.id);
    for (const row of rows) {
      if (!recordMatchesFilters(row, filters)) continue;
      matches.push(row);
      if (matches.length > end) break;
    }
    if (matches.length > end) {
      hasMorePossible = true;
      break;
    }
  }

  return {
    items: matches.slice(start, end),
    hasNext: matches.length > end || hasMorePossible,
  };
}

let trainingActive = false;
let trainingQuery: ImportedPuzzleLibraryQuery | null = null;
let trainingPage = 0;
let trainingItems: ImportedPuzzleRecord[] = [];
let trainingIndex = 0;
// Pre-fetched next page so page-boundary advances are instant.
let trainingNextItems: ImportedPuzzleRecord[] | null = null;
let trainingNextHasNext = false;
let trainingNextPage = -1;

function prefetchNextTrainingPage(): void {
  if (!trainingActive || !trainingQuery) return;
  const nextPage = trainingPage + 1;
  if (trainingNextPage === nextPage) return; // already in flight or loaded
  trainingNextPage = nextPage;
  trainingNextItems = null;
  void loadTrainingPage(trainingQuery, nextPage).then(result => {
    if (!trainingActive || trainingNextPage !== nextPage) return;
    trainingNextItems = result.items;
    trainingNextHasNext = result.hasNext;
  });
}

export function startTraining(query: ImportedPuzzleLibraryQuery): void {
  trainingActive = true;
  trainingQuery = { ...query, page: 0 };
  trainingPage = 0;
  trainingItems = [];
  trainingIndex = 0;
  trainingNextItems = null;
  trainingNextHasNext = false;
  trainingNextPage = -1;

  void loadTrainingPage(trainingQuery, 0).then(result => {
    if (!trainingActive) return;
    trainingItems = result.items;
    if (result.hasNext) prefetchNextTrainingPage();
    _redraw();
  });
}

export function isTrainingMode(): boolean {
  return trainingActive;
}

export function currentTrainingRouteId(): string | null {
  return trainingItems[trainingIndex]?.routeId ?? null;
}

export function getNextTrainingRouteId(): string | null {
  // Peek one ahead — used by index.ts to decide whether to show "more coming"
  if (trainingIndex + 1 < trainingItems.length) {
    return trainingItems[trainingIndex + 1]!.routeId;
  }
  // Next page pre-fetched and ready
  if (trainingNextItems && trainingNextItems.length > 0) {
    return trainingNextItems[0]!.routeId;
  }
  return null;
}

export function advanceTrainingCursor(): void {
  if (!trainingActive) return;
  trainingIndex++;

  if (trainingIndex < trainingItems.length) {
    // Still within the current page — pre-fetch next page if near the end
    if (trainingIndex >= trainingItems.length - 2) prefetchNextTrainingPage();
    return;
  }

  // Past end of current page — swap in the pre-fetched next page
  if (trainingNextItems !== null && trainingNextItems.length > 0) {
    trainingPage++;
    trainingItems = trainingNextItems;
    trainingIndex = 0;
    trainingNextItems = null;
    trainingNextPage = -1;
    if (trainingNextHasNext) prefetchNextTrainingPage();
  } else if (trainingNextItems !== null && trainingNextItems.length === 0) {
    // Pre-fetch returned empty — training is exhausted
    trainingActive = false;
  }
  // else: pre-fetch still in flight — currentTrainingRouteId() returns null until it resolves
}

export function stopTraining(): void {
  trainingActive = false;
  trainingQuery = null;
  trainingPage = 0;
  trainingItems = [];
  trainingIndex = 0;
  trainingNextItems = null;
  trainingNextHasNext = false;
  trainingNextPage = -1;
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
  // In the Lichess puzzle CSV, moves[0] is the opponent's triggering move that sets
  // up the tactical opportunity. The user plays moves[1] onwards.
  // toMove is the user's color — opposite of the FEN's active side.
  // Mirrors lichess-org/lila: ui/puzzle/src/ctrl.ts pov / initialNode logic.
  const initialMove = record.moves[0] ?? '';
  const solution = record.moves.slice(1);
  const toMove = record.fen.split(' ')[1] === 'b' ? 'white' : 'black';
  return {
    key: record.key,
    routeId: record.routeId,
    sourceKind: 'imported',
    source: null,
    sourceGame: null,
    imported: record,
    parentPath: '',
    startFen: record.fen,
    initialMove,
    solution,
    toMove,
  };
}
