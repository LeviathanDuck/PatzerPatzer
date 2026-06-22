import { record } from '../record';
import { Severity, type DiagnosticMetadataValue } from '../types';

let longTaskObserverInitialized = false;
let longAnimationFrameObserverInitialized = false;
let navigationTimingSummaryInitialized = false;
let resourceTimingSummaryInitialized = false;

function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname || '/';
}

function attributionValue(value: unknown): DiagnosticMetadataValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(attributionValue);
  if (typeof value !== 'object') return String(value);

  const source = value as Record<string, unknown>;
  const serialized: Record<string, DiagnosticMetadataValue> = {};
  for (const [key, entryValue] of Object.entries(source)) {
    if (typeof entryValue === 'function') continue;
    serialized[key] = attributionValue(entryValue);
  }
  return serialized;
}

export function initLongTaskObserver(): void {
  if (longTaskObserverInitialized) return;
  longTaskObserverInitialized = true;

  try {
    if (typeof PerformanceObserver === 'undefined') return;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const longTask = entry as PerformanceEntry & { attribution?: unknown[] };
        record({
          kind: 'performance',
          severity: Severity.Warn,
          source: 'diagnostics/performance/observers',
          sourceTag: 'performance.longtask',
          message: 'Long task detected',
          route: currentRoute(),
          metadata: {
            entryType: entry.entryType,
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
            route: currentRoute(),
            attribution: (longTask.attribution ?? []).map(attributionValue),
          },
          redactionClass: 'safe',
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // Unsupported browsers should silently skip this observer.
  }
}

export function initLongAnimationFrameObserver(): void {
  if (longAnimationFrameObserverInitialized) return;
  longAnimationFrameObserverInitialized = true;

  try {
    if (typeof PerformanceObserver === 'undefined') return;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const longAnimationFrame = entry as PerformanceEntry & { blockingDuration?: number };
        record({
          kind: 'performance',
          severity: Severity.Warn,
          source: 'diagnostics/performance/observers',
          sourceTag: 'performance.long-animation-frame',
          message: 'Long animation frame detected',
          route: currentRoute(),
          metadata: {
            entryType: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration,
            blockingDuration: longAnimationFrame.blockingDuration ?? 0,
            route: currentRoute(),
          },
          redactionClass: 'safe',
        });
      }
    });
    observer.observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    // Unsupported browsers should silently skip this observer.
  }
}

function onWindowLoad(callback: () => void): void {
  if (typeof window === 'undefined') return;
  if (document.readyState === 'complete') {
    window.setTimeout(callback, 0);
    return;
  }
  window.addEventListener('load', callback, { once: true });
}

export function initNavigationTimingSummary(): void {
  if (navigationTimingSummaryInitialized) return;
  navigationTimingSummaryInitialized = true;

  onWindowLoad(() => {
    try {
      if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return;
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!navigation) return;

      record({
        kind: 'performance',
        severity: Severity.Info,
        source: 'diagnostics/performance/observers',
        sourceTag: 'performance.navigation-timing',
        message: 'Navigation timing summary',
        route: currentRoute(),
        metadata: {
          dns: Math.max(0, navigation.domainLookupEnd - navigation.domainLookupStart),
          tcp: Math.max(0, navigation.connectEnd - navigation.connectStart),
          ttfb: Math.max(0, navigation.responseStart - navigation.requestStart),
          domInteractive: Math.max(0, navigation.domInteractive - navigation.fetchStart),
          loadComplete: Math.max(0, navigation.loadEventEnd - navigation.fetchStart),
          route: currentRoute(),
        },
        redactionClass: 'safe',
      });
    } catch {
      // Diagnostics must never throw into app code.
    }
  });
}

export function initResourceTimingSummary(route: string, slowestN = 5): void {
  if (resourceTimingSummaryInitialized) return;
  resourceTimingSummaryInitialized = true;

  onWindowLoad(() => {
    try {
      if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return;
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const buckets: Record<string, { count: number; totalDuration: number }> = {};

      for (const entry of resources) {
        const type = entry.initiatorType || 'other';
        const bucket = buckets[type] ?? { count: 0, totalDuration: 0 };
        bucket.count += 1;
        bucket.totalDuration += entry.duration;
        buckets[type] = bucket;
      }

      const slowest = resources
        .slice()
        .sort((a, b) => b.duration - a.duration)
        .slice(0, Math.max(0, Math.floor(slowestN)))
        .map(entry => ({
          name: entry.name,
          initiatorType: entry.initiatorType || 'other',
          duration: entry.duration,
        }));

      record({
        kind: 'performance',
        severity: Severity.Info,
        source: 'diagnostics/performance/observers',
        sourceTag: 'performance.resource-timing-summary',
        message: 'Resource timing summary',
        route,
        metadata: {
          route,
          buckets,
          slowest,
        },
        redactionClass: 'safe',
      });
    } catch {
      // Diagnostics must never throw into app code.
    }
  });
}
