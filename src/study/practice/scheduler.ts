




















import type { PositionProgress } from '../types';
import type {
  SrsActiveScheduleRecord,
  SrsAttemptRecord,
  SrsExact,
  SrsInactiveScheduleRecord,
  SrsLadderConfig,
  SrsScheduleRecord,
  SrsTransitionFn,
  SrsValidatedLadderConfig,
} from './srsTypes';

// ===========================================================================
// V2 pure transition kernel
// ===========================================================================

/** Result of validating a raw ladder configuration. Only the `ok` branch yields the branded type. */
export type LadderConfigValidation =
  | { readonly ok: true; readonly config: SrsValidatedLadderConfig }
  | { readonly ok: false; readonly reason: string };

/**
 * Validate a raw ladder configuration and, on success, brand it as `SrsValidatedLadderConfig`.
 * This is the ONLY producer of the branded type — the brand is an opaque `unique symbol` whose key is
 * unnameable outside `srsTypes.ts`, so this function's internal assertion is the sole way to construct
 * the type. Callers cannot forge a validated config with a property literal. The transition kernel
 * accepts nothing else, which expresses the "validate before scheduling" contract in the type system.
 *
 * A well-formed ladder has: a non-empty, strictly-increasing sequence of finite positive intervals;
 * an in-range integer `resetStep`; a positive-integer `advanceBy`; and, when present, positive-integer
 * `requiredConsecutiveClean` and `graduation.afterConsecutiveClean` values.
 */
export function validateLadderConfig(config: SrsLadderConfig): LadderConfigValidation {
  const intervals = config.intervalsMs;
  if (!Array.isArray(intervals) || intervals.length === 0) {
    return { ok: false, reason: 'intervalsMs must contain at least one interval' };
  }
  let previous = 0;
  for (let i = 0; i < intervals.length; i += 1) {
    const ms = intervals[i]!;
    if (!Number.isFinite(ms) || ms <= 0) {
      return { ok: false, reason: `intervalsMs[${i}] must be a finite positive duration` };
    }
    if (ms <= previous) {
      return { ok: false, reason: `intervalsMs must be strictly increasing (index ${i})` };
    }
    previous = ms;
  }
  if (!Number.isInteger(config.resetStep) || config.resetStep < 0 || config.resetStep >= intervals.length) {
    return { ok: false, reason: 'resetStep must be an in-range ladder index' };
  }
  if (!Number.isInteger(config.advanceBy) || config.advanceBy < 1) {
    return { ok: false, reason: 'advanceBy must be a positive integer' };
  }
  if (
    config.requiredConsecutiveClean !== undefined &&
    (!Number.isInteger(config.requiredConsecutiveClean) || config.requiredConsecutiveClean < 1)
  ) {
    return { ok: false, reason: 'requiredConsecutiveClean, when set, must be a positive integer' };
  }
  if (
    config.graduation !== undefined &&
    (!Number.isInteger(config.graduation.afterConsecutiveClean) || config.graduation.afterConsecutiveClean < 1)
  ) {
    return { ok: false, reason: 'graduation.afterConsecutiveClean must be a positive integer' };
  }
  // Reject a config that supplies BOTH graduation thresholds with CONFLICTING values, rather than
  // relying on silent precedence. When both are present they must agree (the optional puzzle adapter
  // pairs them at the same value); a mismatch is a configuration bug the validator surfaces up front.
  if (
    config.graduation !== undefined &&
    config.requiredConsecutiveClean !== undefined &&
    config.graduation.afterConsecutiveClean !== config.requiredConsecutiveClean
  ) {
    return {
      ok: false,
      reason: 'graduation.afterConsecutiveClean and requiredConsecutiveClean must agree when both are set',
    };
  }
  // Sole brand constructor: the opaque `unique symbol` brand has no runtime footprint, so branding is
  // a phantom assertion here rather than a property write. `as unknown as` is confined to this single
  // validator seam — everywhere else the branded type is unforgeable.
  return { ok: true, config: config as unknown as SrsValidatedLadderConfig };
}

// ===========================================================================
// Persistence-facing closed-record guards (finding B1-4)
// ===========================================================================
//
// Excess-property checks fire only on fresh object literals, so a variable of a wider type can
// smuggle chess material (e.g. `fen`/`pgn`) into a persisted SRS row with zero diagnostics. These
// guards close that hole at the boundary between the pure kernel and the atomic persistence layer
// (B4): every SRS row and attempt written to durable storage funnels through them, and `SrsExact`
// makes any object carrying keys beyond the exact contract a compile error. At runtime they are the
// identity function.

/** Compile-time closed-record guard for a schedule row at the persistence boundary. Rejects any
 *  widened object carrying keys beyond `SrsScheduleRecord` (P2-ORP-12 forbids chess material as SRS
 *  state). */
export function asPersistableScheduleRecord<V extends SrsScheduleRecord>(
  record: SrsExact<SrsScheduleRecord, V>,
): SrsScheduleRecord {
  return record;
}

