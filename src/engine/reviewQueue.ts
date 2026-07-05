// Background bulk review queue.
// Manages a second independent Stockfish engine instance that analyzes games
// in the background without interfering with the live analysis engine.
// Each game in the queue has its own AnalyseCtrl and eval cache.

import { StockfishProtocol } from '../ceval/protocol';
import { record, getSessionId, Severity } from '../diagnostics';
import { captureMemorySnapshot } from '../diagnostics/performance/deviceSignals';
import { isEngineSearching, sharedProtocolBusyState } from './ctrl';
import { AnalyseCtrl } from '../analyse/ctrl';
import { evalWinChances } from './winchances';
import { hasMissedMoments, detectMissedMoments, onMissedMomentConfigChange, getMissedMoments, setMissedMoments, clearMissedMoments, type MissedMoment } from './tactics';
import { computeAnalysisSummary } from '../analyse/evalView';
import {
  buildAnalysisNodes, buildAnalysisNodeEntry, buildReviewEngineMetadata, saveAnalysisToIdbStrict, type ReviewEngineMetadata,
  saveReviewQueueManifest, clearReviewQueueManifestEntry, clearReviewQueueManifest,
  loadReviewQueueManifestWithDiagnostics, loadAnalysisFromIdb, type StoredNodeEntry,
  saveReviewFailureRecord, deleteReviewFailureRecord, loadReviewFailureRecords,
  saveReviewRunManifest, loadLatestReviewRunManifest,
  saveGameSummary,
  storedAnalysisSatisfiesAskingDepth,
} from '../idb/index';
import { extractGameSummary } from '../stats/extract';
import { invalidateSummariesCache } from '../stats/ctrl';
import { pgnToTree } from '../tree/pgn';


import { bulkReviewDepth, bulkReviewMovetime, syncBulkReviewDepthSetting } from './reviewProfiles';
import {
  createReviewRunManifest,
  createReviewSearchOwner,
  hydrateReviewRunFailureCounts,
  isReviewRunHygieneCadenceBoundary,
  isReviewRunStale,
  normalizeReviewRunManifest,
  REVIEW_RUN_HYGIENE_CADENCE,
  reviewGamesInNewestFirstOrder,
  reviewQueueEntryStalledByReloadPause,
  reviewSearchIdentityMatches,
  reviewRunSourceUiItems,
  sampleReviewRunProgressByVisibility,
  searchOwnerConsumeBestmove,
  searchOwnerDescriptorIsActive,
  searchOwnerHead,
  searchOwnerMarkAllStale,
  searchOwnerMarkKindStale,
  searchOwnerOutstanding,
  searchOwnerRegisterGo,
  searchOwnerReset,
  selectNextReviewRunBatch,
  timeControlContextForGames,
  reviewRunCircuitBreakerShouldTrip,
  reviewRunSummaryFromManifest,
  verifyReviewRunManifestConsistency,
  type ReviewSearchDescriptor,
  type ReviewRunBreakerReason,
  type ReviewRunLifecycleState,
  type ReviewRunManifest,
  type ReviewRunManifestConsistencyIssue,
  type ReviewRunNextBatchSelection,
  type ReviewRunFailureState,
  type ReviewRunProgressSampleAnchor,
  type ReviewSearchIdentitySnapshot,
  type ReviewRunSourceContext,
  type ReviewRunTimeControlContext,
  withReviewRunActiveBatchGameMoved,
  withReviewRunBreakerCleared,
  withReviewRunBreakerTripped,
  withReviewRunGameComplete,
  withReviewRunGameFailed,
  withReviewRunGameFailureRecorded,
  withReviewRunGameSkippedFromActiveBatch,
  withReviewRunGameSkipped,
  withReviewRunSourceContextAppended,
  withReviewRunAutoRetryEnabled,
  withReviewRunUnattendedRunEnabled,
} from './reviewRun';
import type { ImportedGame } from '../import/types';
import type { PositionEval } from './ctrl';
import type { TreeNode } from '../tree/types';
import {
  contextFromNodeList,
  engineFenEquals,
  engineFenHash,
  replayEnginePositionContext,
  type EnginePositionContext,
  type EnginePositionReplayFailureReason,
  type EnginePositionReplayResult,
} from './positionContext';
import { uciMoveIsLegalInFen } from './reviewResultBinding';
import {
  dataManagementScopeMatchesGameId,
  type DataManagementFenceResult,
  type DataManagementLocalChangeDetail,
} from '../sync/dataManagementRuntime';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';









const reviewDebugLogging = localStorage.getItem('patzer.reviewQueueDebug') === 'true';

function reviewDebugLog(...args: unknown[]): void {
  if (reviewDebugLogging) console.log(...args);
}

function isTerminalReviewFen(fen: string): boolean {
  const setup = parseFen(fen);
  if (!setup.isOk) return false;
  const position = Chess.fromSetup(setup.value);
  return position.isOk ? position.value.isEnd() : false;
}

// --- Background engine instance ---
// Initialized lazily on first enqueueBulkReview call.
// Runs at Threads=1, Hash=32 to minimize CPU/memory competition with the live engine.

const REVIEW_ENGINE_THREADS = 1;
const REVIEW_ENGINE_HASH_MB = 32;
const REVIEW_ENGINE_DESKTOP_MAX_THREADS = 4;

export const reviewProtocol = new StockfishProtocol({ threads: REVIEW_ENGINE_THREADS, hash: REVIEW_ENGINE_HASH_MB });
let reviewEngineReady       = false;
let reviewEngineInitStarted = false;
let reviewEngineFailed      = false;
let reviewProtocolThreads   = REVIEW_ENGINE_THREADS;
const reviewGameStartedAt = new WeakMap<ReviewQueueEntry, number>();
const reviewEngineReadyWaiters = new Set<(ready: boolean) => void>();

export type ReviewProtocolMessageHandler = (line: string) => void;

export interface TreeEvalEngineLease {
  setPositionContext(context: EnginePositionContext): void;
  go(depth: number, multiPv?: number, movetime?: number): void;
  stop(): void;
  release(): void;
}

interface TreeEvalLeaseState {
  token: symbol;
  onMessage: ReviewProtocolMessageHandler;
  onPreempt: (reason: string) => void;
}

let treeEvalLease: TreeEvalLeaseState | null = null;
let treeEvalPreemptDrainActive = false;
let treeEvalPreemptDrainTimer: ReturnType<typeof setTimeout> | null = null;
const TREE_EVAL_PREEMPT_DRAIN_TIMEOUT_MS = 5_000;

function clearTreeEvalPreemptDrain(): void {
  if (treeEvalPreemptDrainTimer !== null) {
    clearTimeout(treeEvalPreemptDrainTimer);
    treeEvalPreemptDrainTimer = null;
  }
  treeEvalPreemptDrainActive = false;
}

function finishTreeEvalPreemptDrain(reason: 'bestmove' | 'timeout'): void {
  if (!treeEvalPreemptDrainActive) return;
  clearTreeEvalPreemptDrain();
  if (reason === 'timeout') {
    const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
    if (entry) {
      record({
        kind: 'engine',
        severity: Severity.Error,
        source: 'review-engine',
        sourceTag: 'review-engine',
        message: 'review-tree-eval-preempt-drain-timeout',
        metadata: {
          role: reviewDiagnosticRole(),
          safeGameId: safeReviewGameId(entry.game.id),
          positionIndex: reviewItemIndex,
          timeoutMs: TREE_EVAL_PREEMPT_DRAIN_TIMEOUT_MS,
          timestamp: Date.now(),
        },
        redactionClass: 'safe',
      });
      markActiveEntryErrored('review-tree-eval-preempt-drain-timeout');
    }
    return;
  }

  if (!queuePaused && !reviewSearchActive && reviewItemQueue[reviewItemIndex]) {
    sendNextItem();
  }
}

function beginTreeEvalPreemptDrain(): void {
  clearTreeEvalPreemptDrain();
  treeEvalPreemptDrainActive = true;
  treeEvalPreemptDrainTimer = setTimeout(
    () => finishTreeEvalPreemptDrain('timeout'),
    TREE_EVAL_PREEMPT_DRAIN_TIMEOUT_MS,
  );
}

function handleTreeEvalPreemptDrainLine(line: string): boolean {
  if (!treeEvalPreemptDrainActive) return false;



  if (line.trim().split(/\s+/)[0] === 'bestmove' && searchOwnerOutstanding(reviewSearchOwner) === 0) {
    finishTreeEvalPreemptDrain('bestmove');
  }
  return true;
}

function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

function resolveReviewEngineReadyWaiters(ready: boolean): void {
  for (const resolve of reviewEngineReadyWaiters) resolve(ready);
  reviewEngineReadyWaiters.clear();
}

function waitForReviewEngineReady(timeoutMs = 15_000): Promise<boolean> {
  if (reviewEngineReady) return Promise.resolve(true);
  if (reviewEngineFailed) return Promise.resolve(false);
  return new Promise(resolve => {
    const done = (ready: boolean): void => {
      clearTimeout(timer);
      reviewEngineReadyWaiters.delete(done);
      resolve(ready);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    reviewEngineReadyWaiters.add(done);
  });
}

export function isBulkReviewActive(): boolean {
  return isBulkRunning() || reviewSearchActive || activeIndex >= 0;
}

function preemptTreeEvalLease(reason: string): boolean {
  const lease = treeEvalLease;
  if (!lease) return false;
  treeEvalLease = null;
  // Mark every outstanding search stale so the owner FIFO drops their replies; residual
  // tree-eval output without a live lease is handled by the dispatch barrier instead.
  searchOwnerMarkAllStale(reviewSearchOwner);
  beginTreeEvalPreemptDrain();
  reviewProtocol.stop();
  lease.onPreempt(reason);
  return true;
}

export async function acquireTreeEvalLease(options: {
  onMessage: ReviewProtocolMessageHandler;
  onPreempt: (reason: string) => void;
}): Promise<TreeEvalEngineLease | null> {
  if (reviewEngineFailed || isBulkReviewActive() || treeEvalLease || treeEvalPreemptDrainActive) return null;
  if (!reviewEngineReady) {
    if (!reviewEngineInitStarted) void initReviewEngine('/stockfish-web');
    const ready = await waitForReviewEngineReady();
    if (!ready) return null;
  }
  if (reviewEngineFailed || !reviewEngineReady || isBulkReviewActive() || treeEvalLease || treeEvalPreemptDrainActive) return null;
  const token = Symbol('tree-eval-lease');
  treeEvalLease = {
    token,
    onMessage: options.onMessage,
    onPreempt: options.onPreempt,
  };
  const ownsLease = (): boolean => treeEvalLease?.token === token;
  let leaseContext: EnginePositionContext | null = null;
  return {
    setPositionContext(context: EnginePositionContext): void {
      if (!ownsLease()) return;
      leaseContext = context;
      reviewProtocol.setPositionContext(context);
    },
    go(depth: number, multiPv = 1, movetime?: number): void {
      if (!ownsLease()) return;
      // Tree-eval searches share reviewProtocol, so they must register with the search-owner
      // FIFO too — otherwise a residual tree-eval bestmove could be consumed as a review result.
      searchOwnerRegisterGo(reviewSearchOwner, {
        kind: 'tree-eval',
        fen:  leaseContext?.currentFen ?? '',
      });
      reviewProtocol.go(depth, multiPv, movetime);
    },
    stop(): void {
      if (!ownsLease()) return;
      searchOwnerMarkKindStale(reviewSearchOwner, 'tree-eval');
      reviewProtocol.stop();
    },
    release(): void {
      if (!ownsLease()) return;
      searchOwnerMarkKindStale(reviewSearchOwner, 'tree-eval');
      treeEvalLease = null;
    },
  };
}

type ReviewDiagnosticRole = 'leader' | 'observer' | 'unknown';

function reviewDiagnosticRole(): ReviewDiagnosticRole {
  if (isCurrentLeader) return 'leader';
  return leaderElectionStarted ? 'observer' : 'unknown';
}

function safeReviewStableId(value: string, prefix: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function safeReviewGameId(gameId: string): string {
  return safeReviewStableId(gameId, 'game');
}

function safeReviewRunId(runId: string): string {
  return safeReviewStableId(runId, 'run');
}

function recordReviewGameEnqueued(gameId: string, queuePosition: number): void {
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-game-enqueued',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(gameId),
      queuePosition,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewGameStarted(entry: ReviewQueueEntry): void {
  const timestamp = Date.now();
  reviewGameStartedAt.set(entry, timestamp);
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-game-started',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      totalPositions: entry.total,
      engineThreads: reviewProtocolThreads,
      engineHash: REVIEW_ENGINE_HASH_MB,
      timestamp,
    },
    redactionClass: 'safe',
  });
}

function recordReviewGameComplete(entry: ReviewQueueEntry): void {
  const timestamp = Date.now();
  const startedAt = reviewGameStartedAt.get(entry) ?? timestamp;
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-game-complete',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      totalPositions: entry.total,
      totalDurationMs: Math.max(1, Math.round(timestamp - startedAt)),
      timestamp,
    },
    redactionClass: 'safe',
  });
  reviewGameStartedAt.delete(entry);
}

function recordReviewCtrlCacheEvicted(entry: ReviewQueueEntry): void {
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-ctrl-cache-evicted',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function reviewErrorClass(error: unknown): string {
  if (error instanceof Error) return error.name || 'Error';
  if (typeof error === 'string') return 'StringError';
  if (error === null) return 'NullError';
  if (error === undefined) return 'UnknownError';
  return 'NonErrorThrow';
}

function recordReviewGameErrored(entry: ReviewQueueEntry, error: unknown, lastPositionIndex: number, requeued: boolean): void {
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-game-errored',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      errorClass: reviewErrorClass(error),
      lastPositionIndex,
      requeued,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

type ReviewPositionContextMismatchReason =
  | EnginePositionReplayFailureReason
  | 'position-current-fen-mismatch';

function reviewPositionContextMetadata(
  item: ReviewBatchItem,
  replay: EnginePositionReplayResult,
  reason: ReviewPositionContextMismatchReason | null,
): Record<string, unknown> {
  return {
    positionIndex: reviewItemIndex,
    ply: item.nodePly,
    nodePath: item.nodePath,
    parentPath: item.parentPath,
    positionSource: item.position.source,
    positionSurface: item.position.surface,
    moveCount: replay.moveCount,
    replayOk: replay.ok,
    replayReason: reason,
    failedMoveIndex: replay.failedMoveIndex ?? null,
    failedMove: replay.failedMove ?? null,
    itemFenHash: engineFenHash(item.fen),
    positionCurrentFenHash: engineFenHash(item.position.currentFen),
    expectedFenHash: replay.expectedFenHash,
    replayedFenHash: replay.replayedFenHash,
    positionCurrentFenMatchesItemFen: engineFenEquals(item.position.currentFen, item.fen),
    outstandingSearches: searchOwnerOutstanding(reviewSearchOwner),
  };
}

function recordReviewPositionContextMismatch(
  entry: ReviewQueueEntry,
  item: ReviewBatchItem,
  replay: EnginePositionReplayResult,
  reason: ReviewPositionContextMismatchReason,
): void {
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-position-context-mismatch',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      ...reviewPositionContextMetadata(item, replay, reason),
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewWatchdogTriggered(entry: ReviewQueueEntry, timestamp: number): void {
  record({
    kind: 'engine',
    severity: Severity.Warn,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-watchdog-triggered',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      positionIndex: reviewItemIndex,
      elapsedSinceLastBestmoveMs: Math.max(1, Math.round(timestamp - (reviewLastProgressAt ?? timestamp))),
      depth: reviewActiveDepth ?? null,
      movetime: bulkReviewMovetime ?? null,
      timestamp,
    },
    redactionClass: 'safe',
  });
}

function recordReviewWatchdogRecovery(entry: ReviewQueueEntry, timestamp: number, recoveryStartedAt: number): void {
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-watchdog-recovery',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      positionIndex: reviewItemIndex,
      recoveryLatencyMs: Math.max(1, Math.round(timestamp - recoveryStartedAt)),
      timestamp,
    },
    redactionClass: 'safe',
  });
}

function recordReviewWatchdogAbort(entry: ReviewQueueEntry, timestamp: number, abortStartedAt: number): void {
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-watchdog-abort',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      positionIndex: reviewItemIndex,
      totalWatchdogWaitMs: Math.max(1, Math.round(timestamp - abortStartedAt)),
      timestamp,
    },
    redactionClass: 'safe',
  });
}

function recordReviewStaleBestmoveDropped(entry: ReviewQueueEntry, timestamp: number, invalidatedAt: number): void {
  record({
    kind: 'engine',
    severity: Severity.Warn,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-stale-bestmove-dropped',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      positionIndex: reviewItemIndex,
      arrivalDelayMs: Math.max(1, Math.round(timestamp - invalidatedAt)),
      timestamp,
    },
    redactionClass: 'safe',
  });
}

