import { h, type VNode } from 'snabbdom';
import type { ReviewEngineMetadata } from '../../idb';
import type { ImportedGame } from '../../import/types';
import { nodeAtPath } from '../../tree/ops';
import type { TreeNode } from '../../tree/types';
import { adminDiagnosticsTokenAvailable } from '../adminAccess';
import { currentAppRoute } from '../route';
import { record } from '../record';
import { Severity, type DiagnosticMetadata } from '../types';
import type { DiagnosticReportScreenshotAttachment } from '../reporting/reportAssembly';
import {
  packageUploadStatesFromAttachments,
  packageUploadSummary,
  uploadReportScreenshotPackage as uploadSharedReportScreenshotPackage,
  type PackageUploadState,
} from '../reporting/packageUpload';
import { assembleReviewErrorPackage } from './assembler';
import {
  clearReviewErrorSubmitRequest,
  checkReviewErrorRemoteUploadGate,
  createReviewErrorRemoteUploadConsentState,
  getReviewErrorSubmitRequest,
  markReviewErrorPackagePreviewSeen,
  reviewErrorRemoteUploadConsentFromState,
  setReviewErrorRemoteUploadConsent,
  validateReviewErrorScreenshotFiles,
  type ReviewErrorSubmitRequest,
  type ReviewErrorRemoteUploadConsentState,
} from './submitFlow';
import { putReviewErrorPackage } from './storage';
import {
  REVIEW_ERROR_FULL_CONTEXT_CATEGORIES,
  REVIEW_ERROR_PROHIBITED_DATA_CLASSES,
  type ReviewErrorCurrentEngineSettings,
  type ReviewErrorPackage,
  type ReviewErrorScreenshotAttachmentPreview,
} from './types';

export interface ReviewErrorSubmitModalDeps {
  game?: ImportedGame;
  root: TreeNode;
  currentEngineSettings: ReviewErrorCurrentEngineSettings;
  reviewDepth: number;
  analysisComplete: boolean;
  reviewEngine?: ReviewEngineMetadata;
  redraw: () => void;
}

let activeRequestKey: string | null = null;
let memoText = '';
let submitBusy = false;
let submitError: string | null = null;
let submitSuccess: string | null = null;
let remoteConsentState: ReviewErrorRemoteUploadConsentState = createReviewErrorRemoteUploadConsentState();
let screenshotFiles: File[] = [];
let screenshotAttachments: ReviewErrorScreenshotAttachmentPreview[] = [];
let screenshotErrors: string[] = [];
let screenshotUploadStates: PackageUploadState[] = [];
let screenshotUploadSummary = '';
let submittedPackage: ReviewErrorPackage | null = null;
let copyMessage = '';

function requestKey(request: ReviewErrorSubmitRequest): string {
  return `${request.issueId}:${request.gameId}:${request.path}:${request.openedAt}`;
}

function syncRequestState(request: ReviewErrorSubmitRequest): void {
  const key = requestKey(request);
  if (activeRequestKey === key) return;
  activeRequestKey = key;
  memoText = '';
  submitBusy = false;
  submitError = null;
  submitSuccess = null;
  remoteConsentState = markReviewErrorPackagePreviewSeen(createReviewErrorRemoteUploadConsentState());
  screenshotFiles = [];
  screenshotAttachments = [];
  screenshotErrors = [];
  screenshotUploadStates = [];
  screenshotUploadSummary = '';
  submittedPackage = null;
  copyMessage = '';
}

function close(redraw: () => void): void {
  clearReviewErrorSubmitRequest();
  activeRequestKey = null;
  memoText = '';
  submitBusy = false;
  submitError = null;
  submitSuccess = null;
  remoteConsentState = createReviewErrorRemoteUploadConsentState();
  screenshotFiles = [];
  screenshotAttachments = [];
  screenshotErrors = [];
  screenshotUploadStates = [];
  screenshotUploadSummary = '';
  submittedPackage = null;
  copyMessage = '';
  redraw();
}

