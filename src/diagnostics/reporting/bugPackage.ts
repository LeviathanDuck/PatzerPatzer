import { getDiagnosticEvents } from '../../idb';
import { snapshotBreadcrumbs } from '../record';
import { redactDiagnosticText, redactEventMetadata, sanitizeRoute } from '../redact';
import { currentAppRoute, currentSafeRouteQueryParams, sanitizeAppRoute } from '../route';
import type { DiagnosticReport } from './reportAssembly';
import type {
  Breadcrumb,
  BugPackage,
  BugPackageLongTask,
  BugPackagePerformanceMetric,
  BugPackagePerformanceSummary,
  BugPackageRouteContext,
  BugPackageRouteTransition,
  DiagnosticErrorGroup,
  DiagnosticEvent,
  DiagnosticMetadata,
  DiagnosticMetadataValue,
} from '../types';

const BUG_PACKAGE_BREADCRUMB_LIMIT = 30;
const ROUTE_TRANSITION_LIMIT = 3;
const PERFORMANCE_SCAN_LIMIT = 300;

export interface AssembleBugPackageOptions {
  report: DiagnosticReport;
  errorGroup: DiagnosticErrorGroup;
  breadcrumbs?: Breadcrumb[];
  reproNotes?: string;
}

type MetricName = 'CLS' | 'LCP' | 'INP' | 'FCP' | 'TTFB';

function redactText(value: string): string {
  return redactDiagnosticText(value);
}

function metadataValue(value: unknown): DiagnosticMetadataValue {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(metadataValue);
  if (value && typeof value === 'object') {
    return redactEventMetadata(value as Record<string, unknown>);
  }
  return redactText(String(value));
}

function metadataFromRecord(record: Record<string, unknown>): DiagnosticMetadata {
  const redacted: DiagnosticMetadata = {};
  const safe = redactEventMetadata(record);

  for (const [key, value] of Object.entries(safe)) {
    redacted[key] = value;
  }

  return redacted;
}

function reportMetadata(report: DiagnosticReport): DiagnosticMetadata {
  return metadataFromRecord({
    reportId: report.reportId,
    sessionId: report.sessionId,
    capturedAt: report.capturedAt,
    severity: report.userInput.severity,
    description: report.userInput.description,
    expectedBehavior: report.userInput.expectedBehavior,
    actualBehavior: report.userInput.actualBehavior,
    route: sanitizeAppRoute(report.routeContext.route),
  });
}

function errorGroupMetadata(errorGroup: DiagnosticErrorGroup): DiagnosticMetadata {
  const metadata = metadataFromRecord({
    errorGroupId: errorGroup.errorGroupId,
    eventIds: errorGroup.eventIds?.join(',') ?? null,
    kind: errorGroup.kind ?? null,
    severity: errorGroup.severity ?? null,
    route: errorGroup.route ? sanitizeAppRoute(errorGroup.route) : null,
    sourceTag: errorGroup.sourceTag ?? null,
    message: errorGroup.message ?? null,
    firstSeenAt: errorGroup.firstSeenAt ?? null,
    lastSeenAt: errorGroup.lastSeenAt ?? null,
    count: errorGroup.count ?? null,
  });

  if (errorGroup.metadata) {
    for (const [key, value] of Object.entries(redactEventMetadata(errorGroup.metadata))) {
      metadata[`metadata.${key}`] = value;
    }
  }

  return metadata;
}

function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  switch (breadcrumb.type) {
    case 'route-transition':
      return {
        ...breadcrumb,
        from: sanitizeAppRoute(breadcrumb.from),
        to: sanitizeAppRoute(breadcrumb.to),
      };
    case 'user-action':
      return {
        ...breadcrumb,
        action: redactText(breadcrumb.action),
        ...(breadcrumb.target ? { target: redactText(breadcrumb.target) } : {}),
      };
    case 'engine-state-change':
      return {
        ...breadcrumb,
        state: redactText(breadcrumb.state),
        ...(breadcrumb.detail ? { detail: redactText(breadcrumb.detail) } : {}),
      };
    case 'import-step':
      return {
        ...breadcrumb,
        step: redactText(breadcrumb.step),
        ...(breadcrumb.platform ? { platform: redactText(breadcrumb.platform) } : {}),
      };
    case 'lifecycle-change':
      return {
        ...breadcrumb,
        event: redactText(breadcrumb.event),
      };
    case 'tool-mode-change':
      return {
        ...breadcrumb,
        tool: redactText(breadcrumb.tool),
        ...(breadcrumb.mode ? { mode: redactText(breadcrumb.mode) } : {}),
      };
    default: {
      const exhaustive: never = breadcrumb;
      return exhaustive;
    }
  }
}