function recordReviewCheckpointFlushed(entry: ReviewQueueEntry, flushStartedAt: number, positionCount: number): void {
  const writeLatencyMs = Math.max(1, Math.round(Date.now() - flushStartedAt));
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-checkpoint-flushed',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      positionsDone: entry.done,
      totalPositions: entry.total,
      positionCount,
      flushDurationMs: writeLatencyMs,
      writeLatencyMs,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewCheckpointFlushFailure(entry: ReviewQueueEntry, error: unknown, positionCount: number): void {
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-checkpoint-flush-failure',
    metadata: {
      role: reviewDiagnosticRole(),
      safeGameId: safeReviewGameId(entry.game.id),
      idbErrorDetail: diagnosticErrorMessage(error),
      positionCount,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewManifestReadFailure(idbErrorDetail: string, recoveryAttempted: boolean): void {
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-manifest-read-failure',
    metadata: {
      role: reviewDiagnosticRole(),
      idbErrorDetail,
      recoveryAttempted,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewManifestWriteFailure(idbErrorDetail: string): void {
  const activeEntry = activeIndex >= 0 ? queue[activeIndex] : null;
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-manifest-write-failure',
    metadata: {
      role: reviewDiagnosticRole(),
      idbErrorDetail,
      queueDepth: queue.length,
      currentGameSafeId: activeEntry ? safeReviewGameId(activeEntry.game.id) : null,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewManifestRecoveryActivated(gameId: string, lastCheckpointPositionIndex: number | null): void {
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-manifest-recovery-activated',
    metadata: {
      role: reviewDiagnosticRole(),
      interruptedGameSafeId: safeReviewGameId(gameId),
      lastCheckpointPositionIndex,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewQueueLifecycleEvent(message: 'review-queue-aborted' | 'review-queue-cleared', severity: Severity): void {
  record({
    kind: 'engine',
    severity,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message,
    metadata: {
      role: reviewDiagnosticRole(),
      queueDepth: queue.length,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function recordReviewEngineInitStart(): number {
  const initStartedAt = Date.now();
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-engine-init-start',
    metadata: {
      role: reviewDiagnosticRole(),
      timestamp: initStartedAt,
      wasmBuild: 'nnue',
      sharedArrayBufferAvailable: isSharedArrayBufferAvailable(),
    },
    redactionClass: 'safe',
  });
  return initStartedAt;
}

function recordReviewEngineInitSuccess(initStartedAt: number): void {
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-engine-init-success',
    metadata: {
      role: reviewDiagnosticRole(),
      threads: REVIEW_ENGINE_THREADS,
      hash: REVIEW_ENGINE_HASH_MB,
      initDurationMs: Math.max(1, Math.round(Date.now() - initStartedAt)),
    },
    redactionClass: 'safe',
  });
}

function reviewEngineInitErrorReason(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Error';
  if (typeof error === 'string') return error || 'Unknown init failure';
  return 'Unknown init failure';
}

function recordReviewEngineInitFailure(initStartedAt: number, error: unknown): void {
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-engine-init-failure',
    metadata: {
      role: reviewDiagnosticRole(),
      errorReason: reviewEngineInitErrorReason(error),
      initDurationMs: Math.max(1, Math.round(Date.now() - initStartedAt)),
    },
    redactionClass: 'safe',
  });
}

// --- Types ---

export interface ReviewQueueEntry {
  game:   ImportedGame;
  // Nulled once `finishEntry` confirms the complete IDB write — see AP-7 (unbounded
  // in-memory caches). A 'complete' entry's full move tree and eval cache are durably
  // saved, so retaining them in memory for the rest of the session is wasted heap on
  // long bulk runs. Lightweight fields below (status/done/total) are kept for the
  // manifest and progress UI, which never touch ctrl/cache.
  ctrl:   AnalyseCtrl | null;
  cache:  Map<string, PositionEval> | null;





  serializedNodes: Record<string, StoredNodeEntry> | null;
  done:   number;
  total:  number;
  status: 'pending' | 'analyzing' | 'complete' | 'error';
  depth:  number;





  feed: 'bulk' | 'one-off';
  minimumDepthUsed?: number;
}

interface ReviewBatchItem {
  nodeId:     string;
  nodePly:    number;
  nodePath:   string;
  parentPath: string;
  fen:        string;
  position:   EnginePositionContext;
}

export interface AcceptedReviewResult {
  gameId:     string;
  nodeId:     string;
  nodePly:    number;
  nodePath:   string;
  parentPath: string;
  fen:        string;
  eval:       PositionEval;
  depth:      number;
}
















const LEADER_STORAGE_KEY      = 'patzer-review-leader';
const LEADER_CHANNEL_NAME     = 'patzer-review-queue';
const LEADER_HEARTBEAT_MS     = 3_000;  // leader refreshes its token this often
const LEADER_STALE_MS         = 9_000;  // 3 missed heartbeats = leader presumed dead
const OBSERVER_POLL_MS        = 4_000;  // observer fallback refresh if broadcasts are missed

const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let isCurrentLeader = false;
let leaderElectionStarted = false;
let leaderHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let observerPollTimer:    ReturnType<typeof setInterval> | null = null;
let leaderChannel: BroadcastChannel | null = null;

interface LeaderToken { tabId: string; heartbeatAt: number }
type ReviewChannelMessage =
  | { type: 'leader-elected'; tabId: string }
  | { type: 'leader-resigned'; tabId: string }
  | { type: 'progress'; tabId: string }
  | { type: 'manifest-changed'; tabId: string }
  | { type: 'wake'; tabId: string }
  | { type: 'pause'; tabId: string }
  | { type: 'resume'; tabId: string }
  | { type: 'cancel'; tabId: string }
  | { type: 'auto-retry'; tabId: string; enabled: boolean }
  | { type: 'unattended-run'; tabId: string; enabled: boolean }
  | { type: 'review-depth'; tabId: string; depth: number }
  | { type: 'append-run-source'; tabId: string; games: ImportedGame[]; depth: number; sourceContext?: ReviewRunSourceContext }
  | { type: 'data-management-fence'; tabId: string; detail: DataManagementLocalChangeDetail }
  | { type: 'move-queue-game'; tabId: string; gameId: string; direction: 'up' | 'down' }
  | { type: 'remove-queue-game'; tabId: string; gameId: string }
  | { type: 'reset-errored'; tabId: string; gameId: string }
  | { type: 'skip-failed'; tabId: string; gameId: string }
  | { type: 'retry-failed'; tabId: string };

function diagnosticErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Error';
  if (typeof error === 'string') return error || 'Unknown error';
  return 'Unknown error';
}

function recordReviewChannelError(message: 'review-channel-send-error' | 'review-channel-receive-error', error: unknown): void {
  record({
    kind: 'engine',
    severity: Severity.Error,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message,
    metadata: {
      role: reviewDiagnosticRole(),
      channelName: LEADER_CHANNEL_NAME,
      errorMessage: diagnosticErrorMessage(error),
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function postReviewChannelMessage(message: ReviewChannelMessage): void {
  try {
    leaderChannel?.postMessage(message);
  } catch (error) {
    recordReviewChannelError('review-channel-send-error', error);
  }
}

function readLeaderToken(): LeaderToken | null {
  try {
    const raw = localStorage.getItem(LEADER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeaderToken;
    if (typeof parsed.tabId !== 'string' || typeof parsed.heartbeatAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLeaderToken(): void {
  try {
    localStorage.setItem(LEADER_STORAGE_KEY, JSON.stringify({ tabId, heartbeatAt: Date.now() } satisfies LeaderToken));
  } catch {
    // localStorage unavailable (private mode quota, etc.) — leadership still
    // works via BroadcastChannel alone for tabs open right now.
  }
}

function clearLeaderTokenIfOwn(): void {
  try {
    const token = readLeaderToken();
    if (token && token.tabId === tabId) localStorage.removeItem(LEADER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** True when this tab is the elected leader and should drive the queue/engine. */
export function isLeaderTab(): boolean {
  return isCurrentLeader;
}

function isReviewOwnerUnavailableFromToken(): boolean {
  if (isCurrentLeader) return false;
  const token = readLeaderToken();
  if (!token) return true;
  const timestamp = Date.now();
  const heartbeatAgeMs = timestamp - token.heartbeatAt;
  if (heartbeatAgeMs <= LEADER_STALE_MS) return false;
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-stale-leader-detected',
    metadata: {
      role: reviewDiagnosticRole(),
      tabId,
      heartbeatAgeMs,
      timestamp,
    },
    redactionClass: 'safe',
  });
  return true;
}

export function isReviewOwnerUnavailableForTakeover(): boolean {
  if (isCurrentLeader || queue.length === 0) return false;
  return isReviewOwnerUnavailableFromToken();
}

export function takeOverUnavailableReviewOwner(): void {
  if (!isReviewOwnerUnavailableForTakeover()) return;
  becomeLeader(true);
}

function becomeLeader(
  resumeAfterTakeover = false,
  opts: { resumeManifestAfterTakeover?: boolean } = {},
): void {
  if (isCurrentLeader) return;
  isCurrentLeader = true;
  writeLeaderToken();
  if (leaderHeartbeatTimer === null) {
    leaderHeartbeatTimer = setInterval(writeLeaderToken, LEADER_HEARTBEAT_MS);
  }
  if (observerPollTimer !== null) {
    clearInterval(observerPollTimer);
    observerPollTimer = null;
  }
  postReviewChannelMessage({ type: 'leader-elected', tabId });
  console.log('[review-queue] this tab is now the leader:', tabId);

  const leaderTimestamp = Date.now();
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-tab-became-leader',
    metadata: {
      role: reviewDiagnosticRole(),
      tabId,
      timestamp: leaderTimestamp,
    },
    redactionClass: 'safe',
  });

  // Instrument leader acquisition. When resumeAfterTakeover is true, this tab
  // was previously an observer and is now promoting itself after detecting a
  // stale leader token — log observer-promotion in addition to leader-acquired
  // so multi-tab races can be distinguished in diagnostics.
  const leaderSessionId = getSessionId();
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'engine.reviewQueue',
    sourceTag: 'review-queue',
    message: 'leader-acquired',
    metadata: {
      role: reviewDiagnosticRole(),
      eventType: 'leader-acquired',
      sessionId: leaderSessionId,
    },
    redactionClass: 'safe',
  });
  if (resumeAfterTakeover) {
    record({
      kind: 'engine',
      severity: Severity.Info,
      source: 'review-engine',
      sourceTag: 'review-engine',
      message: 'review-leadership-transferred',
      metadata: {
        role: reviewDiagnosticRole(),
        newLeaderTabId: tabId,
        timestamp: Date.now(),
      },
      redactionClass: 'safe',
    });
    record({
      kind: 'engine',
      severity: Severity.Info,
      source: 'engine.reviewQueue',
      sourceTag: 'review-queue',
      message: 'observer-promotion',
      metadata: {
        role: reviewDiagnosticRole(),
        eventType: 'observer-promotion',
        sessionId: leaderSessionId,
      },
      redactionClass: 'safe',
    });
  }

  // Pick up any work left pending by a previous leader (mid-session failover
  // takeover). Skipped at app-bootstrap time (before the library has loaded
  // — see initLeaderElection/`_libraryGames`); the bootstrap caller's own
  // `resumeReviewQueueFromManifest(stored.games)` call handles that case
  // once the real game list is known.
  if (opts.resumeManifestAfterTakeover !== false && _libraryGames.length > 0) {
    void takeOverAsLeader(resumeAfterTakeover);
  }
}

function resignLeadership(): void {
  if (!isCurrentLeader) return;
  isCurrentLeader = false;
  if (leaderHeartbeatTimer !== null) {
    clearInterval(leaderHeartbeatTimer);
    leaderHeartbeatTimer = null;
  }
  clearLeaderTokenIfOwn();
  postReviewChannelMessage({ type: 'leader-resigned', tabId });

  // Instrument leader loss (tab closing, pagehide, or explicit release).
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'engine.reviewQueue',
    sourceTag: 'review-queue',
    message: 'leader-lost',
    metadata: {
      role: reviewDiagnosticRole(),
      eventType: 'leader-lost',
      sessionId: getSessionId(),
    },
    redactionClass: 'safe',
  });

  startObserverPolling();
}

/** Claim leadership only for an empty local tab; persisted work needs explicit takeover. */
function tryClaimLeadership(): void {
  if (isCurrentLeader) return;
  const token = readLeaderToken();
  if (!token && queue.length === 0) becomeLeader();
}

function startObserverPolling(): void {
  if (observerPollTimer !== null) return;
  observerPollTimer = setInterval(() => {
    tryClaimLeadership();
    if (!isCurrentLeader) {
      void refreshObserverQueue();
    }
  }, OBSERVER_POLL_MS);
}

/** Rebuild the local read-only queue mirror from the manifest (observer tabs only). */
async function refreshObserverQueue(): Promise<void> {
  if (isCurrentLeader) return;
  await mirrorQueueFromManifest();
  notifyReviewQueueStateChanged();
}

/**
 * Initialize cross-tab coordination. Safe to call multiple times; only the
 * first call wires listeners. Must run before any enqueue/resume call so the
 * very first tab claims leadership immediately instead of waiting a poll tick.
 */
function initLeaderElection(): void {
  if (typeof window === 'undefined') {
    // No browser globals (tests, SSR) — act as leader unconditionally so
    // existing single-tab behavior is unaffected.
    leaderElectionStarted = true;
    isCurrentLeader = true;
    return;
  }

  leaderElectionStarted = true;

  if (typeof BroadcastChannel !== 'undefined') {
    leaderChannel = new BroadcastChannel(LEADER_CHANNEL_NAME);
    leaderChannel.onmessage = (ev: MessageEvent) => {
      try {
        const msg = ev.data as {
          type?: string;
          tabId?: string;
          gameId?: string;
          games?: ImportedGame[];
          enabled?: boolean;
          depth?: number;
          sourceContext?: ReviewRunSourceContext;
          detail?: DataManagementLocalChangeDetail;
          direction?: 'up' | 'down';
        } | null;
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
          recordReviewChannelError('review-channel-receive-error', new Error('Malformed BroadcastChannel message'));
          return;
        }
        if (msg.type === 'leader-resigned' || msg.type === 'leader-elected') {
          if (msg.tabId !== tabId) {
            // Another tab took over (or stepped down). Observer tabs only refresh
            // their mirror here; persisted work takeover is manual.
            if (!isCurrentLeader) void refreshObserverQueue();
          }
        } else if (msg.type === 'progress' || msg.type === 'manifest-changed') {
          if (!isCurrentLeader) void refreshObserverQueue();
        } else if (msg.type === 'wake') {
          // An observer tab enqueued work — if we're the leader, make sure the
          // queue is advancing; harmless no-op otherwise.
          if (isCurrentLeader) advanceQueue();
        } else if (msg.type === 'pause' && isCurrentLeader) {
          pauseBulkReview();
        } else if (msg.type === 'resume' && isCurrentLeader) {
          resumeBulkReview();
        } else if (msg.type === 'cancel' && isCurrentLeader) {
          cancelBulkReview();
        } else if (msg.type === 'auto-retry' && isCurrentLeader && typeof msg.enabled === 'boolean') {
          setReviewAutoRetryEnabled(msg.enabled);
        } else if (msg.type === 'unattended-run' && isCurrentLeader && typeof msg.enabled === 'boolean') {
          setReviewUnattendedRunEnabled(msg.enabled);
        } else if (msg.type === 'review-depth' && isCurrentLeader && typeof msg.depth === 'number') {
          syncBulkReviewDepthSetting(msg.depth);
          applyReviewDepthToActiveQueue(msg.depth, { source: 'channel' });
        } else if (
          msg.type === 'append-run-source'
          && isCurrentLeader
          && Array.isArray(msg.games)
          && typeof msg.depth === 'number'
        ) {
          appendBulkReviewRunSourceAsLeader(msg.games, msg.depth, msg.sourceContext);
        } else if (msg.type === 'data-management-fence' && isCurrentLeader && msg.detail) {
          void fenceReviewQueueForDataManagement(msg.detail);
        } else if (
          msg.type === 'move-queue-game'
          && isCurrentLeader
          && msg.gameId
          && (msg.direction === 'up' || msg.direction === 'down')
        ) {
          moveReviewQueueGame(msg.gameId, msg.direction);
        } else if (msg.type === 'remove-queue-game' && isCurrentLeader && msg.gameId) {
          removeReviewQueueGame(msg.gameId);
        } else if (msg.type === 'reset-errored' && isCurrentLeader && msg.gameId) {
          resetErroredGame(msg.gameId);
        } else if (msg.type === 'skip-failed' && isCurrentLeader && msg.gameId) {
          skipFailedReviewGame(msg.gameId);
        } else if (msg.type === 'retry-failed' && isCurrentLeader) {
          retryReviewRunFailedGames();
        }
      } catch (error) {
        recordReviewChannelError('review-channel-receive-error', error);
      }
    };
    leaderChannel.onmessageerror = (ev: MessageEvent) => {
      recordReviewChannelError('review-channel-receive-error', ev.data ?? new Error('BroadcastChannel messageerror'));
    };
  }

  // Hidden tabs explicitly suspend/checkpoint queue work. `pagehide` still
  // resigns leadership for unload/reload, but ordinary backgrounding keeps the
  // same owner so it can resume when visible again.
  document.addEventListener('visibilitychange', () => {
    if (activeReviewRun && reviewRunProgressState(activeReviewRun) !== 'complete') {
      recordReviewRunProgressVisibilityDiagnostic(activeReviewRun, 'visibility-change');
    }
    if (document.visibilityState === 'hidden' && isCurrentLeader) {
      if (isReviewUnattendedRunEnabled()) {
        flushReviewCheckpoint();
        syncReviewUnattendedWakeLock();
      } else {
        suspendBulkReviewForHiddenTab();
      }
    } else if (document.visibilityState === 'visible') {
      syncReviewUnattendedWakeLock();
      resumeHiddenSuspendedReviewInThisTab();
      resumeUnattendedReviewInThisTab();
    }
  });
  window.addEventListener('pagehide', () => {
    releaseReviewUnattendedWakeLock();
    if (isCurrentLeader) resignLeadership();
  });

  tryClaimLeadership();
  if (!isCurrentLeader) {
    const leaderToken = readLeaderToken();
    record({
      kind: 'engine',
      severity: Severity.Info,
      source: 'review-engine',
      sourceTag: 'review-engine',
      message: 'review-tab-became-observer',
      metadata: {
        role: reviewDiagnosticRole(),
        tabId,
        leaderTabId: leaderToken?.tabId ?? null,
        timestamp: Date.now(),
      },
      redactionClass: 'safe',
    });
    startObserverPolling();
  }
}

/**
 * Leader takeover entry point: rebuilds the queue from the manifest exactly
 * like startup resume (T06), so a tab that wins leadership mid-run (failover)
 * picks up in-progress games from where the manifest/analysis-library left
 * off rather than restarting them. No-op if there is nothing to resume.
 */
async function takeOverAsLeader(resumeAfterTakeover = false): Promise<void> {
  if (!isCurrentLeader) return;
  if (queue.length > 0) {
    // This tab already has live queue state (e.g. it enqueued games itself
    // before winning an election) — just make sure it's progressing.
    if (activeIndex < 0 && !reviewEngineFailed) advanceQueue();
    return;
  }
  await resumeReviewQueueFromManifest(_libraryGames);
  if (resumeAfterTakeover && queuePaused && queuePauseReason === 'reload') {
    resumeBulkReview();
  }
}

/** Rebuild a read-only mirror of `queue` from the manifest, for observer-tab display only. */
async function mirrorQueueFromManifest(): Promise<void> {
  const loadedRun = await loadLatestReviewRunManifest();
  if (loadedRun) activeReviewRun = normalizeReviewRunManifest(loadedRun);
  const { entries: manifest, errorDetail } = await loadReviewQueueManifestWithDiagnostics();
  if (errorDetail) recordReviewManifestReadFailure(errorDetail, false);
  queue = sortByActiveBatchOrder(manifest, record => record.gameId).map(record => {
    const game = _libraryGames.find(g => g.id === record.gameId);
    // Fallback placeholder when the library snapshot hasn't caught up yet —
    // display-only fields (done/total/status) below never depend on `pgn`.
    return {
      game: game ?? { id: record.gameId, pgn: '' },
      ctrl: null,
      cache: null,
      serializedNodes: null,
      done:   record.done,
      total:  record.total,
      status: record.status,
      depth:  record.depth,


      feed: 'bulk',
      ...(record.minimumDepthUsed !== undefined ? { minimumDepthUsed: record.minimumDepthUsed } : {}),
    };
  });
  activeIndex = queue.findIndex(e => e.status === 'analyzing');
}

// Library snapshot used by observer-mode manifest mirroring and by leader
// takeover resume — kept current via `setLibraryGamesForReviewQueue` so
// observer tabs (which never receive `resumeReviewQueueFromManifest`'s
// `games` argument directly) can still resolve game metadata for display.
let _libraryGames: ImportedGame[] = [];
let reviewRunLibrarySnapshotProvider: (() => readonly ImportedGame[]) | null = null;

/** Keep the observer-mode game lookup current. Call whenever the library list changes. */
export function setLibraryGamesForReviewQueue(games: readonly ImportedGame[]): void {
  _libraryGames = [...games];
}

/**
 * Supplies the current imported-game library for the 10-game hygiene boundary.
 * The queue owns membership through `manifest.sourceGameIds`; this provider only
 * refreshes lookup metadata for ids already fixed into the run.
 */
export function setReviewRunLibrarySnapshotProvider(provider: () => readonly ImportedGame[]): void {
  reviewRunLibrarySnapshotProvider = provider;
}

function refreshReviewRunLibrarySnapshot(): readonly ImportedGame[] {
  const snapshot = reviewRunLibrarySnapshotProvider ? reviewRunLibrarySnapshotProvider() : _libraryGames;
  setLibraryGamesForReviewQueue(snapshot);
  return _libraryGames;
}









function enqueueObserverManifestOnly(games: ImportedGame[], depth: number): void {
  let added = false;
  let observerAddedCount = 0;
  for (const game of games) {
    if (_analyzedGameIds.has(game.id)) continue;
    if (queue.some(e => e.game.id === game.id && e.status !== 'error')) continue;
    const queuePosition = queue.length + observerAddedCount;
    observerAddedCount++;
    added = true;
    void saveReviewQueueManifest({
      gameId: game.id,
      status: 'pending',
      depth,
      done:   0,
      total:  estimatePlyCountFromPgn(game.pgn),
    }).then(saved => {
      if (!saved) {
        recordReviewManifestWriteFailure('saveReviewQueueManifest returned false');
        markReviewStorageWriteFailed('manifest-write-failed');
      }
    });
    recordReviewGameEnqueued(game.id, queuePosition);
  }
  if (added) postReviewChannelMessage({ type: 'manifest-changed', tabId });
  postReviewChannelMessage({ type: 'wake', tabId });
}

// --- Queue state ---

let queue:      ReviewQueueEntry[] = [];
let activeIndex = -1;
let queuePaused = false;
export type ReviewPauseReason = 'user' | 'hidden' | 'reload' | 'breaker';
let queuePauseReason: ReviewPauseReason | null = null;
let hiddenSuspendedOwnerTabId: string | null = null;
let activeReviewRun: ReviewRunManifest | null = null;
let reviewRunHygieneRunId: string | null = null;
let reviewRunHygienePositionsSinceBoundary = 0;
let reviewRunHygienePreviousBoundaryAt: number | null = null;
let reviewRunVisibilitySampleRunId: string | null = null;
let reviewRunVisibilitySampleAnchor: ReviewRunProgressSampleAnchor | null = null;
let reviewRunVisibilityCompletedPositions = 0;

const REVIEW_UNATTENDED_RUN_KEY = 'patzer.review.unattendedRun';

export type ReviewPauseNoticeReason =
  | 'user-paused'
  | 'hidden-suspended'
  | 'browser-stalled'
  | 'circuit-breaker'
  | 'engine-init-failure'
  | 'interrupted-after-reload';

export interface ReviewPauseNotice {
  reason: ReviewPauseNoticeReason;
  message: string;
  active: boolean;
  recordedAt: number;
}

let currentReviewPauseNotice: ReviewPauseNotice | null = null;
let lastReviewPauseNotice: ReviewPauseNotice | null = null;

function activeQueueEntry(): ReviewQueueEntry | undefined {
  return activeIndex >= 0 ? queue[activeIndex] : queue.find(entry => entry.status === 'analyzing');
}

function reviewQueueEntryLabel(entry: ReviewQueueEntry): string {
  return `${entry.game.white ?? 'White'} vs ${entry.game.black ?? 'Black'}`;
}

function isReviewQueueEntryActionable(entry: ReviewQueueEntry): boolean {
  return entry.status === 'pending' || entry.status === 'error';
}

function findVisibleQueueTargetIndex(index: number, direction: 'up' | 'down'): number {
  const step = direction === 'up' ? -1 : 1;
  for (let target = index + step; target >= 0 && target < queue.length; target += step) {
    if (queue[target]!.status !== 'complete') return target;
  }
  return -1;
}

function canMoveReviewQueueEntry(entry: ReviewQueueEntry, direction: 'up' | 'down'): boolean {
  if (!isReviewQueueEntryActionable(entry)) return false;
  const index = queue.indexOf(entry);
  if (index < 0) return false;
  const targetIndex = findVisibleQueueTargetIndex(index, direction);
  if (targetIndex < 0) return false;
  const active = activeQueueEntry();
  return entry !== active && queue[targetIndex] !== active && queue[targetIndex]?.status !== 'analyzing';
}

function sortByActiveBatchOrder<T>(items: readonly T[], getGameId: (item: T) => string): T[] {
  const activeBatchIds = activeReviewRun?.activeBatchIds ?? [];
  if (activeBatchIds.length === 0) return [...items];
  const orderByGameId = new Map(activeBatchIds.map((gameId, index) => [gameId, index]));
  return items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      order: orderByGameId.get(getGameId(item)) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order || a.originalIndex - b.originalIndex)
    .map(({ item }) => item);
}

type ReviewWakeLockSentinel = {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type ReviewWakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<ReviewWakeLockSentinel>;
  };
};

let reviewUnattendedWakeLock: ReviewWakeLockSentinel | null = null;

function readPersistedReviewUnattendedRunEnabled(): boolean {
  try {
    return localStorage.getItem(REVIEW_UNATTENDED_RUN_KEY) !== 'false';
  } catch {
    return true;
  }
}

function persistReviewUnattendedRunEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(REVIEW_UNATTENDED_RUN_KEY, enabled ? 'true' : 'false');
  } catch {
    // Preference persistence failure must not stop the review queue.
  }
}

function markReviewPauseNotice(reason: ReviewPauseNoticeReason, message: string): void {
  const notice: ReviewPauseNotice = {
    reason,
    message,
    active: true,
    recordedAt: Date.now(),
  };
  currentReviewPauseNotice = notice;
  lastReviewPauseNotice = notice;
}

function clearActiveReviewPauseNoticeAfterProgress(): void {
  if (!currentReviewPauseNotice) return;
  currentReviewPauseNotice = {
    ...currentReviewPauseNotice,
    active: false,
  };
  lastReviewPauseNotice = currentReviewPauseNotice;
}

export function isReviewAutoRetryEnabled(): boolean {
  return activeReviewRun?.autoRetryEnabled === true;
}

export function isReviewUnattendedRunEnabled(): boolean {
  return activeReviewRun?.unattendedRunEnabled ?? readPersistedReviewUnattendedRunEnabled();
}

function canHoldReviewUnattendedWakeLock(): boolean {
  if (!isCurrentLeader || !isReviewUnattendedRunEnabled()) return false;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  return !queuePaused && (isBulkRunning() || hasRetryableFailedGame());
}

function releaseReviewUnattendedWakeLock(): void {
  const lock = reviewUnattendedWakeLock;
  if (!lock) return;
  reviewUnattendedWakeLock = null;
  void lock.release().catch(() => {
    // Wake lock is a best-effort browser affordance; denial/release races are not queue failures.
  });
}

function syncReviewUnattendedWakeLock(): void {
  if (!canHoldReviewUnattendedWakeLock()) {
    releaseReviewUnattendedWakeLock();
    return;
  }
  if (reviewUnattendedWakeLock) return;
  if (typeof navigator === 'undefined') return;
  const wakeLock = (navigator as ReviewWakeLockNavigator).wakeLock;
  if (!wakeLock) return;
  void wakeLock.request('screen').then(lock => {
    reviewUnattendedWakeLock = lock;
    lock.addEventListener?.('release', () => {
      if (reviewUnattendedWakeLock === lock) reviewUnattendedWakeLock = null;
    });
  }).catch(() => {
    // Unsupported, denied, or not visible: keep the review queue running without wake lock.
  });
}

export function setReviewUnattendedRunEnabled(enabled: boolean): void {
  persistReviewUnattendedRunEnabled(enabled);
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'unattended-run', tabId, enabled });
    notifyReviewQueueStateChanged();
    return;
  }
  if (activeReviewRun) {
    activeReviewRun = withReviewRunUnattendedRunEnabled(activeReviewRun, enabled);
    persistActiveReviewRun();
  }
  if (!enabled) {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') suspendBulkReviewForHiddenTab();
    else syncReviewUnattendedWakeLock();
  } else {
    resumeUnattendedReviewInThisTab();
    syncReviewUnattendedWakeLock();
  }
  notifyReviewQueueStateChanged();
  postReviewChannelMessage({ type: 'manifest-changed', tabId });
}

export function setReviewAutoRetryEnabled(enabled: boolean): void {
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'auto-retry', tabId, enabled });
    return;
  }
  if (!activeReviewRun) return;
  activeReviewRun = withReviewRunAutoRetryEnabled(activeReviewRun, enabled);
  persistActiveReviewRun();
  if (enabled) resumeUnattendedReviewInThisTab();
  else syncReviewUnattendedWakeLock();
  notifyReviewQueueStateChanged();
  postReviewChannelMessage({ type: 'manifest-changed', tabId });
}

