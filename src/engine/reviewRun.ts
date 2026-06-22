import type { ImportedGame } from '../import/types';

export const BULK_REVIEW_TARGET_BATCH_SIZE = 25;

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
  | 'canceled';

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
  timeControlContext: ReviewRunTimeControlContext;
  orderingContext: ReviewRunOrderingContext;
  activeBatchIds: string[];
  completedGameIds: string[];
  failedAttempts: ReviewRunFailedAttempt[];
  skippedGameIds: string[];
  lifecycleState: ReviewRunLifecycleState;
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

export interface ReviewRunStaleInput {
  running: boolean;
  paused: boolean;
  pauseReason: 'user' | 'hidden' | 'reload' | null;
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

export function createReviewRunId(now = Date.now()): string {
  return `review-run-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createReviewRunManifest(params: {
  sourceMode: ReviewRunSourceMode;
  sourceGameIds: string[];
  reviewDepth: number;
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
    timeControlContext: params.timeControlContext ?? { speeds: [] },
    orderingContext:    params.orderingContext ?? { sortKey: 'visible', sortDirection: 'desc' },
    activeBatchIds:     [...(params.activeBatchIds ?? [])],
    completedGameIds:   [],
    failedAttempts:     [],
    skippedGameIds:     [],
    lifecycleState:     'running',
    createdAt:          now,
    updatedAt:          now,
  };
}

export function gameIdsInVisibleOrder(games: readonly ImportedGame[]): string[] {
  return games.map(game => game.id);
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
  const batchGames = firstReviewRunBatch(games);
  return {
    batchGames,
    sourceContext: {
      ...sourceContext,
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
    updatedAt: now,
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
    || input.lifecycleState === 'user-paused'
    || input.lifecycleState === 'hidden-suspended'
    || input.lifecycleState === 'interrupted-after-reload'
    || input.lifecycleState === 'retrying-failed-game'
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
