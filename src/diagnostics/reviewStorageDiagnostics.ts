import type { DiagnosticMetadata, DiagnosticMetadataValue } from './types';

export const LEGACY_REMOTE_SYNC_OUTBOX_STORAGE_KEY = 'chesspatzer.remoteSync.outbox';

export type ReviewStorageDiagnosticTrigger =
  | 'session-start-cache-loaded'
  | 'post-reviewed-derivation'
  | 'post-pull-apply'
  | 'post-import-complete'
  | 'post-push-failure'
  | 'post-queue-action';

export interface ReviewStorageAnalysisCounts {
  totalStored: number;
  completeStored: number;
  partialStored: number;
  loadableComplete: number;
  completedWithoutCurrentGame: number;
}

export interface ReviewStorageSummaryCounts {
  totalStored: number;
  withoutCompletedAnalysis: number;
}

export interface ReviewStorageReviewedIndexCounts {
  derived: number;
  runtime: number;
  staleRuntimeEntriesCleared: number;
}

export interface ReviewStorageRuntimeMapCounts {
  analyzedGameIds: number;
  analyzedGameAccuracy: number;
  analyzedReviewEngine: number;
  missedTacticGameIds: number;
}

export interface ReviewStorageQueueManifestCounts {
  reviewQueueEntries: number;
  reviewRunManifests: number;
  reviewFailureRecords: number;
  runtimeQueueTotal: number;
  runtimeQueueDone: number;
  runtimeQueueFailed: number;
  runtimeQueueSkipped: number;
  runtimeQueueRemainingGames: number;
  activeBatchGames: number;
}

export interface ReviewStorageOutboxComposition {
  total: number;
  byStore: Record<string, number>;
  byOperation: Record<string, number>;
  invalidEntries: number;
}

export interface ReviewStorageFailedBatchDiagnostic {
  action: 'items-batch';
  status: 'failed' | 'partial' | 'unknown';
  batchSize: number;
  byStore: Record<string, number>;
  byOperation: Record<string, number>;
  pendingAfterFailure: number;
  retryPreserved: boolean;
  invalidEntries: number;
}

export interface ReviewStorageDiagnosticInput {
  trigger: ReviewStorageDiagnosticTrigger;
  generation: number;
  durationMs: number;
  analysis: ReviewStorageAnalysisCounts;
  summaries: ReviewStorageSummaryCounts;
  reviewedIndex: ReviewStorageReviewedIndexCounts;
  runtimeMaps: ReviewStorageRuntimeMapCounts;
  queueManifests: ReviewStorageQueueManifestCounts;
  outbox: {
    legacy: ReviewStorageOutboxComposition;
    durable: ReviewStorageOutboxComposition;
    transientPending: number;
  };
  failedBatch?: ReviewStorageFailedBatchDiagnostic;
  changedStores?: Record<string, number>;
}

interface CountableItem {
  store?: unknown;
  operation?: unknown;
}

const SAFE_LABEL_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;
const SENSITIVE_KEY_RE = /(^|[-_])(authorization|cookie|fen|localstorage|password|payload|pgn|secret|token)([-_]|$)/i;
const FEN_VALUE_RE = /(?:[prnbqkPRNBQK1-8]{1,8}\/){7}[prnbqkPRNBQK1-8]{1,8}\s+[wb]\s+(?:K?Q?k?q?|-)\s+(?:[a-h][36]|-)\s+\d+\s+\d+/;
const PGN_VALUE_RE = /\b1\.\s*(?:O-O|O-O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h][1-8])/;
const SECRET_VALUE_RE = /\b(?:authorization|bearer|cookie|localStorage|password|secret|token)\b/i;

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function countMap(input: Record<string, number> | undefined): Record<string, number> {
  if (!input) return {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [safeLabel(key), count(value)] as const)
      .filter(([key, value]) => key !== 'unknown' && value > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function safeLabel(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const trimmed = value.trim();
  if (!SAFE_LABEL_RE.test(trimmed)) return 'unknown';
  if (SENSITIVE_KEY_RE.test(trimmed)) return 'unknown';
  return trimmed;
}

function safeOperation(value: unknown): string {
  if (value === 'put' || value === 'upsert' || value === 'delete') return value;
  return 'unknown';
}

function asCountableItem(value: unknown): CountableItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as CountableItem;
}

function addCount(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function sortedPositiveCounts(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function emptyOutboxComposition(): ReviewStorageOutboxComposition {
  return { total: 0, byStore: {}, byOperation: {}, invalidEntries: 0 };
}

export function summarizeOutboxEntries(entries: readonly unknown[]): ReviewStorageOutboxComposition {
  const byStore: Record<string, number> = {};
  const byOperation: Record<string, number> = {};
  let total = 0;
  let invalidEntries = 0;

  for (const entry of entries) {
    const item = asCountableItem(entry);
    if (!item) {
      invalidEntries++;
      continue;
    }
    total++;
    addCount(byStore, safeLabel(item.store));
    addCount(byOperation, safeOperation(item.operation));
  }

  return {
    total,
    byStore: sortedPositiveCounts(byStore),
    byOperation: sortedPositiveCounts(byOperation),
    invalidEntries,
  };
}

export function summarizeSerializedOutbox(rawValue: string | null | undefined): ReviewStorageOutboxComposition {
  if (!rawValue) return emptyOutboxComposition();
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) return { ...emptyOutboxComposition(), invalidEntries: 1 };
    return summarizeOutboxEntries(parsed);
  } catch {
    return { ...emptyOutboxComposition(), invalidEntries: 1 };
  }
}

export function summarizeFailedItemsBatch(input: {
  status?: unknown;
  items: readonly unknown[];
  pendingAfterFailure?: unknown;
  retryPreserved?: unknown;
}): ReviewStorageFailedBatchDiagnostic {
  const composition = summarizeOutboxEntries(input.items);
  const status = input.status === 'failed' || input.status === 'partial' ? input.status : 'unknown';
  return {
    action: 'items-batch',
    status,
    batchSize: composition.total,
    byStore: composition.byStore,
    byOperation: composition.byOperation,
    pendingAfterFailure: count(input.pendingAfterFailure),
    retryPreserved: input.retryPreserved === true,
    invalidEntries: composition.invalidEntries,
  };
}

function mergeCounts(...maps: readonly Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) addCount(merged, key, count(value));
  }
  return sortedPositiveCounts(merged);
}