function movePrefix(ply: number): string {
  const moveNumber = Math.max(1, Math.ceil(ply / 2));
  return ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
}

function gameLabel(game: ImportedGame | undefined): string {
  if (!game) return 'Game unavailable';
  const names = game.white && game.black ? `${game.white} vs ${game.black}` : game.id;
  return game.result ? `${names}, ${game.result}` : names;
}

function reviewLabel(deps: ReviewErrorSubmitModalDeps): string {
  if (deps.reviewEngine) {
    return `${deps.reviewEngine.engineName}, depth ${deps.reviewEngine.reviewDepth}`;
  }
  return deps.analysisComplete ? `Stored review complete, depth ${deps.reviewDepth}` : 'Stored review is not complete';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setCopyMessage(request: ReviewErrorSubmitRequest, message: string, redraw: () => void): void {
  if (activeRequestKey !== requestKey(request)) return;
  copyMessage = message;
  redraw();
}

function copyTextToClipboard(
  request: ReviewErrorSubmitRequest,
  text: string,
  successMessage: string,
  redraw: () => void,
): void {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('clipboard-unavailable');
    copyMessage = 'Copying...';
    redraw();
    void navigator.clipboard.writeText(text).then(() => {
      setCopyMessage(request, successMessage, redraw);
    }).catch(() => {
      setCopyMessage(request, 'Copy failed.', redraw);
    });
  } catch {
    copyMessage = 'Copy failed.';
    redraw();
  }
}

function packageGameLabel(pkg: ReviewErrorPackage): string {
  const { metadata } = pkg.game;
  const names = metadata.white && metadata.black ? `${metadata.white} vs ${metadata.black}` : pkg.gameId;
  return metadata.result ? `${names}, ${metadata.result}` : names;
}

function packageMoveLabel(pkg: ReviewErrorPackage): string {
  return `${movePrefix(pkg.selectedMove.ply)} ${pkg.selectedMove.san ?? pkg.selectedMove.uci ?? pkg.selectedMove.path}`;
}

function packageReviewLabel(pkg: ReviewErrorPackage): string {
  if (pkg.analysis.reviewEngine) {
    return `${pkg.analysis.reviewEngine.engineName}, depth ${pkg.analysis.reviewEngine.reviewDepth}`;
  }
  return `${pkg.analysis.status}, depth ${pkg.analysis.analysisDepth}`;
}

function screenshotUploadText(): string {
  if (screenshotUploadStates.length === 0) return 'none';
  const uploaded = screenshotUploadStates.filter(item => item.status === 'uploaded').length;
  return screenshotUploadSummary || packageUploadSummary(uploaded, screenshotUploadStates.length);
}

function packageTextForCopy(pkg: ReviewErrorPackage): string {
  const screenshotNames = pkg.preview.screenshotAttachments.map(attachment => attachment.fileName).join(', ') || 'none';
  return [
    `Issue ID: ${pkg.packageId}`,
    `Package ID: ${pkg.packageId}`,
    `Package kind: ${pkg.packageKind}`,
    `Route: ${pkg.session.route}`,
    `Game: ${packageGameLabel(pkg)}`,
    `Game ID: ${pkg.gameId}`,
    `Move: ${packageMoveLabel(pkg)}`,
    `Path: ${pkg.selectedMove.path}`,
    `Review: ${packageReviewLabel(pkg)}`,
    `Screenshots: ${screenshotNames}`,
    `Screenshot upload: ${screenshotUploadText()}`,
    `Captured at: ${pkg.createdAt}`,
  ].join('\n');
}

