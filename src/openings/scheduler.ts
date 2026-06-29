















// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rapid-navigation threshold (ms). isRapid() returns true within this window. */
export const RAPID_GAP_MS = 180;

/** Quiet period (ms) after which onSettle() fires its callback. */
export const SETTLE_QUIET_MS = 220;

// ---------------------------------------------------------------------------
// Injectable dependencies (for unit tests)
// ---------------------------------------------------------------------------

type NowFn = () => number;

let _nowFn: NowFn = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/** Override the clock source for unit tests. */
export function _setNow(fn: NowFn): void {
  _nowFn = fn;
}

type SetTimeoutFn = (handler: () => void, timeout: number) => number;
type ClearTimeoutFn = (id: number) => void;

let _setTimeoutFn: SetTimeoutFn = (h, t) => setTimeout(h, t);
let _clearTimeoutFn: ClearTimeoutFn = (id) => clearTimeout(id);

/** Override setTimeout/clearTimeout for unit tests. */
export function _setTimerFns(fns: {
  setTimeoutFn: SetTimeoutFn;
  clearTimeoutFn: ClearTimeoutFn;
}): void {
  _setTimeoutFn = fns.setTimeoutFn;
  _clearTimeoutFn = fns.clearTimeoutFn;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _lastNavTs: number = -Infinity;
let _generation: number = 0;
let _settleTimer: number | null = null;
let _pendingSettleCb: (() => void) | null = null;

/**
 * Reset all module state. Intended for test isolation — call between tests
 * after injecting fake timer functions.
 */
export function _resetState(): void {
  if (_settleTimer !== null) {
    _clearTimeoutFn(_settleTimer);
    _settleTimer = null;
  }
  _pendingSettleCb = null;
  _lastNavTs = -Infinity;
  _generation = 0;
}

// ---------------------------------------------------------------------------
// Navigation tracking
// ---------------------------------------------------------------------------

/**
 * Records a navigation event: snapshots the current timestamp and increments
 * the generation counter. If a settle callback is pending, its timer is
 * extended (SETTLE_QUIET_MS from now) to enforce the quiet-period invariant.
 */
export function markNav(): void {
  _lastNavTs = _nowFn();
  _generation++;
  // Extend any pending settle timer so the quiet window restarts from now.
  if (_pendingSettleCb !== null) {
    if (_settleTimer !== null) {
      _clearTimeoutFn(_settleTimer);
    }
    const cb = _pendingSettleCb;
    _settleTimer = _setTimeoutFn(() => {
      _settleTimer = null;
      _pendingSettleCb = null;
      cb();
    }, SETTLE_QUIET_MS);
  }
}

/** Returns the current navigation generation counter. Increments on each markNav(). */
export function navGeneration(): number {
  return _generation;
}

/**
 * Returns true if the last markNav() call happened within RAPID_GAP_MS.
 * Returns false if markNav() has never been called.
 */
export function isRapid(): boolean {
  if (_lastNavTs === -Infinity) return false;
  return _nowFn() - _lastNavTs < RAPID_GAP_MS;
}

// ---------------------------------------------------------------------------
// Settle scheduling
// ---------------------------------------------------------------------------

/**
 * Schedules cb to run after SETTLE_QUIET_MS of no new markNav() calls.
 *
 * "Latest wins": if called again before the timer fires, the pending callback
 * is cancelled and replaced. If markNav() fires while a settle is pending,
 * the timer is extended to SETTLE_QUIET_MS from the markNav() call, so the
 * callback is always deferred until the user stops navigating.
 */
export function onSettle(cb: () => void): void {
  if (_settleTimer !== null) {
    _clearTimeoutFn(_settleTimer);
    _settleTimer = null;
  }
  _pendingSettleCb = cb;
  _settleTimer = _setTimeoutFn(() => {
    _settleTimer = null;
    _pendingSettleCb = null;
    cb();
  }, SETTLE_QUIET_MS);
}

// ---------------------------------------------------------------------------
// Frame and idle scheduling
// ---------------------------------------------------------------------------

/**
 * Runs cb after one animation frame.
 * Falls back to setTimeout(cb, 0) when requestAnimationFrame is unavailable.
 */
export function runAfterFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => cb());
  } else {
    setTimeout(cb, 0);
  }
}

/**
 * Runs cb when the browser is idle. Feature-detected:
 * - Uses requestIdleCallback when available.
 * - Falls back to setTimeout otherwise.
 *
 * @param cb        Callback to invoke at idle time.
 * @param timeoutMs Optional deadline (ms). Passed as { timeout } to
 *                  requestIdleCallback, or used as the setTimeout delay.
 */
export function runIdle(cb: () => void, timeoutMs?: number): void {
  if (typeof requestIdleCallback === 'function') {
    if (timeoutMs !== undefined) {
      requestIdleCallback(cb, { timeout: timeoutMs });
    } else {
      requestIdleCallback(cb);
    }
  } else {
    setTimeout(cb, timeoutMs ?? 0);
  }
}

// ---------------------------------------------------------------------------
// Generation token helpers — latest-only / stale-drop pattern
// ---------------------------------------------------------------------------

/**
 * Captures the current navigation generation as an opaque token.
 *
 * Stamp long-running or deferred work when it starts. Before applying results,
 * call isGenerationCurrent(token) to check whether the user has navigated away
 * since the work began. Drop stale results.
 *
 * @example
 * const token = currentGenerationToken();
 * onSettle(() => {
 *   if (!isGenerationCurrent(token)) return; // stale — drop
 *   startEngine();
 * });
 */
export function currentGenerationToken(): number {
  return _generation;
}

/**
 * Returns true if the token matches the current navigation generation.
 * Returns false if markNav() was called after the token was captured (stale).
 */
export function isGenerationCurrent(token: number): boolean {
  return token === _generation;
}
