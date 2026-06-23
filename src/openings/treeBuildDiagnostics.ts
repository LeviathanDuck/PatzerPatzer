import { record } from '../diagnostics/record';
import { currentAppRoute } from '../diagnostics/route';
import { getDeviceMetadata } from '../diagnostics/session';
import { Severity, type DiagnosticMetadata } from '../diagnostics/types';
import type { OpeningsTool, ResearchCollection, ResearchSource } from './types';

export type OpeningTreeBuildReason = 'open-collection' | 'filter-rebuild';
export type OpeningTreeBuildPhase =
  | 'start'
  | 'milestone'
  | 'chunk'
  | 'snapshot'
  | 'sample-scan'
  | 'sample-stale'
  | 'complete'
  | 'failed'
  | 'stale-suppressed';
export type OpeningTreeBuildPhaseDetail =
  | 'load-account-games'
  | 'add-games'
  | 'freeze'
  | 'current-path-snapshot'
  | 'render-snapshot'
  | 'sample-scan'
  | 'cancelled'
  | 'stale-suppressed'
  | 'complete';
export type OpeningTreeSnapshotMode = 'empty' | 'interim' | 'final' | 'lazy-current' | 'full-on-demand' | 'skipped';

export const OPENING_TREE_BUILD_MILESTONES = [25, 50, 75, 100] as const;

export interface OpeningTreeBuildContext {
  buildId: string;

  buildGeneration: number;
  reason: OpeningTreeBuildReason;
  collectionKind: 'account' | 'saved';
  collectionSource: ResearchSource;
  totalGames: number;
  filteredGames: number;
  colorFilter: 'white' | 'black' | 'both';
  speedFilterCount: number;
  speedFilters: string[];
  dateRange: string;
  activeTool: OpeningsTool;
  chunkSize: number;
  startedAt: number;
}

export interface OpeningTreeBuildEventDetails {
  phase: OpeningTreeBuildPhase;
  progressGames: number;
  phaseDetail?: OpeningTreeBuildPhaseDetail;
  milestonePercent?: number;
  chunkIndex?: number;
  chunkDurationMs?: number;
  freezeDurationMs?: number;
  snapshotDurationMs?: number;
  sampleScanDurationMs?: number;
  sampleMatchCount?: number;
  sampleLimit?: number;
  positionsCount?: number;
  nodeCount?: number;
  snapshotMode?: OpeningTreeSnapshotMode;
  errorName?: string;

  activeBuildCount?: number;
  /** The newer generation that superseded this build, for stale-suppressed events. */
  supersededByGeneration?: number;
  /** Why a build stopped early, e.g. superseded-by-newer-build or session-closed. */
  cancelReason?: string;
}

export interface OpeningTreeBuildMilestoneResult {
  milestones: number[];
  nextIndex: number;
}

let treeBuildSequence = 0;

function safeSpeedFilters(speedFilter: ReadonlySet<string>): string[] {
  return [...speedFilter]
    .map(speed => speed.trim())
    .filter(speed => /^[a-z0-9_-]{1,24}$/i.test(speed))
    .sort()
    .slice(0, 12);
}

function collectionKind(collection: ResearchCollection): 'account' | 'saved' {
  return collection.id.startsWith('account:') ? 'account' : 'saved';
}

export function createOpeningTreeBuildId(now = Date.now()): string {
  treeBuildSequence += 1;
  return `opening-tree-${now.toString(36)}-${treeBuildSequence.toString(36)}`;
}

export function createOpeningTreeBuildContext(options: {
  reason: OpeningTreeBuildReason;
  collection: ResearchCollection;
  filteredGames: number;
  colorFilter: 'white' | 'black' | 'both';
  speedFilter: ReadonlySet<string>;
  dateRange: string | null;
  activeTool: OpeningsTool;
  chunkSize: number;
  buildGeneration: number;
  now?: number;
}): OpeningTreeBuildContext {
  const speedFilters = safeSpeedFilters(options.speedFilter);
  return {
    buildId: createOpeningTreeBuildId(options.now),
    buildGeneration: Math.max(0, Math.floor(options.buildGeneration)),
    reason: options.reason,
    collectionKind: collectionKind(options.collection),
    collectionSource: options.collection.source,
    totalGames: Math.max(0, options.collection.games.length),
    filteredGames: Math.max(0, options.filteredGames),
    colorFilter: options.colorFilter,
    speedFilterCount: speedFilters.length,
    speedFilters,
    dateRange: options.dateRange ?? 'all',
    activeTool: options.activeTool,
    chunkSize: Math.max(0, Math.floor(options.chunkSize)),
    startedAt: options.now ?? Date.now(),
  };
}

