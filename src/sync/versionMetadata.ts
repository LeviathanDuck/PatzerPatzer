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







const METADATA_SCHEMA_VERSION = 3;
const METADATA_ACCEPTED_SCHEMA_VERSIONS = new Set([2, 3]);
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
    if (typeof parsed.schemaVersion !== 'number' || !METADATA_ACCEPTED_SCHEMA_VERSIONS.has(parsed.schemaVersion)) return missingMetadata(normalizedIdentity);
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
const itemStateHydrateGeneration = new Map<string, number>();
let itemStateWriteChain: Promise<void> = Promise.resolve();
let itemStateStorageOverride: SyncItemStateStorage | null = null;
let itemStateDefaultStorage: SyncItemStateStorage | null = null;
let itemStateChannel: { postMessage(message: unknown): void; close(): void } | null = null;
let itemStateChannelWired = false;

/** Test seam: inject a fake storage; pass null to restore the IndexedDB-backed default.
 * `ephemeral: true` marks the override session-lifetime, exercising the no-IDB posture
 * (migration keeps the localStorage blob authoritative). */
export function setRemoteSyncItemStateStorageForTests(storage: SyncItemStateStorage | null, options: { ephemeral?: boolean } = {}): void {
  itemStateStorageOverride = storage;
  itemStateOverrideIsEphemeral = storage !== null && options.ephemeral === true;
  itemStateCache.clear();
  itemStateReady.clear();
}





class MemorySyncItemStateStorage implements SyncItemStateStorage {
  private rows = new Map<string, Record<string, unknown>>();
  private meta = new Map<string, Record<string, unknown>>();

  async readAllRows(identity: string): Promise<unknown[]> {
    return Array.from(this.rows.values()).filter(row => row.identity === identity);
  }

  async readRows(stateKeys: readonly string[]): Promise<unknown[]> {
    return stateKeys.map(stateKey => this.rows.get(stateKey)).filter((row): row is Record<string, unknown> => row !== undefined);
  }

  async putRows(rows: ReadonlyArray<{ stateKey: string }>): Promise<void> {
    for (const row of rows) this.rows.set(row.stateKey, row as Record<string, unknown>);
  }

  async deleteRows(stateKeys: readonly string[]): Promise<void> {
    for (const stateKey of stateKeys) this.rows.delete(stateKey);
  }

  async applyRows(puts: ReadonlyArray<{ stateKey: string }>, deleteKeys: readonly string[]): Promise<void> {
    for (const stateKey of deleteKeys) this.rows.delete(stateKey);
    for (const row of puts) this.rows.set(row.stateKey, row as Record<string, unknown>);
  }

  async clearIdentity(identity: string): Promise<void> {
    for (const [stateKey, row] of Array.from(this.rows)) {
      if (row.identity === identity) this.rows.delete(stateKey);
    }
  }

  async resetIdentityRows(
    identity: string,
    buildRows: ((outboxEntries: readonly unknown[]) => ReadonlyArray<{ stateKey: string }>) | null,
  ): Promise<void> {
    await this.clearIdentity(identity);


    if (buildRows) await this.putRows(buildRows([]));
  }

  async readMeta(key: string): Promise<unknown> {
    return this.meta.get(key) ?? null;
  }

  async putMeta(row: { key: string }): Promise<void> {
    this.meta.set(row.key, row as Record<string, unknown>);
  }

  async runStateMigrationTransaction(rows: ReadonlyArray<{ stateKey: string }>, sentinelRow: { key: string }): Promise<void> {
    for (const row of rows) this.rows.set(row.stateKey, row as Record<string, unknown>);
    this.meta.set(sentinelRow.key, sentinelRow as Record<string, unknown>);
  }
}

let itemStateStorageIsEphemeral = false;
let itemStateOverrideIsEphemeral = false;

