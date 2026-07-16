
























import type { TrainableSequence, PositionProgress } from '../types';
import { isDue, positionKey } from './scheduler';
import type {
  SrsScheduleRecord,
  SrsActiveScheduleRecord,
  SrsDueQuery,
  SrsDueTarget,
  SrsDuePriorityInputs,
  SrsFrozenScheduleSnapshot,
  SrsDisplaySnapshot,
  SrsSourceVersion,
  SrsPresentationGroupRef,
  SrsReviewKind,
  SrsTraversalPlan,
  SrsTraversalPlanEntry,
  SrsContextEntry,
  SrsRepairEntry,
} from './srsTypes';

// ===========================================================================
// V2 due query + session planning (blessed path)
// ===========================================================================

// --- Module input/output contracts -----------------------------------------

/**
 * Per-target domain-neutral metadata the due query needs BEYOND the bare SRS record. The record is
 * deliberately free of source/display/priority material (B1 record split), so the caller supplies the
 * source versioning + display label/lineage used to freeze snapshots and the domain-configured
 * priority inputs. NONE of this is PGN/FEN/tree material — labels and lineage only.
 */
export interface SrsDueTargetMeta {
  /** Display label + source lineage/versioning captured for frozen snapshots. */
  readonly display: SrsDisplaySnapshot;
  /** Presentation group the target currently displays under (Acquisition/Maintenance, …). */
  readonly group?: SrsPresentationGroupRef;
  /** Recent failure count feeding the ranking (defaults to 0 when unknown). */
  readonly recentFailureCount?: number;
  /** Recent reset count feeding the ranking (defaults to 0 when unknown). */
  readonly recentResetCount?: number;
  /** First-attempt clean rate in [0,1], when known. */
  readonly firstAttemptCleanRate?: number;
  /** Domain-supplied importance weight. */
  readonly importance?: number;
  /** Domain-supplied path/traversal cost. */
  readonly pathCost?: number;
}

/** One record paired with its due-target metadata — the unit the due query consumes. */
export interface SrsDueCandidateInput {
  readonly record: SrsScheduleRecord;
  readonly meta: SrsDueTargetMeta;
}

/** A due target paired with the source snapshot to freeze onto its plan entry. */
export interface SrsScoredPlanCandidate {
  readonly due: SrsDueTarget;
  readonly frozenSource: SrsDisplaySnapshot;
}

/** Session-plan construction input: scored candidates plus any schedule-neutral context/repair. */
export interface SrsSessionPlanInput {
  readonly sessionId: string;
  readonly traversalId: string;
  /** Explicit creation instant (UTC epoch ms). No wall-clock read. */
  readonly createdAt: number;
  readonly scored: readonly SrsScoredPlanCandidate[];
  readonly context?: readonly SrsContextEntry[];
  readonly repair?: readonly SrsRepairEntry[];
}

/** Pluggable due-target ranking comparator. The ratified ORP ranking is the provided default. */
export type SrsDueTargetComparator = (a: SrsDueTarget, b: SrsDueTarget) => number;

/** Which kind of plan entry a revalidation invalidation refers to. */
export type SrsPlanEntryKind = 'target' | 'context' | 'repair';

/** One stale/invalid plan entry surfaced by revalidation (identity + human-readable reason). */
export interface SrsPlanInvalidEntry {
  readonly kind: SrsPlanEntryKind;
  readonly targetId: string;
  readonly reason: string;
}

/** Non-mutating revalidation result: exactly which plan entries no longer match the live state. */
export interface SrsPlanRevalidation {
  readonly invalidEntries: readonly SrsPlanInvalidEntry[];
}

// --- Due query --------------------------------------------------------------

/**
 * Select due targets from a provided candidate set. Pure and clock-injected.
 *
 * Rules (memo §2, binding):
 *   - Due = `status === 'active' && dueAt <= now` (boundary is `<=`, not `<`).
 *   - Non-active statuses never surface; a candidate not in the set is never due ("no row => not due").
 *   - Scope by `scopeLessonIds`, optionally narrow by `targetIds`, sort in the stable base order
 *     (`dueAt` asc, then `targetId` asc), and enforce `limit` as a HARD cap on the TOTAL returned
 *     candidates (due-now targets AND explicit early reviews together).
 *   - The ONLY way a not-yet-due active target surfaces is an explicit `earlyReviewTargetIds`
 *     selection (`reviewKind: 'early'`, `overdueMs: 0`, `dueNow: false`); `forceAddedAt` is never
 *     consulted for eligibility. Explicit early reviews are a deliberate, bounded set, but they do NOT
 *     escape the cap: allocation under pressure is due-precedence — genuinely due-now targets fill the
 *     cap first (base order), and early reviews fill only the remaining slots (base order). The total
 *     returned is therefore never more than `limit`.
 *   - Fail closed (exit note (c)): a non-finite `now` surfaces nothing; a candidate with a non-finite
 *     `dueAt` is dropped, never surfaced as due.
 */
