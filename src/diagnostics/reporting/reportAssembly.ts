import { getSessionId } from '../id';
import { redactUserAgent } from '../redact';
import type { EnvironmentContext, RouteContext } from './reportContext';
import type { ReportFormState, ReportSeverity } from './reportForm';
import { createReportIssueId } from './reportIssueId';

export interface DiagnosticReportUserInput {
  description: string;
  whatHappened?: string;
  severity: ReportSeverity;
  expectedBehavior: string;
  actualBehavior: string;
}

export interface DiagnosticReportTriggerContext {
  triggeredBy: string;
  routeAtTrigger: string;
  extraTags: string[];
}

export interface DiagnosticReportScreenshotAttachment {
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes: number;
  assetFilename: string;
  lastModified?: number;
}

export interface DiagnosticReportScreenshotPackage {
  packageId: string;
  attachments: DiagnosticReportScreenshotAttachment[];
}

export interface DiagnosticReport {
  reportId: string;
  issueId?: string;
  issueOpenedAt?: string;
  sessionId: string;
  capturedAt: string;
  userInput: DiagnosticReportUserInput;
  routeContext: RouteContext;
  environmentContext: EnvironmentContext | null;
  triggerContext?: DiagnosticReportTriggerContext;
  screenshotPackage?: DiagnosticReportScreenshotPackage;
}

export interface AssembleReportOptions {
  issueId?: string;
  openedAt?: number;
  screenshotAttachments?: DiagnosticReportScreenshotAttachment[];
}

function normalizeText(value: string): string {
  return value.trim();
}

function redactEnvironmentContext(environmentContext: EnvironmentContext): EnvironmentContext {
  return {
    ...environmentContext,
    userAgent: redactUserAgent(environmentContext.userAgent),
  };
}

export function assembleReport(
  formState: ReportFormState,
  routeContext: RouteContext,
  environmentContext: EnvironmentContext,
  options: AssembleReportOptions = {},
): DiagnosticReport {
  const timestamp = Date.now();
  const openedAt = Number.isFinite(options.openedAt) ? options.openedAt! : timestamp;
  const issueId = options.issueId?.trim() || createReportIssueId(openedAt);
  const screenshotAttachments = options.screenshotAttachments ?? [];

  return {
    reportId: issueId,
    issueId,
    issueOpenedAt: new Date(openedAt).toISOString(),
    sessionId: getSessionId(),
    capturedAt: new Date(timestamp).toISOString(),
    userInput: {
      description: normalizeText(formState.description),
      whatHappened: normalizeText(formState.whatHappened),
      severity: formState.severity,
      expectedBehavior: normalizeText(formState.expectedBehavior),
      actualBehavior: normalizeText(formState.actualBehavior),
    },
    routeContext,
    environmentContext: redactEnvironmentContext(environmentContext),
    ...(screenshotAttachments.length > 0
      ? {
          screenshotPackage: {
            packageId: issueId,
            attachments: screenshotAttachments,
          },
        }
      : {}),
  };
}