function renderIssueCopyPanel(request: ReviewErrorSubmitRequest, redraw: () => void): VNode {
  return h('div.report-issue-modal__copy-panel', [
    h('div.report-issue-modal__issue-id', [
      h('span', 'Issue ID'),
      h('code', request.issueId),
    ]),
    h('div.report-issue-modal__copy-actions', [
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button' },
        on: { click: () => copyTextToClipboard(request, request.issueId, 'Issue ID copied.', redraw) },
      }, 'Copy ID'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: !submittedPackage },
        on: {
          click: () => {
            if (!submittedPackage) {
              setCopyMessage(request, 'Save the package before copying package text.', redraw);
              return;
            }
            copyTextToClipboard(request, packageTextForCopy(submittedPackage), 'Package text copied.', redraw);
          },
        },
      }, 'Copy package text'),
    ]),
    copyMessage ? h('p.report-issue-modal__copy-status', copyMessage) : null,
  ]);
}

function safeReviewErrorAssetFilename(fileName: string, index: number): string {
  const fallback = `review-error-screenshot-${index + 1}.png`;
  const trimmed = fileName.trim() || fallback;
  const normalized = trimmed
    .replace(/[/\\]+/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 120);
  return normalized || fallback;
}

function sharedScreenshotAttachments(): DiagnosticReportScreenshotAttachment[] {
  return screenshotAttachments.map((attachment, index) => ({
    ...attachment,
    assetFilename: safeReviewErrorAssetFilename(attachment.fileName, index),
  }));
}

function validScreenshotFiles(files: File[], attachments: ReviewErrorScreenshotAttachmentPreview[]): File[] {
  const validByKey = new Set(attachments.map(attachment => `${attachment.fileName}:${attachment.sizeBytes}:${attachment.mimeType}`));
  return files
    .slice(0, 10)
    .filter((file, index) => validByKey.has(`${file.name.trim() || `screenshot-${index + 1}`}:${Math.floor(file.size)}:${file.type}`));
}

function recordReviewErrorUploadEvent(
  message: string,
  severity: Severity = Severity.Info,
  extraMetadata: DiagnosticMetadata = {},
): void {
  try {
    record({
      kind: 'user-report',
      severity,
      route: currentAppRoute(),
      source: 'diagnostics.reviewError',
      sourceTag: 'diagnostics.reviewError',
      message,
      metadata: {
        timestamp: Date.now(),
        ...extraMetadata,
      },
      redactionClass: 'safe',
    });
  } catch (error) {
    console.warn('[diagnostics] review error upload failed to record flow event', error);
  }
}

async function uploadReviewErrorScreenshots(pkg: ReviewErrorPackage, redraw: () => void): Promise<void> {
  const attachments = sharedScreenshotAttachments();
  if (!attachments.length) return;
  await uploadSharedReportScreenshotPackage({
    packageId: pkg.packageId,
    packageKind: 'review-error',
    issueId: pkg.packageId,
    reportId: pkg.packageId,
    capturedAt: pkg.createdAt,
    route: pkg.session.route,
    attachments,
    files: screenshotFiles,
    manifestExtras: {
      localPackageId: pkg.packageId,
      reviewErrorPackage: pkg,
      reviewErrorSummary: {
        gameId: pkg.gameId,
        selectedPath: pkg.selectedMove.path,
        selectedMove: {
          ply: pkg.selectedMove.ply,
          ...(pkg.selectedMove.san !== undefined ? { san: pkg.selectedMove.san } : {}),
          ...(pkg.selectedMove.uci !== undefined ? { uci: pkg.selectedMove.uci } : {}),
          ...(pkg.selectedMove.fenBefore !== undefined ? { fenBefore: pkg.selectedMove.fenBefore } : {}),
          ...(pkg.selectedMove.fenAfter !== undefined ? { fenAfter: pkg.selectedMove.fenAfter } : {}),
        },
        review: {
          status: pkg.analysis.status,
          depth: pkg.analysis.analysisDepth,
          updatedAt: pkg.analysis.updatedAt,
          ...(pkg.analysis.reviewEngine !== undefined ? { reviewEngine: pkg.analysis.reviewEngine } : {}),
        },
      },
    },
    setUploadStates: states => {
      screenshotUploadStates = states;
    },
    setUploadSummary: summary => {
      screenshotUploadSummary = summary;
    },
    updateUploadState: (assetFilename, patchState) => {
      screenshotUploadStates = screenshotUploadStates.map(item => (
        item.assetFilename === assetFilename ? { ...item, ...patchState } : item
      ));
      redraw();
    },
    rerender: redraw,
    recordEvent: (message, severity = Severity.Info, extraMetadata = {}) => recordReviewErrorUploadEvent(message, severity, {
      ...extraMetadata,
      reviewErrorPackageId: pkg.packageId,
      gameId: pkg.gameId,
      selectedPath: pkg.selectedMove.path,
    }),
  });
}

