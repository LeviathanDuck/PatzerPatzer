


















export type RemoteSyncOperationKind =
  | 'checking'
  | 'pulling'
  | 'pushing'
  | 'queueing'
  | 'reconciling';

export const REMOTE_SYNC_OPERATION_KINDS: readonly RemoteSyncOperationKind[] = [
  'checking',
  'pulling',
  'pushing',
  'queueing',
  'reconciling',
];

export type RemoteSyncIssueReason =
  | 'token-required'
  | 'full-pull-required'
  | 'unsafe-skips'
  | 'durable-enqueue-failed'
  | 'untracked-local-items'
  | 'push-failed'
  | 'remote-count-mismatch';

export type RemoteSyncProgressSeverity = 'ok' | 'active' | 'warning' | 'error';

// Display state mirrors operation kinds plus the terminal 'idle' and 'error'
// states. Priority when deriving from overlapping operations/issues:
//   error > reconciling > queueing > pushing > pulling > checking > idle
// The owner-approved plan text only spells out
// "error > reconciling > pushing > pulling > checking > idle"; 'queueing'
// (scanning untracked local items ahead of a reconcile push) is slotted in
// directly below 'reconciling' since it is the lead-in phase of the same
// manual reconcile action. Adjust ACTIVE_KIND_PRIORITY below if a later
// prompt needs a different placement.
export type RemoteSyncProgressState =
  | 'idle'
  | 'checking'
  | 'pulling'
  | 'pushing'
  | 'queueing'
  | 'reconciling'
  | 'error';

const ACTIVE_KIND_PRIORITY: readonly RemoteSyncOperationKind[] = [
  'reconciling',
  'queueing',
  'pushing',
  'pulling',
  'checking',
];

export interface RemoteSyncOperationRecord {
  kind: RemoteSyncOperationKind;
  startedAt: number;
  total?: number;
  done?: number;
  phase?: string;
  counts: Record<string, number>;
  /** True while this entry was seeded from a sessionStorage denominator restore, not a live begin(). */
  restored?: boolean;
}

export interface RemoteSyncOperationSummary extends RemoteSyncOperationRecord {
  opId: string;
}

export interface RemoteSyncIssue {
  reason: RemoteSyncIssueReason;
  message: string;
  at: number;
  counts?: Record<string, number>;







  severity: 'warning' | 'error';
}

export interface RemoteSyncProgressStore {
  operations: Record<string, RemoteSyncOperationRecord>;
  issues: Partial<Record<RemoteSyncIssueReason, RemoteSyncIssue>>;
}

export interface RemoteSyncProgressIdentity {
  /** Server-confirmed identity label (user_key), or null if not yet known / logged out. */
  identityLabel: string | null;
  deviceTag: string;
  /** Short suffix of the persistent CAS client id — the writer id the server already records. */
  clientIdShort: string;
  /** Short suffix of the diagnostics session id (src/diagnostics). */
  sessionIdShort: string;
}

export interface RemoteSyncProgressIdentityBlock extends RemoteSyncProgressIdentity {
  scopeNote: string;
}

export interface RemoteSyncProgressSnapshot {
  state: RemoteSyncProgressState;
  severity: RemoteSyncProgressSeverity;
  label: string;
  title: string;
  operations: RemoteSyncOperationSummary[];
  issues: RemoteSyncIssue[];
  identity: RemoteSyncProgressIdentityBlock;
  updatedAt: number;
}

export const REMOTE_SYNC_PROGRESS_SCOPE_NOTE = 'Progress reflects this browser tab only.';

const ISSUE_SEVERITY: Record<RemoteSyncIssueReason, 'warning' | 'error'> = {
  'token-required': 'warning',
  'full-pull-required': 'warning',
  'unsafe-skips': 'warning',
  'durable-enqueue-failed': 'error',
  'untracked-local-items': 'warning',
  'push-failed': 'error',
  'remote-count-mismatch': 'error',
};

