





















// --- Enumerations ---------------------------------------------------------

/**
 * Lifecycle status of a schedule row. `active` targets participate in due queries; the three
 * non-active statuses are the only states in which `dueAt` may be null. Deletion is represented by
 * the durable tombstone layer, not by a status here.
 */
export type SrsScheduleStatus = 'active' | 'graduated' | 'suspended' | 'archived';

/**
 * How a due target was surfaced for the attempt. `due` = the schedule was due at plan time;
 * `early` = an explicit early/force review of a not-yet-due target. `forceAddedAt` is provenance
 * only and never by itself makes a target due — see P2-ORP register entry on interval settings.
 */
export type SrsReviewKind = 'due' | 'early';

/**
 * The immutable first-attempt outcome of a scored due target (P2-ORP-16: first-attempt truth is
 * immutable through repair). Assistance counts as `failed` (P2-ORP-10). A later clean repair is
 * appended as repair history and never rescores this value.
 */
export type SrsFirstAttemptResult = 'clean' | 'failed';

/**
 * Traversal/session mode label carried on an attempt for analytics. Domain-neutral: adapters define
 * their own mode vocabulary (e.g. an ORP due traversal); the kernel treats it as an opaque string.
 */
export type SrsTraversalMode = string;

/**
 * Assistance category applied during a recall (hint, peek, engine help, …). Domain-neutral: the
 * adapter owns the vocabulary. Presence of any assistance makes the attempt `failed` (P2-ORP-10),
 * but that grading decision lives in the adapter, not in these types.
 */
export type SrsAssistanceType = string;

// --- Contract 1: Schedule record (current transition state only) ----------

/**
 * Fields common to every schedule row regardless of status. Contains ONLY current transition
 * state — no PGN, FEN, expected moves, prompts, assistance history, or traversal material (those
 * live in attempts and sessions per the Hardened Contract record split).
 */
export interface SrsScheduleRecordBase {
  /** Stable domain-supplied UUID. For ORP this is the Required-decision `decisionId`. Never derived
   *  from chess material (FEN/SAN/move/line hash) — transposed authored paths stay distinct. */
  readonly targetId: string;
  /** Query/scope foreign key to the owning lesson. Not canonical lesson material. */
  readonly lessonId: string;
  /** Identity/source revision the scheduled row expects; append-only replaced-decision history
   *  advances this (P2-ORP-17). A target/source revision mismatch yields a non-mutating transition. */
  readonly targetRevision: number;
  /** Monotonic local/CAS revision, checked against attempt snapshots to detect stale transitions. */
  readonly scheduleRevision: number;
  /** Configuration applied at the last scheduling event. */
  readonly configId: string;
  readonly configVersion: number;
  /** Current ladder position (index into the config's `intervalsMs`). */
  readonly stepIndex: number;
  /** Generic consecutive-clean counter; zero for configurations that do not use graduation. */
  readonly cleanStreak: number;
  /** Enrollment timestamp (UTC epoch ms). Enrollment creates the initial row; "no row" is never due. */
  readonly enrolledAt: number;
  /** Last completed scored attempt (UTC epoch ms), or null before the first completion. */
  readonly lastCompletedAt: number | null;
  /** Last mutation timestamp (UTC epoch ms). */
  readonly updatedAt: number;
}

/** Active schedule row — always carries a concrete `dueAt`. */
export interface SrsActiveScheduleRecord extends SrsScheduleRecordBase {
  readonly status: 'active';
  /** Next due instant, UTC epoch ms. Non-null for active rows. */
  readonly dueAt: number;
}

/** Non-active schedule row — `dueAt` may be null (graduated/suspended/archived only). */
export interface SrsInactiveScheduleRecord extends SrsScheduleRecordBase {
  readonly status: 'graduated' | 'suspended' | 'archived';
  /** Nullable ONLY for non-active statuses (edge case expressed in the type). */
  readonly dueAt: number | null;
}

/**
 * A single target's current scheduling state. Discriminated on `status` so that the nullable-`dueAt`
 * edge case is enforced structurally: active rows always have a concrete `dueAt`.
 */
export type SrsScheduleRecord = SrsActiveScheduleRecord | SrsInactiveScheduleRecord;

// --- Contract 2: Immutable attempt record ---------------------------------

/**
 * The scheduled snapshot frozen onto an attempt at completion time. Lets stale/duplicate detection
 * compare an attempt against the current schedule row.
 */
