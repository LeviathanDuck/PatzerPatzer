export type EventKind =
  | 'error'
  | 'unhandled-rejection'
  | 'resource-error'
  | 'console'
  | 'route'
  | 'user-action'
  | 'lifecycle'
  | 'session-interruption'
  | 'engine'
  | 'worker'
  | 'idb'
  | 'sync'
  | 'api'
  | 'render'
  | 'performance'
  | 'user-report';

export enum Severity {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Fatal = 'fatal',
}

export type RedactionClass = 'safe' | 'truncate' | 'hash' | 'omit';

export type DiagnosticMetadataValue =
  | string
  | number
  | boolean
  | null
  | DiagnosticMetadataValue[]
  | { [key: string]: DiagnosticMetadataValue };

export type DiagnosticMetadata = Record<string, DiagnosticMetadataValue>;

export type RedactionClassMap = Record<string, RedactionClass>;

export type DiagnosticTimestamp = number;

export interface RouteBreadcrumb {
  type: 'route-transition';
  from: string;
  to: string;
  timestamp: DiagnosticTimestamp;
}

export interface UserActionBreadcrumb {
  type: 'user-action';
  action: string;
  target?: string;
  timestamp: DiagnosticTimestamp;
}

export interface EngineStateBreadcrumb {
  type: 'engine-state-change';
  state: string;
  detail?: string;
  timestamp: DiagnosticTimestamp;
}

export interface ImportStepBreadcrumb {
  type: 'import-step';
  step: string;
  platform?: string;
  count?: number;
  timestamp: DiagnosticTimestamp;
}

export interface LifecycleBreadcrumb {
  type: 'lifecycle-change';
  event: string;
  timestamp: DiagnosticTimestamp;
}

export interface ToolModeBreadcrumb {
  type: 'tool-mode-change';
  tool: string;
  mode?: string;
  timestamp: DiagnosticTimestamp;
}

export type Breadcrumb =
  | RouteBreadcrumb
  | UserActionBreadcrumb
  | EngineStateBreadcrumb
  | ImportStepBreadcrumb
  | LifecycleBreadcrumb
  | ToolModeBreadcrumb;

export type BreadcrumbType = Breadcrumb['type'];

export interface DiagnosticEvent {
  eventId: string;
  sessionId: string;
  timestamp: DiagnosticTimestamp;
  kind: EventKind;
  severity: Severity;
  route: string;
  source: string;
  sourceTag: string;
  message: string;
  metadata?: DiagnosticMetadata;
  redactionClass: RedactionClass | RedactionClassMap;
  breadcrumbs?: Breadcrumb[];
}

export type DiagnosticAggregateKind =
  | 'error-frequency'
  | 'route-instability'
  | 'performance-percentile'
  | 'workflow-crash-correlation';

export interface DiagnosticAggregate {
  aggregateId: string;
  kind: DiagnosticAggregateKind;
  groupingKey: string;
  route: string;
  deviceClass: string;
  count: number;
  rank?: number;
  totalEvents?: number;
  errorCount?: number;
  errorRate?: number;
  crashCorrelationCount?: number;
  longTaskCount?: number;
  measureName?: string;
  sampleCount?: number;
  p50?: number;
  p75?: number;
  p95?: number;
  firstSeen: DiagnosticTimestamp;
  lastSeen: DiagnosticTimestamp;
  updatedAt: DiagnosticTimestamp;
}

export interface DiagnosticSession {
  sessionId: string;
  release: string;
  version: string;
  buildId: string;
  startedAt: DiagnosticTimestamp;
  lastSeenAt: DiagnosticTimestamp;
  lastHeartbeat?: DiagnosticTimestamp;
  endedAt?: DiagnosticTimestamp;
  interruptedDetectedAt?: DiagnosticTimestamp;
  cleanShutdown?: boolean | 'inferred-closed';
  /** Last document.visibilityState recorded by the session lifecycle tracker. */
  visibilityState?: 'visible' | 'hidden';
  route: string;
  source: string;
  metadata?: DiagnosticMetadata;
  breadcrumbs?: Breadcrumb[];
}

export interface DiagnosticErrorGroup {
  errorGroupId: string;
  eventIds?: string[];
  kind?: EventKind;
  severity?: Severity;
  route?: string;
  sourceTag?: string;
  message?: string;
  firstSeenAt?: DiagnosticTimestamp;
  lastSeenAt?: DiagnosticTimestamp;
  count?: number;
  metadata?: DiagnosticMetadata;
}

export interface BugPackageRouteTransition {
  from: string;
  to: string;
  timestamp: DiagnosticTimestamp;
}

export interface BugPackageRouteContext {
  route: string;
  queryParams: Record<string, string>;
  recentTransitions: BugPackageRouteTransition[];
}

export interface BugPackagePerformanceMetric {
  value: number | null;
  rating: string | null;
  timestamp: DiagnosticTimestamp | null;
}

export interface BugPackageLongTask {
  startTime: number | null;
  duration: number | null;
  route: string | null;
  timestamp: DiagnosticTimestamp;
}

export interface BugPackagePerformanceSummary {
  CLS: BugPackagePerformanceMetric | null;
  LCP: BugPackagePerformanceMetric | null;
  INP: BugPackagePerformanceMetric | null;
  FCP: BugPackagePerformanceMetric | null;
  TTFB: BugPackagePerformanceMetric | null;
  recentLongTask: BugPackageLongTask | null;
}

export interface BugPackage {
  reportId: string;
  errorGroupId: string;
  report: DiagnosticMetadata;
  errorGroup: DiagnosticMetadata;
  breadcrumbs: Breadcrumb[];
  routeContext: BugPackageRouteContext;
  performanceSummary: BugPackagePerformanceSummary | null;
  reproNotes: string;
  assembledAt: string;
}
