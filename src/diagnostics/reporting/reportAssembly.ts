import { getSessionId } from '../id';
import { redactUserAgent } from '../redact';
import type { EnvironmentContext, RouteContext } from './reportContext';
import type { ReportFormState, ReportSeverity } from './reportForm';

export interface DiagnosticReportUserInput {
  description: string;
  severity: ReportSeverity;
  expectedBehavior: string;
  actualBehavior: string;
}

export interface DiagnosticReport {
  reportId: string;
  sessionId: string;
  capturedAt: string;
  userInput: DiagnosticReportUserInput;
  routeContext: RouteContext;
  environmentContext: EnvironmentContext | null;
}

function createReportId(timestamp: number): string {
  try {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto);
  } catch {
    // Fall through to deterministic fallback below.
  }

  return `report-${timestamp.toString(36)}-${Math.random().toString(36).slice(2)}`;
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
): DiagnosticReport {
  const timestamp = Date.now();

  return {
    reportId: createReportId(timestamp),
    sessionId: getSessionId(),
    capturedAt: new Date(timestamp).toISOString(),
    userInput: {
      description: normalizeText(formState.description),
      severity: formState.severity,
      expectedBehavior: normalizeText(formState.expectedBehavior),
      actualBehavior: normalizeText(formState.actualBehavior),
    },
    routeContext,
    environmentContext: redactEnvironmentContext(environmentContext),
  };
}
