import type { RemoteSyncStoreName } from './remoteSyncMigrations';
import {
  createRemoteSyncItemStateResolver,
  recordRemoteSyncItemVersions,
  ensureRemoteSyncItemStateReady,
  getRemoteSyncItemStateVersion,
  recordRemoteSyncItemStateVersions,
  readRemoteSyncVersionMetadata,
  type RemoteSyncVersionStorage,
} from './versionMetadata';
import {
  countDurableVersionedOutboxEntries,
  dueDurableVersionedOutboxEntries,
  getDurableVersionedOutboxEntriesByOpId,
  markDurableVersionedOutboxAttemptStarted,
  readDurableVersionedOutboxWindow,
  recordDurableVersionedOutboxFailure,
  recoverRejectedDurableVersionedOutboxRows,
  removeDurableVersionedOutboxEntries,
  type DurableOutboxBinding,
  type DurableRetryOutboxEntry,
  type DurableVersionedOutboxStorage,
  type OutboxFailureClass,
  type VersionedWriteOp,
} from './versionOutbox';

export interface VersionedSyncItem {
  store: RemoteSyncStoreName;
  itemKey: string;
  version: number;
  operation: 'upsert' | 'delete';
  deleted: boolean;
  updatedAt: number;
  payload?: unknown;
}

export interface VersionedAcceptedItem {
  opId: string;
  store: RemoteSyncStoreName;
  itemKey: string;
  operation: 'upsert' | 'delete';
  item: VersionedSyncItem;
}

export interface VersionedConflictItem {
  opId: string;
  store: RemoteSyncStoreName;
  itemKey: string;
  expectedBaseVersion: number | null;
  current?: VersionedSyncItem;
}

export interface VersionedRejectedItem {
  opId: string;
  store: RemoteSyncStoreName;
  itemKey?: string;
  code: 'invalid-payload' | 'unsupported-store' | 'legacy-write-rejected' | 'server-error' | string;
  retryable: boolean;
  message: string;
}

export interface VersionedWriteBatchRequest {
  protocol: 'version-cas-v1';
  clientId: string;
  items: VersionedWriteOp[];
}

export interface VersionedWriteBatchResponse {
  ok: true;
  accepted: VersionedAcceptedItem[];
  conflicts: VersionedConflictItem[];
  rejected: VersionedRejectedItem[];
  latestVersion: number;
  syncGeneration: number;
  generationReason: string;
}

export interface VersionedOutboxDrainOptions {
  outboxStorage: DurableVersionedOutboxStorage;
  versionStorage: RemoteSyncVersionStorage;
  identity: string;
  clientId: string;
  sendBatch(request: VersionedWriteBatchRequest): Promise<VersionedWriteBatchResponse>;
  acceptedAdapter?: VersionedAcceptedWriteAdapter;
  conflictAdapter?: VersionedConflictReconcileAdapter;
  now?: number;
  jitterMs?: number;
  batchSize?: number;







  onBatchProgress?(progress: VersionedOutboxDrainBatchProgress): void;










  onPermanentRejection?(entries: DurableRetryOutboxEntry[], rejections: VersionedRejectedItem[]): void | Promise<void>;









  onMetadataPersistenceFailure?(failure: { entries: DurableRetryOutboxEntry[]; errorName: string }): void;
  /** Attempt cap. With NO `activeBinding` (every current production caller): entries reaching
   * this total `attemptCount` are quarantined — the pre-Wave-8 legacy cap, byte-identical to
   * HEAD. With an `activeBinding` supplied (W8.2 policy, activated by W8.3): entries whose
   * DETERMINISTIC failure count reaches this cap are quarantined — transport/offline,
   * retryable-server, and metadata-persistence failures advance backoff but never quarantine. */
  maxAttempts?: number;













  activeBinding?: DurableOutboxBinding;








  classifySendBatchError?(error: unknown): OutboxFailureClass | undefined;
}

export interface VersionedOutboxDrainBatchProgress {
  /**
   * Fixed for the whole drain call: the operation total. On the legacy full-read path this is the
   * count of entries due at the start; on the keyed windowed path (BUG-2026-07-05-008) it is the
   * total queued-entry count at pass start — a superset of due, since an exact due count would
   * itself require the full-store scan the windowed path exists to avoid.
   */
  attempted: number;
  accepted: number;
  conflicts: number;
  rejected: number;
  backedOff: number;
  /** Durable outbox queue size measured immediately after this batch was processed. */
  remaining: number;
}

export interface VersionedAcceptedWriteAdapter {
  applyAccepted(item: VersionedSyncItem, accepted: VersionedAcceptedItem, entry: DurableRetryOutboxEntry): void | Promise<void>;
}

export interface VersionedConflictReconcileAdapter {
  applyCurrent(item: VersionedSyncItem, conflict: VersionedConflictItem, entry: DurableRetryOutboxEntry): void | Promise<void>;
  shouldReenqueue?(
    entry: DurableRetryOutboxEntry,
    current: VersionedSyncItem,
    conflict: VersionedConflictItem
  ): VersionedWriteOp | null | Promise<VersionedWriteOp | null>;
  reenqueue?(op: VersionedWriteOp, previous: DurableRetryOutboxEntry, current: VersionedSyncItem): void | Promise<void>;
}

