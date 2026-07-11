import type { RemoteSyncStoreName } from './remoteSyncMigrations';

export type VersionedOutboxOperation = 'upsert' | 'delete';









export type VersionedConflictIntent = 'recreate-over-tombstone';

export interface VersionedWriteOp {
  opId: string;
  store: RemoteSyncStoreName;
  itemKey: string;
  operation: VersionedOutboxOperation;
  baseVersion: number | null;
  payload?: unknown;
  clientUpdatedAt?: number;
  conflictIntent?: VersionedConflictIntent;
}

export interface DurableRetryOutboxEntry extends VersionedWriteOp {
  enqueuedAt: number;
  lastAttemptAt?: number;
  attemptCount: number;
  nextAttemptAt: number;
  lastError?: string;
  blockedByOpId?: string;
}





export interface DurableQuarantineRecord extends DurableRetryOutboxEntry {
  /** Rejection classification: 'attempt-cap' for a retry-count quarantine, or the server's
   * non-retryable rejection code (e.g. 'invalid-payload', 'unsupported-store'). */
  code: string;
  message: string;
  quarantinedAt: number;
}

export interface VersionedOutboxEnqueueInput {
  opId?: string;
  store: RemoteSyncStoreName;
  itemKey: string;
  operation: VersionedOutboxOperation;
  baseVersion: number | null;
  payload?: unknown;
  clientUpdatedAt?: number;
  conflictIntent?: VersionedConflictIntent;
}

export interface VersionedOutboxEnqueueOptions {
  now?: number;
  opId?: string;
}

export interface DurableVersionedOutboxStorage {
  readEntries(): Promise<unknown[]>;
  writeEntries(entries: readonly DurableRetryOutboxEntry[]): Promise<void>;
  /**
   * Optional keyed fast paths (store is already `keyPath: opId`). When present, removal and
   * changed-entry writes use these instead of the full read-all/filter/write-all rewrite, which
   * is the O(n^2) cost identified for large drains (pre-audit ledger S-1). Storage
   * implementations that only provide readEntries/writeEntries (legacy storages and existing
   * test fakes) keep working through the full-rewrite fallback below.
   */
  deleteEntries?(opIds: readonly string[]): Promise<void>;
  putEntries?(entries: readonly DurableRetryOutboxEntry[]): Promise<void>;
  /**
   * Optional keyed/counted READ fast paths (BUG-2026-07-05-008). S-1 gave writes keyed paths but
   * left every read a full-store getAll; at ~20k payload-bearing entries the drain's per-batch
   * bookkeeping (attempt stamping, failure stamping, progress counting) materialized the whole
   * outbox 2-3 times per 100-item batch and froze the tab. These let the drain touch only the
   * rows it needs. Same optionality contract as the write fast paths: legacy storages and test
   * fakes that omit them keep working through the full-read fallbacks below.
   */
  countEntries?(): Promise<number>;
  getEntries?(opIds: readonly string[]): Promise<unknown[]>;
  /**
   * Cursor window over the store in opId key order: up to `limit` raw rows with opId strictly
   * greater than `afterOpId` (null starts from the first key). Lets the drain scan the queue in
   * batch-sized windows instead of one full getAll.
   */
  readEntriesRange?(afterOpId: string | null, limit: number): Promise<unknown[]>;








  getEntriesByItemKey?(store: string, itemKey: string): Promise<unknown[]>;






  getEntriesByItemKeys?(keys: ReadonlyArray<{ store: string; itemKey: string }>): Promise<unknown[][]>;
  applyItemKeyMutations?(mutations: ReadonlyArray<DurableVersionedOutboxItemKeyMutation>): Promise<void>;






  readQuarantineRecords?(): Promise<unknown[]>;
  writeQuarantineRecords?(records: readonly DurableQuarantineRecord[]): Promise<void>;
  removeQuarantineRecords?(opIds: readonly string[]): Promise<void>;
}

export interface DurableVersionedOutboxItemKeyMutation {
  store: string;
  itemKey: string;
  deleteOpIds: readonly string[];
  putEntries: readonly DurableRetryOutboxEntry[];
}

const OUTBOX_DB_NAME = 'patzer-remoteSync-versioned-outbox';










const OUTBOX_DB_VERSION = 3;
const OUTBOX_STORE_NAME = 'entries';
const QUARANTINE_STORE_NAME = 'quarantine';
const OUTBOX_BY_ITEM_KEY_INDEX = 'byItemKey';
// S7 relocation targets (dormant in v3): compact per-item sync state keyed by an encoded
// identity/store/itemKey string; migration sentinels/schema state; and a preservation store for
// malformed or future-schema legacy-mirror values that cannot safely become normal entries
// (those rows may lack any usable key, hence the out-of-line autoIncrement key).
const SYNC_ITEM_STATE_STORE_NAME = 'sync-item-state';
const SYNC_ITEM_STATE_META_STORE_NAME = 'sync-item-state-meta';
const LEGACY_OUTBOX_RECOVERY_STORE_NAME = 'legacy-outbox-recovery';
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

// --- Cross-tab mutex (audit F-7, Phase 3 P5e) ---------------------------------------------------
// Every outbox mutation below is a read-modify-write against the shared IndexedDB store. Two
// same-profile tabs mutating concurrently can silently drop each other's fresh enqueues (a lost
// write intent) or resurrect just-removed entries. `withDurableOutboxLock` serializes every
// mutation entry point (enqueue, mark-attempt, record-failure, remove, quarantine write/remove)
// through one named Web Lock so only one RMW runs at a time, including across tabs. Pure reads
// (readDurableVersionedOutbox, dueDurableVersionedOutboxEntries, readQuarantineRecords) are not
// wrapped -- they never race destructively with each other, only with mutations, and the version
// they observe was already stale the instant a concurrent mutation lands regardless of locking.
//
// Fallback: when `navigator.locks` is unavailable (Node test harnesses, older browsers), mutations
// instead serialize through a module-local promise chain. This ONLY guarantees ordering within the
// current tab/process -- it provides no cross-tab exclusion at all, so the F-7 race remains
// possible across tabs whenever the real Web Locks API isn't present. That is an accepted gap:
// Node has no tabs to guard, and pre-Web-Locks browsers predate any realistic multi-tab exposure
// for this beta app.
const OUTBOX_LOCK_NAME = 'patzer-remoteSync-outbox';

