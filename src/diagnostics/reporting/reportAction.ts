import { init, classModule, attributesModule, eventListenersModule, propsModule, h, type VNode } from 'snabbdom';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../../ui/controlExplainer';

function activateOnKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}
import { getSessionId } from '../id';
import { record } from '../record';
import { currentAppRoute, sanitizeAppRoute } from '../route';
import { Severity } from '../types';
import type { DiagnosticMetadata } from '../types';
import {
  assembleReport,
  type DiagnosticReport,
  type DiagnosticReportScreenshotAttachment,
} from './reportAssembly';
import { captureEnvironmentContext, captureRouteContext } from './reportContext';
import { renderReportForm, type ReportFormAction, type ReportFormState } from './reportForm';
import {
  discardReportIssueDraft,
  draftAttachmentsFromScreenshots,
  filesFromDraftScreenshots,
  formStateFromDraft,
  loadActiveReportIssueDraft,
  markReportIssueDraftSubmitted,
  readActiveReportIssueDraftSummary,
  saveReportIssueDraft,
  type ActiveReportIssueDraftSummary,
} from './reportDraftStore';
import type { ReportIssueDraft } from './reportDraftTypes';
import { createReportIssueId } from './reportIssueId';
import {
  applyPreviewStateToReport,
  defaultPreviewState,
  renderReportPreview,
  type PreviewAction,
  type PreviewState,
} from './reportPreview';
import { saveReport } from './reportStore';
import {
  packageUploadStatesFromAttachments as screenshotUploadStatesFromAttachments,
  packageUploadSummary as screenshotUploadSummary,
  type PackageUploadState,
} from './packageUpload';
import {
  validateReviewErrorScreenshotFiles,
  type ReviewErrorScreenshotFileLike,
} from '../reviewError/submitFlow';

export interface ReportContext {
  route: string;
  triggeredBy: string;
  extraTags: string[];
}

export interface ReportSession {
  id: string;
  issueId: string;
  timestamp: number;
  routeAtTrigger: string;
}

type ReportFlowStep = 'form' | 'preview' | 'submitting' | 'done';
type ReportDraftSaveStatus = 'loading' | 'saving' | 'saved' | 'error';
type ReportOutcome =
  | 'closed'
  | 'saved-local'
  | 'uploaded'
  | 'upload-not-available'
  | 'upload-failed'
  | 'local-save-failed'
  | 'cancelled'
  | 'discarded';

interface ReportFlowState {
  draftId: string;
  draftCreatedAt: number;
  draftStatus: ReportDraftSaveStatus;
  session: ReportSession;
  context: Required<ReportContext>;
  step: ReportFlowStep;
  form: ReportFormState;
  preview: PreviewState;
  report: DiagnosticReport | null;
  adminTokenAvailable: boolean;
  screenshotFiles: File[];
  screenshotAttachments: DiagnosticReportScreenshotAttachment[];
  screenshotErrors: string[];
  screenshotUploadStates: ScreenshotUploadState[];
  screenshotUploadSummary: string;
  statusMessage: string;
  errorMessage: string;
  copyMessage: string;
  outcome: ReportOutcome | null;
}

type ScreenshotUploadState = PackageUploadState;
const REPORT_DRAFT_SAVE_DELAY_MS = 250;

let modalHost: HTMLElement | null = null;
let modalVNode: Element | VNode | null = null;
let flowState: ReportFlowState | null = null;
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
let draftSavePromise: Promise<void> | null = null;
let draftHydrationToken = 0;
let draftLifecycleListenersInstalled = false;

const patch = init([classModule, attributesModule, eventListenersModule, propsModule]);

