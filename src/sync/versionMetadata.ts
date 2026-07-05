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
