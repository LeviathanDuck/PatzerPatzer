import { h, type VNode } from 'snabbdom';
import type { DiagnosticReport } from './reportAssembly';
import type { ReportBreadcrumb, ReportRecentError } from './reportContext';
import { redactDiagnosticText } from '../redact';
import type { DiagnosticMetadataValue } from '../types';












export interface PreviewState {
  includeBreadcrumbs: boolean;
  includeRecentErrors: boolean;
  includeEnvironment: boolean;
}

export type PreviewAction =
  | { type: 'includeBreadcrumbs'; value: boolean }
  | { type: 'includeRecentErrors'; value: boolean }
  | { type: 'includeEnvironment'; value: boolean };

export type PreviewDispatch = (action: PreviewAction) => void;
export type PreviewSeenHandler = () => void;

export const defaultPreviewState: PreviewState = {
  includeBreadcrumbs: true,
  includeRecentErrors: true,
  includeEnvironment: true,
};

function valueText(value: DiagnosticMetadataValue | undefined): string {
  if (value === null || value === undefined || value === '') return 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function previewText(value: string): string {
  return redactDiagnosticText(value);
}

function redactedUserInput(report: DiagnosticReport): DiagnosticReport['userInput'] {
  return {
    description: previewText(report.userInput.description),
    whatHappened: previewText(report.userInput.whatHappened ?? ''),
    severity: report.userInput.severity,
    expectedBehavior: previewText(report.userInput.expectedBehavior),
    actualBehavior: previewText(report.userInput.actualBehavior),
  };
}

function formattedTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'unknown time';
  return new Date(timestamp).toLocaleString();
}

function renderField(label: string, value: DiagnosticMetadataValue | undefined): VNode {
  return h('div.report-preview__field', [
    h('dt.report-preview__field-label', label),
    h('dd.report-preview__field-value', valueText(value)),
  ]);
}

function renderSection(title: string, children: VNode[]): VNode {
  return h('section.report-preview__section', [
    h('h4.report-preview__section-title', title),
    ...children,
  ]);
}

function renderToggle(
  label: string,
  checked: boolean,
  actionType: PreviewAction['type'],
  dispatch: PreviewDispatch | undefined,
): VNode {
  return h('label.report-preview__toggle', [
    h('input.report-preview__toggle-input', {
      attrs: {
        type: 'checkbox',
        checked,
      },
      props: {
        checked,
      },
      on: {
        change: (event: Event) => {
          const target = event.target;
          const value = target instanceof HTMLInputElement ? target.checked : checked;
          dispatch?.({ type: actionType, value } as PreviewAction);
        },
      },
    }),
    h('span.report-preview__toggle-label', label),
  ]);
}

function renderToggleSection(title: string, toggle: VNode, children: VNode[]): VNode {
  return h('section.report-preview__section.report-preview__section--optional', [
    h('div.report-preview__section-header', [
      h('h4.report-preview__section-title', title),
      toggle,
    ]),
    ...children,
  ]);
}

function renderBreadcrumb(breadcrumb: ReportBreadcrumb): VNode {
  const fields = Object.entries(breadcrumb.fields);
  return h('li.report-preview__breadcrumb', [
    h('div.report-preview__item-title', `${breadcrumb.type} at ${formattedTimestamp(breadcrumb.timestamp)}`),
    fields.length > 0
      ? h('dl.report-preview__fields.report-preview__fields--compact', fields.map(([key, value]) => renderField(key, value)))
      : h('p.report-preview__empty', 'No additional fields'),
  ]);
}

function renderRecentError(error: ReportRecentError): VNode {
  return h('li.report-preview__error', [
    h('div.report-preview__item-title', `${error.kind} · ${error.severity} · ${formattedTimestamp(error.timestamp)}`),
    h('dl.report-preview__fields.report-preview__fields--compact', [
      renderField('Message', error.message),
      renderField('Route', error.route),
      renderField('Source', error.sourceTag),
    ]),
  ]);
}

export function applyPreviewStateToReport(report: DiagnosticReport, state: PreviewState): DiagnosticReport {
  return {
    ...report,
    userInput: redactedUserInput(report),
    routeContext: {
      ...report.routeContext,
      breadcrumbs: state.includeBreadcrumbs ? report.routeContext.breadcrumbs : [],
      recentErrors: state.includeRecentErrors ? report.routeContext.recentErrors : [],
    },
    environmentContext: state.includeEnvironment ? report.environmentContext : null,
  };
}

export function renderReportPreview(
  report: DiagnosticReport,
  state: PreviewState = defaultPreviewState,
  dispatch?: PreviewDispatch,
  onPreviewSeen?: PreviewSeenHandler,
): VNode {
  const routeContext = report.routeContext;
  const environmentContext = report.environmentContext;
  const userInput = redactedUserInput(report);

  return h('section.report-preview', {
    hook: {
      insert: () => onPreviewSeen?.(),
    },
  }, [
    h('div.report-preview__disclosure', 'This is what will be sent'),
    renderSection('User report', [
      h('dl.report-preview__fields', [
        renderField('Description', userInput.description),
        renderField('What happened', userInput.whatHappened ?? ''),
        renderField('Severity', userInput.severity),
        renderField('Expected behavior', userInput.expectedBehavior),
        renderField('Actual behavior', userInput.actualBehavior),
      ]),
    ]),
    renderSection('Route context', [
      h('dl.report-preview__fields', [
        renderField('Current route', routeContext.route),
        renderField('Surface', report.triggerContext?.triggeredBy),
        renderField('Captured at', formattedTimestamp(routeContext.capturedAt)),
      ]),
    ]),
    renderToggleSection('Breadcrumbs', renderToggle(
      'Include Breadcrumbs',
      state.includeBreadcrumbs,
      'includeBreadcrumbs',
      dispatch,
    ), state.includeBreadcrumbs
      ? [
          routeContext.breadcrumbs.length > 0
            ? h('ol.report-preview__list', routeContext.breadcrumbs.map(renderBreadcrumb))
            : h('p.report-preview__empty', 'No breadcrumbs captured'),
        ]
      : []),
    renderToggleSection('Environment metadata', renderToggle(
      'Include Environment metadata',
      state.includeEnvironment,
      'includeEnvironment',
      dispatch,
    ), state.includeEnvironment && environmentContext
      ? [
          h('dl.report-preview__fields', [
            renderField('Viewport', `${valueText(environmentContext.viewport.width)} x ${valueText(environmentContext.viewport.height)}`),
            renderField('Device pixel ratio', environmentContext.devicePixelRatio),
            renderField('Browser family', environmentContext.userAgent),
            renderField('Connection type', environmentContext.connection.type),
            renderField('Effective connection', environmentContext.connection.effectiveType),
            renderField('Storage quota', environmentContext.storageEstimate.quota),
            renderField('Storage usage', environmentContext.storageEstimate.usage),
            renderField('DOM content loaded', environmentContext.performance.domContentLoaded),
            renderField('Load complete', environmentContext.performance.load),
          ]),
        ]
      : []),
    renderToggleSection('Recent errors', renderToggle(
      'Include Recent errors',
      state.includeRecentErrors,
      'includeRecentErrors',
      dispatch,
    ), state.includeRecentErrors
      ? [
          routeContext.recentErrors.length > 0
            ? h('ol.report-preview__list', routeContext.recentErrors.map(renderRecentError))
            : h('p.report-preview__empty', 'No recent errors captured'),
        ]
      : []),
  ]);
}