export interface ReviewCrashContext {
  safeGameId: string | null;
  positionIndex: number | null;
  positionsDone: number;
  totalPositions: number;
  role: ReviewDiagnosticRole;
  watchdogActive: boolean;
  watchdogTriggered: boolean;
  watchdogLastTriggerTimestamp: number | null;
  lastCheckpointTimestamp: number | null;
}

export function isReviewQueueEntryAnalyzing(): boolean {
  try {
    return queue.some(entry => entry.status === 'analyzing');
  } catch {
    return false;
  }
}

export function getReviewCrashContext(): ReviewCrashContext | null {
  try {
    const entry = activeIndex >= 0 ? queue[activeIndex] : queue.find(candidate => candidate.status === 'analyzing');
    if (!entry || entry.status !== 'analyzing') return null;
    return {
      safeGameId: safeReviewGameId(entry.game.id),
      positionIndex: reviewItemIndex >= 0 ? reviewItemIndex : null,
      positionsDone: entry.done,
      totalPositions: entry.total,
      role: reviewDiagnosticRole(),
      watchdogActive: reviewWatchdogTimer !== undefined || reviewWatchdogAbsoluteTimer !== undefined,
      watchdogTriggered: reviewWatchdogTriggeredAt !== null,
      watchdogLastTriggerTimestamp: reviewWatchdogLastTriggerAt,
      lastCheckpointTimestamp: checkpointLastFlushAt > 0 ? checkpointLastFlushAt : null,
    };
  } catch {
    return null;
  }
}

function publishReviewQueueAnalysisSignal(): void {
  try {
    if (typeof window === 'undefined') return;
    const target = window as Window & {
      __patzerReviewQueueEntryAnalyzing?: () => boolean;
      __patzerReviewCrashContext?: () => ReviewCrashContext | null;
    };
    target.__patzerReviewQueueEntryAnalyzing = isReviewQueueEntryAnalyzing;
    target.__patzerReviewCrashContext = getReviewCrashContext;
  } catch {
    // Diagnostics correlation must never affect queue behavior.
  }
}

publishReviewQueueAnalysisSignal();

function persistActiveReviewRun(): void {
  if (activeReviewRun) {
    void saveReviewRunManifest(activeReviewRun).then(saved => {
      if (!saved) markReviewStorageWriteFailed('run-manifest-write-failed');
    });
  }
}

function setActiveReviewRunState(lifecycleState: ReviewRunLifecycleState): void {
  if (!activeReviewRun) return;
  activeReviewRun.lifecycleState = lifecycleState;
  activeReviewRun.updatedAt = Date.now();
  persistActiveReviewRun();
}









function storedAnalysisMatchesReviewDepth(
  stored: Awaited<ReturnType<typeof loadAnalysisFromIdb>> | undefined,
  depth: number,
): boolean {
  return storedAnalysisSatisfiesAskingDepth(stored, depth);
}

function reviewRunSourceContextForOrderedGames(
  games: readonly ImportedGame[],
  sourceContext?: ReviewRunSourceContext,
): ReviewRunSourceContext {
  const enqueuedGameIds = games.map(game => game.id);
  return {
    sourceMode:         sourceContext?.sourceMode ?? 'selected-games',
    sourceGameIds:      sourceContext?.sourceGameIds ?? enqueuedGameIds,
    timeControlContext: sourceContext?.timeControlContext ?? timeControlContextForGames(games),
    ...(sourceContext?.orderingContext ? { orderingContext: sourceContext.orderingContext } : {}),
    activeBatchIds:     sourceContext?.activeBatchIds ?? enqueuedGameIds,
  };
}

function createActiveReviewRun(
  games: readonly ImportedGame[],
  depth: number,
  sourceContext?: ReviewRunSourceContext,
): boolean {
  const runContext = reviewRunSourceContextForOrderedGames(games, sourceContext);
  const activeBatchIds = runContext.activeBatchIds ?? games.map(game => game.id);
  const sourceGameIds = runContext.sourceGameIds;
  if (sourceGameIds.length === 0 || activeBatchIds.length === 0) return false;
  activeReviewRun = createReviewRunManifest({
    sourceMode:         runContext.sourceMode,
    sourceGameIds,
    reviewDepth:        depth,
    unattendedRunEnabled: readPersistedReviewUnattendedRunEnabled(),
    activeBatchIds,
    ...(runContext.timeControlContext ? { timeControlContext: runContext.timeControlContext } : {}),
    ...(runContext.orderingContext ? { orderingContext: runContext.orderingContext } : {}),
  });
  persistActiveReviewRun();
  return true;
}

function mergeActiveReviewRunLiveEntries(
  games: readonly ImportedGame[],
  depth: number,
  sourceContext?: ReviewRunSourceContext,
): void {
  const runContext = reviewRunSourceContextForOrderedGames(games, sourceContext);
  const activeBatchIds = runContext.activeBatchIds ?? games.map(game => game.id);
  if (runContext.sourceGameIds.length === 0 || activeBatchIds.length === 0) return;
  if (!activeReviewRun) {
    createActiveReviewRun(games, depth, runContext);
    return;
  }
  activeReviewRun = withReviewRunSourceContextAppended(activeReviewRun, runContext);
  const sourceIds = new Set(activeReviewRun.sourceGameIds);
  const batchIds = new Set(activeReviewRun.activeBatchIds);
  for (const gameId of activeBatchIds) batchIds.add(gameId);
  activeReviewRun.sourceGameIds = [...sourceIds];
  activeReviewRun.activeBatchIds = [...batchIds];
  activeReviewRun.reviewDepth = depth;
  activeReviewRun.unattendedRunEnabled = readPersistedReviewUnattendedRunEnabled();
  activeReviewRun.lifecycleState = 'running';
  activeReviewRun.updatedAt = Date.now();
  persistActiveReviewRun();
}

function activeReviewRunCanAcceptSourceAppend(): boolean {
  return !!activeReviewRun && reviewRunProgressState(activeReviewRun) !== 'complete';
}

function appendActiveReviewRunSourceOnly(
  games: readonly ImportedGame[],
  sourceContext?: ReviewRunSourceContext,
): void {
  if (!activeReviewRun) return;
  const runContext = reviewRunSourceContextForOrderedGames(games, sourceContext);
  if (runContext.sourceGameIds.length === 0) return;
  activeReviewRun = withReviewRunSourceContextAppended(activeReviewRun, runContext);
  activeReviewRun.unattendedRunEnabled = readPersistedReviewUnattendedRunEnabled();
  persistActiveReviewRun();
  markReviewQueueProgress();
  notifyReviewQueueStateChanged();
  postReviewChannelMessage({ type: 'manifest-changed', tabId });
}

function ensureActiveReviewRun(games: readonly ImportedGame[], depth: number, sourceContext?: ReviewRunSourceContext): void {
  mergeActiveReviewRunLiveEntries(games, depth, sourceContext);
}

function markActiveReviewRunGameComplete(gameId: string): void {
  if (!activeReviewRun) return;
  activeReviewRun = withReviewRunGameComplete(activeReviewRun, gameId);
  clearActiveReviewPauseNoticeAfterProgress();
  persistActiveReviewRun();
}

function markActiveReviewRunGameFailed(gameId: string, attempts: number, lastFailedAt: number): void {
  if (!activeReviewRun) return;
  activeReviewRun = withReviewRunGameFailed(activeReviewRun, gameId, attempts, lastFailedAt);
  markReviewQueueProgress();
  persistActiveReviewRun();
}











/** Halt the queue the same way a user Pause does, but tagged as a breaker pause. */
function haltReviewQueueForBreaker(): void {
  clearFailedGameRetryTimer();
  queuePaused = true;
  queuePauseReason = 'breaker';
  hiddenSuspendedOwnerTabId = null;
  syncReviewUnattendedWakeLock();
}

/**
 * Bump the consecutive-failure counter for one game-failure event and trip the breaker
 * if it crosses the threshold. Must be called AFTER `scheduleFailedGameRetry` has already
 * recorded the durable failed-attempt entry for this game (so the failed id still shows
 * up in the end-of-run summary even when this call trips the breaker and cancels the
 * retry timer that call just armed).
 */
function recordReviewRunGameFailureForBreaker(): void {
  if (!activeReviewRun) return;
  activeReviewRun = withReviewRunGameFailureRecorded(activeReviewRun);
  if (reviewRunCircuitBreakerShouldTrip(activeReviewRun)) {
    activeReviewRun = withReviewRunBreakerTripped(activeReviewRun, 'consecutive-failures');
    markReviewPauseNotice('circuit-breaker', 'The run paused after 3 consecutive game failures.');
    haltReviewQueueForBreaker();
  }
  persistActiveReviewRun();
  notifyReviewQueueStateChanged();
}

/** Trip the breaker immediately on any review-engine init failure, bypassing the counter. */
function tripReviewRunBreakerForEngineInit(): void {
  if (activeReviewRun) {
    activeReviewRun = withReviewRunBreakerTripped(activeReviewRun, 'engine-init-failure');
    markReviewPauseNotice('engine-init-failure', 'The background engine failed to initialize.');
    persistActiveReviewRun();
  }
  haltReviewQueueForBreaker();
  notifyReviewQueueStateChanged();
}

function markActiveReviewRunGameSkipped(gameId: string): void {
  if (!activeReviewRun) return;
  activeReviewRun = withReviewRunGameSkipped(activeReviewRun, gameId);
  markReviewQueueProgress();
  persistActiveReviewRun();
}

function markActiveReviewRunGameSkippedFromActiveBatch(gameId: string): void {
  if (!activeReviewRun) return;
  activeReviewRun = withReviewRunGameSkippedFromActiveBatch(activeReviewRun, gameId);
  markReviewQueueProgress();
  persistActiveReviewRun();
}

export type ReviewStorageHealth = 'ok' | 'manifest-write-failed' | 'checkpoint-write-failed' | 'run-manifest-write-failed';
let reviewStorageHealth: ReviewStorageHealth = 'ok';

const FAILED_GAME_RETRY_BASE_MS = 2_000;
const FAILED_GAME_RETRY_MAX_MS  = 30_000;
const REVIEW_STALE_PROGRESS_MS  = 90_000;

interface FailedGameState {
  gameId:     string;
  depth:      number;
  attempts:   number;
  retrying:   boolean;
  skipped:    boolean;
  lastFailedAt: number;
  skippedAt?: number;
}

export interface FailedReviewStatus {
  gameId:       string;
  depth:        number;
  attempts:     number;
  retrying:     boolean;
  skipped:      boolean;
  lastFailedAt: number;
}

let failedGameAttempts: Map<string, FailedGameState> = new Map();
let failedGameRetryTimer: ReturnType<typeof setTimeout> | null = null;
let failedGameRetryEntry: ReviewQueueEntry | null = null;

function failedGameKey(gameId: string, depth: number): string {
  return `${gameId}::${depth}`;
}

function getFailedGameState(gameId: string, depth: number): FailedGameState | undefined {
  return failedGameAttempts.get(failedGameKey(gameId, depth));
}

function toFailedReviewStatus(state: FailedGameState): FailedReviewStatus {
  return {
    gameId:       state.gameId,
    depth:        state.depth,
    attempts:     state.attempts,
    retrying:     state.retrying,
    skipped:      state.skipped,
    lastFailedAt: state.lastFailedAt,
  };
}

function clearFailedGameRetryTimer(): void {
  if (failedGameRetryTimer !== null) {
    clearTimeout(failedGameRetryTimer);
    failedGameRetryTimer = null;
  }
  failedGameRetryEntry = null;
  for (const state of failedGameAttempts.values()) state.retrying = false;
}

function hasRetryableFailedGame(): boolean {
  return queue.some(entry => {
    const state = getFailedGameState(entry.game.id, entry.depth);
    return entry.status === 'error' && state !== undefined && !state.skipped;
  });
}

function scheduleNextRetryableFailedGame(): boolean {
  const entry = queue.find(candidate => {
    const state = getFailedGameState(candidate.game.id, candidate.depth);
    return candidate.status === 'error' && state !== undefined && !state.skipped;
  });
  if (!entry) return false;
  scheduleFailedGameRetry(entry);
  return true;
}

function scheduleFailedGameRetry(entry: ReviewQueueEntry, opts: { incrementAttempts?: boolean } = {}): void {
  if (queuePaused || !isCurrentLeader || reviewEngineFailed) return;

  clearFailedGameRetryTimer();
  const key = failedGameKey(entry.game.id, entry.depth);
  const existing = failedGameAttempts.get(key);
  const attempts = opts.incrementAttempts === false
    ? Math.max(1, existing?.attempts ?? 1)
    : (existing?.attempts ?? 0) + 1;
  const state: FailedGameState = {
    gameId:       entry.game.id,
    depth:        entry.depth,
    attempts,
    retrying:     true,
    skipped:      false,
    lastFailedAt: Date.now(),
  };
  failedGameAttempts.set(key, state);
  markActiveReviewRunGameFailed(entry.game.id, attempts, state.lastFailedAt);
  void saveReviewFailureRecord({
    key,
    gameId:       entry.game.id,
    depth:        entry.depth,
    attempts,
    lastFailedAt: state.lastFailedAt,
    skipped:      false,
  });

  const delay = Math.min(FAILED_GAME_RETRY_MAX_MS, FAILED_GAME_RETRY_BASE_MS * Math.max(1, attempts));
  failedGameRetryEntry = entry;
  failedGameRetryTimer = setTimeout(() => {
    failedGameRetryTimer = null;
    failedGameRetryEntry = null;
    state.retrying = false;
    if (queuePaused || reviewEngineFailed || !queue.includes(entry) || entry.status !== 'error') return;
    entry.status = 'pending';
    entry.done = entry.cache?.size ?? entry.done;
    persistManifestEntry(entry);
    activeIndex = -1;
    syncReviewUnattendedWakeLock();
    notifyReviewQueueStateChanged();
    advanceQueue();
  }, delay);
  syncReviewUnattendedWakeLock();
  notifyReviewQueueStateChanged();
}

function clearFailedGameState(gameId: string, depth: number): void {
  const key = failedGameKey(gameId, depth);
  failedGameAttempts.delete(key);
  void deleteReviewFailureRecord(key);
}

function saveFailedGameState(state: FailedGameState): void {
  const key = failedGameKey(state.gameId, state.depth);
  void saveReviewFailureRecord({
    key,
    gameId:       state.gameId,
    depth:        state.depth,
    attempts:     state.attempts,
    lastFailedAt: state.lastFailedAt,
    skipped:      state.skipped,
    ...(state.skippedAt !== undefined ? { skippedAt: state.skippedAt } : {}),
  });
}

function migrateFailedGameStateDepth(entry: ReviewQueueEntry, oldDepth: number, newDepth: number): void {
  if (oldDepth === newDepth) return;
  const oldKey = failedGameKey(entry.game.id, oldDepth);
  const state = failedGameAttempts.get(oldKey);
  if (!state) return;
  const wasRetrying = failedGameRetryEntry === entry || state.retrying;
  if (wasRetrying) clearFailedGameRetryTimer();
  failedGameAttempts.delete(oldKey);
  void deleteReviewFailureRecord(oldKey);
  const newState: FailedGameState = {
    ...state,
    depth: newDepth,
    retrying: false,
  };
  failedGameAttempts.set(failedGameKey(entry.game.id, newDepth), newState);
  saveFailedGameState(newState);
  if (wasRetrying && entry.status === 'error' && !newState.skipped) {
    scheduleFailedGameRetry(entry, { incrementAttempts: false });
  }
}

function minDepthFromStoredNodes(nodes: Record<string, StoredNodeEntry> | null | undefined): number | undefined {
  if (!nodes) return undefined;
  let min: number | undefined;
  for (const entry of Object.values(nodes)) {
    if (entry.depth === undefined || !Number.isFinite(entry.depth)) continue;
    min = min === undefined ? entry.depth : Math.min(min, entry.depth);
  }
  return min;
}

function entryMinimumDepth(entry: ReviewQueueEntry): number {
  return entry.minimumDepthUsed ?? minDepthFromStoredNodes(entry.serializedNodes) ?? entry.depth;
}

function recordEntryDepthUsed(entry: ReviewQueueEntry, depth: number | undefined): void {
  if (depth === undefined || !Number.isFinite(depth)) return;
  entry.minimumDepthUsed = Math.min(entry.minimumDepthUsed ?? depth, depth);
}

function persistSkippedFailedGameState(entry: ReviewQueueEntry): void {
  const key = failedGameKey(entry.game.id, entry.depth);
  const existing = failedGameAttempts.get(key);
  const state: FailedGameState = {
    gameId:       entry.game.id,
    depth:        entry.depth,
    attempts:     existing?.attempts ?? 1,
    retrying:     false,
    skipped:      true,
    lastFailedAt: existing?.lastFailedAt ?? Date.now(),
    skippedAt:    Date.now(),
  };
  failedGameAttempts.set(key, state);
  void saveReviewFailureRecord({
    key,
    gameId:       state.gameId,
    depth:        state.depth,
    attempts:     state.attempts,
    lastFailedAt: state.lastFailedAt,
    skipped:      true,
    ...(state.skippedAt !== undefined ? { skippedAt: state.skippedAt } : {}),
  });
}

function hydrateActiveReviewRunFailureCounts(): void {
  if (!activeReviewRun) return;
  const failureStates: ReviewRunFailureState[] = [...failedGameAttempts.values()].map(state => ({
    gameId:       state.gameId,
    attempts:     state.attempts,
    lastFailedAt: state.lastFailedAt,
    skipped:      state.skipped,
  }));
  const result = hydrateReviewRunFailureCounts(activeReviewRun, failureStates);
  if (!result.changed) return;
  activeReviewRun = result.manifest;
  persistActiveReviewRun();
}

// Above this many games in a single enqueue call, defer building each entry's
// AnalyseCtrl/eval-cache until the game actually reaches the analyzing slot
// (see ensureEntryBuilt/startEntryBatch) instead of building all of them up
// front. Building `new AnalyseCtrl(pgnToTree(...))` for every game does a full
// chess-legality walk of its PGN, so a large enqueue (e.g. 500 games) would
// otherwise block on hundreds of tree builds before the first game can start.
const LAZY_BUILD_THRESHOLD = 20;

/**
 * Cheap estimate of ply count (half-moves) from raw PGN text, without parsing
 * chess legality or building a move tree. Used only as a placeholder `total`
 * for not-yet-built entries above LAZY_BUILD_THRESHOLD; `startEntryBatch`
 * overwrites `entry.total` with the exact count once the real ctrl is built.
 */
function estimatePlyCountFromPgn(pgn: string): number {
  let body = pgn
    .replace(/\[[^\]]*\]\s*/g, '')   // strip headers
    .replace(/\{[^}]*\}/g, '')        // strip comments
    .replace(/\([^()]*\)/g, '')       // strip (non-nested) variations — mainline only
    .replace(/\d+\.(\.\.)?/g, '')     // strip move numbers ("12." / "12...")
    .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, '') // strip trailing result token
    .trim();
  if (!body) return 0;
  return body.split(/\s+/).filter(Boolean).length;
}

/** Build (or rebuild) `ctrl`/`cache` for an entry that was enqueued lazily. */
function ensureEntryBuilt(entry: ReviewQueueEntry): void {
  if (entry.ctrl && entry.cache) return;
  entry.ctrl  = new AnalyseCtrl(pgnToTree(entry.game.pgn));
  entry.cache = new Map<string, PositionEval>();
  entry.serializedNodes = {};
}

/** Persist the lightweight manifest record for one queue entry (cheap, status/progress only). */
function markReviewStorageWriteFailed(health: Exclude<ReviewStorageHealth, 'ok'>): void {
  reviewStorageHealth = health;
  notifyReviewQueueStateChanged();
}

function persistManifestEntry(entry: ReviewQueueEntry): void {
  void saveReviewQueueManifest({
    gameId: entry.game.id,
    status: entry.status,
    depth:  entry.depth,
    ...(entry.minimumDepthUsed !== undefined ? { minimumDepthUsed: entry.minimumDepthUsed } : {}),
    done:   entry.done,
    total:  entry.total,
  }).then(saved => {
    if (!saved) {
      recordReviewManifestWriteFailure('saveReviewQueueManifest returned false');
      markReviewStorageWriteFailed('manifest-write-failed');
    }
  });
  // Tell observer tabs a manifest record changed so they refresh their mirror
  // immediately instead of waiting for the fallback poll interval.
  postReviewChannelMessage({ type: 'manifest-changed', tabId });
}

// --- Per-bestmove checkpoint throttle (CR-10: throttle engine-driven writes) ---
// Mirrors the time-based throttle pattern in engine/ctrl.ts
// (scheduleLiveEngineUiRefresh/flushLiveEngineUiRefresh), but also coalesces on a
// position count so a fast-searching engine (shallow depth) doesn't write on every
// single bestmove either. Both the partial analysis save and the manifest progress
// write are coalesced together since they fire from the same per-bestmove call site.
//
// Crash-safety: a flush is forced (bypassing both the count and time gates) on
// finishEntry, on pauseBulkReview, and on page visibilitychange→hidden, so the most
// recently analyzed position is never more than one throttle window from durable.