export function selectDueTargets(
  candidates: readonly SrsDueCandidateInput[],
  query: SrsDueQuery,
): SrsDueTarget[] {
  // Fail closed on a non-finite query clock: surface nothing rather than compare against NaN/Infinity.
  if (!Number.isFinite(query.now)) return [];
  const now = query.now;
  const limit = Number.isInteger(query.limit) && query.limit >= 0 ? query.limit : 0;
  const scope = new Set(query.scopeLessonIds);
  const targetFilter = query.targetIds ? new Set(query.targetIds) : null;
  const earlySelected = query.earlyReviewTargetIds ? new Set(query.earlyReviewTargetIds) : null;

  const dueNow: SrsDueTarget[] = [];
  const early: SrsDueTarget[] = [];

  for (const { record, meta } of candidates) {
    // Non-active never surfaces (this also makes "no row => not due" inherent: only enrolled active
    // rows the caller passes participate at all).
    if (record.status !== 'active') continue;
    if (!scope.has(record.lessonId)) continue;
    if (targetFilter && !targetFilter.has(record.targetId)) continue;
    // Fail closed on a corrupt (non-finite) due instant.
    if (!Number.isFinite(record.dueAt)) continue;

    if (record.dueAt <= now) {
      dueNow.push(buildDueTarget(record, meta, now, 'due'));
    } else if (earlySelected && earlySelected.has(record.targetId)) {
      early.push(buildDueTarget(record, meta, now, 'early'));
    }
  }

  dueNow.sort(compareDueByBaseOrder);
  early.sort(compareDueByBaseOrder);





  const dueSlice = dueNow.slice(0, limit);
  const remaining = Math.max(0, limit - dueSlice.length);
  return dueSlice.concat(early.slice(0, remaining));
}

function buildDueTarget(
  record: SrsActiveScheduleRecord,
  meta: SrsDueTargetMeta,
  now: number,
  reviewKind: SrsReviewKind,
): SrsDueTarget {
  const overdueMs = reviewKind === 'due' ? Math.max(0, now - record.dueAt) : 0;
  const priority: SrsDuePriorityInputs = {
    overdueMs,
    dueNow: reviewKind === 'due',
    recentFailureCount: meta.recentFailureCount ?? 0,
    recentResetCount: meta.recentResetCount ?? 0,
    ...(meta.firstAttemptCleanRate !== undefined ? { firstAttemptCleanRate: meta.firstAttemptCleanRate } : {}),
    ...(meta.importance !== undefined ? { importance: meta.importance } : {}),
    ...(meta.pathCost !== undefined ? { pathCost: meta.pathCost } : {}),
  };
  return {
    targetId: record.targetId,
    lessonId: record.lessonId,
    frozenSchedule: freezeSchedule(record, meta.display.source, now),
    overdueMs,
    stepIndex: record.stepIndex,
    ...(meta.group ? { group: meta.group } : {}),
    reviewKind,
    priority,
  };
}

/**
 * Freeze an active record into a point-in-time snapshot. Every field is copied by value (all leaf
 * values are primitives; the source union is copied via `copySource`), so a later mutation of the live
 * record can never leak into the frozen plan (finding B3: snapshots must not mutate after planning).
 */
function freezeSchedule(
  record: SrsActiveScheduleRecord,
  source: SrsSourceVersion,
  capturedAt: number,
): SrsFrozenScheduleSnapshot {
  return {
    targetId: record.targetId,
    lessonId: record.lessonId,
    targetRevision: record.targetRevision,
    scheduleRevision: record.scheduleRevision,
    configId: record.configId,
    configVersion: record.configVersion,
    stepIndex: record.stepIndex,
    status: 'active',
    dueAt: record.dueAt,
    source: copySource(source),
    capturedAt,
  };
}

/**
 * Copy a source-version union by value. Never invents an `origin`: an unlinked source with no recorded
 * origin stays origin-less (unknown/not-recorded) and is NEVER coerced to `manual` (exit note (a)).
 */
function copySource(source: SrsSourceVersion): SrsSourceVersion {
  if (source.kind === 'linked') return { kind: 'linked', sourceRevision: source.sourceRevision };
  return source.origin !== undefined ? { kind: 'unlinked', origin: source.origin } : { kind: 'unlinked' };
}

