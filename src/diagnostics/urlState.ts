














// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiagnosticsUrlState {
  /** Event kind filter. Empty string = no filter. */
  kind: string;
  /** Event severity filter. Empty string = no filter. */
  severity: string;
  /** ISO date lower bound (YYYY-MM-DD). Empty string = no bound. */
  start: string;
  /** ISO date upper bound (YYYY-MM-DD). Empty string = no bound. */
  end: string;
  /** Display mode for event list. Default: 'flat'. */
  mode: 'flat' | 'grouped';
  /** Session status filter. Default: 'all'. */
  sessions: 'all' | 'clean' | 'interrupted';
  /** Current event list page, 1-based (URL). Convert to 0-based for internal use. Default: 1. */
  page: number;
  /** Selected diagnostic event ID, or null (no selection). */
  event: string | null;
  /** Selected diagnostic report ID, or null (no selection). */
  report: string | null;
  /** Remote report page, 1-based (URL). Convert to 0-based for internal use. Default: 1. */
  rpage: number;
  /** Remote trend range in days. Allowed: 7, 30, 90. Default: 7. */
  range: 7 | 30 | 90;
  /** Remote trend period granularity. Default: 'day'. */
  period: 'day' | 'week';
}

export interface DiagnosticsUrlStateInvalidParam {
  field: string;
  /** Truncated value (max 35 chars) for safe reporting. */
  value: string;
  fallback: string;
}

export interface DiagnosticsUrlStateDuplicateParam {
  field: string;
  values: string[];
  chosenValue: string;
}

export interface DiagnosticsUrlStateIgnoredParam {
  field: string;
  value: string;
}