/** Compile-time closed-record guard for an attempt row at the persistence boundary. Rejects any
 *  widened object carrying keys beyond `SrsAttemptRecord` (no PGN/FEN material on attempts). */
export function asPersistableAttemptRecord<V extends SrsAttemptRecord>(
  attempt: SrsExact<SrsAttemptRecord, V>,
): SrsAttemptRecord {
  return attempt;
}

/**
 * The consecutive-clean count that graduates a target, or null when the config never graduates from
 * the ladder (ORP repeats the ceiling step forever). An explicit `graduation` policy is authoritative;
 * `requiredConsecutiveClean` supplies the threshold when no explicit policy is present (the optional
 * puzzle adapter pairs both at the same value).
 */
function graduationThreshold(config: SrsValidatedLadderConfig): number | null {
  if (config.graduation !== undefined) return config.graduation.afterConsecutiveClean;
  if (config.requiredConsecutiveClean !== undefined) return config.requiredConsecutiveClean;
  return null;
}

function buildActiveNext(
  current: SrsScheduleRecord,
  config: SrsValidatedLadderConfig,
  attemptId: string,
  completedAt: number,
  stepIndex: number,
  cleanStreak: number,
  dueAt: number,
): SrsActiveScheduleRecord {
  return {
    targetId: current.targetId,
    lessonId: current.lessonId,
    targetRevision: current.targetRevision,
    status: 'active',
    // Monotonic CAS token: every applied transition advances it so a replayed/older-snapshot attempt
    // is detectably stale on the next pass.
    scheduleRevision: current.scheduleRevision + 1,
    // Prospective config: the config in force AT this scheduling event is stamped onto the row.
    configId: config.configId,
    configVersion: config.configVersion,
    stepIndex,
    cleanStreak,
    dueAt,
    enrolledAt: current.enrolledAt,
    lastCompletedAt: completedAt,
    // Retain the applied attempt's idempotency key so a replay of the SAME attemptId is a duplicate.
    lastAttemptId: attemptId,
    updatedAt: completedAt,
  };
}

function buildGraduatedNext(
  current: SrsScheduleRecord,
  config: SrsValidatedLadderConfig,
  attemptId: string,
  completedAt: number,
  stepIndex: number,
  cleanStreak: number,
): SrsInactiveScheduleRecord {
  return {
    targetId: current.targetId,
    lessonId: current.lessonId,
    targetRevision: current.targetRevision,
    status: 'graduated',
    scheduleRevision: current.scheduleRevision + 1,
    configId: config.configId,
    configVersion: config.configVersion,
    stepIndex,
    cleanStreak,
    dueAt: null,
    enrolledAt: current.enrolledAt,
    lastCompletedAt: completedAt,
    lastAttemptId: attemptId,
    updatedAt: completedAt,
  };
}






















