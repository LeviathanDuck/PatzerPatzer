















import { validateLadderConfig } from './scheduler';
import { isSrsEnrollable, type LessonDecision } from './material';
import type { LessonModel } from './lessonExtract';
import { decisionRowOf } from './lessonPersistence';
import { ORP_DEFAULT_LADDER } from './dueReviewHost';
import type { LearnTargetCompletion } from './drillCtrl';
import type { SrsScheduleRecord } from './srsTypes';
import {
  enrollStudyPracticeLesson,
  getPracticeLesson,
  type StudyPracticeLessonRow,
} from '../studyDb';

/** Injectable seams (real studyDb defaults; tests inject fakes — no IndexedDB). */
export interface LearnEnrollmentDeps {
  readonly getPracticeLesson: typeof getPracticeLesson;
  readonly enrollStudyPracticeLesson: typeof enrollStudyPracticeLesson;
  readonly now: () => number;
}

const REAL_DEPS: LearnEnrollmentDeps = {
  getPracticeLesson,
  enrollStudyPracticeLesson,
  now: () => Date.now(),
};

export interface EnrollLearnedLineInput {
  readonly studyItemId: string;
  readonly lessonId: string;
  /** The E3 model the Learn session ran on (decisions carry authored classification). */
  readonly model: LessonModel;
  /** The session's per-target completion emits (first-attempt truth for the dueAt policy). */
  readonly completions: readonly LearnTargetCompletion[];
}

export type EnrollLearnedLineResult =
  | { readonly ok: true; readonly outcome: 'enrolled'; readonly decisions: number; readonly srsRows: number }
  | { readonly ok: true; readonly outcome: 'already-enrolled' }
  | { readonly ok: false; readonly reason: 'config-invalid' }
  | { readonly ok: false; readonly reason: 'enroll-failed'; readonly detail: string };

/** Build one PRISTINE initial schedule row (enrollment-contract shape: active, ladder floor, zero
 *  streak, no history; dueAt caller-scheduled per the policy above). */
function initialSrsRow(decision: LessonDecision, lessonId: string, dueAt: number, now: number): SrsScheduleRecord {
  return {
    targetId: decision.identity.decisionId,
    lessonId,
    targetRevision: 1,
    status: 'active',
    scheduleRevision: 1,
    configId: ORP_DEFAULT_LADDER.configId,
    configVersion: ORP_DEFAULT_LADDER.configVersion,
    stepIndex: 0,
    cleanStreak: 0,
    dueAt,
    enrolledAt: now,
    lastCompletedAt: null,
    lastAttemptId: null,
    updatedAt: now,
  } as SrsScheduleRecord;
}

/**
 * Enroll a finished Learn line. Once-only: an existing lesson row (or a duplicate race inside the
 * atomic service) is a typed `already-enrolled` no-op — never a partial write (the service itself
 * is all-or-nothing).
 */
export async function enrollLearnedLine(
  input: EnrollLearnedLineInput,
  deps: LearnEnrollmentDeps = REAL_DEPS,
): Promise<EnrollLearnedLineResult> {
  const validation = validateLadderConfig(ORP_DEFAULT_LADDER);
  if (!validation.ok) return { ok: false, reason: 'config-invalid' };
  const firstIntervalMs = ORP_DEFAULT_LADDER.intervalsMs[0]!;

  // Once-only guard: an enrolled lesson never re-enrolls (subsequent Learn passes are practice;
  // their scheduling lives in the review/kernel path).
  try {
    const existing = await deps.getPracticeLesson(input.lessonId);
    if (existing !== undefined) return { ok: true, outcome: 'already-enrolled' };
  } catch (e) {
    return { ok: false, reason: 'enroll-failed', detail: `lesson read failed: ${String(e)}` };
  }

  const now = deps.now();
  const lesson: StudyPracticeLessonRow = {
    lessonId: input.lessonId,
    studyItemId: input.studyItemId,
    updatedAt: now,
  };

  // Identity rows for EVERY derived decision (E2a-keyed — this producer cannot omit the key);
  // initial SRS rows ONLY for the Required line decisions (P2-ORP-18: nothing else enrolls).
  const decisions = input.model.decisions.map(d => decisionRowOf(d, { status: 'enrolled', now }));

  const cleanTargetIds = new Set(
    input.completions
      .filter(c => c.attempt.firstAttemptResult === 'clean')
      .map(c => c.attempt.targetId),
  );
  const srsRows = input.model.line
    .filter(isSrsEnrollable)
    .map(d => initialSrsRow(
      d,
      input.lessonId,
      cleanTargetIds.has(d.identity.decisionId) ? now + firstIntervalMs : now,
      now,
    ));

  let result;
  try {
    result = await deps.enrollStudyPracticeLesson({ lesson, decisions, srsRows });
  } catch (e) {
    return { ok: false, reason: 'enroll-failed', detail: `enrollment service threw: ${String(e)}` };
  }
  if (result.outcome === 'enrolled') {
    return { ok: true, outcome: 'enrolled', decisions: decisions.length, srsRows: srsRows.length };
  }
  if (result.outcome === 'duplicate') {
    // A concurrent enrollment won the race — the atomic service wrote nothing here.
    return { ok: true, outcome: 'already-enrolled' };
  }
  return { ok: false, reason: 'enroll-failed', detail: `${result.outcome}: ${'reason' in result ? result.reason : ''}` };
}
