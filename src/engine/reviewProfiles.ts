// Review profile settings for one-off Review and background Bulk Review.
// Depth/movetime are UCI-generic settings; engine-specific protocol ownership stays elsewhere.

function storedInt(key: string, def: number, min: number, max: number): number {
  const v = parseInt(localStorage.getItem(key) ?? '', 10);
  return (!isNaN(v) && v >= min && v <= max) ? v : def;
}

const LEGACY_REVIEW_DEPTH_KEY  = 'patzer.reviewDepth';
const BULK_REVIEW_DEPTH_KEY    = 'patzer.reviewDepth.bulk';
const BULK_REVIEW_MOVETIME_KEY = 'patzer.reviewMovetime';

export const REVIEW_MOVETIME_MIN = 50;
export const REVIEW_MOVETIME_MAX = 5_000;
export const BULK_REVIEW_MOVETIME_DEFAULT_MS = 750;
export const REVIEW_DEPTH_CHANGED_EVENT = 'patzer:review-depth-changed';

export let reviewDepth = storedInt(LEGACY_REVIEW_DEPTH_KEY, 16, 12, 20);

export function resolveBulkReviewDepth(bulkRaw: string | null, legacyRaw: string | null): number {
  if (bulkRaw !== null) {
    const v = parseInt(bulkRaw, 10);
    if (!isNaN(v) && v >= 12 && v <= 20) return v;
  }
  const legacy = parseInt(legacyRaw ?? '', 10);
  return (!isNaN(legacy) && legacy >= 12 && legacy <= 20) ? legacy : 16;
}

export function resolveBulkReviewMovetime(raw: string | null): number | null {
  if (raw === null) return BULK_REVIEW_MOVETIME_DEFAULT_MS;
  const v = parseInt(raw, 10);
  return (!isNaN(v) && v >= REVIEW_MOVETIME_MIN && v <= REVIEW_MOVETIME_MAX) ? v : BULK_REVIEW_MOVETIME_DEFAULT_MS;
}

function migrateBulkReviewDepth(): number {
  const bulkRaw = localStorage.getItem(BULK_REVIEW_DEPTH_KEY);
  const resolved = resolveBulkReviewDepth(bulkRaw, localStorage.getItem(LEGACY_REVIEW_DEPTH_KEY));
  if (bulkRaw === null) localStorage.setItem(BULK_REVIEW_DEPTH_KEY, String(resolved));
  return resolved;
}

export let bulkReviewDepth: number = migrateBulkReviewDepth();
export let bulkReviewMovetime: number | null = resolveBulkReviewMovetime(localStorage.getItem(BULK_REVIEW_MOVETIME_KEY));

export function setReviewDepth(v: number): void {
  reviewDepth = v;
  localStorage.setItem(LEGACY_REVIEW_DEPTH_KEY, String(v));
}

export function syncReviewDepthSetting(v: number): void {
  reviewDepth = v;
  localStorage.setItem(LEGACY_REVIEW_DEPTH_KEY, String(v));
}

export function setBulkReviewDepth(v: number): void {
  bulkReviewDepth = v;
  localStorage.setItem(BULK_REVIEW_DEPTH_KEY, String(v));
  window.dispatchEvent(new CustomEvent(REVIEW_DEPTH_CHANGED_EVENT, { detail: { reviewDepth: v } }));
}

export function syncBulkReviewDepthSetting(v: number): void {
  bulkReviewDepth = v;
  localStorage.setItem(BULK_REVIEW_DEPTH_KEY, String(v));
}

export function setBulkReviewMovetime(v: number | null): void {
  bulkReviewMovetime = v;
  if (v === null) localStorage.removeItem(BULK_REVIEW_MOVETIME_KEY);
  else localStorage.setItem(BULK_REVIEW_MOVETIME_KEY, String(v));
}

export function resetReviewSettingsRuntimeForDataManagement(): void {
  reviewDepth = 16;
  bulkReviewDepth = 16;
  bulkReviewMovetime = BULK_REVIEW_MOVETIME_DEFAULT_MS;
}
