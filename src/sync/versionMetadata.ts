export interface RemoteSyncVersionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RemoteSyncVersionMetadata {
  identity: string;
  latestVersion: number;
  itemVersions: Record<string, number>;
}

export interface RemoteSyncVersionMetadataState extends RemoteSyncVersionMetadata {
  needsFullPull: boolean;
}

export type RemoteSyncVersionWriteReadiness =
  | { ok: true; latestVersion: number }
  | { ok: false; reason: 'needs-full-pull' };

const METADATA_SCHEMA_VERSION = 1;
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

function missingMetadata(identity: string): RemoteSyncVersionMetadataState {
  return {
    identity: assertNonEmpty(identity, 'identity'),
    latestVersion: 0,
    itemVersions: {},
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
    };
    if (parsed.schemaVersion !== METADATA_SCHEMA_VERSION) return missingMetadata(normalizedIdentity);
    if (parsed.identity !== normalizedIdentity) return missingMetadata(normalizedIdentity);
    if (!validVersion(parsed.latestVersion)) return missingMetadata(normalizedIdentity);
    const itemVersions = normalizeItemVersions(parsed.itemVersions);
    if (!itemVersions) return missingMetadata(normalizedIdentity);

    return {
      identity: normalizedIdentity,
      latestVersion: parsed.latestVersion,
      itemVersions,
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
  const itemVersions = normalizeItemVersions(metadata.itemVersions);
  if (!itemVersions) throw new Error('itemVersions must map item keys to non-negative integer versions.');

  storage.setItem(metadataStorageKey(identity), JSON.stringify({
    schemaVersion: METADATA_SCHEMA_VERSION,
    identity,
    latestVersion: metadata.latestVersion,
    itemVersions,
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
