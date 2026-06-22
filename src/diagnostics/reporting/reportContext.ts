import { getDiagnosticEvents } from '../../idb';
import { snapshotBreadcrumbs } from '../record';
import { redactDiagnosticText, redactEventMetadata, sanitizeRoute } from '../redact';
import {
  Severity,
  type Breadcrumb,
  type DiagnosticEvent,
  type DiagnosticMetadata,
  type EventKind,
} from '../types';

const DEFAULT_BREADCRUMB_LIMIT = 30;
const DEFAULT_RECENT_ERROR_LIMIT = 20;
const DIAGNOSTIC_EVENT_SCAN_LIMIT = 2000;

export interface ReportBreadcrumb {
  type: Breadcrumb['type'];
  timestamp: number;
  fields: Record<string, string | number | boolean | null>;
}

export interface ReportRecentError {
  eventId: string;
  timestamp: number;
  kind: EventKind;
  severity: Severity;
  route: string;
  sourceTag: string;
  message: string;
  metadata?: DiagnosticMetadata;
  breadcrumbs?: ReportBreadcrumb[];
}

export interface RouteContext {
  route: string;
  breadcrumbs: ReportBreadcrumb[];
  recentErrors: ReportRecentError[];
  capturedAt: number;
}

export interface CaptureRouteContextOptions {
  breadcrumbLimit?: number;
  recentErrorLimit?: number;
}

export interface ViewportContext {
  width: number | null;
  height: number | null;
}

export interface ConnectionContext {
  type: string | null;
  effectiveType: string | null;
}

export interface StorageEstimateContext {
  quota: number | null;
  usage: number | null;
}

export interface PerformanceSummaryContext {
  domContentLoaded: number | null;
  load: number | null;
}

export interface EnvironmentContext {
  userAgent: string | null;
  hardwareConcurrency: number | null;
  viewport: ViewportContext;
  devicePixelRatio: number | null;
  connection: ConnectionContext;
  storageEstimate: StorageEstimateContext;
  performance: PerformanceSummaryContext;
}

interface NavigatorWithConnection extends Navigator {
  connection?: {
    type?: string;
    effectiveType?: string;
  };
}











function normalizedLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function currentRoute(): string {
  try {
    if (typeof window === 'undefined') return '';
    const path = window.location.pathname || '';
    const hash = window.location.hash || '';
    const hashRoute = hash.startsWith('#/') ? hash.slice(1) : '';
    return sanitizeRoute(hashRoute || path);
  } catch {
    return '';
  }
}

function redactText(value: string): string {
  return redactDiagnosticText(value);
}

function redactFieldValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactText(value);
  try {
    return redactText(JSON.stringify(value));
  } catch {
    return redactText(String(value));
  }
}

function addField(fields: Record<string, string | number | boolean | null>, key: string, value: unknown): void {
  if (value === undefined) return;
  fields[key] = redactFieldValue(value);
}

function redactBreadcrumb(breadcrumb: Breadcrumb): ReportBreadcrumb {
  const fields: Record<string, string | number | boolean | null> = {};

  switch (breadcrumb.type) {
    case 'route-transition':
      fields.from = sanitizeRoute(breadcrumb.from);
      fields.to = sanitizeRoute(breadcrumb.to);
      break;
    case 'user-action':
      addField(fields, 'action', breadcrumb.action);
      addField(fields, 'target', breadcrumb.target);
      break;
    case 'engine-state-change':
      addField(fields, 'state', breadcrumb.state);
      addField(fields, 'detail', breadcrumb.detail);
      break;
    case 'import-step':
      addField(fields, 'step', breadcrumb.step);
      addField(fields, 'platform', breadcrumb.platform);
      addField(fields, 'count', breadcrumb.count);
      break;
    case 'lifecycle-change':
      addField(fields, 'event', breadcrumb.event);
      break;
    case 'tool-mode-change':
      addField(fields, 'tool', breadcrumb.tool);
      addField(fields, 'mode', breadcrumb.mode);
      break;
    default: {
      const exhaustive: never = breadcrumb;
      return exhaustive;
    }
  }

  return {
    type: breadcrumb.type,
    timestamp: breadcrumb.timestamp,
    fields,
  };
}

function isErrorLikeEvent(event: DiagnosticEvent): boolean {
  return (
    event.kind === 'error'
    || event.kind === 'unhandled-rejection'
    || event.kind === 'resource-error'
    || event.severity === Severity.Error
    || event.severity === Severity.Fatal
  );
}

function redactMetadata(metadata: DiagnosticMetadata | undefined): DiagnosticMetadata | undefined {
  if (!metadata) return undefined;
  const redacted = redactEventMetadata(metadata);
  return Object.keys(redacted).length > 0 ? redacted : undefined;
}

