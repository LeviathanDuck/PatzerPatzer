





















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
  /** The idempotency key of the last attempt applied to this row (`SrsAttemptRecord.attemptId`), or
   *  null before the first applied completion. This is the pure kernel's in-record duplicate signal:
   *  replaying the SAME `attemptId` is a non-mutating no-op regardless of its completion timestamp,
   *  while a DISTINCT attempt at the same millisecond still applies. Completion time is scheduling
   *  data, never identity. The atomic persistence boundary (B4b, insert-existing-attemptId cannot
   *  re-advance) remains the ultimate idempotency boundary; this field lets the pure kernel honor the
   *  key it is handed without persistence. */
  readonly lastAttemptId: string | null;
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
  /** Active-only invariant: an attempt is only ever scored against an active due/early target
   *  (only `status === 'active'` rows are surfaced for recall), so the frozen scheduled due instant
   *  is always concrete — never null. This mirrors `SrsActiveScheduleRecord.dueAt` structurally. */
  readonly dueAt: number;
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
  /** Graduation-threshold fallback: the consecutive-clean count that graduates the target when no
   *  explicit `graduation` policy is set. An explicit `graduation.afterConsecutiveClean` always wins
   *  (see `graduationThreshold` in ./scheduler); the optional puzzle adapter pairs both at the same
   *  value. Undefined = this field never graduates the target. It does NOT gate ladder advancement —
   *  a clean result always advances by `advanceBy`. */
  readonly requiredConsecutiveClean?: number;
  /** Optional terminal graduation behavior. */
  readonly graduation?: SrsGraduationPolicy;
  /** Optional display grouping metadata over this one engine. */
  readonly presentationGroups?: readonly SrsPresentationGroup[];
}

/**
 * Opaque validation brand. The symbol is deliberately NOT exported, so no other module — including
 * tests — can name this key to fabricate a "validated" config with a property literal. The SOLE
 * constructor of `SrsValidatedLadderConfig` is `validateLadderConfig` in `./scheduler` (memo §2
 * assigns pure configuration validation to that file), which stamps this phantom brand via an
 * internal assertion. The brand is compile-time only: it has no runtime footprint.
 */
declare const srsValidatedBrand: unique symbol;

/**
 * A ladder configuration proven well-formed by B2's validator (ordered positive intervals, in-range
 * reset step, etc.). The opaque `unique symbol` brand expresses the "validate before scheduling"
 * contract in the type system: the branded type is unforgeable because the brand key is unnameable
 * outside this module, so the only way to obtain a value is through `validateLadderConfig`.
 */
export type SrsValidatedLadderConfig = SrsLadderConfig & { readonly [srsValidatedBrand]: true };

/**
 * Compile-time exact-shape guard. `SrsExact<Shape, V>` accepts a value assignable to `Shape` but
 * rejects any object carrying keys beyond `Shape` (e.g. chess material like `fen`/`pgn` smuggled onto
 * a persisted SRS row). Excess-property checks only fire on fresh object literals; this closes the
 * widened-object hole where a variable of a wider type assigns to a contract with zero diagnostics.
 * Used by the persistence-facing closed-record guards in `./scheduler`.
 */
export type SrsExact<Shape, V extends Shape> = V & { readonly [K in Exclude<keyof V, keyof Shape>]: never };

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
 *
 * Revalidation-capable (finding B1-2): it carries `targetRevision` and a compact `sourceRevision` so
 * a persisted plan can be compared against the live record/source after Study edits — a divergence
 * means the decision was replaced (P2-ORP-17) or the source material changed, and the entry is stale.
 *
 * Active-only invariant (finding B1-3): the snapshot is only ever frozen for an active due candidate.
 * The due query is `status === 'active' && dueAt <= now`; explicit early reviews are still active with
 * a future `dueAt`. There is therefore no legitimate `{ status: 'active', dueAt: null }` snapshot, and
 * non-active statuses are never surfaced as due — so the frozen state is pinned to active with a
 * concrete due instant. (Divergence from the live record shape, where non-active rows may be null, is
 * intentional: the record models all lifecycle states; a frozen due candidate models exactly one.)
 */
export interface SrsFrozenScheduleSnapshot {
  readonly targetId: string;
  readonly lessonId: string;
  /** Source/identity revision the snapshot was frozen against (mirrors the live record's
   *  `targetRevision`). Revalidation compares this to the current record's revision to detect a
   *  replaced decision (P2-ORP-17). */
  readonly targetRevision: number;
  readonly scheduleRevision: number;
  readonly configId: string;
  readonly configVersion: number;
  readonly stepIndex: number;
  /** Pinned to `'active'`: only active targets are surfaced as due candidates (see the type doc). */
  readonly status: 'active';
  /** Next due instant, UTC epoch ms. Non-null because the snapshot is active-only. */
  readonly dueAt: number;
  /** Compact source-material revision captured at freeze time, when the source is versioned. Lets a
   *  plan be revalidated against the live source revision after Study edits. Optional: not every
   *  source (e.g. manual) carries a revision. */
  readonly sourceRevision?: number;
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

/**
 * One planned target within a traversal — identity, review kind, and BOTH frozen snapshots the memo
 * requires ("Session plans persist their source/schedule snapshots and are revalidated after Study
 * changes"): the schedule-side snapshot (revisions + active due state) and a separate source-side
 * snapshot (compact source label/lineage/revision). Persisting both lets an interrupted plan be
 * revalidated against the live schedule row AND the live source material after Study edits.
 */
export interface SrsTraversalPlanEntry {
  readonly targetId: string;
  readonly lessonId: string;
  readonly reviewKind: SrsReviewKind;
  /** Frozen schedule-side snapshot (schedule/target revisions + active due state at plan time). */
  readonly frozenSchedule: SrsFrozenScheduleSnapshot;
  /** Frozen source-side snapshot (compact source label/lineage/revision at plan time). */
  readonly frozenSource: SrsDisplaySnapshot;
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

// Contracts ONLY — this module now contains no runtime values (finding B1-5). The compile-time
// contract fixtures (positive inhabitability, negative chess-material rejection, the opaque-brand
// forgery proof, the widened-`fen` boundary proof, and the active-implies-`dueAt` snapshot proof)
// live in the co-located typecheck-and-run test file `./__tests__/scheduler.test.ts`, so a future
// runtime import of this file executes zero fixture initialization. Every type above is erased at
// build time (`src/study/types.ts` re-exports them with `export type`).