function normalizeExtraTags(extraTags: string[] | undefined): string[] {
  if (!Array.isArray(extraTags)) return [];
  return extraTags
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeContext(context: Partial<ReportContext> | undefined, routeAtTrigger: string): Required<ReportContext> {
  const safeContext = context ?? {};
  return {
    route: routeAtTrigger,
    triggeredBy: safeContext.triggeredBy?.trim() || 'unknown',
    extraTags: normalizeExtraTags(safeContext.extraTags),
  };
}

function defaultFormState(): ReportFormState {
  return {
    description: '',
    whatHappened: '',
    severity: 'medium',
    expectedBehavior: '',
    actualBehavior: '',
    submitting: false,
  };
}

function createReportSession(context?: Partial<ReportContext>, draftSummary?: ActiveReportIssueDraftSummary | null): ReportFlowState {
  const timestamp = Date.now();
  const issueId = draftSummary?.issueId ?? createReportIssueId(timestamp);
  const openedAt = draftSummary?.createdAt ?? timestamp;
  const routeAtTrigger = draftSummary?.routeAtTrigger
    ? sanitizeAppRoute(draftSummary.routeAtTrigger)
    : context?.route
      ? sanitizeAppRoute(context.route)
      : currentAppRoute();
  const normalizedContext = draftSummary
    ? normalizeContext(draftSummary.context, routeAtTrigger)
    : normalizeContext(context, routeAtTrigger);
  const session: ReportSession = {
    id: issueId,
    issueId,
    timestamp: openedAt,
    routeAtTrigger,
  };

  const state: ReportFlowState = {
    draftId: draftSummary?.draftId ?? issueId,
    draftCreatedAt: openedAt,
    draftStatus: draftSummary ? 'loading' : 'saving',
    session,
    context: normalizedContext,
    step: 'form',
    form: defaultFormState(),
    preview: { ...defaultPreviewState },
    report: null,
    adminTokenAvailable: false,
    screenshotFiles: [],
    screenshotAttachments: [],
    screenshotErrors: [],
    screenshotUploadStates: [],
    screenshotUploadSummary: '',
    statusMessage: '',
    errorMessage: '',
    copyMessage: '',
    outcome: null,
  };
  return state;
}

function applyDraftToState(state: ReportFlowState, draft: ReportIssueDraft): void {
  state.draftId = draft.draftId;
  state.draftCreatedAt = draft.createdAt;
  state.draftStatus = 'saved';
  state.session = {
    id: draft.issueId,
    issueId: draft.issueId,
    timestamp: draft.createdAt,
    routeAtTrigger: draft.routeAtTrigger,
  };
  state.context = normalizeContext(draft.context, draft.routeAtTrigger);
  state.form = formStateFromDraft(draft.form);
  state.screenshotAttachments = draftAttachmentsFromScreenshots(draft.screenshots);
  state.screenshotFiles = filesFromDraftScreenshots(draft.screenshots);
  state.screenshotErrors = [];
  state.screenshotUploadStates = screenshotUploadStatesFromAttachments(state.screenshotAttachments);
  state.screenshotUploadSummary = '';
}

function draftStatusLabel(state: ReportFlowState): string {
  switch (state.draftStatus) {
    case 'loading':
      return 'Loading saved draft...';
    case 'saving':
      return 'Saving...';
    case 'saved':
      return 'Saved locally';
    case 'error':
      return 'Draft not saved';
    default: {
      const exhaustive: never = state.draftStatus;
      return exhaustive;
    }
  }
}

function recordReportFlowEvent(
  state: ReportFlowState,
  message: string,
  severity: Severity = Severity.Info,
  extraMetadata: DiagnosticMetadata = {},
): void {
  try {
    const metadata: DiagnosticMetadata = {
      reportSessionId: state.session.id,
      issueId: state.session.issueId,
      sessionId: getSessionId(),
      triggeredBy: state.context.triggeredBy,
      extraTags: state.context.extraTags,
      timestamp: Date.now(),
      ...(state.report ? { reportId: state.report.reportId } : {}),
      ...extraMetadata,
    };

    record({
      kind: 'user-report',
      severity,
      route: state.session.routeAtTrigger,
      source: 'diagnostics.reportAction',
      sourceTag: 'diagnostics.reportAction',
      message,
      metadata,
      redactionClass: 'safe',
    });
  } catch (error) {
    console.warn('[diagnostics] reportIssue failed to record flow event', error);
  }
}


function safeScreenshotAssetFilename(fileName: string, index: number): string {
  const fallback = `screenshot-${index + 1}.png`;
  const trimmed = fileName.trim() || fallback;
  const normalized = trimmed
    .replace(/[/\\]+/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 120);
  return normalized || fallback;
}

function validateScreenshotFiles(files: File[]): {
  files: File[];
  attachments: DiagnosticReportScreenshotAttachment[];
  errors: string[];
} {
  const result = validateReviewErrorScreenshotFiles(files as ReviewErrorScreenshotFileLike[]);
  const validByKey = new Set(result.attachments.map(attachment => `${attachment.fileName}:${attachment.sizeBytes}:${attachment.mimeType}`));
  const validFiles = files
    .slice(0, 10)
    .filter((file, index) => validByKey.has(`${file.name.trim() || `screenshot-${index + 1}`}:${Math.floor(file.size)}:${file.type}`));
  const attachments = result.attachments.map((attachment, index) => ({
    ...attachment,
    assetFilename: safeScreenshotAssetFilename(attachment.fileName, index),
  }));
  return {
    files: validFiles,
    attachments,
    errors: result.ok ? [] : result.errors,
  };
}


function ensureModalHost(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (modalHost && document.body.contains(modalHost)) return modalHost;
  modalHost = document.createElement('div');
  modalHost.className = 'report-issue-root';
  document.body.appendChild(modalHost);
  modalVNode = modalHost;
  return modalHost;
}

function unmountModal(): void {
  if (!modalHost || !modalVNode) return;
  try {
    modalVNode = patch(modalVNode, h('div.report-issue-root'));
  } catch {
    // Unmount is best-effort.
  }
  modalHost.remove();
  modalHost = null;
  modalVNode = null;
  flowState = null;
}

function rerenderModal(): void {
  const host = ensureModalHost();
  if (!host || !modalVNode || !flowState) return;
  modalVNode = patch(modalVNode, renderReportRoot(flowState));
}

function draftSaveInput(state: ReportFlowState) {
  return {
    draftId: state.draftId,
    issueId: state.session.issueId,
    createdAt: state.draftCreatedAt,
    routeAtTrigger: state.session.routeAtTrigger,
    context: state.context,
    form: state.form,
    screenshotFiles: state.screenshotFiles,
    screenshotAttachments: state.screenshotAttachments,
  };
}

async function persistCurrentDraft(): Promise<void> {
  const state = flowState;
  if (!state || state.step === 'done' || state.outcome === 'discarded') return;
  state.draftStatus = 'saving';
  rerenderModal();

  const save = saveReportIssueDraft(draftSaveInput(state))
    .then(() => {
      if (flowState?.draftId !== state.draftId) return;
      state.draftStatus = 'saved';
      if (state.errorMessage === 'Draft not saved.') state.errorMessage = '';
    })
    .catch(error => {
      if (flowState?.draftId !== state.draftId) return;
      state.draftStatus = 'error';
      state.errorMessage = 'Draft not saved.';
      recordReportFlowEvent(state, 'user-report-draft-save-failed', Severity.Error);
      console.warn('[diagnostics] failed to save report issue draft', error);
    })
    .finally(() => {
      if (draftSavePromise === save) draftSavePromise = null;
      rerenderModal();
    });

  draftSavePromise = save;
  await save;
}

function scheduleDraftSave(): void {
  if (!flowState || flowState.step === 'done') return;
  flowState.draftStatus = 'saving';
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    void persistCurrentDraft();
  }, REPORT_DRAFT_SAVE_DELAY_MS);
  rerenderModal();
}