export interface VersionedOutboxDrainResult {
  success: boolean;
  counts: Record<string, number>;
  error?: string;
}




const SAFE_STORAGE_ERROR_NAMES = new Set([
  'QuotaExceededError',
  'SecurityError',
  'AbortError',
  'InvalidStateError',
  'NotAllowedError',
  'UnknownError',
  'TypeError',
  'Error',
]);

export type VersionedPreWriteRevalidationTrigger = 'metadata-missing' | 'stale-cloud-state';

export interface VersionedPreWriteRevalidationResult {
  ok: boolean;
  latestVersion?: number;
  error?: string;
}

export interface VersionedPreWriteGateOptions {
  versionStorage: RemoteSyncVersionStorage;
  identity: string;
  cloudStateStale: boolean;
  revalidate(cursor: number, trigger: VersionedPreWriteRevalidationTrigger): Promise<VersionedPreWriteRevalidationResult>;
  drain(): Promise<VersionedOutboxDrainResult>;
}

export interface VersionedPreWriteGateResult {
  success: boolean;
  revalidated: boolean;
  forcedFullPull: boolean;
  drained: boolean;
  paused: boolean;
  cursorUsed?: number;
  counts: Record<string, number>;
  error?: string;
}

const DEFAULT_BATCH_SIZE = 100;
// Twelve attempts walks the full backoff schedule several times (over an hour of retries).
// Beyond that a failure is treated as deterministic and the entry is quarantined rather than
// re-pushed forever (BUG-2026-07-04-005).
const DEFAULT_MAX_DRAIN_ATTEMPTS = 12;











async function persistPermanentRejection(
  options: VersionedOutboxDrainOptions,
  entries: DurableRetryOutboxEntry[],
  rejections: VersionedRejectedItem[],
): Promise<boolean> {
  if (entries.length === 0) return true;
  if (!options.onPermanentRejection) return false;
  try {
    await options.onPermanentRejection(entries, rejections);
    return true;
  } catch {
    return false;
  }
}

function normalizeNow(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : Date.now();
}

function payloadKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(payloadKey).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${payloadKey(entry)}`).join(',')}}`;
}

function samePayload(left: unknown, right: unknown): boolean {
  return payloadKey(left) === payloadKey(right);
}

function requestItemFromEntry(entry: DurableRetryOutboxEntry): VersionedWriteOp {
  const item: VersionedWriteOp = {
    opId: entry.opId,
    store: entry.store,
    itemKey: entry.itemKey,
    operation: entry.operation,
    baseVersion: entry.baseVersion,
  };
  if (entry.operation === 'upsert') item.payload = entry.payload;
  if (entry.clientUpdatedAt !== undefined) item.clientUpdatedAt = entry.clientUpdatedAt;
  return item;
}

function matchingRecoveredConflict(entry: DurableRetryOutboxEntry, conflict: VersionedConflictItem): VersionedSyncItem | null {
  const current = conflict.current;
  if (!current) return null;
  if (current.store !== entry.store || current.itemKey !== entry.itemKey) return null;
  if (current.version <= (entry.baseVersion ?? 0)) return null;
  if (entry.operation === 'delete') {
    return current.deleted || current.operation === 'delete' ? current : null;
  }
  if (current.deleted || current.operation !== 'upsert') return null;
  return samePayload(current.payload, entry.payload) ? current : null;
}





async function recordAcceptedVersion(
  versionStorage: RemoteSyncVersionStorage,
  identity: string,
  item: VersionedSyncItem
): Promise<boolean> {
  await recordRemoteSyncItemStateVersions(identity, [{ store: item.store, itemKey: item.itemKey, version: item.version }]);
  // The display/back-compat latestVersion stays in the localStorage blob (Wave 5 keeps
  // cursors/latest there); an empty-records call advances it with max semantics only.
  recordRemoteSyncItemVersions(versionStorage, identity, [], item.version);
  await ensureRemoteSyncItemStateReady(identity);
  return getRemoteSyncItemStateVersion(identity, item.store, item.itemKey) === item.version;
}

