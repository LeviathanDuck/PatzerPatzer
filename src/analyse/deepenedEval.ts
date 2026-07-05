import { classifyLoss, type MoveLabel } from '../engine/winchances';
import type { ReviewEngineMetadata } from '../idb';

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
