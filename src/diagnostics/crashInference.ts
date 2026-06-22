/**
 * Crash inference for abrupt browser kills and OS memory pressure.
 *
 * On mobile, browsers can kill a tab or process without firing `beforeunload`
 * when the OS reclaims memory or the user force-closes the browser. This module
 * reads session lifecycle markers written by the heartbeat and shutdown handlers
 * at startup, and infers whether the previous session was interrupted abnormally,
 * distinguishing a clean reload from an abrupt kill.
 *
 * Three crash types are classified:
 *   - "abrupt-kill": session was open, no clean shutdown, heartbeat is stale,
 *     no memory-pressure breadcrumbs were found, and visibility state is unknown.
 *   - "memory-pressure-kill": same conditions, but memory-pressure breadcrumbs
 *     were present in the previous session's events.
 *   - "background-kill": previous session's last recorded visibility state was
 *     "hidden", indicating the kill happened while the tab was backgrounded.
 *   - "active-kill": previous session's last recorded visibility state was
 *     "visible", indicating the kill happened during foreground use.
 *
 * The visibility-based classification (background-kill / active-kill) is
 * best-effort: if the visibilityState field is absent, the inference falls back
 * to "abrupt-kill" without throwing.
 *
 * ─── beforeunload Audit ──────────────────────────────────────────────────────
 *
 * Audit performed 2026-06-21: searched `src/diagnostics/` for any functional
 * `beforeunload` event listener. Result: no functional `beforeunload` listeners
 * found. All references to `beforeunload` in this directory are documentation-only
 * comments explaining why the event is NOT used. The one exception is
 * session.ts line ~216, which contains an explanatory comment (not a listener).
 *
 * `lint: no-beforeunload` — this file must never reference `beforeunload` as a
 * functional listener. Mentions in comments are documentation only.
 *
 * ─── Browser Compatibility Matrix ───────────────────────────────────────────
 *
 * This module is intentionally free of any `beforeunload` dependency. The
 * session lifecycle in session.ts uses `pagehide` / `visibilitychange` only.
 *
 * | Browser           | pagehide fires? | beforeunload fires? | visibilitychange? | BFCache?        |
 * |-------------------|-----------------|---------------------|-------------------|-----------------|
 * | Safari iOS        | Yes (reliable)  | No                  | Yes (reliable)    | Yes (persisted) |
 * | Chrome Android    | Yes (reliable)  | Unreliable          | Yes (reliable)    | Yes (persisted) |
 * | Desktop Chrome    | Yes             | Yes                 | Yes               | Yes (persisted) |
 * | Desktop Firefox   | Yes             | Yes                 | Yes               | Yes (persisted) |
 * | Desktop Safari    | Yes             | Yes                 | Yes               | Yes (persisted) |
 *
 * `visibilitychange` to "hidden": most reliable cross-browser signal for the
 * background transition. This is used as the primary heartbeat-stop trigger in
 * session.ts — it fires on all five target environments, including Safari iOS
 * where `beforeunload` does not fire.
 *
 * Safari iOS: `beforeunload` does not fire when the user backgrounds the app
 * or the OS reclaims memory. `pagehide` is the only reliable exit hook. The
 * session.ts lifecycle listener uses `pagehide` exclusively for this reason.
 * IDB writes issued inside the `pagehide` handler may be interrupted if the OS
 * kills the tab immediately after the event fires; the synchronous write path
 * in putSessionDuringPagehide maximises the chance the write lands.
 *
 * Chrome Android: `beforeunload` is unreliable. `pagehide` fires both for true
 * navigation away (persisted === false) and for BFCache entry (persisted === true).
 * The session.ts handler checks `persisted` before calling markCleanShutdown().
 *
 * BFCache (Back/Forward Cache): when `pagehide` fires with `event.persisted === true`,
 * the page is frozen — not destroyed. The session must NOT be marked cleanShutdown
 * at that point, because the page may subsequently be killed from cache without
 * any further events. The session.ts handler guards against this: markCleanShutdown()
 * is only called when `persisted === false`.
 *
 * Desktop Safari / ITP: Safari's Intelligent Tracking Prevention can restrict
 * third-party storage, but first-party IDB writes in `pagehide` are not blocked
 * by ITP. The synchronous IDB write path in putSessionDuringPagehide (session.ts)
 * uses the raw indexedDB API directly (no Promises that would be abandoned after
 * the event loop drains) to maximise the chance the write completes before Safari
 * suspends the page. `beforeunload` generally fires on desktop Safari for navigation
 * away, but is not relied upon here.
 *
 * Desktop Chrome / Firefox: `pagehide` and `beforeunload` both fire. BFCache
 * behaviour is controlled by `Cache-Control` headers. `visibilitychange` also fires
 * reliably and is the recommended heartbeat-stop trigger even on desktop.
 *
 * Known limitations:
 *   - If the OS hard-kills the browser process (OOM, force-quit), no JavaScript
 *     runs at all — no `pagehide`, no `visibilitychange`. The heartbeat staleness
 *     threshold (ABRUPT_KILL_HEARTBEAT_THRESHOLD_MS) is the only fallback in this case.
 *   - On iOS, a page killed from BFCache by the OS produces no event. This appears
 *     as a stale-heartbeat session on the next visit, and will be inferred as
 *     "background-kill" if visibilityState was "hidden" at the time of the last
 *     pagehide, or "abrupt-kill" if visibilityState is unknown.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { getDiagnosticEvents, getRecentDiagnosticSessions } from '../idb';
import { getSessionId } from './id';
import { putSessionWithEviction } from './idbStore';
import { record } from './record';
import { Severity, type DiagnosticEvent, type DiagnosticSession } from './types';

/** Threshold in ms: a heartbeat older than this indicates the session was abruptly killed. */
const ABRUPT_KILL_HEARTBEAT_THRESHOLD_MS = 60_000;