function itemStateStorage(): SyncItemStateStorage {
  if (itemStateStorageOverride) return itemStateStorageOverride;
  if (!itemStateDefaultStorage) {
    if (typeof indexedDB === 'undefined') {
      itemStateDefaultStorage = new MemorySyncItemStateStorage();
      itemStateStorageIsEphemeral = true;
    } else {
      itemStateDefaultStorage = createIndexedDbSyncItemStateStorage();
      itemStateStorageIsEphemeral = false;
    }
  }
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


  const pendingReset = itemStateResetBarrier.get(identity);
  if (pendingReset) {
    return pendingReset.then(() => ensureRemoteSyncItemStateReady(identity));
  }



  if (itemStateResetPending.has(identity)) {
    return queueIdentityClear(identity).then(() => ensureRemoteSyncItemStateReady(identity));
  }
  const existing = itemStateReady.get(identity);
  if (existing) return existing;



  const generation = itemStateHydrateGeneration.get(identity) ?? 0;
  const hydrate = (async (): Promise<void> => {
    const raw = await itemStateStorage().readAllRows(identity);
    if ((itemStateHydrateGeneration.get(identity) ?? 0) !== generation) {
      itemStateReady.delete(identity);
      return ensureRemoteSyncItemStateReady(identity);
    }
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

function bumpItemStateGeneration(identity: string): void {
  itemStateHydrateGeneration.set(identity, (itemStateHydrateGeneration.get(identity) ?? 0) + 1);
}

export function invalidateRemoteSyncItemState(identity: string): void {
  bumpItemStateGeneration(identity);
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
  requireItemStateCache(identity); // Fail loudly at creation if the identity was never ensured.


  return (store, itemKey) => requireItemStateCache(identity).get(encodeRemoteSyncItemStateKey(identity, store, itemKey))?.version ?? null;
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







function mutateItemStateRows<T>(
  identity: string,
  stateKeys: readonly string[],
  mutate: (durableByKey: Map<string, RemoteSyncItemStateRow>) => { puts: RemoteSyncItemStateRow[]; deleteKeys: string[]; result: T },
): Promise<T> {
  return queueItemStateWrite(() => withItemStateLock(async () => {
    const storage = itemStateStorage();
    try {
      const durableByKey = new Map<string, RemoteSyncItemStateRow>();
      for (const value of await storage.readRows(stateKeys)) {
        const row = normalizeItemStateRow(value);
        if (row && row.identity === identity) durableByKey.set(row.stateKey, row);
      }
      const { puts, deleteKeys, result } = mutate(durableByKey);




      const cache = itemStateCache.get(identity);
      if (cache) {
        for (const stateKey of stateKeys) {
          const durable = durableByKey.get(stateKey);
          if (durable) cache.set(stateKey, durable);
          else cache.delete(stateKey);
        }
      }
      if (puts.length > 0 || deleteKeys.length > 0) {
        await storage.applyRows(puts, deleteKeys);
        if (cache) {
          for (const row of puts) cache.set(row.stateKey, row);
          for (const stateKey of deleteKeys) cache.delete(stateKey);
        }
        publishItemStateInvalidation(identity);
      }





      bumpItemStateGeneration(identity);
      return result;
    } catch (error) {
      // The durable state is now unknown relative to this tab's cache: drop the cache so the
      // next reader/writer re-hydrates from storage truth.
      invalidateRemoteSyncItemState(identity);
      throw error;
    }
  }));
}

export function recordRemoteSyncItemStateVersions(
  identity: string,
  records: ReadonlyArray<{ store: string; itemKey: string; version: number }>,
  options: { mode?: 'exact' | 'max' } = {}
): Promise<number> {
  if (records.length === 0) return Promise.resolve(0);
  const mode = options.mode ?? 'exact';
  const stateKeys = records.map(record => encodeRemoteSyncItemStateKey(identity, record.store, record.itemKey));
  return mutateItemStateRows(identity, stateKeys, durableByKey => {







    const working = new Map<string, RemoteSyncItemStateRow>();
    const touched = new Set<string>();
    for (const record of records) {
      const stateKey = encodeRemoteSyncItemStateKey(identity, record.store, record.itemKey);
      touched.add(stateKey);
      const current = working.get(stateKey) ?? durableByKey.get(stateKey);
      const nextVersion = mode === 'max' && current?.version !== undefined
        ? Math.max(current.version, record.version)
        : record.version;
      working.set(stateKey, {
        ...(current ?? { stateKey, identity, store: record.store, itemKey: record.itemKey }),
        version: nextVersion,
      });
    }
    const puts: RemoteSyncItemStateRow[] = [];
    for (const stateKey of touched) {
      const finalRow = working.get(stateKey)!;
      const durable = durableByKey.get(stateKey);
      if (!durable || JSON.stringify(durable) !== JSON.stringify(finalRow)) puts.push(finalRow);
    }



    const ephemeral = itemStateStorageOverride ? itemStateOverrideIsEphemeral : itemStateStorageIsEphemeral;
    if (ephemeral && puts.length > 0) {
      const mirror = itemStateBlobMirror.get(identity);
      if (mirror) {
        recordRemoteSyncItemVersions(mirror, identity, puts
          .filter(row => row.version !== undefined)
          .map(row => ({ store: row.store, itemKey: row.itemKey, version: row.version! })));
      }
    }
    return { puts, deleteKeys: [], result: puts.length };
  });
}

export function recordRemoteSyncItemMarkers(
  identity: string,
  mutations: ReadonlyArray<RemoteSyncItemMarkerMutation>
): Promise<void> {
  if (mutations.length === 0) return Promise.resolve();
  const stateKeys = mutations.map(mutation => encodeRemoteSyncItemStateKey(identity, mutation.store, mutation.itemKey));
  return mutateItemStateRows(identity, stateKeys, durableByKey => {



    const working = new Map<string, RemoteSyncItemStateRow | null>();
    for (const [stateKey, row] of durableByKey) working.set(stateKey, row);
    const touched = new Set<string>();
    for (const mutation of mutations) {
      const stateKey = encodeRemoteSyncItemStateKey(identity, mutation.store, mutation.itemKey);
      touched.add(stateKey);
      const current = working.get(stateKey) ?? null;
      const next: RemoteSyncItemStateRow = {
        ...(current ?? { stateKey, identity, store: mutation.store, itemKey: mutation.itemKey }),
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
        working.set(stateKey, null);
      } else {
        working.set(stateKey, next);
      }
    }
    const puts: RemoteSyncItemStateRow[] = [];
    const deleteKeys: string[] = [];
    for (const stateKey of touched) {
      const finalRow = working.get(stateKey) ?? null;
      const durable = durableByKey.get(stateKey);
      if (finalRow === null) {
        if (durable) deleteKeys.push(stateKey);
      } else if (!durable || JSON.stringify(durable) !== JSON.stringify(finalRow)) {
        puts.push(finalRow);
      }
    }
    return { puts, deleteKeys, result: undefined };
  });
}

const itemStateResetBarrier = new Map<string, Promise<void>>();




const itemStateResetPending = new Set<string>();






const itemStateResetRebuild = new Map<string, (outboxEntries: readonly unknown[]) => ReadonlyArray<RemoteSyncItemMarkerMaxMutation>>();

/** Test hook: collectors registered by reset calls persist by design; unit blocks that reuse an
 * identity across storage swaps clear them here. */
export function resetItemStateRebuildForTests(): void {
  itemStateResetRebuild.clear();
}
// Where each identity's localStorage blob lives (registered by the readiness gate) so the
// ephemeral posture can dual-write version commits into it.
const itemStateBlobMirror = new Map<string, RemoteSyncVersionStorage>();

function queueIdentityClear(identity: string): Promise<void> {
  return queueItemStateWrite(() => withItemStateLock(async () => {









    try {
      const rebuild = itemStateResetRebuild.get(identity);
      const storage = itemStateStorage();
      if (storage.resetIdentityRows) {



        await storage.resetIdentityRows(
          identity,
          rebuild ? raw => foldMarkerMaxMutationsToRows(identity, rebuild(raw)) : null,
        );
      } else {
        // Shim-only fallback (no atomic reset): the poison window still guards this tab; the
        // cross-tab empty interval only exists on storages that never see real peers. Without
        // an entries read, the builder derives cover from an empty set.
        await storage.clearIdentity(identity);
        const rows = rebuild ? foldMarkerMaxMutationsToRows(identity, rebuild([])) : [];
        if (rows.length > 0) await storage.putRows(rows);
      }
    } catch (error) {



      itemStateResetPending.add(identity);
      invalidateRemoteSyncItemState(identity);
      throw error;
    }
    itemStateResetPending.delete(identity);
    invalidateRemoteSyncItemState(identity);
    publishItemStateInvalidation(identity);
  }));
}

function foldMarkerMaxMutationsToRows(
  identity: string,
  mutations: ReadonlyArray<RemoteSyncItemMarkerMaxMutation>
): RemoteSyncItemStateRow[] {
  const folded = new Map<string, RemoteSyncItemStateRow>();
  for (const mutation of mutations) {
    const stateKey = encodeRemoteSyncItemStateKey(identity, mutation.store, mutation.itemKey);
    const updatedAt = Math.max(0, Math.floor(mutation.updatedAt ?? 0));
    const deletedAt = Math.max(0, Math.floor(mutation.deletedAt ?? 0));
    if (updatedAt === 0 && deletedAt === 0) continue;
    const existing = folded.get(stateKey) ?? { stateKey, identity, store: mutation.store, itemKey: mutation.itemKey };
    if (updatedAt > (existing.updatedAt ?? 0)) existing.updatedAt = updatedAt;
    if (deletedAt > (existing.deletedAt ?? 0)) existing.deletedAt = deletedAt;
    folded.set(stateKey, existing);
  }
  return Array.from(folded.values());
}

export interface RemoteSyncItemStateResetOptions {




  rebuildMarkers?: (outboxEntries: readonly unknown[]) => ReadonlyArray<RemoteSyncItemMarkerMaxMutation>;
}

export function resetRemoteSyncItemState(identity: string, options: RemoteSyncItemStateResetOptions = {}): Promise<void> {





  invalidateRemoteSyncItemState(identity);
  itemStateResetPending.add(identity);
  if (options.rebuildMarkers) itemStateResetRebuild.set(identity, options.rebuildMarkers);
  const clear = queueIdentityClear(identity);
  const barrier = clear.catch(() => undefined).then(() => {
    if (itemStateResetBarrier.get(identity) === barrier) itemStateResetBarrier.delete(identity);
  });
  itemStateResetBarrier.set(identity, barrier);
  return clear;
}

export interface RemoteSyncItemMarkerMaxMutation {
  store: string;
  itemKey: string;
  updatedAt?: number;
  deletedAt?: number;
}







export function recordRemoteSyncItemMarkersMax(
  identity: string,
  mutations: ReadonlyArray<RemoteSyncItemMarkerMaxMutation>
): Promise<void> {
  if (mutations.length === 0) return Promise.resolve();
  const folded = new Map<string, { store: string; itemKey: string; updatedAt: number; deletedAt: number }>();
  for (const mutation of mutations) {
    const stateKey = encodeRemoteSyncItemStateKey(identity, mutation.store, mutation.itemKey);
    const existing = folded.get(stateKey) ?? { store: mutation.store, itemKey: mutation.itemKey, updatedAt: 0, deletedAt: 0 };
    existing.updatedAt = Math.max(existing.updatedAt, Math.max(0, Math.floor(mutation.updatedAt ?? 0)));
    existing.deletedAt = Math.max(existing.deletedAt, Math.max(0, Math.floor(mutation.deletedAt ?? 0)));
    folded.set(stateKey, existing);
  }
  const stateKeys = Array.from(folded.keys());
  return mutateItemStateRows(identity, stateKeys, durableByKey => {
    const puts: RemoteSyncItemStateRow[] = [];
    for (const [stateKey, target] of folded) {
      const current = durableByKey.get(stateKey);
      const currentUpdatedAt = current?.updatedAt ?? 0;
      const currentDeletedAt = current?.deletedAt ?? 0;
      const nextUpdatedAt = Math.max(currentUpdatedAt, target.updatedAt);
      const nextDeletedAt = Math.max(currentDeletedAt, target.deletedAt);
      if (nextUpdatedAt === currentUpdatedAt && nextDeletedAt === currentDeletedAt) continue;
      const next: RemoteSyncItemStateRow = {
        ...(current ?? { stateKey, identity, store: target.store, itemKey: target.itemKey }),
      };
      if (nextUpdatedAt > 0) next.updatedAt = nextUpdatedAt;
      if (nextDeletedAt > 0) next.deletedAt = nextDeletedAt;
      puts.push(next);
    }
    return { puts, deleteKeys: [], result: undefined };
  });
}

export interface RemoteSyncItemMarkerRestore {
  store: string;
  itemKey: string;
  /** The marker values the ABANDONED attempt produced — restoration applies only while the
   * durable row still holds exactly these (0 = absent). */
  expectedUpdatedAt: number;
  expectedDeletedAt: number;
  /** The pre-attempt values to restore (null restores absence). */
  updatedAt: number | null;
  deletedAt: number | null;
}







export function restoreRemoteSyncItemMarkersIfUnchanged(
  identity: string,
  restores: ReadonlyArray<RemoteSyncItemMarkerRestore>
): Promise<number> {
  if (restores.length === 0) return Promise.resolve(0);
  const stateKeys = restores.map(restore => encodeRemoteSyncItemStateKey(identity, restore.store, restore.itemKey));
  return mutateItemStateRows(identity, stateKeys, durableByKey => {
    const puts: RemoteSyncItemStateRow[] = [];
    const deleteKeys: string[] = [];
    let restored = 0;
    for (const restore of restores) {
      const stateKey = encodeRemoteSyncItemStateKey(identity, restore.store, restore.itemKey);
      const current = durableByKey.get(stateKey);
      const currentUpdatedAt = current?.updatedAt ?? 0;
      const currentDeletedAt = current?.deletedAt ?? 0;
      if (currentUpdatedAt !== restore.expectedUpdatedAt || currentDeletedAt !== restore.expectedDeletedAt) continue;
      const next: RemoteSyncItemStateRow = {
        ...(current ?? { stateKey, identity, store: restore.store, itemKey: restore.itemKey }),
      };
      if (restore.updatedAt === null) delete next.updatedAt;
      else next.updatedAt = restore.updatedAt;
      if (restore.deletedAt === null) delete next.deletedAt;
      else next.deletedAt = restore.deletedAt;
      restored += 1;
      if (next.version === undefined && next.updatedAt === undefined && next.deletedAt === undefined) {
        if (current) deleteKeys.push(stateKey);
        continue;
      }
      puts.push(next);
    }
    return { puts, deleteKeys, result: restored };
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
  options: { cleanupLocalStorage?: () => void; now?: number; sentinelKey?: string } = {}
): Promise<RemoteSyncItemStateMigrationResult> {


  return queueItemStateWrite(() => withItemStateLock(async () => {
    const storage = itemStateStorage();




    const sentinelKey = options.sentinelKey ?? migrationSentinelKey(identity);
    const existing = await storage.readMeta(sentinelKey);
    if (existing && typeof existing === 'object' && typeof (existing as Record<string, unknown>).completedAt === 'number') {
      options.cleanupLocalStorage?.();



      invalidateRemoteSyncItemState(identity);
      publishItemStateInvalidation(identity);
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
    // EXISTING-FIELD-WINS merge (Sol Critical-3): any row a live writer already recorded is
    // newer authority than the legacy snapshot — migration must never downgrade a version or
    // clobber a live marker. Fields only fill gaps.
    for (const value of await storage.readRows(Array.from(rowsByKey.keys()))) {
      const durable = normalizeItemStateRow(value);
      if (!durable || durable.identity !== identity) continue;
      const legacy = rowsByKey.get(durable.stateKey);
      if (!legacy) continue;
      rowsByKey.set(durable.stateKey, {
        ...legacy,
        ...durable,
      });
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
  }));
}






const itemVersionsMigrated = new Set<string>();

/**
 * Decode the blob's `store::itemKey` map keys back into records for the S7 migration snapshot.
 * Exported for the migration only; the encoding itself stays private to this module.
 */
function decodeItemVersionEntries(itemVersions: Record<string, number>): Array<{ store: string; itemKey: string; version: number }> {
  const records: Array<{ store: string; itemKey: string; version: number }> = [];
  for (const [key, version] of Object.entries(itemVersions)) {
    const separator = key.indexOf('::');
    if (separator <= 0) continue;
    try {
      records.push({
        store: decodeURIComponent(key.slice(0, separator)),
        itemKey: decodeURIComponent(key.slice(separator + 2)),
        version,
      });
    } catch {
      // An undecodable legacy key is dropped from the snapshot rather than poisoning the
      // migration; the item re-records its version on its next accepted write or pull.
    }
  }
  return records;
}









export function migrateRemoteSyncVersionsFromLocalStorage(
  storage: RemoteSyncVersionStorage,
  identity: string
): Promise<RemoteSyncItemStateMigrationResult> {
  const state = readRemoteSyncVersionMetadata(storage, identity);
  const versionRecords = state.needsFullPull ? [] : decodeItemVersionEntries(state.itemVersions);
  itemStateStorage(); // Resolve the backend first so the ephemeral check below is accurate.



  const ephemeral = itemStateStorageOverride ? itemStateOverrideIsEphemeral : itemStateStorageIsEphemeral;
  const cleanupLocalStorage = ephemeral ? undefined : () => {
      const current = readRemoteSyncVersionMetadata(storage, identity);
      if (current.needsFullPull) return; // No blob (or an unreadable one): nothing to strip.
      if (Object.keys(current.itemVersions).length === 0) return; // Already stripped.
      writeRemoteSyncVersionMetadata(storage, {
        identity: current.identity,
        latestVersion: current.latestVersion,
        itemVersions: {},
        pullCursor: current.pullCursor,
        pullCursors: current.pullCursors,
      });
    };
  return migrateRemoteSyncItemStateToIdb(identity, { versionRecords, markerRecords: [] }, {
    ...(cleanupLocalStorage ? { cleanupLocalStorage } : {}),
  });
}

/**
 * The Wave 5 readiness gate: every sync entry path (pull, drain, reconcile, enqueue,
 * quarantine requeue) awaits this before touching per-item versions. Migrate-once is
 * process-local memoized; the migration itself is sentinel-guarded and cross-tab locked, so
 * repeated calls converge cheaply.
 */
export async function ensureRemoteSyncItemVersionsActive(
  storage: RemoteSyncVersionStorage,
  identity: string
): Promise<void> {
  if (!itemVersionsMigrated.has(identity)) {
    await migrateRemoteSyncVersionsFromLocalStorage(storage, identity);
    itemVersionsMigrated.add(identity);
  }




  itemStateBlobMirror.set(identity, storage);
  await ensureRemoteSyncItemStateReady(identity);






  const ephemeral = itemStateStorageOverride ? itemStateOverrideIsEphemeral : itemStateStorageIsEphemeral;
  if (ephemeral) return; // The blob map IS the durable source there; never strip or re-import.





  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = readRemoteSyncVersionMetadata(storage, identity);
    if (state.needsFullPull) return;
    const importedMapJson = JSON.stringify(state.itemVersions);
    if (importedMapJson === '{}') return;
    const entries = decodeItemVersionEntries(state.itemVersions);


    if (entries.length > 0) await recordRemoteSyncItemStateVersions(identity, entries, { mode: 'max' });
    const recheck = readRemoteSyncVersionMetadata(storage, identity);
    if (recheck.needsFullPull) return;
    if (JSON.stringify(recheck.itemVersions) !== importedMapJson) continue; // New artifact: import it too.
    writeRemoteSyncVersionMetadata(storage, {
      identity: recheck.identity,
      latestVersion: recheck.latestVersion,
      itemVersions: {},
      pullCursor: recheck.pullCursor,
      pullCursors: recheck.pullCursors,
    });
    await ensureRemoteSyncItemStateReady(identity);
    return;
  }
  await ensureRemoteSyncItemStateReady(identity);
}









export function migrateRemoteSyncItemMarkersToIdb(
  identity: string,
  markerRecords: RemoteSyncItemStateMigrationSnapshot['markerRecords'],
  options: { cleanupLocalStorage?: () => void; now?: number } = {}
): Promise<RemoteSyncItemStateMigrationResult> {
  return migrateRemoteSyncItemStateToIdb(identity, { versionRecords: [], markerRecords }, {
    ...options,
    sentinelKey: `markers-migration/${encodeURIComponent(identity)}`,
  });
}

/** Whether the current item-state backend is session-lifetime memory (no IndexedDB). Callers
 * use this to keep localStorage authoritative (skip cleanup, dual-write) on that posture. */
export function isRemoteSyncItemStateEphemeral(): boolean {
  itemStateStorage();
  return itemStateStorageOverride ? itemStateOverrideIsEphemeral : itemStateStorageIsEphemeral;
}

/** Test seam: forget the process-local migrate-once memo (the sentinel still governs truth). */
export function resetItemVersionsMigrationMemoForTests(): void {
  itemVersionsMigrated.clear();
}
