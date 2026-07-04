import type { RemoteSyncStoreName } from './remoteSyncMigrations';

export type VersionedOutboxOperation = 'upsert' | 'delete';

export interface VersionedWriteOp {
  opId: string;
  store: RemoteSyncStoreName;
  itemKey: string;
  operation: VersionedOutboxOperation;
  baseVersion: number | null;
  payload?: unknown;
  clientUpdatedAt?: number;
}

export interface DurableRetryOutboxEntry extends VersionedWriteOp {
  enqueuedAt: number;
  lastAttemptAt?: number;
  attemptCount: number;
  nextAttemptAt: number;
  lastError?: string;
  blockedByOpId?: string;
}

export interface VersionedOutboxEnqueueInput {
  opId?: string;
  store: RemoteSyncStoreName;
  itemKey: string;
  operation: VersionedOutboxOperation;
  baseVersion: number | null;
  payload?: unknown;
  clientUpdatedAt?: number;
}

export interface VersionedOutboxEnqueueOptions {
  now?: number;
  opId?: string;
}

export interface DurableVersionedOutboxStorage {
  readEntries(): Promise<unknown[]>;
  writeEntries(entries: readonly DurableRetryOutboxEntry[]): Promise<void>;
}

const OUTBOX_DB_NAME = 'patzer-remoteSync-versioned-outbox';
const OUTBOX_DB_VERSION = 1;
const OUTBOX_STORE_NAME = 'entries';
const MAX_BACKOFF_MS = 10 * 60 * 1000;

export const DURABLE_VERSIONED_OUTBOX_BACKOFF_MS = Object.freeze([
  2_000,
  5_000,
  15_000,
  45_000,
  120_000,
  300_000,
]);

let defaultStorage: DurableVersionedOutboxStorage | null = null;