export interface SrsScheduledSnapshot {
  readonly scheduleRevision: number;
  readonly configVersion: number;
  readonly stepIndex: number;
  readonly dueAt: number | null;
}

/**
 * Compact immutable display/source snapshot — sufficient to explain archived history after the
 * originating lesson material is gone. Deliberately NOT chess material: a human-readable label and
 * source lineage only, never FEN/SAN/expected-move/PGN fields.
 */
export interface SrsDisplaySnapshot {
  /** Human-readable target label captured at attempt time (free text, not structured chess data). */
  readonly label: string;
  /** Source/lesson label captured at attempt time. */
  readonly sourceLabel?: string;
  /** Source revision captured at attempt time. */
  readonly sourceRevision?: number;
}

/**
 * Immutable append-only observation of one completed, scored due target. Retries get new
 * `attemptId`s; repair never mutates a prior attempt. This is the exact idempotent completed-target
 * result the Study-owned kernel accepts (Attempt boundary, Hardened Contract): target identity,
 * session/traversal identity, scheduled snapshot/version, completion time, first-attempt result,
 * assistance types, and failed move keys.
 */
export interface SrsAttemptRecord {
  /** UUID; also the idempotency key — inserting an existing `attemptId` cannot re-advance the SRS. */
  readonly attemptId: string;
  readonly targetId: string;
  readonly lessonId: string;
  readonly targetRevision: number;
  readonly sessionId: string;
  readonly traversalId: string;
  readonly mode: SrsTraversalMode;
  /** Snapshot of the schedule row this attempt was taken against. */
  readonly scheduled: SrsScheduledSnapshot;
  /** Completion instant, UTC epoch ms — the ONLY scheduling clock (the kernel never reads Date.now). */
  readonly completedAt: number;
  readonly reviewKind: SrsReviewKind;
  /** Immutable first-attempt truth (P2-ORP-16). */
  readonly firstAttemptResult: SrsFirstAttemptResult;
  readonly assistanceTypes: readonly SrsAssistanceType[];
  readonly failedMoveKeys: readonly string[];
  /** Provenance/analytics only (P2-ORP): records that the target was force-added; not an eligibility flag. */
  readonly forceAddedAt?: number;
  readonly snapshot: SrsDisplaySnapshot;
}

/**
 * The completed-target result the pure transition function consumes. It is exactly the immutable
 * attempt payload (same shape, same idempotency key) — an alias that names the kernel-input role.
 */
export type SrsCompletedTargetResult = SrsAttemptRecord;

// --- Contract 3: Ladder configuration -------------------------------------

/**
 * Presentation grouping (e.g. Acquisition / Maintenance) — display labels over ONE scheduling
 * engine, mapping to a set of ladder steps. Never a separate engine or a record phase; changing a
 * group's presentation never changes the algorithm or persisted mastery identity.
 */
export interface SrsPresentationGroup {
  readonly id: string;
  readonly label: string;
  /** Ladder step indexes that display under this group. */
  readonly stepIndexes: readonly number[];
}

/** Optional terminal graduation policy — reaching the threshold graduates the target and clears `dueAt`. */
export interface SrsGraduationPolicy {
  /** Consecutive clean results required to graduate (e.g. 3 for the optional puzzle adapter). */
  readonly afterConsecutiveClean: number;
}

/**
 * Ordered interval ladder and its transition parameters. This holds all product semantics
 * (interval schedule, reset target, advance amount, optional graduation) so the transition
 * algorithm stays parameter-driven. ORP omits graduation (repeats at the last step); the optional
 * puzzle adapter supplies `requiredConsecutiveClean`/`graduation`.
 */
export interface SrsLadderConfig {
  readonly configId: string;
  readonly configVersion: number;
  /** Ordered, strictly positive interval durations in ms (validated in B2). */
  readonly intervalsMs: readonly number[];
  /** Step a failed/assisted result resets to (typically 0). */
  readonly resetStep: number;
  /** Steps advanced per clean result (typically 1). */
  readonly advanceBy: number;
  /** Consecutive clean results required before a clean result advances (undefined = advance every clean). */
  readonly requiredConsecutiveClean?: number;
  /** Optional terminal graduation behavior. */
  readonly graduation?: SrsGraduationPolicy;
  /** Optional display grouping metadata over this one engine. */
  readonly presentationGroups?: readonly SrsPresentationGroup[];
}

