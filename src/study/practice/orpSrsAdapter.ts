







































import type { GradeOutcome } from './grader';
import { isSrsEnrollable, type LessonDecision } from './material';
import { transitionSchedule } from './scheduler';
import type {
  SrsAttemptRecord,
  SrsDisplaySnapshot,
  SrsReviewKind,
  SrsScheduleRecord,
  SrsTransitionResult,
  SrsTraversalMode,
  SrsValidatedLadderConfig,
} from './srsTypes';

/**
 * Input to the ORP→SRS adapter. It carries the D7 completed per-decision domain outcome PLUS the
 * scheduling context the pure grader cannot know:
 *   - `decision` — the `LessonDecision` the outcome pertains to (`outcome.decisionId`), for the
 *     defensive Required re-check and identity coherence.
 *   - `cuedDecisionId` — the decision the step actually CUED (`step.target.identity.decisionId`),
 *     used only for the F-1 played==cued clean guard.
 *   - `current` — the CURRENT active schedule row for that target; its revisions/step/dueAt freeze
 *     the attempt's scheduled snapshot so the kernel applies (not stale) a just-completed recall.
 *   - `config` — the already-validated Package B ladder config the caller (D10) supplies. The
 *     adapter neither validates nor reads config math; it only hands it to `transitionSchedule`.
 *   - session/traversal identity, the completion clock, review kind, display snapshot, and the
 *     injected minted `attemptId` (never derived here — append-only, one attempt per completion).
 */
export interface OrpSrsAdapterInput {
  readonly outcome: GradeOutcome;
  readonly decision: LessonDecision;
  /** The decision the step cued (`step.target.identity.decisionId`); F-1 played==cued clean guard. */
  readonly cuedDecisionId: string;
  readonly current: SrsScheduleRecord;
  readonly config: SrsValidatedLadderConfig;
  /** Injected minted idempotency key; the adapter never mints its own (append-only, P2-ORP-16). */
  readonly attemptId: string;
  readonly sessionId: string;
  readonly traversalId: string;
  readonly mode: SrsTraversalMode;
  readonly reviewKind: SrsReviewKind;
  /** Completion instant (UTC epoch ms) — the ONLY scheduling clock; the adapter never reads Date.now. */
  readonly completedAt: number;
  /** Compact display/source snapshot (label + lineage only, never chess material). */
  readonly snapshot: SrsDisplaySnapshot;
  /** Provenance/analytics only: records that the target was force-added; never an eligibility flag. */
  readonly forceAddedAt?: number;
}

/** Why a completed outcome did NOT transition SRS (schedule-neutral). Observability only. */
export type OrpSrsNoOpReason =
  /** `outcome.scored === false` — accepted-optional / reference / needs-classification / context. */
  | 'not-scored'
  /** Scored but `firstAttemptResult` is null (defensive; a scored outcome should always carry one). */
  | 'no-first-attempt'
  /** Defensive Required re-check failed — the decision is not `trainability:'required'` (§7 R2). */
  | 'not-required'
  /** The supplied `decision` is not the one the outcome pertains to (caller wiring bug). */
  | 'decision-outcome-mismatch'
  /** The supplied schedule row is not the target's row (caller wiring bug). */
  | 'schedule-target-mismatch'
  /** The schedule row is not active — an attempt is only ever scored against an active due target. */
  | 'inactive-target'
  /** F-1: a CLEAN result whose played decision is not the cued one — no clean credit to any target. */
  | 'clean-requires-played-equals-cued';

/** No transition: nothing is scheduled, no attempt is emitted. */
export interface OrpSrsNoOp {
  readonly kind: 'no-op';
  readonly reason: OrpSrsNoOpReason;
}

/** A scored Required-target transition: the kernel-neutral attempt plus the delegated transition. */
export interface OrpSrsTransition {
  readonly kind: 'transition';
  /** The immutable append-only attempt, keyed to the PLAYED/pertinent `outcome.decisionId` (F-1). */
  readonly attempt: SrsAttemptRecord;
  /** The result of `transitionSchedule(current, attempt, config)` — ALL scheduling math lives there. */
  readonly transition: SrsTransitionResult;
}

export type OrpSrsAdapterResult = OrpSrsNoOp | OrpSrsTransition;

