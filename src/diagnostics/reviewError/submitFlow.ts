import type { TreePath } from '../../tree/types';

export interface ReviewErrorSubmitRequest {
  gameId: string;
  path: TreePath;
  openedAt: number;
}

let activeReviewErrorSubmitRequest: ReviewErrorSubmitRequest | null = null;

export function openReviewErrorSubmitFlow(input: { gameId: string; path: TreePath }, openedAt = Date.now()): void {
  const gameId = input.gameId.trim();
  const path = input.path.trim();
  if (!gameId) throw new Error('review-error-submit-game-id-required');
  if (!path) throw new Error('review-error-submit-path-required');
  activeReviewErrorSubmitRequest = {
    gameId,
    path,
    openedAt,
  };
}

export function getReviewErrorSubmitRequest(): ReviewErrorSubmitRequest | null {
  return activeReviewErrorSubmitRequest;
}

export function clearReviewErrorSubmitRequest(): void {
  activeReviewErrorSubmitRequest = null;
}