async function flushDraftSave(): Promise<void> {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    await persistCurrentDraft();
  }
  if (draftSavePromise) await draftSavePromise;
}

function installDraftLifecycleListeners(): void {
  if (draftLifecycleListenersInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
  draftLifecycleListenersInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushDraftSave();
  });
  window.addEventListener('pagehide', () => {
    void flushDraftSave();
  });
}

async function hydrateActiveDraft(summary: ActiveReportIssueDraftSummary | null): Promise<void> {
  const token = ++draftHydrationToken;
  try {
    const draft = await loadActiveReportIssueDraft(summary);
    if (token !== draftHydrationToken || !flowState) return;
    if (draft) {
      applyDraftToState(flowState, draft);
      recordReportFlowEvent(flowState, 'user-report-draft-restored');
    } else {
      flowState.draftStatus = 'saving';
      await persistCurrentDraft();
    }
  } catch (error) {
    if (token !== draftHydrationToken || !flowState) return;
    flowState.draftStatus = 'error';
    flowState.errorMessage = 'Saved draft could not be loaded.';
    recordReportFlowEvent(flowState, 'user-report-draft-load-failed', Severity.Error);
    console.warn('[diagnostics] failed to load report issue draft', error);
  }
  rerenderModal();
}

function closeReportFlow(outcome: ReportOutcome = 'closed'): void {
  const state = flowState;
  if (!state) {
    unmountModal();
    return;
  }

  void (async () => {
    if (outcome === 'closed' || outcome === 'cancelled') await flushDraftSave();
    if (flowState !== state) return;
    state.outcome = outcome;
    recordReportFlowEvent(state, outcome === 'cancelled' ? 'user-report-cancelled' : 'user-report-closed');
    unmountModal();
  })();
}

