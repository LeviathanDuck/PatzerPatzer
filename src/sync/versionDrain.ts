import type { RemoteSyncStoreName } from './remoteSyncMigrations';
import {
  createRemoteSyncItemVersionResolver,
  getRemoteSyncItemVersion,
  readRemoteSyncVersionMetadata,
  recordRemoteSyncItemVersion,
  recordRemoteSyncItemVersions,
  type RemoteSyncVersionStorage,
} from './versionMetadata';
import {
  countDurableVersionedOutboxEntries,
  dueDurableVersionedOutboxEntries,
  getDurableVersionedOutboxEntriesByOpId,
  markDurableVersionedOutboxAttemptStarted,
  readDurableVersionedOutboxWindow,
  recordDurableVersionedOutboxFailure,
  removeDurableVersionedOutboxEntries,
  type DurableRetryOutboxEntry,
  type DurableVersionedOutboxStorage,
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
  /** Entries reaching this attemptCount are quarantined instead of retried forever. */
  maxAttempts?: number;
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
  if (!options.onPermanentRejection || entries.length === 0) return true;
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

function recordAcceptedVersion(
  storage: RemoteSyncVersionStorage,
  identity: string,
  item: VersionedSyncItem
): boolean {
  recordRemoteSyncItemVersion(storage, identity, item.store, item.itemKey, item.version);
  return getRemoteSyncItemVersion(storage, identity, item.store, item.itemKey) === item.version;
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

async function runDrainPass(options: VersionedOutboxDrainOptions): Promise<VersionedOutboxDrainResult> {
  const now = normalizeNow(options.now);
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_DRAIN_ATTEMPTS));
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
      await recordDurableVersionedOutboxFailure(options.outboxStorage, capped.map(entry => entry.opId), 'Quarantine record could not be persisted.', {
        now,
        jitterMs: options.jitterMs ?? 0,
      });
      mergeCounts(counts, 'quarantinePersistFailed', capped.length);
      mergeCounts(counts, 'queued', capped.length);
      mergeCounts(counts, 'backedOff', capped.length);
      return;
    }
    await removeDurableVersionedOutboxEntries(options.outboxStorage, capped.map(entry => entry.opId));
    mergeCounts(counts, 'quarantined', capped.length);
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
      await recordDurableVersionedOutboxFailure(options.outboxStorage, opIds, message, {
        now,
        jitterMs: options.jitterMs ?? 0,
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
    const failedOpIds: string[] = [];
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
        recordRemoteSyncItemVersions(options.versionStorage, options.identity, records);
        batchRecorded = true;
      } catch (error) {
        noteMetadataError(error);
        batchRecorded = false;
      }

      if (batchRecorded) {
        // Spot-verify the batch write landed via one metadata read (the resolver), not N
        // individual storage reads — preserves the old per-item verify step in effect.
        const resolveVersion = createRemoteSyncItemVersionResolver(options.versionStorage, options.identity);
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
            if (recordAcceptedVersion(options.versionStorage, options.identity, candidate.item)) {
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
        failedOpIds.push(candidate.entry.opId);
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



          failedOpIds.push(candidate.entry.opId);
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
            conflictVersionRecorded = recordAcceptedVersion(options.versionStorage, options.identity, conflict.current);
          } catch (error) {
            noteMetadataError(error);
            conflictVersionRecorded = false;
          }
          if (!conflictVersionRecorded) {
            failedOpIds.push(entry.opId);
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
          failedOpIds.push(entry.opId);
          mergeCounts(counts, 'conflictApplyFailed');
        }
        continue;
      }
      if (retryableRejected.has(entry.opId)) {
        failedOpIds.push(entry.opId);
        mergeCounts(counts, 'rejectedRetryable');
        continue;
      }
      const rejection = nonRetryableRejected.get(entry.opId);
      if (rejection) {



        droppedEntries.push(entry);
        droppedRejections.push(rejection);
        continue;
      }
      // Op absent from the response entirely: never drop silently — back off and retry.
      failedOpIds.push(entry.opId);
      mergeCounts(counts, 'unacknowledged');
    }




    let removableDropped = droppedEntries;
    if (droppedEntries.length > 0) {
      const persisted = await persistPermanentRejection(options, droppedEntries, droppedRejections);
      if (persisted) {
        mergeCounts(counts, 'rejectedDropped', droppedEntries.length);
      } else {
        removableDropped = [];
        failedOpIds.push(...droppedEntries.map(entry => entry.opId));
        mergeCounts(counts, 'quarantinePersistFailed', droppedEntries.length);
      }
    }
    if (durableOpIds.length > 0 || removableDropped.length > 0) {
      await removeDurableVersionedOutboxEntries(options.outboxStorage, [
        ...durableOpIds,
        ...removableDropped.map(entry => entry.opId),
      ]);
    }
    if (failedOpIds.length > 0) {
      await recordDurableVersionedOutboxFailure(options.outboxStorage, failedOpIds, 'Versioned write result was not durable.', {
        now,
        jitterMs: options.jitterMs ?? 0,
      });
      mergeCounts(counts, 'queued', failedOpIds.length);
      mergeCounts(counts, 'backedOff', failedOpIds.length);
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
      let due = window.entries.filter(entry => entry.nextAttemptAt <= now);
      const capped = due.filter(entry => entry.attemptCount >= maxAttempts);
      if (capped.length > 0) {
        await quarantineCapped(capped);
        due = due.filter(entry => entry.attemptCount < maxAttempts);
      }
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
    let due = await dueDurableVersionedOutboxEntries(options.outboxStorage, now);
    const capped = due.filter(entry => entry.attemptCount >= maxAttempts);
    if (capped.length > 0) {
      await quarantineCapped(capped);
      due = due.filter(entry => entry.attemptCount < maxAttempts);
    }
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
      (counts.quarantinePersistFailed ?? 0) === 0,
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