// --- Ordering + ranking -----------------------------------------------------






function sanitizeFinite(x: number, fallback: number): number {
  return Number.isFinite(x) ? x : fallback;
}






function sanitizeOptional(x: number | undefined, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}








export function compareDueByBaseOrder(a: SrsDueTarget, b: SrsDueTarget): number {
  const ad = sanitizeFinite(a.frozenSchedule.dueAt, 0);
  const bd = sanitizeFinite(b.frozenSchedule.dueAt, 0);
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0;
}
























export const defaultOrpPriorityComparator: SrsDueTargetComparator = (a, b) => {
  const pa = a.priority;
  const pb = b.priority;
  // 1. Overdue: more overdue first. Non-finite overdue -> 0 (not overdue, least urgent on this axis).
  const oa = sanitizeFinite(pa.overdueMs, 0);
  const ob = sanitizeFinite(pb.overdueMs, 0);
  if (oa !== ob) return oa > ob ? -1 : 1;
  // 2. Recently reset OR failed — one combined tier: recency = max(failure, reset) counts, more first.
  //    Non-finite counts -> 0. This is the single §9.5 tier, not failure-before-reset.
  const ra = Math.max(sanitizeFinite(pa.recentFailureCount, 0), sanitizeFinite(pa.recentResetCount, 0));
  const rb = Math.max(sanitizeFinite(pb.recentFailureCount, 0), sanitizeFinite(pb.recentResetCount, 0));
  if (ra !== rb) return ra > rb ? -1 : 1;
  // 3. Due now before not-due (explicit early reviews rank after genuinely due-now targets).
  if (pa.dueNow !== pb.dueNow) return pa.dueNow ? -1 : 1;
  // 4. First-attempt clean rate: lower (weaker recall) first; unknown/non-finite ranks last (+Infinity).
  const fa = sanitizeOptional(pa.firstAttemptCleanRate, Number.POSITIVE_INFINITY);
  const fb = sanitizeOptional(pb.firstAttemptCleanRate, Number.POSITIVE_INFINITY);
  if (fa !== fb) return fa < fb ? -1 : 1;
  // 5. Importance: higher first; unknown/non-finite ranks last (-Infinity).
  const ia = sanitizeOptional(pa.importance, Number.NEGATIVE_INFINITY);
  const ib = sanitizeOptional(pb.importance, Number.NEGATIVE_INFINITY);
  if (ia !== ib) return ia > ib ? -1 : 1;
  // 6. Path cost: lower first; unknown/non-finite ranks last (+Infinity).
  const ca = sanitizeOptional(pa.pathCost, Number.POSITIVE_INFINITY);
  const cb = sanitizeOptional(pb.pathCost, Number.POSITIVE_INFINITY);
  if (ca !== cb) return ca < cb ? -1 : 1;
  // Total-order tiebreak.
  return compareDueByBaseOrder(a, b);
};

// --- Traversal-plan construction --------------------------------------------

/**
 * Build a frozen traversal plan. Separates scored due targets (`entries`) from schedule-neutral
 * context and plan-level repair (Required behavior 3): only `scored` candidates become
 * `SrsTraversalPlanEntry`s; `context`/`repair` are carried verbatim as schedule-neutral lists that can
 * never be scored (their entry types carry no schedule snapshot). Scored entries are ordered by the
 * pluggable comparator (the ratified ORP ranking by default). All frozen snapshots are deep-copied so
 * the plan does not alias any live record/source (Required behavior 4).
 */
export function buildTraversalPlan(
  input: SrsSessionPlanInput,
  comparator: SrsDueTargetComparator = defaultOrpPriorityComparator,
): SrsTraversalPlan {
  const ordered = input.scored.slice().sort((a, b) => comparator(a.due, b.due));
  const entries: SrsTraversalPlanEntry[] = ordered.map(c => ({
    targetId: c.due.targetId,
    lessonId: c.due.lessonId,
    reviewKind: c.due.reviewKind ?? 'due',
    frozenSchedule: freezeScheduleSnapshotCopy(c.due.frozenSchedule),
    frozenSource: copyDisplay(c.frozenSource),
  }));
  return {
    planVersion: 1,
    sessionId: input.sessionId,
    traversalId: input.traversalId,
    createdAt: input.createdAt,
    entries,


    context: (input.context ?? []).map(copyContext),
    repair: (input.repair ?? []).map(copyRepair),
  };
}