export function openingTreeBuildMilestonesForProgress(
  totalGames: number,
  progressGames: number,
  nextIndex: number,
): OpeningTreeBuildMilestoneResult {
  const safeTotal = Math.max(0, totalGames);
  const safeProgress = Math.max(0, progressGames);
  if (safeTotal === 0) return { milestones: [], nextIndex: Math.max(0, Math.floor(nextIndex)) };

  const progressPercent = safeTotal === 0 ? 100 : (safeProgress / safeTotal) * 100;
  const milestones: number[] = [];
  let index = Math.max(0, Math.floor(nextIndex));

  while (
    index < OPENING_TREE_BUILD_MILESTONES.length
    && progressPercent >= OPENING_TREE_BUILD_MILESTONES[index]!
  ) {
    milestones.push(OPENING_TREE_BUILD_MILESTONES[index]!);
    index += 1;
  }

  return { milestones, nextIndex: index };
}

function progressPercent(totalGames: number, progressGames: number): number {
  if (totalGames <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((progressGames / totalGames) * 100)));
}

function safeDuration(durationMs: number | undefined): number | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return undefined;
  return Math.max(0, Math.round(durationMs));
}

function safeCount(count: number | undefined): number | undefined {
  if (count === undefined || !Number.isFinite(count)) return undefined;
  return Math.max(0, Math.floor(count));
}

function countBucket(count: number | undefined): string | undefined {
  const safe = safeCount(count);
  if (safe === undefined) return undefined;
  if (safe === 0) return '0';
  if (safe <= 100) return '1-100';
  if (safe <= 500) return '101-500';
  if (safe <= 1000) return '501-1000';
  if (safe <= 2500) return '1001-2500';
  if (safe <= 5000) return '2501-5000';
  if (safe <= 10000) return '5001-10000';
  if (safe <= 25000) return '10001-25000';
  if (safe <= 50000) return '25001-50000';
  return '50000+';
}

function bytesBucket(bytes: number | undefined): string | undefined {
  const safe = safeCount(bytes);
  if (safe === undefined) return undefined;
  const mib = safe / (1024 * 1024);
  if (mib <= 64) return '0-64mb';
  if (mib <= 128) return '65-128mb';
  if (mib <= 256) return '129-256mb';
  if (mib <= 512) return '257-512mb';
  if (mib <= 1024) return '513mb-1gb';
  if (mib <= 2048) return '1gb-2gb';
  return '2gb+';
}

function ratioBucket(ratio: number | undefined): string | undefined {
  if (ratio === undefined || !Number.isFinite(ratio)) return undefined;
  if (ratio <= 0.25) return '0-25';
  if (ratio <= 0.5) return '26-50';
  if (ratio <= 0.75) return '51-75';
  if (ratio <= 0.9) return '76-90';
  return '91-100';
}

function heapBuckets(): { heapUsedBucket?: string; heapRatioBucket?: string } {
  const memory = typeof performance !== 'undefined'
    ? (performance as Performance & {
      memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
    }).memory
    : undefined;
  if (!memory) return {};
  const buckets: { heapUsedBucket?: string; heapRatioBucket?: string } = {};
  const heapUsedBucket = bytesBucket(memory.usedJSHeapSize);
  if (heapUsedBucket) buckets.heapUsedBucket = heapUsedBucket;
  const heapRatioBucket = memory.usedJSHeapSize !== undefined && memory.jsHeapSizeLimit
    ? ratioBucket(memory.usedJSHeapSize / memory.jsHeapSizeLimit)
    : undefined;
  if (heapRatioBucket) buckets.heapRatioBucket = heapRatioBucket;
  return buckets;
}

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name || 'Error';
  return typeof error;
}

