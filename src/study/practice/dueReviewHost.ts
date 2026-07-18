

















import {
  assembleDueReviewSession,
  buildDueReviewScorecard,
  buildDueReviewSessionRow,
  buildLearnSteps,
  resumeDueReviewSession,
  upcomingTargets,
  type DueReviewScorecard,
  type DueReviewSession,
  type DueReviewTargetMaterial,
  type DueReviewTargetReplay,
  type LearnScope,
} from './sessionBuilder';
import { createRepairCycleDriver, type LearnTargetCompletion, type RepairCycleDriver } from './drillCtrl';
import { applyOrpDecisionOutcome } from './orpSrsAdapter';
import { validateLadderConfig } from './scheduler';
import type { SrsDueCandidateInput } from './sessionBuilder';
import type {
  SrsLadderConfig,
  SrsPracticeSessionRow,
  SrsScheduleRecord,
  SrsSessionProgress,
  SrsTraversalPlanEntry,
  SrsValidatedLadderConfig,
} from './srsTypes';
import type { LessonDecision } from './material';
import type { LessonModel } from './lessonExtract';
import { loadLearnLessonBundle } from './lessonHost';
import {
  completeStudySrsAttempt,
  getPracticeSession,
  getPracticeSrs,
  getStudy,
  listDuePracticeSrs,
  savePracticeSession,
} from '../studyDb';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * The register-ratified ORP review ladder — `4h → 1d → 3d → 7d → 14d → 30d → 90d → 180d`
 * (PHASE_2_TRACKS.md cross-track SRS primitive; Package A). Validated once at host start; the host
 * refuses to run on an invalid config rather than improvising scheduling numbers.
 */
export const ORP_DEFAULT_LADDER: SrsLadderConfig = {
  configId: 'orp-default',
  configVersion: 1,
  intervalsMs: [4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY],
  resetStep: 0,
  advanceBy: 1,
};

/** Injectable persistence/material seams (real defaults; tests inject fakes — no IndexedDB). */
export interface DueReviewHostDeps {
  readonly listDuePracticeSrs: typeof listDuePracticeSrs;
  readonly getPracticeSrs: typeof getPracticeSrs;
  readonly getPracticeSession: typeof getPracticeSession;
  readonly savePracticeSession: typeof savePracticeSession;
  readonly completeStudySrsAttempt: typeof completeStudySrsAttempt;
  readonly loadLearnLessonBundle: typeof loadLearnLessonBundle;
  readonly getStudy: typeof getStudy;
  readonly now: () => number;
  readonly mintId: () => string;
}

function realDeps(): DueReviewHostDeps {
  return {
    listDuePracticeSrs,
    getPracticeSrs,
    getPracticeSession,
    savePracticeSession,
    completeStudySrsAttempt,
    loadLearnLessonBundle,
    getStudy,
    now: () => Date.now(),
    mintId: () => crypto.randomUUID(),
  };
}

export interface StartDueReviewInput {
  /** Scope to one lesson (a Study) or, when absent, all due rows up to `limit`. */
  readonly lessonId?: string;
  readonly limit?: number;
  readonly scope?: LearnScope;
  readonly learnerSideFor?: (lessonId: string) => 'white' | 'black';
}

export type StartDueReviewResult =
  | { readonly ok: true; readonly runtime: DueReviewHostRuntime }
  | { readonly ok: false; readonly reason: 'no-due' | 'load-failed' | 'config-invalid' };

export type ResumeDueReviewResult =
  | { readonly ok: true; readonly runtime: DueReviewHostRuntime; readonly droppedTargetIds: readonly string[] }
  | { readonly ok: false; readonly reason: 'no-session' | 'load-failed' | 'config-invalid' };

/** One completed-target application result (the host's ONE awaited write). */
export type CompleteTargetResult =
  | { readonly applied: true; readonly done: boolean }
  | {
      readonly applied: false;
      readonly reason: 'wrong-target' | 'schedule-missing' | 'no-op' | 'persist-failed';
      readonly done: boolean;
    };

/**
 * The live due-review runtime a mount drives: present `currentReplay()`'s steps in the Learn
 * controller with `onTargetComplete` wired to `completeTarget` → advance → repair cycle → scorecard.
 */
export interface DueReviewHostRuntime {
  readonly session: DueReviewSession;
  readonly sessionId: string;
  /** The replay the mount should present next, or undefined when nothing deliverable remains. */
  currentReplay(): DueReviewTargetReplay | undefined;
  /** Apply ONE completed scored target: D9 translate → atomic persist → durable cursor advance. */
  completeTarget(completion: LearnTargetCompletion): Promise<CompleteTargetResult>;
  /** P2-ORP-5 interleaved repair driver over the failed/assisted targets recorded so far. */
  repairDriver(): RepairCycleDriver;
  /** Session-end scorecard projection over the emitted first attempts. */
  scorecard(folderOf?: (targetId: string) => string): DueReviewScorecard;
  /** Upcoming-load preview from the frozen plan past the cursor. */
  upcoming(limit: number): readonly SrsTraversalPlanEntry[];
  /** The full E3 model for a replay's lesson — the mount assembles `LearnViewConfig` from it. */
  viewMaterialFor(lessonId: string): LessonModel | undefined;
}