const CHECKPOINT_POSITION_INTERVAL = 5;     // flush at least every N analyzed positions
const CHECKPOINT_MIN_INTERVAL_MS   = 2_000; // ...or at least every T ms, whichever comes first

let checkpointTimer:           ReturnType<typeof setTimeout> | null = null;
let checkpointLastFlushAt      = 0;
let checkpointLastAttemptAt    = 0;
let checkpointPositionsPending = 0;
let checkpointPendingEntry:    ReviewQueueEntry | null = null;

/** Write the partial analysis + manifest checkpoint for `entry` right now. */
function flushReviewCheckpoint(): void {
  if (checkpointTimer !== null) {
    clearTimeout(checkpointTimer);
    checkpointTimer = null;
  }
  const flushedPositionCount = checkpointPositionsPending;
  checkpointPositionsPending = 0;
  checkpointLastAttemptAt    = Date.now();
  const entry = checkpointPendingEntry;
  checkpointPendingEntry = null;
  if (!entry || !entry.ctrl || !entry.cache || !entry.serializedNodes) return;



  const flushStartedAt = Date.now();
  void saveAnalysisToIdbStrict('partial', entry.game.id, entry.serializedNodes, entryMinimumDepth(entry))
    .then(() => {
      checkpointLastFlushAt = Date.now();
      recordReviewCheckpointFlushed(entry, flushStartedAt, flushedPositionCount);
      notifyReviewQueueStateChanged();
    })
    .catch(error => {
      recordReviewCheckpointFlushFailure(entry, error, flushedPositionCount);
      console.warn('[review-queue] checkpoint save failed', error);
      markReviewStorageWriteFailed('checkpoint-write-failed');
    });
  persistManifestEntry(entry);
}

/**
 * Request a checkpoint write for `entry` after a bestmove. Coalesces rapid
 * per-position calls: writes immediately once `CHECKPOINT_POSITION_INTERVAL`
 * positions have accumulated or `CHECKPOINT_MIN_INTERVAL_MS` has elapsed since
 * the last flush, otherwise schedules a trailing flush for whichever is sooner.
 */
function scheduleReviewCheckpoint(entry: ReviewQueueEntry): void {
  checkpointPendingEntry = entry;
  checkpointPositionsPending++;
  const elapsed = Date.now() - Math.max(checkpointLastFlushAt, checkpointLastAttemptAt);
  if (checkpointPositionsPending >= CHECKPOINT_POSITION_INTERVAL || elapsed >= CHECKPOINT_MIN_INTERVAL_MS) {
    flushReviewCheckpoint();
    return;
  }
  if (checkpointTimer !== null) return;
  const wait = Math.max(0, CHECKPOINT_MIN_INTERVAL_MS - elapsed);
  checkpointTimer = setTimeout(flushReviewCheckpoint, wait);
}

/** Drop any pending checkpoint without writing — used when an entry is abandoned (error/cancel). */
function cancelReviewCheckpoint(): void {
  if (checkpointTimer !== null) {
    clearTimeout(checkpointTimer);
    checkpointTimer = null;
  }
  checkpointPositionsPending = 0;
  checkpointPendingEntry     = null;
}

// Crash-safety backstop: visibilitychange→hidden fires reliably on tab close, refresh,
// and backgrounding (unlike beforeunload, which mobile browsers and some desktop flows
// don't guarantee) — flush immediately so the latest analyzed positions survive a forced
// reload. The flush itself is a single cheap IDB put of already-built data, so it lands
// well within the time the page allows before teardown.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushReviewCheckpoint();
  });
}




let reviewBatchStartedAt:   number | null = null;
let reviewLastProgressAt:   number | null = null;

function ensureReviewBatchElapsedStarted(): void {
  if (reviewBatchStartedAt === null) {
    const now = Date.now();
    reviewBatchStartedAt = now;
    if (reviewLastProgressAt === null) reviewLastProgressAt = now;
  }
}

function resetReviewBatchElapsed(): void {
  reviewBatchStartedAt = null;
  reviewLastProgressAt = null;
}

function markReviewQueueProgress(clearPausedNotice = false): void {
  reviewLastProgressAt = Date.now();
  if (clearPausedNotice) clearActiveReviewPauseNoticeAfterProgress();
  if (activeReviewRun?.lifecycleState === 'stale') {
    setActiveReviewRunState('running');
  }
}

// --- Per-position engine state ---
// Mirrors the evalNodePath/currentEval/engineSearchActive pattern in engine/ctrl.ts.

let reviewCurrentEval:     PositionEval = {};
let reviewNodePath         = '';
let reviewNodePly          = 0;
let reviewParentPath       = '';
let reviewSearchActive     = false;
let reviewItemQueue:       ReviewBatchItem[] = [];
let reviewItemIndex        = 0;
// Engine-result→node binding guard (BUG-2026-06-29-019): bounded re-search when a result's best
// move is illegal in the item's own FEN (the engine answered for a different position). Re-searching
// the same FEN re-syncs a one-position-behind engine; after the cap, the game errors loudly.
const REVIEW_MISMATCH_MAX_RETRIES = 2;
let reviewMismatchRetryIndex = -1;
let reviewMismatchRetryCount = 0;
// Depth used for the currently-analyzing entry — set from entry.depth in startEntryBatch.
let reviewActiveDepth      = bulkReviewDepth;

// --- Stop/bestmove race hardening ---
// Instead of a raw pending-stop counter (which can desync across rapid pause/resume/cancel
// sequences), we use a monotonic generation token.  Every stop() call increments the
// generation; sendNextItem() and watchdog-retry captures the generation at search start.
// The bestmove handler discards any result whose captured generation doesn't match the
// current generation, closing the window where a stale bestmove could be misattributed to
// the next position and permanently swallow its result.
//
// A parallel `reviewInflightFen` string records the FEN of the active search so that both
// info-accumulation and the bestmove handler can double-check position identity in logs.

let reviewSearchGeneration      = 0;   // incremented on every stop() or new-search start
let reviewSearchStartGeneration = 0;   // captured at sendNextItem() / watchdog-retry
let reviewInflightFen           = '';  // FEN of the currently-active search
let reviewSearchInvalidatedAt: number | null = null;

type ReviewSearchIdentity = ReviewSearchIdentitySnapshot;

let reviewActiveSearchIdentity: ReviewSearchIdentity | null = null;












const reviewSearchOwner = createReviewSearchOwner();
let reviewActiveSearchToken: number | null = null;

// Dispatch barrier: when a new search wants to start while previous searches are still owed a
// bestmove, mark them stale, stop the engine, and wait for the FIFO to drain before sending the
// next `position`/`go`. Bounded: if the owed replies never arrive (engine died mid-search), reset
// the owner and dispatch anyway — the per-position watchdog still bounds a truly dead engine.
const REVIEW_DISPATCH_BARRIER_TIMEOUT_MS = 4_000;
let reviewDispatchBarrierTimer: ReturnType<typeof setTimeout> | null = null;
let reviewDispatchBarrierWaiting = false;

function recordReviewSearchOwnerReset(reason: 'barrier-timeout' | 'engine-error', droppedSearches: number): void {
  record({
    kind: 'engine',
    severity: Severity.Warn,
    source: 'review-engine',
    sourceTag: 'review-engine',
    message: 'review-search-owner-reset',
    metadata: {
      role: reviewDiagnosticRole(),
      resetReason: reason,
      droppedSearches,
      positionIndex: reviewItemIndex,
      timestamp: Date.now(),
    },
    redactionClass: 'safe',
  });
}

function clearDispatchBarrier(): void {
  if (reviewDispatchBarrierTimer !== null) {
    clearTimeout(reviewDispatchBarrierTimer);
    reviewDispatchBarrierTimer = null;
  }
  reviewDispatchBarrierWaiting = false;
}

function beginDispatchBarrier(): void {
  if (reviewDispatchBarrierWaiting) return;
  reviewDispatchBarrierWaiting = true;
  reviewDispatchBarrierTimer = setTimeout(() => {
    reviewDispatchBarrierTimer = null;
    reviewDispatchBarrierWaiting = false;
    const dropped = searchOwnerReset(reviewSearchOwner);
    recordReviewSearchOwnerReset('barrier-timeout', dropped);
    if (!queuePaused && reviewItemQueue[reviewItemIndex]) sendNextItem();
  }, REVIEW_DISPATCH_BARRIER_TIMEOUT_MS);
}

/** After each consumed bestmove: if the pipeline just drained and a dispatch is waiting, send it. */
function maybeFinishDispatchBarrier(): void {
  if (!reviewDispatchBarrierWaiting) return;
  if (searchOwnerOutstanding(reviewSearchOwner) > 0) return;
  clearDispatchBarrier();
  if (!queuePaused && reviewItemQueue[reviewItemIndex]) sendNextItem();
}

function clearReviewSearchIdentity(): void {
  reviewActiveSearchIdentity = null;
  reviewActiveSearchToken = null;
  reviewInflightFen = '';
}

function invalidateReviewSearchIdentity(): void {
  reviewSearchInvalidatedAt = Date.now();
  clearReviewSearchIdentity();
}

function currentReviewSearchIdentityMatches(): boolean {
  const identity = reviewActiveSearchIdentity;
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  const item = reviewItemQueue[reviewItemIndex];
  if (!identity || !entry || !item) return false;
  return reviewSearchIdentityMatches(identity, {
    gameId:     entry.game.id,
    fen:        item.fen,
    nodePath:   item.nodePath,
    parentPath: item.parentPath,
    depth:      reviewActiveDepth,
    generation: reviewSearchGeneration,
  });
}

function beginReviewSearch(item: ReviewBatchItem): void {
  if (preemptTreeEvalLease('bulk-review-started') || treeEvalPreemptDrainActive) return;
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (!entry) return;
  // One search in flight per engine: if previous searches are still owed a bestmove (stopped
  // watchdog/pause search, residual tree-eval go), mark them stale and wait for the pipeline to
  // drain before sending the next position/go. Their replies are consumed and dropped by the
  // owner FIFO; dispatch resumes from maybeFinishDispatchBarrier or the bounded barrier timeout.
  if (searchOwnerOutstanding(reviewSearchOwner) > 0) {
    searchOwnerMarkAllStale(reviewSearchOwner);
    reviewProtocol.stop();
    beginDispatchBarrier();
    return;
  }
  clearDispatchBarrier();
  const positionReplay = replayEnginePositionContext(item.position, item.fen);
  const positionCurrentFenMatchesItemFen = engineFenEquals(item.position.currentFen, item.fen);
  if (!positionReplay.ok || !positionCurrentFenMatchesItemFen) {
    const reason = positionReplay.reason ?? 'position-current-fen-mismatch';
    recordReviewPositionContextMismatch(entry, item, positionReplay, reason);
    reviewCurrentEval = {};
    markActiveEntryErrored(
      `review-position-context-mismatch at ${reviewItemIndex + 1}/${reviewItemQueue.length}: ${reason}`,
    );
    return;
  }
  performance.mark('position-analysis-start', {
    detail: {
      index: reviewItemIndex,
      fen: item.fen,
    },
  });
  reviewSearchGeneration++;
  reviewCurrentEval           = {};
  reviewNodePath              = item.nodePath;
  reviewNodePly               = item.nodePly;
  reviewParentPath            = item.parentPath;
  reviewSearchActive          = true;
  reviewInflightFen           = item.fen;
  reviewSearchStartGeneration = reviewSearchGeneration;
  reviewActiveSearchIdentity = {
    gameId:     entry.game.id,
    fen:        item.fen,
    nodePath:   item.nodePath,
    parentPath: item.parentPath,
    depth:      reviewActiveDepth,
    generation: reviewSearchGeneration,
  };
  // Register this go with the search-owner FIFO; the arriving bestmove that consumes this
  // descriptor is the only reply that may be stored for this item.
  reviewActiveSearchToken = searchOwnerRegisterGo(reviewSearchOwner, {
    kind:     'review',
    fen:      item.fen,
    nodePath: item.nodePath,
    ply:      item.nodePly,
  }).token;
  reviewProtocol.setPositionContext(item.position);




  reviewProtocol.go(reviewActiveDepth, 1, entry.feed === 'bulk' ? (bulkReviewMovetime ?? undefined) : undefined);
  armWatchdog();
}

















const REVIEW_CONTENTION_CORE_THRESHOLD = 4;     // only defer on machines this size or smaller
const REVIEW_DISPATCH_DEFER_MS         = 250;   // re-check interval while live engine is busy
const REVIEW_DISPATCH_MAX_DEFERS       = 8;     // ~2s worst case, well under the watchdog window

let reviewDispatchDeferTimer: ReturnType<typeof setTimeout> | undefined = undefined;
let reviewDispatchDeferCount = 0;

/** True when dispatch should be briefly delayed to avoid oversubscribing a low-core machine. */
function shouldDeferDispatch(): boolean {
  const cores = navigator.hardwareConcurrency ?? 2;
  if (cores > REVIEW_CONTENTION_CORE_THRESHOLD) return false;
  if (reviewDispatchDeferCount >= REVIEW_DISPATCH_MAX_DEFERS) return false;
  return isEngineSearching();
}

function reviewThreadScalingDesktopGate(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(pointer: coarse)').matches;
}

function reviewScaledThreadTarget(): number {
  const cores = navigator.hardwareConcurrency ?? 2;
  return Math.max(REVIEW_ENGINE_THREADS, Math.min(REVIEW_ENGINE_DESKTOP_MAX_THREADS, cores - 1));
}

function desiredReviewProtocolThreadsBeforeDispatch(): number {
  if (!reviewThreadScalingDesktopGate()) return REVIEW_ENGINE_THREADS;
  if (reviewSearchActive || reviewDispatchBarrierWaiting) return REVIEW_ENGINE_THREADS;
  if (searchOwnerOutstanding(reviewSearchOwner) !== 0) return REVIEW_ENGINE_THREADS;
  if (sharedProtocolBusyState().busy) return REVIEW_ENGINE_THREADS;
  return reviewScaledThreadTarget();
}

function syncReviewProtocolThreadsBeforeDispatch(): void {
  const desiredThreads = desiredReviewProtocolThreadsBeforeDispatch();
  if (desiredThreads === reviewProtocolThreads) return;
  if (reviewProtocol.setOptionWhenIdle('Threads', desiredThreads)) {
    reviewProtocolThreads = desiredThreads;
  }
}

/** Cancel any pending deferred dispatch — called on pause/cancel so it can't fire afterward. */
function clearDispatchDefer(): void {
  if (reviewDispatchDeferTimer !== undefined) {
    clearTimeout(reviewDispatchDeferTimer);
    reviewDispatchDeferTimer = undefined;
  }
  reviewDispatchDeferCount = 0;
}

// --- Per-position watchdog ---
// Prevents the queue from stalling forever if bestmove never arrives (e.g. engine crash/hang).
// Detection is silence-based: a healthy fixed-depth search emits `info` lines continuously, so
// we measure time since the last engine output for the active search rather than total search
// time. This is independent of depth and hardware speed — a true hang (engine dies → no output)
// is caught within WATCHDOG_SILENCE_MS no matter how slow the machine is, and a legitimately
// long search is never killed because it keeps petting the timer. A generous absolute ceiling
// is a backstop for the (very rare) "emits info forever but never returns bestmove" mode.
// Armed in sendNextItem(), pet on each info line, cleared on bestmove, disarmed on pause/cancel.

let reviewWatchdogTimer:         ReturnType<typeof setTimeout> | undefined = undefined; // silence timer
let reviewWatchdogAbsoluteTimer: ReturnType<typeof setTimeout> | undefined = undefined; // hard backstop
let reviewWatchdogRetries  = 0;          // retry count for the current position (bounded to 1)
let reviewWatchdogTriggeredAt: number | null = null;
let reviewWatchdogLastTriggerAt: number | null = null;
const WATCHDOG_SILENCE_MS  = 12_000;     // fire after this long with NO engine output for the active search
const WATCHDOG_ABSOLUTE_MS = 240_000;    // hard per-position backstop, independent of output
const WATCHDOG_MAX_RETRIES = 1;          // retry once, then skip

function armWatchdog(): void {
  clearWatchdog();
  reviewWatchdogTimer         = setTimeout(onWatchdogExpiry, WATCHDOG_SILENCE_MS);
  reviewWatchdogAbsoluteTimer = setTimeout(onWatchdogExpiry, WATCHDOG_ABSOLUTE_MS);
}

// Re-arm only the silence timer: any engine output for the active search proves it is alive.
// Leaves the absolute backstop untouched.
function petWatchdog(): void {
  if (!reviewSearchActive) return;
  if (reviewWatchdogTimer !== undefined) clearTimeout(reviewWatchdogTimer);
  reviewWatchdogTimer = setTimeout(onWatchdogExpiry, WATCHDOG_SILENCE_MS);
}

function clearWatchdog(): void {
  if (reviewWatchdogTimer !== undefined) {
    clearTimeout(reviewWatchdogTimer);
    reviewWatchdogTimer = undefined;
  }
  if (reviewWatchdogAbsoluteTimer !== undefined) {
    clearTimeout(reviewWatchdogAbsoluteTimer);
    reviewWatchdogAbsoluteTimer = undefined;
  }
}

function markActiveEntryErrored(reason: string, error?: unknown): void {
  const lastPositionIndex = Math.max(0, reviewItemIndex - 1);
  clearWatchdog();
  clearDispatchDefer();
  clearDispatchBarrier();
  clearTreeEvalPreemptDrain();
  reviewWatchdogRetries = 0;
  reviewWatchdogTriggeredAt = null;



  if (searchOwnerOutstanding(reviewSearchOwner) > 0) {
    searchOwnerMarkAllStale(reviewSearchOwner);
    reviewProtocol.stop();
  }
  reviewSearchActive = false;
  clearReviewSearchIdentity();
  reviewCurrentEval = {};
  reviewItemQueue = [];
  reviewItemIndex = 0;
  reviewMismatchRetryIndex = -1;
  reviewMismatchRetryCount = 0;

  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (error !== undefined) {
    console.error('[review-engine] marking game errored:', reason, error);
  } else {
    console.error('[review-engine] marking game errored:', reason);
  }

  if (entry) {
    entry.status = 'error';
    persistManifestEntry(entry);
    // Record the durable failed-attempt entry and (if the breaker isn't already
    // tripped) arm the backoff retry timer first, THEN bump the breaker's
    // consecutive-failure counter — so a trip here still leaves this game's id in
    // the durable failed list, even though it cancels the timer just armed.
    scheduleFailedGameRetry(entry);
    recordReviewRunGameFailureForBreaker();
    recordReviewGameErrored(entry, error, lastPositionIndex, true);
  }

  notifyReviewQueueStateChanged();
}

function onWatchdogExpiry(): void {
  const watchdogTriggeredAt = Date.now();
  if (reviewWatchdogTriggeredAt === null) reviewWatchdogTriggeredAt = watchdogTriggeredAt;
  reviewWatchdogLastTriggerAt = watchdogTriggeredAt;
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (entry) recordReviewWatchdogTriggered(entry, watchdogTriggeredAt);
  notifyReviewQueueStateChanged();

  // Cancel whichever timer did not fire (silence vs absolute backstop).
  clearWatchdog();
  console.warn('[review-watchdog] no engine output within timeout — treating position as hung; retries used:', reviewWatchdogRetries);

  // Instrument watchdog expiry: record event type, depth reached, and movetime limit.
  // Position context is ply only — never raw FEN.
  record({
    kind: 'engine',
    severity: Severity.Warn,
    source: 'engine.reviewQueue',
    sourceTag: 'engine',
    message: 'watchdog-expiry',
    metadata: {
      role:        reviewDiagnosticRole(),
      eventType:   'watchdog-expiry',
      depthTarget: reviewActiveDepth,
      depthReached: reviewCurrentEval.depth ?? null,


      movetimeMs:  entry?.feed === 'bulk' ? (bulkReviewMovetime ?? null) : null,
      ply:         reviewNodePly,
      retries:     reviewWatchdogRetries,
      ...reviewProtocol.deviceCapabilityMetadata(),
    },
    redactionClass: 'safe',
  });

  if (reviewSearchActive) {
    // Increment generation before stop() so any late bestmove from the timed-out search
    // is recognised as stale when it arrives. Marking the outstanding searches stale is what
    // actually guarantees the drop: the retry below re-frames immediately, and the stopped
    // search's bestmove must be rejected by its own (stale) descriptor, not by frame state.
    reviewSearchGeneration++;
    searchOwnerMarkAllStale(reviewSearchOwner);
    reviewProtocol.stop();
    reviewSearchActive = false;
    invalidateReviewSearchIdentity();
  }

  if (reviewWatchdogRetries < WATCHDOG_MAX_RETRIES) {
    // Retry once: re-issue the same position.
    reviewWatchdogRetries++;
    const item = reviewItemQueue[reviewItemIndex];
    if (!item) {
      advanceToNextItem();
      return;
    }
    console.warn('[review-watchdog] retrying position', reviewItemIndex + 1, '/', reviewItemQueue.length);
    beginReviewSearch(item);
  } else {
    // Second expiry — mark the game as errored and advance past it.
    if (entry) recordReviewWatchdogAbort(entry, watchdogTriggeredAt, reviewWatchdogTriggeredAt ?? watchdogTriggeredAt);
    recordReviewQueueLifecycleEvent('review-queue-aborted', Severity.Warn);
    markActiveEntryErrored(`review position permanently timed out at ${reviewItemIndex + 1}/${reviewItemQueue.length}`);
  }
}

/** Advance past the current position (skip or finish) after a watchdog skip. */
function advanceToNextItem(): void {
  reviewWatchdogRetries = 0;
  reviewWatchdogTriggeredAt = null;
  reviewCurrentEval = {};
  reviewItemIndex++;
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (!entry) return;

  // If the entry was marked errored (by the second watchdog expiry), skip to
  // the next game in the queue rather than continuing its remaining positions.
  if (entry.status === 'error') {
    notifyReviewQueueStateChanged();
    advanceQueue();
    return;
  }

  if (reviewItemIndex < reviewItemQueue.length) {
    sendNextItem();
  } else {
    finishEntry(entry);
  }
}

// --- Injected deps (set via initReviewQueue) ---

let _analyzedGameIds:      Set<string>                                                 = new Set();
let _missedTacticGameIds:  Set<string>                                                 = new Set();
let _analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }> = new Map();
let _getUserColor:         (game: ImportedGame) => 'white' | 'black' | null            = () => null;
let _redraw:               () => void                                                   = () => {};
let _setReviewEngineMetadata: (gameId: string, metadata: ReviewEngineMetadata) => void  = () => {};

