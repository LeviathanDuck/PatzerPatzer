import { parsePgnHeader, type ImportedGame } from '../import/types';

export const BULK_REVIEW_TARGET_BATCH_SIZE = 25;














export const REVIEW_RUN_HYGIENE_CADENCE = 10;

export type ReviewRunSourceMode = 'selected-games' | 'visible-list';

export type ReviewRunLifecycleState =
  | 'idle'
  | 'running'
  | 'user-paused'
  | 'hidden-suspended'
  | 'interrupted-after-reload'
  | 'retrying-failed-game'
  | 'batch-complete'
  | 'no-more-eligible-games'
  | 'stale'
  | 'canceled'
  | 'breaker-paused';









export const REVIEW_RUN_BREAKER_FAILURE_THRESHOLD = 3;

/** What tripped the circuit breaker — drives the header's banner copy. */
export type ReviewRunBreakerReason = 'consecutive-failures' | 'engine-init-failure';

export interface ReviewRunTimeControlContext {
  speeds: string[];
}

export interface ReviewRunOrderingContext {
  sortKey: string;
  sortDirection: 'asc' | 'desc';
}

export interface ReviewRunFailedAttempt {
  gameId: string;
  attempts: number;
  lastFailedAt: number;
}

export interface ReviewRunManifest {
  runId: string;
  sourceMode: ReviewRunSourceMode;
  sourceGameIds: string[];
  reviewDepth: number;
  autoRetryEnabled: boolean;
  unattendedRunEnabled: boolean;
  timeControlContext: ReviewRunTimeControlContext;
  orderingContext: ReviewRunOrderingContext;
  activeBatchIds: string[];
  completedGameIds: string[];
  failedAttempts: ReviewRunFailedAttempt[];
  skippedGameIds: string[];
  lifecycleState: ReviewRunLifecycleState;







