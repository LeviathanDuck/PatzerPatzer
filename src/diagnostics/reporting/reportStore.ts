import {
  deleteDiagnosticReport,
  getAllDiagnosticReports,
  getDiagnosticReport,
  putDiagnosticReport,
  type DiagnosticReportStatus,
  type DiagnosticReportTriageState,
  type DiagnosticReport as StoredDiagnosticReport,
} from '../../idb';
import type { DiagnosticReport } from './reportAssembly';

export type { StoredDiagnosticReport };
export type { DiagnosticReportTriageState };

export const REPORT_TRIAGE_STATES: DiagnosticReportTriageState[] = [
  'new',
  'investigating',
  'reproduced',
  'fixed',
  'invalid',
  'archived',
];

const REPORT_TRIAGE_TRANSITIONS: Record<DiagnosticReportTriageState, DiagnosticReportTriageState[]> = {
  new:           ['investigating', 'invalid', 'archived'],
  investigating: ['reproduced', 'fixed', 'invalid', 'archived'],
  reproduced:   ['fixed', 'invalid', 'archived'],
  fixed:        ['archived'],
  invalid:      ['archived'],
  archived:     [],
};

function timestampFromReport(report: DiagnosticReport): number {
  const parsed = Date.parse(report.capturedAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function toStoredReport(report: DiagnosticReport): StoredDiagnosticReport {
  const timestamp = timestampFromReport(report);

  return {
    ...report,
    timestamp,
    severity: report.userInput.severity,
    route: report.routeContext.route,
    status: 'pending',
    triageState: 'new',
    adminNotes: '',
  };
}

export function reportTriageState(report: StoredDiagnosticReport): DiagnosticReportTriageState {
  return REPORT_TRIAGE_STATES.includes(report.triageState as DiagnosticReportTriageState)
    ? report.triageState as DiagnosticReportTriageState
    : 'new';
}

function normalizeStoredReport(report: StoredDiagnosticReport): StoredDiagnosticReport {
  return {
    ...report,
    adminNotes: typeof report.adminNotes === 'string' ? report.adminNotes : '',
  };
}

export function canTransitionReportTriage(
  from: DiagnosticReportTriageState,
  to: DiagnosticReportTriageState,
): boolean {
  return from === to || REPORT_TRIAGE_TRANSITIONS[from].includes(to);
}

export async function saveReport(report: DiagnosticReport): Promise<void> {
  try {
    await putDiagnosticReport(toStoredReport(report));
  } catch (error) {
    console.warn('[diagnostics] failed to save bug report locally', error);
  }
}

export async function updateReportStatus(report: DiagnosticReport, status: DiagnosticReportStatus): Promise<void> {
  try {
    const existing = await getDiagnosticReport(report.reportId);
    await putDiagnosticReport({
      ...(existing ?? toStoredReport(report)),
      status,
    });
  } catch (error) {
    console.warn('[diagnostics] failed to update bug report status', error);
  }
}

export async function updateReportTriageState(
  reportId: string,
  nextState: DiagnosticReportTriageState,
): Promise<StoredDiagnosticReport | undefined> {
  try {
    const existing = await getDiagnosticReport(reportId);
    if (!existing) return undefined;
    const currentState = reportTriageState(existing);
    if (!canTransitionReportTriage(currentState, nextState)) return existing;
    const updated = {
      ...existing,
      triageState: nextState,
    };
    await putDiagnosticReport(updated);
    return updated;
  } catch (error) {
    console.warn('[diagnostics] failed to update bug report triage state', error);
    return undefined;
  }
}

export async function updateReportAdminNotes(
  reportId: string,
  adminNotes: string,
): Promise<StoredDiagnosticReport | undefined> {
  try {
    const existing = await getDiagnosticReport(reportId);
    if (!existing) return undefined;
    const updated = {
      ...normalizeStoredReport(existing),
      adminNotes,
    };
    await putDiagnosticReport(updated);
    return updated;
  } catch (error) {
    console.warn('[diagnostics] failed to update bug report admin notes', error);
    return undefined;
  }
}

export async function deleteReport(reportId: string): Promise<boolean> {
  try {
    await deleteDiagnosticReport(reportId);
    return true;
  } catch (error) {
    console.warn('[diagnostics] failed to delete bug report', error);
    return false;
  }
}

export async function deleteReportsByTriageState(
  triageState: DiagnosticReportTriageState,
): Promise<number> {
  try {
    const reports = await getAllReports();
    const matchingReports = reports.filter(report => reportTriageState(report) === triageState);
    for (const report of matchingReports) await deleteDiagnosticReport(report.reportId);
    return matchingReports.length;
  } catch (error) {
    console.warn('[diagnostics] failed to bulk-delete bug reports', error);
    return 0;
  }
}

export async function getReport(reportId: string): Promise<StoredDiagnosticReport | undefined> {
  try {
    const report = await getDiagnosticReport(reportId);
    return report ? normalizeStoredReport(report) : undefined;
  } catch (error) {
    console.warn('[diagnostics] failed to read bug report locally', error);
    return undefined;
  }
}

export async function getAllReports(): Promise<StoredDiagnosticReport[]> {
  try {
    return (await getAllDiagnosticReports()).map(normalizeStoredReport);
  } catch (error) {
    console.warn('[diagnostics] failed to read local bug reports', error);
    return [];
  }
}