function freezeScheduleSnapshotCopy(f: SrsFrozenScheduleSnapshot): SrsFrozenScheduleSnapshot {
  return {
    targetId: f.targetId,
    lessonId: f.lessonId,
    targetRevision: f.targetRevision,
    scheduleRevision: f.scheduleRevision,
    configId: f.configId,
    configVersion: f.configVersion,
    stepIndex: f.stepIndex,
    status: 'active',
    dueAt: f.dueAt,
    source: copySource(f.source),
    capturedAt: f.capturedAt,
  };
}

function copyDisplay(d: SrsDisplaySnapshot): SrsDisplaySnapshot {
  return {
    label: d.label,
    ...(d.sourceLabel !== undefined ? { sourceLabel: d.sourceLabel } : {}),
    source: copySource(d.source),
  };
}

function copyContext(c: SrsContextEntry): SrsContextEntry {
  return { targetId: c.targetId, lessonId: c.lessonId, frozenSource: copyDisplay(c.frozenSource), scheduleNeutral: true };
}

function copyRepair(r: SrsRepairEntry): SrsRepairEntry {
  return {
    targetId: r.targetId,
    lessonId: r.lessonId,
    frozenSource: copyDisplay(r.frozenSource),
    scheduleNeutral: true,
    ...(r.failedMoveKeys !== undefined ? { failedMoveKeys: r.failedMoveKeys.slice() } : {}),
  };
}

// --- Plan revalidation ------------------------------------------------------














export function revalidateTraversalPlan(
  plan: SrsTraversalPlan,
  currentById: ReadonlyMap<string, SrsScheduleRecord>,
  currentSourceById?: ReadonlyMap<string, SrsSourceVersion>,
): SrsPlanRevalidation {
  const invalidEntries: SrsPlanInvalidEntry[] = [];

  for (const entry of plan.entries) {
    const reason = revalidateScheduledEntry(entry, currentById, currentSourceById);
    if (reason) invalidEntries.push({ kind: 'target', targetId: entry.targetId, reason });
  }
  for (const c of plan.context) {
    const reason = revalidateSource(c.targetId, c.frozenSource.source, currentSourceById);
    if (reason) invalidEntries.push({ kind: 'context', targetId: c.targetId, reason });
  }
  for (const r of plan.repair) {
    const reason = revalidateSource(r.targetId, r.frozenSource.source, currentSourceById);
    if (reason) invalidEntries.push({ kind: 'repair', targetId: r.targetId, reason });
  }
  return { invalidEntries };
}

function revalidateScheduledEntry(
  entry: SrsTraversalPlanEntry,
  currentById: ReadonlyMap<string, SrsScheduleRecord>,
  currentSourceById?: ReadonlyMap<string, SrsSourceVersion>,
): string | null {
  const current = currentById.get(entry.targetId);
  if (!current) return 'schedule row no longer present';
  if (current.status !== 'active') return `target is now ${current.status}`;
  const f = entry.frozenSchedule;
  // Fail closed on a non-finite due instant on either side.
  if (!Number.isFinite(f.dueAt) || !Number.isFinite(current.dueAt)) return 'non-finite dueAt';
  if (current.targetRevision !== f.targetRevision) return 'targetRevision superseded (decision replaced)';
  if (current.scheduleRevision !== f.scheduleRevision) return 'scheduleRevision advanced';
  if (current.configId !== f.configId) return 'configId changed';
  if (current.configVersion !== f.configVersion) return 'configVersion changed';
  if (current.stepIndex !== f.stepIndex) return 'stepIndex changed';
  if (current.dueAt !== f.dueAt) return 'dueAt changed';


  const scheduleSourceReason = revalidateSource(entry.targetId, f.source, currentSourceById);
  if (scheduleSourceReason) return scheduleSourceReason;
  return revalidateSource(entry.targetId, entry.frozenSource.source, currentSourceById);
}

function revalidateSource(
  targetId: string,
  frozen: SrsSourceVersion,
  currentSourceById?: ReadonlyMap<string, SrsSourceVersion>,
): string | null {




  if (frozen.kind === 'linked' && !Number.isFinite(frozen.sourceRevision)) {
    return 'non-finite linked sourceRevision';
  }
  if (!currentSourceById) return null; // no live source map supplied => skip the live comparison only
  const current = currentSourceById.get(targetId);
  if (!current) return 'source no longer present';
  if (frozen.kind !== current.kind) return 'source linkage changed';
  if (frozen.kind === 'linked' && current.kind === 'linked') {
    // Fail closed on a non-finite live linked revision (the frozen side was checked unconditionally above).
    if (!Number.isFinite(current.sourceRevision)) return 'non-finite linked sourceRevision';
    if (frozen.sourceRevision !== current.sourceRevision) return 'source revision changed';
  }
  // Unlinked vs unlinked: `origin` is provenance-only (never a version). An absent origin is
  // unknown/not-recorded and is NEVER assumed to be `manual`, so origin differences never flag
  // staleness. Same linkage + (for linked) the same finite revision means the source is unchanged.
  return null;
}

