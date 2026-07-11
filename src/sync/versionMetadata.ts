import { REMOTE_SYNC_STORE_NAMES } from './remoteSyncMigrations';

export interface RemoteSyncVersionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RemoteSyncVersionMetadata {
  identity: string;
  latestVersion: number;
  itemVersions: Record<string, number>;







  pullCursor: number;
  /**
   * Per-store pull cursor, initialized equal to `pullCursor` on every cursor write. Forward door
   * for the future G-13 per-store replication scope (ADR) — written and migrated today, not yet
   * consumed by any pull-planning logic.
   */
  pullCursors: Record<string, number>;
}

export interface RemoteSyncVersionMetadataState extends RemoteSyncVersionMetadata {
  needsFullPull: boolean;
}

export type RemoteSyncVersionWriteReadiness =
  | { ok: true; latestVersion: number }
  | { ok: false; reason: 'needs-full-pull' };

const METADATA_SCHEMA_VERSION = 2;
const METADATA_KEY_PREFIX = 'chesspatzer.remoteSync.versionMetadata.v1';

function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required for Remote sync version metadata.`);
  return trimmed;
}

function metadataStorageKey(identity: string): string {
  return `${METADATA_KEY_PREFIX}.${encodeURIComponent(assertNonEmpty(identity, 'identity'))}`;
}

function itemVersionKey(store: string, itemKey: string): string {
  return `${encodeURIComponent(assertNonEmpty(store, 'store'))}::${encodeURIComponent(assertNonEmpty(itemKey, 'itemKey'))}`;
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function normalizeItemVersions(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  const normalized: Record<string, number> = {};
  for (const [key, version] of entries) {
    if (!validVersion(version)) return null;
    normalized[key] = version;
  }
  return normalized;
}

function pullCursorsForAllStores(cursor: number): Record<string, number> {
  return Object.fromEntries(REMOTE_SYNC_STORE_NAMES.map(store => [store, cursor]));
}

function missingMetadata(identity: string): RemoteSyncVersionMetadataState {
  return {
    identity: assertNonEmpty(identity, 'identity'),
    latestVersion: 0,
    itemVersions: {},
    pullCursor: 0,
    pullCursors: {},
    needsFullPull: true,
  };
}

export function readRemoteSyncVersionMetadata(
  storage: RemoteSyncVersionStorage,
  identity: string
): RemoteSyncVersionMetadataState {
  const normalizedIdentity = assertNonEmpty(identity, 'identity');
  const raw = storage.getItem(metadataStorageKey(normalizedIdentity));
  if (!raw) return missingMetadata(normalizedIdentity);

  try {
    const parsed = JSON.parse(raw) as {
      schemaVersion?: unknown;
      identity?: unknown;
      latestVersion?: unknown;
      itemVersions?: unknown;
      pullCursor?: unknown;
      pullCursors?: unknown;
    };
    // A v1 blob (schemaVersion 1, no pullCursor split) fails this check and falls through to
    // missingMetadata, which forces exactly one clean full pull to migrate the browser onto v2.
    if (parsed.schemaVersion !== METADATA_SCHEMA_VERSION) return missingMetadata(normalizedIdentity);
    if (parsed.identity !== normalizedIdentity) return missingMetadata(normalizedIdentity);
    if (!validVersion(parsed.latestVersion)) return missingMetadata(normalizedIdentity);
    if (!validVersion(parsed.pullCursor)) return missingMetadata(normalizedIdentity);
    const itemVersions = normalizeItemVersions(parsed.itemVersions);
    if (!itemVersions) return missingMetadata(normalizedIdentity);
    const pullCursors = normalizeItemVersions(parsed.pullCursors);
    if (!pullCursors) return missingMetadata(normalizedIdentity);

    return {
      identity: normalizedIdentity,
      latestVersion: parsed.latestVersion,
      itemVersions,
      pullCursor: parsed.pullCursor,
      pullCursors,
      needsFullPull: false,
    };
  } catch {
    return missingMetadata(normalizedIdentity);
  }
}

export function writeRemoteSyncVersionMetadata(
  storage: RemoteSyncVersionStorage,
  metadata: RemoteSyncVersionMetadata
): void {
  const identity = assertNonEmpty(metadata.identity, 'identity');
  if (!validVersion(metadata.latestVersion)) {
    throw new Error('latestVersion must be a non-negative integer.');
  }
  if (!validVersion(metadata.pullCursor)) {
    throw new Error('pullCursor must be a non-negative integer.');
  }
  const itemVersions = normalizeItemVersions(metadata.itemVersions);
  if (!itemVersions) throw new Error('itemVersions must map item keys to non-negative integer versions.');
  const pullCursors = normalizeItemVersions(metadata.pullCursors);
  if (!pullCursors) throw new Error('pullCursors must map store names to non-negative integer versions.');

  storage.setItem(metadataStorageKey(identity), JSON.stringify({
    schemaVersion: METADATA_SCHEMA_VERSION,
    identity,
    latestVersion: metadata.latestVersion,
    itemVersions,
    pullCursor: metadata.pullCursor,
    pullCursors,
  }));
}

export function setRemoteSyncLatestVersion(
  storage: RemoteSyncVersionStorage,
  identity: string,
  latestVersion: number
): void {
  const state = readRemoteSyncVersionMetadata(storage, identity);
  writeRemoteSyncVersionMetadata(storage, {
    identity: state.identity,
    latestVersion,
    itemVersions: state.needsFullPull ? {} : state.itemVersions,
    pullCursor: state.needsFullPull ? 0 : state.pullCursor,
    pullCursors: state.needsFullPull ? {} : state.pullCursors,
  });
}





export function recordRemoteSyncItemVersion(
  storage: RemoteSyncVersionStorage,
  identity: string,
  store: string,
  itemKey: string,
  version: number
): void {
  if (!validVersion(version)) throw new Error('item version must be a non-negative integer.');
  const state = readRemoteSyncVersionMetadata(storage, identity);
  const itemVersions = state.needsFullPull ? {} : { ...state.itemVersions };
  itemVersions[itemVersionKey(store, itemKey)] = version;
  writeRemoteSyncVersionMetadata(storage, {
    identity: state.identity,
    latestVersion: Math.max(state.needsFullPull ? 0 : state.latestVersion, version),
    itemVersions,
    pullCursor: state.needsFullPull ? 0 : state.pullCursor,
    pullCursors: state.needsFullPull ? {} : state.pullCursors,
  });
}

export function getRemoteSyncItemVersion(
  storage: RemoteSyncVersionStorage,
  identity: string,
  store: string,
  itemKey: string
): number | null {
  const state = readRemoteSyncVersionMetadata(storage, identity);
  if (state.needsFullPull) return null;
  return state.itemVersions[itemVersionKey(store, itemKey)] ?? null;
}

export interface RemoteSyncItemVersionRecord {
  store: string;
  itemKey: string;
  version: number;
}








export function recordRemoteSyncItemVersions(
  storage: RemoteSyncVersionStorage,
  identity: string,
  records: readonly RemoteSyncItemVersionRecord[],
  latestVersion = 0
): number {
  if (!validVersion(latestVersion)) throw new Error('latestVersion must be a non-negative integer.');
  for (const record of records) {
    if (!validVersion(record.version)) throw new Error('item version must be a non-negative integer.');
  }
  const state = readRemoteSyncVersionMetadata(storage, identity);
  const itemVersions = state.needsFullPull ? {} : { ...state.itemVersions };
  let latest = Math.max(state.needsFullPull ? 0 : state.latestVersion, latestVersion);
  for (const record of records) {
    itemVersions[itemVersionKey(record.store, record.itemKey)] = record.version;
    latest = Math.max(latest, record.version);
  }
  writeRemoteSyncVersionMetadata(storage, {
    identity: state.identity,
    latestVersion: latest,
    itemVersions,
    pullCursor: state.needsFullPull ? 0 : state.pullCursor,
    pullCursors: state.needsFullPull ? {} : state.pullCursors,
  });
  return latest;
}

// Explicit cursor writers — used only by pull completion (routine cursor pulls), never by push
// acceptance. Incremental pulls can only move the cursor forward (max semantics): a cursor pull
// response is a superset of everything below its `since`, so regressing here would be a bug.
export function advanceRemoteSyncPullCursor(
  storage: RemoteSyncVersionStorage,
  identity: string,
  cursor: number
): void {
  if (!validVersion(cursor)) throw new Error('pull cursor must be a non-negative integer.');
  const state = readRemoteSyncVersionMetadata(storage, identity);
  const nextCursor = Math.max(state.needsFullPull ? 0 : state.pullCursor, cursor);
  writeRemoteSyncVersionMetadata(storage, {
    identity: state.identity,
    latestVersion: state.needsFullPull ? 0 : state.latestVersion,
    itemVersions: state.needsFullPull ? {} : state.itemVersions,
    pullCursor: nextCursor,
    pullCursors: pullCursorsForAllStores(nextCursor),
  });
}

// A clean full (cursor=0) pull completion SETS the cursor to the response latestVersion even if
// that is lower than the previously stored cursor. This is what makes restore recovery converge
// (audit F-2): after a replace-mode restore renumbers server rows to 1..N, the cursor must be
// allowed to regress from the old high-water mark down to N.
export function setRemoteSyncPullCursor(
  storage: RemoteSyncVersionStorage,
  identity: string,
  cursor: number
): void {
  if (!validVersion(cursor)) throw new Error('pull cursor must be a non-negative integer.');
  const state = readRemoteSyncVersionMetadata(storage, identity);
  writeRemoteSyncVersionMetadata(storage, {
    identity: state.identity,
    latestVersion: state.needsFullPull ? 0 : state.latestVersion,
    itemVersions: state.needsFullPull ? {} : state.itemVersions,
    pullCursor: cursor,
    pullCursors: pullCursorsForAllStores(cursor),
  });
}

// Bulk lookup: parses the metadata blob once and returns a resolver, so batch
// enqueues avoid re-reading/re-parsing storage for every item.
export function createRemoteSyncItemVersionResolver(
  storage: RemoteSyncVersionStorage,
  identity: string
): (store: string, itemKey: string) => number | null {
  const state = readRemoteSyncVersionMetadata(storage, identity);
  if (state.needsFullPull) return () => null;
  return (store, itemKey) => state.itemVersions[itemVersionKey(store, itemKey)] ?? null;
}

export function resetRemoteSyncVersionMetadata(
  storage: RemoteSyncVersionStorage,
  identity: string
): void {
  storage.removeItem(metadataStorageKey(identity));
}

export function remoteSyncVersionWriteReadiness(
  storage: RemoteSyncVersionStorage,
  identity: string
): RemoteSyncVersionWriteReadiness {
  const state = readRemoteSyncVersionMetadata(storage, identity);
  if (state.needsFullPull) return { ok: false, reason: 'needs-full-pull' };
  return { ok: true, latestVersion: state.latestVersion };
}










import { createIndexedDbSyncItemStateStorage, type SyncItemStateStorage } from './versionOutbox';

export interface RemoteSyncItemStateRow {
  stateKey: string;
  identity: string;
  store: string;
  itemKey: string;
  /** CAS authority — the only field that ever decides a server conflict. */
  version?: number;
  /** Suppression/staleness markers: metadata only, never conflict authority. */
  updatedAt?: number;
  deletedAt?: number;
}

export interface RemoteSyncItemMarkerMutation {
  store: string;
  itemKey: string;
  /** number sets the marker, null clears it, absent leaves it untouched. */
  updatedAt?: number | null;
  deletedAt?: number | null;
}

export interface RemoteSyncItemStateMigrationSnapshot {
  versionRecords: ReadonlyArray<{ store: string; itemKey: string; version: number }>;
  markerRecords: ReadonlyArray<{ store: string; itemKey: string; updatedAt?: number; deletedAt?: number }>;
}

export function encodeRemoteSyncItemStateKey(identity: string, store: string, itemKey: string): string {
  // identity and itemKey are free-form (emails, platform ids with slashes); store names are a
  // closed set. Encoding the free-form halves keeps the composite key unambiguous.
  return `${encodeURIComponent(identity)}/${store}/${encodeURIComponent(itemKey)}`;
}

const SYNC_ITEM_STATE_LOCK_NAME = 'patzer-remote-sync-item-state';
const SYNC_ITEM_STATE_CHANNEL_NAME = 'patzer-remote-sync-item-state';

const itemStateCache = new Map<string, Map<string, RemoteSyncItemStateRow>>();
const itemStateReady = new Map<string, Promise<void>>();
let itemStateWriteChain: Promise<void> = Promise.resolve();
let itemStateStorageOverride: SyncItemStateStorage | null = null;
let itemStateDefaultStorage: SyncItemStateStorage | null = null;
let itemStateChannel: { postMessage(message: unknown): void; close(): void } | null = null;
let itemStateChannelWired = false;

/** Test seam: inject a fake storage; pass null to restore the IndexedDB-backed default. */
export function setRemoteSyncItemStateStorageForTests(storage: SyncItemStateStorage | null): void {
  itemStateStorageOverride = storage;
  itemStateCache.clear();
  itemStateReady.clear();
}

function itemStateStorage(): SyncItemStateStorage {
  if (itemStateStorageOverride) return itemStateStorageOverride;
  if (!itemStateDefaultStorage) itemStateDefaultStorage = createIndexedDbSyncItemStateStorage();
  return itemStateDefaultStorage;
}

// Same fallback posture as the outbox mutex: environments without Web Locks (Node harnesses)
// have no cross-tab concept, so the module-local promise chain is the whole story there.
let itemStateLockChain: Promise<void> = Promise.resolve();
function withItemStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(SYNC_ITEM_STATE_LOCK_NAME, fn) as Promise<T>;
  }
  const run = itemStateLockChain.then(fn, fn);
  itemStateLockChain = run.then(() => undefined, () => undefined);
  return run;
}

function publishItemStateInvalidation(identity: string): void {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    if (!itemStateChannelWired) {
      const channel = new BroadcastChannel(SYNC_ITEM_STATE_CHANNEL_NAME);
      channel.onmessage = event => {
        const data = (event as { data?: { type?: string; identity?: string } }).data;
        if (data?.type === 'invalidate' && typeof data.identity === 'string') {
          invalidateRemoteSyncItemState(data.identity);
        }
      };
      // Node's global BroadcastChannel holds the event loop open; unref so harness processes
      // exit. Browser channels have no unref — the optional call is a no-op there.
      (channel as unknown as { unref?: () => void }).unref?.();
      itemStateChannel = channel;
      itemStateChannelWired = true;
    }
    itemStateChannel?.postMessage({ type: 'invalidate', identity });
  } catch {
    // Cross-tab invalidation is best-effort; a tab that misses it re-hydrates on its next ensure.
  }
}

function normalizeItemStateRow(raw: unknown): RemoteSyncItemStateRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.stateKey !== 'string' || !value.stateKey) return null;
  if (typeof value.identity !== 'string' || typeof value.store !== 'string' || typeof value.itemKey !== 'string') return null;
  const row: RemoteSyncItemStateRow = {
    stateKey: value.stateKey,
    identity: value.identity,
    store: value.store,
    itemKey: value.itemKey,
  };
  if (typeof value.version === 'number' && Number.isInteger(value.version) && value.version >= 0) row.version = value.version;
  if (typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt >= 0) row.updatedAt = value.updatedAt;
  if (typeof value.deletedAt === 'number' && Number.isFinite(value.deletedAt) && value.deletedAt >= 0) row.deletedAt = value.deletedAt;
  return row;
}

/**
 * Hydrate the identity's compact state rows into the in-memory cache (coalesced: concurrent
 * callers share one hydrate). Synchronous readers below are valid only AFTER this resolves —
 * they throw otherwise, so an activation-wave caller that forgets the ensure fails loudly
 * instead of silently reading empty state. An identity with no rows yields an empty cache
 * (unknown identities are not an error).
 */
export function ensureRemoteSyncItemStateReady(identity: string): Promise<void> {
  const existing = itemStateReady.get(identity);
  if (existing) return existing;
  const hydrate = (async () => {
    const raw = await itemStateStorage().readAllRows(identity);
    const rows = new Map<string, RemoteSyncItemStateRow>();
    for (const value of raw) {
      const row = normalizeItemStateRow(value);
      if (row && row.identity === identity) rows.set(row.stateKey, row);
    }
    itemStateCache.set(identity, rows);
  })();
  const guarded = hydrate.catch(error => {
    // A failed hydrate must not poison future attempts.
    itemStateReady.delete(identity);
    throw error;
  });
  itemStateReady.set(identity, guarded);
  return guarded;
}

export function invalidateRemoteSyncItemState(identity: string): void {
  itemStateCache.delete(identity);
  itemStateReady.delete(identity);
}

function requireItemStateCache(identity: string): Map<string, RemoteSyncItemStateRow> {
  const cache = itemStateCache.get(identity);
  if (!cache) {
    throw new Error(`Sync item-state for "${identity}" was read before ensureRemoteSyncItemStateReady resolved.`);
  }
  return cache;
}

export function getRemoteSyncItemStateVersion(identity: string, store: string, itemKey: string): number | null {
  const row = requireItemStateCache(identity).get(encodeRemoteSyncItemStateKey(identity, store, itemKey));
  return row?.version ?? null;
}

export function createRemoteSyncItemStateResolver(identity: string): (store: string, itemKey: string) => number | null {
  const cache = requireItemStateCache(identity);
  return (store, itemKey) => cache.get(encodeRemoteSyncItemStateKey(identity, store, itemKey))?.version ?? null;
}

export function getRemoteSyncItemMarkers(identity: string, store: string, itemKey: string): { updatedAt: number; deletedAt: number } {
  const row = requireItemStateCache(identity).get(encodeRemoteSyncItemStateKey(identity, store, itemKey));
  return { updatedAt: row?.updatedAt ?? 0, deletedAt: row?.deletedAt ?? 0 };
}

function queueItemStateWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = itemStateWriteChain.then(fn, fn);
  itemStateWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

/** Resolves when every previously queued durable item-state write has settled. */
export function waitForRemoteSyncItemStateWrites(): Promise<void> {
  return itemStateWriteChain;
}

export function recordRemoteSyncItemStateVersions(
  identity: string,
  records: ReadonlyArray<{ store: string; itemKey: string; version: number }>
): Promise<number> {
  if (records.length === 0) return Promise.resolve(0);
  return queueItemStateWrite(async () => {
    await ensureRemoteSyncItemStateReady(identity);
    const cache = requireItemStateCache(identity);
    const changed: RemoteSyncItemStateRow[] = [];
    for (const record of records) {
      const stateKey = encodeRemoteSyncItemStateKey(identity, record.store, record.itemKey);
      const previous = cache.get(stateKey);
      if (previous?.version === record.version) continue;
      const next: RemoteSyncItemStateRow = {
        ...(previous ?? { stateKey, identity, store: record.store, itemKey: record.itemKey }),
        version: record.version,
      };
      cache.set(stateKey, next);
      changed.push(next);
    }
    if (changed.length > 0) await itemStateStorage().putRows(changed);
    return changed.length;
  });
}

export function recordRemoteSyncItemMarkers(
  identity: string,
  mutations: ReadonlyArray<RemoteSyncItemMarkerMutation>
): Promise<void> {
  if (mutations.length === 0) return Promise.resolve();
  return queueItemStateWrite(async () => {
    await ensureRemoteSyncItemStateReady(identity);
    const cache = requireItemStateCache(identity);
    const puts: RemoteSyncItemStateRow[] = [];
    const deletes: string[] = [];
    for (const mutation of mutations) {
      const stateKey = encodeRemoteSyncItemStateKey(identity, mutation.store, mutation.itemKey);
      const previous = cache.get(stateKey);
      const next: RemoteSyncItemStateRow = {
        ...(previous ?? { stateKey, identity, store: mutation.store, itemKey: mutation.itemKey }),
      };
      if (mutation.updatedAt !== undefined) {
        if (mutation.updatedAt === null) delete next.updatedAt;
        else next.updatedAt = mutation.updatedAt;
      }
      if (mutation.deletedAt !== undefined) {
        if (mutation.deletedAt === null) delete next.deletedAt;
        else next.deletedAt = mutation.deletedAt;
      }
      if (next.version === undefined && next.updatedAt === undefined && next.deletedAt === undefined) {
        // Nothing left on the row: drop it rather than storing an empty shell.
        if (previous) {
          cache.delete(stateKey);
          deletes.push(stateKey);
        }
        continue;
      }
      cache.set(stateKey, next);
      puts.push(next);
    }
    if (puts.length > 0) await itemStateStorage().putRows(puts);
    if (deletes.length > 0) await itemStateStorage().deleteRows(deletes);
  });
}

export function resetRemoteSyncItemState(identity: string): Promise<void> {
  return queueItemStateWrite(async () => {
    await itemStateStorage().clearIdentity(identity);
    invalidateRemoteSyncItemState(identity);
    publishItemStateInvalidation(identity);
  });
}

function migrationSentinelKey(identity: string): string {
  return `migration/${encodeURIComponent(identity)}`;
}

export interface RemoteSyncItemStateMigrationResult {
  alreadyComplete: boolean;
  migratedRows: number;
}

/**
 * One-time relocation of an identity's per-item bookkeeping into `sync-item-state`. The
 * snapshot is SUPPLIED BY THE CALLER (the activation waves own the localStorage key formats;
 * this primitive owns only the durable semantics):
 *  - sentinel-first: a completed sentinel short-circuits the rewrite (stale legacy values can
 *    never overwrite a completed migration) but still runs `cleanupLocalStorage`, so a crash
 *    AFTER commit and BEFORE cleanup converges on the next attempt;
 *  - rows + sentinel commit in ONE transaction (an abort loses both; retry is idempotent);
 *  - the whole operation runs under the cross-tab Web Lock, so duplicate attempts from two
 *    tabs serialize — the second sees the sentinel and does not rewrite.
 */
export function migrateRemoteSyncItemStateToIdb(
  identity: string,
  snapshot: RemoteSyncItemStateMigrationSnapshot,
  options: { cleanupLocalStorage?: () => void; now?: number } = {}
): Promise<RemoteSyncItemStateMigrationResult> {
  return withItemStateLock(async () => {
    const storage = itemStateStorage();
    const sentinelKey = migrationSentinelKey(identity);
    const existing = await storage.readMeta(sentinelKey);
    if (existing && typeof existing === 'object' && typeof (existing as Record<string, unknown>).completedAt === 'number') {
      options.cleanupLocalStorage?.();
      return { alreadyComplete: true, migratedRows: 0 };
    }
    const rowsByKey = new Map<string, RemoteSyncItemStateRow>();
    for (const record of snapshot.versionRecords) {
      const stateKey = encodeRemoteSyncItemStateKey(identity, record.store, record.itemKey);
      const row = rowsByKey.get(stateKey) ?? { stateKey, identity, store: record.store, itemKey: record.itemKey };
      row.version = record.version;
      rowsByKey.set(stateKey, row);
    }
    for (const record of snapshot.markerRecords) {
      const stateKey = encodeRemoteSyncItemStateKey(identity, record.store, record.itemKey);
      const row = rowsByKey.get(stateKey) ?? { stateKey, identity, store: record.store, itemKey: record.itemKey };
      if (record.updatedAt !== undefined) row.updatedAt = record.updatedAt;
      if (record.deletedAt !== undefined) row.deletedAt = record.deletedAt;
      rowsByKey.set(stateKey, row);
    }
    const rows = Array.from(rowsByKey.values());
    await storage.runStateMigrationTransaction(rows, {
      key: sentinelKey,
      identity,
      completedAt: options.now ?? Date.now(),
      rowCount: rows.length,
    });
    options.cleanupLocalStorage?.();
    invalidateRemoteSyncItemState(identity);
    publishItemStateInvalidation(identity);
    return { alreadyComplete: false, migratedRows: rows.length };
  });
}
