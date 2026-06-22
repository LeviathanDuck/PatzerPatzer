import { h, type VNode } from 'snabbdom';
import type {
  MobileOnlyIssuesReport,
  PostDeployRegressionReport,
  TopCrashGroupsReport,
  TopSlowRoutesReport,
} from '../reports/priorityReports';

interface PrioritySummaryOptions {
  topCrashGroups: TopCrashGroupsReport | null;
  topSlowRoutes: TopSlowRoutesReport | null;
  mobileOnlyIssues: MobileOnlyIssuesReport | null;
  postDeployRegressions: PostDeployRegressionReport | null;
  loading: boolean;
  message: string;
  onRefresh: () => void;
}

function formatTimestamp(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : 'unknown';
}

function renderTopCrashGroupsRows(report: TopCrashGroupsReport): VNode {
  if (report.entries.length === 0) {
    return h('p.report-list__empty', 'No crash-group aggregates are available yet.');
  }

  return h('table.report-list', [
    h('thead.report-list__head', [
      h('tr', [
        h('th.report-list__heading', 'Rank'),
        h('th.report-list__heading', 'Group'),
        h('th.report-list__heading', 'Occurrences'),
        h('th.report-list__heading', 'First seen'),
        h('th.report-list__heading', 'Last seen'),
      ]),
    ]),
    h('tbody.report-list__body', report.entries.map(entry => h('tr.report-list__row', [
      h('td.report-list__cell', String(entry.rank)),
      h('td.report-list__cell', entry.groupingKey),
      h('td.report-list__cell', String(entry.occurrenceCount)),
      h('td.report-list__cell', formatTimestamp(entry.firstSeen)),
      h('td.report-list__cell', formatTimestamp(entry.lastSeen)),
    ]))),
  ]);
}

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'unknown';
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'unknown';
}

function renderTopSlowRoutesRows(report: TopSlowRoutesReport): VNode {
  if (report.entries.length === 0) {
    return h('p.report-list__empty', 'No performance-percentile aggregates are available yet.');
  }

  return h('table.report-list', [
    h('thead.report-list__head', [
      h('tr', [
        h('th.report-list__heading', 'Rank'),
        h('th.report-list__heading', 'Route'),
        h('th.report-list__heading', 'p50'),
        h('th.report-list__heading', 'p75'),
        h('th.report-list__heading', 'p95'),
        h('th.report-list__heading', 'Long tasks'),
        h('th.report-list__heading', 'Samples'),
      ]),
    ]),
    h('tbody.report-list__body', report.entries.map(entry => h('tr.report-list__row', [
      h('td.report-list__cell', String(entry.rank)),
      h('td.report-list__cell', entry.route),
      h('td.report-list__cell', formatMs(entry.p50)),
      h('td.report-list__cell', formatMs(entry.p75)),
      h('td.report-list__cell', formatMs(entry.p95)),
      h('td.report-list__cell', String(entry.longTaskCount)),
      h('td.report-list__cell', String(entry.sampleCount)),
    ]))),
  ]);
}

function renderMobileOnlyRows(report: MobileOnlyIssuesReport): VNode {
  if (report.entries.length === 0) {
    return h('p.report-list__empty', 'No mobile-only issues are available yet.');
  }

  return h('table.report-list', [
    h('thead.report-list__head', [
      h('tr', [
        h('th.report-list__heading', 'Rank'),
        h('th.report-list__heading', 'Group'),
        h('th.report-list__heading', 'Mobile count'),
        h('th.report-list__heading', 'Device classes'),
        h('th.report-list__heading', 'First seen'),
        h('th.report-list__heading', 'Last seen'),
      ]),
    ]),
    h('tbody.report-list__body', report.entries.map(entry => h('tr.report-list__row', [
      h('td.report-list__cell', String(entry.rank)),
      h('td.report-list__cell', entry.groupingKey),
      h('td.report-list__cell', String(entry.mobileOccurrenceCount)),
      h('td.report-list__cell', Object.entries(entry.deviceClasses)
        .map(([deviceClass, count]) => `${deviceClass}: ${count}`)
        .join(', ')),
      h('td.report-list__cell', formatTimestamp(entry.firstSeen)),
      h('td.report-list__cell', formatTimestamp(entry.lastSeen)),
    ]))),
  ]);
}

