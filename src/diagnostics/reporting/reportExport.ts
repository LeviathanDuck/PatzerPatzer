import type { DiagnosticReport } from './reportAssembly';

function reportJson(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

function filenameDate(report: DiagnosticReport): string {
  const parsed = Date.parse(report.capturedAt);
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  return date.toISOString().slice(0, 10);
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

export async function copyReportToClipboard(report: DiagnosticReport): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
      console.warn('[diagnostics] clipboard API unavailable for report export');
      return false;
    }

    await navigator.clipboard.writeText(reportJson(report));
    return true;
  } catch (error) {
    console.warn('[diagnostics] failed to copy report JSON to clipboard', error);
    return false;
  }
}

export function downloadReportAsJson(report: DiagnosticReport): void {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      console.warn('[diagnostics] document or URL API unavailable for report download');
      return;
    }

    const blob = new Blob([reportJson(report)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('data-ui-explainer-exempt', 'programmatic-download-node');
    link.href = url;
    link.download = `patzer-report-${safeFilenamePart(report.reportId)}-${filenameDate(report)}.json`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn('[diagnostics] failed to download report JSON', error);
  }
}
