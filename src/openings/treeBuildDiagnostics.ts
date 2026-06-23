import { record } from '../diagnostics/record';
import { currentAppRoute } from '../diagnostics/route';
import { getDeviceMetadata } from '../diagnostics/session';
import { Severity, type DiagnosticMetadata } from '../diagnostics/types';
import type { OpeningsTool, ResearchCollection, ResearchSource } from './types';

export type OpeningTreeBuildReason = 'open-collection' | 'filter-rebuild';
export type OpeningTreeBuildPhase = 'start' | 'milestone' | 'complete' | 'failed';

export const OPENING_TREE_BUILD_MILESTONES = [25, 50, 75, 100] as const;

export interface OpeningTreeBuildContext {
  buildId: string;
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
  milestonePercent?: number;
  errorName?: string;
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
  now?: number;
}): OpeningTreeBuildContext {
  const speedFilters = safeSpeedFilters(options.speedFilter);
  return {
    buildId: createOpeningTreeBuildId(options.now),
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
  return {
    buildId: context.buildId,
    phase: details.phase,
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
    ...(details.errorName ? { errorName: details.errorName } : {}),
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
