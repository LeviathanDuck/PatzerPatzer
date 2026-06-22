import { appendDurableBreadcrumb } from './breadcrumbLog';
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
import { getSessionId, newEventId } from './id';
import { redactEventMetadata } from './redact';

const MAX_BREADCRUMBS = 100;

const breadcrumbs = new RingBuffer<Breadcrumb>(MAX_BREADCRUMBS);
const sessionTags = new Map<string, string>();

type RecordedDiagnosticEvent = Partial<Omit<DiagnosticEvent, 'metadata'>> & {
  eventId: string;
  sessionId: string;
  timestamp: number;
  metadata: Record<string, string>;
};

function dispatchToStorage(event: RecordedDiagnosticEvent): void {
  console.debug('[diagnostics]', event);
}

export function record(event: Partial<DiagnosticEvent>): void {
  try {
    const recordedEvent: RecordedDiagnosticEvent = {
      ...event,
      eventId: newEventId(),
      sessionId: getSessionId(),
      timestamp: Date.now(),
      metadata: redactEventMetadata((event.metadata ?? {}) as Record<string, unknown>),
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
        from: textFromMetadata(metadata, 'from') ?? '',
        to: textFromMetadata(metadata, 'to') ?? message,
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
    case 'lifecycle-change':
    default: {
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
