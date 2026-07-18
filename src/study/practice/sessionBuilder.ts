
























import type { TrainableSequence, PositionProgress } from '../types';
import type { TreePath } from '../../tree/types';
import { isDue, positionKey } from './scheduler';
import { isSrsEnrollable, type LessonDecision } from './material';
import type { AuthoredLessonContent } from './lessonAuthoring';
import type { LearnStep, LearnReply, LearnStepKind } from './drillCtrl';
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
    const reason = revalidateNeutralEntry(c.targetId, c.frozenSource, currentSourceById);
    if (reason) invalidEntries.push({ kind: 'context', targetId: c.targetId, reason });
  }
  for (const r of plan.repair) {
    const reason = revalidateNeutralEntry(r.targetId, r.frozenSource, currentSourceById);
    if (reason) invalidEntries.push({ kind: 'repair', targetId: r.targetId, reason });
  }
  return { invalidEntries };
}












function revalidateNeutralEntry(
  targetId: string,
  frozenSource: SrsDisplaySnapshot,
  currentSourceById?: ReadonlyMap<string, SrsSourceVersion>,
): string | null {
  const displayShapeReason = validateDisplaySnapshotShape(frozenSource);
  if (displayShapeReason) return displayShapeReason;
  return revalidateSource(targetId, frozenSource.source, currentSourceById);
}

/** Numeric fields of a frozen schedule snapshot that MUST be finite for the snapshot to be usable. */
const FROZEN_SCHEDULE_NUMERIC_FIELDS = [
  'targetRevision',
  'scheduleRevision',
  'configVersion',
  'stepIndex',
  'dueAt',
  'capturedAt',
] as const;









function validateFrozenScheduleShape(frozen: SrsFrozenScheduleSnapshot): string | null {
  const snap = frozen as unknown as Record<string, unknown> | null | undefined;
  if (!snap || typeof snap !== 'object') return 'missing frozen schedule snapshot';
  for (const field of FROZEN_SCHEDULE_NUMERIC_FIELDS) {
    if (!Number.isFinite(snap[field])) return `non-finite ${field}`;
  }
  return null;
}







function validateDisplaySnapshotShape(display: SrsDisplaySnapshot): string | null {
  const snap = display as unknown as Record<string, unknown> | null | undefined;
  if (!snap || typeof snap !== 'object') return 'missing frozen source snapshot';
  return null;
}

function revalidateScheduledEntry(
  entry: SrsTraversalPlanEntry,
  currentById: ReadonlyMap<string, SrsScheduleRecord>,
  currentSourceById?: ReadonlyMap<string, SrsSourceVersion>,
): string | null {




  const scheduleShapeReason = validateFrozenScheduleShape(entry.frozenSchedule);
  if (scheduleShapeReason) return scheduleShapeReason;
  const displayShapeReason = validateDisplaySnapshotShape(entry.frozenSource);
  if (displayShapeReason) return displayShapeReason;
  // Validate BOTH persisted source snapshots' discriminant + finite revision unconditionally (before
  // any live-map short-circuit): the schedule-side source and the separate display-side source.
  const frozenScheduleSourceReason = revalidateSource(entry.targetId, entry.frozenSchedule.source, currentSourceById);
  if (frozenScheduleSourceReason) return frozenScheduleSourceReason;
  const frozenDisplaySourceReason = revalidateSource(entry.targetId, entry.frozenSource.source, currentSourceById);
  if (frozenDisplaySourceReason) return frozenDisplaySourceReason;

  const f = entry.frozenSchedule;
  const current = currentById.get(entry.targetId);
  if (!current) return 'schedule row no longer present';
  if (current.status !== 'active') return `target is now ${current.status}`;
  // Fail closed on a non-finite live due instant (the frozen side was checked unconditionally above).
  if (!Number.isFinite(current.dueAt)) return 'non-finite dueAt';
  if (current.targetRevision !== f.targetRevision) return 'targetRevision superseded (decision replaced)';
  if (current.scheduleRevision !== f.scheduleRevision) return 'scheduleRevision advanced';
  if (current.configId !== f.configId) return 'configId changed';
  if (current.configVersion !== f.configVersion) return 'configVersion changed';
  if (current.stepIndex !== f.stepIndex) return 'stepIndex changed';
  if (current.dueAt !== f.dueAt) return 'dueAt changed';
  return null;
}

