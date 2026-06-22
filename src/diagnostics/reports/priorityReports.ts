import { getDiagnosticAggregates, getDiagnosticEvents } from '../../idb';
import { Severity, type DiagnosticAggregate, type DiagnosticEvent, type DiagnosticMetadataValue } from '../types';

const ERROR_FREQUENCY_KIND = 'error-frequency';
const PERFORMANCE_PERCENTILE_KIND = 'performance-percentile';
const DEFAULT_TOP_CRASH_GROUP_LIMIT = 10;
const DEFAULT_TOP_SLOW_ROUTE_LIMIT = 10;
const DEFAULT_MOBILE_ONLY_LIMIT = 10;
const DEFAULT_POST_DEPLOY_LIMIT = 10;
const DEFAULT_POST_DEPLOY_REGRESSION_THRESHOLD = 0.25;

export interface TopCrashGroupReportEntry {
  rank: number;
  groupingKey: string;
  occurrenceCount: number;
  firstSeen: number;
  lastSeen: number;
}

export interface TopCrashGroupsReport {
  generatedAt: number;
  entries: TopCrashGroupReportEntry[];
}

export interface TopSlowRouteReportEntry {
  rank: number;
  route: string;
  p50: number;
  p75: number;
  p95: number;
  longTaskCount: number;
  sampleCount: number;
}

export interface TopSlowRoutesReport {
  generatedAt: number;
  entries: TopSlowRouteReportEntry[];
}

export interface MobileOnlyIssueReportEntry {
  rank: number;
  groupingKey: string;
  mobileOccurrenceCount: number;
  deviceClasses: Record<string, number>;
  firstSeen: number;
  lastSeen: number;
}

export interface MobileOnlyIssuesReport {
  generatedAt: number;
  entries: MobileOnlyIssueReportEntry[];
}

export interface PostDeployRegressionReportEntry {
  rank: number;
  groupingKey: string;
  preDeployCount: number;
  postDeployCount: number;
  preDeployRate: number;
  postDeployRate: number;
  rateIncrease: number;
}

export interface PostDeployRegressionReport {
  generatedAt: number;
  buildChangeAt: number | null;
  previousBuildId: string | null;
  currentBuildId: string | null;
  threshold: number;
  entries: PostDeployRegressionReportEntry[];
}

interface CrashGroupBucket {
  groupingKey: string;
  occurrenceCount: number;
  firstSeen: number;
  lastSeen: number;
}

interface SlowRouteBucket {
  route: string;
  p50: number;
  p75: number;
  p95: number;
  longTaskCount: number;
  sampleCount: number;
}

interface MobileOnlyBucket {
  groupingKey: string;
  count: number;
  deviceClasses: Record<string, number>;
  firstSeen: number;
  lastSeen: number;
}

interface DeployEventBucket {
  count: number;
}