function routeTransitions(breadcrumbs: Breadcrumb[]): BugPackageRouteTransition[] {
  return breadcrumbs
    .filter((breadcrumb): breadcrumb is Breadcrumb & { type: 'route-transition' } => (
      breadcrumb.type === 'route-transition'
    ))
    .slice(-ROUTE_TRANSITION_LIMIT)
    .map(breadcrumb => ({
      from: sanitizeAppRoute(breadcrumb.from),
      to: sanitizeAppRoute(breadcrumb.to),
      timestamp: breadcrumb.timestamp,
    }));
}

function buildRouteContext(breadcrumbs: Breadcrumb[]): BugPackageRouteContext {
  return {
    route: currentAppRoute(),
    queryParams: currentSafeRouteQueryParams(),
    recentTransitions: routeTransitions(breadcrumbs),
  };
}

function numberMetadata(value: DiagnosticMetadataValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringMetadata(value: DiagnosticMetadataValue | undefined): string | null {
  return typeof value === 'string' ? redactText(value) : null;
}

function metricNameFromEvent(event: DiagnosticEvent): MetricName | null {
  const metric = event.metadata?.metric;
  if (metric === 'CLS' || metric === 'LCP' || metric === 'INP' || metric === 'FCP' || metric === 'TTFB') {
    return metric;
  }
  if (event.sourceTag.endsWith('.cls')) return 'CLS';
  if (event.sourceTag.endsWith('.lcp')) return 'LCP';
  if (event.sourceTag.endsWith('.inp')) return 'INP';
  if (event.sourceTag.endsWith('.fcp')) return 'FCP';
  if (event.sourceTag.endsWith('.ttfb')) return 'TTFB';
  return null;
}

function performanceMetric(event: DiagnosticEvent): BugPackagePerformanceMetric {
  return {
    value: numberMetadata(event.metadata?.value),
    rating: stringMetadata(event.metadata?.rating),
    timestamp: event.timestamp,
  };
}

function longTaskFromEvent(event: DiagnosticEvent): BugPackageLongTask {
  return {
    startTime: numberMetadata(event.metadata?.startTime),
    duration: numberMetadata(event.metadata?.duration),
    route: event.metadata?.route ? stringMetadata(event.metadata.route) : sanitizeRoute(event.route),
    timestamp: event.timestamp,
  };
}

async function readPerformanceSummary(): Promise<BugPackagePerformanceSummary | null> {
  try {
    const events = await getDiagnosticEvents({ limit: PERFORMANCE_SCAN_LIMIT, kind: 'performance' });
    const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
    const summary: BugPackagePerformanceSummary = {
      CLS: null,
      LCP: null,
      INP: null,
      FCP: null,
      TTFB: null,
      recentLongTask: null,
    };

    for (const event of sorted) {
      const metricName = metricNameFromEvent(event);
      if (metricName && summary[metricName] === null) {
        summary[metricName] = performanceMetric(event);
      }
      if (!summary.recentLongTask && event.sourceTag === 'performance.longtask') {
        summary.recentLongTask = longTaskFromEvent(event);
      }
    }

    const hasMetric = summary.CLS || summary.LCP || summary.INP || summary.FCP || summary.TTFB || summary.recentLongTask;
    return hasMetric ? summary : null;
  } catch {
    return null;
  }
}

function safePackageId(value: string): string {
  return redactText(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function serializeBugPackage(pkg: BugPackage): string {
  return JSON.stringify(pkg, (_key, value: unknown) => metadataValue(value), 2);
}

export async function assembleBugPackage(options: AssembleBugPackageOptions): Promise<BugPackage> {
  const sourceBreadcrumbs = options.breadcrumbs ?? snapshotBreadcrumbs(BUG_PACKAGE_BREADCRUMB_LIMIT);
  const breadcrumbs = sourceBreadcrumbs.slice(-BUG_PACKAGE_BREADCRUMB_LIMIT).map(sanitizeBreadcrumb);
  const reproNotes = options.reproNotes ? redactText(options.reproNotes) : '';

  return {
    reportId: redactText(options.report.reportId),
    errorGroupId: redactText(options.errorGroup.errorGroupId),
    report: reportMetadata(options.report),
    errorGroup: errorGroupMetadata(options.errorGroup),
    breadcrumbs,
    routeContext: buildRouteContext(breadcrumbs),
    performanceSummary: await readPerformanceSummary(),
    reproNotes,
    assembledAt: new Date().toISOString(),
  };
}

export async function copyBugPackageToClipboard(pkg: BugPackage): Promise<void> {
  const json = serializeBugPackage(pkg);

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(json);
      return;
    }

    if (typeof document === 'undefined') return;
    const textarea = document.createElement('textarea');
    textarea.value = json;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  } catch {
    // Export helpers must not throw into diagnostics UI callers.
  }
}

export function downloadBugPackageAsJson(pkg: BugPackage, filename?: string): void {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return;

    const defaultFilename = `patzer-bug-${safePackageId(pkg.reportId)}-${Date.now()}.json`;
    const blob = new Blob([serializeBugPackage(pkg)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename ?? defaultFilename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Export helpers must not throw into diagnostics UI callers.
  }
}