  consecutiveFailureCount: number;
  /** Set when the breaker trips; cleared by `withReviewRunBreakerCleared` ("Retry failed"). */
  breakerTrippedReason: ReviewRunBreakerReason | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewRunSourceContext {
  sourceMode: ReviewRunSourceMode;
  sourceGameIds: string[];
  timeControlContext?: ReviewRunTimeControlContext;
  orderingContext?: ReviewRunOrderingContext;
  activeBatchIds?: string[];
}

export interface ReviewRunNextBatchSelection {
  batchGameIds: string[];
  batchGames: ImportedGame[];
  eligibleGameIds: string[];
  hasMoreAfterBatch: boolean;
}

export interface ReviewRunStart {
  batchGames: ImportedGame[];
  sourceContext: ReviewRunSourceContext;
}

export interface ReviewRunFailureState {
  gameId: string;
  attempts: number;
  lastFailedAt: number;
  skipped?: boolean;
}

export interface ReviewRunHydrationResult {
  manifest: ReviewRunManifest;
  changed: boolean;
}

export interface ReviewRunProgressSampleAnchor {
  positionsAnalyzed: number;
  sampledAt: number;
}

export interface ReviewRunProgressVisibilitySample {
  positionsSincePreviousSample: number;
  elapsedSincePreviousSampleMs: number | null;
  positionsPerMinute: number | null;
  anchor: ReviewRunProgressSampleAnchor;
}

/**
 * Pure progress-rate sampler for bounded review-run diagnostics. The first
 * sample establishes the anchor; zero/negative elapsed samples keep the rate
 * null so callers never emit Infinity or divide by zero.
 */
export function sampleReviewRunProgressByVisibility(
  previous: ReviewRunProgressSampleAnchor | null,
  positionsAnalyzed: number,
  sampledAt: number = Date.now(),
): ReviewRunProgressVisibilitySample {
  const currentPositions = Math.max(0, positionsAnalyzed);
  const anchor = {
    positionsAnalyzed: currentPositions,
    sampledAt,
  };
  if (!previous) {
    return {
      positionsSincePreviousSample: 0,
      elapsedSincePreviousSampleMs: null,
      positionsPerMinute: null,
      anchor,
    };
  }
  const elapsedSincePreviousSampleMs = Math.max(0, sampledAt - previous.sampledAt);
  const positionsSincePreviousSample = Math.max(0, currentPositions - Math.max(0, previous.positionsAnalyzed));
  return {
    positionsSincePreviousSample,
    elapsedSincePreviousSampleMs,
    positionsPerMinute: elapsedSincePreviousSampleMs > 0
      ? (positionsSincePreviousSample * 60_000) / elapsedSincePreviousSampleMs
      : null,
    anchor,
  };
}

export type ReviewRunManifestConsistencyIssueCode =
  | 'duplicate-source-game-id'
  | 'duplicate-active-batch-game-id'
  | 'active-batch-outside-source'
  | 'duplicate-completed-game-id'
  | 'completed-outside-source'
  | 'duplicate-skipped-game-id'
  | 'skipped-outside-source'
  | 'skipped-completed-conflict'
  | 'duplicate-failed-game-id'
  | 'failed-outside-source'
  | 'failed-completed-conflict'
  | 'failed-skipped-conflict';

export interface ReviewRunManifestConsistencyIssue {
  code: ReviewRunManifestConsistencyIssueCode;
  gameIds: string[];
}

export interface ReviewRunManifestConsistencyResult {
  manifest: ReviewRunManifest;
  changed: boolean;
  issues: ReviewRunManifestConsistencyIssue[];
}

export interface ReviewRunStaleInput {
  running: boolean;
  paused: boolean;
  pauseReason: 'user' | 'hidden' | 'reload' | 'breaker' | null;
  lifecycleState: ReviewRunLifecycleState | null;
  retryingFailedGame: boolean;
  lastProgressSeconds: number | null;
  staleThresholdSeconds: number;
}

export interface ReviewSearchIdentitySnapshot {
  gameId: string;
  fen: string;
  nodePath: string;
  parentPath: string;
  depth: number;
  generation: number;
}












export type ReviewSearchOwnerKind = 'review' | 'tree-eval';

export interface ReviewSearchDescriptor {
  token: number;
  kind: ReviewSearchOwnerKind;
  fen: string;
  nodePath: string;
  ply: number;
  stale: boolean;
  issuedAt: number;
}

export interface ReviewSearchOwnerState {
  nextToken: number;
  pending: ReviewSearchDescriptor[];
}

export function createReviewSearchOwner(): ReviewSearchOwnerState {
  return { nextToken: 1, pending: [] };
}

/** Register one issued `go`. Returns the descriptor whose token identifies that search. */
export function searchOwnerRegisterGo(
  state: ReviewSearchOwnerState,
  args: { kind: ReviewSearchOwnerKind; fen: string; nodePath?: string; ply?: number; now?: number },
): ReviewSearchDescriptor {
  const descriptor: ReviewSearchDescriptor = {
    token: state.nextToken++,
    kind: args.kind,
    fen: args.fen,
    nodePath: args.nodePath ?? '',
    ply: args.ply ?? 0,
    stale: false,
    issuedAt: args.now ?? Date.now(),
  };
  state.pending.push(descriptor);
  return descriptor;
}

/** Count of issued searches still owed a bestmove. */
export function searchOwnerOutstanding(state: ReviewSearchOwnerState): number {
  return state.pending.length;
}

/** Oldest outstanding descriptor — the search the next engine line belongs to. */
export function searchOwnerHead(state: ReviewSearchOwnerState): ReviewSearchDescriptor | null {
  return state.pending[0] ?? null;
}

/** Consume the oldest outstanding search for an arriving bestmove. Null = unexpected reply. */
export function searchOwnerConsumeBestmove(state: ReviewSearchOwnerState): ReviewSearchDescriptor | null {
  return state.pending.shift() ?? null;
}

/** Mark every outstanding search stale (stopped/superseded/preempted). Returns count marked. */
export function searchOwnerMarkAllStale(state: ReviewSearchOwnerState): number {
  let marked = 0;
  for (const descriptor of state.pending) {
    if (!descriptor.stale) {
      descriptor.stale = true;
      marked++;
    }
  }
  return marked;
}

/** Mark outstanding searches of one kind stale (e.g. tree-eval on lease stop/release). */
export function searchOwnerMarkKindStale(state: ReviewSearchOwnerState, kind: ReviewSearchOwnerKind): number {
  let marked = 0;
  for (const descriptor of state.pending) {
    if (descriptor.kind === kind && !descriptor.stale) {
      descriptor.stale = true;
      marked++;
    }
  }
  return marked;
}

/**
 * Hard reset after an unrecoverable pipeline fault (barrier timeout, engine error/hang). Returns
 * the number of descriptors dropped. Replies for dropped searches, if they ever arrive, must be
 * treated as unexpected and ignored by the caller.
 */
export function searchOwnerReset(state: ReviewSearchOwnerState): number {
  const dropped = state.pending.length;
  state.pending = [];
  return dropped;
}

/** True when `descriptor` is the reply the active review search is waiting for. */
export function searchOwnerDescriptorIsActive(
  descriptor: ReviewSearchDescriptor | null,
  activeToken: number | null,
): boolean {
  return descriptor !== null
    && activeToken !== null
    && !descriptor.stale
    && descriptor.kind === 'review'
    && descriptor.token === activeToken;
}

export function createReviewRunId(now = Date.now()): string {
  return `review-run-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createReviewRunManifest(params: {
  sourceMode: ReviewRunSourceMode;
  sourceGameIds: string[];
  reviewDepth: number;
  unattendedRunEnabled?: boolean;
  timeControlContext?: ReviewRunTimeControlContext;
  orderingContext?: ReviewRunOrderingContext;
  activeBatchIds?: string[];
  now?: number;
}): ReviewRunManifest {
  const now = params.now ?? Date.now();
  return {
    runId:              createReviewRunId(now),
    sourceMode:         params.sourceMode,
    sourceGameIds:      [...params.sourceGameIds],
    reviewDepth:        params.reviewDepth,
    autoRetryEnabled:   false,
    unattendedRunEnabled: params.unattendedRunEnabled ?? true,
    timeControlContext: params.timeControlContext ?? { speeds: [] },
    orderingContext:    params.orderingContext ?? { sortKey: 'visible', sortDirection: 'desc' },
    activeBatchIds:     [...(params.activeBatchIds ?? [])],
    completedGameIds:   [],
    failedAttempts:     [],
    skippedGameIds:     [],
    lifecycleState:     'running',
    consecutiveFailureCount: 0,
    breakerTrippedReason:    null,
    createdAt:          now,
    updatedAt:          now,
  };
}

export function normalizeReviewRunManifest(manifest: ReviewRunManifest): ReviewRunManifest {
  return {
    ...manifest,
    autoRetryEnabled: manifest.autoRetryEnabled === true,
    unattendedRunEnabled: manifest.unattendedRunEnabled !== false,

    consecutiveFailureCount: manifest.consecutiveFailureCount ?? 0,
    breakerTrippedReason:    manifest.breakerTrippedReason ?? null,
  };
}

export function gameIdsInVisibleOrder(games: readonly ImportedGame[]): string[] {
  return games.map(game => game.id);
}

function parsePgnTimestamp(pgn: string, dateTag: string, timeTag: string): number | null {
  const date = parsePgnHeader(pgn, dateTag);
  const time = parsePgnHeader(pgn, timeTag);
  if (!date || !time) return null;
  const ts = Date.parse(`${date.replace(/\./g, '-')}T${time}Z`);
  return Number.isNaN(ts) ? null : ts;
}

function parseGameDateOnly(date: string | undefined): number | null {
  if (!date) return null;
  const day = date.slice(0, 10);
  const ts = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ts) ? null : ts;
}

export function reviewPlayedTimestamp(game: ImportedGame): number | null {
  if (game.source === 'chesscom') {
    return parsePgnTimestamp(game.pgn, 'EndDate', 'EndTime')
      ?? parsePgnTimestamp(game.pgn, 'UTCDate', 'UTCTime')
      ?? parseGameDateOnly(game.date);
  }
  return parsePgnTimestamp(game.pgn, 'UTCDate', 'UTCTime')
    ?? parsePgnTimestamp(game.pgn, 'EndDate', 'EndTime')
    ?? parseGameDateOnly(game.date);
}

export function compareGamesByReviewOrder(a: ImportedGame, b: ImportedGame): number {
  const aPlayed = reviewPlayedTimestamp(a);
  const bPlayed = reviewPlayedTimestamp(b);
  const aHasPlayedDate = aPlayed !== null;
  const bHasPlayedDate = bPlayed !== null;

  if (aHasPlayedDate !== bHasPlayedDate) return aHasPlayedDate ? -1 : 1;
  if (aPlayed !== null && bPlayed !== null && aPlayed !== bPlayed) return bPlayed - aPlayed;

  const aImported = a.importedAt ?? 0;
  const bImported = b.importedAt ?? 0;
  if (aImported !== bImported) return bImported - aImported;

  return 0;
}

export function reviewGamesInNewestFirstOrder(games: readonly ImportedGame[]): ImportedGame[] {
  return [...games].sort(compareGamesByReviewOrder);
}

export function selectedGameIdsInSourceOrder(
  games: readonly ImportedGame[],
  selectedGameIds: ReadonlySet<string>,
): string[] {
  return games
    .filter(game => selectedGameIds.has(game.id))
    .map(game => game.id);
}

export function firstReviewRunBatch<T>(items: readonly T[]): T[] {
  return items.slice(0, BULK_REVIEW_TARGET_BATCH_SIZE);
}

export interface ReviewRunSourceUiItem {
  gameId: string;
  sourceIndex: number;
  waveIndex: number;
}

export function reviewRunWaveIndexForSourceIndex(
  sourceIndex: number,
  targetBatchSize = BULK_REVIEW_TARGET_BATCH_SIZE,
): number {
  const safeBatchSize = Math.max(1, Math.floor(targetBatchSize));
  return Math.floor(Math.max(0, sourceIndex) / safeBatchSize);
}

export function reviewRunSourceUiItems(
  sourceGameIds: readonly string[],
  targetBatchSize = BULK_REVIEW_TARGET_BATCH_SIZE,
): ReviewRunSourceUiItem[] {
  return sourceGameIds.map((gameId, sourceIndex) => ({
    gameId,
    sourceIndex,
    waveIndex: reviewRunWaveIndexForSourceIndex(sourceIndex, targetBatchSize),
  }));
}

export function timeControlContextForGames(games: readonly ImportedGame[]): ReviewRunTimeControlContext {
  const speeds: string[] = [];
  const seen = new Set<string>();
  for (const game of games) {
    if (!game.timeClass || seen.has(game.timeClass)) continue;
    seen.add(game.timeClass);
    speeds.push(game.timeClass);
  }
  return { speeds };
}

export function visibleListReviewRunContext(
  games: readonly ImportedGame[],
  orderingContext: ReviewRunOrderingContext,
): ReviewRunSourceContext {
  return {
    sourceMode: 'visible-list',
    sourceGameIds: gameIdsInVisibleOrder(games),
    timeControlContext: timeControlContextForGames(games),
    orderingContext,
  };
}

export function reviewRunStartFromContext(
  games: readonly ImportedGame[],
  sourceContext: ReviewRunSourceContext,
): ReviewRunStart {
  const reviewOrderedGames = reviewGamesInNewestFirstOrder(games);
  const batchGames = firstReviewRunBatch(reviewOrderedGames);
  return {
    batchGames,
    sourceContext: {
      ...sourceContext,
      sourceGameIds: reviewOrderedGames.map(game => game.id),
      orderingContext: { sortKey: 'playedAt', sortDirection: 'desc' },
      activeBatchIds: batchGames.map(game => game.id),
    },
  };
}

export function withReviewRunGameComplete(
  manifest: ReviewRunManifest,
  gameId: string,
  now = Date.now(),
): ReviewRunManifest {
  return {
    ...manifest,
    completedGameIds: manifest.completedGameIds.includes(gameId)
      ? manifest.completedGameIds
      : [...manifest.completedGameIds, gameId],
    failedAttempts: manifest.failedAttempts.filter(attempt => attempt.gameId !== gameId),
    skippedGameIds: manifest.skippedGameIds.filter(id => id !== gameId),


    consecutiveFailureCount: 0,
    updatedAt: now,
  };
}







export function withReviewRunGameFailureRecorded(
  manifest: ReviewRunManifest,
  now = Date.now(),
): ReviewRunManifest {
  return {
    ...manifest,
    consecutiveFailureCount: manifest.consecutiveFailureCount + 1,
    updatedAt: now,
  };
}







export function reviewRunCircuitBreakerShouldTrip(
  manifest: Pick<ReviewRunManifest, 'consecutiveFailureCount'>,
  threshold: number = REVIEW_RUN_BREAKER_FAILURE_THRESHOLD,
): boolean {
  return manifest.consecutiveFailureCount >= threshold;
}

/** Trip the breaker into the loud paused state. Idempotent for the same reason. */
export function withReviewRunBreakerTripped(
  manifest: ReviewRunManifest,
  reason: ReviewRunBreakerReason,
  now = Date.now(),
): ReviewRunManifest {
  if (manifest.lifecycleState === 'breaker-paused' && manifest.breakerTrippedReason === reason) return manifest;
  return {
    ...manifest,
    lifecycleState: 'breaker-paused',
    breakerTrippedReason: reason,
    updatedAt: now,
  };
}

/** Clear the breaker (the "Retry failed" action) — resumes as a normal running state. */
export function withReviewRunBreakerCleared(
  manifest: ReviewRunManifest,
  now = Date.now(),
): ReviewRunManifest {
  if (manifest.lifecycleState !== 'breaker-paused' && manifest.breakerTrippedReason === null && manifest.consecutiveFailureCount === 0) {
    return manifest;
  }
  return {
    ...manifest,
    lifecycleState: 'running',
    breakerTrippedReason: null,
    consecutiveFailureCount: 0,
    updatedAt: now,
  };
}






export interface ReviewRunSummary {
  completedGameIds: string[];
  skippedGameIds: string[];
  failedGameIds: string[];
  completedCount: number;
  skippedCount: number;
  failedCount: number;
}

export function reviewRunSummaryFromManifest(manifest: ReviewRunManifest): ReviewRunSummary {
  const failedGameIds = manifest.failedAttempts.map(attempt => attempt.gameId);
  return {
    completedGameIds: [...manifest.completedGameIds],
    skippedGameIds: [...manifest.skippedGameIds],
    failedGameIds,
    completedCount: manifest.completedGameIds.length,
    skippedCount: manifest.skippedGameIds.length,
    failedCount: failedGameIds.length,
  };
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameFailedAttempts(a: readonly ReviewRunFailedAttempt[], b: readonly ReviewRunFailedAttempt[]): boolean {
  return a.length === b.length && a.every((value, index) => {
    const other = b[index];
    return !!other
      && value.gameId === other.gameId
      && value.attempts === other.attempts
      && value.lastFailedAt === other.lastFailedAt;
  });
}

function dedupeIds(
  ids: readonly string[],
  issueCode: ReviewRunManifestConsistencyIssueCode,
  issues: ReviewRunManifestConsistencyIssue[],
): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
      continue;
    }
    seen.add(id);
    deduped.push(id);
  }
  if (duplicates.size > 0) issues.push({ code: issueCode, gameIds: [...duplicates] });
  return deduped;
}

function filterIds(
  ids: readonly string[],
  issueCode: ReviewRunManifestConsistencyIssueCode,
  issueIds: Set<string>,
  predicate: (id: string) => boolean,
  issues: ReviewRunManifestConsistencyIssue[],
): string[] {
  const kept: string[] = [];
  for (const id of ids) {
    if (predicate(id)) kept.push(id);
    else issueIds.add(id);
  }
  if (issueIds.size > 0) issues.push({ code: issueCode, gameIds: [...issueIds] });
  return kept;
}






export function verifyReviewRunManifestConsistency(
  manifest: ReviewRunManifest,
  now = Date.now(),
): ReviewRunManifestConsistencyResult {
  const issues: ReviewRunManifestConsistencyIssue[] = [];
  const sourceGameIds = dedupeIds(manifest.sourceGameIds, 'duplicate-source-game-id', issues);
  const sourceIds = new Set(sourceGameIds);

  let activeBatchIds = dedupeIds(manifest.activeBatchIds, 'duplicate-active-batch-game-id', issues);
  activeBatchIds = filterIds(
    activeBatchIds,
    'active-batch-outside-source',
    new Set(),
    id => sourceIds.has(id),
    issues,
  );

  let completedGameIds = dedupeIds(manifest.completedGameIds, 'duplicate-completed-game-id', issues);
  completedGameIds = filterIds(
    completedGameIds,
    'completed-outside-source',
    new Set(),
    id => sourceIds.has(id),
    issues,
  );
  const completedIds = new Set(completedGameIds);

  let skippedGameIds = dedupeIds(manifest.skippedGameIds, 'duplicate-skipped-game-id', issues);
  skippedGameIds = filterIds(
    skippedGameIds,
    'skipped-outside-source',
    new Set(),
    id => sourceIds.has(id),
    issues,
  );
  skippedGameIds = filterIds(
    skippedGameIds,
    'skipped-completed-conflict',
    new Set(),
    id => !completedIds.has(id),
    issues,
  );
  const skippedIds = new Set(skippedGameIds);

  const failedByGameId = new Map<string, ReviewRunFailedAttempt>();
  const duplicateFailedIds = new Set<string>();
  const failedOutsideSourceIds = new Set<string>();
  const failedCompletedIds = new Set<string>();
  const failedSkippedIds = new Set<string>();
  for (const attempt of manifest.failedAttempts) {
    if (!sourceIds.has(attempt.gameId)) {
      failedOutsideSourceIds.add(attempt.gameId);
      continue;
    }
    if (completedIds.has(attempt.gameId)) {
      failedCompletedIds.add(attempt.gameId);
      continue;
    }
    if (skippedIds.has(attempt.gameId)) {
      failedSkippedIds.add(attempt.gameId);
      continue;
    }
    if (failedByGameId.has(attempt.gameId)) duplicateFailedIds.add(attempt.gameId);
    failedByGameId.set(attempt.gameId, attempt);
  }
  if (duplicateFailedIds.size > 0) issues.push({ code: 'duplicate-failed-game-id', gameIds: [...duplicateFailedIds] });
  if (failedOutsideSourceIds.size > 0) issues.push({ code: 'failed-outside-source', gameIds: [...failedOutsideSourceIds] });
  if (failedCompletedIds.size > 0) issues.push({ code: 'failed-completed-conflict', gameIds: [...failedCompletedIds] });
  if (failedSkippedIds.size > 0) issues.push({ code: 'failed-skipped-conflict', gameIds: [...failedSkippedIds] });
  const failedAttempts = [...failedByGameId.values()];

  const changed = !sameStringArray(sourceGameIds, manifest.sourceGameIds)
    || !sameStringArray(activeBatchIds, manifest.activeBatchIds)
    || !sameStringArray(completedGameIds, manifest.completedGameIds)
    || !sameStringArray(skippedGameIds, manifest.skippedGameIds)
    || !sameFailedAttempts(failedAttempts, manifest.failedAttempts);

  if (!changed) return { manifest, changed: false, issues };
  return {
    manifest: {
      ...manifest,
      sourceGameIds,
      activeBatchIds,
      completedGameIds,
      skippedGameIds,
      failedAttempts,
      updatedAt: now,
    },
    changed: true,
    issues,
  };
}

export function withReviewRunGameFailed(
  manifest: ReviewRunManifest,
  gameId: string,
  attempts: number,
  lastFailedAt: number,
  now = Date.now(),
): ReviewRunManifest {
  if (manifest.completedGameIds.includes(gameId) || manifest.skippedGameIds.includes(gameId)) return manifest;
  return {
    ...manifest,
    failedAttempts: [
      ...manifest.failedAttempts.filter(attempt => attempt.gameId !== gameId),
      { gameId, attempts, lastFailedAt },
    ],
    updatedAt: now,
  };
}

export function withReviewRunGameSkipped(
  manifest: ReviewRunManifest,
  gameId: string,
  now = Date.now(),
): ReviewRunManifest {
  return {
    ...manifest,
    skippedGameIds: manifest.skippedGameIds.includes(gameId)
      ? manifest.skippedGameIds
      : [...manifest.skippedGameIds, gameId],
    failedAttempts: manifest.failedAttempts.filter(attempt => attempt.gameId !== gameId),
    completedGameIds: manifest.completedGameIds.filter(id => id !== gameId),
    updatedAt: now,
  };
}

export function withReviewRunAutoRetryEnabled(
  manifest: ReviewRunManifest,
  enabled: boolean,
  now = Date.now(),
): ReviewRunManifest {
  if (manifest.autoRetryEnabled === enabled) return manifest;
  return {
    ...manifest,
    autoRetryEnabled: enabled,
    updatedAt: now,
  };
}

export function withReviewRunUnattendedRunEnabled(
  manifest: ReviewRunManifest,
  enabled: boolean,
  now = Date.now(),
): ReviewRunManifest {
  if (manifest.unattendedRunEnabled === enabled) return manifest;
  return {
    ...manifest,
    unattendedRunEnabled: enabled,
    updatedAt: now,
  };
}

export function withReviewRunActiveBatchGameMoved(
  manifest: ReviewRunManifest,
  gameId: string,
  direction: 'up' | 'down',
  lockedGameIds: readonly string[] = [],
  now = Date.now(),
): ReviewRunManifest {
  const fromIndex = manifest.activeBatchIds.indexOf(gameId);
  if (fromIndex < 0 || lockedGameIds.includes(gameId)) return manifest;
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= manifest.activeBatchIds.length) return manifest;
  const targetGameId = manifest.activeBatchIds[toIndex];
  if (!targetGameId || lockedGameIds.includes(targetGameId)) return manifest;
  const activeBatchIds = [...manifest.activeBatchIds];
  activeBatchIds[fromIndex] = targetGameId;
  activeBatchIds[toIndex] = gameId;
  return {
    ...manifest,
    activeBatchIds,
    updatedAt: now,
  };
}

export function withReviewRunGameSkippedFromActiveBatch(
  manifest: ReviewRunManifest,
  gameId: string,
  now = Date.now(),
): ReviewRunManifest {
  const activeBatchIds = manifest.activeBatchIds.filter(id => id !== gameId);
  const activeChanged = activeBatchIds.length !== manifest.activeBatchIds.length;
  const skippedChanged = !manifest.skippedGameIds.includes(gameId);
  const failedAttempts = manifest.failedAttempts.filter(attempt => attempt.gameId !== gameId);
  const completedGameIds = manifest.completedGameIds.filter(id => id !== gameId);
  const failureChanged = failedAttempts.length !== manifest.failedAttempts.length;
  const completionChanged = completedGameIds.length !== manifest.completedGameIds.length;
  if (!activeChanged && !skippedChanged && !failureChanged && !completionChanged) return manifest;
  return {
    ...manifest,
    activeBatchIds,
    skippedGameIds: skippedChanged ? [...manifest.skippedGameIds, gameId] : manifest.skippedGameIds,
    failedAttempts,
    completedGameIds,
    updatedAt: now,
  };
}

export function hydrateReviewRunFailureCounts(
  manifest: ReviewRunManifest,
  failureStates: readonly ReviewRunFailureState[],
  now = Date.now(),
): ReviewRunHydrationResult {
  let changed = false;
  const completedIds = new Set(manifest.completedGameIds);
  const skippedIds = new Set(manifest.skippedGameIds);
  const failedByGameId = new Map(manifest.failedAttempts.map(attempt => [attempt.gameId, attempt]));

  for (const state of failureStates) {
    if (completedIds.has(state.gameId)) continue;
    if (state.skipped) {
      if (!skippedIds.has(state.gameId)) {
        skippedIds.add(state.gameId);
        changed = true;
      }
      failedByGameId.delete(state.gameId);
      continue;
    }
    if (skippedIds.has(state.gameId)) continue;
    const existing = failedByGameId.get(state.gameId);
    if (!existing || existing.attempts !== state.attempts || existing.lastFailedAt !== state.lastFailedAt) {
      failedByGameId.set(state.gameId, {
        gameId:       state.gameId,
        attempts:     state.attempts,
        lastFailedAt: state.lastFailedAt,
      });
      changed = true;
    }
  }

  const filteredFailures = [...failedByGameId.values()].filter(attempt =>
    !completedIds.has(attempt.gameId) && !skippedIds.has(attempt.gameId),
  );
  if (filteredFailures.length !== manifest.failedAttempts.length) changed = true;
  if (!changed) return { manifest, changed: false };
  return {
    manifest: {
      ...manifest,
      failedAttempts: filteredFailures,
      skippedGameIds: [...skippedIds],
      updatedAt: now,
    },
    changed: true,
  };
}

export function isReviewRunStale(input: ReviewRunStaleInput): boolean {
  const staleExcludedState =
    input.paused
    || input.pauseReason === 'hidden'
    || input.pauseReason === 'reload'
    || input.pauseReason === 'breaker'
    || input.lifecycleState === 'user-paused'
    || input.lifecycleState === 'hidden-suspended'
    || input.lifecycleState === 'interrupted-after-reload'
    || input.lifecycleState === 'retrying-failed-game'
    || input.lifecycleState === 'breaker-paused'
    || input.retryingFailedGame;
  return input.running
    && !staleExcludedState
    && input.lastProgressSeconds !== null
    && input.lastProgressSeconds >= input.staleThresholdSeconds;
}

export function reviewSearchIdentityMatches(
  expected: ReviewSearchIdentitySnapshot | null,
  current: ReviewSearchIdentitySnapshot | null,
): boolean {
  return !!expected
    && !!current
    && expected.generation === current.generation
    && expected.gameId === current.gameId
    && expected.depth === current.depth
    && expected.fen === current.fen
    && expected.nodePath === current.nodePath
    && expected.parentPath === current.parentPath;
}








export function isReviewRunHygieneCadenceBoundary(
  completedCount: number,
  cadence: number = REVIEW_RUN_HYGIENE_CADENCE,
): boolean {
  return cadence > 0 && completedCount > 0 && completedCount % cadence === 0;
}

export function selectNextReviewRunBatch(params: {
  manifest: ReviewRunManifest;
  libraryGames: readonly ImportedGame[];
  reviewedGameIdsAtRunDepth: ReadonlySet<string>;
  targetBatchSize?: number;
}): ReviewRunNextBatchSelection {
  const targetBatchSize = params.targetBatchSize ?? BULK_REVIEW_TARGET_BATCH_SIZE;
  const gamesById = new Map(params.libraryGames.map(game => [game.id, game]));
  const completedIds = new Set(params.manifest.completedGameIds);
  const skippedIds = new Set(params.manifest.skippedGameIds);
  const allowedSpeeds = new Set(params.manifest.timeControlContext.speeds);
  const eligibleGameIds: string[] = [];
  const eligibleGames: ImportedGame[] = [];

  for (const gameId of params.manifest.sourceGameIds) {
    if (params.reviewedGameIdsAtRunDepth.has(gameId)) continue;
    if (completedIds.has(gameId) || skippedIds.has(gameId)) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;
    if (allowedSpeeds.size > 0 && (!game.timeClass || !allowedSpeeds.has(game.timeClass))) continue;
    eligibleGameIds.push(gameId);
    eligibleGames.push(game);
  }

  const batchGames = eligibleGames.slice(0, targetBatchSize);
  const batchGameIds = batchGames.map(game => game.id);

  return {
    batchGameIds,
    batchGames,
    eligibleGameIds,
    hasMoreAfterBatch: eligibleGameIds.length > batchGameIds.length,
  };
}