// ===========================================================================
// Deprecated MVP compatibility layer — retained only for existing callers this slice.
// Do not build new work on these; use the V2 due kernel above. The whole-sequence-if-any-position-due
// selection here is the MVP model, NOT the blessed V2 path. Package D migrates the callers onto the V2
// due contract and deletes this layer.
// Adapted from lichess-org/lila: modules/practice/src/main/PracticeStudyApi.scala session building.
// ===========================================================================

/**
 * @deprecated MVP review-session selection: whole sequences that have at least one due position,
 * sorted by most-overdue first. Superseded by the V2 per-decision `selectDueTargets` +
 * `buildTraversalPlan`. Retained only for existing MVP callers; its wall-clock default is preserved
 * because several out-of-scope callers rely on it.
 *
 * @param sequences - all active sequences for the study
 * @param progressMap - map from positionKey → PositionProgress (from IDB)
 * @param maxSequences - maximum sequences to include (default 20)
 */
export function buildReviewSession(
  sequences:    TrainableSequence[],
  progressMap:  Map<string, PositionProgress>,
  now:          number = Date.now(),
  maxSequences: number = 20,
): TrainableSequence[] {
  const withDue = sequences
    .filter(seq => seq.status === 'active')
    .filter(seq => hasDuePosition(seq, progressMap, now));

  // Sort by earliest nextDueAt across the sequence's positions
  withDue.sort((a, b) => {
    const aEarliest = earliestDueAt(a, progressMap);
    const bEarliest = earliestDueAt(b, progressMap);
    return aEarliest - bEarliest;
  });

  return withDue.slice(0, maxSequences);
}

/**
 * @deprecated MVP learn-session selection: sequences that have NOT yet been learned (no
 * PositionProgress entry, or level === 0 for all positions), sorted by createdAt ascending.
 * Superseded by the V2 due kernel above; retained only for existing MVP callers.
 *
 * @param maxSequences - maximum sequences to include (default 10)
 */
export function buildLearnSession(
  sequences:    TrainableSequence[],
  progressMap:  Map<string, PositionProgress>,
  maxSequences: number = 10,
): TrainableSequence[] {
  const unlearned = sequences
    .filter(seq => seq.status === 'active')
    .filter(seq => isUnlearned(seq, progressMap));

  unlearned.sort((a, b) => a.createdAt - b.createdAt);

  return unlearned.slice(0, maxSequences);
}

/**
 * @deprecated MVP position-level due count for the study "X due" badge. Superseded by the V2 due
 * kernel above; retained only for existing MVP callers, wall-clock default preserved for them.
 */
export function countDuePositions(
  sequences:   TrainableSequence[],
  progressMap: Map<string, PositionProgress>,
  now:         number = Date.now(),
): number {
  let count = 0;
  for (const seq of sequences) {
    if (seq.status !== 'active') continue;
    for (const fen of seq.fens) {
      const key      = positionKey(fen);
      const progress = progressMap.get(key);
      if (!progress || isDue(progress, now)) count++;
    }
  }
  return count;
}

// --- MVP helpers (deprecated layer) ---

function hasDuePosition(
  seq:         TrainableSequence,
  progressMap: Map<string, PositionProgress>,
  now:         number,
): boolean {
  for (const fen of seq.fens) {
    const key      = positionKey(fen);
    const progress = progressMap.get(key);
    if (!progress || isDue(progress, now)) return true;
  }
  return false;
}

function isUnlearned(
  seq:         TrainableSequence,
  progressMap: Map<string, PositionProgress>,
): boolean {
  for (const fen of seq.fens) {
    const key      = positionKey(fen);
    const progress = progressMap.get(key);
    if (!progress || progress.level === 0) return true;
  }
  return false;
}

function earliestDueAt(
  seq:         TrainableSequence,
  progressMap: Map<string, PositionProgress>,
): number {
  let earliest = Infinity;
  for (const fen of seq.fens) {
    const key      = positionKey(fen);
    const progress = progressMap.get(key);
    const due      = progress?.nextDueAt ?? 0; // unlearned = overdue
    if (due < earliest) earliest = due;
  }
  return earliest;
}