const reviewQueueStateListeners = new Set<() => void>();
const acceptedReviewResultListeners = new Set<(result: AcceptedReviewResult) => void>();

/** Subscribe to review queue state changes; returns an unsubscribe cleanup. */
export function subscribeReviewQueueState(listener: () => void): () => void {
  reviewQueueStateListeners.add(listener);
  return () => {
    reviewQueueStateListeners.delete(listener);
  };
}

/** Subscribe to per-position review results after exact-FEN/search-owner acceptance. */
export function subscribeAcceptedReviewResults(listener: (result: AcceptedReviewResult) => void): () => void {
  acceptedReviewResultListeners.add(listener);
  return () => {
    acceptedReviewResultListeners.delete(listener);
  };
}

function notifyAcceptedReviewResult(result: AcceptedReviewResult): void {
  for (const listener of acceptedReviewResultListeners) {
    try {
      listener(result);
    } catch (error) {
      console.warn('[review-queue] accepted-result listener failed', error);
    }
  }
}

function notifyReviewQueueStateChanged(): void {
  _redraw();
  for (const listener of reviewQueueStateListeners) {
    try {
      listener();
    } catch (error) {
      console.warn('[review-queue] state-change listener failed', error);
    }
  }
}

export function initReviewQueue(deps: {
  analyzedGameIds:      Set<string>;
  missedTacticGameIds:  Set<string>;
  analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }>;
  getUserColor:         (game: ImportedGame) => 'white' | 'black' | null;
  redraw:               () => void;
  setReviewEngineMetadata?: (gameId: string, metadata: ReviewEngineMetadata) => void;
}): void {
  _analyzedGameIds      = deps.analyzedGameIds;
  _missedTacticGameIds  = deps.missedTacticGameIds;
  _analyzedGameAccuracy = deps.analyzedGameAccuracy;
  _getUserColor         = deps.getUserColor;
  _redraw               = deps.redraw;
  _setReviewEngineMetadata = deps.setReviewEngineMetadata ?? (() => {});

  // Re-run missed-moment detection for all completed queue entries whenever
  // the detection config is changed via the Detection Settings menu.
  // Only covers games reviewed in the current session — IDB-restored games
  // from previous sessions are not in the queue and keep their stored result.
  onMissedMomentConfigChange(recomputeMissedTactics);



  initLeaderElection();
}

function recomputeMissedTactics(): void {
  // Only update entries that are in the current session's queue — IDB-restored
  // games (from a previous session, never re-queued) are not present and their
  // flags are left untouched.
  //
  // Behavior change (T07 eviction): a 'complete' entry's `ctrl`/`cache` are nulled
  // out shortly after completion (see ReviewQueueEntry), so they can no longer be
  // read directly here. Each completed entry's mainline + eval cache is rehydrated
  // from the durable `analysis-library` IDB record instead — the same record
  // `finishEntry` just saved — rather than from the in-memory fields. Still-resident
  // entries (not yet evicted, e.g. completed moments ago) are used directly to avoid
  // an unnecessary IDB round trip.
  void (async () => {
    for (const entry of queue) {
      if (entry.status !== 'complete') continue;
      const userColor = _getUserColor(entry.game);
      let mainline: TreeNode[];
      let cache:    Map<string, PositionEval>;
      if (entry.ctrl && entry.cache) {
        mainline = entry.ctrl.mainline;
        cache    = entry.cache;
      } else {
        // Evicted — rebuild the mainline from the game's PGN (same as
        // resumeReviewQueueFromManifest) and rehydrate the eval cache from the
        // durable analysis-library record `finishEntry` already saved.
        const rebuiltCtrl = new AnalyseCtrl(pgnToTree(entry.game.pgn));
        const stored = await loadAnalysisFromIdb(entry.game.id);
        if (!stored) continue; // shouldn't happen post-completion, but guard defensively
        const rebuiltCache = new Map<string, PositionEval>();
        for (const node of Object.values(stored.nodes)) {
          if (!node.path) continue; // pre-migration node.id-keyed record — skip
          const ev: PositionEval = {};
          if (node.cp    !== undefined) ev.cp    = node.cp;
          if (node.mate  !== undefined) ev.mate  = node.mate;
          if (node.best  !== undefined) ev.best  = node.best;
          if (node.loss  !== undefined) ev.loss  = node.loss;
          if (node.delta !== undefined) ev.delta = node.delta;
          if (node.bestLine !== undefined) ev.moves = node.bestLine;
          rebuiltCache.set(node.path, ev);
        }
        mainline = rebuiltCtrl.mainline;
        cache    = rebuiltCache;
      }
      const moments = detectMissedMoments(mainline, cache, userColor);
      setMissedMoments(entry.game.id, moments);
      if (moments.length > 0) {
        _missedTacticGameIds.add(entry.game.id);
      } else {
        _missedTacticGameIds.delete(entry.game.id);
      }
    }
    notifyReviewQueueStateChanged();
  })();
}


// --- Background engine init ---

export async function initReviewEngine(baseUrl: string): Promise<void> {


  if (!isCurrentLeader) return;
  if (reviewEngineInitStarted) return;
  reviewEngineInitStarted = true;
  const initStartedAt = recordReviewEngineInitStart();

  reviewProtocol.onMessage(line => {
    if (line.trim() === 'readyok') {
      reviewEngineReady = true;
      resolveReviewEngineReadyWaiters(true);
      console.log('[review-engine] ready');
      // If a game is waiting for the engine, kick off its batch now — but never while a search
      // is already framed or the pipeline is still draining (double-dispatch guard).
      const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
      if (
        entry && entry.status === 'analyzing' && reviewItemQueue.length > 0
        && !reviewSearchActive && !reviewDispatchBarrierWaiting
        && searchOwnerOutstanding(reviewSearchOwner) === 0
      ) {
        sendNextItem();
      }
      return;
    }
    // Single consumption point for the search-owner FIFO: every bestmove pops the oldest
    // outstanding search descriptor, regardless of how the line is routed below. Attribution
    // decisions downstream use the consumed descriptor, never the currently-framed search.
    let consumedSearch: ReviewSearchDescriptor | null = null;
    if (line.trim().split(/\s+/)[0] === 'bestmove') {
      consumedSearch = searchOwnerConsumeBestmove(reviewSearchOwner);
      maybeFinishDispatchBarrier();
    }
    if (treeEvalLease && !isBulkReviewActive()) {
      treeEvalLease.onMessage(line);
      return;
    }
    if (handleTreeEvalPreemptDrainLine(line)) return;
    if (treeEvalLease && isBulkReviewActive()) {
      preemptTreeEvalLease('bulk-review-active');
      return;
    }
    parseReviewLine(line, consumedSearch);
  });

  // Wire the protocol's onError signal into a module-level failure state.
  // onError fires for corrupt NNUE data and other engine-level errors after init.
  reviewProtocol.onEngineError = (msg: string) => {
    console.error('[review-engine] engine error — marking failed:', msg);
    reviewEngineFailed = true;
    reviewEngineReady  = false;
    resolveReviewEngineReadyWaiters(false);
    preemptTreeEvalLease('review-engine-error');
    const dropped = searchOwnerReset(reviewSearchOwner);
    if (dropped > 0) recordReviewSearchOwnerReset('engine-error', dropped);
    clearDispatchBarrier();
    _failAnalyzingEntries();
    notifyReviewQueueStateChanged();
  };

  try {
    await reviewProtocol.init(baseUrl);
    recordReviewEngineInitSuccess(initStartedAt);
  } catch (err) {
    // WASM alloc, SharedArrayBuffer COOP/COEP, or NNUE fetch failure.
    recordReviewEngineInitFailure(initStartedAt, err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[review-engine] init failed — engine unavailable:', msg);
    reviewEngineFailed = true;
    resolveReviewEngineReadyWaiters(false);
    preemptTreeEvalLease('review-engine-init-failed');
    // Demote every entry still in `analyzing` so they don't appear stuck.
    _failAnalyzingEntries();


    tripReviewRunBreakerForEngineInit();
    notifyReviewQueueStateChanged();
  }
}

/** Move any entries stuck in `analyzing` to `error` after an init failure. */
function _failAnalyzingEntries(): void {
  for (const entry of queue) {
    if (entry.status === 'analyzing') {
      entry.status = 'error';
      persistManifestEntry(entry);
    }
  }
}

/** True when the review engine failed to initialise. */
export function isReviewEngineFailed(): boolean {
  return reviewEngineFailed;
}

/** True while the engine init is in progress but not yet ready or failed. */
export function isReviewEngineInitializing(): boolean {
  return reviewEngineInitStarted && !reviewEngineReady && !reviewEngineFailed;
}

// --- UCI line parser for the background engine ---
// Mirrors parseEngineLine in engine/ctrl.ts, single-PV only (batch always uses MultiPV=1).

function parseReviewLine(line: string, consumedSearch: ReviewSearchDescriptor | null = null): void {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === 'info') {




    if (!searchOwnerDescriptorIsActive(searchOwnerHead(reviewSearchOwner), reviewActiveSearchToken)) return;
    if (!currentReviewSearchIdentityMatches()) return;
    // Engine is alive and searching — reset the silence watchdog.
    petWatchdog();
    let isMate = false;
    let score: number | undefined;
    let best:  string | undefined;
    let pvMoves: string[] = [];
    let pvIndex = 1;
    let depth: number | undefined;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'multipv') {
        const next = parts[i + 1];
        if (next === undefined) break;
        pvIndex = parseInt(next, 10);
        i++;
      } else if (parts[i] === 'depth') {
        const next = parts[i + 1];
        if (next === undefined) break;
        depth = parseInt(next, 10);
        i++;
      } else if (parts[i] === 'score') {
        const scoreType  = parts[i + 1];
        const scoreValue = parts[i + 2];
        if (scoreType === undefined || scoreValue === undefined) break;
        isMate = scoreType === 'mate';
        score  = parseInt(scoreValue, 10);
        i += 2;
        if (parts[i + 1] === 'lowerbound' || parts[i + 1] === 'upperbound') i++;
      } else if (parts[i] === 'pv') {
        pvMoves = parts.slice(i + 1);
        best    = pvMoves[0];
        break;
      }
    }
    if (pvIndex === 1 && score !== undefined) {
      // Normalize to white perspective: odd ply = black to move, negate.
      const s = reviewNodePly % 2 === 1 ? -score : score;
      if (isMate) {
        reviewCurrentEval.mate = s;
        delete reviewCurrentEval.cp;
      } else {
        reviewCurrentEval.cp = s;
        delete reviewCurrentEval.mate;
      }
    }
    if (pvIndex === 1 && best) {
      reviewCurrentEval.best = best;
      reviewCurrentEval.moves = pvMoves;
    }
    if (pvIndex === 1 && depth !== undefined) {
      reviewCurrentEval.depth = depth;
    }
  } else if (parts[0] === 'bestmove') {
    // Attribution: this reply belongs to the search descriptor consumed from the owner FIFO in
    // the onMessage handler — never to "whatever search is currently framed". The generation and
    // identity checks are retained as secondary consistency guards.
    const ownedByActiveSearch = searchOwnerDescriptorIsActive(consumedSearch, reviewActiveSearchToken);
    const legacyChecksPass = reviewSearchStartGeneration === reviewSearchGeneration && currentReviewSearchIdentityMatches();
    if (!ownedByActiveSearch || !legacyChecksPass) {
      // This bestmove belongs to a stopped/superseded/tree-eval search (or the checks disagree) —
      // discard it. Do NOT reset the active frame or eval when our own search is still owed a
      // reply: its info lines are valid and its bestmove is still coming.
      const activeSearchStillPending = reviewActiveSearchToken !== null
        && reviewSearchOwner.pending.some(descriptor => descriptor.token === reviewActiveSearchToken);
      if (activeSearchStillPending) {
        petWatchdog();
      } else {
        clearWatchdog();
      }
      const silentTreeEvalReply = consumedSearch?.kind === 'tree-eval' && reviewActiveSearchToken === null;
      if (!silentTreeEvalReply) {
        console.log('[review-engine] stale bestmove discarded (owned', ownedByActiveSearch,
          'gen', reviewSearchStartGeneration, '/', reviewSearchGeneration,
          'consumedKind', consumedSearch?.kind ?? 'none', 'fen', reviewInflightFen, ')');
        const staleEntry = activeIndex >= 0 ? queue[activeIndex] : undefined;
        if (staleEntry) {
          const timestamp = Date.now();
          recordReviewStaleBestmoveDropped(staleEntry, timestamp, reviewSearchInvalidatedAt ?? timestamp);
        }

        // Instrument stale bestmove drop: record event type, depth reached, and movetime limit.
        // Position context is ply only — never raw FEN.
        record({
          kind: 'engine',
          severity: Severity.Info,
          source: 'engine.reviewQueue',
          sourceTag: 'engine',
          message: 'stale-bestmove-drop',
          metadata: {
            role:         reviewDiagnosticRole(),
            eventType:    'stale-bestmove-drop',
            depthTarget:  reviewActiveDepth,
            depthReached: reviewCurrentEval.depth ?? null,


            movetimeMs:   staleEntry?.feed === 'bulk' ? (bulkReviewMovetime ?? null) : null,
            ply:          reviewNodePly,
            consumedKind: consumedSearch?.kind ?? null,
            consumedStale: consumedSearch?.stale ?? null,
            ownedByActiveSearch,
            legacyChecksPass,
            outstandingSearches: searchOwnerOutstanding(reviewSearchOwner),
          },
          redactionClass: 'safe',
        });
      }

      if (!activeSearchStillPending) {
        reviewCurrentEval = {};
        clearReviewSearchIdentity();
        reviewSearchInvalidatedAt = null;
      }
      return;
    }
    clearWatchdog();
    reviewSearchActive = false;
    clearReviewSearchIdentity();
    reviewSearchInvalidatedAt = null;
    const bestmove = parts[1];
    if (!bestmove || bestmove === '(none)') {
      const activeItem = reviewItemQueue[reviewItemIndex];
      if (activeItem && isTerminalReviewFen(activeItem.fen)) {
        reviewDebugLog('[review-engine] terminal position returned no bestmove; advancing', {
          fen: activeItem.fen,
          nodePly: activeItem.nodePly,
        });
        onReviewBestmove(consumedSearch);
        return;
      }
      markActiveEntryErrored(`review engine returned invalid bestmove: ${line.trim()}`);
      return;
    }
    reviewCurrentEval.best = bestmove;
    onReviewBestmove(consumedSearch);
  }
}

// --- Bestmove handler ---













function reviewResultMismatchKind(
  item: ReviewBatchItem,
  stored: PositionEval,
  consumedSearch: ReviewSearchDescriptor | null,
): 'descriptor-fen' | 'illegal-best' | null {
  if (consumedSearch && !engineFenEquals(consumedSearch.fen, item.fen)) return 'descriptor-fen';
  if (stored.best && !uciMoveIsLegalInFen(item.fen, stored.best)) return 'illegal-best';
  return null;
}

function onReviewBestmove(consumedSearch: ReviewSearchDescriptor | null): void {
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (!entry) return;
  if (reviewWatchdogRetries > 0 && reviewWatchdogTriggeredAt !== null) {
    const timestamp = Date.now();
    recordReviewWatchdogRecovery(entry, timestamp, reviewWatchdogTriggeredAt);
  }
  reviewWatchdogRetries = 0;
  reviewWatchdogTriggeredAt = null;

  // entry is the in-progress active entry here, never 'complete' — ctrl/cache
  // have not been evicted yet.
  const ctrl  = entry.ctrl!;
  const cache = entry.cache!;

  const stored     = { ...reviewCurrentEval };
  const nodePath   = reviewNodePath;
  const nodePly    = reviewNodePly;
  const parentPath = reviewParentPath;
  // Capture the just-analyzed item's identity before reviewItemIndex advances —
  // needed to append a single StoredNodeEntry below without re-walking the mainline.
  const item = reviewItemQueue[reviewItemIndex];
  performance.mark('position-analysis-complete', {
    detail: {
      index: reviewItemIndex,
      fen: item?.fen ?? '',
    },
  });








  const mismatchKind = item ? reviewResultMismatchKind(item, stored, consumedSearch) : null;
  if (item && mismatchKind) {
    const retriesForItem = reviewMismatchRetryIndex === reviewItemIndex ? reviewMismatchRetryCount : 0;
    const positionReplay = replayEnginePositionContext(item.position, item.fen);
    const positionReplayReason = positionReplay.reason
      ?? (engineFenEquals(item.position.currentFen, item.fen) ? null : 'position-current-fen-mismatch');
    record({
      kind: 'engine',
      severity: Severity.Warn,
      source: 'review-engine',
      sourceTag: 'review-engine',
      message: 'review-fen-binding-mismatch',
      metadata: {
        role:          reviewDiagnosticRole(),
        ...reviewPositionContextMetadata(item, positionReplay, positionReplayReason),
        mismatchKind,
        retries:       retriesForItem,
        timestamp:     Date.now(),
      },
      redactionClass: 'safe',
    });
    reviewCurrentEval = {};
    if (retriesForItem >= REVIEW_MISMATCH_MAX_RETRIES) {
      markActiveEntryErrored(
        `review-fen-binding-mismatch (${mismatchKind}) persisted at ${reviewItemIndex + 1}/${reviewItemQueue.length}`,
      );
      return;
    }
    reviewMismatchRetryIndex = reviewItemIndex;
    reviewMismatchRetryCount = retriesForItem + 1;
    sendNextItem(); // re-search the same item; this re-syncs a one-position-behind engine
    return;
  }
  // Result is bound to the correct position — clear any mismatch retry state for this item.
  if (reviewMismatchRetryIndex === reviewItemIndex) {
    reviewMismatchRetryIndex = -1;
    reviewMismatchRetryCount = 0;
  }

  if (stored.cp !== undefined || stored.mate !== undefined) {
    recordEntryDepthUsed(entry, stored.depth ?? reviewActiveDepth);
    const parentEval = cache.get(parentPath);
    if (parentEval?.cp !== undefined && stored.cp !== undefined) {
      stored.delta = stored.cp - parentEval.cp;
    }
    if (parentEval) {
      const nodeWc   = evalWinChances(stored);
      const parentWc = evalWinChances(parentEval);
      if (nodeWc !== undefined && parentWc !== undefined) {
        const whiteToMove   = nodePly % 2 === 1;
        const moverNodeWc   = whiteToMove ? nodeWc   : -nodeWc;
        const moverParentWc = whiteToMove ? parentWc : -parentWc;
        stored.loss = (moverParentWc - moverNodeWc) / 2;
      }
    }
    cache.set(nodePath, stored);
    if (entry.serializedNodes && item) {
      entry.serializedNodes[nodePath] = buildAnalysisNodeEntry(item.nodeId, nodePath, item.fen, stored);
    }
    if (item) {
      notifyAcceptedReviewResult({
        gameId: entry.game.id,
        nodeId: item.nodeId,
        nodePly,
        nodePath,
        parentPath,
        fen: item.fen,
        eval: { ...stored },
        depth: stored.depth ?? reviewActiveDepth,
      });
    }
  }

  entry.done++;
  markReviewQueueProgress(true);
  reviewItemIndex++;
  reviewCurrentEval = {};
  if (entry.depth !== reviewActiveDepth) {
    reviewActiveDepth = entry.depth;
  }

  scheduleReviewCheckpoint(entry);
  notifyReviewQueueStateChanged();

  if (reviewItemIndex < reviewItemQueue.length) {
    sendNextItem();
  } else {
    finishEntry(entry);
  }
}

// --- Send next batch item to the background engine ---

function sendNextItem(): void {
  const item = reviewItemQueue[reviewItemIndex];
  if (!item) return;
  if (treeEvalPreemptDrainActive) return;

  if (shouldDeferDispatch()) {
    reviewDispatchDeferCount++;
    reviewDispatchDeferTimer = setTimeout(sendNextItem, REVIEW_DISPATCH_DEFER_MS);
    return;
  }
  reviewDispatchDeferCount = 0;

  reviewDebugLog('[review-batch]', reviewItemIndex + 1, '/', reviewItemQueue.length,
    'nodeId:', item.nodeId, 'path:', item.nodePath, 'ply:', item.nodePly, 'gen:', reviewSearchGeneration);

  syncReviewProtocolThreadsBeforeDispatch();
  beginReviewSearch(item);
}










export function applyReviewDepthToActiveQueue(
  newDepth: number,
  opts: { source?: 'local' | 'channel' } = {},
): void {
  if (!Number.isInteger(newDepth) || newDepth < 12 || newDepth > 20) return;
  if (!isCurrentLeader) {
    if (opts.source !== 'channel') postReviewChannelMessage({ type: 'review-depth', tabId, depth: newDepth });
    return;
  }

  const activeEntry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  const needsRunUpdate = activeReviewRun !== null && activeReviewRun.reviewDepth !== newDepth;
  const needsQueueUpdate = queue.some(entry => entry.status !== 'complete' && entry.depth !== newDepth);
  const needsActiveDepthUpdate = activeEntry?.status === 'analyzing' && reviewActiveDepth !== newDepth;
  if (!needsRunUpdate && !needsQueueUpdate && !needsActiveDepthUpdate) return;

  const oldRunDepth = activeReviewRun?.reviewDepth ?? null;
  if (activeReviewRun) {
    activeReviewRun.reviewDepth = newDepth;
    activeReviewRun.updatedAt = Date.now();
    persistActiveReviewRun();
  }

  let retargetedEntries = 0;
  for (const entry of queue) {
    if (entry.status === 'complete') continue;
    const oldDepth = entry.depth;
    if (oldDepth === newDepth) continue;
    entry.depth = newDepth;
    migrateFailedGameStateDepth(entry, oldDepth, newDepth);
    persistManifestEntry(entry);
    retargetedEntries++;
  }

  let activeDepthDeferredToNextPosition = false;
  let activeDepthAppliedBeforeSearch = false;
  if (activeEntry?.status === 'analyzing') {
    if (reviewSearchActive) {
      // Do not stop/restart the same FEN here. UCI bestmove carries no FEN/depth, so a late
      // old-depth bestmove could be accepted under the replacement identity. Let this position
      // finish under its existing identity; onReviewBestmove applies entry.depth before next send.
      activeDepthDeferredToNextPosition = reviewActiveDepth !== newDepth;
    } else {
      reviewActiveDepth = newDepth;
      activeDepthAppliedBeforeSearch = true;
    }
    persistManifestEntry(activeEntry);
  }

  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'engine.reviewQueue',
    sourceTag: 'review-queue',
    message: 'review-depth-retargeted',
    metadata: {
      role: reviewDiagnosticRole(),
      oldRunDepth,
      newDepth,
      retargetedEntries,
      activeGameSafeId: activeEntry ? safeReviewGameId(activeEntry.game.id) : null,
      activePositionIndex: activeEntry ? reviewItemIndex : null,
      activeDepthDeferredToNextPosition,
      activeDepthAppliedBeforeSearch,
      generation: reviewSearchGeneration,
    },
    redactionClass: 'safe',
  });

  markReviewQueueProgress();
  notifyReviewQueueStateChanged();
}