/** Fallback threshold when no heartbeat is available: use session start time. */
const ABRUPT_KILL_STARTED_AT_THRESHOLD_MS = 5 * 60_000;

type InferredCrashType = 'abrupt-kill' | 'memory-pressure-kill' | 'background-kill' | 'active-kill';

type VisibilityAtCrash = 'hidden' | 'visible' | 'unknown';

interface CrashInferenceResult {
  session: DiagnosticSession;
  inferredCrashType: InferredCrashType;
  heartbeatAge: number;
  visibilityAtCrash: VisibilityAtCrash;
}

/**
 * Returns true if this session appears to have been interrupted (not clean-shutdown,
 * not the current session, heartbeat is stale enough to infer an abrupt kill).
 */
function isInterruptedSession(session: DiagnosticSession, now: number, currentSessionId: string): boolean {
  if (session.sessionId === currentSessionId) return false;
  if (session.cleanShutdown === true) return false;
  // Skip sessions already marked as detected on a prior boot.
  if (session.interruptedDetectedAt !== undefined) return false;

  if (typeof session.lastHeartbeat === 'number') {
    return now - session.lastHeartbeat > ABRUPT_KILL_HEARTBEAT_THRESHOLD_MS;
  }

  return now - session.startedAt > ABRUPT_KILL_STARTED_AT_THRESHOLD_MS;
}

/**
 * Computes the heartbeat age in ms for a session (time since last heartbeat or session start).
 */
function computeHeartbeatAge(session: DiagnosticSession, now: number): number {
  const reference = typeof session.lastHeartbeat === 'number'
    ? session.lastHeartbeat
    : session.startedAt;
  return now - reference;
}

/**
 * Checks whether the given session had memory-pressure lifecycle breadcrumbs by
 * scanning recent lifecycle events in IDB for the session's ID.
 *
 * Memory pressure is signalled by breadcrumbs with event text containing
 * "memory-pressure" or by lifecycle breadcrumbs recorded under that label.
 */
