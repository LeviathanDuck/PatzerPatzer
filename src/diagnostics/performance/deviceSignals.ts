import { record } from '../record';
import { currentAppRoute } from '../route';
import { Severity } from '../types';

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

interface NavigatorWithDeviceSignals extends Navigator {
  deviceMemory?: number;
  connection?: NetworkInformationLike;
}

interface PerformanceMemoryLike {
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemoryLike;
}

let viewportBreadcrumbsInitialized = false;

function orientationType(): string {
  try {
    return screen.orientation?.type ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function emitViewportEvent(sourceTag: string, message: string): void {
  const route = currentAppRoute('/');
  record({
    kind: 'performance',
    severity: Severity.Info,
    source: 'diagnostics/performance/deviceSignals',
    sourceTag,
    message,
    route,
    metadata: {
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
      orientation: orientationType(),
      route,
    },
    redactionClass: 'safe',
  });
}

export function captureDeviceSignals(): void {
  try {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as NavigatorWithDeviceSignals;
    const connection = nav.connection;
    const route = currentAppRoute('/');

    record({
      kind: 'performance',
      severity: Severity.Info,
      source: 'diagnostics/performance/deviceSignals',
      sourceTag: 'performance.device-signals',
      message: 'Device capability signals',
      route,
      metadata: {
        deviceMemory: nav.deviceMemory ?? null,
        hardwareConcurrency: nav.hardwareConcurrency ?? null,
        connectionEffectiveType: connection?.effectiveType ?? 'unknown',
        connectionDownlink: connection?.downlink ?? null,
        connectionRtt: connection?.rtt ?? null,
        route,
      },
      redactionClass: 'safe',
    });
    void captureStorageEstimate('session-start');
    captureMemorySnapshot('session-start');
    initViewportBreadcrumbs();
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function captureMemorySnapshot(label: string): void {
  try {
    if (typeof performance === 'undefined') return;
    const memory = (performance as PerformanceWithMemory).memory;
    if (!memory) return;
    const route = currentAppRoute('/');

    record({
      kind: 'performance',
      severity: Severity.Info,
      source: 'diagnostics/performance/deviceSignals',
      sourceTag: 'performance.memory-snapshot',
      message: 'Memory snapshot',
      route,
      metadata: {
        label,
        jsHeapSizeLimit: memory.jsHeapSizeLimit ?? null,
        totalJSHeapSize: memory.totalJSHeapSize ?? null,
        usedJSHeapSize: memory.usedJSHeapSize ?? null,
        route,
      },
      redactionClass: 'safe',
    });
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export async function captureStorageEstimate(label: string): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota ?? null;
    const usage = estimate.usage ?? null;
    const usagePercent = quota && usage !== null
      ? (usage / quota) * 100
      : null;
    const route = currentAppRoute('/');

    record({
      kind: 'performance',
      severity: Severity.Info,
      source: 'diagnostics/performance/deviceSignals',
      sourceTag: 'performance.storage-estimate',
      message: 'Storage estimate',
      route,
      metadata: {
        label,
        quota,
        usage,
        usagePercent,
        route,
      },
      redactionClass: 'safe',
    });
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function initViewportBreadcrumbs(): void {
  if (viewportBreadcrumbsInitialized) return;
  viewportBreadcrumbsInitialized = true;
  if (typeof window === 'undefined') return;

  emitViewportEvent('performance.viewport-snapshot', 'Viewport snapshot');

  let resizeTimer: ReturnType<typeof window.setTimeout> | undefined;
  window.addEventListener('resize', () => {
    if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = undefined;
      emitViewportEvent('performance.viewport-change', 'Viewport changed');
    }, 250);
  });

  window.addEventListener('orientationchange', () => {
    emitViewportEvent('performance.orientation-change', 'Orientation changed');
  });
}
