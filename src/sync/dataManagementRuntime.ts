import { record, Severity } from '../diagnostics';

export const DATA_MANAGEMENT_LOCAL_CHANGE_EVENT = 'patzer:data-management-local-change';

export type DataManagementActionKind =
  | 'review.deleteAll'
  | 'review.deleteAccount'
  | 'games.deleteAll'
  | 'games.deleteAccount'
  | 'puzzles.deleteGenerated'
  | 'puzzles.resetProgress'
  | 'puzzles.clearPgnCache'
  | 'settings.resetGroup';

export type DataManagementDomain = 'review' | 'games' | 'puzzles' | 'settings' | 'pgn-cache';
export type DataManagementReviewStore = 'analysis' | 'game-summaries' | 'retro-results';

export interface DataManagementActionScope {
  gameIds?: readonly string[];
  accountId?: string;
  allGames?: boolean;
  allReview?: boolean;
  settingsGroupId?: string;
}

export interface DataManagementFenceResult {
  owner: string;
  stopped?: number;
  removed?: number;
  forwarded?: boolean;
  message?: string;
}

export interface DataManagementFenceSummary {
  startedAt: number;
  finishedAt: number;
  handlerCount: number;
  failures: number;
  results: DataManagementFenceResult[];
}

export interface DataManagementLocalChangeDetail {
  actionId: string;
  kind: DataManagementActionKind;
  domains: readonly DataManagementDomain[];
  startedAt: number;
  scope: DataManagementActionScope;
  completedAt?: number;
  success?: boolean;
  message?: string;
  counts?: Record<string, number>;
  fence?: DataManagementFenceSummary;
}

export type DataManagementBeforeDeleteFence = (
  detail: DataManagementLocalChangeDetail,
) => void | DataManagementFenceResult | Promise<void | DataManagementFenceResult>;

const beforeDeleteFences = new Set<DataManagementBeforeDeleteFence>();
const reviewResetAtByGameId = new Map<string, number>();
let allReviewResetAt = 0;
let actionSeq = 0;

export function createDataManagementActionId(kind: DataManagementActionKind): string {
  actionSeq = (actionSeq + 1) % Number.MAX_SAFE_INTEGER;
  return `${kind}:${Date.now()}:${actionSeq}`;
}

export function registerDataManagementBeforeDeleteFence(handler: DataManagementBeforeDeleteFence): () => void {
  beforeDeleteFences.add(handler);
  return () => beforeDeleteFences.delete(handler);
}

export function dataManagementActionTouchesReview(detail: DataManagementLocalChangeDetail): boolean {
  return detail.domains.includes('review') || detail.domains.includes('games');
}

export function dataManagementScopeMatchesGameId(scope: DataManagementActionScope, gameId: string | null | undefined): boolean {
  if (!gameId) return false;
  if (scope.allGames || scope.allReview) return true;
  return scope.gameIds?.includes(gameId) === true;
}

export function markDataManagementReviewWriteFence(
  scope: DataManagementActionScope,
  effectiveAt = Date.now(),
): number {
  if (scope.allGames || scope.allReview) allReviewResetAt = Math.max(allReviewResetAt, effectiveAt);
  for (const gameId of scope.gameIds ?? []) {
    reviewResetAtByGameId.set(gameId, Math.max(reviewResetAtByGameId.get(gameId) ?? 0, effectiveAt));
  }
  return effectiveAt;
}

export function isDataManagementReviewWriteStale(gameId: string, requestedAt: number): boolean {
  const scopedResetAt = reviewResetAtByGameId.get(gameId) ?? 0;
  const resetAt = Math.max(allReviewResetAt, scopedResetAt);
  return resetAt > 0 && requestedAt <= resetAt;
}

export function recordDataManagementStaleWriteDrop(
  store: DataManagementReviewStore,
  gameId: string,
  requestedAt: number,
): void {
  record({
    kind: 'sync',
    severity: Severity.Info,
    source: 'sync.dataManagement',
    sourceTag: 'sync',
    message: 'data-management-stale-review-write-dropped',
    metadata: {
      store,
      gameId,
      requestedAt,
      allReviewResetAt,
      scopedResetAt: reviewResetAtByGameId.get(gameId) ?? 0,
    },
    redactionClass: 'safe',
  });
}

export async function runDataManagementBeforeDelete(
  detail: DataManagementLocalChangeDetail,
): Promise<DataManagementFenceSummary> {
  if (dataManagementActionTouchesReview(detail)) markDataManagementReviewWriteFence(detail.scope, Date.now());

  const startedAt = Date.now();
  const results: DataManagementFenceResult[] = [];
  let failures = 0;

  for (const handler of beforeDeleteFences) {
    try {
      const result = await handler(detail);
      if (result) results.push(result);
    } catch (error) {
      failures++;
      record({
        kind: 'sync',
        severity: Severity.Warn,
        source: 'sync.dataManagement',
        sourceTag: 'sync',
        message: 'data-management-before-delete-fence-failed',
        metadata: {
          actionId: detail.actionId,
          kind: detail.kind,
          error: error instanceof Error ? error.message : String(error),
        },
        redactionClass: 'safe',
      });
    }
  }

  return {
    startedAt,
    finishedAt: Date.now(),
    handlerCount: beforeDeleteFences.size,
    failures,
    results,
  };
}

export function emitDataManagementLocalChange(detail: DataManagementLocalChangeDetail): void {
  record({
    kind: 'sync',
    severity: detail.success === false ? Severity.Warn : Severity.Info,
    source: 'sync.dataManagement',
    sourceTag: 'sync',
    message: 'data-management-local-change',
    metadata: {
      actionId: detail.actionId,
      kind: detail.kind,
      domains: [...detail.domains],
      success: detail.success ?? null,
      counts: detail.counts ?? {},
      fenceFailures: detail.fence?.failures ?? 0,
    },
    redactionClass: 'safe',
  });

  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DataManagementLocalChangeDetail>(
    DATA_MANAGEMENT_LOCAL_CHANGE_EVENT,
    { detail },
  ));
}
