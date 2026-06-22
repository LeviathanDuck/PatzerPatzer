import { getSessionId, newEventId } from './id';
import { putEventWithEviction } from './idbStore';
import { snapshotBreadcrumbs } from './record';
import { redactDiagnosticText, redactEventMetadata } from './redact';
import {
  Severity,
  type Breadcrumb,
  type DiagnosticEvent,
  type DiagnosticMetadata,
  type DiagnosticMetadataValue,
} from './types';

let errorCaptureInitialized = false;

function stackFromError(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  if (
    error
    && typeof error === 'object'
    && 'stack' in error
    && typeof (error as { stack?: unknown }).stack === 'string'
  ) {
    return (error as { stack: string }).stack;
  }
  return undefined;
}

function currentRoute(): string {
  return typeof window === 'undefined' ? '' : window.location.pathname;
}

function viewportSize(): { width: number; height: number } | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    return {
      width: Math.max(0, Math.floor(window.innerWidth)),
      height: Math.max(0, Math.floor(window.innerHeight)),
    };
  } catch {
    return undefined;
  }
}

function deviceClassFromWidth(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function enrichmentMetadata(): DiagnosticMetadata {
  try {
    const viewport = viewportSize();
    if (!viewport) return {};
    return {
      viewport,
      deviceClass: deviceClassFromWidth(viewport.width),
    };
  } catch {
    return {};
  }
}

function breadcrumbSnapshot(): Breadcrumb[] {
  try {
    return snapshotBreadcrumbs();
  } catch {
    return [];
  }
}

function isReviewQueueAnalyzingAtErrorTime(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const accessor = (window as Window & { __patzerReviewQueueEntryAnalyzing?: unknown }).__patzerReviewQueueEntryAnalyzing;
    return typeof accessor === 'function' ? accessor() === true : false;
  } catch {
    return false;
  }
}

function reviewCrashContextAtErrorTime(): DiagnosticMetadataValue | null {
  try {
    if (typeof window === 'undefined') return null;
    const accessor = (window as Window & { __patzerReviewCrashContext?: unknown }).__patzerReviewCrashContext;
    if (typeof accessor !== 'function') return null;
    const context = accessor();
    return context && typeof context === 'object'
      ? context as DiagnosticMetadataValue
      : null;
  } catch {
    return null;
  }
}

function writeDiagnosticEvent(event: DiagnosticEvent): void {
  putEventWithEviction(event).catch(() => {
    // Diagnostics capture must never throw into app code.
  });
}

function writeReviewCrashCorrelation(originalErrorEvent: DiagnosticEvent, reviewContext: DiagnosticMetadataValue): void {
  try {
    writeDiagnosticEvent({
      eventId: newEventId(),
      sessionId: originalErrorEvent.sessionId,
      timestamp: Date.now(),
      kind: 'engine',
      severity: Severity.Error,
      route: originalErrorEvent.route,
      source: 'review-engine',
      sourceTag: 'review-engine',
      message: 'review-crash-correlated',
      metadata: {
        originalErrorEventId: originalErrorEvent.eventId,
        reviewContext,
        timestamp: Date.now(),
      },
      redactionClass: 'safe',
      breadcrumbs: breadcrumbSnapshot(),
    });
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}

function redactedResourceUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, typeof window === 'undefined' ? undefined : window.location.href);
    return url.pathname;
  } catch {
    return rawUrl.split('#', 1)[0]?.split('?', 1)[0] ?? '';
  }
}

function resourceUrlFromElement(element: HTMLElement): string {
  if (element instanceof HTMLImageElement || element instanceof HTMLScriptElement) return element.src;
  if (element instanceof HTMLLinkElement) return element.href;
  return element.getAttribute('src') ?? element.getAttribute('href') ?? '';
}

function isResourceErrorTarget(target: EventTarget | null): target is HTMLElement {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK';
}

function handleResourceError(element: HTMLElement): void {
  try {
    writeDiagnosticEvent({
      eventId: newEventId(),
      sessionId: getSessionId(),
      timestamp: Date.now(),
      kind: 'resource-error',
      severity: Severity.Error,
      route: currentRoute(),
      source: 'window.error',
      sourceTag: 'window.error',
      message: `Resource failed to load: ${element.tagName.toLowerCase()}`,
      metadata: {
        ...enrichmentMetadata(),
        tagName: element.tagName.toLowerCase(),
        url: redactedResourceUrl(resourceUrlFromElement(element)),
      },
      redactionClass: 'truncate',
      breadcrumbs: breadcrumbSnapshot(),
    });
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}

export function normalizeErrorEvent(event: Pick<ErrorEvent, 'message' | 'filename' | 'lineno' | 'colno' | 'error'>): DiagnosticEvent {
  const stack = stackFromError(event.error);
  const reviewQueueEntryAnalyzing = isReviewQueueAnalyzingAtErrorTime();
  return {
    eventId: newEventId(),
    sessionId: getSessionId(),
    timestamp: Date.now(),
    kind: 'error',
    severity: Severity.Error,
    route: currentRoute(),
    source: event.filename ? redactedResourceUrl(event.filename) : 'window.error',
    sourceTag: 'window.error',
    message: redactDiagnosticText(event.message || 'Unhandled script error'),
    metadata: redactEventMetadata({
      ...enrichmentMetadata(),
      reviewQueueEntryAnalyzing,
      filename: event.filename ? redactedResourceUrl(event.filename) : '',
      lineno: event.lineno,
      colno: event.colno,
      ...(stack ? { stack } : {}),
    }),
    redactionClass: 'truncate',
    breadcrumbs: breadcrumbSnapshot(),
  };
}

function handleScriptError(event: ErrorEvent): void {
  try {
    const reviewQueueEntryAnalyzing = isReviewQueueAnalyzingAtErrorTime();
    const reviewContext = reviewQueueEntryAnalyzing ? reviewCrashContextAtErrorTime() : null;
    const diagnosticEvent = normalizeErrorEvent(event);

    writeDiagnosticEvent(diagnosticEvent);
    if (reviewQueueEntryAnalyzing && reviewContext) {
      writeReviewCrashCorrelation(diagnosticEvent, reviewContext);
    }
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}

function handleWindowError(event: Event): void {
  try {
    if (isResourceErrorTarget(event.target)) {
      handleResourceError(event.target);
      return;
    }

    if (event instanceof ErrorEvent) handleScriptError(event);
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}

export function initErrorCapture(): void {
  if (errorCaptureInitialized) return;
  errorCaptureInitialized = true;

  try {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', handleWindowError, true);
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}
