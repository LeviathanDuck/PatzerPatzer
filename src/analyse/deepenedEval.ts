import { classifyLoss, type MoveLabel } from '../engine/winchances';
import type { ReviewEngineMetadata } from '../idb';
import type { TreeNode } from '../tree/types';

export interface ReviewEvalEntry {
  loss?: number;
  label?: MoveLabel;
  depth?: number;
}

export function isDeepenedBeyondReviewStamp(
  entry: ReviewEvalEntry | undefined,
  reviewEngine: ReviewEngineMetadata | undefined,
): boolean {
  if (!entry || !reviewEngine) return false;
  if (entry.depth === undefined || !Number.isFinite(entry.depth)) return false;
  return entry.depth > reviewEngine.reviewDepth;
}

export function labelForReviewEval(
  entry: ReviewEvalEntry | undefined,
  playedBest: boolean,
  showAnnotation: boolean,
  reviewEngine: ReviewEngineMetadata | undefined,
): MoveLabel | null {
  if (!entry || playedBest || !showAnnotation) return null;
  if (isDeepenedBeyondReviewStamp(entry, reviewEngine) && entry.loss !== undefined) {
    return classifyLoss(entry.loss);
  }
  return entry.label ?? (entry.loss !== undefined ? classifyLoss(entry.loss) : null);
}

export function countDeepenedReviewEvals(
  mainline: readonly TreeNode[],
  getEval: (path: string) => ReviewEvalEntry | undefined,
  reviewEngine: ReviewEngineMetadata | undefined,
): number {
  if (!reviewEngine) return 0;
  let count = 0;
  let path = '';
  for (let index = 1; index < mainline.length; index++) {
    const node = mainline[index]!;
    path += node.id;
    if (isDeepenedBeyondReviewStamp(getEval(path), reviewEngine)) count++;
  }
  return count;
}

export function deepenedReviewSummaryText(count: number, reviewDepth: number): string {
  return `${count} eval${count === 1 ? '' : 's'} deepened beyond review depth ${reviewDepth}`;
}