async function hadMemoryPressure(sessionId: string): Promise<boolean> {
  try {
    // Retrieve a bounded set of recent lifecycle events scoped to this session.
    const events: DiagnosticEvent[] = await getDiagnosticEvents({ limit: 200, kind: 'lifecycle' });
    for (const event of events) {
      if (event.sessionId !== sessionId) continue;
      // Check message and breadcrumb entries for memory-pressure signals.
      if (event.message.toLowerCase().includes('memory-pressure')) return true;
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.type === 'lifecycle-change' && bc.event.toLowerCase().includes('memory-pressure')) {
            return true;
          }
        }
      }
    }
  } catch {
    // Diagnostics must never throw into app code.
  }
  return false;
}

/**
 * Finds the most recently interrupted session (if any) from the last N sessions.
 *
 * Returns a result with the interrupted session and the inferred crash type, or
 * `undefined` if no interrupted session is detected.
 */
async function findInterruptedSession(now: number, currentSessionId: string): Promise<CrashInferenceResult | undefined> {
  const sessions = await getRecentDiagnosticSessions(10);
  const interruptedSession = sessions.find(s => isInterruptedSession(s, now, currentSessionId));
  if (!interruptedSession) return undefined;

  const heartbeatAge = computeHeartbeatAge(interruptedSession, now);
  const memoryPressure = await hadMemoryPressure(interruptedSession.sessionId);

  // Determine visibility state at the time of the crash (best-effort).
  const lastVisibility = interruptedSession.visibilityState;
  const visibilityAtCrash: VisibilityAtCrash = lastVisibility ?? 'unknown';

  // Classify crash type: visibility-based classification takes precedence over
  // the generic abrupt-kill label; memory-pressure-kill is orthogonal and is
  // only applied when visibility state is unknown.
  let inferredCrashType: InferredCrashType;
  if (lastVisibility === 'hidden') {
    inferredCrashType = 'background-kill';
  } else if (lastVisibility === 'visible') {
    inferredCrashType = 'active-kill';
  } else if (memoryPressure) {
    inferredCrashType = 'memory-pressure-kill';
  } else {
    inferredCrashType = 'abrupt-kill';
  }

  return { session: interruptedSession, inferredCrashType, heartbeatAge, visibilityAtCrash };
}

/**
 * On app boot, reads previous session lifecycle markers from IDB and infers
 * whether the previous session was interrupted by an abrupt browser kill or
 * OS memory pressure.
 *
 * When an interrupted session is detected, emits a `session-interruption`
 * DiagnosticEvent with `inferredCrashType` and `heartbeatAge` fields.
 *
 * This function does not depend on `beforeunload` and is safe to call on
 * mobile where `beforeunload` may not fire.
 */
export async function runCrashInference(): Promise<void> {
  try {
    const currentSessionId = getSessionId();
    const now = Date.now();

    const result = await findInterruptedSession(now, currentSessionId);
    if (!result) return;

    const { session, inferredCrashType, heartbeatAge, visibilityAtCrash } = result;

    record({
      kind: 'session-interruption',
      severity: Severity.Warn,
      message: 'previous-session-interrupted',
      source: 'diagnostics/crashInference',
      sourceTag: 'crash-inference',
      metadata: {
        previousSessionId: session.sessionId,
        inferredCrashType,
        lastKnownRoute: session.route ?? '',
        heartbeatAgeMs: heartbeatAge,
        visibilityAtCrash,
        heartbeatAge: String(heartbeatAge),
        lastHeartbeat: String(session.lastHeartbeat ?? session.startedAt),
        startedAt: String(session.startedAt),
      },
      redactionClass: 'safe',
    });

    // Clear the previous session's open marker so it is not re-inferred on the next boot.
    // Writing cleanShutdown: 'inferred-closed' signals that this session was already processed,
    // and interruptedDetectedAt provides the exact time the inference ran.
    try {
      await putSessionWithEviction({
        ...session,
        interruptedDetectedAt: now,
        cleanShutdown: 'inferred-closed',
      });
    } catch {
      // IDB operations are best-effort; failures are silently caught.
    }
  } catch {
    // Diagnostics must never throw into app code.
  }
}
