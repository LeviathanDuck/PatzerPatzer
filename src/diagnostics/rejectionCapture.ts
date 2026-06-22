import { getSessionId, newEventId } from './id';
import { putEventWithEviction } from './idbStore';
import { snapshotBreadcrumbs } from './record';
import { redactDiagnosticText, redactEventMetadata } from './redact';
import {
  Severity,
  type Breadcrumb,
  type DiagnosticEvent,
  type DiagnosticMetadata,
} from './types';

const SERIALIZED_REASON_MAX = 500;
const OPAQUE_STACK_PATTERN = /^(script error\.?|cross-origin script error)$/i;

let rejectionCaptureInitialized = false;

interface NormalizedRejection {
  message: string;
  metadata: DiagnosticMetadata;
}

type GroupedDiagnosticEvent = DiagnosticEvent & {
  groupKey: string;
};

function currentRoute(): string {
  return typeof window === 'undefined' ? '' : window.location.pathname;
}

function breadcrumbSnapshot(): Breadcrumb[] {
  try {
    return snapshotBreadcrumbs();
  } catch {
    return [];
  }
}

function truncate(value: string): string {
  return value.length > SERIALIZED_REASON_MAX ? `${value.slice(0, SERIALIZED_REASON_MAX)}...` : value;
}

function isCrossOriginLimitedStack(stack: string | undefined): boolean {
  if (!stack) return true;
  const trimmed = stack.trim();
  if (!trimmed) return true;
  return OPAQUE_STACK_PATTERN.test(trimmed);
}

function stableGroupPart(value: string): string {
  return redactDiagnosticText(value)
    .trim()
    .replace(/:\d+:\d+/g, '')
    .replace(/:\d+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function firstStableStackFrame(stack: string | undefined): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .map(line => stableGroupPart(line))
    .find(line => line.length > 0 && !line.startsWith('Error:')) ?? '';
}

export function computeRejectionGroupKey(reason: unknown): string {
  try {
    if (reason instanceof Error) {
      const message = stableGroupPart(reason.message || reason.name || 'error');
      const frame = firstStableStackFrame(reason.stack);
      return `rejection:error:${message}:${frame}`;
    }

    if (typeof reason === 'string') return `rejection:string:${stableGroupPart(reason || 'empty')}`;
    if (reason === null || reason === undefined) return 'rejection:empty';
    return 'rejection:unknown';
  } catch {
    return 'rejection:unknown';
  }
}

function normalizeRejectionReason(reason: unknown): NormalizedRejection {
  try {
    if (reason instanceof Error) {
      const crossOriginLimited = isCrossOriginLimitedStack(reason.stack);
      // MDN notes that cross-origin script rejections can be hidden by browser security policy.
      return {
        message: reason.message || reason.name || 'Unhandled promise rejection',
        metadata: {
          reason: 'error',
          name: reason.name,
          ...(crossOriginLimited ? { crossOriginLimited: true, stack: null } : { stack: reason.stack ?? '' }),
        },
      };
    }

    if (typeof reason === 'string') {
      return {
        message: reason,
        metadata: {
          reason: reason || 'empty',
        },
      };
    }

    if (reason === null || reason === undefined) {
      return {
        message: 'Unhandled promise rejection',
        metadata: {
          reason: 'empty',
        },
      };
    }

    if (typeof reason === 'object') {
      return {
        message: 'Unhandled promise rejection',
        metadata: {
          reason: truncate(JSON.stringify(reason)),
          reasonType: 'object',
        },
      };
    }

    return {
      message: 'Unhandled promise rejection',
      metadata: {
        reason: 'unknown',
        reasonType: typeof reason,
      },
    };
  } catch {
    return {
      message: 'Unhandled promise rejection',
      metadata: {
        reason: 'unknown',
        reasonType: typeof reason,
      },
    };
  }
}

export function normalizeUnhandledRejection(reason: unknown): GroupedDiagnosticEvent {
  const normalized = normalizeRejectionReason(reason);
  return {
    eventId: newEventId(),
    sessionId: getSessionId(),
    timestamp: Date.now(),
    kind: 'unhandled-rejection',
    groupKey: computeRejectionGroupKey(reason),
    severity: Severity.Error,
    route: currentRoute(),
    source: 'window.unhandledrejection',
    sourceTag: 'window.unhandledrejection',
    message: redactDiagnosticText(normalized.message),
    metadata: redactEventMetadata(normalized.metadata),
    redactionClass: 'truncate',
    breadcrumbs: breadcrumbSnapshot(),
  };
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  try {
    putEventWithEviction(normalizeUnhandledRejection(event.reason)).catch(() => {
      // Diagnostics capture must never throw into app code.
    });
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}

export function initRejectionCapture(): void {
  if (rejectionCaptureInitialized) return;
  rejectionCaptureInitialized = true;

  try {
    if (typeof window === 'undefined') return;
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}