function confirmDiscardDraft(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
    return window.confirm('Discard this report issue draft? This removes the typed text and attached screenshots from this browser.');
  } catch {
    return true;
  }
}

function discardCurrentDraft(): void {
  const state = flowState;
  if (!state || !confirmDiscardDraft()) return;
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  state.draftStatus = 'saving';
  rerenderModal();
  void discardReportIssueDraft(state.draftId)
    .catch(error => {
      state.draftStatus = 'error';
      state.errorMessage = 'Draft could not be discarded.';
      console.warn('[diagnostics] failed to discard report issue draft', error);
    })
    .finally(() => {
      if (flowState !== state) return;
      state.outcome = 'discarded';
      recordReportFlowEvent(state, 'user-report-draft-discarded');
      unmountModal();
    });
}

function updateForm(action: ReportFormAction): void {
  if (!flowState) return;

  switch (action.type) {
    case 'description':
      flowState.form.description = action.value;
      break;
    case 'whatHappened':
      flowState.form.whatHappened = action.value;
      break;
    case 'severity':
      flowState.form.severity = action.value;
      break;
    case 'expectedBehavior':
      flowState.form.expectedBehavior = action.value;
      break;
    case 'actualBehavior':
      flowState.form.actualBehavior = action.value;
      break;
    case 'screenshots': {
      const result = validateScreenshotFiles(action.files);
      flowState.screenshotFiles = result.files;
      flowState.screenshotAttachments = result.attachments;
      flowState.screenshotErrors = result.errors;
      flowState.screenshotUploadStates = screenshotUploadStatesFromAttachments(result.attachments);
      flowState.screenshotUploadSummary = '';
      break;
    }
    case 'flushDraft':
      void flushDraftSave();
      return;
    case 'copyIssueId':
      copyIssueId(flowState);
      return;
    case 'close':
      closeReportFlow('closed');
      return;
    case 'discardDraft':
      discardCurrentDraft();
      return;
    case 'submit':
      void preparePreview();
      return;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }

  scheduleDraftSave();
  rerenderModal();
}

function updatePreview(action: PreviewAction): void {
  if (!flowState) return;
  flowState.preview = {
    ...flowState.preview,
    [action.type]: action.value,
  };
  rerenderModal();
}

