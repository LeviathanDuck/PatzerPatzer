import { appendDurableBreadcrumb } from './breadcrumbLog';
import { putEventWithEviction } from './idbStore';
import { RingBuffer } from './ringBuffer';
import type {
  Breadcrumb,
  BreadcrumbType,
  DiagnosticEvent,
  EngineStateBreadcrumb,
  ImportStepBreadcrumb,
  LifecycleBreadcrumb,
  RouteBreadcrumb,
  ToolModeBreadcrumb,
  UserActionBreadcrumb,
} from './types';
import { Severity } from './types';
import { getSessionId, newEventId } from './id';
import { redactEventMetadata } from './redact';
import { currentAppRoute, sanitizeAppRoute } from './route';

const MAX_BREADCRUMBS = 100;

const breadcrumbs = new RingBuffer<Breadcrumb>(MAX_BREADCRUMBS);
const sessionTags = new Map<string, string>();

function dispatchToStorage(event: DiagnosticEvent): void {
  putEventWithEviction(event).catch(() => {
    // Diagnostics must never throw into app code.
  });
}

function normalizeSnapshotLimit(maxCount: number): number {
  if (!Number.isFinite(maxCount)) return 30;
  return Math.max(0, Math.floor(maxCount));
}

function redactBreadcrumbMetadata(entry: Breadcrumb): Breadcrumb {
  const metadata = (entry as Breadcrumb & { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return entry;

  return {
    ...entry,
    metadata: redactEventMetadata(metadata as Record<string, unknown>),
  } as unknown as Breadcrumb;
}

export function snapshotBreadcrumbs(maxCount = 30): Breadcrumb[] {
  try {
    const limit = normalizeSnapshotLimit(maxCount);
    if (limit === 0) return [];
    return breadcrumbs
      .toArray()
      .slice(-limit)
      .map(redactBreadcrumbMetadata);
  } catch {
    return [];
  }
}

export function record(event: Partial<DiagnosticEvent>): void {
  try {
    const sourceTag = event.sourceTag ?? event.source ?? 'app';
    const recordedEvent: DiagnosticEvent = {
      eventId: newEventId(),
      sessionId: getSessionId(),
      timestamp: Date.now(),
      kind: event.kind ?? 'error',
      severity: event.severity ?? Severity.Error,
      route: event.route ?? currentAppRoute(),
      source: event.source ?? event.sourceTag ?? 'app',
      sourceTag,
      message: event.message ?? 'Diagnostic event',
      metadata: redactEventMetadata((event.metadata ?? {}) as Record<string, unknown>),
      redactionClass: event.redactionClass ?? 'truncate',
      breadcrumbs: event.breadcrumbs ?? breadcrumbs.toArray(),
    };

    dispatchToStorage(recordedEvent);
  } catch {
    // Diagnostics must never throw into app code.
  }
}

function textFromMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberFromMetadata(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildBreadcrumb(
  type: BreadcrumbType | string,
  message: string,
  metadata: Record<string, unknown> | undefined,
): Breadcrumb {
  const timestamp = Date.now();

  switch (type) {
    case 'route-transition': {
      const entry: RouteBreadcrumb = {
        type,
        from: sanitizeAppRoute(textFromMetadata(metadata, 'from') ?? ''),
        to: sanitizeAppRoute(textFromMetadata(metadata, 'to') ?? message),
        timestamp,
      };
      return entry;
    }
    case 'user-action': {
      const entry: UserActionBreadcrumb = {
        type,
        action: message,
        timestamp,
      };
      const target = textFromMetadata(metadata, 'target');
      if (target) entry.target = target;
      return entry;
    }
    case 'engine-state-change': {
      const entry: EngineStateBreadcrumb = {
        type,
        state: message,
        timestamp,
      };
      const detail = textFromMetadata(metadata, 'detail');
      if (detail) entry.detail = detail;
      return entry;
    }
    case 'import-step': {
      const entry: ImportStepBreadcrumb = {
        type,
        step: message,
        timestamp,
      };
      const platform = textFromMetadata(metadata, 'platform');
      const count = numberFromMetadata(metadata, 'count');
      if (platform) entry.platform = platform;
      if (count !== undefined) entry.count = count;
      return entry;
    }
    case 'tool-mode-change': {
      const entry: ToolModeBreadcrumb = {
        type,
        tool: textFromMetadata(metadata, 'tool') ?? message,
        timestamp,
      };
      const mode = textFromMetadata(metadata, 'mode');
      if (mode) entry.mode = mode;
      return entry;
    }
    case 'lifecycle-change': {
      const event = metadata
        ? `${type}:${message}:${JSON.stringify(redactEventMetadata(metadata))}`
        : `${type}:${message}`;
      const entry: LifecycleBreadcrumb = {
        type: 'lifecycle-change',
        event,
        timestamp,
      };
      return entry;
    }
    default: {
      const action = metadata
        ? `${type}:${message}:${JSON.stringify(redactEventMetadata(metadata))}`
        : `${type}:${message}`;
      const entry: UserActionBreadcrumb = {
        type: 'user-action',
        action,
        timestamp,
      };
      return entry;
    }
  }
}

function isDurableBreadcrumb(
  breadcrumb: Breadcrumb,
): breadcrumb is RouteBreadcrumb | LifecycleBreadcrumb | ToolModeBreadcrumb {
  return (
    breadcrumb.type === 'route-transition'
    || breadcrumb.type === 'lifecycle-change'
    || breadcrumb.type === 'tool-mode-change'
  );
}

export function breadcrumb(
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  try {
    const entry = buildBreadcrumb(type, message, metadata);
    breadcrumbs.push(entry);
    if (isDurableBreadcrumb(entry)) appendDurableBreadcrumb(entry);
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function tag(key: string, value: string): void {
  try {
    sessionTags.set(key, value);
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function getSessionTags(): Record<string, string> {
  try {
    return Object.fromEntries(sessionTags.entries());
  } catch {
    return {};
  }
}