// --- Finish a single game ---










function ensureReviewRunHygieneTracking(manifest: ReviewRunManifest): void {
  if (reviewRunHygieneRunId === manifest.runId) return;
  reviewRunHygieneRunId = manifest.runId;
  reviewRunHygienePositionsSinceBoundary = 0;
  reviewRunHygienePreviousBoundaryAt = Date.now();
}

function noteReviewRunHygieneGameComplete(manifest: ReviewRunManifest, entry: ReviewQueueEntry): void {
  ensureReviewRunHygieneTracking(manifest);
  reviewRunHygienePositionsSinceBoundary += Math.max(0, entry.done);
  ensureReviewRunVisibilitySampling(manifest);
  reviewRunVisibilityCompletedPositions += Math.max(0, entry.done);
}

type ReviewRunProgressDiagnosticReason = 'hygiene-boundary' | 'visibility-change';
type ReviewRunProgressState = 'active' | 'paused' | 'breaker-paused' | 'complete';

function ensureReviewRunVisibilitySampling(manifest: ReviewRunManifest): void {
  if (reviewRunVisibilitySampleRunId === manifest.runId) return;
  reviewRunVisibilitySampleRunId = manifest.runId;
  reviewRunVisibilitySampleAnchor = null;
  reviewRunVisibilityCompletedPositions = 0;
}

function reviewRunVisibilityState(): string {
  return typeof document !== 'undefined' && typeof document.visibilityState === 'string'
    ? document.visibilityState
    : 'visible';
}

function reviewRunProgressState(manifest: ReviewRunManifest): ReviewRunProgressState {
  if (manifest.lifecycleState === 'breaker-paused') return 'breaker-paused';
  if (queuePaused || manifest.lifecycleState === 'user-paused' || manifest.lifecycleState === 'hidden-suspended' || manifest.lifecycleState === 'interrupted-after-reload') {
    return 'paused';
  }
  if (manifest.lifecycleState === 'batch-complete' || manifest.lifecycleState === 'no-more-eligible-games' || manifest.lifecycleState === 'canceled') {
    return 'complete';
  }
  return 'active';
}

function reviewRunPositionsAnalyzedForVisibilitySample(manifest: ReviewRunManifest): number {
  ensureReviewRunVisibilitySampling(manifest);
  const activeEntry = activeQueueEntry();
  const activePositions = activeEntry && activeEntry.status === 'analyzing'
    ? Math.max(0, activeEntry.done)
    : 0;
  return reviewRunVisibilityCompletedPositions + activePositions;
}

function reviewRunAutoRetryActive(manifest: ReviewRunManifest, runState: ReviewRunProgressState): boolean {
  return manifest.autoRetryEnabled === true && runState === 'active';
}

function reviewRunUnattendedActive(manifest: ReviewRunManifest, runState: ReviewRunProgressState): boolean {
  return manifest.unattendedRunEnabled !== false && runState === 'active';
}

function recordReviewRunProgressVisibilityDiagnostic(
  manifest: ReviewRunManifest | null,
  reason: ReviewRunProgressDiagnosticReason,
): void {
  if (!manifest) return;
  ensureReviewRunVisibilitySampling(manifest);
  const runState = reviewRunProgressState(manifest);
  const sample = sampleReviewRunProgressByVisibility(
    reviewRunVisibilitySampleAnchor,
    reviewRunPositionsAnalyzedForVisibilitySample(manifest),
  );
  reviewRunVisibilitySampleAnchor = sample.anchor;

  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'engine.reviewQueue',
    sourceTag: 'review-queue',
    message: 'review-run-progress-visibility-sample',
    metadata: {
      role: reviewDiagnosticRole(),
      eventType: 'review-run-progress-visibility-sample',
      reason,
      safeRunId: safeReviewRunId(manifest.runId),
      visibilityState: reviewRunVisibilityState(),
      positionsSincePreviousSample: sample.positionsSincePreviousSample,
      elapsedSincePreviousSampleMs: sample.elapsedSincePreviousSampleMs,
      positionsPerMinute: sample.positionsPerMinute,
      autoRetryEnabled: manifest.autoRetryEnabled === true,
      autoRetryActive: reviewRunAutoRetryActive(manifest, runState),
      unattendedRunEnabled: manifest.unattendedRunEnabled !== false,
      unattendedRunActive: reviewRunUnattendedActive(manifest, runState),
      runState,
      lifecycleState: manifest.lifecycleState,
      paused: queuePaused,
      pauseReason: queuePaused ? queuePauseReason : null,
      breakerPaused: manifest.lifecycleState === 'breaker-paused',
    },
    redactionClass: 'safe',
  });
}

function reviewRunConsistencyIssueMetadata(issues: readonly ReviewRunManifestConsistencyIssue[]): Array<{
  code: string;
  count: number;
  safeGameIds: string[];
}> {
  return issues.map(issue => ({
    code: issue.code,
    count: issue.gameIds.length,
    safeGameIds: issue.gameIds.slice(0, 8).map(safeReviewGameId),
  }));
}

function reviewRunQueueIdsOutsideSource(manifest: ReviewRunManifest): string[] {
  const sourceIds = new Set(manifest.sourceGameIds);
  const outsideIds: string[] = [];
  const seen = new Set<string>();
  for (const entry of queue) {
    if (sourceIds.has(entry.game.id) || seen.has(entry.game.id)) continue;
    seen.add(entry.game.id);
    outsideIds.push(entry.game.id);
  }
  return outsideIds;
}

function runReviewRunHygieneCadence(manifest: ReviewRunManifest): void {
  const boundaryStartedAt = Date.now();
  ensureReviewRunHygieneTracking(manifest);

  const libraryCountBefore = _libraryGames.length;
  const refreshedLibrary = refreshReviewRunLibrarySnapshot();
  let boundaryManifest = activeReviewRun?.runId === manifest.runId ? activeReviewRun : manifest;

  const consistency = verifyReviewRunManifestConsistency(boundaryManifest);
  if (consistency.changed) {
    boundaryManifest = consistency.manifest;
    activeReviewRun = boundaryManifest;
    persistActiveReviewRun();
  }

  let breakerTrippedAtBoundary = false;
  if (reviewRunCircuitBreakerShouldTrip(boundaryManifest)) {
    boundaryManifest = withReviewRunBreakerTripped(boundaryManifest, 'consecutive-failures');
    activeReviewRun = boundaryManifest;
    haltReviewQueueForBreaker();
    persistActiveReviewRun();
    breakerTrippedAtBoundary = true;
  }

  const queueOutsideSourceIds = reviewRunQueueIdsOutsideSource(boundaryManifest);
  const positionsSinceLastBoundary = reviewRunHygienePositionsSinceBoundary;
  reviewRunHygienePositionsSinceBoundary = 0;

  const now = Date.now();
  const elapsedSincePreviousBoundaryMs = reviewRunHygienePreviousBoundaryAt === null
    ? null
    : Math.max(0, boundaryStartedAt - reviewRunHygienePreviousBoundaryAt);
  reviewRunHygienePreviousBoundaryAt = now;

  record({
    kind: 'engine',
    severity: consistency.issues.length > 0 || queueOutsideSourceIds.length > 0 || breakerTrippedAtBoundary
      ? Severity.Warn
      : Severity.Info,
    source: 'engine.reviewQueue',
    sourceTag: 'review-queue',
    message: 'review-run-hygiene-boundary',
    metadata: {
      role: reviewDiagnosticRole(),
      safeRunId: safeReviewRunId(boundaryManifest.runId),
      cadence: REVIEW_RUN_HYGIENE_CADENCE,
      cadenceIndex: Math.floor(boundaryManifest.completedGameIds.length / REVIEW_RUN_HYGIENE_CADENCE),
      completedCount: boundaryManifest.completedGameIds.length,
      boundaryDurationMs: Math.max(0, now - boundaryStartedAt),
      elapsedSincePreviousBoundaryMs,
      positionsSinceLastBoundary,
      consecutiveFailureCount: boundaryManifest.consecutiveFailureCount,
      breakerTrippedAtBoundary,
      breakerTrippedReason: boundaryManifest.breakerTrippedReason,
      manifestRepaired: consistency.changed,
      consistencyIssues: reviewRunConsistencyIssueMetadata(consistency.issues),
      queueOutsideSourceCount: queueOutsideSourceIds.length,
      queueOutsideSourceSafeGameIds: queueOutsideSourceIds.slice(0, 8).map(safeReviewGameId),
      sourceGameCount: boundaryManifest.sourceGameIds.length,
      libraryGameCountBefore: libraryCountBefore,
      libraryGameCountAfter: refreshedLibrary.length,
    },
    redactionClass: 'safe',
  });

  recordReviewRunProgressVisibilityDiagnostic(boundaryManifest, 'hygiene-boundary');

  if (breakerTrippedAtBoundary) notifyReviewQueueStateChanged();
}

function finishEntry(entry: ReviewQueueEntry): void {
  void finishEntryAfterDurableSave(entry);
}

async function finishEntryAfterDurableSave(entry: ReviewQueueEntry): Promise<void> {
  try {
    // Drop any pending throttled partial checkpoint for this entry — the 'complete'
    // write below immediately supersedes it, so flushing first would be wasted work
    // and would needlessly delay the complete write.
    if (checkpointPendingEntry === entry) cancelReviewCheckpoint();

    // Entry is still resident until the strict IDB write succeeds.
    const ctrl  = entry.ctrl!;
    const cache = entry.cache!;
    const userColor = _getUserColor(entry.game);
    const moments = detectMissedMoments(ctrl.mainline, cache, userColor);
    const summary = computeAnalysisSummary(ctrl.mainline, cache);
    const completionDepth = entryMinimumDepth(entry);





    const reviewEngine = buildReviewEngineMetadata(reviewProtocol.engineName, completionDepth, {
      requestedDepth: entry.depth,
      profileId:      entry.feed,
      movetimeMs:     entry.feed === 'bulk' ? (bulkReviewMovetime ?? null) : null,
    });

    await saveAnalysisToIdbStrict(
      'complete',
      entry.game.id,
      buildAnalysisNodes(ctrl.mainline, p => cache.get(p)),
      completionDepth,
      reviewEngine,
    );

    // The user may have cancelled the queue while the final IDB write was in flight.
    if (activeIndex < 0 || queue[activeIndex] !== entry) return;

    entry.status = 'complete';
    markReviewQueueProgress(true);
    markActiveReviewRunGameComplete(entry.game.id);
    if (activeReviewRun) noteReviewRunHygieneGameComplete(activeReviewRun, entry);
    if (activeReviewRun && isReviewRunHygieneCadenceBoundary(activeReviewRun.completedGameIds.length)) {
      runReviewRunHygieneCadence(activeReviewRun);
    }
    clearFailedGameState(entry.game.id, entry.depth);
    recordReviewGameComplete(entry);
    captureMemorySnapshot('post-review');
    _analyzedGameIds.add(entry.game.id);
    setMissedMoments(entry.game.id, moments);
    if (moments.length > 0) _missedTacticGameIds.add(entry.game.id);
    else _missedTacticGameIds.delete(entry.game.id);
    if (summary) {
      _analyzedGameAccuracy.set(entry.game.id, {
        white: summary.white.accuracy,
        black: summary.black.accuracy,
      });
    }
    _setReviewEngineMetadata(entry.game.id, reviewEngine);

    // Write the game summary from the entry's own ctrl/cache/moments before they are evicted
    // below. Skip cleanly when user color is unresolvable, matching one-off review behavior.
    if (userColor) {
      const gameSummary = extractGameSummary(
        entry.game,
        ctrl.mainline,
        p => cache.get(p),
        userColor,
        moments,
        completionDepth,
      );
      void saveGameSummary(gameSummary);
      invalidateSummariesCache();
    }

    // Results are now durably saved (and resumable per T05/T06), so the heavy
    // per-entry AnalyseCtrl/eval-cache objects are no longer needed in memory —
    // release them so long bulk runs don't retain hundreds of full move trees.
    entry.ctrl  = null;
    entry.cache = null;
    entry.serializedNodes = null;
    recordReviewCtrlCacheEvicted(entry);

    // Terminal state: the full analysis is now durably saved in analysis-library,
    // so the lightweight queue manifest entry is no longer needed.
    void clearReviewQueueManifestEntry(entry.game.id);

    reviewDebugLog('[review-engine] game complete:', entry.game.id);
    notifyReviewQueueStateChanged();
    advanceQueue();
  } catch (error) {
    if (activeIndex >= 0 && queue[activeIndex] === entry) {
      markActiveEntryErrored('review completion save failed', error);
    } else {
      console.error('[review-engine] completion save failed after queue state changed', error);
    }
  }
}

// --- Start analysis for a queue entry ---

async function startEntryBatch(entry: ReviewQueueEntry): Promise<void> {
  try {
    // entry is always 'pending'/'analyzing' here, never 'complete' — ctrl/cache
    // have not been evicted yet. Build them now if this entry was enqueued
    // lazily (LAZY_BUILD_THRESHOLD) and hasn't entered the analyzing slot before.
    ensureEntryBuilt(entry);
    const ctrl  = entry.ctrl!;
    const cache = entry.cache!;

    // Build the list of positions to analyze (skip root node at index 0).
    const items: ReviewBatchItem[] = [];
    let path     = '';
    let prevPath = '';
    for (let i = 0; i < ctrl.mainline.length; i++) {
      const node = ctrl.mainline[i]!;
      prevPath = path;
      if (i > 0) path += node.id;
      if (i > 0 && isTerminalReviewFen(node.fen)) {
        reviewDebugLog('[review-engine] skipping terminal review position', {
          gameId: entry.game.id,
          nodePly: node.ply,
        });
        continue;
      }
      if (!cache.has(path)) {
        items.push({
          nodeId:     node.id,
          nodePly:    node.ply,
          nodePath:   path,
          parentPath: prevPath,
          fen:        node.fen,
          position:   contextFromNodeList(ctrl.mainline.slice(0, i + 1), 'game-review-background', path),
        });
      }
    }

    entry.total = ctrl.mainline.length > 1 ? ctrl.mainline.length - 1 : 0;
    recordReviewGameStarted(entry);

    if (items.length === 0) {
      finishEntry(entry);
      return;
    }

    reviewItemQueue   = items;
    reviewItemIndex   = 0;
    reviewCurrentEval = {};
    reviewMismatchRetryIndex = -1;
    reviewMismatchRetryCount = 0;
    reviewActiveDepth = entry.depth;

    // Ensure engine is ready before sending first position.
    if (!reviewEngineReady) {
      // initReviewEngine readyok handler will call sendNextItem when ready.
      return;
    }

    sendNextItem();
  } catch (error) {
    markActiveEntryErrored(`failed to start review batch for game ${entry.game.id}`, error);
  }
}

// --- Queue advance ---

function advanceQueue(): void {
  if (queuePaused) return;
  // Observer tabs never drive the queue themselves — they only mirror
  // progress. Wake the real leader instead (no-op if none is currently open;
  // the manifest-persisted 'pending' entries will be picked up whenever a
  // leader tab is open and polls/claims).
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'wake', tabId });
    return;
  }

  const nextIndex = queue.findIndex(e => e.status === 'pending');
  if (nextIndex < 0) {
    activeIndex = -1;
    resetReviewBatchElapsed();



    void autoContinueReviewRun();
    return;
  }

  setActiveReviewRunState('running');
  ensureReviewBatchElapsedStarted();
  markReviewQueueProgress();
  activeIndex = nextIndex;
  const entry = queue[activeIndex]!;
  entry.status = 'analyzing';
  persistManifestEntry(entry);
  void startEntryBatch(entry);
}

// Opaque wrapper (not a `m.lifecycleState === 'canceled'` inline check) so
// TypeScript's control-flow narrowing does not treat a second call as
// statically impossible after an earlier one — `activeReviewRun` is a mutable
// module-level binding that can legitimately change value across an `await`,
// which plain narrowing can't see through.
function reviewRunIsCanceled(manifest: ReviewRunManifest | null): boolean {
  return manifest !== null && manifest.lifecycleState === 'canceled';
}










async function autoContinueReviewRun(): Promise<void> {
  if (!activeReviewRun) {
    setActiveReviewRunState(queue.length > 0 ? 'batch-complete' : 'no-more-eligible-games');
    syncReviewUnattendedWakeLock();
    notifyReviewQueueStateChanged();
    return;
  }
  // Nothing to continue if Pause/Cancel already landed — let that state stand.
  if (queuePaused || reviewRunIsCanceled(activeReviewRun)) return;

  const runId = activeReviewRun.runId;
  const result = await queueNextReviewRunBatch(_libraryGames);
  if (result === 'queued' || result === 'no-more-eligible-games') {
    // 'queued' already resumed advanceQueue() via enqueueBulkReviewAsLeader;
    // 'no-more-eligible-games' already set its own terminal state. Either way
    // queueNextReviewRunBatch() owns the resulting state/notification.
    return;
  }
  // result === 'no-run': only reachable here if Pause/Cancel/a new run raced
  // with the async lookup above. Don't clobber whatever state that left.
  if (queuePaused || !activeReviewRun || activeReviewRun.runId !== runId || reviewRunIsCanceled(activeReviewRun)) {
    return;
  }
  setActiveReviewRunState('no-more-eligible-games');
  syncReviewUnattendedWakeLock();
  notifyReviewQueueStateChanged();
}

// --- Public API ---

async function prepareReviewIntentTakeover(ownerUnavailable: boolean): Promise<boolean> {
  if (isCurrentLeader) return true;
  if (!ownerUnavailable) return false;
  becomeLeader(true, { resumeManifestAfterTakeover: false });
  if (_libraryGames.length > 0) await resumeReviewQueueFromManifest(_libraryGames);
  return isCurrentLeader;
}

function resumeReloadedQueueAfterReviewIntent(): void {
  if (queuePaused && queuePauseReason === 'reload') resumeBulkReview();
}

function runAfterReviewIntentTakeover(
  ownerUnavailable: boolean,
  runAsLeader: () => void,
  runAsObserver: () => void,
): void {
  void (async () => {
    try {
      await prepareReviewIntentTakeover(ownerUnavailable);
    } catch (error) {
      console.error('[review-queue] failed to prepare review-intent takeover', error);
    }
    if (isCurrentLeader) {
      runAsLeader();
      resumeReloadedQueueAfterReviewIntent();
    } else {
      runAsObserver();
    }
  })();
}

function enqueueBulkReviewAsLeader(
  orderedGames: ImportedGame[],
  entryDepth: number,
  sourceContext?: ReviewRunSourceContext,
): void {
  ensureActiveReviewRun(orderedGames, entryDepth, sourceContext);
  markReviewQueueProgress();
  const lazy = orderedGames.length > LAZY_BUILD_THRESHOLD;
  reviewDebugLog('[reviewQueue] enqueueBulkReview called — games:', orderedGames.map(g => g.id), 'queue len:', queue.length, 'activeIndex:', activeIndex, 'engineInitStarted:', reviewEngineInitStarted, 'depth:', entryDepth, 'lazy:', lazy);
  // Set when a requested game already has a 'pending' queue entry left behind by an
  // interrupted bulk run (reload/crash — T05 manifest resume) while the queue sits
  // paused with pauseReason 'reload'. Without this, a re-review request for exactly
  // that game silently no-ops below (the entry is "already queued", so the loop just
  // `continue`s) and the queue never unpauses — the game's partial analysis-library
  // record can never reach 'complete' (BUG-2026-07-05-001 / F-6 regeneration path).
  let stalledReloadEntryNeedsResume = false;
  for (const game of orderedGames) {
    // Skip already analyzed games.
    reviewDebugLog('[reviewQueue]  game', game.id, '— alreadyAnalyzed:', _analyzedGameIds.has(game.id), 'alreadyQueued:', queue.some(e => e.game.id === game.id));
    if (_analyzedGameIds.has(game.id)) continue;
    clearFailedGameState(game.id, entryDepth);

    // Allow re-queuing errored games: remove the stale error entry first.
    const existingIdx = queue.findIndex(e => e.game.id === game.id);
    if (existingIdx >= 0) {
      const existing = queue[existingIdx]!;
      if (existing.status === 'error') {
        queue.splice(existingIdx, 1);
        if (activeIndex > existingIdx) activeIndex--;
      } else if (reviewQueueEntryStalledByReloadPause(existing.status, queuePaused, queuePauseReason)) {
        stalledReloadEntryNeedsResume = true;
        continue;
      } else {
        // Already pending/analyzing/complete — skip.
        continue;
      }
    }

    // Above LAZY_BUILD_THRESHOLD, defer the AnalyseCtrl/eval-cache build until
    // the game reaches the analyzing slot (see ensureEntryBuilt/startEntryBatch)
    // so a large enqueue doesn't block on hundreds of tree builds up front.
    // `total` is a cheap PGN-based estimate until then; startEntryBatch
    // overwrites it with the exact mainline length once built.
    const ctrl  = lazy ? null : new AnalyseCtrl(pgnToTree(game.pgn));
    const total = ctrl
      ? (ctrl.mainline.length > 1 ? ctrl.mainline.length - 1 : 0)
      : estimatePlyCountFromPgn(game.pgn);
    const entry: ReviewQueueEntry = {
      game,
      ctrl,
      cache:  lazy ? null : new Map<string, PositionEval>(),
      serializedNodes: lazy ? null : {},
      done:   0,
      total,
      status: 'pending',
      depth:  entryDepth,
      feed:   'bulk',
    };
    queue.push(entry);
    persistManifestEntry(entry);
    recordReviewGameEnqueued(entry.game.id, queue.length - 1);
  }

  // Init engine lazily on first enqueue (skip if already failed).
  if (!reviewEngineInitStarted && !reviewEngineFailed) {
    void initReviewEngine('/stockfish-web');
  }

  if (stalledReloadEntryNeedsResume) {
    // Explicit re-review request for a game stuck behind a reload-pause: resume the
    // queue instead of leaving the pause in place (never overrides an explicit user
    // Pause or a hidden-tab suspend — those use different pauseReason values).
    resumeBulkReview();
  } else if (activeIndex < 0 && !reviewEngineFailed) {
    // Start processing if nothing is running (skip if engine failed).
    advanceQueue();
  }
}

