import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals/attribution';
import { record } from '../record';
import { Severity, type DiagnosticMetadata } from '../types';

let webVitalsInitialized = false;

function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname || '/';
}

function rectMetadata(rect: DOMRectReadOnly | undefined): DiagnosticMetadata | null {
  if (!rect) return null;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
  };
}

function navigationType(): string {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return 'unknown';
    }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function deviceClass(): 'low' | 'mid' | 'high' {
  const nav = typeof navigator === 'undefined'
    ? undefined
    : navigator as Navigator & { deviceMemory?: number };
  const cores = nav?.hardwareConcurrency ?? 0;
  const memory = nav?.deviceMemory ?? 0;

  if ((memory > 0 && memory <= 2) || (cores > 0 && cores <= 2)) return 'low';
  if ((memory >= 8 && cores >= 8) || cores >= 12) return 'high';
  return 'mid';
}

function viewportMetadata(): DiagnosticMetadata {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function connectionEffectiveType(): string {
  const nav = typeof navigator === 'undefined'
    ? undefined
    : navigator as Navigator & { connection?: { effectiveType?: string } };
  return nav?.connection?.effectiveType ?? 'unknown';
}

function commonMetadata(metric: {
  name: string;
  id: string;
  value: number;
  delta: number;
  rating: string;
  navigationType: string;
}): DiagnosticMetadata {
  return {
    metric: metric.name,
    id: metric.id,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: navigationType(),
    metricNavigationType: metric.navigationType,
    route: currentRoute(),
    deviceClass: deviceClass(),
    viewport: viewportMetadata(),
    connectionEffectiveType: connectionEffectiveType(),
  };
}

export function initWebVitals(): void {
  if (webVitalsInitialized) return;
  webVitalsInitialized = true;

  try {
    onCLS(metric => {
      const attribution = metric.attribution;
      const sourceRect = rectMetadata(attribution.largestShiftSource?.currentRect);
      record({
        kind: 'performance',
        severity: Severity.Info,
        source: 'diagnostics/performance/webVitals',
        sourceTag: 'web-vitals.cls',
        message: 'Web Vital CLS',
        route: currentRoute(),
        metadata: {
          ...commonMetadata(metric),
          largestShiftTarget: attribution.largestShiftTarget ?? null,
          largestShiftTime: attribution.largestShiftTime ?? null,
          largestShiftValue: attribution.largestShiftValue ?? null,
          largestShiftSourceRect: sourceRect,
          loadState: attribution.loadState ?? null,
        },
        redactionClass: 'safe',
      });
    }, { reportAllChanges: true });

    onINP(metric => {
      const attribution = metric.attribution;
      record({
        kind: 'performance',
        severity: Severity.Info,
        source: 'diagnostics/performance/webVitals',
        sourceTag: 'web-vitals.inp',
        message: 'Web Vital INP',
        route: currentRoute(),
        metadata: {
          ...commonMetadata(metric),
          interactionTarget: attribution.interactionTarget || null,
          interactionType: attribution.interactionType,
          interactionTime: attribution.interactionTime,
          nextPaintTime: attribution.nextPaintTime,
          inputDelay: attribution.inputDelay,
          processingDuration: attribution.processingDuration,
          presentationDelay: attribution.presentationDelay,
          loadState: attribution.loadState,
          totalScriptDuration: attribution.totalScriptDuration ?? null,
          totalStyleAndLayoutDuration: attribution.totalStyleAndLayoutDuration ?? null,
          totalPaintDuration: attribution.totalPaintDuration ?? null,
          totalUnattributedDuration: attribution.totalUnattributedDuration ?? null,
        },
        redactionClass: 'safe',
      });
    }, { reportAllChanges: false, includeProcessedEventEntries: false });

    onLCP(metric => {
      const attribution = metric.attribution;
      record({
        kind: 'performance',
        severity: Severity.Info,
        source: 'diagnostics/performance/webVitals',
        sourceTag: 'web-vitals.lcp',
        message: 'Web Vital LCP',
        route: currentRoute(),
        metadata: {
          ...commonMetadata(metric),
          lcpTarget: attribution.target ?? null,
          lcpUrl: attribution.url ?? null,
          timeToFirstByte: attribution.timeToFirstByte,
          resourceLoadDelay: attribution.resourceLoadDelay,
          resourceLoadDuration: attribution.resourceLoadDuration,
          elementRenderDelay: attribution.elementRenderDelay,
          lcpStartTime: attribution.lcpEntry?.startTime ?? null,
          lcpSize: attribution.lcpEntry?.size ?? null,
        },
        redactionClass: 'safe',
      });
    });

    onFCP(metric => {
      record({
        kind: 'performance',
        severity: Severity.Info,
        source: 'diagnostics/performance/webVitals',
        sourceTag: 'web-vitals.fcp',
        message: 'Web Vital FCP',
        route: currentRoute(),
        metadata: {
          ...commonMetadata(metric),
          entryCount: metric.entries.length,
          fcpStartTime: metric.entries[0]?.startTime ?? null,
        },
        redactionClass: 'safe',
      });
    });

    onTTFB(metric => {
      const attribution = metric.attribution;
      record({
        kind: 'performance',
        severity: Severity.Info,
        source: 'diagnostics/performance/webVitals',
        sourceTag: 'web-vitals.ttfb',
        message: 'Web Vital TTFB',
        route: currentRoute(),
        metadata: {
          ...commonMetadata(metric),
          waitingDuration: attribution.waitingDuration,
          cacheDuration: attribution.cacheDuration,
          dnsDuration: attribution.dnsDuration,
          connectionDuration: attribution.connectionDuration,
          requestDuration: attribution.requestDuration,
        },
        redactionClass: 'safe',
      });
    });
  } catch (error) {
    record({
      kind: 'performance',
      severity: Severity.Warn,
      source: 'diagnostics/performance/webVitals',
      sourceTag: 'web-vitals.init',
      message: 'Web Vitals initialization failed',
      metadata: {
        errorName: error instanceof Error ? error.name : typeof error,
      },
      redactionClass: 'safe',
    });
  }
}