export const transitionSchedule: SrsTransitionFn = (current, completed, config) => {
  // 1. Completion time is the only clock; reject a non-finite instant outright.
  if (!Number.isFinite(completed.completedAt)) {
    return { outcome: 'invalid', reason: 'completedAt must be a finite epoch-ms instant' };
  }
  // 2. Target identity must match — a result for a different target is a caller bug.
  if (completed.targetId !== current.targetId) {
    return { outcome: 'invalid', reason: 'attempt targetId does not match the schedule record' };
  }
  // 3. Ladder/record structural sanity (config is branded-validated; guard the record too).
  const lastStep = config.intervalsMs.length - 1;
  if (lastStep < 0) {
    return { outcome: 'invalid', reason: 'validated config unexpectedly has no ladder steps' };
  }
  if (!Number.isInteger(current.stepIndex) || current.stepIndex < 0 || current.stepIndex > lastStep) {
    return { outcome: 'invalid', reason: 'record stepIndex is outside the ladder range' };
  }
  // 4. A snapshot claiming a revision ahead of the record is impossible under monotonic CAS.
  if (completed.scheduled.scheduleRevision > current.scheduleRevision) {
    return { outcome: 'invalid', reason: 'attempt snapshot revision is ahead of the record' };
  }
  // 5. Idempotent duplicate keyed on the ATTEMPT IDENTITY, not the completion timestamp. Replaying
  //    the same `attemptId` already applied to this row is a non-mutating no-op whatever its
  //    completedAt; a DISTINCT attempt at the same millisecond is a legitimate new completion and
  //    must NOT be discarded. Completion time is scheduling data, never identity. The atomic
  //    persistence boundary (B4b, insert-existing-attemptId) remains the ultimate idempotency
  //    boundary; the pure kernel honors the key it is handed via the row's `lastAttemptId`.
  if (current.lastAttemptId !== null && current.lastAttemptId === completed.attemptId) {
    return { outcome: 'duplicate', reason: 'attempt already applied to this schedule row' };
  }
  // 6. Only active targets are scheduled; graduated/suspended/archived rows never re-advance.
  if (current.status !== 'active') {
    return { outcome: 'inactive', reason: `target is ${current.status}` };
  }
  // 7. Superseded target/source revision (append-only replaced-decision history advanced) — stale.
  if (completed.targetRevision !== current.targetRevision) {
    return { outcome: 'stale', reason: 'attempt targetRevision is superseded' };
  }
  // 8. The frozen scheduled snapshot must match the CURRENT active record EXACTLY — scheduleRevision,
  //    configVersion, stepIndex, and dueAt. A behind revision, a superseded config version, a stale
  //    ladder step, or a mismatched due instant all mean the attempt was frozen against a schedule
  //    state that has since moved on: the completion is stale, not applicable. (`current` is narrowed
  //    to active by step 6, so `current.dueAt` is a concrete number matching the snapshot's shape.)
  if (
    completed.scheduled.scheduleRevision !== current.scheduleRevision ||
    completed.scheduled.configVersion !== current.configVersion ||
    completed.scheduled.stepIndex !== current.stepIndex ||
    completed.scheduled.dueAt !== current.dueAt
  ) {
    return { outcome: 'stale', reason: 'attempt scheduled snapshot does not match the current record' };
  }

  // --- Apply. Assistance is a failed training result (P2-ORP-10), even if firstAttemptResult reads
  //     clean, so the kernel grades assisted attempts as failures at its boundary. ---
  const completedAt = completed.completedAt;
  const isClean = completed.firstAttemptResult === 'clean' && completed.assistanceTypes.length === 0;

  if (!isClean) {
    const step = config.resetStep;
    const dueAt = completedAt + config.intervalsMs[step]!;
    return { outcome: 'applied', next: buildActiveNext(current, config, completed.attemptId, completedAt, step, 0, dueAt) };
  }

  const cleanStreak = current.cleanStreak + 1;
  const step = Math.min(current.stepIndex + config.advanceBy, lastStep);
  const threshold = graduationThreshold(config);
  if (threshold !== null && cleanStreak >= threshold) {
    return { outcome: 'applied', next: buildGraduatedNext(current, config, completed.attemptId, completedAt, step, cleanStreak) };
  }
  const dueAt = completedAt + config.intervalsMs[step]!;
  return { outcome: 'applied', next: buildActiveNext(current, config, completed.attemptId, completedAt, step, cleanStreak, dueAt) };
};

// ===========================================================================
// Deprecated MVP compatibility layer — retained only for existing callers this slice.
// Do not build new work on these; use the V2 kernel above.
// Adapted from lichess-org/lila: modules/practice/src/main/PracticeStudyApi.scala scheduling model.
// ===========================================================================

/**
 * @deprecated MVP fixed-interval ladder (level 0–6). Superseded by the parameterized
 * `SrsLadderConfig.intervalsMs` consumed by `transitionSchedule`. Retained for existing drill callers.
 */
export const INTERVALS_MS: number[] = [
  0,                    // level 0 — not yet learned (show again immediately)
  24 * 60 * 60 * 1000,  // level 1 — 1 day
  3  * 24 * 60 * 60 * 1000, // level 2 — 3 days
  7  * 24 * 60 * 60 * 1000, // level 3 — 1 week
  14 * 24 * 60 * 60 * 1000, // level 4 — 2 weeks
  30 * 24 * 60 * 60 * 1000, // level 5 — 1 month
  90 * 24 * 60 * 60 * 1000, // level 6 — 3 months (max)
];

/** @deprecated MVP ceiling level. See `transitionSchedule` / `SrsLadderConfig` for the V2 model. */
export const MAX_LEVEL = INTERVALS_MS.length - 1; // 6

/**
 * @deprecated MVP scheduling step. Correct → level up (capped at MAX_LEVEL); incorrect → level down to
 * max(1, level - 1). Superseded by `transitionSchedule` (reset-to-`resetStep` on failure, no decrement).
 * `now` is required (no wall-clock default) so this module reads no clock; callers already pass it.
 */
export function scheduleNext(
  currentLevel: number,
  correct: boolean,
  now: number,
): { newLevel: number; nextDueAt: number } {
  const newLevel = correct
    ? Math.min(currentLevel + 1, MAX_LEVEL)
    : Math.max(1, currentLevel - 1);
  const nextDueAt = now + INTERVALS_MS[newLevel]!;
  return { newLevel, nextDueAt };
}

/**
 * @deprecated MVP due check. Level 0 positions are always due; otherwise due when `nextDueAt <= now`.
 * `now` is required (no wall-clock default). The V2 due contract lives in the B3 session builder.
 */
export function isDue(progress: PositionProgress, now: number): boolean {
  return progress.level === 0 || progress.nextDueAt <= now;
}

/**
 * @deprecated MVP normalized-FEN position key (board + active color + castling + en-passant). The V2
 * scheduling unit is a durable decision UUID, NOT chess material (P2-ORP-12); this key is not identity.
 * Adapted from lichess-org/lila: modules/analyse/src/main/Analysis.scala positionKey
 */
export function positionKey(fen: string): string {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}