function mergeCounts(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

// --- Cross-tab drain guard (audit F-7, Phase 3 P5e) ---------------------------------------------
// Two tabs (or an overlapping timer firing in the same tab) draining concurrently would both read
// the same due entries and both call sendBatch for them -- a double-send. `drainDurableVersionedOutbox`
// wraps the whole pass in a separate named Web Lock using `ifAvailable: true`: if another drain is
// already in flight anywhere in this origin, this call skips immediately instead of double-sending.
// This is a distinct lock name from the outbox mutation lock in versionOutbox.ts -- the drain lock
// is held around the whole pass (including the network awaits below), while the outbox lock is
// only ever held briefly inside each individual storage mutation the pass delegates to. Different
// lock names never nest-deadlock with each other; only re-acquiring the *same* name while already
// holding it would, and neither lock is ever requested recursively under itself.
const DRAIN_LOCK_NAME = 'patzer-remoteSync-drain';

// Wave 8 W8.2 fix round 2 (Sol IMPORTANT — disclosed shape choice): the rejected-row recovery
// scan is a full raw readEntries(), so running it on EVERY binding-active drain would
// re-materialize the whole queue per drain — exactly what the windowed drain exists to avoid. A
// bounded raw-key cursor would see every key type, but it needs a second storage read seam beyond
// the authorized surface (readEntriesRange's string-key continuation is structurally blind to
// non-string keys), so per the reviewer's fallback this takes the GATE shape instead: recover on
// the FIRST binding-active drain per session per storage object, and mark the storage
// session-clean ONLY when nothing is left undisposed (rejected === recovered, no throw). An
// undisposed or failed recovery is never marked, so every subsequent drain rescans and keeps
// failing closed — the gate skips work only while the store is provably clean. W8.3 owns the
// after-migration/on-demand call sites through the exported helper.
const sessionCleanRecoveryStorages = new WeakSet<DurableVersionedOutboxStorage>();

// Wave 8 (W8.2): a mismatch classification carries the exact rejection code so identity vs
// generation mismatch stay separately observable in the quarantine record and drain counts.
type BindingMismatchCode = 'binding-identity-mismatch' | 'binding-generation-mismatch';
interface BindingMismatch {
  entry: DurableRetryOutboxEntry;
  code: BindingMismatchCode;
}









function partitionByBinding(
  entries: readonly DurableRetryOutboxEntry[],
  binding: DurableOutboxBinding,
): { matched: DurableRetryOutboxEntry[]; mismatched: BindingMismatch[] } {
  const matched: DurableRetryOutboxEntry[] = [];
  const mismatched: BindingMismatch[] = [];
  for (const entry of entries) {
    if (entry.identity === binding.identity && entry.syncGeneration === binding.syncGeneration) {
      matched.push(entry);
    } else if (entry.identity !== binding.identity) {
      mismatched.push({ entry, code: 'binding-identity-mismatch' });
    } else {
      mismatched.push({ entry, code: 'binding-generation-mismatch' });
    }
  }
  return { matched, mismatched };
}

async function runDrainPass(options: VersionedOutboxDrainOptions): Promise<VersionedOutboxDrainResult> {


  await ensureRemoteSyncItemStateReady(options.identity);
  const now = normalizeNow(options.now);
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_DRAIN_ATTEMPTS));
  // Wave 8 (W8.2) master gate (Sol fix round 1, HIGH-2): the ENTIRE new policy — mismatch
  // partition, deterministic-only cap, class-specific failure recording, thrown-send
  // classification — activates ONLY when the caller supplies an active binding. With no binding
  // (every production caller until W8.3) the drain behaves byte-identically to HEAD: legacy
  // total-attemptCount cap, classless failure recording, no partition.
  const bindingActive = options.activeBinding !== undefined;
  const counts: Record<string, number> = {};

  const quarantineCapped = async (capped: DurableRetryOutboxEntry[]): Promise<void> => {
    if (capped.length === 0) return;



    const persisted = await persistPermanentRejection(options, capped, capped.map(entry => ({
      opId: entry.opId,
      store: entry.store,
      itemKey: entry.itemKey,
      code: 'attempt-cap',
      retryable: false,
      message: `Removed from the sync outbox after ${entry.attemptCount} failed attempts.`,
    })));
    if (!persisted) {
      // Wave 8 W8.2 (Sol fix round 1, Important-3): under an active binding this storage failure
      // records its durable class like every other failure branch — metadata-persistence, which
      // never advances the deterministic count. Re-cap convergence is safe because the binding-
      // active cap below reads the deterministic COUNT, not the last class, so the retained entry
      // re-caps on the next drain regardless of this stamp. Dormant (no binding): classless,
      // byte-identical to HEAD.
      await recordDurableVersionedOutboxFailure(options.outboxStorage, capped.map(entry => entry.opId), 'Quarantine record could not be persisted.', {
        now,
        jitterMs: options.jitterMs ?? 0,
        ...(bindingActive ? { failureClass: 'metadata-persistence' as const } : {}),
      });
      mergeCounts(counts, 'quarantinePersistFailed', capped.length);
      mergeCounts(counts, 'queued', capped.length);
      mergeCounts(counts, 'backedOff', capped.length);
      return;
    }
    await removeDurableVersionedOutboxEntries(options.outboxStorage, capped.map(entry => entry.opId));
    mergeCounts(counts, 'quarantined', capped.length);
  };







  const quarantineMismatched = async (mismatched: readonly BindingMismatch[]): Promise<void> => {
    if (mismatched.length === 0) return;
    const entries = mismatched.map(item => item.entry);
    const persisted = await persistPermanentRejection(options, entries, mismatched.map(item => ({
      opId: item.entry.opId,
      store: item.entry.store,
      itemKey: item.entry.itemKey,
      code: item.code,
      retryable: false,
      message: item.code === 'binding-identity-mismatch'
        ? 'Removed from the sync outbox: entry identity does not match the active account binding.'
        : 'Removed from the sync outbox: entry generation does not match the active account binding.',
    })));
    if (!persisted) {
      // metadata-persistence class: the storage failed, so the deterministic cap must stay
      // untouched. The binding partition re-detects and re-quarantines this row on a later drain
      // once persistence recovers (convergent) — its class here does not gate that re-detection.
      await recordDurableVersionedOutboxFailure(options.outboxStorage, entries.map(entry => entry.opId), 'Binding-mismatch quarantine record could not be persisted.', {
        now,
        jitterMs: options.jitterMs ?? 0,
        failureClass: 'metadata-persistence',
      });
      mergeCounts(counts, 'quarantinePersistFailed', entries.length);
      mergeCounts(counts, 'queued', entries.length);
      mergeCounts(counts, 'backedOff', entries.length);
      return;
    }
    await removeDurableVersionedOutboxEntries(options.outboxStorage, entries.map(entry => entry.opId));
    for (const item of mismatched) {
      mergeCounts(counts, item.code === 'binding-identity-mismatch'
        ? 'identityMismatchQuarantined'
        : 'generationMismatchQuarantined');
    }
  };

  // Shared pre-send gate for both drain paths: partition out binding mismatches (only when an
  // active binding is supplied — DORMANT otherwise), then quarantine attempt-capped entries.
  // Order matters: a mismatched entry is a SAFETY rejection and is quarantined for the mismatch
  // regardless of its attempt count, so the binding partition runs FIRST and the cap check only
  // ever sees binding-matched rows.
  //
  // Cap predicate (HIGH-2 gate): with no binding, HEAD's legacy total-attemptCount cap,
  // byte-identical. Under an active binding, the cap reads ONLY the deterministic failure COUNT —
  // deliberately NOT `lastFailureClass` (Sol fix round 1, Important-3): the count is monotone and
  // only ever advanced by deterministic recordings, so twelve deterministic failures cap the entry
  // even when a later transport/metadata-persistence failure (e.g. a failed quarantine persist)
  // was the most recent class. Offline safety is unchanged — transport failures never advance the
  // count, so time alone still can never quarantine.
  const capReached = (entry: DurableRetryOutboxEntry): boolean => bindingActive
    ? (entry.deterministicAttemptCount ?? 0) >= maxAttempts
    : entry.attemptCount >= maxAttempts;
  const partitionAndCap = async (dueEntries: DurableRetryOutboxEntry[]): Promise<DurableRetryOutboxEntry[]> => {
    let due = dueEntries;
    if (options.activeBinding) {
      const { matched, mismatched } = partitionByBinding(due, options.activeBinding);
      if (mismatched.length > 0) await quarantineMismatched(mismatched);
      due = matched;
    }
    const capped = due.filter(capReached);
    if (capped.length > 0) {
      await quarantineCapped(capped);
      const cappedIds = new Set(capped.map(entry => entry.opId));
      due = due.filter(entry => !cappedIds.has(entry.opId));
    }
    return due;
  };

  const reportBatchProgress = async (): Promise<void> => {
    if (!options.onBatchProgress) return;
    try {
      const remaining = await countDurableVersionedOutboxEntries(options.outboxStorage);
      options.onBatchProgress({
        attempted: counts.attempted ?? 0,
        accepted: counts.accepted ?? 0,
        conflicts: counts.conflicts ?? 0,
        rejected: counts.rejected ?? 0,
        backedOff: counts.backedOff ?? 0,
        remaining,
      });
    } catch {
      // Progress reporting must never interrupt the drain.
    }
  };

  // The keyed windowed path (BUG-2026-07-05-008) never materializes the whole outbox: it scans
  // opId-ordered windows of `batchSize` raw rows, filters each window down to due entries, and
  // processes them with the same batch body as the legacy path. Storages without the keyed read
  // methods (legacy storages, test fakes) keep the original one-getAll-then-chunk behavior.
  const windowed = Boolean(options.outboxStorage.readEntriesRange && options.outboxStorage.getEntries);

  const processBatch = async (batch: DurableRetryOutboxEntry[]): Promise<{ sendFailed: boolean; error?: string }> => {
    // Invariant 8 (Wave 8 W8.2 amendment): under an active binding the drain consumes bound
    // entries only. partitionAndCap has already removed every mismatched/unbound row, so this is a
    // defensive runtime assertion — reaching it means the partition invariant was violated, which
    // is corruption. Fail closed (throw before any send) rather than push an unbound/wrong-binding
    // row to the server (invariant 6). Unreachable on the no-binding path (guard is binding-gated).
    if (options.activeBinding) {
      for (const entry of batch) {
        if (entry.identity !== options.activeBinding.identity || entry.syncGeneration !== options.activeBinding.syncGeneration) {
          throw new Error('Drain binding invariant violated: an unbound or mismatched entry reached the send batch under an active binding.');
        }
      }
    }
    const opIds = batch.map(entry => entry.opId);
    await markDurableVersionedOutboxAttemptStarted(options.outboxStorage, opIds, { now });

    let response: VersionedWriteBatchResponse;
    try {
      response = await options.sendBatch({
        protocol: 'version-cas-v1',
        clientId: options.clientId,
        items: batch.map(requestItemFromEntry),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Versioned outbox drain failed.';
      // Class-specific recording (Wave 8 W8.2, binding-gated per HIGH-2): under an active binding
      // a thrown send is transport by default — an unclassified network throw NEVER consumes the
      // deterministic cap counter; W8.3 supplies a classifier for typed 5xx/429 (retryable-server)
      // or deterministic 4xx errors. With no binding: classless, byte-identical to HEAD (the
      // legacy total-attemptCount cap keeps its pre-Wave-8 semantics).
      await recordDurableVersionedOutboxFailure(options.outboxStorage, opIds, message, {
        now,
        jitterMs: options.jitterMs ?? 0,
        ...(bindingActive ? { failureClass: options.classifySendBatchError?.(error) ?? 'transport' } : {}),
      });
      mergeCounts(counts, 'failed', batch.length);
      mergeCounts(counts, 'queued', batch.length);
      mergeCounts(counts, 'backedOff', batch.length);
      await reportBatchProgress();
      return { sendFailed: true, error: message };
    }

    const acceptedByOpId = new Map(response.accepted.map(item => [item.opId, item]));
    const conflictsByOpId = new Map(response.conflicts.map(item => [item.opId, item]));
    const retryableRejected = new Set(response.rejected.filter(item => item.retryable).map(item => item.opId));
    const nonRetryableRejected = new Map(
      response.rejected.filter(item => !item.retryable && item.opId).map(item => [item.opId, item]),
    );
    const durableOpIds: string[] = [];
    // Class-tagged failure buckets (Wave 8 W8.2): every failed op records its durable failure
    // class so ONLY `deterministic` failures advance the cap counter. metadata-persistence
    // (version-write / quarantine-persist failure), retryable-server (retryable reject), and
    // deterministic (accepted/conflict adapter failure, unacknowledged protocol result) are each
    // recorded with their own class at the end of the batch.
    const failedByClass: Record<OutboxFailureClass, string[]> = {
      transport: [],
      'retryable-server': [],
      'metadata-persistence': [],
      deterministic: [],
    };
    const pushFailed = (opId: string, failureClass: OutboxFailureClass): void => {
      failedByClass[failureClass].push(opId);
    };
    const droppedEntries: DurableRetryOutboxEntry[] = [];
    const droppedRejections: VersionedRejectedItem[] = [];





    const versionCandidates: Array<{
      entry: DurableRetryOutboxEntry;
      kind: 'accepted' | 'recovered';
      accepted?: VersionedAcceptedItem;
      item: VersionedSyncItem;
    }> = [];
    const remainingEntries: DurableRetryOutboxEntry[] = [];
    for (const entry of batch) {
      const accepted = acceptedByOpId.get(entry.opId);
      if (accepted) {
        versionCandidates.push({ entry, kind: 'accepted', accepted, item: accepted.item });
        continue;
      }
      const conflict = conflictsByOpId.get(entry.opId);
      const recovered = conflict ? matchingRecoveredConflict(entry, conflict) : null;
      if (recovered) {
        versionCandidates.push({ entry, kind: 'recovered', item: recovered });
        continue;
      }
      remainingEntries.push(entry);
    }




    const metadataFailedEntries: DurableRetryOutboxEntry[] = [];
    let metadataErrorName = 'version-write-unverified';
    const noteMetadataError = (error: unknown) => {




      const rawName = error instanceof Error ? error.name : '';
      metadataErrorName = SAFE_STORAGE_ERROR_NAMES.has(rawName) ? rawName : 'StorageError';
    };

    const durableCandidateOpIds = new Set<string>();
    if (versionCandidates.length > 0) {
      const records = versionCandidates.map(candidate => ({
        store: candidate.item.store,
        itemKey: candidate.item.itemKey,
        version: candidate.item.version,
      }));
      let batchRecorded = false;
      try {



        await recordRemoteSyncItemStateVersions(options.identity, records.map(record => ({
          store: record.store,
          itemKey: record.itemKey,
          version: record.version,
        })));
        // Blob latestVersion advance (display/back-compat, stays in localStorage): failure here
        // keeps the pre-Wave-5 semantics of failing the batch's metadata write.
        recordRemoteSyncItemVersions(options.versionStorage, options.identity, [], records.reduce((max, record) => Math.max(max, record.version), 0));
        batchRecorded = true;
      } catch (error) {
        noteMetadataError(error);
        batchRecorded = false;
      }

      if (batchRecorded) {
        // Spot-verify the batch write landed via one cache read per item (the resolver), not N
        // individual storage reads — preserves the old per-item verify step in effect.
        const resolveVersion = createRemoteSyncItemStateResolver(options.identity);
        for (const candidate of versionCandidates) {
          if (resolveVersion(candidate.item.store, candidate.item.itemKey) === candidate.item.version) {
            durableCandidateOpIds.add(candidate.entry.opId);
          }
        }
      } else {
        // Batched write failed outright: fall back to per-item recording so one poisoned item
        // cannot stall its neighbors. Items that still fail keep metadataWriteFailed below.
        for (const candidate of versionCandidates) {
          try {
            if (await recordAcceptedVersion(options.versionStorage, options.identity, candidate.item)) {
              durableCandidateOpIds.add(candidate.entry.opId);
            }
          } catch (error) {
            noteMetadataError(error);
            // Leave unresolved; falls through to metadataWriteFailed below.
          }
        }
      }
    }

    for (const candidate of versionCandidates) {
      if (!durableCandidateOpIds.has(candidate.entry.opId)) {
        pushFailed(candidate.entry.opId, 'metadata-persistence');
        mergeCounts(counts, 'metadataWriteFailed');
        metadataFailedEntries.push(candidate.entry);
        continue;
      }
      if (candidate.kind === 'accepted') {
        try {
          await options.acceptedAdapter?.applyAccepted(candidate.item, candidate.accepted!, candidate.entry);
          durableOpIds.push(candidate.entry.opId);
          mergeCounts(counts, 'accepted');
        } catch {





          pushFailed(candidate.entry.opId, 'deterministic');
          mergeCounts(counts, 'applyAdapterFailed');
        }
      } else {
        durableOpIds.push(candidate.entry.opId);
        mergeCounts(counts, 'recovered');
      }
    }

    for (const entry of remainingEntries) {
      const conflict = conflictsByOpId.get(entry.opId);
      if (conflict) {
        if (!conflict.current || !options.conflictAdapter) {
          mergeCounts(counts, 'conflicts');
          continue;
        }
        try {
          await options.conflictAdapter.applyCurrent(conflict.current, conflict, entry);



          let conflictVersionRecorded = false;
          try {
            conflictVersionRecorded = await recordAcceptedVersion(options.versionStorage, options.identity, conflict.current);
          } catch (error) {
            noteMetadataError(error);
            conflictVersionRecorded = false;
          }
          if (!conflictVersionRecorded) {
            pushFailed(entry.opId, 'metadata-persistence');
            mergeCounts(counts, 'metadataWriteFailed');
            metadataFailedEntries.push(entry);
            continue;
          }
          const nextWrite = await options.conflictAdapter.shouldReenqueue?.(entry, conflict.current, conflict) ?? null;
          if (nextWrite) {
            if (!options.conflictAdapter.reenqueue) throw new Error('Conflict adapter returned a retry without a reenqueue handler.');
            await options.conflictAdapter.reenqueue(nextWrite, entry, conflict.current);
            mergeCounts(counts, 'reenqueued');
          } else {
            mergeCounts(counts, 'serverWins');
          }
          durableOpIds.push(entry.opId);
        } catch {
          // Wave 8 W8.2: a conflict-reconcile adapter throw is deterministic — the same server
          // state and adapter will reject it again — so it advances the cap counter.
          pushFailed(entry.opId, 'deterministic');
          mergeCounts(counts, 'conflictApplyFailed');
        }
        continue;
      }
      if (retryableRejected.has(entry.opId)) {
        // Wave 8 W8.2: a retryable server reject (408/425/429/5xx or row retryable:true) NEVER
        // consumes the deterministic cap — it backs off and retries indefinitely.
        pushFailed(entry.opId, 'retryable-server');
        mergeCounts(counts, 'rejectedRetryable');
        continue;
      }
      const rejection = nonRetryableRejected.get(entry.opId);
      if (rejection) {



        droppedEntries.push(entry);
        droppedRejections.push(rejection);
        continue;
      }
      // Op absent from the response entirely: never drop silently — back off and retry. Wave 8
      // W8.2: an unacknowledged/malformed protocol result is deterministic and advances the cap.
      pushFailed(entry.opId, 'deterministic');
      mergeCounts(counts, 'unacknowledged');
    }




    let removableDropped = droppedEntries;
    if (droppedEntries.length > 0) {
      const persisted = await persistPermanentRejection(options, droppedEntries, droppedRejections);
      if (persisted) {
        mergeCounts(counts, 'rejectedDropped', droppedEntries.length);
      } else {
        // Wave 8 W8.2: a failed quarantine persist is a storage failure — metadata-persistence
        // class, never a deterministic cap. The server re-rejects it on a later drain; it drops
        // once persistence recovers.
        removableDropped = [];
        for (const entry of droppedEntries) pushFailed(entry.opId, 'metadata-persistence');
        mergeCounts(counts, 'quarantinePersistFailed', droppedEntries.length);
      }
    }
    if (durableOpIds.length > 0 || removableDropped.length > 0) {
      await removeDurableVersionedOutboxEntries(options.outboxStorage, [
        ...durableOpIds,
        ...removableDropped.map(entry => entry.opId),
      ]);
    }
    // Wave 8 W8.2 (binding-gated per HIGH-2): under an active binding, each class-tagged failure
    // bucket is recorded with its own class so the deterministic cap counter only ever advances
    // for `deterministic` failures. With no binding: ONE classless call over every failed op —
    // HEAD's exact shape, byte-identical. Counts/backoff are identical either way.
    if (bindingActive) {
      for (const failureClass of ['transport', 'retryable-server', 'metadata-persistence', 'deterministic'] as const) {
        const ids = failedByClass[failureClass];
        if (ids.length === 0) continue;
        await recordDurableVersionedOutboxFailure(options.outboxStorage, ids, 'Versioned write result was not durable.', {
          now,
          jitterMs: options.jitterMs ?? 0,
          failureClass,
        });
        mergeCounts(counts, 'queued', ids.length);
        mergeCounts(counts, 'backedOff', ids.length);
      }
    } else {
      const failedOpIds = [
        ...failedByClass.transport,
        ...failedByClass['retryable-server'],
        ...failedByClass['metadata-persistence'],
        ...failedByClass.deterministic,
      ];
      if (failedOpIds.length > 0) {
        await recordDurableVersionedOutboxFailure(options.outboxStorage, failedOpIds, 'Versioned write result was not durable.', {
          now,
          jitterMs: options.jitterMs ?? 0,
        });
        mergeCounts(counts, 'queued', failedOpIds.length);
        mergeCounts(counts, 'backedOff', failedOpIds.length);
      }
    }
    if (metadataFailedEntries.length > 0 && options.onMetadataPersistenceFailure) {
      try {
        options.onMetadataPersistenceFailure({ entries: metadataFailedEntries, errorName: metadataErrorName });
      } catch {
        // Diagnostics must never change drain behavior.
      }
    }
    await reportBatchProgress();
    return { sendFailed: false };
  };

  // Wave 8 W8.2 fix rounds 1b+2 (authorized fence exception — Sol HIGH-1/round-2 HIGH,
  // invariant 6): under an active binding, rows the normalization rejects are moved VERBATIM into
  // `legacy-outbox-recovery` BEFORE the pass scans the queue — the fail-closed DISPOSITION for
  // corruption. The helper's returned counts are AUTHORITATIVE (round-2 HIGH): a window scan
  // cannot re-detect this corruption because the IDB range read drops non-string-key rows before
  // scannedCount is computed, so anything the recovery left undisposed (incapable storage, failed
  // commits) is preserved into rawRowsRejected HERE, and a failed scan reports rawRecoveryFailed —
  // either fails the drain result closed. Session gate (round-2 IMPORTANT): the full raw scan
  // runs once per session per storage and is skipped only after a provably clean result; an
  // unclean result is never marked, so corruption keeps failing every drain until disposed.
  if (bindingActive && !sessionCleanRecoveryStorages.has(options.outboxStorage)) {
    try {
      const { recovered, rejected } = await recoverRejectedDurableVersionedOutboxRows(options.outboxStorage);
      if (recovered > 0) mergeCounts(counts, 'rawRowsRecovered', recovered);
      if (rejected > recovered) {
        mergeCounts(counts, 'rawRowsRejected', rejected - recovered);
      } else {
        sessionCleanRecoveryStorages.add(options.outboxStorage);
      }
    } catch {
      // The raw scan itself failed: corruption state is UNKNOWN — fail the drain result closed
      // (never a clean success on an unverified store) and rescan on the next drain.
      mergeCounts(counts, 'rawRecoveryFailed', 1);
    }
  }

  if (windowed) {
    // Denominator for progress: total queued rows at pass start (see the attempted field doc).
    // Assigned to counts lazily so a pass that finds nothing due reports the same counts shape
    // as the legacy path (bare `queued`, no `attempted`, onBatchProgress never invoked).
    const denominator = await countDurableVersionedOutboxEntries(options.outboxStorage);
    let afterOpId: string | null = null;
    while (true) {
      const window = await readDurableVersionedOutboxWindow(options.outboxStorage, afterOpId, batchSize);
      if (window.scannedCount === 0) break;
      afterOpId = window.lastScannedOpId;
      // Raw-rejected detection lives in the recovery helper above (fix round 2, Sol HIGH): a
      // window-scan diff here would be structurally blind to non-string-key rows — the IDB range
      // read drops them before scannedCount is computed — so no per-window backstop is kept.
      let due = window.entries.filter(entry => entry.nextAttemptAt <= now);
      // Wave 8 W8.2: binding-mismatch partition (dormant without an active binding) then the
      // binding-gated attempt cap, applied per window.
      due = await partitionAndCap(due);
      // Ordering safety: the legacy path's enqueuedAt sort guaranteed a delete was sent before an
      // upsert it blocks (blockedByOpId). The opId scan order gives no such guarantee, so a due
      // entry whose blocking delete still exists in the outbox is deferred to a later pass — it
      // drains after the blocker is accepted and removed.
      const blockerIds = Array.from(new Set(
        due.filter(entry => entry.blockedByOpId).map(entry => entry.blockedByOpId as string),
      ));
      if (blockerIds.length > 0) {
        const present = new Set(
          (await getDurableVersionedOutboxEntriesByOpId(options.outboxStorage, blockerIds)).map(entry => entry.opId),
        );
        const deferred = due.filter(entry => entry.blockedByOpId && present.has(entry.blockedByOpId));
        if (deferred.length > 0) {
          mergeCounts(counts, 'deferredBlocked', deferred.length);
          due = due.filter(entry => !(entry.blockedByOpId && present.has(entry.blockedByOpId)));
        }
      }
      if (due.length === 0) continue;
      if (counts.attempted === undefined) counts.attempted = denominator;
      const outcome = await processBatch(due);
      if (outcome.sendFailed) {
        return { success: false, ...(outcome.error ? { error: outcome.error } : {}), counts };
      }
    }
  } else {
    // Raw-rejected detection lives in the recovery helper above (fix round 2, Sol HIGH) — no
    // duplicate raw read here; this branch keeps HEAD's single due read on both paths.
    let due = await dueDurableVersionedOutboxEntries(options.outboxStorage, now);
    // Wave 8 W8.2: binding-mismatch partition (dormant without an active binding) then the
    // binding-gated attempt cap.
    due = await partitionAndCap(due);
    if (due.length > 0) {
      counts.attempted = due.length;
      for (const batch of chunks(due, batchSize)) {
        const outcome = await processBatch(batch);
        if (outcome.sendFailed) {
          return { success: false, ...(outcome.error ? { error: outcome.error } : {}), counts };
        }
      }
    }
  }

  const queued = await countDurableVersionedOutboxEntries(options.outboxStorage);
  if (queued > 0) counts.queued = queued;
  return {






    success:
      (counts.failed ?? 0) === 0 &&
      (counts.metadataWriteFailed ?? 0) === 0 &&
      (counts.applyAdapterFailed ?? 0) === 0 &&
      (counts.quarantinePersistFailed ?? 0) === 0 &&
      (counts.rawRowsRejected ?? 0) === 0 &&
      (counts.rawRecoveryFailed ?? 0) === 0,
    counts,
  };
}

export async function drainDurableVersionedOutbox(options: VersionedOutboxDrainOptions): Promise<VersionedOutboxDrainResult> {
  const locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks || typeof locks.request !== 'function') {
    // No Web Locks API available (Node test harnesses, older browsers): there is no cross-tab
    // concept to guard here, so run the pass directly. This mirrors the outbox mutation lock's
    // fallback -- same-tab-only environments have nothing cross-tab to protect against.
    return runDrainPass(options);
  }
  const result = await locks.request(DRAIN_LOCK_NAME, { ifAvailable: true }, async lock => {
    if (!lock) return null;
    return runDrainPass(options);
  });
  if (result === null) {
    return { success: true, counts: { drainSkipped: 1 } };
  }
  return result;
}

