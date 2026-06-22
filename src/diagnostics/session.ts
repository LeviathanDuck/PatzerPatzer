import { DB_NAME, DB_VERSION, getRecentDiagnosticSessions } from '../idb';
import { runCrashInference } from './crashInference';
import { getSessionId } from './id';
import { putSessionWithEviction } from './idbStore';
import { breadcrumb, record } from './record';
import { Severity, type DiagnosticSession } from './types';

declare const __PATZER_RELEASE__: string;
declare const __PATZER_VERSION__: string;
declare const __PATZER_BUILD_ID__: string;

type DeviceClass = 'mobile' | 'tablet' | 'desktop';

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
  };
};

type SessionRecord = DiagnosticSession & {
  cleanShutdown: boolean;
};

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_HEARTBEAT_MS = 2 * 60 * 1000;
const STALE_STARTED_AT_MS = 5 * 60 * 1000;

let cachedDeviceMetadata: Record<string, string> | null = null;
let currentSession: SessionRecord | null = null;
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;
let listenersAttached = false;

function getReleaseIdentity(): Pick<DiagnosticSession, 'release' | 'version' | 'buildId'> {
  return {
    release: typeof __PATZER_RELEASE__ === 'string' ? __PATZER_RELEASE__ : 'patzer-pro@unknown',
    version: typeof __PATZER_VERSION__ === 'string' ? __PATZER_VERSION__ : 'unknown',
    buildId: typeof __PATZER_BUILD_ID__ === 'string' ? __PATZER_BUILD_ID__ : 'unknown',
  };
}

function getViewportWidth(): number {
  return typeof window === 'undefined' ? 0 : Math.max(0, Math.floor(window.innerWidth));
}

function getViewportHeight(): number {
  return typeof window === 'undefined' ? 0 : Math.max(0, Math.floor(window.innerHeight));
}

function getDeviceClass(viewportWidth: number): DeviceClass {
  if (viewportWidth < 768) return 'mobile';
  if (viewportWidth < 1024) return 'tablet';
  return 'desktop';
}

function inferOs(userAgent: string): string {
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macos';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Linux/i.test(userAgent)) return 'linux';
  return 'unknown';
}

function collectDeviceMetadata(): Record<string, string> {
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  const nav = typeof navigator === 'undefined' ? undefined : navigator as NavigatorWithConnection;
  const userAgent = (nav?.userAgent ?? '').slice(0, 200);

  return {
    deviceClass: getDeviceClass(viewportWidth),
    userAgent,
    viewportWidth: String(viewportWidth),
    viewportHeight: String(viewportHeight),
    os: inferOs(userAgent),
    connectionType: nav?.connection?.effectiveType ?? 'unknown',
  };
}

function recordLifecycleBreadcrumb(event: string): void {
  try {
    breadcrumb('lifecycle-change', event);
  } catch {
    // Diagnostics must never throw into app code.
  }
}