function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required for the durable RemoteSync outbox.`);
  return trimmed;
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeBaseVersion(value: unknown): number | null {
  if (value === null) return null;
  if (validVersion(value)) return value;
  throw new Error('baseVersion must be null or a non-negative integer.');
}

function normalizeOptionalTime(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!validTime(value)) throw new Error('timestamp fields must be non-negative finite numbers.');
  return Math.floor(value);
}

function normalizeNow(value: unknown): number {
  return Math.floor(normalizeOptionalTime(value) ?? Date.now());
}

function createOpId(): string {
  const maybeCrypto = globalThis.crypto;
  if (maybeCrypto && typeof maybeCrypto.randomUUID === 'function') return maybeCrypto.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sameKey(left: Pick<VersionedWriteOp, 'store' | 'itemKey'>, right: Pick<VersionedWriteOp, 'store' | 'itemKey'>): boolean {
  return left.store === right.store && left.itemKey === right.itemKey;
}

function validateEnqueueInput(input: VersionedOutboxEnqueueInput): void {
  assertNonEmpty(input.store, 'store');
  assertNonEmpty(input.itemKey, 'itemKey');
  normalizeBaseVersion(input.baseVersion);
  if (input.operation !== 'upsert' && input.operation !== 'delete') {
    throw new Error('operation must be upsert or delete.');
  }
  if (input.operation === 'upsert' && !Object.prototype.hasOwnProperty.call(input, 'payload')) {
    throw new Error('upsert operations require payload.');
  }
}

function makeEntry(input: VersionedOutboxEnqueueInput, options: VersionedOutboxEnqueueOptions = {}): DurableRetryOutboxEntry {
  validateEnqueueInput(input);
  const now = normalizeNow(options.now);
  const opId = assertNonEmpty(input.opId ?? options.opId ?? createOpId(), 'opId');
  const clientUpdatedAt = normalizeOptionalTime(input.clientUpdatedAt) ?? now;
  const entry: DurableRetryOutboxEntry = {
    opId,
    store: input.store,
    itemKey: assertNonEmpty(input.itemKey, 'itemKey'),
    operation: input.operation,
    baseVersion: normalizeBaseVersion(input.baseVersion),
    clientUpdatedAt,
    enqueuedAt: now,
    attemptCount: 0,
    nextAttemptAt: now,
  };
  if (input.operation === 'upsert') entry.payload = input.payload;
  return entry;
}

function normalizeEntry(raw: unknown): DurableRetryOutboxEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.operation !== 'upsert' && value.operation !== 'delete') return null;
  if (typeof value.opId !== 'string' || !value.opId.trim()) return null;
  if (typeof value.store !== 'string' || !value.store.trim()) return null;
  if (typeof value.itemKey !== 'string' || !value.itemKey.trim()) return null;
  if (value.baseVersion !== null && !validVersion(value.baseVersion)) return null;
  if (!validTime(value.enqueuedAt) || !validVersion(value.attemptCount) || !validTime(value.nextAttemptAt)) return null;
  if (value.clientUpdatedAt !== undefined && !validTime(value.clientUpdatedAt)) return null;
  if (value.lastAttemptAt !== undefined && !validTime(value.lastAttemptAt)) return null;
  if (value.lastError !== undefined && typeof value.lastError !== 'string') return null;
  if (value.blockedByOpId !== undefined && typeof value.blockedByOpId !== 'string') return null;
  if (value.operation === 'upsert' && !Object.prototype.hasOwnProperty.call(value, 'payload')) return null;

  const entry: DurableRetryOutboxEntry = {
    opId: value.opId.trim(),
    store: value.store.trim() as RemoteSyncStoreName,
    itemKey: value.itemKey.trim(),
    operation: value.operation,
    baseVersion: value.baseVersion,
    enqueuedAt: Math.floor(value.enqueuedAt),
    attemptCount: Math.floor(value.attemptCount),
    nextAttemptAt: Math.floor(value.nextAttemptAt),
  };
  if (value.operation === 'upsert') entry.payload = value.payload;
  if (value.clientUpdatedAt !== undefined) entry.clientUpdatedAt = Math.floor(value.clientUpdatedAt);
  if (value.lastAttemptAt !== undefined) entry.lastAttemptAt = Math.floor(value.lastAttemptAt);
  if (typeof value.lastError === 'string') entry.lastError = value.lastError;
  if (typeof value.blockedByOpId === 'string' && value.blockedByOpId.trim()) entry.blockedByOpId = value.blockedByOpId.trim();
  return entry;
}

function sortEntries(entries: DurableRetryOutboxEntry[]): DurableRetryOutboxEntry[] {
  return entries.slice().sort((left, right) => {
    if (left.enqueuedAt !== right.enqueuedAt) return left.enqueuedAt - right.enqueuedAt;
    return left.opId.localeCompare(right.opId);
  });
}

function resetRetryState(entry: DurableRetryOutboxEntry, now: number): DurableRetryOutboxEntry {
  const next: DurableRetryOutboxEntry = {
    opId: entry.opId,
    store: entry.store,
    itemKey: entry.itemKey,
    operation: entry.operation,
    baseVersion: entry.baseVersion,
    enqueuedAt: entry.enqueuedAt,
    attemptCount: 0,
    nextAttemptAt: now,
  };
  if (entry.operation === 'upsert') next.payload = entry.payload;
  if (entry.clientUpdatedAt !== undefined) next.clientUpdatedAt = entry.clientUpdatedAt;
  if (entry.blockedByOpId !== undefined) next.blockedByOpId = entry.blockedByOpId;
  return next;
}

function coalesceUpsert(entries: DurableRetryOutboxEntry[], incoming: DurableRetryOutboxEntry): DurableRetryOutboxEntry[] {
  let lastDeleteIndex = -1;
  let lastDeleteOpId = '';
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (sameKey(entry, incoming) && entry.operation === 'delete') {
      lastDeleteIndex = index;
      lastDeleteOpId = entry.opId;
    }
  }

  for (let index = lastDeleteIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (!sameKey(entry, incoming) || entry.operation !== 'upsert') continue;
    const nextIntent: DurableRetryOutboxEntry = {
      ...entry,
      payload: incoming.payload,
    };
    if (incoming.clientUpdatedAt !== undefined) nextIntent.clientUpdatedAt = incoming.clientUpdatedAt;
    const merged = resetRetryState(nextIntent, incoming.nextAttemptAt);
    const next = entries.slice();
    next[index] = merged;
    return sortEntries(next);
  }

  const nextEntry: DurableRetryOutboxEntry = { ...incoming };
  if (lastDeleteOpId) nextEntry.blockedByOpId = lastDeleteOpId;
  return sortEntries([...entries, nextEntry]);
}

function coalesceDelete(entries: DurableRetryOutboxEntry[], incoming: DurableRetryOutboxEntry): DurableRetryOutboxEntry[] {
  const withoutUnattemptedUpserts = entries.filter(entry => {
    return !sameKey(entry, incoming) || entry.operation !== 'upsert' || entry.attemptCount > 0;
  });

  for (let index = withoutUnattemptedUpserts.length - 1; index >= 0; index -= 1) {
    const entry = withoutUnattemptedUpserts[index]!;
    if (!sameKey(entry, incoming) || entry.operation !== 'delete' || entry.attemptCount > 0) continue;
    const nextIntent: DurableRetryOutboxEntry = { ...entry };
    if (incoming.clientUpdatedAt !== undefined) nextIntent.clientUpdatedAt = incoming.clientUpdatedAt;
    const merged = resetRetryState(nextIntent, incoming.nextAttemptAt);
    const next = withoutUnattemptedUpserts.slice();
    next[index] = merged;
    return sortEntries(next);
  }

  return sortEntries([...withoutUnattemptedUpserts, incoming]);
}

export function coalesceDurableVersionedOutboxEntry(
  entries: readonly DurableRetryOutboxEntry[],
  incoming: DurableRetryOutboxEntry
): DurableRetryOutboxEntry[] {
  const normalized = sortEntries(entries.slice());
  return incoming.operation === 'upsert'
    ? coalesceUpsert(normalized, incoming)
    : coalesceDelete(normalized, incoming);
}

export async function readDurableVersionedOutbox(
  storage: DurableVersionedOutboxStorage = defaultDurableVersionedOutboxStorage()
): Promise<DurableRetryOutboxEntry[]> {
  const raw = await storage.readEntries();
  const entries = raw
    .map(normalizeEntry)
    .filter((entry): entry is DurableRetryOutboxEntry => entry !== null);
  return sortEntries(entries);
}

export async function writeDurableVersionedOutbox(
  storage: DurableVersionedOutboxStorage,
  entries: readonly DurableRetryOutboxEntry[]
): Promise<void> {
  await storage.writeEntries(sortEntries(entries.slice()));
}

export async function enqueueDurableVersionedOutboxEntry(
  storage: DurableVersionedOutboxStorage,
  input: VersionedOutboxEnqueueInput,
  options: VersionedOutboxEnqueueOptions = {}
): Promise<DurableRetryOutboxEntry> {
  const incoming = makeEntry(input, options);
  const entries = await readDurableVersionedOutbox(storage);
  const next = coalesceDurableVersionedOutboxEntry(entries, incoming);
  await writeDurableVersionedOutbox(storage, next);
  return next.find(entry => entry.opId === incoming.opId) ?? next.find(entry => sameKey(entry, incoming) && entry.operation === incoming.operation) ?? incoming;
}

export function nextDurableVersionedOutboxBackoffMs(attemptCount: number, jitterMs = 0): number {
  const attempt = Math.max(1, Math.floor(attemptCount));
  const base = DURABLE_VERSIONED_OUTBOX_BACKOFF_MS[Math.min(attempt - 1, DURABLE_VERSIONED_OUTBOX_BACKOFF_MS.length - 1)] ?? MAX_BACKOFF_MS;
  return Math.min(MAX_BACKOFF_MS, Math.max(0, base + Math.floor(jitterMs)));
}

export async function markDurableVersionedOutboxAttemptStarted(
  storage: DurableVersionedOutboxStorage,
  opIds: readonly string[],
  options: { now?: number } = {}
): Promise<DurableRetryOutboxEntry[]> {
  const ids = new Set(opIds);
  const now = normalizeNow(options.now);
  const entries = await readDurableVersionedOutbox(storage);
  const next = entries.map(entry => {
    if (!ids.has(entry.opId)) return entry;
    return { ...entry, lastAttemptAt: now };
  });
  await writeDurableVersionedOutbox(storage, next);
  return next;
}

export async function recordDurableVersionedOutboxFailure(
  storage: DurableVersionedOutboxStorage,
  opIds: readonly string[],
  error: string,
  options: { now?: number; jitterMs?: number } = {}
): Promise<DurableRetryOutboxEntry[]> {
  const ids = new Set(opIds);
  const now = normalizeNow(options.now);
  const entries = await readDurableVersionedOutbox(storage);
  const next = entries.map(entry => {
    if (!ids.has(entry.opId)) return entry;
    const attemptCount = entry.attemptCount + 1;
    return {
      ...entry,
      attemptCount,
      lastAttemptAt: now,
      nextAttemptAt: now + nextDurableVersionedOutboxBackoffMs(attemptCount, options.jitterMs ?? 0),
      lastError: error,
    };
  });
  await writeDurableVersionedOutbox(storage, next);
  return next;
}

export async function removeDurableVersionedOutboxEntries(
  storage: DurableVersionedOutboxStorage,
  opIds: readonly string[]
): Promise<DurableRetryOutboxEntry[]> {
  const ids = new Set(opIds);
  const next = (await readDurableVersionedOutbox(storage)).filter(entry => !ids.has(entry.opId));
  await writeDurableVersionedOutbox(storage, next);
  return next;
}

export async function dueDurableVersionedOutboxEntries(
  storage: DurableVersionedOutboxStorage,
  now = Date.now()
): Promise<DurableRetryOutboxEntry[]> {
  const at = normalizeNow(now);
  return (await readDurableVersionedOutbox(storage)).filter(entry => entry.nextAttemptAt <= at);
}

function openOutboxDb(dbName = OUTBOX_DB_NAME): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable for the durable RemoteSync outbox.');
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, OUTBOX_DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Could not open durable RemoteSync outbox database.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'opId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export function createIndexedDbDurableVersionedOutboxStorage(dbName = OUTBOX_DB_NAME): DurableVersionedOutboxStorage {
  return {
    async readEntries(): Promise<unknown[]> {
      const db = await openOutboxDb(dbName);
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction(OUTBOX_STORE_NAME, 'readonly').objectStore(OUTBOX_STORE_NAME).getAll();
          request.onerror = () => reject(request.error ?? new Error('Could not read durable RemoteSync outbox.'));
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        });
      } finally {
        db.close();
      }
    },
    async writeEntries(entries: readonly DurableRetryOutboxEntry[]): Promise<void> {
      const db = await openOutboxDb(dbName);
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
          tx.onerror = () => reject(tx.error ?? new Error('Could not write durable RemoteSync outbox.'));
          tx.onabort = () => reject(tx.error ?? new Error('Durable RemoteSync outbox write aborted.'));
          tx.oncomplete = () => resolve();
          const store = tx.objectStore(OUTBOX_STORE_NAME);
          store.clear();
          for (const entry of entries) store.put(entry);
        });
      } finally {
        db.close();
      }
    },
  };
}

export function defaultDurableVersionedOutboxStorage(): DurableVersionedOutboxStorage {
  defaultStorage ??= createIndexedDbDurableVersionedOutboxStorage();
  return defaultStorage;
}
