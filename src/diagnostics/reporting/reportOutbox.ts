import {
  deleteDiagnosticOutboxEntry,
  getPendingOutboxEntries,
  putDiagnosticOutboxEntry,
  type DiagnosticOutboxEntry,
} from '../../idb';
import type { SubmitResult } from './reportSubmit';

export const REPORT_OUTBOX_MAX_ATTEMPTS = 5;
const REMOTE_ENABLED_KEY = 'patzer.diagnostics.remoteSubmissionEnabled';
const REMOTE_ENDPOINT_KEY = 'patzer.diagnostics.remoteSubmissionEndpoint';
const REMOTE_TOKEN_KEY = 'patzer.diagnostics.remoteSubmissionToken';
const REMOTE_SYNC_TOKEN_KEY = 'chesspatzer.remoteSync.adminSyncToken';

export interface RemoteSubmissionConfig {
  enabled: boolean;
  endpoint: string;
  token: string;
}

export const DEFAULT_REMOTE_SUBMISSION_ENDPOINT = '/api/diagnostic-reports';

function outboxId(reportId: string, timestamp: number): string {
  return `outbox-${reportId}-${timestamp.toString(36)}`;
}

export function readRemoteSubmissionConfig(): RemoteSubmissionConfig {
  try {
    if (typeof localStorage === 'undefined') return { enabled: false, endpoint: '', token: '' };
    const endpoint = localStorage.getItem(REMOTE_ENDPOINT_KEY)?.trim() ?? DEFAULT_REMOTE_SUBMISSION_ENDPOINT;
    const token = localStorage.getItem(REMOTE_TOKEN_KEY)?.trim()
      || localStorage.getItem(REMOTE_SYNC_TOKEN_KEY)?.trim()
      || '';
    return {
      enabled: localStorage.getItem(REMOTE_ENABLED_KEY) === 'true' && Boolean(endpoint),
      endpoint,
      token,
    };
  } catch {
    return { enabled: false, endpoint: '', token: '' };
  }
}

export function writeRemoteSubmissionConfig(config: RemoteSubmissionConfig): RemoteSubmissionConfig {
  const endpoint = config.endpoint.trim() || DEFAULT_REMOTE_SUBMISSION_ENDPOINT;
  const token = config.token.trim();
  const enabled = config.enabled && Boolean(token);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REMOTE_ENABLED_KEY, enabled ? 'true' : 'false');
      localStorage.setItem(REMOTE_ENDPOINT_KEY, endpoint);
      if (token) localStorage.setItem(REMOTE_TOKEN_KEY, token);
      else localStorage.removeItem(REMOTE_TOKEN_KEY);
    }
  } catch {
    return { enabled: false, endpoint: '', token: '' };
  }

  return { enabled, endpoint, token };
}

export function disableRemoteSubmission(): RemoteSubmissionConfig {
  const current = readRemoteSubmissionConfig();
  return writeRemoteSubmissionConfig({ ...current, enabled: false });
}

function remoteSubmissionEnabled(): boolean {
  const config = readRemoteSubmissionConfig();
  return config.enabled;
}

function retryable(entries: DiagnosticOutboxEntry[]): DiagnosticOutboxEntry[] {
  return entries.filter(entry => entry.status === 'pending' && entry.attemptCount < REPORT_OUTBOX_MAX_ATTEMPTS);
}

function overAttemptLimit(entries: DiagnosticOutboxEntry[]): DiagnosticOutboxEntry[] {
  return entries.filter(entry => entry.status === 'pending' && entry.attemptCount >= REPORT_OUTBOX_MAX_ATTEMPTS);
}

function failedEntry(entry: DiagnosticOutboxEntry, attemptCount: number): DiagnosticOutboxEntry {
  return {
    ...entry,
    attemptCount,
    status: attemptCount >= REPORT_OUTBOX_MAX_ATTEMPTS ? 'abandoned' : 'pending',
    updatedAt: Date.now(),
  };
}

async function markFailed(entry: DiagnosticOutboxEntry, attemptCount: number): Promise<void> {
  await putDiagnosticOutboxEntry(failedEntry(entry, attemptCount));
}

export async function enqueueFailedReport(reportId: string, payload: string, attemptCount: number): Promise<void> {
  const timestamp = Date.now();
  try {
    await putDiagnosticOutboxEntry({
      outboxId: outboxId(reportId, timestamp),
      reportId,
      payload,
      attemptCount,
      queuedAt: timestamp,
      timestamp,
      updatedAt: timestamp,
      status: attemptCount >= REPORT_OUTBOX_MAX_ATTEMPTS ? 'abandoned' : 'pending',
    });
  } catch (error) {
    console.warn('[diagnostics] failed to enqueue report submission retry', error);
  }
}

export async function drainOutbox(submitFn: (payload: string) => Promise<SubmitResult>): Promise<void> {
  try {
    const entries = await getPendingOutboxEntries();
    await drainOutboxEntries(entries, submitFn, {
      deleteEntry: deleteDiagnosticOutboxEntry,
      putEntry: putDiagnosticOutboxEntry,
    });
  } catch (error) {
    console.warn('[diagnostics] failed to drain report outbox', error);
  }
}

export interface DrainOutboxOps {
  deleteEntry: (outboxId: string) => Promise<void>;
  putEntry: (entry: DiagnosticOutboxEntry) => Promise<void>;
}

export async function drainOutboxEntries(
  entries: DiagnosticOutboxEntry[],
  submitFn: (payload: string) => Promise<SubmitResult>,
  ops: DrainOutboxOps,
): Promise<void> {
  for (const entry of overAttemptLimit(entries)) {
    await ops.putEntry(failedEntry(entry, entry.attemptCount));
  }

  for (const entry of retryable(entries)) {
    const result = await submitFn(entry.payload);
    if (result.success) {
      await ops.deleteEntry(entry.outboxId);
      continue;
    }
    await ops.putEntry(failedEntry(entry, entry.attemptCount + 1));
  }
}

async function submitConfiguredPayload(payload: string): Promise<SubmitResult> {
  try {
    const { endpoint, token } = readRemoteSubmissionConfig();
    const response = await fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: payload,
    });
    return response.ok
      ? { success: true, httpStatus: response.status }
      : { success: false, httpStatus: response.status, errorReason: 'http-error' };
  } catch {
    return { success: false, httpStatus: null, errorReason: 'network-error' };
  }
}

export function drainReportOutboxOnInit(): void {
  if (!remoteSubmissionEnabled()) return;
  void drainOutbox(submitConfiguredPayload);
}