function putSessionDuringPagehide(session: SessionRecord): void {
  try {
    if (typeof indexedDB === 'undefined') return;

    const openReq = indexedDB.open(DB_NAME, DB_VERSION);
    openReq.onsuccess = () => {
      const db = openReq.result;
      try {
        const tx = db.transaction('diagnostic-sessions', 'readwrite');
        tx.objectStore('diagnostic-sessions').put(session);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      } catch {
        db.close();
      }
    };
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function startHeartbeat(): void {
  if (heartbeatIntervalId !== null) return;

  try {
    heartbeatIntervalId = setInterval(() => {
      try {
        if (!currentSession) return;
        const lastHeartbeat = Date.now();
        currentSession = {
          ...currentSession,
          lastSeenAt: lastHeartbeat,
          lastHeartbeat,
        };
        putSessionWithEviction(currentSession).catch(() => {
          // Diagnostics must never throw into app code.
        });
      } catch {
        // Diagnostics must never throw into app code.
      }
    }, HEARTBEAT_INTERVAL_MS);
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function markCleanShutdown(): void {
  try {
    if (!currentSession) return;
    currentSession = {
      ...currentSession,
      cleanShutdown: true,
      endedAt: Date.now(),
    };
    putSessionDuringPagehide(currentSession);
  } catch {
    // Diagnostics must never throw into app code.
  }
}

function isInterruptedSession(session: DiagnosticSession, now: number, currentSessionId: string): boolean {
  if (session.sessionId === currentSessionId) return false;
  if (session.cleanShutdown === true) return false;
  if (session.interruptedDetectedAt !== undefined) return false;

  if (typeof session.lastHeartbeat === 'number') {
    return now - session.lastHeartbeat > STALE_HEARTBEAT_MS;
  }

  return now - session.startedAt > STALE_STARTED_AT_MS;
}

export async function checkForInterruptedSession(): Promise<void> {
  try {
    const currentSessionId = getSessionId();
    const now = Date.now();
    const sessions = await getRecentDiagnosticSessions(10);
    const interruptedSession = sessions.find(session => isInterruptedSession(session, now, currentSessionId));
    if (!interruptedSession) return;

    record({
      kind: 'session-interruption',
      severity: Severity.Warn,
      message: 'previous-session-interrupted',
      metadata: {
        previousSessionId: interruptedSession.sessionId,
        lastHeartbeat: String(interruptedSession.lastHeartbeat ?? interruptedSession.startedAt),
        startedAt: String(interruptedSession.startedAt),
      },
    });

    await putSessionWithEviction({
      ...interruptedSession,
      interruptedDetectedAt: now,
    });
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function attachSessionListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  try {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        try {
          const state = document.visibilityState as 'visible' | 'hidden';
          recordLifecycleBreadcrumb(`visibility-${state}`);
          // Persist last visibility state so crash inference can distinguish
          // a kill-while-backgrounded from a kill-while-active.
          if (currentSession) {
            currentSession = { ...currentSession, visibilityState: state };
            putSessionWithEviction(currentSession).catch(() => {
              // Diagnostics must never throw into app code.
            });
          }
        } catch {
          // Diagnostics must never throw into app code.
        }
      });
    }
  } catch {
    // Diagnostics listener setup must never throw into app code.
  }

  // pagehide is handled separately because it requires access to the event object
  // to check the `persisted` flag (BFCache).
  //
  // BFCache guard: when pagehide fires with persisted === true, the page is being
  // frozen into the Back/Forward Cache, not truly unloaded. The session is still
  // alive — it will either be restored (pageshow with persisted === true) or
  // eventually killed from cache. Calling markCleanShutdown() here would write
  // cleanShutdown: true, which would suppress crash inference for any subsequent
  // BFCache kill. Only mark a clean shutdown when persisted === false (real unload).
  //
  // Safari iOS note: pagehide fires reliably when a tab is backgrounded or killed.
  // beforeunload does NOT fire on iOS — this listener is the correct shutdown hook.
  // Chrome Android behaves identically for BFCache: persisted === true means the
  // page entered the cache, not that it is being destroyed.
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', (ev: PageTransitionEvent) => {
        try {
          recordLifecycleBreadcrumb(ev.persisted ? 'pagehide-bfcache' : 'pagehide');
          if (!ev.persisted) markCleanShutdown();
        } catch {
          // Diagnostics must never throw into app code.
        }
      });
    }
  } catch {
    // Diagnostics listener setup must never throw into app code.
  }

  const remainingLifecycleEvents = ['pageshow', 'online', 'offline', 'focus', 'blur'] as const;
  for (const event of remainingLifecycleEvents) {
    try {
      if (typeof window === 'undefined') continue;
      window.addEventListener(event, () => {
        try {
          recordLifecycleBreadcrumb(event);
        } catch {
          // Diagnostics must never throw into app code.
        }
      });
    } catch {
      // Diagnostics listener setup must never throw into app code.
    }
  }
}

export function initSession(): void {
  if (initialized) return;
  initialized = true;

  try {
    const sessionId = getSessionId();
    const startedAt = Date.now();
    const metadata = collectDeviceMetadata();
    const releaseIdentity = getReleaseIdentity();
    cachedDeviceMetadata = metadata;

    const session: SessionRecord = {
      sessionId,
      ...releaseIdentity,
      startedAt,
      lastSeenAt: startedAt,
      route: typeof window === 'undefined' ? '' : window.location.pathname,
      source: 'diagnostics/session',
      cleanShutdown: false,
      metadata,
    };
    currentSession = session;

    putSessionWithEviction(session).catch(() => {
      // Diagnostics must never throw into app code.
    });

    record({
      kind: 'lifecycle',
      severity: Severity.Info,
      message: 'session-start',
      metadata: {
        release: releaseIdentity.release,
        version: releaseIdentity.version,
        buildId: releaseIdentity.buildId,
        deviceClass: metadata.deviceClass ?? 'unknown',
        os: metadata.os ?? 'unknown',
        viewportWidth: metadata.viewportWidth ?? '0',
        viewportHeight: metadata.viewportHeight ?? '0',
      },
    });

    attachSessionListeners();
    void (async () => {
      try {
        // runCrashInference provides enhanced crash classification (abrupt-kill vs
        // memory-pressure-kill) on top of the basic interrupted-session check.
        await runCrashInference();
      } catch {
        // Diagnostics must never throw into app code.
      } finally {
        startHeartbeat();
      }
    })();
  } catch {
    // Diagnostics must never throw into app code.
  }
}

export function getDeviceMetadata(): Record<string, string> {
  return cachedDeviceMetadata ? { ...cachedDeviceMetadata } : {};
}