let outboxLockChain: Promise<unknown> = Promise.resolve();

async function withDurableOutboxLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks && typeof locks.request === 'function') {
    // `await` here (rather than returning the request() promise directly) matters for more than
    // style: lib.dom.d.ts types LockGrantedCallback as `(lock) => T`, not `T | PromiseLike<T>`, so
    // a callback returning `Promise<T>` makes `request()`'s declared return `Promise<Promise<T>>`
    // -- `await`'s `Awaited<T>` normalization is what makes the resulting type (and, matching real
    // Web Locks behavior, the runtime value) the flattened `T`, not a nested promise.
    return await locks.request(OUTBOX_LOCK_NAME, () => fn());
  }
  const run = outboxLockChain.then(fn, fn);
  // Normalize the chain itself back to a resolved promise regardless of `run`'s outcome, so one
  // failed mutation never wedges every mutation queued behind it; the failure still propagates to
  // this call's own caller via the returned `run` promise.
  outboxLockChain = run.then(() => undefined, () => undefined);
  return run;
}

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
  if (input.operation === 'upsert' && input.conflictIntent !== undefined) entry.conflictIntent = input.conflictIntent;
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
  if (value.operation === 'upsert' && value.conflictIntent === 'recreate-over-tombstone') {
    entry.conflictIntent = 'recreate-over-tombstone';
  }
  if (value.clientUpdatedAt !== undefined) entry.clientUpdatedAt = Math.floor(value.clientUpdatedAt);
  if (value.lastAttemptAt !== undefined) entry.lastAttemptAt = Math.floor(value.lastAttemptAt);
  if (typeof value.lastError === 'string') entry.lastError = value.lastError;
  if (typeof value.blockedByOpId === 'string' && value.blockedByOpId.trim()) entry.blockedByOpId = value.blockedByOpId.trim();
  return entry;
}

function normalizeQuarantineRecord(raw: unknown): DurableQuarantineRecord | null {
  const entry = normalizeEntry(raw);
  if (!entry) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.code !== 'string' || !value.code.trim()) return null;
  if (typeof value.message !== 'string') return null;
  if (!validTime(value.quarantinedAt)) return null;
  return {
    ...entry,
    code: value.code.trim(),
    message: value.message,
    quarantinedAt: Math.floor(value.quarantinedAt as number),
  };
}

