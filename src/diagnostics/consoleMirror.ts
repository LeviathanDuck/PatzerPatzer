import { getSessionId, newEventId } from './id';
import { putEventWithEviction } from './idbStore';
import { redactDiagnosticText } from './redact';
import { currentAppRoute } from './route';
import { Severity, type DiagnosticEvent } from './types';

const SERIALIZED_ARGS_MAX = 500;
const DEDUP_WINDOW_MS = 5_000;
const DEDUP_MAX_ENTRIES = 200;
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);

let consoleMirrorInstalled = false;
const dedupLastSeen = new Map<string, number>();

function serializeArg(arg: unknown): string {
  try {
    if (typeof arg === 'string') return redactDiagnosticText(arg);
    if (arg instanceof Error) return redactDiagnosticText(arg.stack || arg.message || arg.name);
    return redactDiagnosticText(JSON.stringify(arg));
  } catch {
    return redactDiagnosticText(String(arg));
  }
}

function dedupKey(source: 'console.warn' | 'console.error', serializedArgs: string[]): string {
  return `${source}:${serializedArgs.join(' ').slice(0, SERIALIZED_ARGS_MAX)}`;
}

function evictOldestDedupEntry(): void {
  const oldestKey = dedupLastSeen.keys().next().value;
  if (oldestKey !== undefined) dedupLastSeen.delete(oldestKey);
}

function shouldMirrorConsoleEvent(key: string, now: number): boolean {
  const lastSeen = dedupLastSeen.get(key);
  if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) return false;

  if (!dedupLastSeen.has(key) && dedupLastSeen.size >= DEDUP_MAX_ENTRIES) evictOldestDedupEntry();
  dedupLastSeen.delete(key);
  dedupLastSeen.set(key, now);
  return true;
}

export function normalizeConsoleEvent(
  source: 'console.warn' | 'console.error',
  severity: Severity.Warn | Severity.Error,
  args: unknown[],
  now = Date.now(),
): DiagnosticEvent {
  const serializedArgs = args.map(serializeArg);
  return {
    eventId: newEventId(),
    sessionId: getSessionId(),
    timestamp: now,
    kind: 'console',
    severity,
    route: currentAppRoute(),
    source,
    sourceTag: source,
    message: serializedArgs.join(' '),
    metadata: {
      args: serializedArgs,
    },
    redactionClass: 'truncate',
  };
}

function mirrorConsole(source: 'console.warn' | 'console.error', severity: Severity.Warn | Severity.Error, args: unknown[]): void {
  try {
    const serializedArgs = args.map(serializeArg);
    const now = Date.now();
    if (!shouldMirrorConsoleEvent(dedupKey(source, serializedArgs), now)) return;

    putEventWithEviction(normalizeConsoleEvent(source, severity, args, now)).catch(() => {
      // Diagnostics capture must never throw into app code.
    });
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}

export function installConsoleMirror(): void {
  if (consoleMirrorInstalled) return;
  consoleMirrorInstalled = true;

  try {
    console.warn = (...args: unknown[]) => {
      originalConsoleWarn(...args);
      mirrorConsole('console.warn', Severity.Warn, args);
    };

    console.error = (...args: unknown[]) => {
      originalConsoleError(...args);
      mirrorConsole('console.error', Severity.Error, args);
    };
  } catch {
    // Diagnostics capture must never throw into app code.
  }
}
