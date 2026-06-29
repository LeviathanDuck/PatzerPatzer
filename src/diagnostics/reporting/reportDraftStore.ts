import {
  deleteDiagnosticReportDraft,
  getActiveDiagnosticReportDraft,
  getDiagnosticReportDraft,
  putDiagnosticReportDraft,
  updateDiagnosticReportDraftStatus,
} from '../../idb';
import type { DiagnosticReportScreenshotAttachment } from './reportAssembly';
import type { ReportFormState } from './reportForm';
import type {
  ReportIssueDraft,
  ReportIssueDraftContext,
  ReportIssueDraftFormState,
  ReportIssueDraftScreenshot,
} from './reportDraftTypes';

const ACTIVE_DRAFT_SUMMARY_KEY = 'patzer.diagnostics.reportIssue.activeDraft';

export interface ActiveReportIssueDraftSummary {
  draftId: string;
  issueId: string;
  createdAt: number;
  routeAtTrigger: string;
  context: ReportIssueDraftContext;
}

export interface CreateReportIssueDraftInput {
  issueId: string;
  createdAt: number;
  routeAtTrigger: string;
  context: ReportIssueDraftContext;
  form: ReportFormState;
  screenshotFiles: File[];
  screenshotAttachments: DiagnosticReportScreenshotAttachment[];
}

export interface SaveReportIssueDraftInput extends CreateReportIssueDraftInput {
  draftId: string;
}

function draftFormFromState(form: ReportFormState): ReportIssueDraftFormState {
  return {
    description: form.description,
    whatHappened: form.whatHappened,
    severity: form.severity,
    expectedBehavior: form.expectedBehavior,
    actualBehavior: form.actualBehavior,
  };
}

export function formStateFromDraft(form: ReportIssueDraftFormState): ReportFormState {
  return {
    description: form.description,
    whatHappened: form.whatHappened,
    severity: form.severity,
    expectedBehavior: form.expectedBehavior,
    actualBehavior: form.actualBehavior,
    submitting: false,
  };
}

function screenshotBlobFromFile(file: File, mimeType: ReportIssueDraftScreenshot['mimeType']): Blob {
  try {
    return file.slice(0, file.size, mimeType);
  } catch {
    return new Blob([file], { type: mimeType });
  }
}

export function draftAttachmentsFromScreenshots(
  screenshots: ReportIssueDraftScreenshot[],
): DiagnosticReportScreenshotAttachment[] {
  return screenshots.map(screenshot => ({
    fileName: screenshot.fileName,
    mimeType: screenshot.mimeType,
    sizeBytes: screenshot.sizeBytes,
    assetFilename: screenshot.assetFilename,
    ...(Number.isFinite(screenshot.lastModified) ? { lastModified: screenshot.lastModified } : {}),
  }));
}

export function filesFromDraftScreenshots(screenshots: ReportIssueDraftScreenshot[]): File[] {
  return screenshots.map((screenshot, index) => {
    const lastModified = typeof screenshot.lastModified === 'number' && Number.isFinite(screenshot.lastModified)
      ? screenshot.lastModified
      : Date.now();
    if (typeof File === 'function') {
      return new File([screenshot.blob], screenshot.fileName || `screenshot-${index + 1}.png`, {
        type: screenshot.mimeType,
        lastModified,
      });
    }
    const blob = new Blob([screenshot.blob], { type: screenshot.mimeType }) as Blob & {
      name: string;
      lastModified: number;
    };
    blob.name = screenshot.fileName || `screenshot-${index + 1}.png`;
    blob.lastModified = lastModified;
    return blob as File;
  });
}

export async function screenshotsFromFiles(
  files: File[],
  attachments: DiagnosticReportScreenshotAttachment[],
): Promise<ReportIssueDraftScreenshot[]> {
  return attachments.map((attachment, index) => {
    const file = files[index];
    return {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      assetFilename: attachment.assetFilename,
      ...(Number.isFinite(attachment.lastModified) ? { lastModified: attachment.lastModified } : {}),
      blob: file ? screenshotBlobFromFile(file, attachment.mimeType) : new Blob([], { type: attachment.mimeType }),
    };
  });
}