async function preparePreview(): Promise<void> {
  if (!flowState || flowState.form.submitting) return;
  flowState.form.submitting = true;
  flowState.statusMessage = 'Preparing redacted preview...';
  flowState.errorMessage = '';
  rerenderModal();

  try {
    await flushDraftSave();
    const [routeContext, environmentContext] = await Promise.all([
      captureRouteContext(),
      captureEnvironmentContext(),
    ]);
    const report = assembleReport(flowState.form, {
      ...routeContext,
      route: flowState.session.routeAtTrigger,
    }, environmentContext, {
      issueId: flowState.session.issueId,
      openedAt: flowState.session.timestamp,
      screenshotAttachments: flowState.screenshotAttachments,
    });
    report.triggerContext = {
      triggeredBy: flowState.context.triggeredBy,
      routeAtTrigger: flowState.session.routeAtTrigger,
      extraTags: flowState.context.extraTags,
    };
    flowState.report = report;
    flowState.preview = { ...defaultPreviewState };
    flowState.step = 'preview';
    flowState.form.submitting = false;
    flowState.statusMessage = '';
    recordReportFlowEvent(flowState, 'user-report-preview-opened');
  } catch (error) {
    flowState.form.submitting = false;
    flowState.statusMessage = '';
    flowState.errorMessage = error instanceof Error ? error.message : 'Unable to prepare report preview.';
    recordReportFlowEvent(flowState, 'user-report-preview-failed', Severity.Error);
  }

  rerenderModal();
}

async function submitPreviewedReport(): Promise<void> {
  if (!flowState || !flowState.report || flowState.step === 'submitting') return;
  const report = applyPreviewStateToReport(flowState.report, flowState.preview);
  if (flowState.report.triggerContext) report.triggerContext = flowState.report.triggerContext;
  flowState.report = report;
  flowState.step = 'submitting';
  flowState.statusMessage = 'Saving report locally...';
  flowState.errorMessage = '';
  rerenderModal();

  const saved = await saveReport(report);
  if (!saved) {
    flowState.step = 'done';
    flowState.outcome = 'local-save-failed';
    flowState.statusMessage = '';
    flowState.errorMessage = 'The report could not be saved in this browser.';
    recordReportFlowEvent(flowState, 'user-report-local-save-failed', Severity.Error);
    rerenderModal();
    return;
  }

  await markReportIssueDraftSubmitted(flowState.draftId).catch(error => {
    console.warn('[diagnostics] failed to mark report issue draft submitted', error);
  });


  const publicState = flowState!;
  publicState.step = 'done';
  publicState.outcome = 'saved-local';
  publicState.screenshotUploadStates = [];
  publicState.screenshotUploadSummary = '';
  publicState.statusMessage = 'Report saved locally in this browser.';
  recordReportFlowEvent(publicState, 'user-report-saved-local');
  rerenderModal();
}

function copyIssueId(state: ReportFlowState): void {
  const issueId = state.session.issueId;
  try {
    void navigator.clipboard.writeText(issueId).then(() => {
      if (flowState?.session.issueId !== issueId) return;
      flowState.copyMessage = 'Issue ID copied.';
      rerenderModal();
    }).catch(() => {
      if (flowState?.session.issueId !== issueId) return;
      flowState.copyMessage = 'Copy failed.';
      rerenderModal();
    });
    state.copyMessage = 'Copying...';
  } catch {
    state.copyMessage = 'Copy failed.';
  }
  rerenderModal();
}

function reportTextForCopy(report: DiagnosticReport): string {
  const issueId = report.issueId ?? report.reportId;
  const attachmentNames = report.screenshotPackage?.attachments.map(attachment => attachment.fileName).join(', ') || 'none';
  return [
    `Issue ID: ${issueId}`,
    `Report ID: ${report.reportId}`,
    `Route: ${report.routeContext.route}`,
    `Surface: ${report.triggerContext?.triggeredBy ?? 'unknown'}`,
    `Severity: ${report.userInput.severity}`,
    `Description: ${report.userInput.description || 'none'}`,
    `What happened: ${report.userInput.whatHappened || 'none'}`,
    `Expected behavior: ${report.userInput.expectedBehavior || 'none'}`,
    `Actual behavior: ${report.userInput.actualBehavior || 'none'}`,
    `Screenshot package: ${report.screenshotPackage?.packageId ?? 'none'}`,
    `Screenshots: ${attachmentNames}`,
    `Captured at: ${report.capturedAt}`,
  ].join('\n');
}