function metadataText(event: DiagnosticEvent, key: string): string | undefined {
  const value: DiagnosticMetadataValue | undefined = event.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function messageHash(message: string): string {
  let hash = 2166136261;
  for (let i = 0; i < message.length; i += 1) {
    hash ^= message.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function eventGroupingKey(event: DiagnosticEvent): string {
  const direct = (event as DiagnosticEvent & { groupingKey?: unknown }).groupingKey;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  return metadataText(event, 'groupingKey')
    ?? metadataText(event, 'fingerprint')
    ?? metadataText(event, 'errorKey')
    ?? `${event.kind}:${event.source || event.sourceTag || 'unknown'}:${messageHash(event.message || '')}`;
}

function eventBuildId(event: DiagnosticEvent): string {
  return metadataText(event, 'buildId') ?? metadataText(event, 'build') ?? 'unknown';
}

function isErrorEvent(event: DiagnosticEvent): boolean {
  return event.kind === 'error'
    || event.kind === 'unhandled-rejection'
    || event.kind === 'resource-error'
    || event.severity === Severity.Error
    || event.severity === Severity.Fatal;
}

function routeLabel(aggregate: DiagnosticAggregate): string {
  const route = aggregate.route?.trim();
  if (route && route !== 'all' && route !== 'unknown') return route;
  const key = aggregate.groupingKey || aggregate.measureName || 'unknown';
  return key.startsWith('route:') ? key.slice('route:'.length) || 'unknown' : key;
}

function aggregateLongTaskCount(aggregate: DiagnosticAggregate): number {
  if (typeof aggregate.longTaskCount === 'number' && Number.isFinite(aggregate.longTaskCount)) {
    return aggregate.longTaskCount;
  }

  const name = `${aggregate.measureName ?? ''} ${aggregate.groupingKey}`.toLowerCase();
  return name.includes('longtask') || name.includes('long-task')
    ? aggregate.sampleCount ?? aggregate.count
    : 0;
}

export function buildTopCrashGroupsReport(
  aggregates: DiagnosticAggregate[],
  generatedAt = Date.now(),
  limit = DEFAULT_TOP_CRASH_GROUP_LIMIT,
): TopCrashGroupsReport {
  const buckets = new Map<string, CrashGroupBucket>();

  for (const aggregate of aggregates) {
    if (aggregate.kind !== ERROR_FREQUENCY_KIND) continue;
    const groupingKey = aggregate.groupingKey.trim();
    if (!groupingKey) continue;

    const existing = buckets.get(groupingKey);
    if (existing) {
      existing.occurrenceCount += aggregate.count;
      existing.firstSeen = Math.min(existing.firstSeen, aggregate.firstSeen);
      existing.lastSeen = Math.max(existing.lastSeen, aggregate.lastSeen);
    } else {
      buckets.set(groupingKey, {
        groupingKey,
        occurrenceCount: aggregate.count,
        firstSeen: aggregate.firstSeen,
        lastSeen: aggregate.lastSeen,
      });
    }
  }

  const maxEntries = Math.max(0, Math.floor(limit));
  const entries = Array.from(buckets.values())
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount
      || b.lastSeen - a.lastSeen
      || a.groupingKey.localeCompare(b.groupingKey))
    .slice(0, maxEntries)
    .map((bucket, index) => ({
      rank: index + 1,
      groupingKey: bucket.groupingKey,
      occurrenceCount: bucket.occurrenceCount,
      firstSeen: bucket.firstSeen,
      lastSeen: bucket.lastSeen,
    }));

  return { generatedAt, entries };
}

export function buildTopSlowRoutesReport(
  aggregates: DiagnosticAggregate[],
  generatedAt = Date.now(),
  limit = DEFAULT_TOP_SLOW_ROUTE_LIMIT,
): TopSlowRoutesReport {
  const buckets = new Map<string, SlowRouteBucket>();

  for (const aggregate of aggregates) {
    if (aggregate.kind !== PERFORMANCE_PERCENTILE_KIND || !Number.isFinite(aggregate.p95)) continue;

    const route = routeLabel(aggregate);
    const existing = buckets.get(route);
    const p50 = aggregate.p50 ?? 0;
    const p75 = aggregate.p75 ?? 0;
    const p95 = aggregate.p95 ?? 0;
    const longTaskCount = aggregateLongTaskCount(aggregate);
    const sampleCount = aggregate.sampleCount ?? aggregate.count;

    if (existing) {
      existing.p50 = Math.max(existing.p50, p50);
      existing.p75 = Math.max(existing.p75, p75);
      existing.p95 = Math.max(existing.p95, p95);
      existing.longTaskCount += longTaskCount;
      existing.sampleCount += sampleCount;
    } else {
      buckets.set(route, { route, p50, p75, p95, longTaskCount, sampleCount });
    }
  }

  const maxEntries = Math.max(0, Math.floor(limit));
  const entries = Array.from(buckets.values())
    .sort((a, b) => b.p95 - a.p95
      || b.longTaskCount - a.longTaskCount
      || a.route.localeCompare(b.route))
    .slice(0, maxEntries)
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

  return { generatedAt, entries };
}

export function buildMobileOnlyIssuesReport(
  aggregates: DiagnosticAggregate[],
  generatedAt = Date.now(),
  limit = DEFAULT_MOBILE_ONLY_LIMIT,
): MobileOnlyIssuesReport {
  const buckets = new Map<string, MobileOnlyBucket>();

  for (const aggregate of aggregates) {
    if (aggregate.kind !== ERROR_FREQUENCY_KIND) continue;
    const groupingKey = aggregate.groupingKey.trim();
    if (!groupingKey) continue;

    const deviceClass = (aggregate.deviceClass || 'unknown').toLowerCase();
    const existing = buckets.get(groupingKey);
    if (existing) {
      existing.count += aggregate.count;
      existing.deviceClasses[deviceClass] = (existing.deviceClasses[deviceClass] ?? 0) + aggregate.count;
      existing.firstSeen = Math.min(existing.firstSeen, aggregate.firstSeen);
      existing.lastSeen = Math.max(existing.lastSeen, aggregate.lastSeen);
    } else {
      buckets.set(groupingKey, {
        groupingKey,
        count: aggregate.count,
        deviceClasses: { [deviceClass]: aggregate.count },
        firstSeen: aggregate.firstSeen,
        lastSeen: aggregate.lastSeen,
      });
    }
  }

  const maxEntries = Math.max(0, Math.floor(limit));
  const entries = Array.from(buckets.values())
    .filter(bucket => {
      const desktopCount = bucket.deviceClasses.desktop ?? 0;
      const mobileCount = (bucket.deviceClasses.mobile ?? 0) + (bucket.deviceClasses.tablet ?? 0);
      return desktopCount === 0 && mobileCount > 0;
    })
    .sort((a, b) => {
      const aMobile = (a.deviceClasses.mobile ?? 0) + (a.deviceClasses.tablet ?? 0);
      const bMobile = (b.deviceClasses.mobile ?? 0) + (b.deviceClasses.tablet ?? 0);
      return bMobile - aMobile || b.lastSeen - a.lastSeen || a.groupingKey.localeCompare(b.groupingKey);
    })
    .slice(0, maxEntries)
    .map((bucket, index) => ({
      rank: index + 1,
      groupingKey: bucket.groupingKey,
      mobileOccurrenceCount: (bucket.deviceClasses.mobile ?? 0) + (bucket.deviceClasses.tablet ?? 0),
      deviceClasses: bucket.deviceClasses,
      firstSeen: bucket.firstSeen,
      lastSeen: bucket.lastSeen,
    }));

  return { generatedAt, entries };
}

export function buildPostDeployRegressionReport(
  events: DiagnosticEvent[],
  generatedAt = Date.now(),
  threshold = DEFAULT_POST_DEPLOY_REGRESSION_THRESHOLD,
  limit = DEFAULT_POST_DEPLOY_LIMIT,
): PostDeployRegressionReport {
  const lifecycleEvents = events
    .filter(event => event.kind === 'lifecycle')
    .map(event => ({ event, buildId: eventBuildId(event) }))
    .filter(item => item.buildId !== 'unknown')
    .sort((a, b) => a.event.timestamp - b.event.timestamp);

  let buildChangeAt: number | null = null;
  let previousBuildId: string | null = null;
  let currentBuildId: string | null = null;

  for (let i = 1; i < lifecycleEvents.length; i += 1) {
    const previous = lifecycleEvents[i - 1]!;
    const current = lifecycleEvents[i]!;
    if (previous.buildId !== current.buildId) {
      buildChangeAt = current.event.timestamp;
      previousBuildId = previous.buildId;
      currentBuildId = current.buildId;
    }
  }

  if (buildChangeAt === null) {
    return { generatedAt, buildChangeAt, previousBuildId, currentBuildId, threshold, entries: [] };
  }

  const preDeploy = new Map<string, DeployEventBucket>();
  const postDeploy = new Map<string, DeployEventBucket>();
  let preTotal = 0;
  let postTotal = 0;

  for (const event of events) {
    if (!isErrorEvent(event)) continue;
    const target = event.timestamp < buildChangeAt ? preDeploy : postDeploy;
    if (event.timestamp < buildChangeAt) preTotal += 1;
    else postTotal += 1;

    const groupingKey = eventGroupingKey(event);
    const bucket = target.get(groupingKey) ?? { count: 0 };
    bucket.count += 1;
    target.set(groupingKey, bucket);
  }

  const groupingKeys = new Set([...preDeploy.keys(), ...postDeploy.keys()]);
  const maxEntries = Math.max(0, Math.floor(limit));
  const entries = Array.from(groupingKeys)
    .map(groupingKey => {
      const preDeployCount = preDeploy.get(groupingKey)?.count ?? 0;
      const postDeployCount = postDeploy.get(groupingKey)?.count ?? 0;
      const preDeployRate = preTotal > 0 ? preDeployCount / preTotal : 0;
      const postDeployRate = postTotal > 0 ? postDeployCount / postTotal : 0;
      return {
        groupingKey,
        preDeployCount,
        postDeployCount,
        preDeployRate,
        postDeployRate,
        rateIncrease: postDeployRate - preDeployRate,
      };
    })
    .filter(entry => entry.postDeployCount > 0 && entry.rateIncrease >= threshold)
    .sort((a, b) => b.rateIncrease - a.rateIncrease
      || b.postDeployCount - a.postDeployCount
      || a.groupingKey.localeCompare(b.groupingKey))
    .slice(0, maxEntries)
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

  return { generatedAt, buildChangeAt, previousBuildId, currentBuildId, threshold, entries };
}

export async function loadTopCrashGroupsReport(limit = DEFAULT_TOP_CRASH_GROUP_LIMIT): Promise<TopCrashGroupsReport> {
  const aggregates = await getDiagnosticAggregates(ERROR_FREQUENCY_KIND);
  return buildTopCrashGroupsReport(aggregates, Date.now(), limit);
}

export async function loadTopSlowRoutesReport(limit = DEFAULT_TOP_SLOW_ROUTE_LIMIT): Promise<TopSlowRoutesReport> {
  const aggregates = await getDiagnosticAggregates(PERFORMANCE_PERCENTILE_KIND);
  return buildTopSlowRoutesReport(aggregates, Date.now(), limit);
}

export async function loadMobileOnlyIssuesReport(limit = DEFAULT_MOBILE_ONLY_LIMIT): Promise<MobileOnlyIssuesReport> {
  const aggregates = await getDiagnosticAggregates(ERROR_FREQUENCY_KIND);
  return buildMobileOnlyIssuesReport(aggregates, Date.now(), limit);
}

export async function loadPostDeployRegressionReport(
  threshold = DEFAULT_POST_DEPLOY_REGRESSION_THRESHOLD,
  limit = DEFAULT_POST_DEPLOY_LIMIT,
): Promise<PostDeployRegressionReport> {
  const events = await getDiagnosticEvents({ limit: Number.MAX_SAFE_INTEGER });
  return buildPostDeployRegressionReport(events, Date.now(), threshold, limit);
}