function submitDisabled(deps: ReviewErrorSubmitModalDeps, request: ReviewErrorSubmitRequest): boolean {
  return (
    submitBusy ||
    submitSuccess !== null ||
    !deps.game ||
    deps.game.id !== request.gameId ||
    !deps.analysisComplete ||
    !memoText.trim() ||
    screenshotErrors.length > 0
  );
}

function submitPackage(deps: ReviewErrorSubmitModalDeps, request: ReviewErrorSubmitRequest): void {
  if (submitDisabled(deps, request)) {
    if (!memoText.trim()) submitError = 'Enter a memo before saving the package.';
    else if (!deps.game || deps.game.id !== request.gameId) submitError = 'The selected game changed. Reopen Review Error Bug from the move list.';
    else if (!deps.analysisComplete) submitError = 'The selected game does not have completed review analysis loaded.';
    else if (screenshotErrors.length > 0) submitError = screenshotErrors[0] ?? 'Fix screenshot attachment errors before saving.';
    deps.redraw();
    return;
  }

  const game = deps.game;
  if (!game) {
    submitError = 'The selected game changed. Reopen Review Error Bug from the move list.';
    deps.redraw();
    return;
  }
  submitBusy = true;
  submitError = null;
  deps.redraw();

  void (async () => {
    const pkg = await assembleReviewErrorPackage({
      packageId: request.issueId,
      game,
      root: deps.root,
      path: request.path,
      memo: memoText,
      currentEngineSettings: deps.currentEngineSettings,
      screenshotAttachments,
      remoteUploadConsent: reviewErrorRemoteUploadConsentFromState(remoteConsentState),
    });
    await putReviewErrorPackage(pkg);
    submittedPackage = pkg;
    submitSuccess = `Saved package ${pkg.packageId}`;

    const remoteGate = checkReviewErrorRemoteUploadGate(remoteConsentState, adminDiagnosticsTokenAvailable());
    if (!remoteGate.ok) {
      submitSuccess = `Saved package ${pkg.packageId}. Remote upload skipped: ${remoteGate.reason}`;
      memoText = '';
      return;
    }
    if (screenshotAttachments.length === 0) {
      submitSuccess = `Saved package ${pkg.packageId}. No screenshots attached for remote upload.`;
      memoText = '';
      return;
    }

    try {
      await uploadReviewErrorScreenshots(pkg, deps.redraw);
      submitSuccess = `Saved and uploaded package ${pkg.packageId}`;
      memoText = '';
    } catch (error) {
      submitError = `Review error package saved locally, but remote screenshot upload failed: ${errorText(error)}`;
      submitSuccess = `Saved package ${pkg.packageId}`;
    }
  })()
    .catch(error => {
      submitError = `Review error package save failed: ${errorText(error)}`;
    })
    .finally(() => {
      submitBusy = false;
      deps.redraw();
    });
}

function handleScreenshotInput(event: Event, redraw: () => void): void {
  const files = Array.from((event.target as HTMLInputElement).files ?? []);
  const result = validateReviewErrorScreenshotFiles(files);
  screenshotFiles = validScreenshotFiles(files, result.attachments);
  screenshotAttachments = result.attachments;
  screenshotUploadStates = packageUploadStatesFromAttachments(sharedScreenshotAttachments());
  screenshotUploadSummary = '';
  screenshotErrors = result.ok ? [] : result.errors;
  submitError = null;
  redraw();
}

