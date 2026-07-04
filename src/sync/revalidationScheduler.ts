export type RemoteSyncRevalidationTrigger =
  | 'startup'
  | 'focus'
  | 'pageshow'
  | 'online'
  | 'route'
  | 'poll'
  | 'pre-write'
  | 'metadata-missing'
  | 'stale-cloud-state';

export type RemoteSyncRevalidationRuntimeApply =
  | 'targeted'
  | 'route-reconcile'
  | 'board-reload'
  | 'none';

export interface RemoteSyncRevalidationScheduleInput {
  trigger: RemoteSyncRevalidationTrigger;
  stores?: readonly string[];
  force?: boolean;
}

export interface RemoteSyncRevalidationRunRequest {
  runId: string;
  trigger: RemoteSyncRevalidationTrigger;
  triggers: readonly RemoteSyncRevalidationTrigger[];
  stores: readonly string[];
  requestedAt: number;
  startedAt: number;
}

export interface RemoteSyncRevalidationRunResult {
  ok: boolean;
  cancelled?: boolean;
  fromCursor?: number;
  toCursor?: number;
  appliedVersions?: readonly number[];
  storeCounts?: Readonly<Record<string, number>>;
  runtimeApply?: RemoteSyncRevalidationRuntimeApply;
}

export type RemoteSyncRevalidationDiagnosticEvent =
  | 'revalidation-started'
  | 'revalidation-applied'
  | 'revalidation-cancelled'
  | 'revalidation-noop'
  | 'revalidation-failed';

export interface RemoteSyncRevalidationDiagnostic {
  event: RemoteSyncRevalidationDiagnosticEvent;
  runId: string;
  trigger: RemoteSyncRevalidationTrigger;
  triggers: readonly RemoteSyncRevalidationTrigger[];
  stores: readonly string[];
  fromCursor?: number;
  toCursor?: number;
  appliedVersions?: readonly number[];
  storeCounts?: Readonly<Record<string, number>>;
  durationMs?: number;
  activeRoute?: string;
  visible?: boolean;
  runtimeApply?: RemoteSyncRevalidationRuntimeApply;
  errorName?: string;
}

export interface RemoteSyncRevalidationSchedulerOptions {
  runRevalidation: (request: RemoteSyncRevalidationRunRequest) => Promise<RemoteSyncRevalidationRunResult>;
  debounceMs?: number;
  minIntervalMs?: number;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  deferUntilP0?: (request: RemoteSyncRevalidationRunRequest) => void | Promise<void>;
  emitDiagnostic?: (diagnostic: RemoteSyncRevalidationDiagnostic) => void;
  activeRoute?: () => string;
  visible?: () => boolean;
}

export interface RemoteSyncRevalidationScheduler {
  schedule(input: RemoteSyncRevalidationScheduleInput): void;
  cancel(reason?: string): void;
  waitForIdle(): Promise<void>;
  getDiagnostics(): readonly RemoteSyncRevalidationDiagnostic[];
}

interface PendingRevalidation {
  trigger: RemoteSyncRevalidationTrigger;
  triggers: Set<RemoteSyncRevalidationTrigger>;
  stores: Set<string>;
  requestedAt: number;
  force: boolean;
}

const DEFAULT_DEBOUNCE_MS = 350;
const DEFAULT_MIN_INTERVAL_MS = 15_000;
const SAFE_COUNT_KEY = /^[a-z0-9:_-]{1,80}$/i;

function defaultNow(): number {
  return Date.now();
}

function defaultSetTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, delayMs);
}

function defaultClearTimeout(handle: unknown): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function triggerBypassesThrottle(trigger: RemoteSyncRevalidationTrigger): boolean {
  return trigger === 'startup'
    || trigger === 'pre-write'
    || trigger === 'metadata-missing'
    || trigger === 'stale-cloud-state';
}