interface LessonMaterialBundle {
  readonly line: readonly LessonDecision[];
  readonly material: DueReviewTargetMaterial;
  /** The full E3 model — the mount builds each replay's `LearnViewConfig` material from this. */
  readonly model: LessonModel;
}

/** Load one E3 bundle per distinct lesson. A lesson whose material fails to load is OMITTED — its
 *  rows become undeliverable (the D10b drop semantic; schedule rows untouched). A REJECTED read is
 *  a whole-load failure (fail-closed). */
async function loadLessonBundles(
  lessonIds: readonly string[],
  learnerSideFor: ((lessonId: string) => 'white' | 'black') | undefined,
  deps: DueReviewHostDeps,
): Promise<{ bundles: Map<string, LessonMaterialBundle>; labels: Map<string, string> } | null> {
  const bundles = new Map<string, LessonMaterialBundle>();
  const labels = new Map<string, string>();
  for (const lessonId of lessonIds) {
    const learnerSide = learnerSideFor?.(lessonId) ?? 'white';
    let loaded;
    let item;
    try {
      loaded = await deps.loadLearnLessonBundle({ studyItemId: lessonId, learnerSide });
      item = await deps.getStudy(lessonId);
    } catch {
      return null;
    }
    if (!loaded.ok) continue;
    const model = loaded.bundle.model;
    bundles.set(lessonId, {
      line: model.line,
      material: {
        line: model.line,
        siblingsAt: model.siblingsAt,
        replies: model.replies,
        content: model.content,
      },
      model,
    });
    labels.set(lessonId, item?.title ?? lessonId);
  }
  return { bundles, labels };
}

function materialProvider(
  bundles: ReadonlyMap<string, LessonMaterialBundle>,
): (entry: SrsTraversalPlanEntry) => DueReviewTargetMaterial | null {
  return (entry) => {
    const bundle = bundles.get(entry.lessonId);
    if (!bundle) return null;
    // The target must exist in the lesson's line — material for a vanished decision is undeliverable.
    if (!bundle.line.some(d => d.identity.decisionId === entry.targetId)) return null;
    return bundle.material;
  };
}

/**
 * Start (assemble + persist) a due-review session. Fail-closed: a rejected read, an invalid ladder
 * config, or zero deliverable due targets yields a typed refusal — never a half-assembled session.
 */
export async function startDueReviewSession(
  input: StartDueReviewInput = {},
  deps: DueReviewHostDeps = realDeps(),
): Promise<StartDueReviewResult> {
  const validation = validateLadderConfig(ORP_DEFAULT_LADDER);
  if (!validation.ok) return { ok: false, reason: 'config-invalid' };
  const config = validation.config;

  const now = deps.now();
  const limit = input.limit ?? 50;

  let dueRows: readonly SrsScheduleRecord[];
  try {
    const read = await deps.listDuePracticeSrs({
      now, limit, ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}),
    });
    if (!read.ok) return { ok: false, reason: 'load-failed' };
    dueRows = read.value;
  } catch {
    return { ok: false, reason: 'load-failed' };
  }
  if (dueRows.length === 0) return { ok: false, reason: 'no-due' };

  const lessonIds = [...new Set(dueRows.map(r => r.lessonId))];
  const loaded = await loadLessonBundles(lessonIds, input.learnerSideFor, deps);
  if (loaded === null) return { ok: false, reason: 'load-failed' };
  const { bundles, labels } = loaded;

  const candidates: SrsDueCandidateInput[] = dueRows
    .filter(r => bundles.has(r.lessonId))
    .map(r => ({
      record: r,
      meta: { display: { label: labels.get(r.lessonId) ?? r.lessonId, source: { kind: 'unlinked' } } },
    }));
  if (candidates.length === 0) return { ok: false, reason: 'no-due' };

  const session = assembleDueReviewSession({
    sessionId: deps.mintId(),
    traversalId: deps.mintId(),
    createdAt: now,
    candidates,
    query: {
      now,
      scopeLessonIds: input.lessonId !== undefined ? [input.lessonId] : lessonIds,
      limit,
    },
    scope: input.scope ?? 'full',
    materialFor: materialProvider(bundles),
  });
  if (session.replays.length === 0) return { ok: false, reason: 'no-due' };

  // Persist the frozen session row IMMEDIATELY so an interrupt before the first completion is
  // still a resumable (empty-progress) session.
  const primaryLessonId = input.lessonId ?? session.plan.entries[0]!.lessonId;
  try {
    await deps.savePracticeSession(buildDueReviewSessionRow({
      plan: session.plan, lessonId: primaryLessonId, createdAt: now, updatedAt: now,
    }));
  } catch {
    return { ok: false, reason: 'load-failed' };
  }

  const fresh: SrsSessionProgress = { entryCursor: 0, completedTargetIds: [], appliedAttemptIds: [] };
  return { ok: true, runtime: createRuntime(session, primaryLessonId, config, deps, fresh, bundles) };
}