function appendBulkReviewRunSourceAsLeader(
  orderedGames: ImportedGame[],
  entryDepth: number,
  sourceContext?: ReviewRunSourceContext,
): void {
  const canAppendToCurrentRun = activeReviewRunCanAcceptSourceAppend();
  if (!activeReviewRun || !canAppendToCurrentRun) {
    if (activeReviewRun && !canAppendToCurrentRun) activeReviewRun = null;
    enqueueBulkReviewAsLeader(orderedGames, entryDepth, sourceContext);
    return;
  }
  appendActiveReviewRunSourceOnly(orderedGames, sourceContext);
}

export function appendBulkReviewRunSource(games: ImportedGame[], depth?: number, sourceContext?: ReviewRunSourceContext): void {
  preemptTreeEvalLease('bulk-review-source-appended');
  const entryDepth = depth ?? bulkReviewDepth;
  const orderedGames = reviewGamesInNewestFirstOrder(games);
  if (!isCurrentLeader) {
    const ownerUnavailable = isReviewOwnerUnavailableFromToken();
    const runAsObserver = (): void => {
      postReviewChannelMessage({
        type: 'append-run-source',
        tabId,
        games: orderedGames,
        depth: entryDepth,
        ...(sourceContext ? { sourceContext } : {}),
      });
      postReviewChannelMessage({ type: 'wake', tabId });
    };
    if (ownerUnavailable) {
      runAfterReviewIntentTakeover(ownerUnavailable, () => {
        appendBulkReviewRunSourceAsLeader(orderedGames, entryDepth, sourceContext);
      }, runAsObserver);
      return;
    }
    runAsObserver();
    return;
  }
  appendBulkReviewRunSourceAsLeader(orderedGames, entryDepth, sourceContext);
}

export function enqueueBulkReview(games: ImportedGame[], depth?: number, sourceContext?: ReviewRunSourceContext): void {
  preemptTreeEvalLease('bulk-review-enqueued');
  const entryDepth = depth ?? bulkReviewDepth;
  const orderedGames = reviewGamesInNewestFirstOrder(games);
  if (!isCurrentLeader) {
    const ownerUnavailable = isReviewOwnerUnavailableFromToken();
    const runAsObserver = (): void => {
      // Observer tabs never build AnalyseCtrl/eval-cache trees for entries they
      // will never analyze — write the lightweight manifest record only and
      // wake whichever tab is the leader to pick the work up.
      enqueueObserverManifestOnly(orderedGames, entryDepth);
    };
    if (ownerUnavailable) {
      runAfterReviewIntentTakeover(ownerUnavailable, () => {
        enqueueBulkReviewAsLeader(orderedGames, entryDepth, sourceContext);
      }, runAsObserver);
      return;
    }
    runAsObserver();
    return;
  }
  enqueueBulkReviewAsLeader(orderedGames, entryDepth, sourceContext);
}

/**
 * Add games to the front of the pending queue so they are reviewed next,
 * immediately after any currently-analyzing entry finishes.
 * Games already analyzed or already in the queue are silently skipped.
 */
function enqueueAtFrontAsLeader(orderedGames: ImportedGame[], entryDepth: number, feed: 'bulk' | 'one-off'): void {
  ensureActiveReviewRun(orderedGames, entryDepth);
  const lazy = orderedGames.length > LAZY_BUILD_THRESHOLD;
  const newEntries: ReviewQueueEntry[] = [];
  // Existing 'pending' entries left behind by an interrupted bulk run (reload/crash —
  // T05 manifest resume) that a "review next" request just asked to jump the queue.
  // These are spliced out below and reinserted at the front alongside newEntries so the
  // explicit request is honored instead of silently no-op'ing (BUG-2026-07-05-001 / F-6).
  const resumedStaleEntries: ReviewQueueEntry[] = [];
  for (const game of orderedGames) {
    if (_analyzedGameIds.has(game.id)) continue;
    clearFailedGameState(game.id, entryDepth);

    // Allow re-queuing errored games from the front: remove the stale error entry first.
    const existingIdx = queue.findIndex(e => e.game.id === game.id);
    if (existingIdx >= 0) {
      const existing = queue[existingIdx]!;
      if (existing.status === 'error') {
        queue.splice(existingIdx, 1);
        if (activeIndex > existingIdx) activeIndex--;
      } else if (reviewQueueEntryStalledByReloadPause(existing.status, queuePaused, queuePauseReason)) {
        queue.splice(existingIdx, 1);
        if (activeIndex > existingIdx) activeIndex--;
        resumedStaleEntries.push(existing);
        continue;
      } else {
        // Already pending/analyzing/complete — skip.
        continue;
      }
    }

    // See enqueueBulkReview: defer ctrl/cache build above LAZY_BUILD_THRESHOLD.
    const ctrl  = lazy ? null : new AnalyseCtrl(pgnToTree(game.pgn));
    const total = ctrl
      ? (ctrl.mainline.length > 1 ? ctrl.mainline.length - 1 : 0)
      : estimatePlyCountFromPgn(game.pgn);
    newEntries.push({
      game,
      ctrl,
      cache:  lazy ? null : new Map<string, PositionEval>(),
      serializedNodes: lazy ? null : {},
      done:   0,
      total,
      status: 'pending',
      depth:  entryDepth,
      feed,
    });
  }

  if (newEntries.length === 0 && resumedStaleEntries.length === 0) return;

  // Insert immediately after the active entry so these are next in line.
  const insertAt = activeIndex >= 0 ? activeIndex + 1 : 0;
  const entriesToInsert = [...resumedStaleEntries, ...newEntries];
  queue.splice(insertAt, 0, ...entriesToInsert);
  for (let i = 0; i < entriesToInsert.length; i++) {
    const entry = entriesToInsert[i]!;
    persistManifestEntry(entry);
    recordReviewGameEnqueued(entry.game.id, insertAt + i);
  }

  if (!reviewEngineInitStarted && !reviewEngineFailed) {
    void initReviewEngine('/stockfish-web');
  }

  if (resumedStaleEntries.length > 0) {
    // Explicit re-review request for a game stuck behind a reload-pause: resume the
    // queue instead of leaving the pause in place (never overrides an explicit user
    // Pause or a hidden-tab suspend — those use different pauseReason values).
    resumeBulkReview();
  } else if (activeIndex < 0 && !reviewEngineFailed) {
    advanceQueue();
  }
}







export function enqueueAtFront(games: ImportedGame[], depth?: number, feed: 'bulk' | 'one-off' = 'one-off'): void {
  preemptTreeEvalLease('bulk-review-enqueued');
  const entryDepth = depth ?? bulkReviewDepth;
  const orderedGames = reviewGamesInNewestFirstOrder(games);
  if (!isCurrentLeader) {
    const ownerUnavailable = isReviewOwnerUnavailableFromToken();
    const runAsObserver = (): void => {
      // See enqueueBulkReview: observer tabs write the manifest only and let
      // the leader build the real entries. Front-of-queue ordering is a
      // leader-side scheduling concern, so these still land in the queue but
      // are not guaranteed to jump ahead of entries the leader already has.
      enqueueObserverManifestOnly(orderedGames, entryDepth);
    };
    if (ownerUnavailable) {
      runAfterReviewIntentTakeover(ownerUnavailable, () => {
        enqueueAtFrontAsLeader(orderedGames, entryDepth, feed);
      }, runAsObserver);
      return;
    }
    runAsObserver();
    return;
  }
  enqueueAtFrontAsLeader(orderedGames, entryDepth, feed);
}

/**
 * Resume an interrupted bulk review run on app startup.
 * Reads the T05 manifest (persisted on every enqueue/status transition), rebuilds a
 * `ReviewQueueEntry` for each manifest record whose game still exists in the library,
 * and rehydrates each entry's eval `cache` from any existing `analysis-library` partial
 * record so already-analyzed positions are skipped (startEntryBatch only re-queues
 * positions missing from `entry.cache`).
 *
 * - Manifest entries for games no longer in `games` (deleted between sessions) are dropped
 *   and their stale manifest record is cleared.
 * - Manifest entries whose game is already `complete` in analysis-library are dropped —
 *   that game finished between the last manifest write and the crash/reload — and the
 *   manifest record is cleared so it doesn't reappear on the next resume.
 * - `error` entries are rebuilt in `error` state (consistent with resetErroredGame's manual
 *   re-queue path) rather than auto-retried, so a previously-failing game doesn't silently
 *   retry-loop on every reload.
 * - Per-entry `depth` is read from the manifest, not the current global `reviewDepth`.
 */
export async function resumeReviewQueueFromManifest(games: ImportedGame[]): Promise<void> {
  setLibraryGamesForReviewQueue(games);
  const loadedRun = await loadLatestReviewRunManifest();
  activeReviewRun = loadedRun ? normalizeReviewRunManifest(loadedRun) : null;
  const failureRecords = await loadReviewFailureRecords();
  failedGameAttempts = new Map(failureRecords.map(record => [record.key, {
    gameId:       record.gameId,
    depth:        record.depth,
    attempts:     record.attempts,
    retrying:     false,
    skipped:      record.skipped === true,
    lastFailedAt: record.lastFailedAt,
    ...(record.skippedAt !== undefined ? { skippedAt: record.skippedAt } : {}),
  } satisfies FailedGameState]));
  hydrateActiveReviewRunFailureCounts();
  // Observer tabs must not rebuild full AnalyseCtrl/eval-cache trees (heavy,
  // and pointless — they never analyze). Mirror the manifest for display only;
  // if this tab later wins leadership, takeOverAsLeader() performs the real
  // (heavy) resume at that point.
  if (!isCurrentLeader) {
    await mirrorQueueFromManifest();
    notifyReviewQueueStateChanged();
    return;
  }

  const { entries: manifest, errorDetail } = await loadReviewQueueManifestWithDiagnostics();
  if (errorDetail) recordReviewManifestReadFailure(errorDetail, true);
  if (manifest.length === 0) return;

  const gamesById = new Map(games.map(g => [g.id, g]));
  const rebuilt: ReviewQueueEntry[] = [];

  for (const record of sortByActiveBatchOrder(manifest, record => record.gameId)) {
    const game = gamesById.get(record.gameId);
    if (!game) {
      // Game deleted from the library between sessions — drop it out of the resumed queue.
      void clearReviewQueueManifestEntry(record.gameId);
      continue;
    }

    const stored = await loadAnalysisFromIdb(record.gameId);
    if (storedAnalysisMatchesReviewDepth(stored, record.minimumDepthUsed ?? record.depth)) {
      // Finished between the last manifest write and the interruption — nothing to resume.
      _analyzedGameIds.add(record.gameId);
      void clearReviewQueueManifestEntry(record.gameId);
      continue;
    }

    const ctrl  = new AnalyseCtrl(pgnToTree(game.pgn));
    const cache = new Map<string, PositionEval>();




    const serializedNodes: Record<string, StoredNodeEntry> = stored ? { ...stored.nodes } : {};
    const minimumDepthUsed = record.minimumDepthUsed ?? minDepthFromStoredNodes(serializedNodes);
    // Rehydrate already-analyzed positions from the existing partial record (if any) so
    // startEntryBatch's `!entry.cache.has(path)` skip logic resumes mid-game, not from ply 0.
    if (stored) {
      for (const entry of Object.values(stored.nodes)) {
        if (!entry.path) continue; // pre-migration node.id-keyed record — skip
        const ev: PositionEval = {};
        if (entry.cp    !== undefined) ev.cp    = entry.cp;
        if (entry.mate  !== undefined) ev.mate  = entry.mate;
        if (entry.best  !== undefined) ev.best  = entry.best;
        if (entry.loss  !== undefined) ev.loss  = entry.loss;
        if (entry.delta !== undefined) ev.delta = entry.delta;
        if (entry.depth !== undefined) ev.depth = entry.depth;
        if (entry.bestLine !== undefined) ev.moves = entry.bestLine;
        cache.set(entry.path, ev);
      }
    }
    if (record.status === 'analyzing') {
      recordReviewManifestRecoveryActivated(record.gameId, stored ? cache.size : null);
    }

    const total = ctrl.mainline.length > 1 ? ctrl.mainline.length - 1 : 0;
    rebuilt.push({
      game,
      ctrl,
      cache,
      serializedNodes,
      done:   cache.size,
      total,
      // analyzing entries resume as pending — the in-flight position was lost on reload,
      // advanceQueue/startEntryBatch will pick the game back up from its cache.
      status: record.status === 'analyzing' ? 'pending' : record.status,
      depth:  record.depth,



      feed: 'bulk',
      ...(minimumDepthUsed !== undefined ? { minimumDepthUsed } : {}),
    });
  }

  if (rebuilt.length === 0) return;

  queue = rebuilt;
  activeIndex = -1;
  hiddenSuspendedOwnerTabId = null;
  for (const entry of rebuilt) persistManifestEntry(entry);
  if (isReviewUnattendedRunEnabled()) {
    queuePaused = false;
    queuePauseReason = null;
    setActiveReviewRunState('running');
    if (!reviewEngineInitStarted && !reviewEngineFailed) {
      void initReviewEngine('/stockfish-web');
    }
    if (!scheduleNextRetryableFailedGame()) advanceQueue();
    syncReviewUnattendedWakeLock();
    notifyReviewQueueStateChanged();
    return;
  }
  queuePaused = true;
  queuePauseReason = 'reload';
  markReviewPauseNotice('interrupted-after-reload', 'Review was interrupted after reload and needs Resume to continue.');
  setActiveReviewRunState('interrupted-after-reload');
  notifyReviewQueueStateChanged();
}

export function isBulkRunning(): boolean {
  if (queuePaused) return false;
  return failedGameRetryTimer !== null || queue.some(e => e.status === 'pending' || e.status === 'analyzing');
}

export function isBulkPaused(): boolean {
  return queuePaused && (hasRetryableFailedGame() || queue.some(e => e.status === 'pending' || e.status === 'analyzing'));
}

function stopActiveReviewSearchForDataManagement(): void {
  clearWatchdog();
  clearDispatchDefer();
  clearDispatchBarrier();
  clearTreeEvalPreemptDrain();
  if (reviewSearchActive) {
    reviewSearchGeneration++;
    searchOwnerMarkAllStale(reviewSearchOwner);
    reviewProtocol.stop();
    reviewSearchActive = false;
    invalidateReviewSearchIdentity();
  }
  reviewCurrentEval = {};
  reviewItemQueue = [];
  reviewItemIndex = 0;
}

export async function fenceReviewQueueForDataManagement(
  detail: DataManagementLocalChangeDetail,
): Promise<DataManagementFenceResult> {
  const owner = 'engine.reviewQueue';
  if (!detail.domains.includes('review') && !detail.domains.includes('games')) return { owner };

  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'data-management-fence', tabId, detail });
    return { owner, forwarded: true, message: 'Forwarded data-management fence to review leader.' };
  }

  const affectedEntries = queue.filter(entry => dataManagementScopeMatchesGameId(detail.scope, entry.game.id));
  if (affectedEntries.length === 0) return { owner, stopped: 0, removed: 0 };

  if (detail.scope.allReview || detail.scope.allGames) {
    const removed = queue.length;
    const stopped = isBulkRunning() || reviewSearchActive ? 1 : 0;
    cancelBulkReview();
    return { owner, stopped, removed };
  }

  const affectedIds = new Set(affectedEntries.map(entry => entry.game.id));
  const activeEntry = activeQueueEntry();
  const stopped = activeEntry && affectedIds.has(activeEntry.game.id) ? 1 : 0;

  if (stopped) stopActiveReviewSearchForDataManagement();
  if (checkpointPendingEntry && affectedIds.has(checkpointPendingEntry.game.id)) cancelReviewCheckpoint();
  if (failedGameRetryEntry && affectedIds.has(failedGameRetryEntry.game.id)) clearFailedGameRetryTimer();

  for (const entry of affectedEntries) {
    clearFailedGameState(entry.game.id, entry.depth);
    if (activeReviewRun) activeReviewRun = withReviewRunGameSkippedFromActiveBatch(activeReviewRun, entry.game.id);
    void clearReviewQueueManifestEntry(entry.game.id);
  }
  if (activeReviewRun) persistActiveReviewRun();

  queue = queue.filter(entry => !affectedIds.has(entry.game.id));
  activeIndex = queue.findIndex(entry => entry.status === 'analyzing');
  if (queue.length === 0) {
    queuePaused = false;
    queuePauseReason = null;
    resetReviewBatchElapsed();
    setActiveReviewRunState('batch-complete');
  } else if (stopped && activeIndex < 0 && !queuePaused && !reviewEngineFailed) {
    advanceQueue();
  }

  notifyReviewQueueStateChanged();
  return { owner, stopped, removed: affectedEntries.length };
}

export function cancelBulkReview(): void {
  // Observer tabs hold no engine/search state to tear down (their queue is a
  // read-only manifest mirror) — wake the leader to perform the actual cancel
  // instead of clearing the shared manifest out from under it.
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'cancel', tabId });
    return;
  }
  clearWatchdog();
  clearDispatchDefer();
  clearDispatchBarrier();
  clearTreeEvalPreemptDrain();
  clearFailedGameRetryTimer();
  reviewWatchdogRetries = 0;
  reviewWatchdogTriggeredAt = null;
  if (reviewSearchActive) {
    // Invalidate any in-flight search before stopping so a late bestmove is discarded.
    reviewSearchGeneration++;
    searchOwnerMarkAllStale(reviewSearchOwner);
    reviewProtocol.stop();
    reviewSearchActive = false;
    invalidateReviewSearchIdentity();
  }
  // The whole manifest is being cleared below, so drop rather than flush any
  // pending checkpoint — writing it would just be immediately wiped out.
  cancelReviewCheckpoint();
  recordReviewQueueLifecycleEvent('review-queue-cleared', Severity.Info);
  queue       = [];
  activeIndex = -1;
  queuePaused = false;
  queuePauseReason = null;
  hiddenSuspendedOwnerTabId = null;
  reviewStorageHealth = 'ok';
  setActiveReviewRunState('canceled');
  syncReviewUnattendedWakeLock();
  resetReviewBatchElapsed();
  void clearReviewQueueManifest();
  notifyReviewQueueStateChanged();
}

export function pauseBulkReview(): void {
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'pause', tabId });
    return;
  }
  if (!isBulkRunning() && failedGameRetryTimer === null) return;
  queuePaused = true;
  queuePauseReason = 'user';
  hiddenSuspendedOwnerTabId = null;
  markReviewPauseNotice('user-paused', 'Review was paused by the user.');
  setActiveReviewRunState('user-paused');
  clearWatchdog();
  clearDispatchDefer();
  clearDispatchBarrier();
  clearTreeEvalPreemptDrain();
  clearFailedGameRetryTimer();
  reviewWatchdogRetries = 0;
  reviewWatchdogTriggeredAt = null;
  if (reviewSearchActive) {
    // Invalidate any in-flight search before stopping so a late bestmove is discarded.
    reviewSearchGeneration++;
    searchOwnerMarkAllStale(reviewSearchOwner);
    reviewProtocol.stop();
    reviewSearchActive = false;
    invalidateReviewSearchIdentity();
  }
  // Force a checkpoint write now — the queue is going idle, so don't leave the
  // most recently analyzed positions sitting in the throttle window unsaved.
  flushReviewCheckpoint();
  // The queue is idle until resumeBulkReview; elapsed time restarts on resume.
  syncReviewUnattendedWakeLock();
  resetReviewBatchElapsed();
  notifyReviewQueueStateChanged();
}

export function suspendReviewQueueForLfym(gameId: string | null): boolean {
  const active = activeQueueEntry();
  if (!gameId || !active || active.game.id !== gameId) return false;
  if (!isBulkRunning() && !isBulkPaused()) return false;
  pauseBulkReview();
  return true;
}

export function suspendBulkReviewForHiddenTab(): void {
  if (!isCurrentLeader) return;
  if (!isBulkRunning() && failedGameRetryTimer === null) return;
  queuePaused = true;
  queuePauseReason = 'hidden';
  hiddenSuspendedOwnerTabId = tabId;
  markReviewPauseNotice('hidden-suspended', 'Unattended run mode is off, so review suspended while the tab was hidden.');
  setActiveReviewRunState('hidden-suspended');
  clearWatchdog();
  clearDispatchDefer();
  clearDispatchBarrier();
  clearTreeEvalPreemptDrain();
  clearFailedGameRetryTimer();
  reviewWatchdogRetries = 0;
  reviewWatchdogTriggeredAt = null;
  if (reviewSearchActive) {
    reviewSearchGeneration++;
    searchOwnerMarkAllStale(reviewSearchOwner);
    reviewProtocol.stop();
    reviewSearchActive = false;
    invalidateReviewSearchIdentity();
  }
  flushReviewCheckpoint();
  syncReviewUnattendedWakeLock();
  resetReviewBatchElapsed();
  notifyReviewQueueStateChanged();
}

export function resumeBulkReview(): void {
  preemptTreeEvalLease('bulk-review-resumed');
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'resume', tabId });
    return;
  }
  if (!queuePaused) return;
  queuePaused = false;
  queuePauseReason = null;
  hiddenSuspendedOwnerTabId = null;
  setActiveReviewRunState('running');
  ensureReviewBatchElapsedStarted();
  if (!reviewEngineInitStarted && !reviewEngineFailed) {
    void initReviewEngine('/stockfish-web');
  }
  // Resume the active entry if one was mid-analysis when paused.
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (entry && entry.status === 'analyzing' && reviewItemIndex < reviewItemQueue.length) {
    sendNextItem();
  } else if (scheduleNextRetryableFailedGame()) {
    // Retry resumes after the normal controlled backoff instead of immediately
    // hammering a game that was already failing.
  } else {
    advanceQueue();
  }
  syncReviewUnattendedWakeLock();
  notifyReviewQueueStateChanged();
}

export function canResumeHiddenSuspendedReviewInThisTab(): boolean {
  return isCurrentLeader
    && queuePaused
    && queuePauseReason === 'hidden'
    && hiddenSuspendedOwnerTabId === tabId
    && (hasRetryableFailedGame() || queue.some(e => e.status === 'pending' || e.status === 'analyzing'));
}

export function resumeHiddenSuspendedReviewInThisTab(): void {
  if (!canResumeHiddenSuspendedReviewInThisTab()) return;
  resumeBulkReview();
}