function sortedStrings(values: ReadonlySet<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function safeStoreCounts(counts: Readonly<Record<string, number>> | undefined): Readonly<Record<string, number>> | undefined {
  if (!counts) return undefined;
  const safe: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (!SAFE_COUNT_KEY.test(key)) continue;
    if (!Number.isFinite(value)) continue;
    safe[key] = value;
  }
  return safe;
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value
    .slice(0, 120)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer <redacted>')
    .replace(/\b(token|authorization|password|secret|payload)=([^&#\s]+)/gi, '$1=<redacted>');
}

function hasAppliedWork(result: RemoteSyncRevalidationRunResult): boolean {
  if ((result.appliedVersions?.length ?? 0) > 0) return true;
  const counts = result.storeCounts ?? {};
  return Object.values(counts).some(value => Number.isFinite(value) && value > 0);
}

export function createRemoteSyncRevalidationScheduler(
  options: RemoteSyncRevalidationSchedulerOptions,
): RemoteSyncRevalidationScheduler {
  const now = options.now ?? defaultNow;
  const setTimer = options.setTimeout ?? defaultSetTimeout;
  const clearTimer = options.clearTimeout ?? defaultClearTimeout;
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);
  const diagnostics: RemoteSyncRevalidationDiagnostic[] = [];
  const idleResolvers: Array<() => void> = [];
  let pending: PendingRevalidation | null = null;
  let timer: unknown = null;
  let running = false;
  let destroyed = false;
  let runSequence = 0;
  let lastRunStartedAt: number | null = null;

  function resolveIdleIfReady(): void {
    if (pending || timer || running) return;
    while (idleResolvers.length > 0) {
      const resolve = idleResolvers.shift();
      resolve?.();
    }
  }

  function emit(diagnostic: RemoteSyncRevalidationDiagnostic): void {
    diagnostics.push(diagnostic);
    options.emitDiagnostic?.(diagnostic);
  }

  function diagnosticBase(
    event: RemoteSyncRevalidationDiagnosticEvent,
    request: RemoteSyncRevalidationRunRequest,
    result?: RemoteSyncRevalidationRunResult,
    durationMs?: number,
    error?: unknown,
  ): RemoteSyncRevalidationDiagnostic {
    const diagnostic: RemoteSyncRevalidationDiagnostic = {
      event,
      runId: request.runId,
      trigger: request.trigger,
      triggers: request.triggers,
      stores: request.stores,
    };
    const storeCounts = safeStoreCounts(result?.storeCounts);
    const activeRoute = safeLabel(options.activeRoute?.());
    const visible = options.visible?.();
    const runtimeApply = result?.runtimeApply ?? (event === 'revalidation-started' ? undefined : 'none');

    if (result?.fromCursor !== undefined) diagnostic.fromCursor = result.fromCursor;
    if (result?.toCursor !== undefined) diagnostic.toCursor = result.toCursor;
    if (result?.appliedVersions !== undefined) diagnostic.appliedVersions = result.appliedVersions;
    if (storeCounts !== undefined) diagnostic.storeCounts = storeCounts;
    if (durationMs !== undefined) diagnostic.durationMs = durationMs;
    if (activeRoute !== undefined) diagnostic.activeRoute = activeRoute;
    if (visible !== undefined) diagnostic.visible = visible;
    if (runtimeApply !== undefined) diagnostic.runtimeApply = runtimeApply;
    if (error instanceof Error) diagnostic.errorName = error.name;

    return diagnostic;
  }

  function mergePending(input: RemoteSyncRevalidationScheduleInput): void {
    const trigger = input.trigger;
    if (!pending) {
      pending = {
        trigger,
        triggers: new Set([trigger]),
        stores: new Set(input.stores ?? []),
        requestedAt: now(),
        force: input.force === true || triggerBypassesThrottle(trigger),
      };
      return;
    }

    pending.triggers.add(trigger);
    for (const store of input.stores ?? []) pending.stores.add(store);
    pending.force = pending.force || input.force === true || triggerBypassesThrottle(trigger);
  }

  function pendingDelayMs(): number {
    if (!pending) return 0;
    if (pending.force || lastRunStartedAt === null) return debounceMs;
    const throttleRemaining = Math.max(0, lastRunStartedAt + minIntervalMs - now());
    return Math.max(debounceMs, throttleRemaining);
  }

  function armTimer(): void {
    if (destroyed || running || !pending) {
      resolveIdleIfReady();
      return;
    }
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void runPending();
    }, pendingDelayMs());
  }

  async function runPending(): Promise<void> {
    if (destroyed || running || !pending) {
      resolveIdleIfReady();
      return;
    }

    const current = pending;
    pending = null;
    running = true;
    const runId = `sync-revalidation-${++runSequence}`;
    const startedAt = now();
    lastRunStartedAt = startedAt;
    const request: RemoteSyncRevalidationRunRequest = {
      runId,
      trigger: current.trigger,
      triggers: [...current.triggers],
      stores: sortedStrings(current.stores),
      requestedAt: current.requestedAt,
      startedAt,
    };

    try {
      await options.deferUntilP0?.(request);
      emit(diagnosticBase('revalidation-started', request));
      const result = await options.runRevalidation(request);
      const durationMs = Math.max(0, now() - startedAt);
      if (result.cancelled) {
        emit(diagnosticBase('revalidation-cancelled', request, result, durationMs));
      } else if (!result.ok) {
        emit(diagnosticBase('revalidation-failed', request, result, durationMs));
      } else if (hasAppliedWork(result)) {
        emit(diagnosticBase('revalidation-applied', request, result, durationMs));
      } else {
        emit(diagnosticBase('revalidation-noop', request, result, durationMs));
      }
    } catch (error) {
      const durationMs = Math.max(0, now() - startedAt);
      emit(diagnosticBase('revalidation-failed', request, { ok: false, runtimeApply: 'none' }, durationMs, error));
    } finally {
      running = false;
      armTimer();
      resolveIdleIfReady();
    }
  }

  return {
    schedule(input: RemoteSyncRevalidationScheduleInput): void {
      if (destroyed) return;
      mergePending(input);
      armTimer();
    },
    cancel(): void {
      destroyed = true;
      pending = null;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      resolveIdleIfReady();
    },
    waitForIdle(): Promise<void> {
      if (!pending && !timer && !running) return Promise.resolve();
      return new Promise(resolve => idleResolvers.push(resolve));
    },
    getDiagnostics(): readonly RemoteSyncRevalidationDiagnostic[] {
      return diagnostics.slice();
    },
  };
}