/**
 * Resume a persisted (partial/active) session row: live schedule rows are re-read and the frozen
 * plan revalidated (`resumeDueReviewSession`); drifted entries are DROPPED (never replayed),
 * completed entries stay completed, and the remaining replays are rebuilt from fresh material. The
 * carried cursor is preserved — first attempts already persisted stay the append-only truth.
 */
export async function resumePersistedDueReview(
  sessionId: string,
  input: Pick<StartDueReviewInput, 'scope' | 'learnerSideFor'> = {},
  deps: DueReviewHostDeps = realDeps(),
): Promise<ResumeDueReviewResult> {
  const validation = validateLadderConfig(ORP_DEFAULT_LADDER);
  if (!validation.ok) return { ok: false, reason: 'config-invalid' };
  const config = validation.config;

  let row: SrsPracticeSessionRow;
  try {
    const read = await deps.getPracticeSession(sessionId);
    if (read === null) return { ok: false, reason: 'no-session' };
    if (!read.ok) return { ok: false, reason: 'load-failed' };
    row = read.value;
  } catch {
    return { ok: false, reason: 'load-failed' };
  }

  // Live schedule reads for the revalidation (frozen plan vs current rows).
  const currentById = new Map<string, SrsScheduleRecord>();
  for (const entry of row.plan.entries) {
    let current: SrsScheduleRecord | undefined;
    try {
      current = await deps.getPracticeSrs(entry.targetId);
    } catch {
      return { ok: false, reason: 'load-failed' };
    }
    if (current !== undefined) currentById.set(entry.targetId, current);
  }
  const resume = resumeDueReviewSession(row, currentById);

  const lessonIds = [...new Set(resume.resumableEntries.map(e => e.lessonId))];
  const loaded = await loadLessonBundles(lessonIds, input.learnerSideFor, deps);
  if (loaded === null) return { ok: false, reason: 'load-failed' };
  const provider = materialProvider(loaded.bundles);

  const scope = input.scope ?? 'full';
  const replays: DueReviewTargetReplay[] = [];
  for (const entry of resume.resumableEntries) {
    const material = provider(entry);
    if (!material) continue; // undeliverable on resume — dropped like a drifted entry
    replays.push({
      targetId: entry.targetId,
      lessonId: entry.lessonId,
      steps: buildLearnSteps({
        line: material.line,
        targetIds: new Set([entry.targetId]),
        scope,
        content: material.content,
        ...(material.siblingsAt ? { siblingsAt: material.siblingsAt } : {}),
        ...(material.replies ? { replies: material.replies } : {}),
        ...(material.criticalTailStartPath ? { criticalTailStartPath: material.criticalTailStartPath } : {}),
      }),
    });
  }

  const session: DueReviewSession = { plan: row.plan, replays, scope };
  const runtime = createRuntime(session, row.lessonId, config, deps, row.progress, loaded.bundles);
  return { ok: true, runtime, droppedTargetIds: resume.droppedTargetIds };
}

