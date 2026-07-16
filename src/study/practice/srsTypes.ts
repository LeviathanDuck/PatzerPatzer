





















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







































export type SrsSourceVersion =
  /** Linked to an upstream source: always carries the snapshot revision revalidation compares. */
  | { readonly kind: 'linked'; readonly sourceRevision: number }
  /**
   * Unlinked source: no upstream revision exists. Covers every no-revision linkage state the contract
   * permits — manual PGN import (§4.4), snapshot import (§4.4), and post-import Unlink from source
   * (§14.4). `origin` is an optional provenance note recording HOW the material became unlinked; it is
   * never a linkage discriminant and never by itself implies a revision.
   */
  | {
      readonly kind: 'unlinked';
      readonly origin?: 'manual' | 'snapshot-import' | 'unlinked-from-source';
    };

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
  /** Discriminated source versioning captured at attempt time (required — finding B1F1-MEDIUM). A
   *  `linked` source carries its snapshot revision; an `unlinked` source is explicitly unversioned. */
  readonly source: SrsSourceVersion;
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
  /** Hard cap on the TOTAL returned candidates — due-now targets AND explicit early reviews together
   *  (bounded/indexed reads only — never getAll()). Under pressure the allocation is due-precedence:
   *  genuinely due-now targets fill the cap first (in stable base order), and explicit early reviews
   *  fill only the slots that remain. The count of returned candidates therefore never exceeds `limit`. */
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
 * Revalidation-capable (finding B1-2): it carries `targetRevision` and a required discriminated
 * `source` versioning field (finding B1F1-MEDIUM) so a persisted plan can be compared against the
 * live record/source after Study edits — a divergence means the decision was replaced (P2-ORP-17) or
 * the source material changed, and the entry is stale.
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
  /** Discriminated source-material versioning captured at freeze time (required — finding
   *  B1F1-MEDIUM). A `linked` source carries the snapshot revision revalidation compares against the
   *  live source after Study edits; an `unlinked` source is explicitly unversioned. Being required (not
   *  an optional `sourceRevision?`) is what makes an omitted revision on a persisted plan a compile
   *  error, while the `unlinked` variant keeps an intentionally unversioned source expressible. */
  readonly source: SrsSourceVersion;
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











export interface SrsContextEntry {
  readonly targetId: string;
  readonly lessonId: string;
  readonly frozenSource: SrsDisplaySnapshot;
  readonly scheduleNeutral: true;
}








export interface SrsRepairEntry {
  readonly targetId: string;
  readonly lessonId: string;
  readonly frozenSource: SrsDisplaySnapshot;
  readonly scheduleNeutral: true;
  readonly failedMoveKeys?: readonly string[];
}

















export interface SrsTraversalPlan {


  readonly planVersion: 1;
  readonly sessionId: string;
  readonly traversalId: string;
  readonly createdAt: number;
  /** Scored due targets — the ONLY entries whose completion mutates a schedule. */
  readonly entries: readonly SrsTraversalPlanEntry[];
  /** Schedule-neutral lead-in context; never scored. Required (empty array when none) — see doc. */
  readonly context: readonly SrsContextEntry[];
  /** Schedule-neutral missed-context repair list; never scored. Required (empty array when none). */
  readonly repair: readonly SrsRepairEntry[];
}

// --- Contract 6: Durable session row (persistence-backed) -----------------

/**
 * Lifecycle state of a durable practice session row. Indexed field (`study-practice-sessions.state`,
 * §14.1). The three states cover the Hardened Contract's resumability model:
 *   - `active`    — the traversal is in progress and driving recall.
 *   - `partial`   — the session was interrupted; it remains resumable (Hardened Contract §attempt
 *     behavior: "Interrupted sessions become Partial and resumable").
 *   - `completed` — every scored target in the plan has a persisted completion; the session is done.
 */
export type SrsSessionState = 'active' | 'partial' | 'completed';

/**
 * The progress cursor and completed-target state persisted with a session row. This is what lets B4b
 * update a resumable checkpoint IN THE SAME transaction as the attempt + SRS writes: on each scored
 * completion B4b advances `entryCursor`, appends the scored `targetId` to `completedTargetIds`, and
 * records the applied `attemptId` in `appliedAttemptIds`, then re-puts the session row.
 *
 * `appliedAttemptIds` is the session-level idempotency ledger: replaying an already-applied
 * `attemptId` is a no-op checkpoint update, complementing the SRS row's own `lastAttemptId` and the
 * store-level insert-existing-key idempotency the atomic boundary (B4b) ultimately enforces.
 */
export interface SrsSessionProgress {
  /** Index into `plan.entries` of the next unattempted scored target (0-based). */
  readonly entryCursor: number;
  /** Scored target IDs completed in this session (completed-target state). Append-only within a
   *  session; never a scoring authority (that is the append-only attempt row). */
  readonly completedTargetIds: readonly string[];
  /** Attempt IDs already applied to a schedule in this session — the session-level idempotency ledger. */
  readonly appliedAttemptIds: readonly string[];
}






























