export function resumeUnattendedReviewInThisTab(): void {
  if (!isCurrentLeader || !isReviewUnattendedRunEnabled() || reviewEngineFailed) return;
  if (queuePaused) {
    if (queuePauseReason === 'hidden' || queuePauseReason === 'reload') resumeBulkReview();
    return;
  }
  if (!reviewEngineInitStarted) {
    void initReviewEngine('/stockfish-web');
  }
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (
    entry?.status === 'analyzing'
    && !reviewSearchActive
    && reviewDispatchDeferTimer === undefined
    && !reviewDispatchBarrierWaiting
    && reviewItemIndex < reviewItemQueue.length
  ) {
    sendNextItem();
  } else if (failedGameRetryTimer === null && scheduleNextRetryableFailedGame()) {
    // Retry resumes through the normal backoff path.
  } else if (activeIndex < 0 && queue.some(candidate => candidate.status === 'pending')) {
    advanceQueue();
  }
  syncReviewUnattendedWakeLock();
  notifyReviewQueueStateChanged();
}

export function getReviewProgress(gameId: string): number | undefined {
  const entry = queue.find(e => e.game.id === gameId);
  if (!entry) return undefined;
  if (entry.status === 'complete') return 100;
  if (entry.total === 0) return undefined;
  return Math.round((entry.done / entry.total) * 100);
}

export function getFailedReviewStatus(gameId: string, depth = bulkReviewDepth): FailedReviewStatus | undefined {
  const state = getFailedGameState(gameId, depth);
  return state ? toFailedReviewStatus(state) : undefined;
}

export function getFailedReviewStatuses(): FailedReviewStatus[] {
  return [...failedGameAttempts.values()].map(toFailedReviewStatus);
}

export function getFailedReviewGameIds(): Set<string> {
  return new Set([...failedGameAttempts.values()].map(state => state.gameId));
}

export function getCurrentFailedReviewStatus(): FailedReviewStatus | undefined {
  const retryEntry = failedGameRetryEntry;
  if (retryEntry) {
    const retryState = getFailedGameState(retryEntry.game.id, retryEntry.depth);
    if (retryState) return toFailedReviewStatus(retryState);
  }
  const activeEntry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (activeEntry?.status === 'error') {
    const activeState = getFailedGameState(activeEntry.game.id, activeEntry.depth);
    if (activeState) return toFailedReviewStatus(activeState);
  }
  for (const entry of queue) {
    if (entry.status !== 'error') continue;
    const state = getFailedGameState(entry.game.id, entry.depth);
    if (state) return toFailedReviewStatus(state);
  }
  return undefined;
}

export async function getNextReviewRunBatchSelection(
  games: readonly ImportedGame[] = _libraryGames,
): Promise<ReviewRunNextBatchSelection | null> {
  const loaded = activeReviewRun ?? await loadLatestReviewRunManifest();
  const manifest = loaded ? normalizeReviewRunManifest(loaded) : null;
  if (!manifest) return null;
  const reviewedGameIdsAtRunDepth = new Set<string>();
  for (const gameId of manifest.sourceGameIds) {
    const stored = await loadAnalysisFromIdb(gameId);
    if (storedAnalysisMatchesReviewDepth(stored, manifest.reviewDepth)) {
      reviewedGameIdsAtRunDepth.add(gameId);
    }
  }
  return selectNextReviewRunBatch({
    manifest,
    libraryGames: games,
    reviewedGameIdsAtRunDepth,
  });
}

export async function queueNextReviewRunBatch(
  games: readonly ImportedGame[] = _libraryGames,
): Promise<'queued' | 'no-run' | 'no-more-eligible-games'> {
  const loaded = activeReviewRun ?? await loadLatestReviewRunManifest();
  const manifest = loaded ? normalizeReviewRunManifest(loaded) : null;
  if (!manifest) return 'no-run';
  activeReviewRun = manifest;
  const selection = await getNextReviewRunBatchSelection(games);



  if (
    !activeReviewRun
    || activeReviewRun.runId !== manifest.runId
    || activeReviewRun.lifecycleState === 'canceled'
    || queuePaused
  ) {
    return 'no-run';
  }
  if (!selection) return 'no-run';
  if (selection.batchGames.length === 0) {
    setActiveReviewRunState('no-more-eligible-games');
    notifyReviewQueueStateChanged();
    return 'no-more-eligible-games';
  }

  activeReviewRun.activeBatchIds = [...selection.batchGameIds];
  activeReviewRun.lifecycleState = 'running';
  activeReviewRun.updatedAt = Date.now();
  persistActiveReviewRun();
  enqueueBulkReview(selection.batchGames, manifest.reviewDepth, {
    sourceMode:          manifest.sourceMode,
    sourceGameIds:       manifest.sourceGameIds,
    timeControlContext:  manifest.timeControlContext,
    orderingContext:     manifest.orderingContext,
    activeBatchIds:      selection.batchGameIds,
  });
  notifyReviewQueueStateChanged();
  return 'queued';
}

export function dismissReviewRunNotice(): void {
  if (!activeReviewRun) return;
  if (
    activeReviewRun.lifecycleState !== 'batch-complete'
    && activeReviewRun.lifecycleState !== 'no-more-eligible-games'
    && activeReviewRun.lifecycleState !== 'stale'
  ) return;
  activeReviewRun.lifecycleState = 'idle';
  activeReviewRun.updatedAt = Date.now();
  persistActiveReviewRun();
  notifyReviewQueueStateChanged();
}

export interface ReviewQueueItemView {
  gameId:      string;
  label:       string;
  status:      ReviewQueueEntry['status'];
  depth:       number;
  done:        number;
  total:       number;
  isActive:    boolean;
  isFuture:    boolean;
  waveIndex:   number;
  canMoveUp:   boolean;
  canMoveDown: boolean;
  canRemove:   boolean;
}

function reviewQueueItemViewFromEntry(
  entry: ReviewQueueEntry,
  active: ReviewQueueEntry | undefined,
  waveIndex: number,
): ReviewQueueItemView {
  const total = Math.max(0, entry.total);
  return {
    gameId:      entry.game.id,
    label:       reviewQueueEntryLabel(entry),
    status:      entry.status,
    depth:       entry.depth,
    done:        Math.min(Math.max(0, entry.done), total),
    total,
    isActive:    entry === active || entry.status === 'analyzing',
    isFuture:    false,
    waveIndex,
    canMoveUp:   canMoveReviewQueueEntry(entry, 'up'),
    canMoveDown: canMoveReviewQueueEntry(entry, 'down'),
    canRemove:   entry !== active && isReviewQueueEntryActionable(entry),
  };
}

export function getReviewQueueItems(): ReviewQueueItemView[] {
  const active = activeQueueEntry();
  if (!activeReviewRun) {
    return sortByActiveBatchOrder(queue, entry => entry.game.id)
      .filter(entry => entry.status !== 'complete')
      .map(entry => reviewQueueItemViewFromEntry(entry, active, 0));
  }

  const queuedByGameId = new Map(queue.map(entry => [entry.game.id, entry]));
  const libraryByGameId = new Map(_libraryGames.map(game => [game.id, game]));
  const completedIds = new Set(activeReviewRun.completedGameIds);
  const skippedIds = new Set(activeReviewRun.skippedGameIds);
  const failedIds = new Set(activeReviewRun.failedAttempts.map(attempt => attempt.gameId));
  const items: ReviewQueueItemView[] = [];
  const seen = new Set<string>();

  for (const sourceItem of reviewRunSourceUiItems(activeReviewRun.sourceGameIds)) {
    const gameId = sourceItem.gameId;
    if (completedIds.has(gameId) || skippedIds.has(gameId) || _analyzedGameIds.has(gameId)) continue;

    const queued = queuedByGameId.get(gameId);
    if (queued) {
      if (queued.status !== 'complete') {
        items.push(reviewQueueItemViewFromEntry(queued, active, sourceItem.waveIndex));
        seen.add(gameId);
      }
      continue;
    }

    const game = libraryByGameId.get(gameId);
    if (!game) continue;
    seen.add(gameId);
    const total = Math.max(0, estimatePlyCountFromPgn(game.pgn));
    items.push({
      gameId,
      label:       `${game.white ?? 'White'} vs ${game.black ?? 'Black'}`,
      status:      failedIds.has(gameId) ? 'error' : 'pending',
      depth:       activeReviewRun.reviewDepth,
      done:        0,
      total,
      isActive:    false,
      isFuture:    true,
      waveIndex:   sourceItem.waveIndex,
      canMoveUp:   false,
      canMoveDown: false,
      canRemove:   false,
    });
  }

  for (const entry of sortByActiveBatchOrder(queue, entry => entry.game.id)) {
    if (entry.status === 'complete' || seen.has(entry.game.id)) continue;
    items.push(reviewQueueItemViewFromEntry(entry, active, 0));
  }

  return items;
}

export function moveReviewQueueGame(gameId: string, direction: 'up' | 'down'): void {
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'move-queue-game', tabId, gameId, direction });
    return;
  }
  const fromIndex = queue.findIndex(entry => entry.game.id === gameId);
  if (fromIndex < 0) return;
  const entry = queue[fromIndex]!;
  if (!canMoveReviewQueueEntry(entry, direction)) return;
  const toIndex = findVisibleQueueTargetIndex(fromIndex, direction);
  if (toIndex < 0) return;
  [queue[fromIndex], queue[toIndex]] = [queue[toIndex]!, queue[fromIndex]!];
  if (activeReviewRun) {
    const activeGameId = activeQueueEntry()?.game.id;
    activeReviewRun = withReviewRunActiveBatchGameMoved(
      activeReviewRun,
      gameId,
      direction,
      activeGameId ? [activeGameId] : [],
    );
    persistActiveReviewRun();
  }
  notifyReviewQueueStateChanged();
  postReviewChannelMessage({ type: 'manifest-changed', tabId });
}

export function removeReviewQueueGame(gameId: string): void {
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'remove-queue-game', tabId, gameId });
    return;
  }
  const index = queue.findIndex(entry => entry.game.id === gameId);
  if (index < 0) return;
  const entry = queue[index]!;
  if (entry === activeQueueEntry() || !isReviewQueueEntryActionable(entry)) return;
  if (failedGameRetryEntry === entry) clearFailedGameRetryTimer();
  if (entry.status === 'error' || getFailedGameState(entry.game.id, entry.depth)) persistSkippedFailedGameState(entry);
  else clearFailedGameState(entry.game.id, entry.depth);
  markActiveReviewRunGameSkippedFromActiveBatch(entry.game.id);
  queue.splice(index, 1);
  if (activeIndex > index) activeIndex--;
  void clearReviewQueueManifestEntry(entry.game.id);
  notifyReviewQueueStateChanged();
  postReviewChannelMessage({ type: 'manifest-changed', tabId });
  if (activeIndex < 0) advanceQueue();
}

export interface QueueSummary {
  total:   number;  // games in the current queue (any status)
  done:    number;  // games with status 'complete'
  failed:  number;
  skipped: number;
  remainingGames: number;
  running: boolean;
  paused:  boolean;
  pauseReason: ReviewPauseReason | null;
  lifecycleState: ReviewRunLifecycleState | null;
  storageHealth: ReviewStorageHealth;
  autoRetryEnabled: boolean;
  unattendedRunEnabled: boolean;
  pauseNotice: ReviewPauseNotice | null;
  lastPauseNotice: ReviewPauseNotice | null;
  elapsedSeconds: number | null;
  lastProgressSeconds: number | null;
  stale: boolean;
  staleThresholdSeconds: number;
  currentGameId: string | null;
  currentGameLabel: string | null;
  currentBatchIndex: number | null;
  currentBatchTotal: number | null;
  activeBatchGameIds: string[];
  reviewDepth: number | null;
  timeControlContext: ReviewRunTimeControlContext | null;
  watchdogTriggered: boolean;
  watchdogLastTriggerTimestamp: number | null;
  lastCheckpointTimestamp: number | null;






  remainingPositions: number;
  positionsAnalyzed: number;
  totalPositions: number;
}

export function getQueueSummary(): QueueSummary {
  const batchIds = activeReviewRun?.activeBatchIds ?? [];
  const batchIdSet = new Set(batchIds);
  const runScopedIds = (ids: readonly string[]) => batchIdSet.size === 0
    ? ids
    : ids.filter(id => batchIdSet.has(id));
  const total = batchIds.length > 0 ? batchIds.length : queue.length;
  const done = activeReviewRun
    ? runScopedIds(activeReviewRun.completedGameIds).length
    : queue.filter(e => e.status === 'complete').length;
  const skipped = activeReviewRun
    ? runScopedIds(activeReviewRun.skippedGameIds).length
    : [...failedGameAttempts.values()].filter(state => state.skipped).length;
  const completedIds = new Set(activeReviewRun?.completedGameIds ?? []);
  const skippedIds = new Set(activeReviewRun?.skippedGameIds ?? []);
  const failed = activeReviewRun
    ? activeReviewRun.failedAttempts.filter(attempt =>
        (batchIdSet.size === 0 || batchIdSet.has(attempt.gameId))
        && !completedIds.has(attempt.gameId)
        && !skippedIds.has(attempt.gameId),
      ).length
    : [...failedGameAttempts.values()].filter(state => !state.skipped).length;
  const remainingGames = Math.max(0, total - done - skipped);
  const running = isBulkRunning();
  const paused  = isBulkPaused();
  if (running) ensureReviewBatchElapsedStarted();
  const now = Date.now();
  const elapsedSeconds = running && reviewBatchStartedAt !== null
    ? (now - reviewBatchStartedAt) / 1000
    : null;
  const progressAnchor = reviewLastProgressAt ?? activeReviewRun?.updatedAt ?? reviewBatchStartedAt;
  const lastProgressSeconds = running && progressAnchor !== null && progressAnchor !== undefined
    ? (now - progressAnchor) / 1000
    : null;
  const currentEntry = activeQueueEntry();
  const currentGameId = currentEntry?.game.id ?? null;
  const currentGameLabel = currentEntry
    ? `${currentEntry.game.white ?? 'White'} vs ${currentEntry.game.black ?? 'Black'}`
    : null;
  const currentBatchTotal = total > 0 ? total : null;
  const currentBatchIndex = currentEntry && currentBatchTotal !== null
    ? (() => {
        const activeBatchIndex = batchIds.indexOf(currentEntry.game.id);
        if (activeBatchIndex >= 0) return activeBatchIndex + 1;
        const queueIndex = queue.findIndex(entry => entry.game.id === currentEntry.game.id);
        return queueIndex >= 0 ? queueIndex + 1 : null;
      })()
    : null;
  const rawLifecycleState = activeReviewRun?.lifecycleState ?? null;
  const stale = isReviewRunStale({
    running,
    paused,
    pauseReason: queuePauseReason,
    lifecycleState: rawLifecycleState,
    retryingFailedGame: failedGameRetryTimer !== null,
    lastProgressSeconds,
    staleThresholdSeconds: REVIEW_STALE_PROGRESS_MS / 1000,
  });
  if (stale && currentReviewPauseNotice?.active !== true) {
    markReviewPauseNotice('browser-stalled', 'No review progress was detected for the stale-progress threshold.');
  }
  const lifecycleState = stale ? 'stale' : rawLifecycleState;

  let remainingPositions = 0;
  let positionsAnalyzed = 0;
  let totalPositions = 0;
  for (const entry of queue) {
    const entryTotal = Math.max(0, entry.total);
    if (batchIdSet.size === 0 || batchIdSet.has(entry.game.id)) {
      totalPositions += entryTotal;
      positionsAnalyzed += Math.min(Math.max(0, entry.done), entryTotal);
    }
    if (entry.status === 'complete' || entry.status === 'error') continue;
    remainingPositions += Math.max(0, entry.total - entry.done);
  }

  return {
    total,
    done,
    failed,
    skipped,
    remainingGames,
    running,
    paused,
    pauseReason: paused ? queuePauseReason : null,
    lifecycleState,
    storageHealth: reviewStorageHealth,
    autoRetryEnabled: activeReviewRun?.autoRetryEnabled === true,
    unattendedRunEnabled: isReviewUnattendedRunEnabled(),
    pauseNotice: currentReviewPauseNotice,
    lastPauseNotice: lastReviewPauseNotice,
    elapsedSeconds,
    lastProgressSeconds,
    stale,
    staleThresholdSeconds: REVIEW_STALE_PROGRESS_MS / 1000,
    currentGameId,
    currentGameLabel,
    currentBatchIndex,
    currentBatchTotal,
    activeBatchGameIds: [...batchIds],
    reviewDepth: activeReviewRun?.reviewDepth ?? currentEntry?.depth ?? null,
    timeControlContext: activeReviewRun?.timeControlContext ?? null,
    watchdogTriggered: reviewWatchdogTriggeredAt !== null,
    watchdogLastTriggerTimestamp: reviewWatchdogLastTriggerAt,
    lastCheckpointTimestamp: checkpointLastFlushAt > 0 ? checkpointLastFlushAt : null,
    remainingPositions,
    positionsAnalyzed,
    totalPositions,
  };
}

/** Resolve a game's "White vs Black" label from the queue, then the last-known library snapshot. */
function labelForReviewRunGameId(gameId: string): string {
  const queued = queue.find(e => e.game.id === gameId);
  if (queued) return reviewQueueEntryLabel(queued);
  const libraryGame = _libraryGames.find(g => g.id === gameId);
  if (libraryGame) return `${libraryGame.white ?? 'White'} vs ${libraryGame.black ?? 'Black'}`;
  return gameId;
}

export interface ReviewRunSummaryFailedItem {
  gameId: string;
  label: string;
  attempts: number;
  lastFailedAt: number;
}

export interface ReviewRunSummaryItem {
  gameId: string;
  label: string;
}








export interface ReviewRunSummaryView {
  lifecycleState: ReviewRunLifecycleState;
  breakerPaused: boolean;
  breakerTrippedReason: ReviewRunBreakerReason | null;
  completed: ReviewRunSummaryItem[];
  skipped: ReviewRunSummaryItem[];
  failed: ReviewRunSummaryFailedItem[];
}

export function getReviewRunSummary(): ReviewRunSummaryView | null {
  if (!activeReviewRun) return null;
  const summary = reviewRunSummaryFromManifest(activeReviewRun);
  return {
    lifecycleState: activeReviewRun.lifecycleState,
    breakerPaused: activeReviewRun.lifecycleState === 'breaker-paused',
    breakerTrippedReason: activeReviewRun.breakerTrippedReason,
    completed: summary.completedGameIds.map(gameId => ({ gameId, label: labelForReviewRunGameId(gameId) })),
    skipped: summary.skippedGameIds.map(gameId => ({ gameId, label: labelForReviewRunGameId(gameId) })),
    failed: activeReviewRun.failedAttempts.map(attempt => ({
      gameId:       attempt.gameId,
      label:        labelForReviewRunGameId(attempt.gameId),
      attempts:     attempt.attempts,
      lastFailedAt: attempt.lastFailedAt,
    })),
  };
}

/** Format a duration in seconds as a short "Xm Ys" / "Xs" string for review status display. */
export function formatReviewDuration(secondsValue: number | null): string | null {
  if (secondsValue === null || !Number.isFinite(secondsValue)) return null;
  const totalSeconds = Math.max(0, Math.round(secondsValue));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

/** Returns true when a game in the current session queue is in the error state. */
export function isGameErrored(gameId: string): boolean {
  const entry = queue.find(e => e.game.id === gameId);
  return entry?.status === 'error';
}

/**
 * Remove a game from the queue so it can be re-queued cleanly.
 * Only removes entries with `status === 'error'` — does not affect active or
 * pending entries. Partial IDB results for the game are preserved.
 */
export function resetErroredGame(gameId: string): void {
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'reset-errored', tabId, gameId });
    return;
  }
  const idx = queue.findIndex(e => e.game.id === gameId && e.status === 'error');
  if (idx < 0) return;
  queue.splice(idx, 1);
  // If the active index pointed past the removed entry, adjust it.
  if (activeIndex > idx) activeIndex--;
  void clearReviewQueueManifestEntry(gameId);
  notifyReviewQueueStateChanged();
}









export function retryReviewRunFailedGames(): void {
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'retry-failed', tabId });
    return;
  }
  if (!activeReviewRun || activeReviewRun.failedAttempts.length === 0) return;

  const failedGameIds = activeReviewRun.failedAttempts.map(attempt => attempt.gameId);
  const reviewDepth = activeReviewRun.reviewDepth;
  const sourceContext: ReviewRunSourceContext = {
    sourceMode:         activeReviewRun.sourceMode,
    sourceGameIds:      activeReviewRun.sourceGameIds,
    timeControlContext: activeReviewRun.timeControlContext,
    orderingContext:    activeReviewRun.orderingContext,
    activeBatchIds:     activeReviewRun.activeBatchIds,
  };
  activeReviewRun = withReviewRunBreakerCleared(activeReviewRun);
  persistActiveReviewRun();
  queuePaused = false;
  queuePauseReason = null;

  const missingGames: ImportedGame[] = [];
  for (const gameId of failedGameIds) {
    const entry = queue.find(e => e.game.id === gameId && e.status === 'error');
    if (entry) {
      scheduleFailedGameRetry(entry, { incrementAttempts: false });
      continue;
    }
    // Evicted (e.g. across a reload) — clear the stale manifest remnant, then
    // rebuild the entry fresh from the library game record below.
    resetErroredGame(gameId);
    const game = _libraryGames.find(g => g.id === gameId);
    if (game) missingGames.push(game);
  }

  if (missingGames.length > 0) {
    enqueueBulkReview(missingGames, reviewDepth, sourceContext);
  } else if (activeIndex < 0 && !reviewEngineFailed) {
    advanceQueue();
  }
  if (!reviewEngineInitStarted && !reviewEngineFailed) {
    void initReviewEngine('/stockfish-web');
  }
  syncReviewUnattendedWakeLock();
  notifyReviewQueueStateChanged();
}

export function skipFailedReviewGame(gameId: string): void {
  if (!isCurrentLeader) {
    postReviewChannelMessage({ type: 'skip-failed', tabId, gameId });
    return;
  }
  const idx = queue.findIndex(e => e.game.id === gameId && e.status === 'error');
  if (idx < 0) return;
  const entry = queue[idx]!;
  if (failedGameRetryEntry === entry) clearFailedGameRetryTimer();
  persistSkippedFailedGameState(entry);
  markActiveReviewRunGameSkipped(entry.game.id);
  queue.splice(idx, 1);
  if (activeIndex >= idx) activeIndex--;
  void clearReviewQueueManifestEntry(entry.game.id);
  notifyReviewQueueStateChanged();
  advanceQueue();
}

export function skipCurrentFailedReviewGame(): void {
  const status = getCurrentFailedReviewStatus();
  if (!status) return;
  skipFailedReviewGame(status.gameId);
}