const DEFAULT_ISSUE_MESSAGES: Record<RemoteSyncIssueReason, string> = {
  'token-required': 'A sync token is required before syncing can continue.',
  'full-pull-required': 'A full pull from the server is required before further syncing.',
  'unsafe-skips': 'Some items were skipped for safety and were not synced.',
  'durable-enqueue-failed': 'Could not durably queue changes for sync.',
  'untracked-local-items': 'Some local items are not yet tracked by sync.',
  'push-failed': 'The last push to the server failed.',
  'remote-count-mismatch': 'Server and local item counts do not match.',
};

const ACTIVE_LABELS: Record<RemoteSyncOperationKind, string> = {
  checking: 'Checking…',
  pulling: 'Pulling…',
  pushing: 'Pushing…',
  queueing: 'Queueing…',
  reconciling: 'Reconciling…',
};

const ACTIVE_TITLES: Record<RemoteSyncOperationKind, string> = {
  checking: 'Checking sync status with the server.',
  pulling: 'Pulling the latest data from the server.',
  pushing: 'Pushing local changes to the server.',
  queueing: 'Queueing untracked local items for sync.',
  reconciling: 'Reconciling local and server sync state.',
};

export function remoteSyncIssueSeverity(reason: RemoteSyncIssueReason): 'warning' | 'error' {
  return ISSUE_SEVERITY[reason];
}

export function defaultRemoteSyncIssueMessage(reason: RemoteSyncIssueReason): string {
  return DEFAULT_ISSUE_MESSAGES[reason];
}

export function createRemoteSyncProgressStore(): RemoteSyncProgressStore {
  return { operations: {}, issues: {} };
}

let operationSequence = 0;

function generateOperationId(kind: RemoteSyncOperationKind): string {
  operationSequence += 1;
  return `${kind}-${Date.now().toString(36)}-${operationSequence}`;
}

export interface BeginRemoteSyncOperationOptions {
  /** Caller-supplied id (mainly for deterministic tests); auto-generated otherwise. */
  opId?: string;
  total?: number;
  phase?: string;
  now?: number;
}

/** Begins tracking a new operation. Returns the next store plus the id assigned to it. */
export function beginRemoteSyncOperation(
  store: RemoteSyncProgressStore,
  kind: RemoteSyncOperationKind,
  options: BeginRemoteSyncOperationOptions = {},
): { store: RemoteSyncProgressStore; opId: string } {
  const opId = options.opId ?? generateOperationId(kind);
  const record: RemoteSyncOperationRecord = {
    kind,
    startedAt: options.now ?? Date.now(),
    counts: {},
    ...(typeof options.total === 'number' ? { total: options.total, done: 0 } : {}),
    ...(options.phase ? { phase: options.phase } : {}),
  };
  return {
    store: { ...store, operations: { ...store.operations, [opId]: record } },
    opId,
  };
}

export interface UpdateRemoteSyncOperationOptions {
  done?: number;
  total?: number;
  phase?: string;
  /** Merged into (not replacing) the operation's existing counts. */
  counts?: Record<string, number>;
}

/** Updates an in-flight operation. No-op if the operation id is unknown (e.g. already completed). */
export function updateRemoteSyncOperation(
  store: RemoteSyncProgressStore,
  opId: string,
  updates: UpdateRemoteSyncOperationOptions,
): RemoteSyncProgressStore {
  const existing = store.operations[opId];
  if (!existing) return store;
  const next: RemoteSyncOperationRecord = {
    ...existing,
    ...(updates.total !== undefined ? { total: updates.total } : {}),
    ...(updates.done !== undefined ? { done: updates.done } : {}),
    ...(updates.phase !== undefined ? { phase: updates.phase } : {}),
    ...(updates.counts ? { counts: { ...existing.counts, ...updates.counts } } : {}),
    restored: false,
  };
  return { ...store, operations: { ...store.operations, [opId]: next } };
}

