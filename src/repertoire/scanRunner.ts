import type { ImportedGame } from '../import/types';
import {
  buildRepertoireIndexFromSource,
  isUploadedRepertoireSource,
  repertoireMatchRecordKey,
  type RepertoireMatchRecord,
  type RepertoirePositionIndex,
  type RepertoireScanRun,
  type RepertoireSource,
} from './index';
import {
  computeRepertoireMatchRecord,
} from './scan';
import {
  createRepertoireScanRunManifest,
  hydrateRepertoireScanRunManifest,
  repertoireScanSourceVersion,
  repertoireScanRunSourceVersionsMatch,
  withRepertoireScanRunComplete,
  withRepertoireScanRunLifecycleState,
  withRepertoireScanRunProgress,
} from './scanRun';
import {
  countRepertoireScanGames,
  listRepertoireMatchRecordsForGameIds,
  listRepertoireScanRuns,
  listUploadedRepertoireSources,
  loadRepertoireScanGamePage,
  saveRepertoireMatchRecords,
  saveRepertoireScanRun,
} from './sourceDb';

export interface RepertoireScanGamePage {
  games: ImportedGame[];
  nextAfterGameId: string | null;
  hasMore: boolean;
}

export interface RepertoireScanStorage {
  listSources(): Promise<RepertoireSource[]>;
  countGames(): Promise<number>;
  loadGamePage(limit: number, afterGameId: string | null): Promise<RepertoireScanGamePage>;
  listMatchRecordsForGameIds(gameIds: readonly string[]): Promise<RepertoireMatchRecord[]>;
  listScanRuns(): Promise<RepertoireScanRun[]>;
  saveMatchRecords(records: readonly RepertoireMatchRecord[]): Promise<void>;
  saveScanRun(run: RepertoireScanRun): Promise<void>;
}

export type RepertoireScanProgressState =
  | 'empty'
  | 'ready'
  | 'running'
  | 'paused'
  | 'complete'
  | 'error';

export interface RepertoireScanProgressSnapshot {
  state: RepertoireScanProgressState;
  scannedGameCount: number;
  totalGameCount: number;
  sourceCount: number;
  runId: string | null;
  updatedAt: number | null;
  message: string | null;
}

export interface RunRepertoireComplianceScanOptions {
  chunkSize?: number;
  filtersAtRun?: Record<string, unknown>;
  now?: () => number;
  yieldToMain?: () => Promise<void>;
  onProgress?: (snapshot: RepertoireScanProgressSnapshot) => void;
}

export interface RepertoireComplianceScanResult {
  manifest: RepertoireScanRun;
  scannedGameCount: number;
  totalGameCount: number;
  sourceCount: number;
  computedRecordCount: number;
  skippedRecordCount: number;
  yieldedChunkCount: number;
  durationMs: number;
  paused: boolean;
}

const DEFAULT_CHUNK_SIZE = 25;

let _activeScan: { pauseRequested: boolean } | null = null;

export function isRepertoireComplianceScanRunning(): boolean {
  return _activeScan !== null;
}

export function requestRepertoireComplianceScanPause(): void {
  if (_activeScan) _activeScan.pauseRequested = true;
}

export const browserRepertoireScanStorage: RepertoireScanStorage = {
  listSources: listUploadedRepertoireSources,
  countGames: countRepertoireScanGames,
  loadGamePage: loadRepertoireScanGamePage,
  listMatchRecordsForGameIds: listRepertoireMatchRecordsForGameIds,
  listScanRuns: listRepertoireScanRuns,
  saveMatchRecords: saveRepertoireMatchRecords,
  saveScanRun: saveRepertoireScanRun,
};

function defaultYieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function newestFirst(a: Pick<RepertoireScanRun, 'updatedAt'>, b: Pick<RepertoireScanRun, 'updatedAt'>): number {
  return b.updatedAt - a.updatedAt;
}

function clampProgress(scannedGameCount: number, totalGameCount: number): number {
  return Math.min(Math.max(0, scannedGameCount), totalGameCount);
}

function buildSourceIndexes(
  sources: readonly RepertoireSource[],
): Map<string, RepertoirePositionIndex> {
  const indexes = new Map<string, RepertoirePositionIndex>();
  for (const source of sources) {
    try {
      indexes.set(source.id, buildRepertoireIndexFromSource(source));
    } catch {
      indexes.set(source.id, new Map());
    }
  }
  return indexes;
}

