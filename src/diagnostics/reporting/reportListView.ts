import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs } from '../../ui/controlExplainer';
import { copyReportToClipboard, downloadReportAsJson } from './reportExport';
import {
  canTransitionReportTriage,
  reportTriageState,
  REPORT_TRIAGE_STATES,
  type DiagnosticReportTriageState,
  type StoredDiagnosticReport,
} from './reportStore';

export interface ReportListOptions {
  onTriageChange?: (reportId: string, state: DiagnosticReportTriageState) => void;
  onDeleteReport?: (reportId: string) => void;
  onViewReport?: (reportId: string) => void;
  flaggedReportIds?: ReadonlySet<string>;
}

function formattedDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'unknown date';
  return new Date(timestamp).toLocaleString();
}

function routeSummary(route: string): string {
  return route || 'unknown route';
}

function renderReportRow(report: StoredDiagnosticReport, options: ReportListOptions): VNode {
  const triageState = reportTriageState(report);
  const isFlagged = options.flaggedReportIds?.has(report.reportId) ?? false;
  return h('tr.report-list__row', [
    h('td.report-list__cell.report-list__cell--date', formattedDate(report.timestamp)),
    h('td.report-list__cell', [
      h(`span.report-list__badge.report-list__badge--severity-${report.severity}`, report.severity),
    ]),
    h('td.report-list__cell.report-list__cell--route', routeSummary(report.route)),
    h('td.report-list__cell', [
      h(`span.report-list__badge.report-list__badge--status-${report.status}`, report.status),
    ]),
    h('td.report-list__cell', [
      options.onTriageChange
        ? h('select.admin-token-input', {
          attrs: { 'aria-label': `Triage report ${report.reportId}`, ...controlExplainerAttrs({
            label: 'Change report triage state',
            description: 'Moves this saved report through the local diagnostics triage workflow.',
          }) },
          props: { value: triageState },
          on: { change: event => {
            options.onTriageChange?.(
              report.reportId,
              (event.target as HTMLSelectElement).value as DiagnosticReportTriageState,
            );
          } },
        }, REPORT_TRIAGE_STATES.map(state => h('option', {
          attrs: {
            value: state,
            disabled: !canTransitionReportTriage(triageState, state),
          },
        }, state)))
        : h('span.report-list__badge', triageState),
    ]),
    h('td.report-list__cell', [
      isFlagged ? h('span.report-list__badge.report-list__badge--status-failed', 'Retention') : h('span.report-list__badge', 'Current'),
    ]),
    h('td.report-list__cell.report-list__cell--actions', [
      options.onViewReport ? h('button.admin-btn.admin-btn--muted.report-list__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'View report' }) },
        on: { click: () => options.onViewReport?.(report.reportId) },
      }, 'View') : null,
      h('button.admin-btn.admin-btn--muted.report-list__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Copy report JSON',
          description: 'Copies the redacted saved report payload to the clipboard.',
        }) },
        on: { click: () => { void copyReportToClipboard(report); } },
      }, 'Copy JSON'),
      h('button.admin-btn.admin-btn--muted.report-list__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Download report JSON',
          description: 'Downloads the redacted saved report payload as a JSON file.',
        }) },
        on: { click: () => downloadReportAsJson(report) },
      }, 'Download JSON'),
      options.onDeleteReport ? h('button.admin-btn.admin-btn--muted.report-list__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Delete report',
          description: 'Permanently deletes this report from this browser after confirmation.',
        }) },
        on: { click: () => options.onDeleteReport?.(report.reportId) },
      }, 'Delete') : null,
    ]),
  ]);
}

export function renderReportList(reports: StoredDiagnosticReport[], options: ReportListOptions = {}): VNode {
  if (reports.length === 0) {
    return h('p.report-list__empty', 'No saved bug reports in this browser yet.');
  }

  return h('table.report-list', [
    h('thead.report-list__head', [
      h('tr', [
        h('th.report-list__heading', 'Date'),
        h('th.report-list__heading', 'Severity'),
        h('th.report-list__heading', 'Route'),
        h('th.report-list__heading', 'Status'),
        h('th.report-list__heading', 'Triage'),
        h('th.report-list__heading', 'Retention'),
        h('th.report-list__heading', 'Actions'),
      ]),
    ]),
    h('tbody.report-list__body', reports.map(report => renderReportRow(report, options))),
  ]);
}
