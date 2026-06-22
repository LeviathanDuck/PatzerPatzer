import { getDiagnosticEvents, getRecentDiagnosticSessions, replaceDiagnosticAggregates } from '../idb';
import {
  Severity,
  type Breadcrumb,
  type DiagnosticAggregate,
  type DiagnosticEvent,
  type DiagnosticMetadataValue,
  type DiagnosticSession,
} from './types';

const ERROR_FREQUENCY_KIND = 'error-frequency';
const ROUTE_INSTABILITY_KIND = 'route-instability';
const PERFORMANCE_PERCENTILE_KIND = 'performance-percentile';
const WORKFLOW_CRASH_CORRELATION_KIND = 'workflow-crash-correlation';
const DEFAULT_PRE_CRASH_BREADCRUMB_WINDOW = 10;

interface ErrorFrequencyBucket {
  groupingKey: string;
  route: string;
  deviceClass: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

interface RouteInstabilityBucket {
  route: string;
  totalEvents: number;
  routeVisitCount: number;
  errorCount: number;
  crashCorrelationCount: number;
  firstSeen: number;
  lastSeen: number;
}

interface PerformancePercentileBucket {
  measureName: string;
  values: number[];
  firstSeen: number;
  lastSeen: number;
}

interface WorkflowCrashCorrelationBucket {
  workflowKey: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

function metadataText(event: DiagnosticEvent, key: string): string | undefined {
  const value: DiagnosticMetadataValue | undefined = event.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function metadataNumber(event: DiagnosticEvent, key: string): number | undefined {
  const value: DiagnosticMetadataValue | undefined = event.metadata?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function messageHash(message: string): string {
  let hash = 2166136261;
  for (let i = 0; i < message.length; i += 1) {
    hash ^= message.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canonicalGroupingKey(event: DiagnosticEvent): string {
  const direct = (event as DiagnosticEvent & { groupingKey?: unknown }).groupingKey;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const metadataKey = metadataText(event, 'groupingKey')
    ?? metadataText(event, 'fingerprint')
    ?? metadataText(event, 'errorKey');
  if (metadataKey) return metadataKey;

  return `${event.kind}:${event.source || event.sourceTag || 'unknown'}:${messageHash(event.message || '')}`;
}

function aggregateId(groupingKey: string, route: string, deviceClass: string): string {
  return [ERROR_FREQUENCY_KIND, groupingKey, route, deviceClass]
    .map(part => encodeURIComponent(part || 'unknown'))
    .join('|');
}

function routeInstabilityAggregateId(route: string): string {
  return [ROUTE_INSTABILITY_KIND, route]
    .map(part => encodeURIComponent(part || 'unknown'))
    .join('|');
}

function performancePercentileAggregateId(measureName: string): string {
  return [PERFORMANCE_PERCENTILE_KIND, measureName]
    .map(part => encodeURIComponent(part || 'unknown'))
    .join('|');
}

function workflowCrashCorrelationAggregateId(workflowKey: string): string {
  return [WORKFLOW_CRASH_CORRELATION_KIND, workflowKey]
    .map(part => encodeURIComponent(part || 'unknown'))
    .join('|');
}

function bucketKey(groupingKey: string, route: string, deviceClass: string): string {
  return `${groupingKey}\u0000${route}\u0000${deviceClass}`;
}

function eventDeviceClass(event: DiagnosticEvent): string {
  return metadataText(event, 'deviceClass') ?? 'unknown';
}

function isErrorFrequencyEvent(event: DiagnosticEvent): boolean {
  return event.kind === 'error'
    || event.kind === 'unhandled-rejection'
    || event.kind === 'resource-error';
}

function isRouteErrorEvent(event: DiagnosticEvent): boolean {
  return isErrorFrequencyEvent(event)
    || event.severity === Severity.Error
    || event.severity === Severity.Fatal;
}

function isCrashCorrelationEvent(event: DiagnosticEvent): boolean {
  return event.kind === 'session-interruption'
    || event.severity === Severity.Fatal
    || metadataText(event, 'inferredCrashType') !== undefined
    || metadataText(event, 'crashType') !== undefined
    || event.message.toLowerCase().includes('crash');
}

function routeKey(route: string | undefined): string {
  const trimmed = route?.trim();
  if (!trimmed) return 'unknown';
  return trimmed.split(/[?#]/, 1)[0] || 'unknown';
}

function routesFromCrashContext(event: DiagnosticEvent): Set<string> {
  const routes = new Set<string>();

  const lastKnownRoute = metadataText(event, 'lastKnownRoute');
  if (lastKnownRoute) routes.add(routeKey(lastKnownRoute));

  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.type !== 'route-transition') continue;
    const from = routeKey(breadcrumb.from);
    const to = routeKey(breadcrumb.to);
    if (from !== 'unknown') routes.add(from);
    if (to !== 'unknown') routes.add(to);
  }

  return routes;
}

function routeErrorRate(bucket: RouteInstabilityBucket): number {
  if (bucket.totalEvents > 0) return bucket.errorCount / bucket.totalEvents;
  return bucket.errorCount > 0 ? 1 : 0;
}

function routesFromSessionCrashContext(session: DiagnosticSession): Set<string> {
  const routes = new Set<string>();
  const directRoute = routeKey(session.route);
  if (directRoute !== 'unknown') routes.add(directRoute);

  for (const breadcrumb of session.breadcrumbs ?? []) {
    if (breadcrumb.type !== 'route-transition') continue;
    const from = routeKey(breadcrumb.from);
    const to = routeKey(breadcrumb.to);
    if (from !== 'unknown') routes.add(from);
    if (to !== 'unknown') routes.add(to);
  }

  return routes;
}

function isRouteVisitEvent(event: DiagnosticEvent): boolean {
  return event.kind === 'route';
}

function isInterruptedSession(session: DiagnosticSession): boolean {
  return session.interruptedDetectedAt !== undefined
    || session.cleanShutdown === false
    || metadataTextFromRecord(session.metadata, 'inferredCrashType') !== undefined
    || metadataTextFromRecord(session.metadata, 'crashType') !== undefined;
}

function metadataTextFromRecord(
  metadata: Record<string, DiagnosticMetadataValue> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function performanceMeasureName(event: DiagnosticEvent): string {
  return metadataText(event, 'measureName')
    ?? metadataText(event, 'measure')
    ?? metadataText(event, 'workflow')
    ?? metadataText(event, 'metric')
    ?? metadataText(event, 'name')
    ?? event.sourceTag
    ?? event.message
    ?? 'unknown';
}

function performanceDurationValue(event: DiagnosticEvent): number | undefined {
  return metadataNumber(event, 'durationMs')
    ?? metadataNumber(event, 'duration')
    ?? metadataNumber(event, 'value')
    ?? metadataNumber(event, 'delta');
}

function workflowKeyFromBreadcrumb(breadcrumb: Breadcrumb): string | undefined {
  switch (breadcrumb.type) {
    case 'route-transition': {
      const to = routeKey(breadcrumb.to);
      if (to !== 'unknown') return `route:${to}`;
      const from = routeKey(breadcrumb.from);
      return from !== 'unknown' ? `route:${from}` : undefined;
    }
    case 'user-action':
      return breadcrumb.action.trim() ? `action:${breadcrumb.action.trim()}` : undefined;
    case 'tool-mode-change': {
      const tool = breadcrumb.tool.trim();
      const mode = breadcrumb.mode?.trim();
      if (!tool) return undefined;
      return mode ? `tool-mode:${tool}:${mode}` : `tool-mode:${tool}`;
    }
    default:
      return undefined;
  }
}

function percentile(sortedValues: number[], quantile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0]!;

  const position = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower]!;
  const upperValue = sortedValues[upper]!;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

export async function aggregateErrorFrequency(): Promise<DiagnosticAggregate[]> {
  const events = await getDiagnosticEvents({ limit: Number.MAX_SAFE_INTEGER });
  const buckets = new Map<string, ErrorFrequencyBucket>();

  for (const event of events) {
    if (!isErrorFrequencyEvent(event)) continue;

    const groupingKey = canonicalGroupingKey(event);
    const route = event.route || 'unknown';
    const deviceClass = eventDeviceClass(event);
    const key = bucketKey(groupingKey, route, deviceClass);
    const existing = buckets.get(key);

    if (existing) {
      existing.count += 1;
      existing.firstSeen = Math.min(existing.firstSeen, event.timestamp);
      existing.lastSeen = Math.max(existing.lastSeen, event.timestamp);
    } else {
      buckets.set(key, {
        groupingKey,
        route,
        deviceClass,
        count: 1,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
      });
    }
  }

  const updatedAt = Date.now();
  const aggregates: DiagnosticAggregate[] = Array.from(buckets.values()).map(bucket => ({
    aggregateId: aggregateId(bucket.groupingKey, bucket.route, bucket.deviceClass),
    kind: ERROR_FREQUENCY_KIND,
    groupingKey: bucket.groupingKey,
    route: bucket.route,
    deviceClass: bucket.deviceClass,
    count: bucket.count,
    firstSeen: bucket.firstSeen,
    lastSeen: bucket.lastSeen,
    updatedAt,
  }));

  await replaceDiagnosticAggregates(ERROR_FREQUENCY_KIND, aggregates);
  return aggregates;
}

export function computeRouteInstabilityAggregates(
  events: DiagnosticEvent[],
  sessions: DiagnosticSession[] = [],
  updatedAt = Date.now(),
): DiagnosticAggregate[] {
  const buckets = new Map<string, RouteInstabilityBucket>();

  const ensureBucket = (route: string, timestamp: number): RouteInstabilityBucket => {
    const key = routeKey(route);
    const existing = buckets.get(key);
    if (existing) {
      existing.firstSeen = Math.min(existing.firstSeen, timestamp);
      existing.lastSeen = Math.max(existing.lastSeen, timestamp);
      return existing;
    }

    const bucket: RouteInstabilityBucket = {
      route: key,
      totalEvents: 0,
      routeVisitCount: 0,
      errorCount: 0,
      crashCorrelationCount: 0,
      firstSeen: timestamp,
      lastSeen: timestamp,
    };
    buckets.set(key, bucket);
    return bucket;
  };

  for (const event of events) {
    const route = routeKey(event.route);
    const bucket = ensureBucket(route, event.timestamp);
    bucket.totalEvents += 1;
    if (isRouteVisitEvent(event)) bucket.routeVisitCount += 1;
    if (isRouteErrorEvent(event)) bucket.errorCount += 1;

    if (isCrashCorrelationEvent(event)) {
      for (const crashRoute of routesFromCrashContext(event)) {
        ensureBucket(crashRoute, event.timestamp).crashCorrelationCount += 1;
      }
    }
  }

  for (const session of sessions) {
    const route = routeKey(session.route);
    const timestamp = session.startedAt;
    const bucket = ensureBucket(route, timestamp);
    bucket.routeVisitCount += 1;
    bucket.firstSeen = Math.min(bucket.firstSeen, session.startedAt);
    bucket.lastSeen = Math.max(bucket.lastSeen, session.lastSeenAt);

    if (isInterruptedSession(session)) {
      for (const crashRoute of routesFromSessionCrashContext(session)) {
        ensureBucket(crashRoute, session.interruptedDetectedAt ?? session.lastSeenAt).crashCorrelationCount += 1;
      }
    }
  }

  return Array.from(buckets.values())
    .filter(bucket => bucket.totalEvents > 0 || bucket.crashCorrelationCount > 0)
    .sort((a, b) => {
      const aRate = routeErrorRate(a);
      const bRate = routeErrorRate(b);
      const aScore = aRate + (a.crashCorrelationCount / Math.max(1, a.routeVisitCount));
      const bScore = bRate + (b.crashCorrelationCount / Math.max(1, b.routeVisitCount));
      return bScore - aScore
        || bRate - aRate
        || b.crashCorrelationCount - a.crashCorrelationCount
        || b.errorCount - a.errorCount
        || a.route.localeCompare(b.route);
    })
    .map((bucket, index) => {
      const errorRate = routeErrorRate(bucket);
      return {
        aggregateId: routeInstabilityAggregateId(bucket.route),
        kind: ROUTE_INSTABILITY_KIND,
        groupingKey: bucket.route,
        route: bucket.route,
        deviceClass: 'all',
        count: bucket.errorCount,
        rank: index + 1,
        totalEvents: bucket.totalEvents,
        routeVisitCount: bucket.routeVisitCount,
        errorCount: bucket.errorCount,
        errorRate,
        crashCorrelationCount: bucket.crashCorrelationCount,
        instabilityScore: errorRate + (bucket.crashCorrelationCount / Math.max(1, bucket.routeVisitCount)),
        firstSeen: bucket.firstSeen,
        lastSeen: bucket.lastSeen,
        updatedAt,
      };
    });
}

export async function aggregateRouteInstability(): Promise<DiagnosticAggregate[]> {
  const events = await getDiagnosticEvents({ limit: Number.MAX_SAFE_INTEGER });
  const sessions = await getRecentDiagnosticSessions(Number.MAX_SAFE_INTEGER);
  const aggregates = computeRouteInstabilityAggregates(events, sessions);
  await replaceDiagnosticAggregates(ROUTE_INSTABILITY_KIND, aggregates);
  return aggregates;
}

export async function runRouteInstabilityAggregation(): Promise<DiagnosticAggregate[]> {
  return aggregateRouteInstability();
}

export function computePerformancePercentileAggregates(
  events: DiagnosticEvent[],
  updatedAt = Date.now(),
): DiagnosticAggregate[] {
  const buckets = new Map<string, PerformancePercentileBucket>();

  for (const event of events) {
    if (event.kind !== 'performance') continue;

    const value = performanceDurationValue(event);
    if (value === undefined) continue;

    const measureName = performanceMeasureName(event);
    const existing = buckets.get(measureName);
    if (existing) {
      existing.values.push(value);
      existing.firstSeen = Math.min(existing.firstSeen, event.timestamp);
      existing.lastSeen = Math.max(existing.lastSeen, event.timestamp);
    } else {
      buckets.set(measureName, {
        measureName,
        values: [value],
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
      });
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.measureName.localeCompare(b.measureName))
    .map(bucket => {
      const sortedValues = bucket.values.slice().sort((a, b) => a - b);
      const p50 = percentile(sortedValues, 0.5);
      const p75 = percentile(sortedValues, 0.75);
      const p95 = percentile(sortedValues, 0.95);
      return {
        aggregateId: performancePercentileAggregateId(bucket.measureName),
        kind: PERFORMANCE_PERCENTILE_KIND,
        groupingKey: bucket.measureName,
        route: 'all',
        deviceClass: 'all',
        count: bucket.values.length,
        measureName: bucket.measureName,
        sampleCount: bucket.values.length,
        p50,
        p75,
        p95,
        firstSeen: bucket.firstSeen,
        lastSeen: bucket.lastSeen,
        updatedAt,
      };
    });
}

export async function aggregatePerformancePercentiles(): Promise<DiagnosticAggregate[]> {
  const events = await getDiagnosticEvents({ limit: Number.MAX_SAFE_INTEGER, kind: 'performance' });
  const aggregates = computePerformancePercentileAggregates(events);
  await replaceDiagnosticAggregates(PERFORMANCE_PERCENTILE_KIND, aggregates);
  return aggregates;
}

export async function runPerformancePercentileAggregation(): Promise<DiagnosticAggregate[]> {
  return aggregatePerformancePercentiles();
}

export function computeWorkflowCrashCorrelationAggregates(
  events: DiagnosticEvent[],
  updatedAt = Date.now(),
  breadcrumbWindow = DEFAULT_PRE_CRASH_BREADCRUMB_WINDOW,
): DiagnosticAggregate[] {
  const buckets = new Map<string, WorkflowCrashCorrelationBucket>();
  const windowSize = Math.max(1, Math.floor(breadcrumbWindow));

  for (const event of events) {
    if (!isCrashCorrelationEvent(event)) continue;

    const breadcrumbs = (event.breadcrumbs ?? [])
      .filter(breadcrumb => breadcrumb.timestamp <= event.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-windowSize);

    for (const breadcrumb of breadcrumbs) {
      const workflowKey = workflowKeyFromBreadcrumb(breadcrumb);
      if (!workflowKey) continue;

      const existing = buckets.get(workflowKey);
      const seenAt = breadcrumb.timestamp;
      if (existing) {
        existing.count += 1;
        existing.firstSeen = Math.min(existing.firstSeen, seenAt);
        existing.lastSeen = Math.max(existing.lastSeen, seenAt);
      } else {
        buckets.set(workflowKey, {
          workflowKey,
          count: 1,
          firstSeen: seenAt,
          lastSeen: seenAt,
        });
      }
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count || a.workflowKey.localeCompare(b.workflowKey))
    .map((bucket, index) => ({
      aggregateId: workflowCrashCorrelationAggregateId(bucket.workflowKey),
      kind: WORKFLOW_CRASH_CORRELATION_KIND,
      groupingKey: bucket.workflowKey,
      route: bucket.workflowKey.startsWith('route:') ? bucket.workflowKey.slice('route:'.length) : 'all',
      deviceClass: 'all',
      count: bucket.count,
      rank: index + 1,
      firstSeen: bucket.firstSeen,
      lastSeen: bucket.lastSeen,
      updatedAt,
    }));
}

export async function aggregateWorkflowCrashCorrelations(
  breadcrumbWindow = DEFAULT_PRE_CRASH_BREADCRUMB_WINDOW,
): Promise<DiagnosticAggregate[]> {
  const events = await getDiagnosticEvents({ limit: Number.MAX_SAFE_INTEGER });
  const aggregates = computeWorkflowCrashCorrelationAggregates(events, Date.now(), breadcrumbWindow);
  await replaceDiagnosticAggregates(WORKFLOW_CRASH_CORRELATION_KIND, aggregates);
  return aggregates;
}
