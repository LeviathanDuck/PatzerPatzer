import type { DiagnosticReport } from './reportAssembly';
import { enqueueFailedReport } from './reportOutbox';
import { updateReportStatus } from './reportStore';

export const REPORT_SUBMIT_MAX_BYTES = 512 * 1024;

export type SubmitErrorReason =
  | 'submission-not-enabled'
  | 'payload-too-large'
  | 'invalid-endpoint'
  | 'network-error'
  | 'http-error';

export interface SubmitOptions {
  endpoint: string;
  enabled?: boolean;
  adminToken?: string;
}

export interface SubmitResult {
  success: boolean;
  httpStatus: number | null;
  errorReason?: SubmitErrorReason;
}

function submissionEnabled(options: SubmitOptions): boolean {
  return Boolean(options.adminToken?.trim());
}

function payloadBytes(json: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).byteLength;
  } catch {
    // Fall through to conservative string-length estimate.
  }
  return json.length;
}

function headersForSubmit(options: SubmitOptions): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = options.adminToken?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function markFailed(report: DiagnosticReport): Promise<void> {
  await updateReportStatus(report, 'failed');
}

export async function submitReport(report: DiagnosticReport, options: SubmitOptions): Promise<SubmitResult> {
  let payload = '';
  try {
    if (!submissionEnabled(options)) {
      return { success: false, httpStatus: null, errorReason: 'submission-not-enabled' };
    }

    if (!options.endpoint.trim()) {
      await markFailed(report);
      return { success: false, httpStatus: null, errorReason: 'invalid-endpoint' };
    }

    payload = JSON.stringify(report);
    if (payloadBytes(payload) > REPORT_SUBMIT_MAX_BYTES) {
      await markFailed(report);
      return { success: false, httpStatus: null, errorReason: 'payload-too-large' };
    }

    const response = await fetch(options.endpoint, {
      method: 'POST',
      keepalive: true,
      headers: headersForSubmit(options),
      body: payload,
    });

    if (!response.ok) {
      await enqueueFailedReport(report.reportId, payload, 1);
      await markFailed(report);
      return { success: false, httpStatus: response.status, errorReason: 'http-error' };
    }

    await updateReportStatus(report, 'submitted');
    return { success: true, httpStatus: response.status };
  } catch {
    if (payload) await enqueueFailedReport(report.reportId, payload, 1);
    await markFailed(report);
    return { success: false, httpStatus: null, errorReason: 'network-error' };
  }
}
