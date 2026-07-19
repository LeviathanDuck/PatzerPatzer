












import {
  buildTraversalPlan,
  selectDueTargets,
  type DueReviewScorecard,
  type DueReviewSession,
  type SrsDueCandidateInput,
  type SrsScoredPlanCandidate,
} from './sessionBuilder';
import type { SrsPracticeSessionRow, SrsScheduleRecord, SrsSessionState } from './srsTypes';
import type { ReviewTabData, ProgressTabData } from './practiceView';
import {
  getStudy,
  listDuePracticeSrs,
  listPracticeAttemptsByDecision,
  listPracticeDecisionsByLesson,
  listPracticeSessionsByState,
  listPracticeSessionsByLesson,
  listPracticeLinesBounded,
  getPositionProgressForKeys,
} from '../studyDb';
import { buildLearnSession } from './sessionBuilder';
import { positionKey } from './scheduler';
import { resolveOrpSettings, readOrpSessionOverride } from './settings';
import { readOrpGlobalDefaults } from '../../sync/settingsLiveApply';
import type { TrainableSequence } from '../types';

/** Bounded read caps (CR-2 discipline). */
const DUE_PREVIEW_LIMIT = 50;
const RESUMABLE_SCAN_LIMIT = 25;
const DECISION_LIMIT = 500;
const ATTEMPTS_PER_DECISION_LIMIT = 50;
const LEARN_LINES_SCAN_LIMIT = 25;

export interface PracticePanelDataDeps {
  readonly listDuePracticeSrs: typeof listDuePracticeSrs;


  readonly listPracticeLinesBounded: typeof listPracticeLinesBounded;
  readonly getPositionProgressForKeys: typeof getPositionProgressForKeys;
  readonly listPracticeSessionsByState: typeof listPracticeSessionsByState;
  readonly listPracticeSessionsByLesson: typeof listPracticeSessionsByLesson;
  readonly listPracticeDecisionsByLesson: typeof listPracticeDecisionsByLesson;
  readonly listPracticeAttemptsByDecision: typeof listPracticeAttemptsByDecision;
  readonly getStudy: typeof getStudy;
  readonly now: () => number;
}

const REAL_DEPS: PracticePanelDataDeps = {
  listDuePracticeSrs,
  listPracticeLinesBounded,
  getPositionProgressForKeys,
  listPracticeSessionsByState,
  listPracticeSessionsByLesson,
  listPracticeDecisionsByLesson,
  listPracticeAttemptsByDecision,
  getStudy,
  now: () => Date.now(),
};

/** The panel feed: per-tab data WITHOUT callbacks (the host attaches Start/Resume — view
 *  callbacks are surface concerns) plus the resumable session id when one exists. */

export interface GlobalLearnEntry {
  readonly id: string;
  readonly label: string;
  readonly sequence: TrainableSequence;
}

export interface StudyPracticePanelData {
  readonly review: ReviewTabData;
  readonly progress: ProgressTabData;



  readonly learn?: readonly GlobalLearnEntry[];


  readonly progressTruncated?: boolean;
  readonly resumableSessionId?: string;
  readonly nowMs: number;
}

/** Build the Review preview: a PURE plan over the due rows under synthetic ids. Never persisted. */
function buildReviewPreview(
  dueRows: readonly SrsScheduleRecord[],
  label: string,
  nowMs: number,
): DueReviewSession {
  const candidates: SrsDueCandidateInput[] = dueRows.map(record => ({
    record,
    meta: { display: { label, source: { kind: 'unlinked' } } },
  }));
  const due = selectDueTargets(candidates, {
    now: nowMs,
    scopeLessonIds: [...new Set(dueRows.map(r => r.lessonId))],
    limit: DUE_PREVIEW_LIMIT,
  });
  const scored: SrsScoredPlanCandidate[] = due.map(d => ({
    due: d,
    frozenSource: { label, source: { kind: 'unlinked' } },
  }));
  const plan = buildTraversalPlan({
    sessionId: 'panel-preview',
    traversalId: 'panel-preview',
    createdAt: nowMs,
    scored,
  });
  return { plan, replays: [], scope: 'full' };
}




