import type {
  RepertoireScanLifecycleState,
  RepertoireScanRun,
  RepertoireSource,
} from './index';

export interface CreateRepertoireScanRunInput {
  sources: readonly Pick<RepertoireSource, 'id' | 'contentVersion' | 'side'>[];
  filtersAtRun?: Record<string, unknown>;
  now?: number;
}

export interface RepertoireScanRunHydrationResult {
  manifest: RepertoireScanRun;
  changed: boolean;
}

export function createRepertoireScanRunId(now = Date.now()): string {
  return `repertoire-scan-run-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export function repertoireScanSourceVersion(
  source: Pick<RepertoireSource, 'contentVersion' | 'side'>,
): string {
  return `scan-v1:pgn:${source.contentVersion}:side:${source.side}`;
}

export function sourceVersionsForRepertoireScan(
  sources: readonly Pick<RepertoireSource, 'id' | 'contentVersion' | 'side'>[],
): Record<string, string> {
  return Object.fromEntries(sources.map(source => [source.id, repertoireScanSourceVersion(source)]));
}

export function createRepertoireScanRunManifest(input: CreateRepertoireScanRunInput): RepertoireScanRun {
  const now = input.now ?? Date.now();
  return {
    runId:            createRepertoireScanRunId(now),
    sourceVersions:   sourceVersionsForRepertoireScan(input.sources),
    scannedGameCount: 0,
    lifecycleState:   'running',
    filtersAtRun:     { ...(input.filtersAtRun ?? {}) },
    createdAt:        now,
    updatedAt:        now,
  };
}

export function normalizeRepertoireScanRunManifest(manifest: RepertoireScanRun): RepertoireScanRun {
  return {
    ...manifest,
    sourceVersions:   manifest.sourceVersions ?? {},
    scannedGameCount: manifest.scannedGameCount ?? 0,
    lifecycleState:   manifest.lifecycleState ?? 'running',
    filtersAtRun:     manifest.filtersAtRun ?? {},
  };
}

export function repertoireScanRunSourceVersionsMatch(
  manifest: Pick<RepertoireScanRun, 'sourceVersions'>,
  sources: readonly Pick<RepertoireSource, 'id' | 'contentVersion' | 'side'>[],
): boolean {
  const expected = sourceVersionsForRepertoireScan(sources);
  const expectedEntries = Object.entries(expected);
  const actualKeys = Object.keys(manifest.sourceVersions);
  if (actualKeys.length !== expectedEntries.length) return false;
  return expectedEntries.every(([sourceId, version]) => manifest.sourceVersions[sourceId] === version);
}

export function withRepertoireScanRunProgress(
  manifest: RepertoireScanRun,
  scannedGameCount: number,
  now = Date.now(),
): RepertoireScanRun {
  if (manifest.scannedGameCount === scannedGameCount) return manifest;
  return {
    ...manifest,
    scannedGameCount,
    updatedAt: now,
  };
}

export function withRepertoireScanRunLifecycleState(
  manifest: RepertoireScanRun,
  lifecycleState: RepertoireScanLifecycleState,
  now = Date.now(),
): RepertoireScanRun {
  if (manifest.lifecycleState === lifecycleState) return manifest;
  return {
    ...manifest,
    lifecycleState,
    updatedAt: now,
  };
}

export function withRepertoireScanRunComplete(
  manifest: RepertoireScanRun,
  scannedGameCount = manifest.scannedGameCount,
  now = Date.now(),
): RepertoireScanRun {
  const progressed = withRepertoireScanRunProgress(manifest, scannedGameCount, now);
  return withRepertoireScanRunLifecycleState(progressed, 'complete', now);
}

export function hydrateRepertoireScanRunManifest(
  manifest: RepertoireScanRun,
  sources: readonly Pick<RepertoireSource, 'id' | 'contentVersion' | 'side'>[],
  now = Date.now(),
): RepertoireScanRunHydrationResult {
  const normalized = normalizeRepertoireScanRunManifest(manifest);
  let changed =
    normalized.sourceVersions !== manifest.sourceVersions
    || normalized.scannedGameCount !== manifest.scannedGameCount
    || normalized.lifecycleState !== manifest.lifecycleState
    || normalized.filtersAtRun !== manifest.filtersAtRun;

  if (!repertoireScanRunSourceVersionsMatch(normalized, sources) && normalized.lifecycleState !== 'stale') {
    return {
      manifest: {
        ...normalized,
        lifecycleState: 'stale',
        updatedAt: now,
      },
      changed: true,
    };
  }

  return { manifest: normalized, changed };
}