/**
 * A ladder configuration proven well-formed by B2's validator (ordered positive intervals, in-range
 * reset step, etc.). The brand expresses the "validate before scheduling" contract without any
 * runtime here; only the validator produces this type.
 */
export type SrsValidatedLadderConfig = SrsLadderConfig & { readonly __srsValidated: true };

// --- Contract 4: Transition result union ----------------------------------

/**
 * Outcome of a pure schedule transition. Exactly one outcome mutates state: `applied` carries the
 * next schedule record; every other outcome is non-mutating (stale revision, archived/inactive
 * target, duplicate attempt, or invalid input all leave the row untouched).
 */
export type SrsTransitionOutcome = 'applied' | 'duplicate' | 'stale' | 'inactive' | 'invalid';

export interface SrsTransitionApplied {
  readonly outcome: 'applied';
  readonly next: SrsScheduleRecord;
}
export interface SrsTransitionDuplicate {
  readonly outcome: 'duplicate';
  readonly reason?: string;
}
export interface SrsTransitionStale {
  readonly outcome: 'stale';
  readonly reason?: string;
}
export interface SrsTransitionInactive {
  readonly outcome: 'inactive';
  readonly reason?: string;
}
export interface SrsTransitionInvalid {
  readonly outcome: 'invalid';
  readonly reason: string;
}

export type SrsTransitionResult =
  | SrsTransitionApplied
  | SrsTransitionDuplicate
  | SrsTransitionStale
  | SrsTransitionInactive
  | SrsTransitionInvalid;

/**
 * Pure transition function contract (implemented in B2). Takes the current record, a completed
 * result, and a validated config; returns a transition result. Must not call Date.now — the only
 * scheduling clock is `completed.completedAt`.
 */
export type SrsTransitionFn = (
  current: SrsScheduleRecord,
  completed: SrsCompletedTargetResult,
  config: SrsValidatedLadderConfig,
) => SrsTransitionResult;

// --- Contract 5: Due-target and traversal-plan contracts ------------------

/**
 * Due-query input. Explicit `now` (the kernel never reads the wall clock), the active scopes to
 * query, an optional target-id filter, a hard result limit, and any explicit early-review targets.
 */
export interface SrsDueQuery {
  /** Query instant, UTC epoch ms. Due boundary equality is `dueAt <= now`. */
  readonly now: number;
  /** Active lesson scopes to query (foreign keys). */
  readonly scopeLessonIds: readonly string[];
  /** Optional explicit target-id filter within scope. */
  readonly targetIds?: readonly string[];
  /** Hard cap on returned candidates (bounded/indexed reads only — never getAll()). */
  readonly limit: number;
  /** Optional not-yet-due targets explicitly selected for early review. */
  readonly earlyReviewTargetIds?: readonly string[];
}

/** Lightweight reference to the presentation group a due target currently displays under. */
export interface SrsPresentationGroupRef {
  readonly id: string;
  readonly label: string;
}

/**
 * Frozen schedule snapshot persisted with a due candidate and a session/traversal plan. Revalidated
 * after Study changes; it is a point-in-time copy, never a live view of the schedule row.
 */
export interface SrsFrozenScheduleSnapshot {
  readonly targetId: string;
  readonly lessonId: string;
  readonly scheduleRevision: number;
  readonly configId: string;
  readonly configVersion: number;
  readonly stepIndex: number;
  readonly dueAt: number | null;
  readonly status: SrsScheduleStatus;
  /** When this snapshot was frozen, UTC epoch ms. */
  readonly capturedAt: number;
}

/**
 * Ranking inputs surfaced with a due candidate. The kernel supplies the neutral, computable inputs;
 * domain-supplied inputs (importance, path cost) are optional pass-throughs. ORP session planning
 * applies the ratified richer ranking on top of the stable `dueAt`,`targetId` base ordering.
 */
export interface SrsDuePriorityInputs {
  readonly overdueMs: number;
  readonly dueNow: boolean;
  readonly recentFailureCount: number;
  readonly recentResetCount: number;
  /** First-attempt clean rate in [0,1], when known. */
  readonly firstAttemptCleanRate?: number;
  /** Domain-supplied importance weight. */
  readonly importance?: number;
  /** Domain-supplied path/traversal cost. */
  readonly pathCost?: number;
}