export interface SrsPracticeSessionRow {
  /** Primary key; caller-generated UUID (never derived from chess material). */
  readonly sessionId: string;
  /** Owning lesson scope — indexed (`study-practice-sessions.lessonId`). */
  readonly lessonId: string;
  /** Lifecycle state — indexed (`study-practice-sessions.state`). */
  readonly state: SrsSessionState;
  /** Last mutation instant, UTC epoch ms — indexed (`study-practice-sessions.updatedAt`). */
  readonly updatedAt: number;
  /** Creation instant, UTC epoch ms. */
  readonly createdAt: number;
  /** Progress cursor + completed-target state (see `SrsSessionProgress`). */
  readonly progress: SrsSessionProgress;
  /** Total scored targets in the plan (`plan.entries.length`); the completed-target target. */
  readonly targetCount: number;
  /** Embedded frozen traversal plan — makes a Partial session resumable from this single row. */
  readonly plan: SrsTraversalPlan;
}

// --- Contract 7: Persistence-boundary validation result -------------------

/**
 * Discriminated failure code for a rejected persisted row/plan at the B4 read boundary. Deserialized
 * IndexedDB values are UNTRUSTED (they can be corrupt on disk, predate a field, or carry an
 * unrecognized schema); the boundary reports one of these codes as a TYPED rejection rather than
 * throwing a raw error (closes recorded B4 residual (d)).
 */
export type SrsPersistenceFailureCode =
  /** Top-level value (or a nested list/entry that must be an object) is null / not an object. */
  | 'not-an-object'
  /** A field that must be an array (`entries`/`context`/`repair`/`completedTargetIds`/…) is not. */
  | 'not-an-array'
  /** `planVersion` is absent, or present but not a recognized/normalizable version (never coerced). */
  | 'unrecognized-plan-version'
  /** A required identity/display string (`sessionId`/`targetId`/`lessonId`/`label`/…) is missing/empty. */
  | 'missing-required-string'
  /** A `status`/`state` field carries a value outside its closed set. */
  | 'invalid-status'
  /** A numeric field is absent or non-finite (`NaN`/`±Infinity`) — fail closed. */
  | 'non-finite-number'
  /** A `targetId` appears more than once across `entries` ∪ `context` ∪ `repair` (cross-list identity),
   *  or a completed-target / applied-attempt id is duplicated in a session checkpoint. */
  | 'duplicate-identity'
  /** A discriminated source union carries an unknown/malformed `kind`. */
  | 'invalid-source-discriminant'
  /** Two identity fields that MUST agree do not — e.g. a scored entry's `targetId`/`lessonId` diverges
   *  from its own frozen schedule snapshot, or a session row's `sessionId`/`lessonId` diverges from its
   *  embedded plan. A persisted plan/session is coherent only when these cross-snapshot ids match. */
  | 'identity-mismatch'
  /** A session checkpoint invariant is violated (see the normative invariant list on
   *  `SrsPracticeSessionRow`): bad `targetCount`, out-of-range/non-integer cursor, unknown completed
   *  target, or a `completed` state with no full completion. The checkpoint is not a safe resume point. */
  | 'checkpoint-invariant'
  /** A validated object carries an own key outside its declared contract — smuggled chess material
   *  (`fen`/`pgn`/…) or an own `__proto__` payload. Persisted rows are closed records: undeclared own
   *  keys are rejected, never silently preserved. */
  | 'unknown-key'
  /** The persisted plan passed local shape validation but the sealed B3 `revalidateTraversalPlan`
   *  (composed at this boundary against a live map derived from the plan's own frozen snapshots) still
   *  reported one or more invalid entries — the plan is not accepted unless B3 revalidation is clean. */
  | 'plan-revalidation-failed';

/**
 * A typed persistence-boundary failure. `path` is a dotted locator into the offending row (e.g.
 * `plan.entries[2].frozenSchedule.dueAt`) for diagnostics; `reason` is a human-readable description.
 */
export interface SrsPersistenceFailure {
  readonly code: SrsPersistenceFailureCode;
  readonly path: string;
  readonly reason: string;
}

/**
 * The result of validating an untrusted deserialized row/plan at the B4 read boundary. Success
 * carries the fully validated, correctly typed value; failure carries a typed `SrsPersistenceFailure`
 * — the boundary NEVER throws a raw error for malformed persisted data (recorded B4 residual (d)).
 */
export type SrsPersistenceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: SrsPersistenceFailure };

// Contracts ONLY — this module now contains no runtime values (finding B1-5). The compile-time
// contract fixtures (positive inhabitability, negative chess-material rejection, the opaque-brand
// forgery proof, the widened-`fen` boundary proof, and the active-implies-`dueAt` snapshot proof)
// live in the co-located typecheck-and-run test file `./__tests__/scheduler.test.ts`, so a future
// runtime import of this file executes zero fixture initialization. Every type above is erased at
// build time (`src/study/types.ts` re-exports them with `export type`).