export function buildOpeningTreeDiagnosticMetadata(
  context: OpeningTreeBuildContext,
  details: OpeningTreeBuildEventDetails,
  now = Date.now(),
): DiagnosticMetadata {
  const device = getDeviceMetadata();
  const chunkDurationMs = safeDuration(details.chunkDurationMs);
  const freezeDurationMs = safeDuration(details.freezeDurationMs);
  const snapshotDurationMs = safeDuration(details.snapshotDurationMs);
  const sampleScanDurationMs = safeDuration(details.sampleScanDurationMs);
  const sampleMatchCountBucket = countBucket(details.sampleMatchCount);
  const positionsCountBucket = countBucket(details.positionsCount);
  const nodeCountBucket = countBucket(details.nodeCount);
  return {
    buildId: context.buildId,
    buildGeneration: context.buildGeneration,
    phase: details.phase,
    ...(details.phaseDetail ? { phaseDetail: details.phaseDetail } : {}),
    reason: context.reason,
    collectionKind: context.collectionKind,
    collectionSource: context.collectionSource,
    totalGames: context.totalGames,
    filteredGames: context.filteredGames,
    progressGames: Math.max(0, details.progressGames),
    progressPercent: details.milestonePercent ?? progressPercent(context.filteredGames, details.progressGames),
    chunkSize: context.chunkSize,
    elapsedMs: Math.max(0, now - context.startedAt),
    colorFilter: context.colorFilter,
    speedFilterCount: context.speedFilterCount,
    speedFilters: context.speedFilters,
    dateRange: context.dateRange,
    activeTool: context.activeTool,
    deviceClass: device.deviceClass ?? 'unknown',
    viewportWidth: device.viewportWidth ?? '0',
    viewportHeight: device.viewportHeight ?? '0',
    ...(details.chunkIndex !== undefined ? { chunkIndex: Math.max(0, Math.floor(details.chunkIndex)) } : {}),
    ...(chunkDurationMs !== undefined ? { chunkDurationMs } : {}),
    ...(freezeDurationMs !== undefined ? { freezeDurationMs } : {}),
    ...(snapshotDurationMs !== undefined ? { snapshotDurationMs } : {}),
    ...(sampleScanDurationMs !== undefined ? { sampleScanDurationMs } : {}),
    ...(sampleMatchCountBucket ? { sampleMatchCountBucket } : {}),
    ...(details.sampleLimit !== undefined ? { sampleLimit: Math.max(0, Math.floor(details.sampleLimit)) } : {}),
    ...(positionsCountBucket ? { positionsCountBucket } : {}),
    ...(nodeCountBucket ? { nodeCountBucket } : {}),
    ...(details.snapshotMode ? { snapshotMode: details.snapshotMode } : {}),
    ...heapBuckets(),
    ...(details.errorName ? { errorName: details.errorName } : {}),
    ...(details.activeBuildCount !== undefined ? { activeBuildCount: Math.max(0, details.activeBuildCount) } : {}),
    ...(details.supersededByGeneration !== undefined ? { supersededByGeneration: Math.max(0, details.supersededByGeneration) } : {}),
    ...(details.cancelReason ? { cancelReason: details.cancelReason } : {}),
  };
}

export function recordOpeningTreeBuildEvent(
  context: OpeningTreeBuildContext,
  details: OpeningTreeBuildEventDetails,
): void {
  record({
    kind: 'performance',
    severity: details.phase === 'failed' ? Severity.Warn : Severity.Info,
    source: 'openings/treeBuildDiagnostics',
    sourceTag: 'openings.tree-build',
    message: `opening-tree-build-${details.phase}`,
    route: currentAppRoute(),
    metadata: buildOpeningTreeDiagnosticMetadata(context, details),
    redactionClass: 'safe',
  });
}

export function recordOpeningTreeBuildFailure(
  context: OpeningTreeBuildContext,
  progressGames: number,
  error: unknown,
): void {
  recordOpeningTreeBuildEvent(context, {
    phase: 'failed',
    progressGames,
    errorName: errorName(error),
  });
}