/**
 * An immutable due-target candidate returned by the due query. Carries identity, a frozen schedule
 * snapshot, overdue duration, current step/group, and priority inputs — but NO PGN/tree material.
 * The ORP adapter joins this to decision material to build a traversal.
 */
export interface SrsDueTarget {
  readonly targetId: string;
  readonly lessonId: string;
  readonly frozenSchedule: SrsFrozenScheduleSnapshot;
  /** How long past due, ms (0 when surfaced as an explicit early review). */
  readonly overdueMs: number;
  readonly stepIndex: number;
  readonly group?: SrsPresentationGroupRef;
  readonly reviewKind?: SrsReviewKind;
  readonly priority: SrsDuePriorityInputs;
}

/** One planned target within a traversal — identity, review kind, and its frozen schedule snapshot. */
export interface SrsTraversalPlanEntry {
  readonly targetId: string;
  readonly lessonId: string;
  readonly reviewKind: SrsReviewKind;
  readonly frozenSchedule: SrsFrozenScheduleSnapshot;
}

/**
 * A frozen traversal plan for a session. Persists its source/schedule snapshots so it can be
 * revalidated after Study changes; interrupted sessions become Partial and resumable.
 */
export interface SrsTraversalPlan {
  readonly sessionId: string;
  readonly traversalId: string;
  readonly createdAt: number;
  readonly entries: readonly SrsTraversalPlanEntry[];
}

// ===========================================================================
// Compile-time contract fixtures (type-level RED/GREEN + negative proofs).
//
// These fixtures live in this file to hold slice B1 to its two-file budget (no separate __tests__
// fixture, matching the repo's absence of any .typecheck.ts / @ts-expect-error convention). They are
// type-only: this module is re-exported from src/study/types.ts with `export type`, so it is erased
// at build time and never bundled. The positive fixtures prove each required contract is inhabitable;
// the @ts-expect-error negatives prove the records reject chess-material fields — each directive must
// suppress a real excess-property error or tsc fails with "Unused '@ts-expect-error' directive".
// ===========================================================================

// Positive fixtures — a fully-populated value of each required contract must be assignable.
const _scheduleActiveFixture: SrsScheduleRecord = {
  targetId: 'tgt-uuid-1',
  lessonId: 'lesson-1',
  targetRevision: 1,
  status: 'active',
  scheduleRevision: 1,
  configId: 'orp-default',
  configVersion: 1,
  stepIndex: 0,
  cleanStreak: 0,
  dueAt: 1_700_000_000_000,
  enrolledAt: 1_699_000_000_000,
  lastCompletedAt: null,
  updatedAt: 1_699_000_000_000,
};

const _scheduleGraduatedFixture: SrsScheduleRecord = {
  targetId: 'tgt-uuid-2',
  lessonId: 'lesson-1',
  targetRevision: 1,
  status: 'graduated',
  scheduleRevision: 4,
  configId: 'puzzle-default',
  configVersion: 1,
  stepIndex: 2,
  cleanStreak: 3,
  dueAt: null,
  enrolledAt: 1_699_000_000_000,
  lastCompletedAt: 1_699_500_000_000,
  updatedAt: 1_699_500_000_000,
};

const _attemptFixture: SrsAttemptRecord = {
  attemptId: 'att-uuid-1',
  targetId: 'tgt-uuid-1',
  lessonId: 'lesson-1',
  targetRevision: 1,
  sessionId: 'sess-1',
  traversalId: 'trav-1',
  mode: 'orp-due',
  scheduled: { scheduleRevision: 1, configVersion: 1, stepIndex: 0, dueAt: 1_700_000_000_000 },
  completedAt: 1_700_000_100_000,
  reviewKind: 'due',
  firstAttemptResult: 'clean',
  assistanceTypes: [],
  failedMoveKeys: [],
  snapshot: { label: 'Najdorf mainline continuation', sourceLabel: 'My Sicilian repertoire', sourceRevision: 1 },
};

const _completedResultFixture: SrsCompletedTargetResult = _attemptFixture;