function renderPackagePreview(): VNode {
  return h('section.review-error-modal__preview', [
    h('h3', 'Full package preview'),
    h('p',
      'A remote Review Error Bug package can only be uploaded after this preview is shown and explicit consent is checked. Local save does not upload.'),
    h('div.review-error-modal__preview-grid', [
      h('div', [
        h('h4', 'May include'),
        h('ul', REVIEW_ERROR_FULL_CONTEXT_CATEGORIES.map(category => h('li', category))),
      ]),
      h('div', [
        h('h4', 'Always excluded'),
        h('ul', REVIEW_ERROR_PROHIBITED_DATA_CLASSES.map(dataClass => h('li', dataClass))),
      ]),
    ]),
  ]);
}

function renderScreenshotPreview(submitLocked: boolean, redraw: () => void): VNode {
  return h('section.review-error-modal__screenshots', [
    h('h3', 'Screenshots'),
    h('p', 'Optional admin-only screenshots. Accepted files: PNG, JPEG, WebP; max 10 MB each; max 10 files. File bytes upload only after consent and local package save.'),
    h('input.review-error-modal__file', {
      attrs: {
        type: 'file',
        accept: 'image/png,image/jpeg,image/webp',
        multiple: true,
        disabled: submitLocked,
      },
      on: { change: (event: Event) => handleScreenshotInput(event, redraw) },
    }),
    screenshotAttachments.length > 0
      ? h('ul.review-error-modal__attachment-list', screenshotAttachments.map(attachment => (
        h('li', `${attachment.fileName} - ${attachment.mimeType}, ${Math.round(attachment.sizeBytes / 1024)} KB`)
      )))
      : h('p.review-error-modal__muted', 'No screenshots attached.'),
    ...screenshotErrors.map(error => h('p.review-error-modal__error', error)),
  ]);
}

function screenshotStatusLabel(item: PackageUploadState): string {
  if (item.status === 'uploading') return item.progress === null ? 'Uploading' : `Uploading ${item.progress}%`;
  if (item.status === 'uploaded') return 'Uploaded';
  if (item.status === 'failed') return `Failed${item.message && item.message !== 'Failed' ? `: ${item.message}` : ''}`;
  return 'Queued';
}

function renderScreenshotUploadProgress(): VNode | null {
  if (screenshotUploadStates.length === 0) return null;
  const uploaded = screenshotUploadStates.filter(item => item.status === 'uploaded').length;
  const expected = screenshotUploadStates.length;
  return h('section.review-error-modal__upload-progress', [
    h('div.review-error-modal__upload-summary', [
      h('span.review-error-modal__upload-title', 'Screenshot upload'),
      h('span.review-error-modal__upload-count', screenshotUploadSummary || packageUploadSummary(uploaded, expected)),
    ]),
    h('ul.review-error-modal__upload-list', screenshotUploadStates.map(item => {
      const progress = Math.max(0, Math.min(100, item.progress ?? (item.status === 'uploaded' ? 100 : 0)));
      return h(`li.review-error-modal__upload-item.review-error-modal__upload-item--${item.status}`, [
        h('div.review-error-modal__upload-row', [
          h('span.review-error-modal__upload-name', item.filename),
          h('span.review-error-modal__upload-state', screenshotStatusLabel(item)),
        ]),
        h('div.review-error-modal__upload-meta', [
          h('span', item.assetFilename),
          h('span', `${item.mimeType}, ${Math.round(item.sizeBytes / 1024)} KB`),
        ]),
        h('div.review-error-modal__upload-bar', {
          attrs: { style: `--upload-progress: ${progress}%;` },
        }, [
          h('span'),
        ]),
      ]);
    })),
  ]);
}