function renderPostDeployRows(report: PostDeployRegressionReport): VNode {
  if (report.buildChangeAt === null) {
    return h('p.report-list__empty', 'No build identity change has been observed yet.');
  }

  if (report.entries.length === 0) {
    return h('p.report-list__empty', 'No post-deploy regressions exceed the configured threshold.');
  }

  return h('table.report-list', [
    h('thead.report-list__head', [
      h('tr', [
        h('th.report-list__heading', 'Rank'),
        h('th.report-list__heading', 'Group'),
        h('th.report-list__heading', 'Pre count'),
        h('th.report-list__heading', 'Post count'),
        h('th.report-list__heading', 'Pre rate'),
        h('th.report-list__heading', 'Post rate'),
        h('th.report-list__heading', 'Increase'),
      ]),
    ]),
    h('tbody.report-list__body', report.entries.map(entry => h('tr.report-list__row', [
      h('td.report-list__cell', String(entry.rank)),
      h('td.report-list__cell', entry.groupingKey),
      h('td.report-list__cell', String(entry.preDeployCount)),
      h('td.report-list__cell', String(entry.postDeployCount)),
      h('td.report-list__cell', formatPercent(entry.preDeployRate)),
      h('td.report-list__cell', formatPercent(entry.postDeployRate)),
      h('td.report-list__cell', formatPercent(entry.rateIncrease)),
    ]))),
  ]);
}

function renderPrioritySection(title: string, summary: string, body: VNode): VNode {
  return h('section.report-list__section', [
    h('div.report-list__section-header', [
      h('h4', title),
      h('span', summary),
    ]),
    body,
  ]);
}

export function renderPrioritySummaryPanel(options: PrioritySummaryOptions): VNode {
  const { topCrashGroups, topSlowRoutes, mobileOnlyIssues, postDeployRegressions, loading, message } = options;
  return h('section.admin-panel.admin-panel--diagnostic-priority', [
    h('div.admin-panel__header', [
      h('h3', 'Engineering Priority Reports'),
      h('span', loading
        ? 'Loading priority summaries...'
        : topCrashGroups
          ? `${topCrashGroups.entries.length} crash group${topCrashGroups.entries.length === 1 ? '' : 's'} ranked`
          : 'Local priority summary'),
    ]),
    h('div.admin-token-row', [
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: loading },
        on: { click: options.onRefresh },
      }, 'Refresh'),
    ]),
    message ? h('p.admin-log__empty', message) : null,
    renderPrioritySection(
      'Top Crash Groups',
      topCrashGroups ? `${topCrashGroups.entries.length} ranked` : 'pending',
      topCrashGroups
        ? renderTopCrashGroupsRows(topCrashGroups)
        : h('p.report-list__empty', loading ? 'Loading crash-group aggregates...' : 'No crash-group aggregates are available yet.'),
    ),
    renderPrioritySection(
      'Top Slow Routes',
      topSlowRoutes ? `${topSlowRoutes.entries.length} ranked` : 'pending',
      topSlowRoutes
        ? renderTopSlowRoutesRows(topSlowRoutes)
        : h('p.report-list__empty', loading ? 'Loading performance aggregates...' : 'No performance aggregates are available yet.'),
    ),
    renderPrioritySection(
      'Mobile-Only Issues',
      mobileOnlyIssues ? `${mobileOnlyIssues.entries.length} ranked` : 'pending',
      mobileOnlyIssues
        ? renderMobileOnlyRows(mobileOnlyIssues)
        : h('p.report-list__empty', loading ? 'Loading mobile issue aggregates...' : 'No mobile-only issues are available yet.'),
    ),
    renderPrioritySection(
      'Post-Deploy Regressions',
      postDeployRegressions?.buildChangeAt
        ? `latest build change ${formatTimestamp(postDeployRegressions.buildChangeAt)}`
        : 'pending',
      postDeployRegressions
        ? renderPostDeployRows(postDeployRegressions)
        : h('p.report-list__empty', loading ? 'Loading diagnostic events...' : 'No post-deploy regression data is available yet.'),
    ),
  ]);
}