function createRuntime(
  session: DueReviewSession,
  primaryLessonId: string,
  config: SrsValidatedLadderConfig,
  deps: DueReviewHostDeps,
  initialProgress: SrsSessionProgress,
  bundles: ReadonlyMap<string, LessonMaterialBundle>,
): DueReviewHostRuntime {
  let progress: SrsSessionProgress = initialProgress;
  const firstAttempts: LearnTargetCompletion['attempt'][] = [];
  const failedTargetIds: string[] = [];
  const createdAt = session.plan.createdAt;
  const replayByTargetId = new Map(session.replays.map(r => [r.targetId, r]));

  const completedSet = (): Set<string> => new Set(progress.completedTargetIds);

  /** The next incomplete plan entry that HAS a deliverable replay (drifted/undeliverable entries are
   *  skipped for presentation but never marked completed — their schedule rows stay live). */
  const nextDeliverableEntry = (): SrsTraversalPlanEntry | undefined => {
    const done = completedSet();
    for (const entry of session.plan.entries) {
      if (done.has(entry.targetId)) continue;
      if (replayByTargetId.has(entry.targetId)) return entry;
    }
    return undefined;
  };

  const sessionDone = (): boolean => nextDeliverableEntry() === undefined;

  const persistProgress = async (): Promise<boolean> => {
    try {
      await deps.savePracticeSession(buildDueReviewSessionRow({
        plan: session.plan, lessonId: primaryLessonId, createdAt, updatedAt: deps.now(), progress,
      }));
      return true;
    } catch {
      return false;
    }
  };

  const completeTarget = async (completion: LearnTargetCompletion): Promise<CompleteTargetResult> => {
    const entry = nextDeliverableEntry();
    if (entry === undefined || completion.attempt.targetId !== entry.targetId) {
      return { applied: false, reason: 'wrong-target', done: sessionDone() };
    }

    // LIVE schedule read at completion (the plan is frozen; scheduling applies to current state).
    let current: SrsScheduleRecord | undefined;
    try {
      current = await deps.getPracticeSrs(entry.targetId);
    } catch {
      return { applied: false, reason: 'schedule-missing', done: sessionDone() };
    }
    if (current === undefined) return { applied: false, reason: 'schedule-missing', done: sessionDone() };

    // Resolve the PLAYED decision for the D9 input from the replay's steps (target or sibling).
    const replay = replayByTargetId.get(entry.targetId)!;
    const cuedStep = replay.steps.find(s => s.target.identity.decisionId === completion.cuedDecisionId);
    if (cuedStep === undefined) return { applied: false, reason: 'wrong-target', done: sessionDone() };
    const played = completion.outcome.playedDecisionId === null
      ? cuedStep.target
      : cuedStep.target.identity.decisionId === completion.outcome.playedDecisionId
        ? cuedStep.target
        : cuedStep.siblings.find(s => s.identity.decisionId === completion.outcome.playedDecisionId) ?? cuedStep.target;

    const result = applyOrpDecisionOutcome({
      outcome: completion.outcome,
      decision: played,
      cuedDecisionId: completion.cuedDecisionId,
      current,
      config,
      attemptId: completion.attempt.attemptId,
      sessionId: session.plan.sessionId,
      traversalId: session.plan.traversalId,
      mode: 'due-review',
      reviewKind: entry.reviewKind,
      completedAt: deps.now(),
      snapshot: entry.frozenSource,
    });

    firstAttempts.push(completion.attempt);
    if (completion.attempt.firstAttemptResult !== 'clean') failedTargetIds.push(completion.attempt.targetId);

    if (result.kind === 'no-op') {
      // Adapter guard refused (target mismatch / inactive row / …): nothing persists, target stays.
      return { applied: false, reason: 'no-op', done: sessionDone() };
    }

    // THE one awaited write: attempt + schedule + checkpoint, atomic inside studyDb. Immediate —
    // never batched (interrupt after k ⇒ 1..k persisted).
    try {
      const persisted = await deps.completeStudySrsAttempt({ attempt: result.attempt, config, now: deps.now() });
      if (persisted.outcome !== 'applied') return { applied: false, reason: 'persist-failed', done: sessionDone() };
    } catch {
      return { applied: false, reason: 'persist-failed', done: sessionDone() };
    }

    const done = new Set(progress.completedTargetIds);
    done.add(entry.targetId);
    // Cursor = index of the first entry not yet completed (the row invariant's "next unattempted").
    let cursor = 0;
    while (cursor < session.plan.entries.length && done.has(session.plan.entries[cursor]!.targetId)) cursor++;
    progress = {
      entryCursor: cursor,
      completedTargetIds: [...progress.completedTargetIds, entry.targetId],
      appliedAttemptIds: [...progress.appliedAttemptIds, completion.attempt.attemptId],
    };
    // Durable cursor advance rides the same completion. A failed row-save still leaves the ATTEMPT
    // persisted (append-only truth) — resume revalidation reconciles; surface it as persist-failed.
    const savedRow = await persistProgress();
    if (!savedRow) return { applied: false, reason: 'persist-failed', done: sessionDone() };
    return { applied: true, done: sessionDone() };
  };

  return {
    session,
    sessionId: session.plan.sessionId,
    currentReplay: () => {
      const entry = nextDeliverableEntry();
      return entry === undefined ? undefined : replayByTargetId.get(entry.targetId);
    },
    completeTarget,
    repairDriver: () => createRepairCycleDriver({ failedTargetIds }),
    scorecard: (folderOf = () => 'Review') => buildDueReviewScorecard({ firstAttempts, folderOf }),
    upcoming: (limit: number) => upcomingTargets(session.plan, progress, limit),
    viewMaterialFor: (lessonId: string) => bundles.get(lessonId)?.model,
  };
}