function renderRemoteConsent(redraw: () => void): VNode {
  const adminTokenReady = adminDiagnosticsTokenAvailable();
  const remoteGate = checkReviewErrorRemoteUploadGate(remoteConsentState, adminTokenReady);

  return h('section.review-error-modal__remote', [
    h('label.review-error-modal__checkbox', [
      h('input', {
        attrs: {
          type: 'checkbox',
          checked: remoteConsentState.explicitConsent,
        },
        on: {
          change: (event: Event) => {
            remoteConsentState = setReviewErrorRemoteUploadConsent(
              remoteConsentState,
              (event.target as HTMLInputElement).checked,
            );
            submitError = null;
            redraw();
          },
        },
      }),
      h('span', 'I reviewed the full-context categories and consent before any future remote upload of this package.'),
    ]),
    h('p.review-error-modal__muted', remoteGate.ok
      ? 'Remote screenshot upload will run after the local package is saved.'
      : remoteGate.reason),
  ]);
}

export function renderReviewErrorPackageSubmitModal(deps: ReviewErrorSubmitModalDeps): VNode | null {
  const request = getReviewErrorSubmitRequest();
  if (!request) return null;
  syncRequestState(request);

  const node = nodeAtPath(deps.root, request.path);
  const moveLabel = node
    ? `${movePrefix(node.ply)} ${node.san ?? node.uci ?? request.path}`
    : request.path;
  const disabled = submitDisabled(deps, request);

  return h('div.review-error-modal', [
    h('div.review-error-modal__backdrop', {
      on: { click: () => close(deps.redraw) },
    }),
    h('div.review-error-modal__card', {
      on: { click: (event: Event) => event.stopPropagation() },
    }, [
      h('div.review-error-modal__header', [
        h('div', [
          h('h2', 'Review Error Bug'),
          h('p.review-error-modal__subtitle', 'Admin-only local diagnostic package'),
        ]),
        h('button.review-error-modal__close', {
          attrs: { type: 'button', disabled: submitBusy, title: 'Close' },
          on: { click: () => close(deps.redraw) },
        }, 'Close'),
      ]),
      h('div.review-error-modal__body', [
        renderIssueCopyPanel(request, deps.redraw),
        h('div.review-error-modal__summary', [
          h('div', [h('span', 'Game'), h('strong', gameLabel(deps.game))]),
          h('div', [h('span', 'Move'), h('strong', moveLabel)]),
          h('div', [h('span', 'Path'), h('code', request.path)]),
          h('div', [h('span', 'Review'), h('strong', reviewLabel(deps))]),
        ]),
        h('p.review-error-modal__warning',
          'This can save a full admin diagnostic package locally. Remote upload requires preview, explicit consent, and an admin token.'),
        renderPackagePreview(),
        renderScreenshotPreview(submitBusy || submitSuccess !== null, deps.redraw),
        h('label.review-error-modal__label', { attrs: { for: 'review-error-memo' } }, 'Admin memo'),
        h('textarea.review-error-modal__memo', {
          attrs: {
            id: 'review-error-memo',
            rows: 5,
            placeholder: 'Describe what looked wrong about this move eval.',
            disabled: submitBusy || submitSuccess !== null,
          },
          props: { value: memoText },
          on: {
            input: (event: Event) => {
              memoText = (event.target as HTMLTextAreaElement).value;
              submitError = null;
              deps.redraw();
            },
          },
        }),
        renderRemoteConsent(deps.redraw),
        renderScreenshotUploadProgress(),
        submitError ? h('p.review-error-modal__error', submitError) : null,
        submitSuccess ? h('p.review-error-modal__success', submitSuccess) : null,
      ]),
      h('div.review-error-modal__actions', [
        h('button.review-error-modal__secondary', {
          attrs: { type: 'button', disabled: submitBusy },
          on: { click: () => close(deps.redraw) },
        }, submitSuccess ? 'Close' : 'Cancel'),
        h('button.review-error-modal__primary', {
          attrs: {
            type: 'button',
            disabled,
          },
          on: { click: () => submitPackage(deps, request) },
        }, submitBusy ? 'Saving...' : 'Save package'),
      ]),
    ]),
  ]);
}