const _ladderFixture: SrsLadderConfig = {
  configId: 'orp-default',
  configVersion: 1,
  intervalsMs: [14_400_000, 86_400_000, 259_200_000, 604_800_000, 1_209_600_000, 2_592_000_000, 7_776_000_000, 15_552_000_000],
  resetStep: 0,
  advanceBy: 1,
  presentationGroups: [
    { id: 'acquisition', label: 'Acquisition', stepIndexes: [0, 1, 2, 3, 4] },
    { id: 'maintenance', label: 'Maintenance', stepIndexes: [5, 6, 7] },
  ],
};

const _puzzleLadderFixture: SrsLadderConfig = {
  configId: 'puzzle-default',
  configVersion: 1,
  intervalsMs: [604_800_000, 1_209_600_000, 2_419_200_000],
  resetStep: 0,
  advanceBy: 1,
  requiredConsecutiveClean: 3,
  graduation: { afterConsecutiveClean: 3 },
};

const _validatedLadderFixture: SrsValidatedLadderConfig = { ..._ladderFixture, __srsValidated: true };

const _transitionApplied: SrsTransitionResult = { outcome: 'applied', next: _scheduleActiveFixture };
const _transitionDuplicate: SrsTransitionResult = { outcome: 'duplicate' };
const _transitionStale: SrsTransitionResult = { outcome: 'stale', reason: 'schedule revision advanced' };
const _transitionInactive: SrsTransitionResult = { outcome: 'inactive' };
const _transitionInvalid: SrsTransitionResult = { outcome: 'invalid', reason: 'non-finite completedAt' };

const _transitionFn: SrsTransitionFn = (_current, _completed, _config) => ({ outcome: 'invalid', reason: 'fixture only' });

const _dueQueryFixture: SrsDueQuery = {
  now: 1_700_000_000_000,
  scopeLessonIds: ['lesson-1'],
  limit: 50,
};

const _dueTargetFixture: SrsDueTarget = {
  targetId: 'tgt-uuid-1',
  lessonId: 'lesson-1',
  frozenSchedule: {
    targetId: 'tgt-uuid-1',
    lessonId: 'lesson-1',
    scheduleRevision: 1,
    configId: 'orp-default',
    configVersion: 1,
    stepIndex: 3,
    dueAt: 1_699_900_000_000,
    status: 'active',
    capturedAt: 1_700_000_000_000,
  },
  overdueMs: 100_000_000,
  stepIndex: 3,
  group: { id: 'acquisition', label: 'Acquisition' },
  priority: {
    overdueMs: 100_000_000,
    dueNow: true,
    recentFailureCount: 0,
    recentResetCount: 0,
  },
};

const _traversalPlanFixture: SrsTraversalPlan = {
  sessionId: 'sess-1',
  traversalId: 'trav-1',
  createdAt: 1_700_000_000_000,
  entries: [
    {
      targetId: 'tgt-uuid-1',
      lessonId: 'lesson-1',
      reviewKind: 'due',
      frozenSchedule: {
        targetId: 'tgt-uuid-1',
        lessonId: 'lesson-1',
        scheduleRevision: 1,
        configId: 'orp-default',
        configVersion: 1,
        stepIndex: 3,
        dueAt: 1_699_900_000_000,
        status: 'active',
        capturedAt: 1_700_000_000_000,
      },
    },
  ],
};

// Negative fixtures — the records must REJECT chess-material fields (identity is a domain UUID,
// not chess material; P2-ORP-12). Each @ts-expect-error must suppress a real excess-property error.
// @ts-expect-error — SrsScheduleRecord must not accept a FEN field.
const _scheduleRejectsFen: SrsScheduleRecord = { ..._scheduleActiveFixture, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };
// @ts-expect-error — SrsScheduleRecord must not accept an expected-move field.
const _scheduleRejectsMove: SrsScheduleRecord = { ..._scheduleActiveFixture, expectedMove: 'Nf3' };
// @ts-expect-error — the immutable attempt record must not embed PGN material.
const _attemptRejectsPgn: SrsAttemptRecord = { ..._attemptFixture, pgn: '1. e4 c5 2. Nf3' };

void _scheduleGraduatedFixture; void _completedResultFixture; void _puzzleLadderFixture;
void _validatedLadderFixture; void _transitionApplied; void _transitionDuplicate;
void _transitionStale; void _transitionInactive; void _transitionInvalid; void _transitionFn;
void _dueQueryFixture; void _dueTargetFixture; void _traversalPlanFixture;
void _scheduleRejectsFen; void _scheduleRejectsMove; void _attemptRejectsPgn;
