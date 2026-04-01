// ---------------------------------------------------------------------------
// Lichess puzzle shard loader
// Loads puzzle data from the generated shard files at
// /generated/lichess-puzzles/manifest.json + shard-NNNNN.json.
//
// Designed for incremental loading — fetches one shard at a time so the
// browser doesn't need to hold millions of records in memory.
// ---------------------------------------------------------------------------

import type { LichessShardRecord } from './adapters';

// --- Manifest shape ---

export interface ShardMeta {
  id: string;
  file: string;
  count: number;
  ratingMin?: number;
  ratingMax?: number;
  themes: string[];
  openings: string[];
}

export interface PuzzleManifest {
  version: number;
  generatedAt: string;
  totalCount: number;
  shardSize: number;
  shards: ShardMeta[];
  ratingMin?: number;
  ratingMax?: number;
  themes: string[];
  openings: string[];
  source: { file: string; license: string; url: string };
}

const BASE_PATH = '/generated/lichess-puzzles';

let _manifest: PuzzleManifest | null = null;
let _manifestLoading = false;
/**
 * LRU shard cache — bounded to SHARD_CACHE_MAX entries.
 * Uses Map insertion-order: the first key() is the least-recently-used entry.
 * On cache hit, the entry is deleted and re-inserted to move it to the end.
 * Adapted from lichess-org/lila: ui/lib/src/lru.ts eviction pattern.
 */
const SHARD_CACHE_MAX = 5;
const _shardCache: Map<string, LichessShardRecord[]> = new Map();

function shardCacheGet(shardId: string): LichessShardRecord[] | undefined {
  const value = _shardCache.get(shardId);
  if (value === undefined) return undefined;
  // Refresh position — move to end (most recently used).
  _shardCache.delete(shardId);
  _shardCache.set(shardId, value);
  return value;
}

function shardCacheSet(shardId: string, records: LichessShardRecord[]): void {
  _shardCache.delete(shardId);
  _shardCache.set(shardId, records);
  // Evict the oldest (first) entry if we exceed the cap.
  if (_shardCache.size > SHARD_CACHE_MAX) {
    const oldest = _shardCache.keys().next().value;
    if (oldest !== undefined) _shardCache.delete(oldest);
  }
}

// --- Manifest ---

export async function loadManifest(): Promise<PuzzleManifest> {
  if (_manifest) return _manifest;
  if (_manifestLoading) {
    // Wait for in-flight load
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (_manifest) { clearInterval(check); resolve(_manifest); }
        if (!_manifestLoading) { clearInterval(check); reject(new Error('manifest load failed')); }
      }, 50);
    });
  }
  _manifestLoading = true;
  try {
    const res = await fetch(`${BASE_PATH}/manifest.json`);
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
    _manifest = (await res.json()) as PuzzleManifest;
    return _manifest;
  } catch (e) {
    _manifestLoading = false;
    throw e;
  }
}

export function getManifest(): PuzzleManifest | null {
  return _manifest;
}

// --- Shard loading ---

export async function loadShard(shardId: string): Promise<LichessShardRecord[]> {
  const cached = shardCacheGet(shardId);
  if (cached) return cached;

  const manifest = await loadManifest();
  const meta = manifest.shards.find(s => s.id === shardId);
  if (!meta) throw new Error(`shard ${shardId} not found in manifest`);

  const res = await fetch(`${BASE_PATH}/${meta.file}`);
  if (!res.ok) throw new Error(`shard fetch failed: ${res.status}`);
  const records = (await res.json()) as LichessShardRecord[];
  shardCacheSet(shardId, records);
  return records;
}

/**
 * Find shards that could contain puzzles matching the given filters.
 * Uses manifest-level shard metadata (ratingMin/Max) for coarse pre-filtering.
 */
export function findMatchingShards(
  manifest: PuzzleManifest,
  filters: { ratingMin?: number; ratingMax?: number; theme?: string },
): ShardMeta[] {
  return manifest.shards.filter(shard => {
    // Rating range filter — skip shards entirely outside the range
    if (filters.ratingMin !== undefined && shard.ratingMax !== undefined && shard.ratingMax < filters.ratingMin) return false;
    if (filters.ratingMax !== undefined && shard.ratingMin !== undefined && shard.ratingMin > filters.ratingMax) return false;
    // Theme filter — skip shards that don't contain the theme
    if (filters.theme && !shard.themes.includes(filters.theme)) return false;
    return true;
  });
}

/**
 * Load puzzles from a single shard and apply client-side filters.
 * Returns filtered records (not converted to PuzzleDefinition — caller does that).
 */
export async function loadFilteredShard(
  shardId: string,
  filters: { ratingMin?: number; ratingMax?: number; theme?: string },
): Promise<LichessShardRecord[]> {
  const records = await loadShard(shardId);
  return records.filter(r => {
    if (filters.ratingMin !== undefined && r.rating < filters.ratingMin) return false;
    if (filters.ratingMax !== undefined && r.rating > filters.ratingMax) return false;
    if (filters.theme && !r.themes.includes(filters.theme)) return false;
    return true;
  });
}

/** Get all unique themes from the manifest. */
export function getManifestThemes(): string[] {
  return _manifest?.themes ?? [];
}

/** Get all unique openings from the manifest. */
export function getManifestOpenings(): string[] {
  return _manifest?.openings ?? [];
}

/** Get total puzzle count from manifest. */
export function getManifestTotalCount(): number {
  return _manifest?.totalCount ?? 0;
}
