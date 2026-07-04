import type { RemoteSyncStoreName } from './remoteSyncMigrations';
import {
  getRemoteSyncItemVersion,
  readRemoteSyncVersionMetadata,
  recordRemoteSyncItemVersion,
  type RemoteSyncVersionStorage,
} from './versionMetadata';
import {
  dueDurableVersionedOutboxEntries,
  markDurableVersionedOutboxAttemptStarted,
  readDurableVersionedOutbox,
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
  /**
   * Called when entries are permanently removed without server acceptance: explicit
   * non-retryable server rejects and attempt-cap quarantines. Local IDB data is untouched, so
   * the reconcile/untracked-scan path can re-queue these items after the cause is fixed
   * (BUG-2026-07-04-005). Errors thrown by the callback are caught and ignored.
   */
  onPermanentRejection?(entries: DurableRetryOutboxEntry[], rejections: VersionedRejectedItem[]): void | Promise<void>;
  /** Entries reaching this attemptCount are quarantined instead of retried forever. */
  maxAttempts?: number;
}

export interface VersionedOutboxDrainBatchProgress {
  /** Fixed for the whole drain call: the count of entries due at the start (the operation total). */
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

async function notifyPermanentRejection(
  options: VersionedOutboxDrainOptions,
  entries: DurableRetryOutboxEntry[],
  rejections: VersionedRejectedItem[],
): Promise<void> {
  if (!options.onPermanentRejection || entries.length === 0) return;
  try {
    await options.onPermanentRejection(entries, rejections);
  } catch {
    // Permanent-rejection reporting must never interrupt the drain.
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

export async function drainDurableVersionedOutbox(options: VersionedOutboxDrainOptions): Promise<VersionedOutboxDrainResult> {
  const now = normalizeNow(options.now);
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_DRAIN_ATTEMPTS));
  const counts: Record<string, number> = {};

  let due = await dueDurableVersionedOutboxEntries(options.outboxStorage, now);
  const capped = due.filter(entry => entry.attemptCount >= maxAttempts);
  if (capped.length > 0) {
    await removeDurableVersionedOutboxEntries(options.outboxStorage, capped.map(entry => entry.opId));
    mergeCounts(counts, 'quarantined', capped.length);
    await notifyPermanentRejection(options, capped, capped.map(entry => ({
      opId: entry.opId,
      store: entry.store,
      itemKey: entry.itemKey,
      code: 'attempt-cap',
      retryable: false,
      message: `Removed from the sync outbox after ${entry.attemptCount} failed attempts.`,
    })));
    due = due.filter(entry => entry.attemptCount < maxAttempts);
  }
  if (due.length === 0) {
    const queued = (await readDurableVersionedOutbox(options.outboxStorage)).length;
    if (queued > 0) counts.queued = queued;
    return { success: true, counts };
  }

  counts.attempted = due.length;
  const reportBatchProgress = async (): Promise<void> => {
    if (!options.onBatchProgress) return;
    try {
      const remaining = (await readDurableVersionedOutbox(options.outboxStorage)).length;
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
  for (const batch of chunks(due, batchSize)) {
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
      return { success: false, error: message, counts };
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

    for (const entry of batch) {
      const accepted = acceptedByOpId.get(entry.opId);
      if (accepted) {
        try {
          if (recordAcceptedVersion(options.versionStorage, options.identity, accepted.item)) {
            await options.acceptedAdapter?.applyAccepted(accepted.item, accepted, entry);
            durableOpIds.push(entry.opId);
            mergeCounts(counts, 'accepted');
          } else {
            failedOpIds.push(entry.opId);
            mergeCounts(counts, 'metadataWriteFailed');
          }
        } catch {
          failedOpIds.push(entry.opId);
          mergeCounts(counts, 'metadataWriteFailed');
        }
        continue;
      }

      const conflict = conflictsByOpId.get(entry.opId);
      const recovered = conflict ? matchingRecoveredConflict(entry, conflict) : null;
      if (recovered) {
        try {
          if (recordAcceptedVersion(options.versionStorage, options.identity, recovered)) {
            durableOpIds.push(entry.opId);
            mergeCounts(counts, 'recovered');
          } else {
            failedOpIds.push(entry.opId);
            mergeCounts(counts, 'metadataWriteFailed');
          }
        } catch {
          failedOpIds.push(entry.opId);
          mergeCounts(counts, 'metadataWriteFailed');
        }
        continue;
      }

      if (conflict) {
        if (!conflict.current || !options.conflictAdapter) {
          mergeCounts(counts, 'conflicts');
          continue;
        }
        try {
          await options.conflictAdapter.applyCurrent(conflict.current, conflict, entry);
          if (!recordAcceptedVersion(options.versionStorage, options.identity, conflict.current)) {
            failedOpIds.push(entry.opId);
            mergeCounts(counts, 'metadataWriteFailed');
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
        // Explicit permanent server reject: remove so it cannot re-push every flush forever;
        // local IDB data is preserved and recoverable through the reconcile path.
        droppedEntries.push(entry);
        droppedRejections.push(rejection);
        mergeCounts(counts, 'rejectedDropped');
        continue;
      }
      // Op absent from the response entirely: never drop silently — back off and retry.
      failedOpIds.push(entry.opId);
      mergeCounts(counts, 'unacknowledged');
    }

    if (durableOpIds.length > 0 || droppedEntries.length > 0) {
      await removeDurableVersionedOutboxEntries(options.outboxStorage, [
        ...durableOpIds,
        ...droppedEntries.map(entry => entry.opId),
      ]);
    }
    await notifyPermanentRejection(options, droppedEntries, droppedRejections);
    if (failedOpIds.length > 0) {
      await recordDurableVersionedOutboxFailure(options.outboxStorage, failedOpIds, 'Versioned write result was not durable.', {
        now,
        jitterMs: options.jitterMs ?? 0,
      });
      mergeCounts(counts, 'queued', failedOpIds.length);
      mergeCounts(counts, 'backedOff', failedOpIds.length);
    }
    await reportBatchProgress();
  }

  const queued = (await readDurableVersionedOutbox(options.outboxStorage)).length;
  if (queued > 0) counts.queued = queued;
  return { success: (counts.failed ?? 0) === 0 && (counts.metadataWriteFailed ?? 0) === 0, counts };
}

export async function runVersionedPreWriteGate(options: VersionedPreWriteGateOptions): Promise<VersionedPreWriteGateResult> {
  const metadata = readRemoteSyncVersionMetadata(options.versionStorage, options.identity);
  const forcedFullPull = metadata.needsFullPull;
  const needsRevalidation = forcedFullPull || options.cloudStateStale;
  let cursorUsed: number | undefined;

  if (needsRevalidation) {
    cursorUsed = forcedFullPull ? 0 : metadata.latestVersion;
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
