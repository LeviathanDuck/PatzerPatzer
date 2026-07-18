





















import { pgnToTree } from '../../tree/pgn';
import type { TreeNode } from '../../tree/types';
import {
  extractLessonModel,
  overlayFromDecisionRows,
  previousFromDecisionRows,
  type LessonModel,
} from './lessonExtract';
import { isSrsEnrollable } from './material';
import type { SrsScheduleRecord } from './srsTypes';
import {
  getStudy,
  listPracticeDecisionsByLesson,
  listAuthoredContentByLesson,
  getPracticeSrs,
  authoredContentFromRow,
} from '../studyDb';
import type { AuthoredLessonContent } from './lessonAuthoring';


export const LESSON_HOST_ROW_LIMIT = 2000;

/** Injectable persistence seams (real studyDb defaults; tests inject rejecting/canned reads). */
export interface LessonHostDeps {
  readonly getStudy: typeof getStudy;
  readonly listPracticeDecisionsByLesson: typeof listPracticeDecisionsByLesson;
  readonly listAuthoredContentByLesson: typeof listAuthoredContentByLesson;
  readonly getPracticeSrs: typeof getPracticeSrs;
  /** PGN → TreeNode parser; defaults to the canonical `pgnToTree`. */
  readonly parsePgn: (pgn: string) => TreeNode;
}

const REAL_LESSON_HOST_DEPS: LessonHostDeps = {
  getStudy,
  listPracticeDecisionsByLesson,
  listAuthoredContentByLesson,
  getPracticeSrs,
  parsePgn: pgnToTree,
};

export interface LoadLearnBundleInput {
  readonly studyItemId: string;
  readonly learnerSide: 'white' | 'black';
  /** Lesson id; defaults to the studyItemId (material.ts convention: lessonId = StudyItem.id). */
  readonly lessonId?: string;






  readonly treatLineAsRequired?: boolean;
}

/** The material bundle plus the session-relative Learn target set. */
export interface LearnLessonBundle {
  readonly model: LessonModel;
  /** Learn split (consult §3): Required decisions whose SRS row is absent or fresh (0/0). */
  readonly targetIds: ReadonlySet<string>;
}

export type LoadLearnBundleResult =
  | { readonly ok: true; readonly bundle: LearnLessonBundle }
  | { readonly ok: false; readonly reason: 'missing-study' | 'parse-failed' | 'load-failed' };

/** A fresh (never cleanly recalled) schedule row still counts as a Learn target (consult §3). */
function isFreshSchedule(row: SrsScheduleRecord): boolean {
  return row.stepIndex === 0 && row.cleanStreak === 0;
}

/**
 * Load a saved Study into the `LearnViewConfig`-ready bundle. Fail-closed: a missing study,
 * unparseable PGN, rejected read, or over-cap row set yields a TYPED refusal — never a bundle with
 * re-minted ids or silently missing overlays.
 */
export async function loadLearnLessonBundle(
  input: LoadLearnBundleInput,
  deps: LessonHostDeps = REAL_LESSON_HOST_DEPS,
): Promise<LoadLearnBundleResult> {
  const lessonId = input.lessonId ?? input.studyItemId;

  let item;
  try {
    item = await deps.getStudy(input.studyItemId);
  } catch {
    return { ok: false, reason: 'load-failed' };
  }
  if (item === undefined) return { ok: false, reason: 'missing-study' };

  let root: TreeNode;
  try {
    root = deps.parsePgn(item.pgn);
  } catch {
    return { ok: false, reason: 'parse-failed' };
  }

  let decisionRows;
  let contentRows;
  try {
    decisionRows = await deps.listPracticeDecisionsByLesson(lessonId, LESSON_HOST_ROW_LIMIT + 1);
    contentRows = await deps.listAuthoredContentByLesson(lessonId, LESSON_HOST_ROW_LIMIT + 1);
  } catch {
    return { ok: false, reason: 'load-failed' };
  }
  if (decisionRows.length > LESSON_HOST_ROW_LIMIT) return { ok: false, reason: 'load-failed' };
  if (contentRows.length > LESSON_HOST_ROW_LIMIT) return { ok: false, reason: 'load-failed' };

  const content = new Map<string, AuthoredLessonContent>();
  for (const row of contentRows) content.set(row.decisionId, authoredContentFromRow(row));

  const rowOverlay = overlayFromDecisionRows(decisionRows);
  const rowIds = new Set(decisionRows.map(r => r.decisionId));
  const decisionOverlay = input.treatLineAsRequired
    ? (base: Parameters<typeof rowOverlay>[0]): ReturnType<typeof rowOverlay> => {
        const overlaid = rowOverlay(base);
        if (rowIds.has(base.identity.decisionId)) return overlaid; // persisted classification wins
        // Mover color from the after-move ply (odd ⇒ white moved — the lessonExtract convention).
        const mover = base.evidence.ply % 2 === 1 ? 'white' : 'black';
        return mover === input.learnerSide ? { ...overlaid, trainability: 'required' } : overlaid;
      }
    : rowOverlay;

  const model = extractLessonModel({
    root,
    lessonId,
    learnerSide: input.learnerSide,
    sourceKind: 'pgn',
    content,
    previous: previousFromDecisionRows(decisionRows, input.learnerSide),
    decisionOverlay,
  });

  // Learn split (consult §3): a Required decision is a Learn target iff its SRS row is absent
  // ("no row => not due") or fresh. Any other row state (learned/suspended/graduated/…) excludes it
  // from Learn — those belong to the due-review session builder, not this entry.
  const targetIds = new Set<string>();
  for (const decision of model.line) {
    if (!isSrsEnrollable(decision)) continue;
    let row: SrsScheduleRecord | undefined;
    try {
      row = await deps.getPracticeSrs(decision.identity.decisionId);
    } catch {
      return { ok: false, reason: 'load-failed' };
    }
    if (row === undefined || isFreshSchedule(row)) targetIds.add(decision.identity.decisionId);
  }

  return { ok: true, bundle: { model, targetIds } };
}