/**
 * Translate one completed per-decision `GradeOutcome` into the Study-owned SRS kernel.
 *
 * Returns a `transition` (a kernel-neutral `SrsAttemptRecord` plus the delegated `transitionSchedule`
 * result) ONLY for a scored Required target that passes the defensive re-check and the F-1 clean
 * guard; every other completed outcome is a schedule-neutral `no-op`. Pure and side-effect-free.
 */
export function applyOrpDecisionOutcome(input: OrpSrsAdapterInput): OrpSrsAdapterResult {
  const { outcome, decision, cuedDecisionId, current } = input;

  // 1. Only a scored Required-target signal transitions. accepted-optional / reference / needs-
  //    classification / every context move are `scored:false` (guards :877/:878) → no-op.
  if (!outcome.scored) return { kind: 'no-op', reason: 'not-scored' };

  // 2. A scored outcome must carry a first-attempt result; guard defensively before building.
  if (outcome.firstAttemptResult === null) return { kind: 'no-op', reason: 'no-first-attempt' };

  // 3. Defensive Required re-check (§7 R2) — do NOT trust the grader's `scored` flag alone. The
  //    grader trusts the controller to cue only Required decisions; the adapter re-asserts it so a
  //    non-Required decision never transitions even if a scored signal reaches here.
  if (!isSrsEnrollable(decision)) return { kind: 'no-op', reason: 'not-required' };

  // 4. Identity coherence: the supplied decision must be the one the outcome pertains to, so the
  //    Required re-check above gated the RIGHT decision and the record is keyed correctly.
  if (decision.identity.decisionId !== outcome.decisionId) {
    return { kind: 'no-op', reason: 'decision-outcome-mismatch' };
  }

  // 5. Schedule coherence: the current row must be the row for this target (keyed to played, F-1).
  if (current.targetId !== outcome.decisionId) {
    return { kind: 'no-op', reason: 'schedule-target-mismatch' };
  }

  // 6. An attempt is only ever scored against an ACTIVE due/early target (the frozen scheduled
  //    snapshot's `dueAt` is active-only, srsTypes.ts:130-133). A non-active row is schedule-neutral.
  if (current.status !== 'active') return { kind: 'no-op', reason: 'inactive-target' };

  // 7. F-1 (brief §3, teeth 2): a scored-CLEAN transition requires played == cued, so a clean recall
  //    of a non-cued sibling never stamps the cued target (or the sibling) clean (guards :878). A
  //    scored FAILURE keys to the cued target that was missed (`outcome.decisionId`) and is unaffected.
  if (outcome.firstAttemptResult === 'clean' && outcome.decisionId !== cuedDecisionId) {
    return { kind: 'no-op', reason: 'clean-requires-played-equals-cued' };
  }

  // Build the kernel-neutral attempt. It is keyed to `outcome.decisionId` (the PLAYED/pertinent
  // decision, NEVER the cued step.target — F-1 teeth 1), freezes the scheduled snapshot against the
  // CURRENT active row so a just-completed recall applies (not stale), and carries the neutral
  // first-attempt signals VERBATIM (assistance already forced `failed` upstream; the kernel re-derives
  // `isClean` from the retained `assistanceTypes` — §7 R6). ZERO scheduling math here.
  const attempt: SrsAttemptRecord = {
    attemptId: input.attemptId,
    targetId: outcome.decisionId,
    lessonId: current.lessonId,
    targetRevision: current.targetRevision,
    sessionId: input.sessionId,
    traversalId: input.traversalId,
    mode: input.mode,
    scheduled: {
      scheduleRevision: current.scheduleRevision,
      configVersion: current.configVersion,
      stepIndex: current.stepIndex,
      dueAt: current.dueAt,
    },
    completedAt: input.completedAt,
    reviewKind: input.reviewKind,
    firstAttemptResult: outcome.firstAttemptResult,
    assistanceTypes: outcome.assistanceTypes,
    failedMoveKeys: outcome.failedMoveKeys,
    ...(input.forceAddedAt !== undefined ? { forceAddedAt: input.forceAddedAt } : {}),
    snapshot: input.snapshot,
  };

  // Delegate ALL transition math (interval / dueAt / ladder / streak / graduation) to the sealed
  // Package B kernel. The adapter reuses the ONE scheduler; it never reimplements scheduling.
  const transition = transitionSchedule(current, attempt, input.config);
  return { kind: 'transition', attempt, transition };
}