export interface DiagnosticsUrlStateParseResult {
  state: DiagnosticsUrlState;
  invalidParams: DiagnosticsUrlStateInvalidParam[];
  duplicateParams: DiagnosticsUrlStateDuplicateParam[];
  ignoredParams: DiagnosticsUrlStateIgnoredParam[];
  /** Whether canonical URL cleanup is needed. */
  needsCleanup: boolean;
  /** Canonical serialized route; use this for replaceHashRoute when needsCleanup is true. */
  canonicalRoute: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const VALID_DIAGNOSTICS_KINDS = new Set([
  'error', 'engine', 'idb', 'performance', 'route',
  'session-interruption', 'unhandled-rejection', 'resource-error', 'user-report',
]);

export const VALID_DIAGNOSTICS_SEVERITIES = new Set([
  'debug', 'info', 'warn', 'error', 'fatal',
]);

const VALID_MODES = new Set<'flat' | 'grouped'>(['flat', 'grouped']);
const VALID_SESSIONS = new Set<'all' | 'clean' | 'interrupted'>(['all', 'clean', 'interrupted']);
const VALID_RANGES = new Set<number>([7, 30, 90]);
const VALID_PERIODS = new Set<'day' | 'week'>(['day', 'week']);

const KNOWN_PARAMS = new Set([
  'kind', 'severity', 'start', 'end', 'mode', 'sessions',
  'page', 'event', 'report', 'rpage', 'range', 'period',
]);

/** Maximum allowed characters for a stable ID param (event, report). */
const ID_MAX_LENGTH = 128;

/** Allowlisted character pattern for stable ID params: [a-zA-Z0-9._:-] only. */
const ID_SAFE_RE = /^[a-zA-Z0-9._:-]+$/;

/** URL length guardrail matching the sprint helper contract. */
export const DIAGNOSTICS_ROUTE_URL_LENGTH_GUARDRAIL = 1500;

/** Maximum page value (5,000 events at 25/page). */
const PAGE_MAX = 200;

const DEFAULT_STATE: DiagnosticsUrlState = {
  kind: '',
  severity: '',
  start: '',
  end: '',
  mode: 'flat',
  sessions: 'all',
  page: 1,
  event: null,
  report: null,
  rpage: 1,
  range: 7,
  period: 'day',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip hash prefix and optional `#/admin/diagnostics` path segment;
 * return raw query string (without leading `?`).
 */
function normalizedQuery(input: string): string {
  // Accept: raw query text, `?query`, full hash `#/admin/diagnostics?...`,
  // or bare `admin/diagnostics?...`.
  const noHash = input.replace(/^#\/?/, '');
  const noRoute = noHash.replace(/^admin\/diagnostics\??/, '').replace(/^admin\/diagnostics$/, '');
  const qStart = noRoute.indexOf('?');
  if (qStart >= 0) return noRoute.slice(qStart + 1);
  return noRoute.startsWith('?') ? noRoute.slice(1) : noRoute;
}

/**
 * Return true if the value looks like a payload: JSON blob, PGN fragment,
 * FEN fragment, base64-like, whitespace, or too long.
 * Used to reject unsafe values for `event` and `report` params.
 */
function isPayloadLike(value: string): boolean {
  if (value.length > ID_MAX_LENGTH) return true;
  // JSON-like, array-like, quoted strings, newlines, tabs
  if (/[{}\[\]"'\n\r\t]/.test(value)) return true;
  // Whitespace (PGN move notation uses spaces between moves)
  if (/\s/.test(value)) return true;
  // Forward slash (FEN ranks separator)
  if (value.includes('/')) return true;
  // Equals sign (query param injection, JSON-like)
  if (value.includes('=')) return true;
  return false;
}

/** Return true if the value is a valid stable ID (`[a-zA-Z0-9._:-]+`, max 128 chars). */
function isSafeId(value: string): boolean {
  if (!value || value.length > ID_MAX_LENGTH) return false;
  return ID_SAFE_RE.test(value);
}

/** Validate ISO date string `YYYY-MM-DD`. Returns true if parseable. */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  return !isNaN(d.getTime());
}

/** Truncate to 35 chars for safe error reporting (avoids payload bleed). */
function safeValueForReport(raw: string): string {
  return raw.length > 35 ? raw.slice(0, 32) + '...' : raw;
}

function inv(
  field: string,
  raw: string,
  fallback: string,
): DiagnosticsUrlStateInvalidParam {
  return { field, value: safeValueForReport(raw), fallback };
}

/**
 * Collect all values for a param from URLSearchParams.
 * Records a duplicate entry when more than one value exists (last-wins policy).
 */
function allValues(
  params: URLSearchParams,
  key: string,
  duplicateParams: DiagnosticsUrlStateDuplicateParam[],
): string[] {
  const all = params.getAll(key);
  if (all.length > 1) {
    duplicateParams.push({
      field: key,
      values: all,
      chosenValue: all[all.length - 1] ?? '',
    });
  }
  return all;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse raw query text from `route.query` into typed Admin Diagnostics URL state.
 *
 * Never throws — all malformed input recovers to defaults.
 * Unknown params are ignored. Invalid known params recover to defaults.
 * Duplicate params are reported; last value wins.
 */
export function parseDiagnosticsUrlState(input: string): DiagnosticsUrlStateParseResult {
  const params = new URLSearchParams(normalizedQuery(input));
  const state: DiagnosticsUrlState = { ...DEFAULT_STATE };
  const invalidParams: DiagnosticsUrlStateInvalidParam[] = [];
  const duplicateParams: DiagnosticsUrlStateDuplicateParam[] = [];
  const ignoredParams: DiagnosticsUrlStateIgnoredParam[] = [];

  // Collect unknown (ignored) params.
  params.forEach((_value, key) => {
    if (!KNOWN_PARAMS.has(key) && !ignoredParams.some(p => p.field === key)) {
      ignoredParams.push({ field: key, value: safeValueForReport(params.get(key) ?? '') });
    }
  });

  // ── kind ─────────────────────────────────────────────────────────────────
  const kindVals = allValues(params, 'kind', duplicateParams);
  if (kindVals.length > 0) {
    const raw = kindVals[kindVals.length - 1] ?? '';
    if (raw === '') {
      // empty is valid (no filter); state.kind already ''
    } else if (VALID_DIAGNOSTICS_KINDS.has(raw)) {
      state.kind = raw;
    } else {
      invalidParams.push(inv('kind', raw, ''));
      // state.kind stays at ''
    }
  }

  // ── severity ──────────────────────────────────────────────────────────────
  const severityVals = allValues(params, 'severity', duplicateParams);
  if (severityVals.length > 0) {
    const raw = severityVals[severityVals.length - 1] ?? '';
    if (raw === '') {
      // empty is valid; state.severity already ''
    } else if (VALID_DIAGNOSTICS_SEVERITIES.has(raw)) {
      state.severity = raw;
    } else {
      invalidParams.push(inv('severity', raw, ''));
    }
  }

  // ── start / end (parse separately then cross-validate) ────────────────────
  const startVals = allValues(params, 'start', duplicateParams);
  const endVals = allValues(params, 'end', duplicateParams);

  let parsedStart = '';
  let parsedEnd = '';

  if (startVals.length > 0) {
    const raw = startVals[startVals.length - 1] ?? '';
    if (raw !== '') {
      if (isValidIsoDate(raw)) {
        parsedStart = raw;
      } else {
        invalidParams.push(inv('start', raw, ''));
      }
    }
  }

  if (endVals.length > 0) {
    const raw = endVals[endVals.length - 1] ?? '';
    if (raw !== '') {
      if (isValidIsoDate(raw)) {
        parsedEnd = raw;
      } else {
        invalidParams.push(inv('end', raw, ''));
      }
    }
  }

  // Cross-validation: if both are valid dates, end must be >= start.
  if (parsedStart && parsedEnd && parsedEnd < parsedStart) {
    invalidParams.push(inv('start', parsedStart, ''));
    invalidParams.push(inv('end', parsedEnd, ''));
    parsedStart = '';
    parsedEnd = '';
  }

  state.start = parsedStart;
  state.end = parsedEnd;

  // ── mode ──────────────────────────────────────────────────────────────────
  const modeVals = allValues(params, 'mode', duplicateParams);
  if (modeVals.length > 0) {
    const raw = modeVals[modeVals.length - 1] ?? '';
    if (VALID_MODES.has(raw as 'flat' | 'grouped')) {
      state.mode = raw as 'flat' | 'grouped';
    } else if (raw !== '') {
      invalidParams.push(inv('mode', raw, 'flat'));
      // state.mode stays at default 'flat'
    }
  }

  // ── sessions ──────────────────────────────────────────────────────────────
  const sessionsVals = allValues(params, 'sessions', duplicateParams);
  if (sessionsVals.length > 0) {
    const raw = sessionsVals[sessionsVals.length - 1] ?? '';
    if (VALID_SESSIONS.has(raw as 'all' | 'clean' | 'interrupted')) {
      state.sessions = raw as 'all' | 'clean' | 'interrupted';
    } else if (raw !== '') {
      invalidParams.push(inv('sessions', raw, 'all'));
    }
  }

  // ── page ──────────────────────────────────────────────────────────────────
  const pageVals = allValues(params, 'page', duplicateParams);
  if (pageVals.length > 0) {
    const raw = pageVals[pageVals.length - 1] ?? '';
    if (raw !== '') {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        state.page = Math.min(parsed, PAGE_MAX);
      } else {
        invalidParams.push(inv('page', raw, '1'));
      }
    }
  }

  // ── event ─────────────────────────────────────────────────────────────────
  const eventVals = allValues(params, 'event', duplicateParams);
  if (eventVals.length > 0) {
    const raw = eventVals[eventVals.length - 1] ?? '';
    if (raw !== '') {
      if (!isPayloadLike(raw) && isSafeId(raw)) {
        state.event = raw;
      } else {
        invalidParams.push(inv('event', raw, 'null'));
        // state.event stays at null — recovers to list
      }
    }
  }

  // ── report ────────────────────────────────────────────────────────────────
  const reportVals = allValues(params, 'report', duplicateParams);
  if (reportVals.length > 0) {
    const raw = reportVals[reportVals.length - 1] ?? '';
    if (raw !== '') {
      if (!isPayloadLike(raw) && isSafeId(raw)) {
        state.report = raw;
      } else {
        invalidParams.push(inv('report', raw, 'null'));
        // state.report stays at null — recovers to list
      }
    }
  }

  // ── rpage ─────────────────────────────────────────────────────────────────
  const rpageVals = allValues(params, 'rpage', duplicateParams);
  if (rpageVals.length > 0) {
    const raw = rpageVals[rpageVals.length - 1] ?? '';
    if (raw !== '') {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        state.rpage = parsed;
      } else {
        invalidParams.push(inv('rpage', raw, '1'));
      }
    }
  }

  // ── range ─────────────────────────────────────────────────────────────────
  const rangeVals = allValues(params, 'range', duplicateParams);
  if (rangeVals.length > 0) {
    const raw = rangeVals[rangeVals.length - 1] ?? '';
    if (raw !== '') {
      const parsed = parseInt(raw, 10);
      if (VALID_RANGES.has(parsed)) {
        state.range = parsed as 7 | 30 | 90;
      } else {
        invalidParams.push(inv('range', raw, '7'));
      }
    }
  }

  // ── period ────────────────────────────────────────────────────────────────
  const periodVals = allValues(params, 'period', duplicateParams);
  if (periodVals.length > 0) {
    const raw = periodVals[periodVals.length - 1] ?? '';
    if (VALID_PERIODS.has(raw as 'day' | 'week')) {
      state.period = raw as 'day' | 'week';
    } else if (raw !== '') {
      invalidParams.push(inv('period', raw, 'day'));
    }
  }

  const needsCleanup =
    invalidParams.length > 0 ||
    duplicateParams.length > 0 ||
    ignoredParams.length > 0;

  const canonicalRoute = serializeDiagnosticsUrlState(state);

  return { state, invalidParams, duplicateParams, ignoredParams, needsCleanup, canonicalRoute };
}

// ── Serializer ────────────────────────────────────────────────────────────────

/**
 * Serialize Admin Diagnostics URL state to a canonical hash route string.
 *
 * Default values are elided. Returns `#/admin/diagnostics` when all params elide.
 * Stable serialization order:
 *   kind, severity, start, end, mode, sessions, page, event,
 *   report, rpage, range, period.
 *
 * Tokens, payloads, and hard-excluded values must never be passed into this function.
 */
export function serializeDiagnosticsUrlState(state: Partial<DiagnosticsUrlState>): string {
  const parts: string[] = [];

  // kind — elide empty (default)
  const kind = state.kind ?? DEFAULT_STATE.kind;
  if (kind !== '') parts.push(`kind=${encodeURIComponent(kind)}`);

  // severity — elide empty (default)
  const severity = state.severity ?? DEFAULT_STATE.severity;
  if (severity !== '') parts.push(`severity=${encodeURIComponent(severity)}`);

  // start — elide empty (default)
  const start = state.start ?? DEFAULT_STATE.start;
  if (start !== '') parts.push(`start=${encodeURIComponent(start)}`);

  // end — elide empty (default)
  const end = state.end ?? DEFAULT_STATE.end;
  if (end !== '') parts.push(`end=${encodeURIComponent(end)}`);

  // mode — elide default 'flat'
  const mode = state.mode ?? DEFAULT_STATE.mode;
  if (mode !== DEFAULT_STATE.mode) parts.push(`mode=${encodeURIComponent(mode)}`);

  // sessions — elide default 'all'
  const sessions = state.sessions ?? DEFAULT_STATE.sessions;
  if (sessions !== DEFAULT_STATE.sessions) parts.push(`sessions=${encodeURIComponent(sessions)}`);

  // page — elide default 1
  const page = state.page ?? DEFAULT_STATE.page;
  if (page !== DEFAULT_STATE.page) parts.push(`page=${page}`);

  // event — elide null (default)
  const event = state.event !== undefined ? state.event : DEFAULT_STATE.event;
  if (event !== null) parts.push(`event=${encodeURIComponent(event)}`);

  // report — elide null (default)
  const report = state.report !== undefined ? state.report : DEFAULT_STATE.report;
  if (report !== null) parts.push(`report=${encodeURIComponent(report)}`);

  // rpage — elide default 1
  const rpage = state.rpage ?? DEFAULT_STATE.rpage;
  if (rpage !== DEFAULT_STATE.rpage) parts.push(`rpage=${rpage}`);

  // range — elide default 7
  const range = state.range ?? DEFAULT_STATE.range;
  if (range !== DEFAULT_STATE.range) parts.push(`range=${range}`);

  // period — elide default 'day'
  const period = state.period ?? DEFAULT_STATE.period;
  if (period !== DEFAULT_STATE.period) parts.push(`period=${encodeURIComponent(period)}`);

  const route = `#/admin/diagnostics${parts.length > 0 ? `?${parts.join('&')}` : ''}`;

  // Guardrail: warn and return bare route if output is too long.
  if (route.length > DIAGNOSTICS_ROUTE_URL_LENGTH_GUARDRAIL) {
    console.warn(
      '[diagnostics/urlState] serialized diagnostics route exceeds length guardrail',
      route.length,
    );
    return '#/admin/diagnostics';
  }

  return route;
}