function sortQuarantineRecords(records: DurableQuarantineRecord[]): DurableQuarantineRecord[] {
  return records.slice().sort((left, right) => {
    if (left.quarantinedAt !== right.quarantinedAt) return left.quarantinedAt - right.quarantinedAt;
    return left.opId.localeCompare(right.opId);
  });
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
  if (entry.operation === 'upsert' && entry.conflictIntent !== undefined) next.conflictIntent = entry.conflictIntent;
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
    // A later ordinary upsert coalescing over a marked one is still the same unsynced new row —
    // the recreate intent survives in either direction (union). A delete replacing the upsert
    // (coalesceDelete) drops the entry and the intent with it: the user deleted the game again.
    if (nextIntent.conflictIntent === undefined && incoming.conflictIntent !== undefined) {
      nextIntent.conflictIntent = incoming.conflictIntent;
    }
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







export function buildRecreateRequeueInput(
  record: Pick<DurableRetryOutboxEntry, 'store' | 'itemKey' | 'payload' | 'clientUpdatedAt'>,
  current: { payload?: unknown; updatedAt: number } | null,
  baseVersion: number | null,
): VersionedOutboxEnqueueInput {
  const useCurrent = current !== null;
  return {
    store: record.store,
    itemKey: record.itemKey,
    operation: 'upsert',
    baseVersion,
    payload: useCurrent ? current.payload : record.payload,
    clientUpdatedAt: useCurrent ? current.updatedAt : (record.clientUpdatedAt ?? Date.now()),
    conflictIntent: 'recreate-over-tombstone',
  };
}

export interface RecreateOverTombstoneDecision {
  /** The conflicting server tombstone must NOT be applied locally — the local payload is the
   * user's explicit re-import and the whole point is that it survives. */
  skipLocalApply: true;
  /** The same upsert rebased onto the tombstone's version as its CAS base. */
  nextWrite: VersionedWriteOp;
}








export function decideRecreateOverTombstone(
  entry: DurableRetryOutboxEntry,
  current: { version: number; deleted: boolean },
): RecreateOverTombstoneDecision | null {
  if (entry.conflictIntent !== 'recreate-over-tombstone') return null;



  if (entry.store !== 'games') return null;
  if (entry.operation !== 'upsert') return null;
  if (!current.deleted) return null;
  const nextWrite: VersionedWriteOp = {
    opId: createOpId(),
    store: entry.store,
    itemKey: entry.itemKey,
    operation: 'upsert',
    baseVersion: current.version,
    payload: entry.payload,
    // The retry is still the same explicit-import wish, so the intent rides along; it can only
    // fire again on a FRESH tombstone conflict while this op is still queued.
    conflictIntent: 'recreate-over-tombstone',
  };
  if (entry.clientUpdatedAt !== undefined) nextWrite.clientUpdatedAt = entry.clientUpdatedAt;
  return { skipLocalApply: true, nextWrite };
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

/**
 * Queue size without materializing entries: storage `count()` when available, full-read length
 * otherwise. The keyed count includes raw rows that normalizeEntry would drop; that skew is
 * acceptable for progress denominators/remaining counts, which is all this feeds.
 */
export async function countDurableVersionedOutboxEntries(
  storage: DurableVersionedOutboxStorage = defaultDurableVersionedOutboxStorage()
): Promise<number> {
  if (storage.countEntries) return storage.countEntries();
  return (await readDurableVersionedOutbox(storage)).length;
}

/** Keyed normalized reads for specific opIds, falling back to a full read + filter. */
export async function getDurableVersionedOutboxEntriesByOpId(
  storage: DurableVersionedOutboxStorage,
  opIds: readonly string[]
): Promise<DurableRetryOutboxEntry[]> {
  if (opIds.length === 0) return [];
  if (storage.getEntries) {
    const raw = await storage.getEntries(opIds);
    return sortEntries(raw
      .map(normalizeEntry)
      .filter((entry): entry is DurableRetryOutboxEntry => entry !== null));
  }
  const ids = new Set(opIds);
  return (await readDurableVersionedOutbox(storage)).filter(entry => ids.has(entry.opId));
}

export interface DurableVersionedOutboxWindow {
  /** Normalized entries in this window, in opId key order. */
  entries: DurableRetryOutboxEntry[];
  /** Raw opId of the last row scanned (normalized or not); pass back as `afterOpId` to continue. */
  lastScannedOpId: string | null;
  /** Raw rows scanned in this window; 0 means the scan reached the end of the store. */
  scannedCount: number;
}

/**
 * Reads one opId-ordered window of up to `limit` rows starting strictly after `afterOpId`
 * (BUG-2026-07-05-008). The fallback for storages without `readEntriesRange` reads everything
 * once and slices — only test fakes and legacy storages take that path.
 */
export async function readDurableVersionedOutboxWindow(
  storage: DurableVersionedOutboxStorage,
  afterOpId: string | null,
  limit: number
): Promise<DurableVersionedOutboxWindow> {
  const cappedLimit = Math.max(1, Math.floor(limit));
  let raw: unknown[];
  if (storage.readEntriesRange) {
    raw = await storage.readEntriesRange(afterOpId, cappedLimit);
  } else {
    const all = (await storage.readEntries())
      .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value))
      .filter(value => typeof value.opId === 'string')
      // Code-unit order, matching IDB string-key order and the `>` continuation comparison below.
      .sort((left, right) => {
        const a = left.opId as string;
        const b = right.opId as string;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    const startIndex = afterOpId === null
      ? 0
      : all.findIndex(value => (value.opId as string) > afterOpId);
    raw = startIndex === -1 ? [] : all.slice(startIndex, startIndex + cappedLimit);
  }
  const entries = raw
    .map(normalizeEntry)
    .filter((entry): entry is DurableRetryOutboxEntry => entry !== null);
  const last = raw.length > 0 ? raw[raw.length - 1] : null;
  const lastScannedOpId = last && typeof last === 'object' && typeof (last as Record<string, unknown>).opId === 'string'
    ? ((last as Record<string, unknown>).opId as string)
    : afterOpId;
  return { entries, lastScannedOpId, scannedCount: raw.length };
}

export async function writeDurableVersionedOutbox(
  storage: DurableVersionedOutboxStorage,
  entries: readonly DurableRetryOutboxEntry[]
): Promise<void> {
  await storage.writeEntries(sortEntries(entries.slice()));
}

function hasItemKeyFastPath(storage: DurableVersionedOutboxStorage): storage is DurableVersionedOutboxStorage & {
  getEntriesByItemKey(store: string, itemKey: string): Promise<unknown[]>;
  applyItemKeyMutations(mutations: ReadonlyArray<DurableVersionedOutboxItemKeyMutation>): Promise<void>;
} {
  return Boolean(storage.getEntriesByItemKey && storage.applyItemKeyMutations);
}

async function readSameKeyEntries(
  storage: DurableVersionedOutboxStorage & { getEntriesByItemKey(store: string, itemKey: string): Promise<unknown[]> },
  store: string,
  itemKey: string
): Promise<DurableRetryOutboxEntry[]> {
  const raw = await storage.getEntriesByItemKey(store, itemKey);
  return sortEntries(raw
    .map(normalizeEntry)
    .filter((entry): entry is DurableRetryOutboxEntry => entry !== null));
}

// Delta between a same-key subset before and after a pure coalesce/replace decision: rows that
// vanished are deletes, rows that are new or changed (by opId, structural compare) are puts.
// The pure functions never mutate in place, so an untouched row compares identical and is
// skipped — the storage only ever writes what actually changed.
function diffSameKeyEntries(
  before: readonly DurableRetryOutboxEntry[],
  after: readonly DurableRetryOutboxEntry[]
): { deleteOpIds: string[]; putEntries: DurableRetryOutboxEntry[] } {
  const afterById = new Map(after.map(entry => [entry.opId, entry]));
  const beforeById = new Map(before.map(entry => [entry.opId, entry]));
  const deleteOpIds = before.filter(entry => !afterById.has(entry.opId)).map(entry => entry.opId);
  const putEntries = after.filter(entry => {
    const previous = beforeById.get(entry.opId);
    return !previous || JSON.stringify(previous) !== JSON.stringify(entry);
  });
  return { deleteOpIds, putEntries };
}

function pickEnqueueResult(
  next: readonly DurableRetryOutboxEntry[],
  incoming: DurableRetryOutboxEntry
): DurableRetryOutboxEntry {
  return next.find(entry => entry.opId === incoming.opId)
    ?? next.find(entry => sameKey(entry, incoming) && entry.operation === incoming.operation)
    ?? incoming;
}

export async function enqueueDurableVersionedOutboxEntry(
  storage: DurableVersionedOutboxStorage,
  input: VersionedOutboxEnqueueInput,
  options: VersionedOutboxEnqueueOptions = {}
): Promise<DurableRetryOutboxEntry> {
  const incoming = makeEntry(input, options);
  return withDurableOutboxLock(async () => {


    if (hasItemKeyFastPath(storage)) {
      const subset = await readSameKeyEntries(storage, incoming.store, incoming.itemKey);
      const next = coalesceDurableVersionedOutboxEntry(subset, incoming);
      const delta = diffSameKeyEntries(subset, next);
      if (delta.deleteOpIds.length > 0 || delta.putEntries.length > 0) {
        await storage.applyItemKeyMutations([{ store: incoming.store, itemKey: incoming.itemKey, ...delta }]);
      }
      return pickEnqueueResult(next, incoming);
    }
    const entries = await readDurableVersionedOutbox(storage);
    const next = coalesceDurableVersionedOutboxEntry(entries, incoming);
    await writeDurableVersionedOutbox(storage, next);
    return pickEnqueueResult(next, incoming);
  });
}










export async function replaceDurableVersionedOutboxEntry(
  storage: DurableVersionedOutboxStorage,
  previousOpId: string,
  input: VersionedOutboxEnqueueInput,
  options: VersionedOutboxEnqueueOptions = {}
): Promise<DurableRetryOutboxEntry | null> {
  const incoming = makeEntry(input, options);
  return withDurableOutboxLock(async () => {




    if (hasItemKeyFastPath(storage)) {
      const previous = (await getDurableVersionedOutboxEntriesByOpId(storage, [previousOpId]))[0];
      const subset = await readSameKeyEntries(storage, incoming.store, incoming.itemKey);
      const entries = subset.filter(entry => entry.opId !== previousOpId);
      const decision = decideReplaceOutcome(entries, incoming, previous);
      const mutations: DurableVersionedOutboxItemKeyMutation[] = [];
      if (decision.cancelled) {
        if (previous) {
          mutations.push({ store: previous.store, itemKey: previous.itemKey, deleteOpIds: [previous.opId], putEntries: [] });
        }
        if (mutations.length > 0) await storage.applyItemKeyMutations(mutations);
        return null;
      }
      const next = coalesceDurableVersionedOutboxEntry(entries, incoming);
      const delta = diffSameKeyEntries(entries, next);
      const deleteOpIds = [...delta.deleteOpIds];
      if (previous && sameKey(previous, incoming)) {
        deleteOpIds.push(previous.opId);
      } else if (previous) {
        // A cross-key previous (not expected from the conflict path, but the API allows it)
        // rides in the same atomic transaction as its own key's mutation.
        mutations.push({ store: previous.store, itemKey: previous.itemKey, deleteOpIds: [previous.opId], putEntries: [] });
      }
      mutations.push({ store: incoming.store, itemKey: incoming.itemKey, deleteOpIds, putEntries: delta.putEntries });
      await storage.applyItemKeyMutations(mutations);
      return pickEnqueueResult(next, incoming);
    }
    const all = await readDurableVersionedOutbox(storage);
    const previous = all.find(entry => entry.opId === previousOpId);
    const entries = all.filter(entry => entry.opId !== previousOpId);











    const decision = decideReplaceOutcome(entries, incoming, previous);
    if (decision.cancelled) {
      await writeDurableVersionedOutbox(storage, entries);
      return null;
    }
    const next = coalesceDurableVersionedOutboxEntry(entries, incoming);
    await writeDurableVersionedOutbox(storage, next);
    return pickEnqueueResult(next, incoming);
  });
}

// The F3 causal delete-wins decision, shared VERBATIM by the keyed and legacy replace paths so
// they can never drift (`entries` is always the same-key set with `previousOpId` already
// filtered out; on the keyed path that set comes from the byItemKey index).
function decideReplaceOutcome(
  entries: readonly DurableRetryOutboxEntry[],
  incoming: DurableRetryOutboxEntry,
  previous: DurableRetryOutboxEntry | undefined
): { cancelled: boolean } {
  const laterDelete = incoming.operation === 'upsert'
    && entries.some(entry => sameKey(entry, incoming)
      && entry.operation === 'delete'
      && (previous === undefined
        || (entry.opId !== previous.blockedByOpId && entry.enqueuedAt >= previous.enqueuedAt)));
  return { cancelled: laterDelete };
}








export async function enqueueDurableVersionedOutboxEntries(
  storage: DurableVersionedOutboxStorage,
  inputs: readonly VersionedOutboxEnqueueInput[],
  options: { now?: number } = {}
): Promise<DurableRetryOutboxEntry[]> {
  if (inputs.length === 0) {
    if (hasItemKeyFastPath(storage)) return [];
    return readDurableVersionedOutbox(storage);
  }
  return withDurableOutboxLock(async () => {
    if (hasItemKeyFastPath(storage)) {




      const incomingEntries = inputs.map(input => makeEntry(input, options.now !== undefined ? { now: options.now } : {}));
      const groups = new Map<string, { store: RemoteSyncStoreName; itemKey: string; entries: DurableRetryOutboxEntry[] }>();
      for (const incoming of incomingEntries) {
        const key = `${incoming.store}\u0000${incoming.itemKey}`;
        const group = groups.get(key);
        if (group) {
          group.entries.push(incoming);
        } else {
          groups.set(key, { store: incoming.store as RemoteSyncStoreName, itemKey: incoming.itemKey, entries: [incoming] });
        }
      }



      const groupList = Array.from(groups.values());
      let beforeSubsets: DurableRetryOutboxEntry[][];
      if (storage.getEntriesByItemKeys) {
        const raw = await storage.getEntriesByItemKeys(groupList.map(group => ({ store: group.store, itemKey: group.itemKey })));
        beforeSubsets = groupList.map((_, index) => sortEntries((raw[index] ?? [])
          .map(normalizeEntry)
          .filter((entry): entry is DurableRetryOutboxEntry => entry !== null)));
      } else {
        beforeSubsets = [];
        for (const group of groupList) {
          beforeSubsets.push(await readSameKeyEntries(storage, group.store, group.itemKey));
        }
      }
      const mutations: DurableVersionedOutboxItemKeyMutation[] = [];
      const finalEntries: DurableRetryOutboxEntry[] = [];
      for (let index = 0; index < groupList.length; index += 1) {
        const group = groupList[index]!;
        const before = beforeSubsets[index]!;
        let subset = before;
        for (const incoming of group.entries) {
          subset = coalesceDurableVersionedOutboxEntry(subset, incoming);
        }
        const delta = diffSameKeyEntries(before, subset);
        if (delta.deleteOpIds.length > 0 || delta.putEntries.length > 0) {
          mutations.push({ store: group.store, itemKey: group.itemKey, ...delta });
        }
        finalEntries.push(...subset);
      }
      if (mutations.length > 0) await storage.applyItemKeyMutations(mutations);
      return sortEntries(finalEntries);
    }
    let entries = await readDurableVersionedOutbox(storage);
    const presentKeys = new Set(entries.map(entry => `${entry.store}\u0000${entry.itemKey}`));
    let appended: DurableRetryOutboxEntry[] = [];
    for (const input of inputs) {
      const incoming = makeEntry(input, options.now !== undefined ? { now: options.now } : {});
      const key = `${incoming.store}\u0000${incoming.itemKey}`;
      if (presentKeys.has(key)) {
        entries = coalesceDurableVersionedOutboxEntry([...entries, ...appended], incoming);
        appended = [];
      } else {
        appended.push(incoming);
        presentKeys.add(key);
      }
    }
    const next = appended.length > 0 ? sortEntries([...entries, ...appended]) : entries;
    await writeDurableVersionedOutbox(storage, next);
    return next;
  });
}

export function nextDurableVersionedOutboxBackoffMs(attemptCount: number, jitterMs = 0): number {
  const attempt = Math.max(1, Math.floor(attemptCount));
  const base = DURABLE_VERSIONED_OUTBOX_BACKOFF_MS[Math.min(attempt - 1, DURABLE_VERSIONED_OUTBOX_BACKOFF_MS.length - 1)] ?? MAX_BACKOFF_MS;
  return Math.min(MAX_BACKOFF_MS, Math.max(0, base + Math.floor(jitterMs)));
}

// Writes only the entries that actually changed, via the storage's keyed `putEntries` when
// available; falls back to a full-rewrite `writeEntries` for old-style storages (S-1). `next` is
// still returned so callers/tests can inspect the resulting full set without a second read.
async function putChangedEntries(
  storage: DurableVersionedOutboxStorage,
  next: readonly DurableRetryOutboxEntry[],
  changed: readonly DurableRetryOutboxEntry[]
): Promise<void> {
  if (changed.length === 0) return;
  if (storage.putEntries) {
    await storage.putEntries(changed);
    return;
  }
  await writeDurableVersionedOutbox(storage, next);
}

export async function markDurableVersionedOutboxAttemptStarted(
  storage: DurableVersionedOutboxStorage,
  opIds: readonly string[],
  options: { now?: number } = {}
): Promise<DurableRetryOutboxEntry[]> {
  const ids = new Set(opIds);
  const now = normalizeNow(options.now);
  return withDurableOutboxLock(async () => {
    // Keyed path (BUG-2026-07-05-008): touch only the target opIds instead of materializing the
    // whole payload-bearing outbox to stamp one batch. Returns just the updated entries; the
    // drain ignores the return value and the legacy full-read path below keeps its full-set
    // return for storages/tests without the keyed methods.
    if (storage.getEntries && storage.putEntries) {
      const targets = (await storage.getEntries(opIds))
        .map(normalizeEntry)
        .filter((entry): entry is DurableRetryOutboxEntry => entry !== null && ids.has(entry.opId));
      const changed = targets.map(entry => ({ ...entry, lastAttemptAt: now }));
      if (changed.length > 0) await storage.putEntries(changed);
      return sortEntries(changed);
    }
    const entries = await readDurableVersionedOutbox(storage);
    const changed: DurableRetryOutboxEntry[] = [];
    const next = entries.map(entry => {
      if (!ids.has(entry.opId)) return entry;
      const updated = { ...entry, lastAttemptAt: now };
      changed.push(updated);
      return updated;
    });
    await putChangedEntries(storage, next, changed);
    return next;
  });
}

export async function recordDurableVersionedOutboxFailure(
  storage: DurableVersionedOutboxStorage,
  opIds: readonly string[],
  error: string,
  options: { now?: number; jitterMs?: number } = {}
): Promise<DurableRetryOutboxEntry[]> {
  const ids = new Set(opIds);
  const now = normalizeNow(options.now);
  const failedEntry = (entry: DurableRetryOutboxEntry): DurableRetryOutboxEntry => {
    const attemptCount = entry.attemptCount + 1;
    return {
      ...entry,
      attemptCount,
      lastAttemptAt: now,
      nextAttemptAt: now + nextDurableVersionedOutboxBackoffMs(attemptCount, options.jitterMs ?? 0),
      lastError: error,
    };
  };
  return withDurableOutboxLock(async () => {
    // Keyed path (BUG-2026-07-05-008): same shape as markDurableVersionedOutboxAttemptStarted —
    // read-modify-write only the failed opIds, never the whole outbox.
    if (storage.getEntries && storage.putEntries) {
      const changed = (await storage.getEntries(opIds))
        .map(normalizeEntry)
        .filter((entry): entry is DurableRetryOutboxEntry => entry !== null && ids.has(entry.opId))
        .map(failedEntry);
      if (changed.length > 0) await storage.putEntries(changed);
      return sortEntries(changed);
    }
    const entries = await readDurableVersionedOutbox(storage);
    const changed: DurableRetryOutboxEntry[] = [];
    const next = entries.map(entry => {
      if (!ids.has(entry.opId)) return entry;
      const updated = failedEntry(entry);
      changed.push(updated);
      return updated;
    });
    await putChangedEntries(storage, next, changed);
    return next;
  });
}

// Deletes the drained opIds via the storage's keyed `deleteEntries` when available — one
// transaction, only the drained keys touched — instead of read-all/filter/clear+put-all (S-1,
// the biggest single win for large drains). Falls back to the full-rewrite path for old-style
// storages. The keyed path never needs to read the full store, so it skips straight to deletion.
export async function removeDurableVersionedOutboxEntries(
  storage: DurableVersionedOutboxStorage,
  opIds: readonly string[]
): Promise<void> {
  if (opIds.length === 0) return;
  const ids = Array.from(new Set(opIds));
  await withDurableOutboxLock(async () => {
    if (storage.deleteEntries) {
      await storage.deleteEntries(ids);
      return;
    }
    const idSet = new Set(ids);
    const next = (await readDurableVersionedOutbox(storage)).filter(entry => !idSet.has(entry.opId));
    await writeDurableVersionedOutbox(storage, next);
  });
}








export async function writeQuarantineRecords(
  records: readonly DurableQuarantineRecord[],
  storage: DurableVersionedOutboxStorage = defaultDurableVersionedOutboxStorage()
): Promise<void> {
  if (records.length === 0) return;
  const write = storage.writeQuarantineRecords?.bind(storage);
  if (!write) {
    throw new Error('Quarantine storage is unavailable for this outbox storage backend.');
  }
  await withDurableOutboxLock(() => write(records));
}

export async function readQuarantineRecords(
  storage: DurableVersionedOutboxStorage = defaultDurableVersionedOutboxStorage()
): Promise<DurableQuarantineRecord[]> {
  if (!storage.readQuarantineRecords) return [];
  const raw = await storage.readQuarantineRecords();
  const records = raw
    .map(normalizeQuarantineRecord)
    .filter((record): record is DurableQuarantineRecord => record !== null);
  return sortQuarantineRecords(records);
}

export async function removeQuarantineRecords(
  opIds: readonly string[],
  storage: DurableVersionedOutboxStorage = defaultDurableVersionedOutboxStorage()
): Promise<void> {
  if (opIds.length === 0) return;
  const remove = storage.removeQuarantineRecords?.bind(storage);
  if (!remove) return;
  const ids = Array.from(new Set(opIds));
  await withDurableOutboxLock(() => remove(ids));
}

export async function dueDurableVersionedOutboxEntries(
  storage: DurableVersionedOutboxStorage,
  now = Date.now()
): Promise<DurableRetryOutboxEntry[]> {
  const at = normalizeNow(now);
  return (await readDurableVersionedOutbox(storage)).filter(entry => entry.nextAttemptAt <= at);
}





let onOutboxUpgradeBlocked: ((dbName: string) => void) | null = null;

export function setOnOutboxUpgradeBlocked(handler: ((dbName: string) => void) | null): void {
  onOutboxUpgradeBlocked = handler;
}

function openOutboxDb(dbName = OUTBOX_DB_NAME): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable for the durable RemoteSync outbox.');
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, OUTBOX_DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Could not open durable RemoteSync outbox database.'));
    request.onblocked = () => {
      try {
        onOutboxUpgradeBlocked?.(dbName);
      } catch {
        // Reporting must never break the open; the request keeps waiting for the blocker.
      }
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      // Only ever creates missing stores/indexes, so an upgrade from ANY prior version (v0
      // fresh, v1, v2) converges on the same v3 schema in this one versionchange transaction
      // and pre-existing rows survive untouched. A failure anywhere in here aborts the whole
      // versionchange transaction atomically — the database stays at its prior version.
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'opId' });
      }
      if (!db.objectStoreNames.contains(QUARANTINE_STORE_NAME)) {
        db.createObjectStore(QUARANTINE_STORE_NAME, { keyPath: 'opId' });
      }
      // v3 (dormant until Wave 3+): the keyed-coalesce index over the pre-existing entries
      // store must be created through the upgrade transaction's store handle.
      const upgradeTx = request.transaction;
      if (upgradeTx) {
        const entriesStore = upgradeTx.objectStore(OUTBOX_STORE_NAME);
        if (!entriesStore.indexNames.contains(OUTBOX_BY_ITEM_KEY_INDEX)) {
          entriesStore.createIndex(OUTBOX_BY_ITEM_KEY_INDEX, ['store', 'itemKey'], { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(SYNC_ITEM_STATE_STORE_NAME)) {
        db.createObjectStore(SYNC_ITEM_STATE_STORE_NAME, { keyPath: 'stateKey' });
      }
      if (!db.objectStoreNames.contains(SYNC_ITEM_STATE_META_STORE_NAME)) {
        db.createObjectStore(SYNC_ITEM_STATE_META_STORE_NAME, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(LEGACY_OUTBOX_RECOVERY_STORE_NAME)) {
        db.createObjectStore(LEGACY_OUTBOX_RECOVERY_STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      const db = request.result;



      db.onversionchange = () => db.close();
      resolve(db);
    };
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
    async deleteEntries(opIds: readonly string[]): Promise<void> {
      if (opIds.length === 0) return;
      const db = await openOutboxDb(dbName);
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
          tx.onerror = () => reject(tx.error ?? new Error('Could not delete durable RemoteSync outbox entries.'));
          tx.onabort = () => reject(tx.error ?? new Error('Durable RemoteSync outbox delete aborted.'));
          tx.oncomplete = () => resolve();
          const store = tx.objectStore(OUTBOX_STORE_NAME);
          for (const opId of opIds) store.delete(opId);
        });
      } finally {
        db.close();
      }
    },
    async putEntries(entries: readonly DurableRetryOutboxEntry[]): Promise<void> {
      if (entries.length === 0) return;
      const db = await openOutboxDb(dbName);
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
          tx.onerror = () => reject(tx.error ?? new Error('Could not write durable RemoteSync outbox entries.'));
          tx.onabort = () => reject(tx.error ?? new Error('Durable RemoteSync outbox entry write aborted.'));
          tx.oncomplete = () => resolve();
          const store = tx.objectStore(OUTBOX_STORE_NAME);
          for (const entry of entries) store.put(entry);
        });
      } finally {
        db.close();
      }
    },





    async getEntriesByItemKey(store: string, itemKey: string): Promise<unknown[]> {
      const db = await openOutboxDb(dbName);
      try {
        return await new Promise((resolve, reject) => {
          const objectStore = db.transaction(OUTBOX_STORE_NAME, 'readonly').objectStore(OUTBOX_STORE_NAME);
          const indexNames = (objectStore as { indexNames?: { contains?(name: string): boolean } }).indexNames;
          const hasIndex = typeof objectStore.index === 'function'
            && (typeof indexNames?.contains !== 'function' || indexNames.contains(OUTBOX_BY_ITEM_KEY_INDEX));
          if (hasIndex) {
            let request: IDBRequest | null = null;
            try {
              request = objectStore.index(OUTBOX_BY_ITEM_KEY_INDEX).getAll([store, itemKey]);
            } catch {
              request = null; // Shim advertised index() but has no byItemKey — use the fallback.
            }
            if (request) {
              const indexed = request;
              indexed.onerror = () => reject(indexed.error ?? new Error('Could not read durable RemoteSync outbox entries by item key.'));
              indexed.onsuccess = () => resolve(Array.isArray(indexed.result) ? indexed.result : []);
              return;
            }
          }
          const request = objectStore.getAll();
          request.onerror = () => reject(request.error ?? new Error('Could not read durable RemoteSync outbox entries by item key.'));
          request.onsuccess = () => {
            const rows = Array.isArray(request.result) ? request.result : [];
            resolve(rows.filter(row => {
              const record = row as Record<string, unknown> | null;
              return !!record && record.store === store && record.itemKey === itemKey;
            }));
          };
        });
      } finally {
        db.close();
      }
    },
    async getEntriesByItemKeys(keys: ReadonlyArray<{ store: string; itemKey: string }>): Promise<unknown[][]> {
      if (keys.length === 0) return [];
      const db = await openOutboxDb(dbName);
      try {
        return await new Promise((resolve, reject) => {



          const objectStore = db.transaction(OUTBOX_STORE_NAME, 'readonly').objectStore(OUTBOX_STORE_NAME);
          const indexNames = (objectStore as { indexNames?: { contains?(name: string): boolean } }).indexNames;
          const hasIndex = typeof objectStore.index === 'function'
            && (typeof indexNames?.contains !== 'function' || indexNames.contains(OUTBOX_BY_ITEM_KEY_INDEX));
          let index: IDBIndex | null = null;
          if (hasIndex) {
            try {
              index = objectStore.index(OUTBOX_BY_ITEM_KEY_INDEX);
            } catch {
              index = null; // Shim advertised index() but has no byItemKey — use the fallback.
            }
          }
          if (index) {
            const indexed = index;
            const results: unknown[][] = new Array(keys.length);
            let pending = keys.length;
            keys.forEach((key, position) => {
              const request = indexed.getAll([key.store, key.itemKey]);
              request.onerror = () => reject(request.error ?? new Error('Could not read durable RemoteSync outbox entries by item keys.'));
              request.onsuccess = () => {
                results[position] = Array.isArray(request.result) ? request.result : [];
                pending -= 1;
                if (pending === 0) resolve(results);
              };
            });
            return;
          }
          const request = objectStore.getAll();
          request.onerror = () => reject(request.error ?? new Error('Could not read durable RemoteSync outbox entries by item keys.'));
          request.onsuccess = () => {
            const rows = Array.isArray(request.result) ? request.result : [];
            resolve(keys.map(key => rows.filter(row => {
              const record = row as Record<string, unknown> | null;
              return !!record && record.store === key.store && record.itemKey === key.itemKey;
            })));
          };
        });
      } finally {
        db.close();
      }
    },
    async applyItemKeyMutations(mutations: ReadonlyArray<DurableVersionedOutboxItemKeyMutation>): Promise<void> {
      const deleteOpIds = mutations.flatMap(mutation => mutation.deleteOpIds);
      const putEntries = mutations.flatMap(mutation => mutation.putEntries);
      if (deleteOpIds.length === 0 && putEntries.length === 0) return;
      const db = await openOutboxDb(dbName);
      try {
        await new Promise<void>((resolve, reject) => {
          // ONE readwrite transaction for every key's delta: a multi-key batch (or a replace's
          // previous-op delete + rebased retry) commits or aborts atomically.
          const tx = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
          tx.onerror = () => reject(tx.error ?? new Error('Could not apply durable RemoteSync outbox item-key mutations.'));
          tx.onabort = () => reject(tx.error ?? new Error('Durable RemoteSync outbox item-key mutation aborted.'));
          tx.oncomplete = () => resolve();
          const store = tx.objectStore(OUTBOX_STORE_NAME);



          try {
            for (const opId of deleteOpIds) store.delete(opId);
            for (const entry of putEntries) store.put(entry);
          } catch (error) {
            try {
              tx.abort();
            } catch {
              // Already aborting/inactive: the onabort/onerror handlers still settle the promise.
            }
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      } finally {
        db.close();
      }
    },
    // The three keyed read paths below feature-detect the store API they need (count/get/
    // IDBKeyRange) and fall back to a full getAll: partial IndexedDB shims in the Node test
    // harnesses only implement getAll/put/delete/clear, and the drain must behave identically —
    // just without the scaling win — when the fast primitive is missing. Real browsers always
    // take the keyed branch.
    async countEntries(): Promise<number> {
      const db = await openOutboxDb(dbName);
      try {
        return await new Promise((resolve, reject) => {
          const store = db.transaction(OUTBOX_STORE_NAME, 'readonly').objectStore(OUTBOX_STORE_NAME);
          if (typeof store.count === 'function') {
            const request = store.count();
            request.onerror = () => reject(request.error ?? new Error('Could not count durable RemoteSync outbox entries.'));
            request.onsuccess = () => resolve(typeof request.result === 'number' ? request.result : 0);
            return;
          }
          const request = store.getAll();
          request.onerror = () => reject(request.error ?? new Error('Could not count durable RemoteSync outbox entries.'));
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.length : 0);
        });
      } finally {
        db.close();
      }
    },
    async getEntries(opIds: readonly string[]): Promise<unknown[]> {
      if (opIds.length === 0) return [];
      const db = await openOutboxDb(dbName);
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(OUTBOX_STORE_NAME, 'readonly');
          tx.onerror = () => reject(tx.error ?? new Error('Could not read durable RemoteSync outbox entries by key.'));
          const store = tx.objectStore(OUTBOX_STORE_NAME);
          if (typeof store.get !== 'function') {
            const ids = new Set(opIds);
            const request = store.getAll();
            request.onerror = () => reject(request.error ?? new Error('Could not read durable RemoteSync outbox entries by key.'));
            request.onsuccess = () => resolve((Array.isArray(request.result) ? request.result : [])
              .filter(value => !!value && typeof value === 'object' && ids.has((value as Record<string, unknown>).opId as string)));
            return;
          }
          const results: unknown[] = [];
          let pending = opIds.length;
          for (const opId of opIds) {
            const request = store.get(opId);
            request.onsuccess = () => {
              if (request.result !== undefined) results.push(request.result);
              pending -= 1;
              if (pending === 0) resolve(results);
            };
            request.onerror = () => reject(request.error ?? new Error('Could not read a durable RemoteSync outbox entry by key.'));
          }
        });
      } finally {
        db.close();
      }
    },
    async readEntriesRange(afterOpId: string | null, limit: number): Promise<unknown[]> {
      const cappedLimit = Math.max(1, Math.floor(limit));
      const db = await openOutboxDb(dbName);
      try {
        const raw = await new Promise<unknown[]>((resolve, reject) => {
          const store = db.transaction(OUTBOX_STORE_NAME, 'readonly').objectStore(OUTBOX_STORE_NAME);
          const range = afterOpId !== null && typeof IDBKeyRange !== 'undefined'
            ? IDBKeyRange.lowerBound(afterOpId, true)
            : undefined;
          // getAll with a count bound materializes only this window, in opId key order.
          const request = store.getAll(range, cappedLimit);
          request.onerror = () => reject(request.error ?? new Error('Could not read a durable RemoteSync outbox window.'));
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        });
        // Defensive normalization: re-filter/sort/slice client-side so an environment whose
        // getAll ignores the range/count arguments still yields correct, TERMINATING windows
        // (without this, a range-ignoring shim would return the same rows every window and the
        // drain scan would never advance). Real browsers honor the range, making this a cheap
        // pass over at most `cappedLimit` already-ordered rows.
        return raw
          .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value))
          .filter(value => typeof value.opId === 'string' && (afterOpId === null || (value.opId as string) > afterOpId))
          .sort((left, right) => {
            const a = left.opId as string;
            const b = right.opId as string;
            return a < b ? -1 : a > b ? 1 : 0;
          })
          .slice(0, cappedLimit);
      } finally {
        db.close();
      }
    },
    async readQuarantineRecords(): Promise<unknown[]> {
      const db = await openOutboxDb(dbName);
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction(QUARANTINE_STORE_NAME, 'readonly').objectStore(QUARANTINE_STORE_NAME).getAll();
          request.onerror = () => reject(request.error ?? new Error('Could not read quarantined RemoteSync outbox records.'));
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        });
      } finally {
        db.close();
      }
    },
    async writeQuarantineRecords(records: readonly DurableQuarantineRecord[]): Promise<void> {
      if (records.length === 0) return;
      const db = await openOutboxDb(dbName);
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(QUARANTINE_STORE_NAME, 'readwrite');
          tx.onerror = () => reject(tx.error ?? new Error('Could not write quarantined RemoteSync outbox records.'));
          tx.onabort = () => reject(tx.error ?? new Error('Quarantined RemoteSync outbox record write aborted.'));
          tx.oncomplete = () => resolve();
          const store = tx.objectStore(QUARANTINE_STORE_NAME);
          for (const record of records) store.put(record);
        });
      } finally {
        db.close();
      }
    },
    async removeQuarantineRecords(opIds: readonly string[]): Promise<void> {
      if (opIds.length === 0) return;
      const db = await openOutboxDb(dbName);
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(QUARANTINE_STORE_NAME, 'readwrite');
          tx.onerror = () => reject(tx.error ?? new Error('Could not remove quarantined RemoteSync outbox records.'));
          tx.onabort = () => reject(tx.error ?? new Error('Quarantined RemoteSync outbox record removal aborted.'));
          tx.oncomplete = () => resolve();
          const store = tx.objectStore(QUARANTINE_STORE_NAME);
          for (const opId of opIds) store.delete(opId);
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
