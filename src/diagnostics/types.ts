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

export interface DiagnosticSession {
  sessionId: string;
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
