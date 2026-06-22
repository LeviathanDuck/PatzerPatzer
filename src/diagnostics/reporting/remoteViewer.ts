import { readRemoteSubmissionConfig, type RemoteSubmissionConfig } from './reportOutbox';

export const REMOTE_REPORT_PAGE_SIZE = 10;
export const REMOTE_REPORT_STALE_MS = 5 * 60 * 1000;

export type RemoteReportSyncStatus = 'unavailable' | 'syncing' | 'success' | 'error';

export interface RemoteDiagnosticReportSummary {
  reportId: string;
  receivedAt: string;
  capturedAt: string;
  retainUntil: string;
  severity: string;
  route: string;
  state: string;
  description: string;
}

interface RemoteDiagnosticRecord {
  receivedAt?: unknown;
  retainUntil?: unknown;
  report?: {
    reportId?: unknown;
    capturedAt?: unknown;
    userInput?: {
      severity?: unknown;
      description?: unknown;
    };
    routeContext?: {
      route?: unknown;
    };
    triageState?: unknown;
    status?: unknown;
  };
}

export interface RemoteReportFetchResult {
  reports: RemoteDiagnosticReportSummary[];
  fetchedAt: number;
}

export interface RemoteDiagnosticTrendBucket {
  bucketStart: number;
  bucketEnd: number;
  label: string;
  errorCount: number;
  reportCount: number;
}

export interface RemoteDiagnosticTrendResult {
  generatedAt: string;
  rangeDays: number;
  period: 'day' | 'week';
  errorFrequency: RemoteDiagnosticTrendBucket[];
  crashRate: {
    sessionCount: number;
    crashSessionCount: number;
    rate: number;
  };
  aggregateSummary: {
    errorFrequencyAggregateCount: number;
    errorFrequencyAggregateTotal: number;
  };
  fetchedAt: number;
}

function reportEndpointForDelete(endpoint: string, reportId: string): string {
  return `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(reportId)}`;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeRemoteRecord(record: RemoteDiagnosticRecord): RemoteDiagnosticReportSummary | null {
  const report = record.report;
  const reportId = stringValue(report?.reportId);
  if (!reportId) return null;

  return {
    reportId,
    receivedAt: stringValue(record.receivedAt, stringValue(report?.capturedAt, 'unknown')),
    capturedAt: stringValue(report?.capturedAt, 'unknown'),
    retainUntil: stringValue(record.retainUntil, 'unknown'),
    severity: stringValue(report?.userInput?.severity, 'unknown'),
    route: stringValue(report?.routeContext?.route, 'unknown route'),
    state: stringValue(report?.triageState, stringValue(report?.status, 'new')),
    description: stringValue(report?.userInput?.description, reportId),
  };
}

function recordsFromPayload(payload: unknown): RemoteDiagnosticRecord[] {
  if (Array.isArray(payload)) return payload as RemoteDiagnosticRecord[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { reports?: unknown }).reports)) {
    return (payload as { reports: RemoteDiagnosticRecord[] }).reports;
  }
  return [];
}

export function remoteReportViewerConfig(): RemoteSubmissionConfig {
  return readRemoteSubmissionConfig();
}

export async function fetchRemoteDiagnosticReports(): Promise<RemoteReportFetchResult> {
  const config = remoteReportViewerConfig();
  if (!config.enabled || !config.token) throw new Error('Remote diagnostics are not configured.');

  const response = await fetch(config.endpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!response.ok) throw new Error(`Remote diagnostics fetch failed (${response.status}).`);

  const payload = await response.json() as unknown;
  const reports = recordsFromPayload(payload)
    .map(normalizeRemoteRecord)
    .filter((report): report is RemoteDiagnosticReportSummary => Boolean(report))
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  return { reports, fetchedAt: Date.now() };
}

export async function fetchRemoteDiagnosticTrends(rangeDays: number, period: 'day' | 'week'): Promise<RemoteDiagnosticTrendResult> {
  const config = remoteReportViewerConfig();
  if (!config.enabled || !config.token) throw new Error('Remote diagnostics are not configured.');

  const params = new URLSearchParams({ rangeDays: String(rangeDays), period });
  const response = await fetch(`/api/diagnostic-trends?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!response.ok) throw new Error(`Remote diagnostic trends fetch failed (${response.status}).`);

  const payload = await response.json() as Omit<RemoteDiagnosticTrendResult, 'fetchedAt'>;
  return { ...payload, fetchedAt: Date.now() };
}

export async function deleteRemoteDiagnosticReport(reportId: string): Promise<boolean> {
  const config = remoteReportViewerConfig();
  if (!config.enabled || !config.token) throw new Error('Remote diagnostics are not configured.');

  const response = await fetch(reportEndpointForDelete(config.endpoint, reportId), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.token}` },
  });
  return response.ok;
}