function snapshotFromManifest(params: {
  manifest: RepertoireScanRun | null;
  state: RepertoireScanProgressState;
  totalGameCount: number;
  sourceCount: number;
  message?: string | null;
}): RepertoireScanProgressSnapshot {
  return {
    state:            params.state,
    scannedGameCount: clampProgress(params.manifest?.scannedGameCount ?? 0, params.totalGameCount),
    totalGameCount:   params.totalGameCount,
    sourceCount:      params.sourceCount,
    runId:            params.manifest?.runId ?? null,
    updatedAt:        params.manifest?.updatedAt ?? null,
    message:          params.message ?? null,
  };
}

async function currentSourcesAndGameCount(storage: RepertoireScanStorage): Promise<{
  sources: RepertoireSource[];
  totalGameCount: number;
}> {
  const [allSources, totalGameCount] = await Promise.all([
    storage.listSources(),
    storage.countGames(),
  ]);
  const sources = allSources.filter(source => isUploadedRepertoireSource(source) && source.enabled);
  return { sources, totalGameCount };
}

function latestCompleteOrIncompleteRun(
  runs: readonly RepertoireScanRun[],
  sources: readonly RepertoireSource[],
): RepertoireScanRun | null {
  return [...runs]
    .filter(run => repertoireScanRunSourceVersionsMatch(run, sources))
    .sort(newestFirst)[0] ?? null;
}

async function resumeOrCreateManifest(params: {
  storage: RepertoireScanStorage;
  sources: readonly RepertoireSource[];
  filtersAtRun: Record<string, unknown>;
  now: number;
}): Promise<RepertoireScanRun> {
  const runs = (await params.storage.listScanRuns()).sort(newestFirst);
  for (const run of runs) {
    if (run.lifecycleState === 'complete' || run.lifecycleState === 'stale') continue;
    const hydration = hydrateRepertoireScanRunManifest(run, params.sources, params.now);
    if (hydration.changed) await params.storage.saveScanRun(hydration.manifest);
    if (hydration.manifest.lifecycleState !== 'stale') {
      const running = withRepertoireScanRunLifecycleState(hydration.manifest, 'running', params.now);
      if (running !== hydration.manifest) await params.storage.saveScanRun(running);
      return running;
    }
  }

  const manifest = createRepertoireScanRunManifest({
    sources: params.sources,
    filtersAtRun: params.filtersAtRun,
    now: params.now,
  });
  await params.storage.saveScanRun(manifest);
  return manifest;
}

export async function getRepertoireScanProgressSnapshot(
  storage: RepertoireScanStorage = browserRepertoireScanStorage,
): Promise<RepertoireScanProgressSnapshot> {
  try {
    const { sources, totalGameCount } = await currentSourcesAndGameCount(storage);
    const sourceCount = sources.length;
    if (sourceCount === 0) {
      return snapshotFromManifest({
        manifest: null,
        state: 'empty',
        totalGameCount,
        sourceCount,
        message: 'No repertoire sources yet.',
      });
    }
    if (totalGameCount === 0) {
      return snapshotFromManifest({
        manifest: null,
        state: 'empty',
        totalGameCount,
        sourceCount,
        message: 'No imported games to scan.',
      });
    }

    const latestRun = latestCompleteOrIncompleteRun(await storage.listScanRuns(), sources);
    if (!latestRun) {
      return snapshotFromManifest({
        manifest: null,
        state: 'ready',
        totalGameCount,
        sourceCount,
      });
    }

    const active = isRepertoireComplianceScanRunning();
    const state: RepertoireScanProgressState = active
      ? 'running'
      : latestRun.lifecycleState === 'complete'
        ? 'complete'
        : 'paused';
    return snapshotFromManifest({
      manifest: latestRun,
      state,
      totalGameCount,
      sourceCount,
    });
  } catch (error) {
    return {
      state: 'error',
      scannedGameCount: 0,
      totalGameCount: 0,
      sourceCount: 0,
      runId: null,
      updatedAt: null,
      message: error instanceof Error ? error.message : 'Could not load scan status.',
    };
  }
}