export async function buildReportIssueDraft(input: SaveReportIssueDraftInput): Promise<ReportIssueDraft> {
  const now = Date.now();
  return {
    draftId: input.draftId,
    issueId: input.issueId,
    createdAt: input.createdAt,
    updatedAt: now,
    status: 'active',
    routeAtTrigger: input.routeAtTrigger,
    context: input.context,
    form: draftFormFromState(input.form),
    screenshots: await screenshotsFromFiles(input.screenshotFiles, input.screenshotAttachments),
  };
}

function summaryFromDraft(draft: ReportIssueDraft): ActiveReportIssueDraftSummary {
  return {
    draftId: draft.draftId,
    issueId: draft.issueId,
    createdAt: draft.createdAt,
    routeAtTrigger: draft.routeAtTrigger,
    context: draft.context,
  };
}

export function readActiveReportIssueDraftSummary(): ActiveReportIssueDraftSummary | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(ACTIVE_DRAFT_SUMMARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveReportIssueDraftSummary>;
    if (!parsed.draftId || !parsed.issueId || !Number.isFinite(parsed.createdAt) || !parsed.routeAtTrigger) {
      return null;
    }
    const createdAt = typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
      ? parsed.createdAt
      : null;
    if (createdAt === null) return null;
    return {
      draftId: parsed.draftId,
      issueId: parsed.issueId,
      createdAt,
      routeAtTrigger: parsed.routeAtTrigger,
      context: {
        route: parsed.context?.route || parsed.routeAtTrigger,
        triggeredBy: parsed.context?.triggeredBy || 'unknown',
        extraTags: Array.isArray(parsed.context?.extraTags) ? parsed.context.extraTags : [],
      },
    };
  } catch {
    return null;
  }
}

export function writeActiveReportIssueDraftSummary(draft: ReportIssueDraft): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ACTIVE_DRAFT_SUMMARY_KEY, JSON.stringify(summaryFromDraft(draft)));
  } catch {
    // Draft data still lives in IndexedDB; the summary is only a synchronous resume pointer.
  }
}

export function clearActiveReportIssueDraftSummary(draftId?: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (draftId) {
      const current = readActiveReportIssueDraftSummary();
      if (current && current.draftId !== draftId) return;
    }
    localStorage.removeItem(ACTIVE_DRAFT_SUMMARY_KEY);
  } catch {
    // Best effort.
  }
}

export async function saveReportIssueDraft(input: SaveReportIssueDraftInput): Promise<ReportIssueDraft> {
  const draft = await buildReportIssueDraft(input);
  await putDiagnosticReportDraft(draft);
  writeActiveReportIssueDraftSummary(draft);
  return draft;
}

export async function loadActiveReportIssueDraft(
  summary: ActiveReportIssueDraftSummary | null = readActiveReportIssueDraftSummary(),
): Promise<ReportIssueDraft | undefined> {
  if (summary) {
    const draft = await getDiagnosticReportDraft(summary.draftId);
    if (draft?.status === 'active') {
      writeActiveReportIssueDraftSummary(draft);
      return draft;
    }
    clearActiveReportIssueDraftSummary(summary.draftId);
  }

  const latest = await getActiveDiagnosticReportDraft();
  if (latest) writeActiveReportIssueDraftSummary(latest);
  return latest;
}

export async function discardReportIssueDraft(draftId: string): Promise<void> {
  clearActiveReportIssueDraftSummary(draftId);
  await deleteDiagnosticReportDraft(draftId);
}

export async function markReportIssueDraftSubmitted(draftId: string): Promise<void> {
  clearActiveReportIssueDraftSummary(draftId);
  await updateDiagnosticReportDraftStatus(draftId, 'submitted');
}