export async function runVersionedPreWriteGate(options: VersionedPreWriteGateOptions): Promise<VersionedPreWriteGateResult> {
  const metadata = readRemoteSyncVersionMetadata(options.versionStorage, options.identity);
  const forcedFullPull = metadata.needsFullPull;
  const needsRevalidation = forcedFullPull || options.cloudStateStale;
  let cursorUsed: number | undefined;

  if (needsRevalidation) {
    // The revalidation pre-write fetch is a cursor pull, so it must use the routine pull cursor
    // (never `latestVersion`, which can now be ahead of the cursor from push acceptance alone —
    // audit F-1) — see src/sync/versionMetadata.ts.
    cursorUsed = forcedFullPull ? 0 : metadata.pullCursor;
    const trigger: VersionedPreWriteRevalidationTrigger = forcedFullPull ? 'metadata-missing' : 'stale-cloud-state';
    let revalidation: VersionedPreWriteRevalidationResult;
    try {
      revalidation = await options.revalidate(cursorUsed, trigger);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pre-write revalidation failed.';
      return {
        success: false,
        revalidated: false,
        forcedFullPull,
        drained: false,
        paused: true,
        cursorUsed,
        counts: { paused: 1 },
        error: message,
      };
    }
    if (!revalidation.ok) {
      return {
        success: false,
        revalidated: false,
        forcedFullPull,
        drained: false,
        paused: true,
        cursorUsed,
        counts: { paused: 1 },
        error: revalidation.error || 'Pre-write revalidation failed.',
      };
    }
  }

  const drain = await options.drain();
  return {
    success: drain.success,
    revalidated: needsRevalidation,
    forcedFullPull,
    drained: true,
    paused: false,
    ...(cursorUsed !== undefined ? { cursorUsed } : {}),
    counts: drain.counts,
    ...(drain.error ? { error: drain.error } : {}),
  };
}