/** Marks an operation as finished successfully; it is removed from the active-operations map. */
export function completeRemoteSyncOperation(
  store: RemoteSyncProgressStore,
  opId: string,
): RemoteSyncProgressStore {
  if (!(opId in store.operations)) return store;
  const operations = { ...store.operations };
  delete operations[opId];
  return { ...store, operations };
}

export interface FailRemoteSyncOperationOptions {
  reason?: RemoteSyncIssueReason;
  message?: string;
  counts?: Record<string, number>;
  now?: number;
}

/** Ends an operation unsuccessfully; optionally records a reason-coded issue in the same step. */
export function failRemoteSyncOperation(
  store: RemoteSyncProgressStore,
  opId: string,
  options: FailRemoteSyncOperationOptions = {},
): RemoteSyncProgressStore {
  const withoutOp = completeRemoteSyncOperation(store, opId);
  if (!options.reason) return withoutOp;
  return addRemoteSyncIssue(withoutOp, {
    reason: options.reason,
    message: options.message ?? defaultRemoteSyncIssueMessage(options.reason),
    ...(options.counts ? { counts: options.counts } : {}),
    ...(options.now !== undefined ? { at: options.now } : {}),
  });
}

export interface AddRemoteSyncIssueInput {
  reason: RemoteSyncIssueReason;
  message?: string;
  counts?: Record<string, number>;
  at?: number;
  /** Per-instance severity override; defaults to the reason's fixed `ISSUE_SEVERITY` mapping. */
  severity?: 'warning' | 'error';
}

/** Adds (or replaces) the single active issue for a reason code. */
export function addRemoteSyncIssue(
  store: RemoteSyncProgressStore,
  issue: AddRemoteSyncIssueInput,
): RemoteSyncProgressStore {
  const entry: RemoteSyncIssue = {
    reason: issue.reason,
    message: issue.message ?? defaultRemoteSyncIssueMessage(issue.reason),
    at: issue.at ?? Date.now(),
    severity: issue.severity ?? ISSUE_SEVERITY[issue.reason],
    ...(issue.counts ? { counts: issue.counts } : {}),
  };
  return { ...store, issues: { ...store.issues, [issue.reason]: entry } };
}

/** Clears the active issue for a reason code, if any. No-op otherwise. */
export function clearRemoteSyncIssue(
  store: RemoteSyncProgressStore,
  reason: RemoteSyncIssueReason,
): RemoteSyncProgressStore {
  if (!(reason in store.issues)) return store;
  const issues = { ...store.issues };
  delete issues[reason];
  return { ...store, issues };
}

function operationSummaries(store: RemoteSyncProgressStore): RemoteSyncOperationSummary[] {
  return Object.entries(store.operations)
    .map(([opId, record]) => ({ opId, ...record }))
    .sort((a, b) => a.startedAt - b.startedAt);
}

function issueList(store: RemoteSyncProgressStore): RemoteSyncIssue[] {
  return Object.values(store.issues)
    .filter((issue): issue is RemoteSyncIssue => issue !== undefined)
    .sort((a, b) => b.at - a.at);
}

/** Derives the single display snapshot from the current store + identity fields. Pure/synchronous. */
export function deriveRemoteSyncProgressSnapshot(
  store: RemoteSyncProgressStore,
  identity: RemoteSyncProgressIdentity,
  now: number = Date.now(),
): RemoteSyncProgressSnapshot {
  const operations = operationSummaries(store);
  const issues = issueList(store);
  const errorIssue = issues.find(issue => issue.severity === 'error');
  const warningIssue = issues.find(issue => issue.severity === 'warning');
  const activeKind = ACTIVE_KIND_PRIORITY.find(kind => operations.some(op => op.kind === kind));

  let state: RemoteSyncProgressState;
  let severity: RemoteSyncProgressSeverity;
  let label: string;
  let title: string;

  if (errorIssue) {
    state = 'error';
    severity = 'error';
    label = 'Sync error';
    title = errorIssue.message;
  } else if (activeKind) {
    state = activeKind;
    severity = 'active';
    label = ACTIVE_LABELS[activeKind];
    const driving = operations.find(op => op.kind === activeKind);
    title = driving?.phase ?? ACTIVE_TITLES[activeKind];
  } else if (warningIssue) {
    state = 'idle';
    severity = 'warning';
    label = 'Attention needed';
    title = warningIssue.message;
  } else {
    state = 'idle';
    severity = 'ok';
    label = 'Up to date';
    title = 'Sync is idle.';
  }

  return {
    state,
    severity,
    label,
    title,
    operations,
    issues,
    identity: { ...identity, scopeNote: REMOTE_SYNC_PROGRESS_SCOPE_NOTE },
    updatedAt: now,
  };
}