function copyReportText(state: ReportFlowState): void {
  const report = state.report;
  if (!report) {
    state.copyMessage = 'No report text to copy.';
    rerenderModal();
    return;
  }
  const issueId = state.session.issueId;
  try {
    void navigator.clipboard.writeText(reportTextForCopy(report)).then(() => {
      if (flowState?.session.issueId !== issueId) return;
      flowState.copyMessage = 'Report text copied.';
      rerenderModal();
    }).catch(() => {
      if (flowState?.session.issueId !== issueId) return;
      flowState.copyMessage = 'Copy failed.';
      rerenderModal();
    });
    state.copyMessage = 'Copying...';
  } catch {
    state.copyMessage = 'Copy failed.';
  }
  rerenderModal();
}

function screenshotStatusLabel(item: ScreenshotUploadState): string {
  if (item.status === 'uploading') return item.progress === null ? 'Uploading' : `Uploading ${item.progress}%`;
  if (item.status === 'uploaded') return 'Uploaded';
  if (item.status === 'failed') return `Failed${item.message && item.message !== 'Failed' ? `: ${item.message}` : ''}`;
  return 'Queued';
}

function renderScreenshotUploadProgress(state: ReportFlowState): VNode | null {
  if (state.screenshotUploadStates.length === 0) return null;
  const uploaded = state.screenshotUploadStates.filter(item => item.status === 'uploaded').length;
  const expected = state.screenshotUploadStates.length;
  return h('div.report-issue-modal__upload-progress', [
    h('div.report-issue-modal__upload-summary', [
      h('span.report-issue-modal__upload-title', 'Screenshot upload'),
      h('span.report-issue-modal__upload-count', state.screenshotUploadSummary || screenshotUploadSummary(uploaded, expected)),
    ]),
    h('ul.report-issue-modal__upload-list', state.screenshotUploadStates.map(item => {
      const progress = Math.max(0, Math.min(100, item.progress ?? (item.status === 'uploaded' ? 100 : 0)));
      return h(`li.report-issue-modal__upload-item.report-issue-modal__upload-item--${item.status}`, [
        h('div.report-issue-modal__upload-row', [
          h('span.report-issue-modal__upload-name', item.filename),
          h('span.report-issue-modal__upload-state', screenshotStatusLabel(item)),
        ]),
        h('div.report-issue-modal__upload-meta', [
          h('span', item.assetFilename),
          h('span', `${item.mimeType}, ${Math.round(item.sizeBytes / 1024)} KB`),
        ]),
        h('div.report-issue-modal__upload-bar', {
          attrs: { style: `--upload-progress: ${progress}%;` },
        }, [
          h('span'),
        ]),
      ]);
    })),
  ]);
}

function renderSubmittedReportCopyPanel(state: ReportFlowState): VNode {
  const copyReportExplainer = {
    label: 'Copy report text',
    description: state.report
      ? 'Copies a concise redacted report summary to the clipboard.'
      : 'Save the report before copying its summary text.',
  };
  const copyReportButton = h('button.admin-btn.admin-btn--muted', {
    attrs: { type: 'button', disabled: !state.report, ...controlExplainerAttrs(copyReportExplainer) },
    on: { click: () => copyReportText(state) },
  }, 'Copy report text');
  return h('div.report-issue-modal__copy-panel', [
    h('div.report-issue-modal__issue-id', [
      h('span', 'Issue ID'),
      h('code', state.session.issueId),
    ]),
    h('div.report-issue-modal__copy-actions', [
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Copy issue ID',
          description: 'Copies this report session identifier to the clipboard.',
        }) },
        on: { click: () => copyIssueId(state) },
      }, 'Copy ID'),
      state.report ? copyReportButton : renderDisabledControlExplainer(copyReportExplainer, copyReportButton),
    ]),
    state.copyMessage ? h('p.report-issue-modal__copy-status', state.copyMessage) : null,
  ]);
}