export async function runRepertoireComplianceScanWithStorage(
  storage: RepertoireScanStorage,
  options: RunRepertoireComplianceScanOptions = {},
): Promise<RepertoireComplianceScanResult> {
  if (_activeScan) throw new Error('Repertoire compliance scan is already running.');
  const activeScan = { pauseRequested: false };
  _activeScan = activeScan;

  const startedAt = Date.now();
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE));
  const now = options.now ?? Date.now;
  const yieldToMain = options.yieldToMain ?? defaultYieldToMain;
  let computedRecordCount = 0;
  let skippedRecordCount = 0;
  let yieldedChunkCount = 0;

  try {
    const { sources, totalGameCount } = await currentSourcesAndGameCount(storage);
    const sourceCount = sources.length;
    let manifest = await resumeOrCreateManifest({
      storage,
      sources,
      filtersAtRun: options.filtersAtRun ?? {},
      now: now(),
    });
    options.onProgress?.(snapshotFromManifest({
      manifest,
      state: 'running',
      totalGameCount,
      sourceCount,
    }));

    if (sourceCount === 0 || totalGameCount === 0) {
      manifest = withRepertoireScanRunComplete(manifest, 0, now());
      await storage.saveScanRun(manifest);
      return {
        manifest,
        scannedGameCount: 0,
        totalGameCount,
        sourceCount,
        computedRecordCount,
        skippedRecordCount,
        yieldedChunkCount,
        durationMs: Date.now() - startedAt,
        paused: false,
      };
    }

    const sourceIndexes = buildSourceIndexes(sources);
    let afterGameId: string | null = null;
    let scannedGameCount = 0;

    while (true) {
      const page = await storage.loadGamePage(chunkSize, afterGameId);
      if (page.games.length === 0) break;

      const gameIds = page.games.map(game => game.id);
      const existingRecords = await storage.listMatchRecordsForGameIds(gameIds);
      const existingByKey = new Map(existingRecords.map(record => [record.key, record]));
      const recordsToSave: RepertoireMatchRecord[] = [];
      const scannedAt = now();

      for (const game of page.games) {
        for (const source of sources) {
          const key = repertoireMatchRecordKey(source.id, game.id);
          const existing = existingByKey.get(key);
          const sourceVersion = repertoireScanSourceVersion(source);
          if (existing?.sourceVersion === sourceVersion) {
            skippedRecordCount += 1;
            continue;
          }
          recordsToSave.push(computeRepertoireMatchRecord({
            game,
            source,
            sourceIndex: sourceIndexes.get(source.id)!,
            scannedAt,
          }));
          computedRecordCount += 1;
        }
        scannedGameCount += 1;
      }

      await storage.saveMatchRecords(recordsToSave);
      manifest = withRepertoireScanRunProgress(
        manifest,
        Math.max(manifest.scannedGameCount, scannedGameCount),
        now(),
      );
      await storage.saveScanRun(manifest);
      options.onProgress?.(snapshotFromManifest({
        manifest,
        state: 'running',
        totalGameCount,
        sourceCount,
      }));

      if (activeScan.pauseRequested) {
        manifest = withRepertoireScanRunLifecycleState(manifest, 'paused', now());
        await storage.saveScanRun(manifest);
        return {
          manifest,
          scannedGameCount: manifest.scannedGameCount,
          totalGameCount,
          sourceCount,
          computedRecordCount,
          skippedRecordCount,
          yieldedChunkCount,
          durationMs: Date.now() - startedAt,
          paused: true,
        };
      }

      afterGameId = page.nextAfterGameId;
      if (!page.hasMore || afterGameId === null) break;
      yieldedChunkCount += 1;
      await yieldToMain();
    }

    manifest = withRepertoireScanRunComplete(
      manifest,
      Math.max(manifest.scannedGameCount, scannedGameCount),
      now(),
    );
    await storage.saveScanRun(manifest);
    options.onProgress?.(snapshotFromManifest({
      manifest,
      state: 'complete',
      totalGameCount,
      sourceCount,
    }));

    return {
      manifest,
      scannedGameCount: manifest.scannedGameCount,
      totalGameCount,
      sourceCount,
      computedRecordCount,
      skippedRecordCount,
      yieldedChunkCount,
      durationMs: Date.now() - startedAt,
      paused: false,
    };
  } finally {
    if (_activeScan === activeScan) _activeScan = null;
  }
}

export function runRepertoireComplianceScan(
  options: RunRepertoireComplianceScanOptions = {},
): Promise<RepertoireComplianceScanResult> {
  return runRepertoireComplianceScanWithStorage(browserRepertoireScanStorage, options);
}
