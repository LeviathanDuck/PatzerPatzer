











import type { LessonDecision } from './material';
import { overlayFromDecisionRows, previousFromDecisionRows } from './lessonExtract';
import type { AuthoredLessonContent } from './lessonAuthoring';
import {
  authoredContentFromRow,
  authoredContentRowOf,
  listAuthoredContentByLesson,
  listPracticeDecisionsByLesson,
  saveAuthoredContentRow,
  savePracticeDecision,
  type StudyPracticeDecisionRow,
} from '../studyDb';

/** Bounded read cap (mirrors the E3 host; limit+1 sentinel). */
export const AUTHORING_ROW_LIMIT = 2000;

/** Injectable persistence seams — deliberately NO SRS writer (P2-ORP-18: nothing here can enroll). */
export interface LessonPersistenceDeps {
  readonly savePracticeDecision: typeof savePracticeDecision;
  readonly saveAuthoredContentRow: typeof saveAuthoredContentRow;
  readonly listPracticeDecisionsByLesson: typeof listPracticeDecisionsByLesson;
  readonly listAuthoredContentByLesson: typeof listAuthoredContentByLesson;
  readonly now: () => number;
}

const REAL_DEPS: LessonPersistenceDeps = {
  savePracticeDecision,
  saveAuthoredContentRow,
  listPracticeDecisionsByLesson,
  listAuthoredContentByLesson,
  now: () => Date.now(),
};

/**
 * Project one authored decision onto its persistence row. ALWAYS carries the E2a continuity key —
 * the row shape makes the fields optional (legacy tolerance), but this producer cannot omit them.
 */
export function decisionRowOf(
  decision: LessonDecision,
  options: { readonly status?: string; readonly now?: number } = {},
): StudyPracticeDecisionRow {
  return {
    decisionId: decision.identity.decisionId,
    lessonId: decision.identity.lessonId,
    ...(decision.identity.chapterId !== undefined ? { chapterId: decision.identity.chapterId } : {}),
    sourceLineageId: decision.identity.sourceLineageId ?? 'unlinked',
    status: options.status ?? 'authored',
    updatedAt: options.now ?? Date.now(),
    authoredPath: decision.identity.authoredPath,
    uci: decision.evidence.uci,
    role: decision.role,
    trainability: decision.trainability,
  };
}

export type PersistAuthoringResult =
  | { readonly ok: true; readonly decisionRows: number; readonly contentRows: number }
  | { readonly ok: false; readonly reason: 'write-failed'; readonly detail: string };

/**
 * Upsert the full authoring model: one decision row per decision (E2a-keyed) and one content row
 * per decision that HAS authored text. Sequential + fail-closed: the first rejected write aborts
 * with a typed failure — never a silent partial persist.
 */
export async function persistAuthoringModel(
  input: {
    readonly lessonId: string;
    readonly decisions: readonly LessonDecision[];
    readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  },
  deps: LessonPersistenceDeps = REAL_DEPS,
): Promise<PersistAuthoringResult> {
  const now = deps.now();
  let decisionRows = 0;
  let contentRows = 0;
  for (const decision of input.decisions) {
    try {
      await deps.savePracticeDecision(decisionRowOf(decision, { now }));
      decisionRows++;
    } catch (e) {
      return { ok: false, reason: 'write-failed', detail: `decision ${decision.identity.decisionId}: ${String(e)}` };
    }
  }
  for (const content of input.content.values()) {
    try {
      await deps.saveAuthoredContentRow(authoredContentRowOf(content, input.lessonId, now));
      contentRows++;
    } catch (e) {
      return { ok: false, reason: 'write-failed', detail: `content ${content.decisionId}: ${String(e)}` };
    }
  }
  return { ok: true, decisionRows, contentRows };
}

/** Persist ONE changed decision (the write-through unit for a role/trainability edit). */
export async function persistDecisionEdit(
  decision: LessonDecision,
  deps: LessonPersistenceDeps = REAL_DEPS,
): Promise<boolean> {
  try {
    await deps.savePracticeDecision(decisionRowOf(decision, { now: deps.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Persist ONE changed authored-content entry (the write-through unit for a text edit). */
export async function persistContentEdit(
  lessonId: string,
  content: AuthoredLessonContent,
  deps: LessonPersistenceDeps = REAL_DEPS,
): Promise<boolean> {
  try {
    await deps.saveAuthoredContentRow(authoredContentRowOf(content, lessonId, deps.now()));
    return true;
  } catch {
    return false;
  }
}

export interface LoadedAuthoringState {
  /** Continuity input for `extractLessonModel` (stable ids across reload). */
  readonly previous: readonly LessonDecision[];
  /** Overlay applying persisted role/trainability onto re-derived decisions. */
  readonly decisionOverlay: (base: LessonDecision) => LessonDecision;
  /** Persisted authored text keyed by decisionId. */
  readonly content: Map<string, AuthoredLessonContent>;
  /** True when any persisted state existed (the caller may skip the fallback bootstrap). */
  readonly hasPersistedState: boolean;
}

export type LoadAuthoringResult =
  | { readonly ok: true; readonly state: LoadedAuthoringState }
  | { readonly ok: false; readonly reason: 'load-failed' };

/**
 * Load the persisted authoring state for a lesson. Fail-closed on rejected reads or over-cap row
 * sets (no silently truncated model). An EMPTY result is a legitimate first-open (`hasPersistedState`
 * false).
 */
export async function loadAuthoringState(
  lessonId: string,
  learnerSide: 'white' | 'black',
  deps: LessonPersistenceDeps = REAL_DEPS,
): Promise<LoadAuthoringResult> {
  let decisionRows;
  let contentRows;
  try {
    decisionRows = await deps.listPracticeDecisionsByLesson(lessonId, AUTHORING_ROW_LIMIT + 1);
    contentRows = await deps.listAuthoredContentByLesson(lessonId, AUTHORING_ROW_LIMIT + 1);
  } catch {
    return { ok: false, reason: 'load-failed' };
  }
  if (decisionRows.length > AUTHORING_ROW_LIMIT || contentRows.length > AUTHORING_ROW_LIMIT) {
    return { ok: false, reason: 'load-failed' };
  }
  const content = new Map<string, AuthoredLessonContent>();
  for (const row of contentRows) content.set(row.decisionId, authoredContentFromRow(row));
  return {
    ok: true,
    state: {
      previous: previousFromDecisionRows(decisionRows, learnerSide),
      decisionOverlay: overlayFromDecisionRows(decisionRows),
      content,
      hasPersistedState: decisionRows.length > 0 || contentRows.length > 0,
    },
  };
}