function renderSubmittedReportBody(state: ReportFlowState, close: () => void): VNode | null {
  if (!state.report) return null;
  const submitting = state.step === 'submitting';
  return h('div.report-issue-modal__submitted', [
    state.statusMessage ? h('p.report-issue-modal__status', state.statusMessage) : null,
    state.errorMessage ? h('p.report-issue-modal__error', state.errorMessage) : null,
    renderReportPreview(state.report, state.preview),
    renderSubmittedReportCopyPanel(state),
    renderScreenshotUploadProgress(state),
    submitting ? null : h('button.report-form__submit.admin-btn.admin-btn--primary', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Close submitted report' }) },
      on: { click: close },
    }, 'Close'),
  ]);
}

function renderReportRoot(state: ReportFlowState): VNode {
  return h('div.report-issue-root', [
    renderReportModal(state),
  ]);
}

function renderReportModal(state: ReportFlowState): VNode {
  const close = () => closeReportFlow(state.step === 'done' && state.outcome ? state.outcome : 'closed');
  const submitting = state.step === 'submitting';
  return h('div.report-issue-modal', [
    h('div.report-issue-modal__backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close report issue dialog' }) },
      on: { click: close, keydown: (event: KeyboardEvent) => activateOnKeyboard(event, close) },
    }),
    h('div.report-issue-modal__card', [
      h('div.report-issue-modal__header', [
        h('div', [
          h('h2', 'Report issue'),
          h('p.report-issue-modal__route', `${state.session.routeAtTrigger} · ${state.context.triggeredBy}`),
        ]),
        h('button.report-issue-modal__close', {
          attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Close report issue dialog' }) },
          on: { click: close },
        }, '×'),
      ]),
      h('div.report-issue-modal__body', [
        state.step === 'form' ? renderReportForm(state.form, updateForm, {
          issueId: state.session.issueId,
          adminTokenAvailable: state.adminTokenAvailable,
          screenshotAttachments: state.screenshotAttachments,
          screenshotErrors: state.screenshotErrors,
          draftStatus: draftStatusLabel(state),
          copyMessage: state.copyMessage,
        }) : null,
        state.step === 'preview' && state.report
          ? h('div.report-issue-modal__preview', [
            renderReportPreview(state.report, state.preview, updatePreview),
            h('div.report-form__actions', [
              h('button.report-form__back.admin-btn.admin-btn--muted', {
                attrs: { type: 'button', ...controlExplainerAttrs({
                  label: 'Back to report form',
                  description: 'Returns to editing without saving or uploading the report.',
                }) },
                on: { click: () => { flowState && (flowState.step = 'form'); rerenderModal(); } },
              }, 'Back'),
              h('button.report-form__submit.admin-btn.admin-btn--primary', {
                attrs: { type: 'button', ...controlExplainerAttrs({
                  label: 'Save and submit report',
                  description: 'Saves the redacted report locally and queues remote submission when remote diagnostics are enabled.',
                }) },
                on: { click: () => void submitPreviewedReport() },
              }, 'Save and submit'),
            ]),
          ])
          : null,
        submitting || state.step === 'done'
          ? renderSubmittedReportBody(state, close)
          : null,
        state.step !== 'done' && state.statusMessage && !submitting
          ? h('p.report-issue-modal__status', state.statusMessage)
          : null,
        state.step !== 'done' && state.errorMessage
          ? h('p.report-issue-modal__error', state.errorMessage)
          : null,
      ]),
    ]),
  ]);
}

export function reportIssue(context?: Partial<ReportContext>): ReportSession {
  installDraftLifecycleListeners();
  const summary = readActiveReportIssueDraftSummary();
  flowState = createReportSession(context, summary);
  recordReportFlowEvent(flowState, 'user-report-opened');
  rerenderModal();
  void hydrateActiveDraft(summary);
  return flowState.session;
}
