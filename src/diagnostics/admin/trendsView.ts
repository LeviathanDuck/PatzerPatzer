import { h, type VNode } from 'snabbdom';
import type { RemoteDiagnosticTrendResult } from '../reporting/remoteViewer';

interface DiagnosticTrendsPanelOptions {
  trends: RemoteDiagnosticTrendResult | null;
  loading: boolean;
  message: string;
  rangeDays: number;
  period: 'day' | 'week';
  onRangeDaysChange: (value: number) => void;
  onPeriodChange: (value: 'day' | 'week') => void;
  onRefresh: () => void;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function renderTrendRows(trends: RemoteDiagnosticTrendResult): VNode {
  if (trends.errorFrequency.length === 0) {
    return h('p.report-list__empty', 'No remote error trend data is available for this range.');
  }

  return h('table.report-list', [
    h('thead.report-list__head', [
      h('tr', [
        h('th.report-list__heading', 'Bucket'),
        h('th.report-list__heading', 'Errors'),
        h('th.report-list__heading', 'Reports'),
      ]),
    ]),
    h('tbody.report-list__body', trends.errorFrequency.map(row => h('tr.report-list__row', [
      h('td.report-list__cell', row.label),
      h('td.report-list__cell', String(row.errorCount)),
      h('td.report-list__cell', String(row.reportCount)),
    ]))),
  ]);
}

export function renderDiagnosticTrendsPanel(options: DiagnosticTrendsPanelOptions): VNode {
  const { trends, loading, message, rangeDays, period } = options;

  return h('section.admin-panel.admin-panel--diagnostic-trends', [
    h('div.admin-panel__header', [
      h('h3', 'Trends'),
      h('span', loading ? 'Loading remote trends...' : trends ? `${trends.rangeDays} day ${trends.period} buckets` : 'Remote aggregate query'),
    ]),
    h('div.admin-token-row', [
      h('select.admin-token-input', {
        props: { value: String(rangeDays) },
        on: { change: event => {
          const parsed = Number((event.target as HTMLSelectElement).value);
          options.onRangeDaysChange(Number.isFinite(parsed) ? parsed : 7);
        } },
      }, [
        h('option', { attrs: { value: '7' } }, 'Last 7 days'),
        h('option', { attrs: { value: '30' } }, 'Last 30 days'),
        h('option', { attrs: { value: '90' } }, 'Last 90 days'),
      ]),
      h('select.admin-token-input', {
        props: { value: period },
        on: { change: event => {
          const value = (event.target as HTMLSelectElement).value === 'week' ? 'week' : 'day';
          options.onPeriodChange(value);
        } },
      }, [
        h('option', { attrs: { value: 'day' } }, 'Daily'),
        h('option', { attrs: { value: 'week' } }, 'Weekly'),
      ]),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: loading },
        on: { click: options.onRefresh },
      }, 'Refresh'),
    ]),
    message ? h('p.admin-log__empty', message) : null,
    trends
      ? h('div.admin-data-section', [
        h('div.admin-counts', [
          h('div.admin-count', [h('span.admin-count__num', String(trends.crashRate.sessionCount)), h('span', 'Sessions')]),
          h('div.admin-count', [h('span.admin-count__num', String(trends.crashRate.crashSessionCount)), h('span', 'Crash sessions')]),
          h('div.admin-count', [h('span.admin-count__num', formatPercent(trends.crashRate.rate)), h('span', 'Crash rate')]),
          h('div.admin-count', [h('span.admin-count__num', String(trends.aggregateSummary.errorFrequencyAggregateTotal)), h('span', 'Aggregate errors')]),
        ]),
        renderTrendRows(trends),
      ])
      : h('p.report-list__empty', loading ? 'Loading remote trends...' : 'No remote trend data is available.'),
  ]);
}