function revalidateSource(
  targetId: string,
  frozen: SrsSourceVersion,
  currentSourceById?: ReadonlyMap<string, SrsSourceVersion>,
): string | null {




  const snap = frozen as unknown as { kind?: unknown; sourceRevision?: unknown } | null | undefined;
  if (!snap || typeof snap !== 'object') return 'missing source snapshot';
  // 2. Closed discriminant set: `kind` must be exactly `linked` or `unlinked`. Any other value (e.g. a
  //    forged `{kind:'forged'}`) fails closed and is NEVER treated as "effectively unlinked".
  if (snap.kind !== 'linked' && snap.kind !== 'unlinked') return 'unknown source discriminant';
  // 3. Finite check on the only numeric source field — a `linked` revision must be finite (NaN OR
  //    ±Infinity both invalid), even when no live source map is supplied.
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

































/** Scope selection for a Learn traversal (P2-ORP-9 LOCKED base :981-985): the full authored line, the
 *  line minus its first ~3 learner moves (board starts at that FEN), or only the critical tail beginning
 *  at the nearest meaningful authored branch point before the target. */
export type LearnScope = 'full' | 'skip-first-3' | 'critical-tail';

/** Number of leading learner steps `skip-first-3` removes (P2-ORP-9 "skip first ~3"). */
const SKIP_FIRST_N = 3;

/**
 * Pure input to `buildLearnSteps`. All authored material is supplied by the caller (D8 / D10b); the
 * builder reads no IDB/DOM/tree and mints nothing.
 */
export interface BuildLearnStepsInput {
  /** The authored learner-side decisions, in traversal order (a single authored line). */
  readonly line: readonly LessonDecision[];
  /**
   * Authored siblings at a given lead-in position. The builder computes each step's lead-in as
   * `leadInPathOf(authoredPath)` (an AUTHORED PATH, never a FEN) and asks for the siblings there, so
   * transpositions reaching the same FEN by a different authored path stay distinct (P2-ORP-17). The
   * decision itself is excluded from its own siblings. Omit ⇒ no siblings.
   */
  readonly siblingsAt?: (leadInPath: TreePath) => readonly LessonDecision[];
  /** Authored opponent reply that follows a learner move, keyed by the learner decision's id. These are
   *  authored only — Stockfish never selects a Learn reply (P2-ORP-16). Omit ⇒ no replies. */
  readonly replies?: ReadonlyMap<string, LearnReply>;
  /** Authored content keyed by `decisionId` — the SAME map `createLearnController` consumes. Accepted
   *  here so the call site passes one coherent bundle; the `LearnStep` shape embeds no content, so the
   *  builder does not read it (the controller resolves prompts/hints/explanations from it at runtime). */
  readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  /**
   * The `decisionId`s THIS session scores. SESSION-RELATIVE target labeling keys off this set (see the
   * load-bearing rule above). Empty set ⇒ the D8 single-line convenience: every Required decision on the
   * line is a target (equivalent to passing all of the line's Required ids explicitly). A due-review
   * session (D10b) always passes a NON-EMPTY set (the plan's scored entries), so the strict
   * session-relative rule governs it.
   */
  readonly targetIds: ReadonlySet<string>;
  readonly scope: LearnScope;
  /** For `critical-tail`: the branch-point POSITION path the tail begins at (P2-ORP-9 "critical tail
   *  begins at the nearest meaningful authored branch point before the target"). Ignored otherwise. */
  readonly criticalTailStartPath?: TreePath;
}

/** The lead-in (parent-position) path: the authored path minus its final 2-char node id. Mirrors D1's
 *  private `leadInPathOf` (material.ts:249) — grouping by this authored path, NOT by FEN, is what keeps
 *  transpositions distinct (P2-ORP-17). */
function leadInPathOf(authoredPath: TreePath): TreePath {
  return authoredPath.length >= 2 ? authoredPath.slice(0, -2) : '';
}

/**
 * The SESSION-RELATIVE target/context decision — the load-bearing rule. `target` requires BOTH SRS
 * enrollability (Required trainability, material.ts:226-228) AND membership in this session's
 * `targetIds`; everything else — including a Required, due decision that is merely a shared PREFIX for a
 * later target in the same replay — is `context`. The empty-`targetIds` D8 single-line convenience
 * treats every enrollable decision as a target.
 */
function stepKindFor(
  decision: LessonDecision,
  targetIds: ReadonlySet<string>,
  targetEveryEnrollable: boolean,
): LearnStepKind {
  if (!isSrsEnrollable(decision)) return 'context'; // non-Required is NEVER a target
  if (targetEveryEnrollable) return 'target';        // empty set ⇒ D8 single-line: the line's Required
  return targetIds.has(decision.identity.decisionId) ? 'target' : 'context';
}

/** Apply the scope selection AFTER labeling: trimmed prefix moves are REMOVED entirely (never relabeled),
 *  and every surviving step keeps its already-computed target/context label (D10 consult §2). */
function trimScope(
  steps: readonly LearnStep[],
  scope: LearnScope,
  criticalTailStartPath: TreePath | undefined,
): readonly LearnStep[] {
  if (scope === 'skip-first-3') {
    return steps.slice(Math.min(SKIP_FIRST_N, steps.length));
  }
  if (scope === 'critical-tail') {
    const start = criticalTailStartPath ?? '';
    if (start === '') return steps; // root branch point ⇒ the whole line is the critical tail
    // Keep only moves PLAYED FROM the branch point onward: a decision whose lead-in position is at or
    // below `start` (the move that merely REACHES the branch point has a shorter lead-in and is dropped —
    // the board starts already at that position). Prefix matching on 2-char-aligned authored paths.
    return steps.filter((step) => leadInPathOf(step.target.identity.authoredPath).startsWith(start));
  }
  return steps; // 'full'
}

/**
 * Build the ordered `LearnStep[]` for one authored line under a session's scoring scope. Pure and
 * deterministic: same input ⇒ same output, no IDB/DOM/clock, no scheduler. Output is EXACTLY D7's
 * `LearnStep` shape, so `createLearnController({ steps, content, timer, … })` consumes it verbatim.
 *
 * Only LEARNER-side decisions become steps; authored OPPONENT replies attach as the preceding step's
 * `reply` (never their own step). Target/context labeling is session-relative (see `stepKindFor` / the
 * load-bearing rule); scope trimming runs last and preserves labels.
 */
export function buildLearnSteps(input: BuildLearnStepsInput): readonly LearnStep[] {
  const { line, targetIds, scope, siblingsAt, replies } = input;
  const targetEveryEnrollable = targetIds.size === 0;

  // 1. Label every learner step SESSION-RELATIVELY (before any scope trimming), attach authored siblings
  //    (grouped by authored lead-in path, self excluded) and the authored opponent reply if any.
  const labeled: LearnStep[] = line.map((decision) => {
    const kind = stepKindFor(decision, targetIds, targetEveryEnrollable);
    const leadIn = leadInPathOf(decision.identity.authoredPath);
    const siblings = (siblingsAt ? siblingsAt(leadIn) : []).filter(
      (s) => s.identity.decisionId !== decision.identity.decisionId,
    );
    const reply = replies?.get(decision.identity.decisionId);
    // Under exactOptionalPropertyTypes, `reply` must be OMITTED (not set to undefined) when absent.
    return reply === undefined
      ? { kind, target: decision, siblings }
      : { kind, target: decision, siblings, reply };
  });

  // 2. Apply scope selection (removes prefix moves entirely; survivors keep their labels).
  return trimScope(labeled, scope, input.criticalTailStartPath);
}
