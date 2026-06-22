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
