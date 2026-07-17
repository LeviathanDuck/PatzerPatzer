





import { SYNC_MANIFEST_STORE_NAMES } from './generatedManifest';

export const REMOTE_SYNC_PAYLOAD_SCHEMA_VERSION = 1;

export const REMOTE_SYNC_STORE_NAMES = SYNC_MANIFEST_STORE_NAMES;

export type RemoteSyncStoreName = typeof REMOTE_SYNC_STORE_NAMES[number];
export type RemoteSyncOperation = 'upsert' | 'delete';

export interface RemoteSyncItem {
  store:     RemoteSyncStoreName;
  itemKey:   string;
  updatedAt: number;
  payload?:  unknown;
  deleted?:  boolean;
  operation?: RemoteSyncOperation;
}

export const REMOTE_SYNC_STORE_PAYLOAD_VERSIONS: Record<RemoteSyncStoreName, number> =
  Object.fromEntries(
    REMOTE_SYNC_STORE_NAMES.map(store => [store, REMOTE_SYNC_PAYLOAD_SCHEMA_VERSION]),
  ) as Record<RemoteSyncStoreName, number>;

export type RemoteSyncItemMigrationResult =
  | { ok: true; item: RemoteSyncItem; migratedFrom: number; migratedTo: number }
  | { ok: false; reason: string; store?: string; itemKey?: string };

export type RemoteSyncPayloadMigrationResult =
  | { ok: true; payload: unknown; migratedFrom: number; migratedTo: number }
  | { ok: false; reason: string };

export interface RemoteSyncItemMigrationOptions {
  requireUpdatedAt?: boolean;









  canonicalizePayload?: (item: RemoteSyncItem) => RemoteSyncItem | null;
}

const STORE_NAME_SET = new Set<string>(REMOTE_SYNC_STORE_NAMES);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isRemoteSyncStoreName(value: unknown): value is RemoteSyncStoreName {
  return typeof value === 'string' && STORE_NAME_SET.has(value);
}

function payloadSchemaVersion(payload: unknown): number {
  const obj = objectValue(payload);
  const explicit = obj?.syncSchemaVersion ?? obj?.schemaVersion;
  return typeof explicit === 'number' && Number.isFinite(explicit)
    ? Math.max(1, Math.floor(explicit))
    : 1;
}

function migrateSettingsPayload(itemKey: string, payload: unknown): RemoteSyncPayloadMigrationResult {
  if (typeof payload === 'string') {
    return {
      ok: true,
      payload: { key: itemKey, value: payload },
      migratedFrom: 1,
      migratedTo: REMOTE_SYNC_PAYLOAD_SCHEMA_VERSION,
    };
  }

  const obj = objectValue(payload);
  if (!obj) return { ok: false, reason: 'Settings payload must be a string or { key, value } object.' };
  if (typeof obj.key !== 'string' || obj.key !== itemKey) {
    return { ok: false, reason: 'Settings payload key does not match sync item key.' };
  }
  if (typeof obj.value !== 'string') return { ok: false, reason: 'Settings payload value must be a string.' };

  return {
    ok: true,
    payload,
    migratedFrom: payloadSchemaVersion(payload),
    migratedTo: REMOTE_SYNC_PAYLOAD_SCHEMA_VERSION,
  };
}

export function migrateSyncItemPayload(
  store: RemoteSyncStoreName,
  itemKey: string,
  payload: unknown,
): RemoteSyncPayloadMigrationResult {
  const currentVersion = REMOTE_SYNC_STORE_PAYLOAD_VERSIONS[store];
  const fromVersion = payloadSchemaVersion(payload);
  if (fromVersion > currentVersion) return { ok: false, reason: `Payload schema v${fromVersion} is newer than supported v${currentVersion}.` };

  if (store === 'settings') return migrateSettingsPayload(itemKey, payload);

  if (store === 'saved-review-puzzles') {
    if (!Array.isArray(payload) && !objectValue(payload)) return { ok: false, reason: 'Saved review puzzle payload must be an array or object.' };
    return { ok: true, payload, migratedFrom: fromVersion, migratedTo: currentVersion };
  }

  if (!objectValue(payload)) return { ok: false, reason: `${store} payload must be an object.` };
  return { ok: true, payload, migratedFrom: fromVersion, migratedTo: currentVersion };
}

export function migrateRemoteSyncItem(
  raw: unknown,
  options: RemoteSyncItemMigrationOptions = {},
): RemoteSyncItemMigrationResult {
  const item = objectValue(raw);
  if (!item) return { ok: false, reason: 'Sync item must be an object.' };

  const storeValue = item.store;
  const store = isRemoteSyncStoreName(storeValue) ? storeValue : undefined;
  const itemKey = typeof item.itemKey === 'string' && item.itemKey.trim()
    ? item.itemKey.trim()
    : undefined;
  if (!store) {
    return {
      ok: false,
      reason: 'Unsupported sync store.',
      ...(typeof storeValue === 'string' ? { store: storeValue } : {}),
      ...(itemKey ? { itemKey } : {}),
    };
  }
  if (!itemKey) return { ok: false, reason: 'Sync item is missing itemKey.', store };

  const hasUpdatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt);
  if (!hasUpdatedAt && options.requireUpdatedAt) {
    return { ok: false, reason: 'Remote sync item is missing a valid updatedAt timestamp.', store, itemKey };
  }
  const updatedAt = hasUpdatedAt ? Math.max(0, Math.floor(item.updatedAt as number)) : Date.now();
  const deleted = item.deleted === true || item.operation === 'delete';
  if (deleted) {
    return {
      ok: true,
      item: { store, itemKey, updatedAt, deleted: true, operation: 'delete' },
      migratedFrom: REMOTE_SYNC_PAYLOAD_SCHEMA_VERSION,
      migratedTo: REMOTE_SYNC_PAYLOAD_SCHEMA_VERSION,
    };
  }

  if (!('payload' in item)) return { ok: false, reason: 'Upsert sync item is missing payload.', store, itemKey };




  let payload = item.payload;
  if (options.canonicalizePayload) {
    const canonical = options.canonicalizePayload({ store, itemKey, updatedAt, payload, operation: 'upsert' });
    if (!canonical) {
      return { ok: false, reason: 'Practice payload could not be canonicalized to plain data.', store, itemKey };
    }
    payload = canonical.payload;
  }
  const migrated = migrateSyncItemPayload(store, itemKey, payload);
  if (!migrated.ok) return { ok: false, reason: migrated.reason, store, itemKey };

  return {
    ok: true,
    item: { store, itemKey, updatedAt, payload: migrated.payload, operation: 'upsert' },
    migratedFrom: migrated.migratedFrom,
    migratedTo: migrated.migratedTo,
  };
}