function metadataObject(value: Record<string, DiagnosticMetadataValue>): DiagnosticMetadataValue {
  return value;
}

export function buildReviewStorageCountDiagnostic(input: ReviewStorageDiagnosticInput): DiagnosticMetadata {
  const outboxPendingTotal =
    count(input.outbox.legacy.total)
    + count(input.outbox.durable.total)
    + count(input.outbox.transientPending);
  const failedBatch = input.failedBatch ?? summarizeFailedItemsBatch({
    status: 'unknown',
    items: [],
    pendingAfterFailure: 0,
    retryPreserved: false,
  });

  return {
    category: 'review-storage-counts',
    trigger: input.trigger,
    generation: count(input.generation),
    durationMs: count(input.durationMs),
    analysisLibrary: metadataObject({
      totalStored: count(input.analysis.totalStored),
      completeStored: count(input.analysis.completeStored),
      partialStored: count(input.analysis.partialStored),
      loadableComplete: count(input.analysis.loadableComplete),
      completedWithoutCurrentGame: count(input.analysis.completedWithoutCurrentGame),
    }),
    gameSummaries: metadataObject({
      totalStored: count(input.summaries.totalStored),
      withoutCompletedAnalysis: count(input.summaries.withoutCompletedAnalysis),
    }),
    reviewedIndex: metadataObject({
      derived: count(input.reviewedIndex.derived),
      runtime: count(input.reviewedIndex.runtime),
      staleRuntimeEntriesCleared: count(input.reviewedIndex.staleRuntimeEntriesCleared),
    }),
    runtimeMaps: metadataObject({
      analyzedGameIds: count(input.runtimeMaps.analyzedGameIds),
      analyzedGameAccuracy: count(input.runtimeMaps.analyzedGameAccuracy),
      analyzedReviewEngine: count(input.runtimeMaps.analyzedReviewEngine),
      missedTacticGameIds: count(input.runtimeMaps.missedTacticGameIds),
    }),
    queueManifests: metadataObject({
      reviewQueueEntries: count(input.queueManifests.reviewQueueEntries),
      reviewRunManifests: count(input.queueManifests.reviewRunManifests),
      reviewFailureRecords: count(input.queueManifests.reviewFailureRecords),
      runtimeQueueTotal: count(input.queueManifests.runtimeQueueTotal),
      runtimeQueueDone: count(input.queueManifests.runtimeQueueDone),
      runtimeQueueFailed: count(input.queueManifests.runtimeQueueFailed),
      runtimeQueueSkipped: count(input.queueManifests.runtimeQueueSkipped),
      runtimeQueueRemainingGames: count(input.queueManifests.runtimeQueueRemainingGames),
      activeBatchGames: count(input.queueManifests.activeBatchGames),
    }),
    outboxTotals: metadataObject({
      pendingTotal: outboxPendingTotal,
      legacyPending: count(input.outbox.legacy.total),
      durablePending: count(input.outbox.durable.total),
      transientPending: count(input.outbox.transientPending),
      invalidEntries: count(input.outbox.legacy.invalidEntries) + count(input.outbox.durable.invalidEntries),
    }),
    outboxByStore: mergeCounts(input.outbox.legacy.byStore, input.outbox.durable.byStore),
    outboxByOperation: mergeCounts(input.outbox.legacy.byOperation, input.outbox.durable.byOperation),
    failedBatch: metadataObject({
      action: failedBatch.action,
      status: failedBatch.status,
      batchSize: count(failedBatch.batchSize),
      byStore: countMap(failedBatch.byStore),
      byOperation: countMap(failedBatch.byOperation),
      pendingAfterFailure: count(failedBatch.pendingAfterFailure),
      retryPreserved: failedBatch.retryPreserved,
      invalidEntries: count(failedBatch.invalidEntries),
    }),
    changedStores: countMap(input.changedStores),
  };
}

function assertContentFreeRecursive(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (FEN_VALUE_RE.test(value) || PGN_VALUE_RE.test(value) || SECRET_VALUE_RE.test(value)) {
      throw new Error(`Unsafe review storage diagnostic value at ${path}`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertContentFreeRecursive(entry, `${path}[${index}]`));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      throw new Error(`Unsafe review storage diagnostic key at ${path}.${key}`);
    }
    assertContentFreeRecursive(child, `${path}.${key}`);
  }
}

export function assertReviewStorageDiagnosticContentFree(value: unknown): void {
  assertContentFreeRecursive(value, '$');
}