// --- Denominator persistence -------------------------------------------------
// Only totals/done/phase/kind/startedAt are persisted — never counts, tokens,
// or payloads — so a mid-drain reload can show remaining/total immediately,
// before any real operation has begun() in the fresh module instance.

const PROGRESS_PERSIST_SCHEMA_VERSION = 1;

export interface RemoteSyncProgressPersistedOperation {
  kind: RemoteSyncOperationKind;
  total: number;
  done: number;
  phase?: string;
  startedAt: number;
}

export interface RemoteSyncProgressPersisted {
  schemaVersion: number;
  operations: RemoteSyncProgressPersistedOperation[];
}

/** Serializes only the operations that have a known denominator (`total`). */
export function serializeRemoteSyncProgressStore(store: RemoteSyncProgressStore): string {
  const operations: RemoteSyncProgressPersistedOperation[] = Object.values(store.operations)
    .filter(op => typeof op.total === 'number')
    .map(op => ({
      kind: op.kind,
      total: op.total as number,
      done: op.done ?? 0,
      ...(op.phase ? { phase: op.phase } : {}),
      startedAt: op.startedAt,
    }));
  const persisted: RemoteSyncProgressPersisted = {
    schemaVersion: PROGRESS_PERSIST_SCHEMA_VERSION,
    operations,
  };
  return JSON.stringify(persisted);
}

function isValidPersistedOperation(value: unknown): value is RemoteSyncProgressPersistedOperation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.kind === 'string'
    && REMOTE_SYNC_OPERATION_KINDS.includes(candidate.kind as RemoteSyncOperationKind)
    && typeof candidate.total === 'number' && Number.isFinite(candidate.total)
    && typeof candidate.done === 'number' && Number.isFinite(candidate.done)
    && typeof candidate.startedAt === 'number' && Number.isFinite(candidate.startedAt)
    && (candidate.phase === undefined || typeof candidate.phase === 'string')
  );
}

/** Parses a persisted denominator blob (e.g. from sessionStorage). Never throws. */
export function restoreRemoteSyncProgressOperations(raw: string | null): RemoteSyncProgressPersistedOperation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<RemoteSyncProgressPersisted>;
    if (parsed.schemaVersion !== PROGRESS_PERSIST_SCHEMA_VERSION || !Array.isArray(parsed.operations)) return [];
    return parsed.operations.filter(isValidPersistedOperation);
  } catch {
    return [];
  }
}

/**
 * Seeds a store with persisted denominators as `restored: true` operation entries, keyed
 * so they never clobber a real (freshly begun) operation of the same kind.
 */
export function seedRemoteSyncProgressStoreFromPersisted(
  store: RemoteSyncProgressStore,
  persistedOperations: readonly RemoteSyncProgressPersistedOperation[],
): RemoteSyncProgressStore {
  let next = store;
  for (const persisted of persistedOperations) {
    const opId = `restored:${persisted.kind}`;
    if (next.operations[opId]) continue;
    next = {
      ...next,
      operations: {
        ...next.operations,
        [opId]: {
          kind: persisted.kind,
          startedAt: persisted.startedAt,
          total: persisted.total,
          done: persisted.done,
          ...(persisted.phase ? { phase: persisted.phase } : {}),
          counts: {},
          restored: true,
        },
      },
    };
  }
  return next;
}
