import type { TreePath } from '../../tree/types';
import type { ReviewErrorRemoteUploadConsent, ReviewErrorScreenshotAttachmentPreview } from './types';

export const REVIEW_ERROR_SCREENSHOT_ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
] as const);

export const REVIEW_ERROR_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;
export const REVIEW_ERROR_SCREENSHOT_MAX_FILES = 10;

export const REVIEW_ERROR_REMOTE_PREVIEW_REQUIRED_MESSAGE = 'Review the full package context before remote upload.';
export const REVIEW_ERROR_REMOTE_CONSENT_REQUIRED_MESSAGE = 'Confirm consent before remote upload.';
export const REVIEW_ERROR_REMOTE_ADMIN_REQUIRED_MESSAGE = 'Admin token is required before remote upload.';

export interface ReviewErrorRemoteUploadConsentState {
  previewSeen: boolean;
  explicitConsent: boolean;
  previewShownAt?: string;
  consentedAt?: string;
}

export type ReviewErrorRemoteUploadGateResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface ReviewErrorScreenshotFileLike {
  name: string;
  type: string;
  size: number;
  lastModified?: number;
}

export type ReviewErrorScreenshotValidationResult =
  | { ok: true; attachments: ReviewErrorScreenshotAttachmentPreview[] }
  | { ok: false; errors: string[]; attachments: ReviewErrorScreenshotAttachmentPreview[] };

export interface ReviewErrorSubmitRequest {
  gameId: string;
  path: TreePath;
  openedAt: number;
}

let activeReviewErrorSubmitRequest: ReviewErrorSubmitRequest | null = null;

export function createReviewErrorRemoteUploadConsentState(): ReviewErrorRemoteUploadConsentState {
  return {
    previewSeen: false,
    explicitConsent: false,
  };
}

export function markReviewErrorPackagePreviewSeen(
  state: ReviewErrorRemoteUploadConsentState,
  shownAt = new Date().toISOString(),
): ReviewErrorRemoteUploadConsentState {
  return {
    ...state,
    previewSeen: true,
    previewShownAt: shownAt,
    ...(state.explicitConsent ? { consentedAt: state.consentedAt ?? shownAt } : {}),
  };
}

export function setReviewErrorRemoteUploadConsent(
  state: ReviewErrorRemoteUploadConsentState,
  explicitConsent: boolean,
  consentedAt = new Date().toISOString(),
): ReviewErrorRemoteUploadConsentState {
  if (!explicitConsent) {
    return {
      previewSeen: state.previewSeen,
      explicitConsent: false,
      ...(state.previewShownAt ? { previewShownAt: state.previewShownAt } : {}),
    };
  }

  return {
    ...state,
    explicitConsent: true,
    consentedAt,
  };
}

export function reviewErrorRemoteUploadConsentFromState(
  state: ReviewErrorRemoteUploadConsentState,
): ReviewErrorRemoteUploadConsent {
  return {
    ...(state.previewShownAt ? { previewShownAt: state.previewShownAt } : {}),
    explicitConsent: state.previewSeen && state.explicitConsent,
    ...(state.previewSeen && state.explicitConsent && state.consentedAt ? { consentedAt: state.consentedAt } : {}),
    localSaveOnly: !(state.previewSeen && state.explicitConsent),
  };
}

export function checkReviewErrorRemoteUploadGate(
  state: ReviewErrorRemoteUploadConsentState,
  adminTokenAvailable: boolean,
): ReviewErrorRemoteUploadGateResult {
  if (!adminTokenAvailable) return { ok: false, reason: REVIEW_ERROR_REMOTE_ADMIN_REQUIRED_MESSAGE };
  if (!state.previewSeen) return { ok: false, reason: REVIEW_ERROR_REMOTE_PREVIEW_REQUIRED_MESSAGE };
  if (!state.explicitConsent) return { ok: false, reason: REVIEW_ERROR_REMOTE_CONSENT_REQUIRED_MESSAGE };
  return { ok: true };
}

export function assertReviewErrorRemoteUploadAllowed(
  state: ReviewErrorRemoteUploadConsentState,
  adminTokenAvailable: boolean,
): void {
  const result = checkReviewErrorRemoteUploadGate(state, adminTokenAvailable);
  if (!result.ok) throw new Error(result.reason);
}

export function validateReviewErrorScreenshotFiles(
  files: ReviewErrorScreenshotFileLike[],
): ReviewErrorScreenshotValidationResult {
  const attachments: ReviewErrorScreenshotAttachmentPreview[] = [];
  const errors: string[] = [];

  if (files.length > REVIEW_ERROR_SCREENSHOT_MAX_FILES) {
    errors.push(`Attach at most ${REVIEW_ERROR_SCREENSHOT_MAX_FILES} screenshots.`);
  }

  files.slice(0, REVIEW_ERROR_SCREENSHOT_MAX_FILES).forEach((file, index) => {
    const label = file.name.trim() || `screenshot-${index + 1}`;
    if (!REVIEW_ERROR_SCREENSHOT_ALLOWED_TYPES.has(file.type as ReviewErrorScreenshotAttachmentPreview['mimeType'])) {
      errors.push(`${label}: use PNG, JPEG, or WebP.`);
      return;
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
      errors.push(`${label}: file is empty or unreadable.`);
      return;
    }
    if (file.size > REVIEW_ERROR_SCREENSHOT_MAX_BYTES) {
      errors.push(`${label}: file must be 10 MB or smaller.`);
      return;
    }

    attachments.push({
      fileName: label,
      mimeType: file.type as ReviewErrorScreenshotAttachmentPreview['mimeType'],
      sizeBytes: Math.floor(file.size),
      ...(Number.isFinite(file.lastModified) ? { lastModified: file.lastModified } : {}),
    });
  });

  return errors.length > 0 ? { ok: false, errors, attachments } : { ok: true, attachments };
}

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