async function findResumableSession(
  lessonId: string,
  deps: PracticePanelDataDeps,
): Promise<string | undefined> {
  const rows = await deps.listPracticeSessionsByLesson(lessonId, ['partial', 'active'], RESUMABLE_SCAN_LIMIT);
  const partial = rows.find(r => r.state === 'partial');
  return (partial ?? rows[0])?.sessionId;
}

/** Fold persisted first-attempt results into the scorecard shape (single Study folder). */
async function buildProgressScorecard(
  lessonId: string,
  label: string,
  deps: PracticePanelDataDeps,
): Promise<{ scorecard: DueReviewScorecard; truncated: boolean } | 'empty'> {


  const decisions = await deps.listPracticeDecisionsByLesson(lessonId, DECISION_LIMIT + 1);
  let truncated = decisions.length > DECISION_LIMIT;
  const folded = decisions.slice(0, DECISION_LIMIT);
  let clean = 0;
  let failed = 0;
  let assisted = 0;
  for (const decision of folded) {
    const attempts = await deps.listPracticeAttemptsByDecision(decision.decisionId, ATTEMPTS_PER_DECISION_LIMIT + 1);
    if (attempts.length > ATTEMPTS_PER_DECISION_LIMIT) truncated = true;
    for (const attempt of attempts.slice(0, ATTEMPTS_PER_DECISION_LIMIT)) {
      if (attempt.assistanceTypes.length > 0) assisted++;
      else if (attempt.firstAttemptResult === 'clean') clean++;
      else failed++;
    }
  }
  const total = clean + failed + assisted;
  if (total === 0) return 'empty';
  const accuracy = clean / total;
  return {
    scorecard: {
      folders: [{ folder: label, total, clean, failed, assisted, accuracy }],
      total, clean, failed, assisted, accuracy,
    },
    truncated,
  };
}

/**
 * Load the live panel feed for one open Study. Per-tab fail-closed: each tab independently lands
 * on ready/empty/error so one failed read never blanks the whole panel.
 */






export async function loadGlobalPracticePanelData(
  deps: PracticePanelDataDeps = REAL_DEPS,
): Promise<StudyPracticePanelData> {
  const nowMs = deps.now();
  let review: ReviewTabData;
  let resumableSessionId: string | undefined;
  try {
    const read = await deps.listDuePracticeSrs({ now: nowMs, limit: DUE_PREVIEW_LIMIT });
    if (!read.ok) {
      review = { status: 'error', message: 'Could not load your review schedule.' };
    } else {
      for (const state of ['partial', 'active'] as SrsSessionState[]) {
        if (resumableSessionId !== undefined) break;
        const results = await deps.listPracticeSessionsByState(state, RESUMABLE_SCAN_LIMIT);
        for (const result of results) {
          if (result.ok) { resumableSessionId = result.value.sessionId; break; }
        }
      }
      if (read.value.length === 0 && resumableSessionId === undefined) {
        review = { status: 'empty' };
      } else {
        review = {
          status: 'ready',
          session: buildReviewPreview(read.value, 'All Studies', nowMs),
          upcoming: [],
          nowMs,
          resumable: resumableSessionId !== undefined,
        };
      }
    }
  } catch {
    review = { status: 'error', message: 'Could not load your review schedule.' };
  }
  let learn: readonly GlobalLearnEntry[] | undefined;
  try {



    const lines = await deps.listPracticeLinesBounded(LEARN_LINES_SCAN_LIMIT);
    const activeSequences = lines.filter(seq => seq.status === 'active');
    if (activeSequences.length === 0) {
      learn = [];
    } else {
      const keys = [...new Set(activeSequences.flatMap(seq => seq.fens.map(positionKey)))];
      const progressList = await deps.getPositionProgressForKeys(keys);
      const progressMap = new Map(progressList.map(pr => [pr.key, pr]));
      const newSequences = buildLearnSession(activeSequences, progressMap);
      const cap = Math.max(1, resolveOrpSettings(readOrpGlobalDefaults(), undefined, readOrpSessionOverride(nowMs), nowMs).values.newPerSession);
      learn = newSequences.slice(0, cap).map(sequence => ({ id: sequence.id, label: sequence.label, sequence }));
    }
  } catch {
    learn = undefined; // the tab surfaces its own error state when the feed is absent
  }
  return {
    review,
    progress: { status: 'empty' },
    ...(learn !== undefined ? { learn } : {}),
    ...(resumableSessionId !== undefined ? { resumableSessionId } : {}),
    nowMs,
  };
}