function redactDiagnosticEvent(event: DiagnosticEvent): ReportRecentError {
  const breadcrumbs = event.breadcrumbs?.map(redactBreadcrumb);
  const metadata = redactMetadata(event.metadata);
  const redactedEvent: ReportRecentError = {
    eventId: redactText(event.eventId),
    timestamp: event.timestamp,
    kind: event.kind,
    severity: event.severity,
    route: sanitizeRoute(event.route),
    sourceTag: redactText(event.sourceTag),
    message: redactText(event.message),
  };

  if (metadata) redactedEvent.metadata = metadata;
  if (breadcrumbs && breadcrumbs.length > 0) redactedEvent.breadcrumbs = breadcrumbs;

  return redactedEvent;
}

async function readRecentErrors(limit: number): Promise<ReportRecentError[]> {
  try {
    if (limit === 0) return [];
    const events = await getDiagnosticEvents({ limit: DIAGNOSTIC_EVENT_SCAN_LIMIT });
    return events
      .filter(isErrorLikeEvent)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(redactDiagnosticEvent);
  } catch {
    return [];
  }
}

function readBreadcrumbs(limit: number): ReportBreadcrumb[] {
  try {
    if (limit === 0) return [];
    return snapshotBreadcrumbs(limit).map(redactBreadcrumb);
  } catch {
    return [];
  }
}

export async function captureRouteContext(options: CaptureRouteContextOptions = {}): Promise<RouteContext> {
  const breadcrumbLimit = normalizedLimit(options.breadcrumbLimit, DEFAULT_BREADCRUMB_LIMIT);
  const recentErrorLimit = normalizedLimit(options.recentErrorLimit, DEFAULT_RECENT_ERROR_LIMIT);

  return {
    route: currentRoute(),
    breadcrumbs: readBreadcrumbs(breadcrumbLimit),
    recentErrors: await readRecentErrors(recentErrorLimit),
    capturedAt: Date.now(),
  };
}

function emptyEnvironmentContext(): EnvironmentContext {
  return {
    userAgent: null,
    hardwareConcurrency: null,
    viewport: {
      width: null,
      height: null,
    },
    devicePixelRatio: null,
    connection: {
      type: null,
      effectiveType: null,
    },
    storageEstimate: {
      quota: null,
      usage: null,
    },
    performance: {
      domContentLoaded: null,
      load: null,
    },
  };
}

function captureNavigatorContext(context: EnvironmentContext): void {
  try {
    if (typeof navigator === 'undefined') return;
    context.userAgent = navigator.userAgent || null;
    context.hardwareConcurrency = Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null;

    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection) {
      context.connection.type = connection.type ?? null;
      context.connection.effectiveType = connection.effectiveType ?? null;
    }
  } catch {
    // Environment capture must never throw into report opening.
  }
}

function captureViewportContext(context: EnvironmentContext): void {
  try {
    if (typeof window === 'undefined') return;
    context.viewport.width = Number.isFinite(window.innerWidth) ? Math.max(0, Math.floor(window.innerWidth)) : null;
    context.viewport.height = Number.isFinite(window.innerHeight) ? Math.max(0, Math.floor(window.innerHeight)) : null;
    context.devicePixelRatio = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : null;
  } catch {
    // Environment capture must never throw into report opening.
  }
}

function capturePerformanceContext(context: EnvironmentContext): void {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return;
    const navigation = performance.getEntriesByType('navigation')[0];
    if (!(navigation instanceof PerformanceNavigationTiming)) return;

    context.performance.domContentLoaded = Number.isFinite(navigation.domContentLoadedEventEnd)
      ? Math.max(0, Math.round(navigation.domContentLoadedEventEnd))
      : null;
    context.performance.load = Number.isFinite(navigation.loadEventEnd)
      ? Math.max(0, Math.round(navigation.loadEventEnd))
      : null;
  } catch {
    // Environment capture must never throw into report opening.
  }
}

async function captureStorageEstimate(context: EnvironmentContext): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') return;
    const estimate = await navigator.storage.estimate();
    context.storageEstimate.quota = estimate.quota ?? null;
    context.storageEstimate.usage = estimate.usage ?? null;
  } catch {
    // Environment capture must never throw into report opening.
  }
}

export async function captureEnvironmentContext(): Promise<EnvironmentContext> {
  const context = emptyEnvironmentContext();

  try {
    captureNavigatorContext(context);
    captureViewportContext(context);
    capturePerformanceContext(context);
    await captureStorageEstimate(context);
  } catch {
    // Environment capture must never throw into report opening.
  }

  return context;
}
