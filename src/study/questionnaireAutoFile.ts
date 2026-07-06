




























import { getStudy, saveStudy } from './studyDb';
import type { StudyItem } from './types';
import type { ImportedGame } from '../import/types';
import type { QuestionnaireAnswers } from '../analyse/questionnaire/model';

const AUTO_FILE_ID_PREFIX = 'qst-autofile-';

/**
 * Deterministic StudyItem id for a game's questionnaire auto-file record. The same game id
 * always resolves to the same StudyItem id — this determinism (not a lookup scan) is what makes
 * repeat questionnaire completions an idempotent update instead of a duplicate create.
 */
export function deriveQuestionnaireStudyItemId(gameId: string): string {
  return `${AUTO_FILE_ID_PREFIX}${gameId}`;
}

function buildAutoFileTitle(game: ImportedGame): string {
  const hasNames = !!game.white && !!game.black && game.white !== '?' && game.black !== '?';
  if (hasNames) return `${game.white} vs ${game.black}`;
  if (game.opening) return game.opening;
  return 'Studied game';
}

/**
 * Build this record's "auto-categorized bucket" tags (P2-QST-5) from the completed answers: Game
 * story and the PRIMARY (rank-1) Decider only — ranks 2-3 are left-column-only detail (v2
 * lookbook §03/§08, mirrored by questionnaireView.ts's own summary-chip choice) and are not
 * surfaced as Study tags here. Ids are stored (not resolved labels) so a later label wordsmithing
 * pass never silently invalidates an already-filed tag; resolve back via
 * src/analyse/questionnaire/model.ts findQuestionnaireOption when a label is needed for display.
 */
function buildQuestionnaireTags(answers: QuestionnaireAnswers): string[] {
  const tags: string[] = ['studied'];
  if (answers.story) tags.push(`story:${answers.story}`);
  const primaryDecider = answers.deciders[0];
  if (primaryDecider) tags.push(`decider:${primaryDecider}`);
  if (answers.openingEval) tags.push(`opening-eval:${answers.openingEval.option}`);
  // P2-LIB-9: "needs study material" is explicitly named as a Study/search facet — surfaced as a
  // tag so a future Study filter can find it. repetitionPractice is deliberately NOT mirrored
  // here: it feeds the separate ORP flag flow (P2-ANL-6/P2-ORP-2), not Study's own categorization.
  if (answers.needsStudyMaterial) tags.push('needs-material');
  return tags;
}

/**
 * Silently create-or-update the Study auto-file record for `game` once its questionnaire has been
 * completed. The only call site is src/main.ts's questionnaire onComplete handler, invoked at the
 * exact completion moment alongside the studiedAt write. Never prompts, never throws — mirrors
 * studyDb.ts's own "log and continue" failure convention, since this system-initiated path must
 * never block or surface an error to the user. Returns null only if something unexpected fails.
 */
export async function autoFileStudiedGame(
  game: ImportedGame,
  answers: QuestionnaireAnswers,
): Promise<StudyItem | null> {
  try {
    const id = deriveQuestionnaireStudyItemId(game.id);
    const now = Date.now();
    const existing = await getStudy(id);

    const item: StudyItem = {
      id,
      pgn: game.pgn,
      title: existing?.title ?? buildAutoFileTitle(game),
      source: 'analysis',
      sourceGameId: game.id,
      tags: buildQuestionnaireTags(answers),
      folders: existing?.folders ?? [],
      favorite: existing?.favorite ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (game.white) item.white = game.white;
    if (game.black) item.black = game.black;
    if (game.result) item.result = game.result;
    if (game.eco) item.eco = game.eco;
    if (game.opening) item.opening = game.opening;
    if (existing?.notes !== undefined) item.notes = existing.notes;
    if (existing?.bookmarks !== undefined) item.bookmarks = existing.bookmarks;

    await saveStudy(item);
    return item;
  } catch (e) {
    console.warn('[study/questionnaireAutoFile] autoFileStudiedGame failed', e);
    return null;
  }
}