export async function listRecentProgressLessons(
  deps: PracticePanelDataDeps = REAL_DEPS,
): Promise<readonly { readonly lessonId: string; readonly label: string }[]> {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const state of ['partial', 'active', 'completed'] as SrsSessionState[]) {
    if (ordered.length >= 10) break;
    let results: Awaited<ReturnType<PracticePanelDataDeps['listPracticeSessionsByState']>>;
    try {
      results = await deps.listPracticeSessionsByState(state, RESUMABLE_SCAN_LIMIT);
    } catch {
      continue; // a failed state scan narrows the list; the others still surface
    }
    for (const result of results) {
      if (!result.ok) continue;
      const id = result.value.lessonId;
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
      if (ordered.length >= 10) break;
    }
  }
  const out: { lessonId: string; label: string }[] = [];
  for (const lessonId of ordered) {
    let label = lessonId;
    try {
      const item = await deps.getStudy(lessonId);
      if (item !== undefined) label = item.title;
    } catch { /* label falls back to the id */ }
    out.push({ lessonId, label });
  }
  return out;
}



export async function loadLessonProgress(
  lessonId: string,
  deps: PracticePanelDataDeps = REAL_DEPS,
): Promise<ProgressTabData> {
  let label = lessonId;
  try {
    const item = await deps.getStudy(lessonId);
    if (item !== undefined) label = item.title;
  } catch { /* id label */ }
  try {
    const folded = await buildProgressScorecard(lessonId, label, deps);
    if (folded === 'empty') return { status: 'empty' };
    return { status: 'ready', scorecard: folded.scorecard };
  } catch {
    return { status: 'error', message: 'Could not load your accuracy history.' };
  }
}

export async function loadStudyPracticePanelData(
  input: { readonly lessonId: string },
  deps: PracticePanelDataDeps = REAL_DEPS,
): Promise<StudyPracticePanelData> {
  const nowMs = deps.now();

  let label = input.lessonId;
  try {
    const item = await deps.getStudy(input.lessonId);
    if (item !== undefined) label = item.title;
  } catch {
    /* label falls back to the lesson id; the tabs still load */
  }

  let review: ReviewTabData;
  let resumableSessionId: string | undefined;
  try {
    const read = await deps.listDuePracticeSrs({ now: nowMs, limit: DUE_PREVIEW_LIMIT, lessonId: input.lessonId });
    if (!read.ok) {
      review = { status: 'error', message: 'Could not load your review schedule.' };
    } else {
      resumableSessionId = await findResumableSession(input.lessonId, deps);
      if (read.value.length === 0 && resumableSessionId === undefined) {
        review = { status: 'empty' };
      } else {
        review = {
          status: 'ready',
          session: buildReviewPreview(read.value, label, nowMs),
          upcoming: [],
          nowMs,
          resumable: resumableSessionId !== undefined,
        };
      }
    }
  } catch {
    review = { status: 'error', message: 'Could not load your review schedule.' };
  }

  let progress: ProgressTabData;
  let progressTruncated = false;
  try {
    const folded = await buildProgressScorecard(input.lessonId, label, deps);
    if (folded === 'empty') {
      progress = { status: 'empty' };
    } else {
      progress = { status: 'ready', scorecard: folded.scorecard };
      progressTruncated = folded.truncated;
    }
  } catch {
    progress = { status: 'error', message: 'Could not load your accuracy history.' };
  }

  return {
    review,
    progress,
    ...(progressTruncated ? { progressTruncated: true } : {}),
    ...(resumableSessionId !== undefined ? { resumableSessionId } : {}),
    nowMs,
  };
}
