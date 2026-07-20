






import type { DrawShape } from '@lichess-org/chessground/draw';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import { renderMoveList } from '../analyse/moveList';
import { formatScore } from '../analyse/evalView';
import { renderMoveNavBar } from '../analyse/analysisControls';
import type { MoveNavOverride } from '../analyse/analysisControls';
import QuestionnaireCtrl, { type QuestionnaireStage } from '../analyse/questionnaire/questionnaireCtrl';
import renderQuestionnaire, { renderQuestionnaireAnswerSummary } from '../analyse/questionnaire/questionnaireView';
import { parseQuestionnaireFromPgn, type QuestionnaireAnswers } from '../analyse/questionnaire/model';
import { renderToggleRow } from '../ui';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';
import { renderCommentPanel, renderGlyphToolbar, GLYPHS } from './annotationView';
import { updateCurrentNodeGlyphs, updateCurrentNodeShapes, toggleBookmark, isBookmarked, buildStudyPgn } from './studyDetailCtrl';
import { requestStudyDrillLaunch, engineDrillActive, engineDrillFinished } from './practice/engineDrillHost';
import { listPracticeSrsByLesson, applyConfirmedIntervalRecomputePlan } from './studyDb';
import {
  protocol, engineReady,
  clearEvalPositionOverride, setEvalPositionOverride, evalCurrentPosition, setOnLiveEvalImproved, getOnLiveEvalImproved,
  visibleEvalForFen, evalLineFirstMoveLegalInFen,
  type EvalLine, type PositionEval,
} from '../engine/ctrl';
import { listPracticeLines, savePracticeLine, deletePracticeLine } from './studyDb';
import { saveOrpLineToLibrary } from './saveAction';
import {
  folders, foldersLoaded, loadFolders, progressMap, updateStudy,
} from './studyCtrl';
import { countDuePositions } from './practice/sessionBuilder';
import type { OrpFlagScope, StudyItem, TrainableSequence } from './types';
import type { TreeNode } from '../tree/types';
import { deleteNodeAt, promoteAt, pathInit, nodeListAt, mainlineNodeList, pathIsMainline } from '../tree/ops';
import {
  studyDetail, detailRoot, detailPath, detailNode, detailLoaded,
  detailLoadRouteKey, hydrateStudyDetailRoute, navigateTo, navigateFirst, navigateLast, navigatePrev, navigateNext,
  flipStudyBoard, studyDetailRouteSnapshot, detailOrientation, mountStudyWorkspace,
  rememberStudyDetailRouteQuery, isStudyWorkspaceActive, reconcileStudyPracticeSlot,
} from './studyDetailCtrl';
import { parseStudyDetailRouteState, serializeStudyDetailRouteState } from './detailRouteState';
import { normalizeStudyToolTab, type StudyToolTabId } from './navigatorShellView';
import { writeHashRoute } from '../router';
import { isDrillActive, isDrillSummary, initDrillView, renderDrillView, endDrill } from './practice/drillView';
import { renderPracticePanel, type PracticePanelTab, type PracticePanelProps, type PanelDrillsSection } from './practice/practiceView';
import { listRecentEngineDrills } from './studyDb';
import { openDrillRecordOnBoard } from './practice/engineDrillHost';
import { openDrillCatalog } from './practice/drillCatalogView';
import type { EngineDrillRecord } from './types';
import { isSourcePreviewOpen, renderSourcePreview } from './practice/sourcePreviewCtrl';
import { establishRouteDestination } from './practice/routeState';
import { extractMainline, extractFromPath, getNodeAtPath, extractFromVariationPath } from './practice/extractLine';
import {
  BRANCH_ROLES,
  type LessonDecision, type BranchRole, type DecisionTrainability,
} from './practice/material';
import { extractLessonModel } from './practice/lessonExtract';
import { loadAuthoringState, persistDecisionEdit, persistContentEdit } from './practice/lessonPersistence';
import { loadStudyPracticePanelData, type StudyPracticePanelData } from './practice/practicePanelData';
import { launchDueReview, resumeDueReview } from './practice/dueReviewLaunch';
import {
  authoredContentFor, editAuthoredField,
  editDecisionRole, editDecisionTrainability, editDecisionLearnerSide,
  validateScopeReadiness,
  type AuthoredLessonContent, type AuthoredTextField, type LessonBlockerKind,
} from './practice/lessonAuthoring';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import { contextFromNodeList, fenOnlyPositionContext, type EnginePositionContext } from '../engine/positionContext';
import { resolveOrpSettings, resetToInherited, readOrpSessionOverride, writeOrpSessionOverrideField, clearOrpSessionOverrideField, planIntervalRecompute, summarizeRecomputePlan } from './practice/settings';
import { readOrpGlobalDefaults, readOrpStudyOverride, writeOrpStudyOverride } from '../sync/settingsLiveApply';
import { activeWorkspace } from '../analyse/workspaceCore';
import { cgInstance, onBoardUserMove, renderBoard, renderPromotionDialog, syncBoard } from '../board/index';


let _showColorPicker   = false;
let _practiceFromPath: string | null  = null;
let _practiceScope:   'full' | 'current' | 'variation' = 'full';


let _practiceLines:        TrainableSequence[]  = [];
let _practiceLinesLoaded   = false;
let _practiceLinesError    = false;
let _practiceLinesStudyId: string | null        = null;
let _renamingLineId:       string | null        = null;
let _renamingLineValue     = '';









let _toolsOpen = false;
let _activeToolTab: StudyToolTabId = 'comments';
let _toolsRouteSyncKey: string | null = null;
let _organizeTitleDraftId: string | null = null;
let _organizeTitleDraft = '';
let _organizeTagDraftId: string | null = null;
let _organizeTagDraft = '';
let _studyQuestionnaireCtrl: QuestionnaireCtrl | null = null;
let _studyQuestionnaireKey: string | null = null;
const _studyQuestionnaireDrafts = new Map<string, QuestionnaireAnswers>();
let _orpScope: OrpFlagScope = 'current-line';
let _orpTrainAs: 'white' | 'black' = 'white';
let _orpSaving = false;
let _orpFeedback: { studyId: string; kind: 'saved' | 'error' | 'saving'; message: string } | null = null;







let _practiceTab: PracticePanelTab = 'review';







let _authoringStudyId: string | null = null;
let _authoringDecisions: LessonDecision[] = [];
let _authoredContent = new Map<string, AuthoredLessonContent>();
let _authoringPreviewAt: string | null = null;

function ensureAuthoringModel(study: StudyItem, root: TreeNode, redraw?: () => void): void {
  if (_authoringStudyId === study.id) return;
  _authoringStudyId = study.id;
  // One bootstrap derivation through the shared extractor (E1, lessonExtract.ts) — the same core
  // the library/host loader consumes. Identity still comes from D1's producer inside it and is
  // carried forward by the pure edit ops for the lifetime of this opened Study.
  const model = extractLessonModel({
    root,
    lessonId: study.id,
    sourceKind: 'pgn',
    learnerSide: detailOrientation(),
    content: new Map(),
  });
  _authoringDecisions = [...model.decisions];
  _authoredContent = new Map();
  _authoringPreviewAt = null;





  const loadedFor = study.id;
  const loadGeneration = ++_authoringEditGeneration;
  void loadAuthoringState(loadedFor, detailOrientation()).then(result => {
    if (_authoringStudyId !== loadedFor) return; // stale — a different Study opened meanwhile



    if (loadGeneration !== _authoringEditGeneration) return;
    if (!result.ok || !result.state.hasPersistedState) return;
    const reloaded = extractLessonModel({
      root,
      lessonId: loadedFor,
      sourceKind: 'pgn',
      learnerSide: detailOrientation(),
      content: result.state.content,
      previous: result.state.previous,
      decisionOverlay: result.state.decisionOverlay,
    });
    _authoringDecisions = [...reloaded.decisions];
    _authoredContent = new Map(result.state.content);
    redraw?.();
  }).catch(e => {
    console.warn('[studyDetailView] authoring-state load failed; module state stays fresh-derived', e);
  });
}



let _authoringEditGeneration = 0;

function replaceAuthoringDecision(next: LessonDecision): void {
  _authoringEditGeneration++;
  _authoringDecisions = _authoringDecisions.map(d =>
    d.identity.decisionId === next.identity.decisionId ? next : d);
  _authoringPreviewAt = null; // any classification/trainability change re-opens validation
  // E2b-ii write-through (fire-and-forget; P0 — the edit lands in module state synchronously and a
  // failed persist logs rather than dropping it). Writes the E2a-keyed decision row; NEVER an SRS row.
  void persistDecisionEdit(next).then(ok => {
    if (!ok) console.warn(`[studyDetailView] decision persist failed for ${next.identity.decisionId}`);
  });
}

function setAuthoredContent(next: AuthoredLessonContent): void {
  _authoringEditGeneration++;
  const map = new Map(_authoredContent);
  map.set(next.decisionId, next);
  _authoredContent = map;
  // E2b-ii write-through (fire-and-forget; see replaceAuthoringDecision).
  const lessonId = _authoringStudyId;
  if (lessonId !== null) {
    void persistContentEdit(lessonId, next).then(ok => {
      if (!ok) console.warn(`[studyDetailView] content persist failed for ${next.decisionId}`);
    });
  }
}

function syncToolsStateFromRoute(routeKey: string, routeQuery: string): void {
  if (_toolsRouteSyncKey === routeKey) return;
  _toolsRouteSyncKey = routeKey;
  const parsed = parseStudyDetailRouteState(routeQuery).state;
  _toolsOpen = parsed.tools ?? false;
  _activeToolTab = normalizeStudyToolTab(parsed.toolTab);
}

// Strips `tools`/`toolTab` out of a raw route query string, used ONLY to decide whether a route
// change looks like a path/orientation change (the actual value passed to `hydrateStudyDetailRoute`
// is the FULL query — see the call site's comment below for why that split matters). Without this
// stripped comparison, a Manual Review toggle or tab switch (which changes the query string but not
// path/orientation) would itself look like a path change and needlessly re-enter hydration.
function coreRouteQuery(routeQuery: string): string {
  const params = new URLSearchParams(routeQuery);
  params.delete('tools');
  params.delete('toolTab');
  return params.toString();
}

// Applies the same `tools`/`toolTab` stripping to a stored `detailLoadRouteKey()` value
// (`"id?query"`, `studyDetailCtrl.ts`) so the retrigger comparison below ignores tools/toolTab on
// BOTH sides — otherwise, once a real hydration call has been made with tools baked into the
// stored key (see below), every subsequent render would see a permanent mismatch and re-hydrate on
// every redraw.
function coreLoadRouteKey(key: string | null): string | null {
  if (key === null) return null;
  const qIndex = key.indexOf('?');
  if (qIndex === -1) return key;
  return `${key.slice(0, qIndex)}?${coreRouteQuery(key.slice(qIndex + 1))}`;
}

function writeStudyDetailRoute(): void {
  const study = studyDetail();
  if (!study) return;
  const snapshot = studyDetailRouteSnapshot();
  const route = serializeStudyDetailRouteState(study.id, {
    ...snapshot,
    tools: _toolsOpen,
    toolTab: _toolsOpen ? _activeToolTab : '',
  });
  const query = route.includes('?') ? route.slice(route.indexOf('?') + 1) : '';
  rememberStudyDetailRouteQuery(study.id, query);
  writeHashRoute(route, { mode: 'replace' });
}

function toggleManualReview(redraw: () => void): void {
  _toolsOpen = !_toolsOpen;
  writeStudyDetailRoute();
  redraw();
}




function renderManualReviewToggle(redraw: () => void): VNode {
  const label = _toolsOpen ? 'Close Manual Review' : 'Manual Review';
  return h('button.study-manual-review-toggle', {
    class: { 'study-manual-review-toggle--active': _toolsOpen },
    attrs: {
      type: 'button',
      'aria-pressed': String(_toolsOpen),
      ...controlExplainerAttrs({ label, description: `${_toolsOpen ? 'Closes' : 'Opens'} the manual game-study tools.` }),
    },
    on: { click: () => toggleManualReview(redraw) },
  }, [
    h('span.study-manual-review-toggle__icon', { attrs: { 'aria-hidden': 'true' } }, _toolsOpen ? '◉' : '○'),
    h('span.study-manual-review-toggle__label', 'Manual Review'),
  ]);
}






/** One move+comment row for the Comments live-echo panel. `path` is the SAME `TreePath` shape
 * (concatenated 2-char node ids) `navigateTo`/the move list already use. */
interface StudyCommentRow {
  path: string;
  node: TreeNode;
}

/** Walks the WHOLE study tree (mainline + variations — a comment can live on any node, not only
 * the mainline), collecting every node with at least one non-blank comment. Mirrors this file's
 * own path-building convention (`parentPath + child.id`, same as `moveList.ts`'s tree walk and
 * `tree/ops.ts`'s `TreePath` doc comment: "a concatenation of 2-char node IDs"). The root itself
 * (`path === ''`) has no move (`san`/`ply` describe the position BEFORE any move), so it is never
 * included even if it somehow carried a comment — this panel is a list of MOVE+comment pairs.
 */
function collectCommentedNodes(root: TreeNode): StudyCommentRow[] {
  const rows: StudyCommentRow[] = [];
  const walk = (node: TreeNode, path: string): void => {
    if (path !== '' && node.comments?.some(c => c.text.trim().length > 0)) {
      rows.push({ path, node });
    }
    for (const child of node.children) walk(child, path + child.id);
  };
  walk(root, '');
  return rows;
}

/** Same move-number/SAN formatting `moveList.ts`'s inline `renderMoveSpan` uses (`renderMoveList`
 * itself is not reused here since it renders the whole move TREE with its own eval/context-menu/
 * fold wiring — this panel is a flat filtered list, a different shape — but the index convention
 * stays identical so a comment row reads the same way the move list already does: White is
 * `"14."`, Black is `"14…"`). */
function formatCommentRowMove(node: TreeNode): string {
  const n = Math.ceil(node.ply / 2);
  const index = node.ply % 2 === 1 ? `${n}.` : `${n}…`;
  return `${index} ${node.san ?? ''}`;
}

/** Read-only echo of every move-tree comment — the board's own Comment box (`renderCommentPanel`,
 * `annotationView.ts`) stays the ONLY editor; this panel never writes to `node.comments`. Clicking
 * a row navigates the board to that node's path via the EXACT SAME three-call nav sequence the
 * move list's own row click already uses (`navigateTo`/`syncStudyBoard`/`writeStudyDetailRoute`),
 * so bookmark state, engine re-sync, and route-write behavior are all identical to a move-list
 * click — no parallel nav path is introduced. */
function renderCommentsToolPanel(redraw: () => void): VNode {
  const root = detailRoot();
  const rows = root ? collectCommentedNodes(root) : [];

  if (rows.length === 0) {
    return h('div.study-tools-col__panel.study-tools-col__comments', [
      h('div.study-tools-col__empty', 'No comments yet.'),
    ]);
  }

  return h('div.study-tools-col__panel.study-tools-col__comments',
    rows.map(({ path, node }) => h('button.study-tools-col__comment-row', {
      key: path,
      attrs: { type: 'button', ...controlExplainerAttrs({ label: `Go to ${formatCommentRowMove(node)}`, description: 'Navigates the Study board to this commented move.' }) },
      on: { click: () => { navigateTo(path, redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); } },
    }, [
      h('span.study-tools-col__comment-move', formatCommentRowMove(node)),
      h('span.study-tools-col__comment-text', (node.comments ?? [])
        .filter(c => c.text.trim().length > 0)
        .map(c => c.text)
        .join(' ')),
    ])),
  );
}

function syncOpenStudyMetadata(study: StudyItem, partial: Partial<Pick<StudyItem, 'title' | 'tags' | 'folders'>>): void {
  Object.assign(study, partial, { updatedAt: Date.now() });
}

function commitOrganizeTitle(study: StudyItem, redraw: () => void): void {
  const draft = _organizeTitleDraftId === study.id ? _organizeTitleDraft : study.title;
  const title = draft.trim() || study.title;
  _organizeTitleDraftId = null;
  _organizeTitleDraft = '';

  if (title === study.title) {
    redraw();
    return;
  }

  syncOpenStudyMetadata(study, { title });
  redraw();
  void updateStudy({ id: study.id, title }).then(redraw);
}

function commitOrganizeTag(study: StudyItem, redraw: () => void): void {
  const tag = (_organizeTagDraftId === study.id ? _organizeTagDraft : '').trim();
  _organizeTagDraftId = null;
  _organizeTagDraft = '';

  if (!tag || study.tags.includes(tag)) {
    redraw();
    return;
  }

  const tags = [...study.tags, tag];
  syncOpenStudyMetadata(study, { tags });
  redraw();
  void updateStudy({ id: study.id, tags }).then(redraw);
}

function removeOrganizeTag(study: StudyItem, tag: string, redraw: () => void): void {
  const tags = study.tags.filter(t => t !== tag);
  if (tags.length === study.tags.length) return;
  syncOpenStudyMetadata(study, { tags });
  redraw();
  void updateStudy({ id: study.id, tags }).then(redraw);
}

function addOrganizeFolder(study: StudyItem, folderId: string, redraw: () => void): void {
  if (!folderId || study.folders.includes(folderId)) {
    redraw();
    return;
  }
  const folderIds = [...study.folders, folderId];
  syncOpenStudyMetadata(study, { folders: folderIds });
  redraw();
  void updateStudy({ id: study.id, folders: folderIds }).then(redraw);
}

function renderOrganizeToolPanel(redraw: () => void): VNode {
  const study = studyDetail();
  if (!study) {
    return h('div.study-tools-col__panel.study-tools-col__organize', [
      h('div.study-tools-col__empty', 'Study not loaded.'),
    ]);
  }

  if (!foldersLoaded()) loadFolders(redraw);

  const folderList = [...folders()].sort((a, b) => a.name.localeCompare(b.name));
  const folderNameById = new Map(folderList.map(folder => [folder.id, folder.name]));
  const availableFolders = folderList.filter(folder => !study.folders.includes(folder.id));
  const titleValue = _organizeTitleDraftId === study.id ? _organizeTitleDraft : study.title;
  const tagValue = _organizeTagDraftId === study.id ? _organizeTagDraft : '';

  return h('div.study-tools-col__panel.study-tools-col__organize', [
    h('label.study-tools-col__field', [
      h('span.study-tools-col__label', 'Title'),
      h('input.study-tools-col__title-input', {
        attrs: { type: 'text', placeholder: 'Study title', 'aria-label': 'Study title', ...controlExplainerAttrs({ label: 'Study title', description: 'Renames this Study game when the field loses focus.' }) },
        props: { value: titleValue },
        on: {
          input: (e: Event) => {
            _organizeTitleDraftId = study.id;
            _organizeTitleDraft = (e.target as HTMLInputElement).value;
          },
          blur: () => commitOrganizeTitle(study, redraw),
          keydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              _organizeTitleDraftId = null;
              _organizeTitleDraft = '';
              redraw();
            }
          },
        },
      }),
    ]),

    h('div.study-tools-col__field', [
      h('span.study-tools-col__label', 'Assign to Study'),
      study.folders.length > 0
        ? h('div.study-tools-col__chips',
            study.folders.map(folderId => h('span.study-tools-col__chip.study-tools-col__chip--folder', { key: folderId }, [
              h('span.study-tools-col__chip-label', folderNameById.get(folderId) ?? 'Unknown folder'),
            ])),
          )
        : h('div.study-tools-col__hint', 'No folder memberships yet.'),
      foldersLoaded()
        ? h('select.study-tools-col__folder-select', {
            props: { value: '' },
            attrs: { 'aria-label': 'Add to folder', ...controlExplainerAttrs({ label: 'Add to folder', description: 'Adds this Study game to another folder.' }) },
            on: {
              change: (e: Event) => {
                const select = e.target as HTMLSelectElement;
                addOrganizeFolder(study, select.value, redraw);
                select.value = '';
              },
            },
          }, [
            h('option', { attrs: { value: '', disabled: true } },
              availableFolders.length > 0 ? 'Add to folder...' : 'All folders already assigned'),
            ...availableFolders.map(folder => h('option', { key: folder.id, attrs: { value: folder.id } }, folder.name)),
          ])
        : h('div.study-tools-col__hint', 'Loading folders...'),
    ]),

    h('div.study-tools-col__field', [
      h('span.study-tools-col__label', 'Tags'),
      study.tags.length > 0
        ? h('div.study-tools-col__chips',
            study.tags.map(tag => h('span.study-tools-col__chip.study-tools-col__chip--tag', { key: tag }, [
              h('span.study-tools-col__chip-label', tag),
              h('button.study-tools-col__chip-remove', {
                attrs: { type: 'button', ...iconControlExplainerAttrs({ label: `Remove tag ${tag}`, description: 'Removes this tag from the Study game.' }) },
                on: { click: () => removeOrganizeTag(study, tag, redraw) },
              }, '×'),
            ])),
          )
        : h('div.study-tools-col__hint', 'No tags yet.'),
      h('input.study-tools-col__tag-input', {
        attrs: { type: 'text', placeholder: 'Add tag', 'aria-label': 'Add tag', ...controlExplainerAttrs({ label: 'Add tag', description: 'Adds this tag when the field loses focus.' }) },
        props: { value: tagValue },
        on: {
          input: (e: Event) => {
            _organizeTagDraftId = study.id;
            _organizeTagDraft = (e.target as HTMLInputElement).value;
          },
          blur: (e: Event) => {
            commitOrganizeTag(study, redraw);
            (e.target as HTMLInputElement).value = '';
          },
          keydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              _organizeTagDraftId = null;
              _organizeTagDraft = '';
              redraw();
            }
          },
        },
      }),
    ]),
  ]);
}

function questionnaireLineForStudy(study: StudyItem): string {
  const parts = [
    study.white && study.black ? `${study.white} vs ${study.black}` : undefined,
    study.opening,
  ].filter((part): part is string => !!part);
  return parts.join(' · ') || study.title;
}

function studyQuestionnaireStageForRow(row: 'story' | 'decider' | 'opening-eval'): QuestionnaireStage {
  if (row === 'opening-eval') return 'opening-eval';
  return row;
}

function questionnaireAnswersForStudy(study: StudyItem): QuestionnaireAnswers | undefined {
  return _studyQuestionnaireDrafts.get(study.id) ?? parseQuestionnaireFromPgn(study.pgn);
}

function ensureStudyQuestionnaireCtrl(study: StudyItem, answers: QuestionnaireAnswers, redraw: () => void): QuestionnaireCtrl {
  const draft = _studyQuestionnaireDrafts.get(study.id);
  const key = `${study.id}:${draft ? 'draft' : study.pgn}`;
  if (_studyQuestionnaireCtrl && _studyQuestionnaireKey === key) return _studyQuestionnaireCtrl;

  _studyQuestionnaireKey = key;
  _studyQuestionnaireCtrl = QuestionnaireCtrl.fromAnswers(
    answers,
    {
      context: { line: questionnaireLineForStudy(study) },
      onComplete: completion => {
        _studyQuestionnaireDrafts.set(study.id, completion.answers);
        _studyQuestionnaireKey = `${study.id}:draft`;
        redraw();
      },
    },
    redraw,
  );
  return _studyQuestionnaireCtrl;
}

function renderQuestionnaireToolPanel(redraw: () => void): VNode {
  const study = studyDetail();
  if (!study) {
    return h('div.study-tools-col__panel.study-tools-col__questionnaire', [
      h('div.study-tools-col__empty', 'Study not loaded.'),
    ]);
  }

  const answers = questionnaireAnswersForStudy(study);
  if (!answers) {
    _studyQuestionnaireCtrl = null;
    _studyQuestionnaireKey = null;
    return h('div.study-tools-col__panel.study-tools-col__questionnaire', [
      h('div.study-tools-col__empty', 'No Post Game Review Questions recorded for this game.'),
    ]);
  }

  const ctrl = ensureStudyQuestionnaireCtrl(study, answers, redraw);
  if (ctrl.stage !== 'summary') {
    return h('div.study-tools-col__panel.study-tools-col__questionnaire', [
      renderQuestionnaire(ctrl),
    ]);
  }

  const currentAnswers = ctrl.completion?.answers ?? answers;
  return h('div.study-tools-col__panel.study-tools-col__questionnaire', [
    h('div.study-tools-col__questionnaire-title', 'Post Game Review Questions'),
    renderQuestionnaireAnswerSummary(currentAnswers, {
      onChange: row => ctrl.jumpToStage(studyQuestionnaireStageForRow(row)),
    }),
    _studyQuestionnaireDrafts.has(study.id)
      ? h('div.study-tools-col__hint.study-tools-col__hint--questionnaire',
          'Changes are active in this Study session. Durable PGN rewrite needs the follow-up persistence slice.')
      : null,
  ]);
}

interface StudyOrpLine {
  scope: OrpFlagScope;
  label: string;
  description: string;
  ucis: string[];
  sans: string[];
  sourcePath: string;
  stopPath: string;
  stopPly: number;
}

function formatStudyMoveContext(node: TreeNode | null | undefined): string {
  if (!node?.san || node.ply <= 0) return 'Root position';
  const n = Math.ceil(node.ply / 2);
  return `${node.ply % 2 === 1 ? `${n}.` : `${n}...`} ${node.san}`;
}

function lineFromNodes(
  scope: OrpFlagScope,
  label: string,
  description: string,
  nodes: TreeNode[],
  sourcePath: string,
  stopPath: string,
): StudyOrpLine | null {
  const moveNodes = nodes.slice(1).filter(node => node.uci && node.san);
  if (moveNodes.length === 0) return null;
  return {
    scope,
    label,
    description,
    ucis: moveNodes.map(node => node.uci!),
    sans: moveNodes.map(node => node.san!),
    sourcePath,
    stopPath,
    stopPly: moveNodes[moveNodes.length - 1]?.ply ?? 0,
  };
}

function mainlinePathFromNodes(nodes: TreeNode[]): string {
  return nodes.slice(1).map(node => node.id).join('');
}

function buildCurrentLineOption(root: TreeNode, path: string): StudyOrpLine | null {
  if (!path) return null;
  const nodes = nodeListAt(root, path);
  return lineFromNodes(
    'current-line',
    'Current line',
    `Stop at ${formatStudyMoveContext(nodes[nodes.length - 1])}`,
    nodes,
    path,
    path,
  );
}

function buildMainlineOption(root: TreeNode): StudyOrpLine | null {
  const nodes = mainlineNodeList(root);
  return lineFromNodes(
    'mainline',
    'Mainline',
    'Full first-child line from this Study',
    nodes,
    '',
    mainlinePathFromNodes(nodes),
  );
}

function buildSelectedVariationOption(root: TreeNode, path: string): StudyOrpLine | null {
  if (!path || pathIsMainline(root, path)) return null;
  const nodes = nodeListAt(root, path);
  let node = nodes[nodes.length - 1];
  let stopPath = path;
  while (node?.children[0]) {
    node = node.children[0];
    nodes.push(node);
    stopPath += node.id;
  }
  return lineFromNodes(
    'selected-variation',
    'Selected variation',
    `Variation through ${formatStudyMoveContext(nodes[nodes.length - 1])}`,
    nodes,
    path,
    stopPath,
  );
}

function buildOrpLineOptions(root: TreeNode, path: string): StudyOrpLine[] {
  return [
    buildCurrentLineOption(root, path),
    buildMainlineOption(root),
    buildSelectedVariationOption(root, path),
  ].filter((line): line is StudyOrpLine => !!line);
}

function saveStudyOrpLine(study: StudyItem, line: StudyOrpLine, redraw: () => void): void {
  if (_orpSaving) return;
  if (line.ucis.length < 3) {
    _orpFeedback = { studyId: study.id, kind: 'error', message: 'Need at least 3 moves.' };
    redraw();
    return;
  }

  _orpSaving = true;
  _orpFeedback = { studyId: study.id, kind: 'saving', message: 'Saving...' };
  redraw();

  void saveOrpLineToLibrary(
    line.ucis,
    line.sans,
    _orpTrainAs,
    null,
    study.opening,
    study.eco,
    {
      title: `${study.title} - ${line.label}`,
      extraTags: ['study', `source-study:${study.id}`, `scope:${line.scope}`],
      mergeExistingTags: true,
      sourceProvenance: {
        source: 'study',
        originalStudyItemId: study.id,
        originalStudyTitle: study.title,
        scope: line.scope,
        sourcePath: line.sourcePath,
        stopPath: line.stopPath,
        stopPly: line.stopPly,
        sourcePgn: study.pgn,
      },
    },
  ).then(result => {
    _orpSaving = false;
    _orpFeedback = result
      ? { studyId: study.id, kind: 'saved', message: 'Saved to ORP.' }
      : { studyId: study.id, kind: 'error', message: 'Need at least 3 legal moves.' };
    redraw();
  }).catch(error => {
    _orpSaving = false;
    _orpFeedback = {
      studyId: study.id,
      kind: 'error',
      message: error instanceof Error ? error.message : 'Could not save to ORP.',
    };
    redraw();
  });
}

function renderOrpToolPanel(redraw: () => void): VNode {
  const study = studyDetail();
  const root = detailRoot();
  if (!study || !root) {
    return h('div.study-tools-col__panel.study-tools-col__orp', [
      h('div.study-tools-col__empty', 'Study not loaded.'),
    ]);
  }

  const currentPath = detailPath();
  const currentNode = detailNode();
  const options = buildOrpLineOptions(root, currentPath);
  if (!options.some(option => option.scope === _orpScope)) _orpScope = options[0]?.scope ?? 'mainline';
  const selected = options.find(option => option.scope === _orpScope) ?? options[0] ?? null;
  const feedback = _orpFeedback?.studyId === study.id ? _orpFeedback : null;
  const canSave = !!selected && selected.ucis.length >= 3 && !_orpSaving;

  return h('div.study-tools-col__panel.study-tools-col__orp', [
    h('div.study-tools-col__orp-head', [
      h('div.study-tools-col__orp-title', 'Opening Repetition Practice'),
      h('div.study-tools-col__orp-context', [
        h('span.study-tools-col__orp-context-label', 'Current'),
        h('span.study-tools-col__orp-context-value', formatStudyMoveContext(currentNode)),
      ]),
    ]),

    h('div.study-tools-col__field', [
      h('span.study-tools-col__label', 'Scope'),
      h('div.study-tools-col__orp-scope-list',
        options.map(option => h('button.study-tools-col__orp-scope', {
          key: option.scope,
          class: { 'study-tools-col__orp-scope--active': _orpScope === option.scope },
          attrs: { type: 'button', 'aria-pressed': String(_orpScope === option.scope), ...controlExplainerAttrs({ label: option.label, description: `Saves ${option.description.toLowerCase()} to Opening Repetition Practice.` }) },
          on: { click: () => { _orpScope = option.scope; _orpFeedback = null; redraw(); } },
        }, [
          h('span.study-tools-col__orp-scope-name', option.label),
          h('span.study-tools-col__orp-scope-detail', `${option.sans.length} moves · ${option.description}`),
        ])),
      ),
    ]),

    h('div.study-tools-col__field', [
      h('span.study-tools-col__label', 'Train as'),
      h('div.study-tools-col__orp-train-as', [
        h('button.study-tools-col__orp-train', {
          class: { 'study-tools-col__orp-train--active': _orpTrainAs === 'white' },
          attrs: { type: 'button', 'aria-pressed': String(_orpTrainAs === 'white'), ...controlExplainerAttrs({ label: 'Train as White', description: 'Sets White as the side to recall in this opening line.' }) },
          on: { click: () => { _orpTrainAs = 'white'; redraw(); } },
        }, 'White'),
        h('button.study-tools-col__orp-train', {
          class: { 'study-tools-col__orp-train--active': _orpTrainAs === 'black' },
          attrs: { type: 'button', 'aria-pressed': String(_orpTrainAs === 'black'), ...controlExplainerAttrs({ label: 'Train as Black', description: 'Sets Black as the side to recall in this opening line.' }) },
          on: { click: () => { _orpTrainAs = 'black'; redraw(); } },
        }, 'Black'),
      ]),
    ]),

    selected
      ? h('div.study-tools-col__orp-summary', [
          h('span', `Source: ${study.title}`),
          h('span', `Stop ply: ${selected.stopPly}`),
        ])
      : h('div.study-tools-col__hint', 'Select a move before saving the current line.'),

    selected && selected.ucis.length < 3
      ? h('div.study-tools-col__hint', 'Need at least 3 moves.')
      : null,

    canSave
      ? h('button.study-tools-col__orp-save', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Save to Opening Repetition Practice', description: 'Saves the selected line as an opening practice sequence.' }) },
          on: { click: () => { if (selected) saveStudyOrpLine(study, selected, redraw); } },
        }, 'Save to ORP')
      : renderDisabledControlExplainer(
          {
            label: _orpSaving ? 'Saving to Opening Repetition Practice' : 'Save to Opening Repetition Practice',
            description: _orpSaving
              ? 'Wait for the current Opening Repetition Practice save to finish.'
              : !selected
                ? 'Select a line before saving to Opening Repetition Practice.'
                : 'Choose a line with at least 3 moves before saving.',
          },
          h('button.study-tools-col__orp-save', {
            class: { 'study-tools-col__orp-save--busy': _orpSaving },
            attrs: { type: 'button', disabled: true },
          }, _orpSaving ? 'Saving...' : 'Save to ORP'),
        ),

    feedback
      ? h(`div.study-tools-col__orp-feedback.study-tools-col__orp-feedback--${feedback.kind}`, feedback.message)
      : null,





    renderStudyPracticePanel(redraw),
  ]);
}


let _panelDataFor: string | null = null;
let _panelData: StudyPracticePanelData | null = null;
let _panelLoading = false;




let _panelRefreshGeneration = 0;

function refreshPanelData(lessonId: string, redraw: () => void): void {
  _panelLoading = true;
  const generation = ++_panelRefreshGeneration;
  void loadStudyPracticePanelData({ lessonId }).then(data => {
    if (_panelDataFor !== lessonId) return; // stale — a different Study opened meanwhile
    if (generation !== _panelRefreshGeneration) return; // stale — a newer refresh superseded this one
    _panelData = data;
    _panelLoading = false;
    redraw();
  }).catch(e => {
    if (_panelDataFor !== lessonId) return;
    if (generation !== _panelRefreshGeneration) return;
    _panelLoading = false;
    console.warn('[studyDetailView] practice panel data load failed', e);
    redraw();
  });
}









let _panelDrills: EngineDrillRecord[] | null = null;
let _panelDrillsLoading = false;

function panelDrillLabel(r: EngineDrillRecord): string {
  const side = r.snapshot.learnerIsWhite ? 'White' : 'Black';
  const goals = r.snapshot.goals.map(g => g.kind).join(', ') || 'open-ended';
  return `${side} · ${goals} · ${r.outcome ?? r.completionState}`;
}

function studyPanelDrillsSection(studyItemId: string | null, redraw: () => void): PanelDrillsSection {
  if (_panelDrills === null && !_panelDrillsLoading) {
    _panelDrillsLoading = true;
    listRecentEngineDrills(5).then(records => {
      _panelDrills = records;
      _panelDrillsLoading = false;
      redraw();
    }).catch(() => { _panelDrills = []; _panelDrillsLoading = false; redraw(); });
  }
  return {
    recent: (_panelDrills ?? []).map(r => ({
      label: panelDrillLabel(r),
      sublabel: `${r.snapshot.moves.length} moves`,
      resumable: r.completionState === 'partial',
      onOpen: () => { openDrillRecordOnBoard(r); },
    })),
    onOpenCatalog: () => {
      openDrillCatalog({ kind: 'global' }, redraw);
      writeHashRoute('#/study');
      redraw();
    },
    ...(studyItemId !== null ? {
      onViewAllFromStudy: () => {
        openDrillCatalog({ kind: 'study', studyItemId, title: studyDetail()?.title ?? 'this Study' }, redraw);
        writeHashRoute('#/study');
        redraw();
      },
    } : {}),
  };
}






function renderStudyPracticePanel(redraw: () => void): VNode {
  const study = studyDetail();
  const lessonId = study?.id ?? null;
  if (lessonId !== null && _panelDataFor !== lessonId) {
    _panelDataFor = lessonId;
    _panelData = null;
    refreshPanelData(lessonId, redraw);
  }

  const data = _panelData;
  const onSessionEnd = (): void => {
    if (lessonId !== null) refreshPanelData(lessonId, redraw);
  };
  let review: PracticePanelProps['review'];
  if (data === null) {
    review = _panelLoading ? { status: 'loading' } : { status: 'empty' };
  } else if (data.review.status === 'ready') {
    const resumableId = data.resumableSessionId;
    review = {
      ...data.review,
      ...(resumableId !== undefined
        ? { onResume: () => { void resumeDueReview(resumableId, {}, redraw, { onSessionEnd }); } }
        : { onStart: () => {
            if (lessonId === null) return;

            const resolved = resolveOrpSettings(readOrpGlobalDefaults(), readOrpStudyOverride(lessonId), readOrpSessionOverride(Date.now()), Date.now()).values;
            void launchDueReview({ lessonId, limit: Math.max(1, resolved.duePerSession) }, redraw, { onSessionEnd });
          } }),
    };
  } else {
    review = data.review;
  }

  const props: PracticePanelProps = {
    activeTab: _practiceTab,
    onSelectTab: (tab: PracticePanelTab) => { _practiceTab = tab; redraw(); },
    learn: { status: 'ready', entries: [] },
    review,
    practice: { status: 'empty' },
    progress: data === null ? (_panelLoading ? { status: 'loading' } : { status: 'empty' }) : data.progress,
    drills: studyPanelDrillsSection(lessonId, redraw),
  };
  return h('div.study-tools-col__field', [
    h('span.study-tools-col__label', 'Practice & progress'),
    renderPracticePanel(props),

    data?.progressTruncated
      ? h('div.orp-progress-truncated-note',
          'Progress shows a partial history — this Study has more attempts than the scorecard fold reads.')
      : null,
    lessonId !== null ? renderStudyPracticeSettings(lessonId, redraw) : null,
  ]);
}









const ORP_STUDY_SETTING_FIELDS: readonly {
  readonly field: 'newPerSession' | 'duePerSession' | 'moveFeedback' | 'hints' | 'drillDifficulty';
  readonly label: string;
  readonly cycle: readonly (number | boolean | string)[];
  readonly format: (v: number | boolean | string) => string;
}[] = [
  { field: 'newPerSession', label: 'New lines per Learn session', cycle: [3, 5, 8, 10], format: String },
  { field: 'duePerSession', label: 'Due targets per Review session', cycle: [10, 20, 40], format: String },
  { field: 'moveFeedback', label: 'Move feedback', cycle: [true, false], format: v => (v ? 'On' : 'Off') },
  { field: 'hints', label: 'Hints', cycle: [true, false], format: v => (v ? 'On' : 'Off') },
  { field: 'drillDifficulty', label: 'Drill difficulty', cycle: ['casual', 'mastery'], format: v => (v === 'mastery' ? 'Mastery' : 'Casual') },
];

const ORP_PROVENANCE_LABELS = {
  global: 'Inherited from defaults',
  study: 'This Study',
  session: 'Session (temporary)',
} as const;





const RECOMPUTE_LADDER_PRESETS: readonly { readonly label: string; readonly intervals: readonly number[] }[] = [
  { label: 'Gentle (1d · 3d · 7d · 14d · 30d)', intervals: [86_400_000, 259_200_000, 604_800_000, 1_209_600_000, 2_592_000_000] },
  { label: 'Standard (4h · 1d · 3d · 7d · 21d)', intervals: [14_400_000, 86_400_000, 259_200_000, 604_800_000, 1_814_400_000] },
  { label: 'Aggressive (4h · 12h · 1d · 3d · 7d)', intervals: [14_400_000, 43_200_000, 86_400_000, 259_200_000, 604_800_000] },
];
let _recomputeState:
  | { readonly stage: 'idle' }
  | { readonly stage: 'preview'; readonly plan: import('./practice/settings').IntervalRecomputePlan; readonly newIntervals: readonly number[]; readonly truncated: boolean }
  | { readonly stage: 'result'; readonly applied: number; readonly noop: number; readonly stale: readonly { readonly targetId: string; readonly reason: string }[] }
  = { stage: 'idle' };
let _recomputeBusy = false;

function startRecomputePreview(studyItemId: string, newIntervals: readonly number[], redraw: () => void): void {
  if (_recomputeBusy) return;
  _recomputeBusy = true;
  void (async () => {
    try {
      const nowMs = Date.now();
      const current = resolveOrpSettings(readOrpGlobalDefaults(), readOrpStudyOverride(studyItemId), readOrpSessionOverride(nowMs), nowMs).values.intervals;
      const read = await listPracticeSrsByLesson(studyItemId, 500);
      const inputs = read.rows.map(r => ({
        targetId: r.targetId, status: r.status, step: r.stepIndex,
        dueAt: (r as { dueAt: number | null }).dueAt ?? 0,
        lessonId: r.lessonId, targetRevision: r.targetRevision, scheduleRevision: r.scheduleRevision,
        configId: r.configId, configVersion: r.configVersion,
      }));
      const plan = planIntervalRecompute(inputs, current, newIntervals, studyItemId);
      _recomputeState = { stage: 'preview', plan, newIntervals, truncated: read.truncated };
    } catch {
      _recomputeState = { stage: 'idle' };
    } finally {
      _recomputeBusy = false;
      redraw();
    }
  })();
}

function confirmRecompute(redraw: () => void): void {
  if (_recomputeBusy || _recomputeState.stage !== 'preview') return;
  const plan = _recomputeState.plan;
  _recomputeBusy = true;
  void (async () => {
    try {
      const out = await applyConfirmedIntervalRecomputePlan(plan, { planId: plan.planId });
      _recomputeState = { stage: 'result', applied: out.applied, noop: out.noop, stale: out.stale };
    } catch {
      _recomputeState = { stage: 'idle' };
    } finally {
      _recomputeBusy = false;
      redraw();
    }
  })();
}

function renderRecomputeSection(studyItemId: string, currentIntervals: readonly number[], redraw: () => void): VNode {
  const fmt = (ms: number): string => (ms >= 86_400_000 ? `${Math.round(ms / 86_400_000)}d` : `${Math.round(ms / 3_600_000)}h`);
  const ladderLabel = (iv: readonly number[]): string => iv.map(fmt).join(' · ');
  if (_recomputeState.stage === 'preview') {
    const st = _recomputeState;
    const summary = summarizeRecomputePlan(st.plan, Date.now());
    return h('div.orp-recompute', [
      h('div.study-tools-col__label', 'Recompute due dates — preview'),
      h('div.orp-recompute__line', `Scope: this Study. Ladder ${ladderLabel(currentIntervals)} → ${ladderLabel(st.newIntervals)}`),
      h('div.orp-recompute__line', `${summary.affected} active dates affected · ${summary.skippedInactive} inactive skipped`),
      h('div.orp-recompute__line', `${summary.movedEarlier} earlier · ${summary.movedLater} later · ${summary.unchanged} unchanged · ${summary.dueImmediately} become due now`),
      st.truncated ? h('div.orp-recompute__warn', 'This Study has more scheduled rows than the preview covers — showing the first 500; the rest are untouched.') : null,
      h('div.orp-recompute__line', 'Steps, mastery/status, and attempt history will not change. Frozen review sessions covering moved rows become stale and will revalidate. Rows that change between this preview and your confirmation are skipped — preview again for them.'),
      h('ul.orp-recompute__rows', st.plan.entries.slice(0, 8).map(e =>
        h('li.orp-recompute__row', { key: e.targetId }, `${e.targetId.slice(0, 8)}… ${new Date(e.oldDueAt).toLocaleDateString()} → ${new Date(e.newDueAt).toLocaleDateString()}`))),
      h('button.orp-recompute__confirm', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: `Recompute ${summary.affected} due dates`,
          description: 'Moves the previewed due dates onto the new ladder. Nothing else about your progress changes.',
          tier: 'essential',
        }) },
        on: { click: () => { confirmRecompute(redraw); } },
      }, `Recompute ${summary.affected} due dates`),
      h('button.orp-recompute__cancel', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel the recompute preview' }) },
        on: { click: () => { _recomputeState = { stage: 'idle' }; redraw(); } },
      }, 'Cancel'),
    ]);
  }
  if (_recomputeState.stage === 'result') {
    const st = _recomputeState;
    return h('div.orp-recompute', [
      h('div.study-tools-col__label', 'Recompute complete'),
      h('div.orp-recompute__line', `${st.applied} moved · ${st.noop} already correct · ${st.stale.length} skipped`),
      st.stale.length > 0
        ? h('div.orp-recompute__warn', 'Skipped rows changed since the preview — run a new preview to move them.')
        : null,
      h('button.orp-recompute__done', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Dismiss the recompute result' }) },
        on: { click: () => { _recomputeState = { stage: 'idle' }; redraw(); } },
      }, 'Done'),
    ]);
  }
  return h('div.orp-recompute', [
    h('div.study-tools-col__label', `Interval ladder: ${ladderLabel(currentIntervals)}`),
    ...RECOMPUTE_LADDER_PRESETS.map(preset => h('button.orp-recompute__preset', {
      key: preset.label,
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: `Preview recompute onto ${preset.label}`,
        description: 'Shows exactly which due dates would move before anything changes; a separate confirmation applies it.',
        tier: 'essential',
      }) },
      on: { click: () => { startRecomputePreview(studyItemId, preset.intervals, redraw); } },
    }, preset.label)),
  ]);
}

function renderStudyPracticeSettings(studyItemId: string, redraw: () => void): VNode {
  const globalDefaults = readOrpGlobalDefaults();
  const overrideLayer = readOrpStudyOverride(studyItemId);
  const nowMs = Date.now();
  const resolved = resolveOrpSettings(globalDefaults, overrideLayer, readOrpSessionOverride(nowMs), nowMs);
  return h('div.study-tools-col__field.orp-study-settings', [
    h('span.study-tools-col__label', 'Practice settings'),
    renderRecomputeSection(studyItemId, resolved.values.intervals, redraw),
    ...ORP_STUDY_SETTING_FIELDS.map(def => {
      const provenance = resolved.provenance[def.field];
      const value = resolved.values[def.field];
      const overridden = provenance === 'study';
      return h('div.orp-study-settings__row', { key: def.field }, [
        h('span.orp-study-settings__name', def.label),
        h('button.orp-study-settings__value', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: `${def.label}: save only for this Study`,
            description: 'Cycles the value and saves it as a Study override; other Studies keep inheriting the default.',
            tier: 'more-help',
          }) },
          on: {
            click: () => {
              const next = def.cycle[(def.cycle.findIndex(c => c === value) + 1) % def.cycle.length]!;
              writeOrpStudyOverride(studyItemId, { ...overrideLayer, [def.field]: next });
              redraw();
            },
          },
        }, def.format(value)),
        h('span.orp-study-settings__scope', ORP_PROVENANCE_LABELS[provenance]),


        h('button.orp-study-settings__session', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: `${def.label}: this session only`,
            description: 'Applies everywhere for up to six hours or until you close or reload — whichever comes first; saved nowhere.',
            tier: 'essential',
          }) },
          on: {
            click: () => {
              const next = def.cycle[(def.cycle.findIndex(c => c === value) + 1) % def.cycle.length]!;
              writeOrpSessionOverrideField(def.field, next, Date.now());
              redraw();
            },
          },
        }, 'Session'),
        provenance === 'session'
          ? h('button.orp-study-settings__session-clear', {
              attrs: { type: 'button', ...controlExplainerAttrs({
                label: `${def.label}: clear the session value`,
                description: 'Removes the temporary value so the Study or shared default applies again.',
                tier: 'essential',
              }) },
              on: { click: () => { clearOrpSessionOverrideField(def.field); redraw(); } },
            }, 'Clear')
          : null,
        overridden
          ? h('button.orp-study-settings__reset', {
              attrs: { type: 'button', ...controlExplainerAttrs({
                label: `${def.label}: reset to inherited`,
                description: 'Removes the Study override so the shared ORP default flows through again.',
                tier: 'essential',
              }) },
              on: {
                click: () => {
                  writeOrpStudyOverride(studyItemId, resetToInherited(overrideLayer, def.field));
                  redraw();
                },
              },
            }, 'Reset')
          : null,
      ]);
    }),
  ]);
}

/** Threading entry point (`libraryView.ts` calls this and passes the result as
 * `GameOpenShellOptions.toolPanelContent`). Returns real panels for the implemented tabs and
 * `null` for tabs that should still use `renderStudyToolsColumn`'s placeholder fallback. */
export function renderStudyToolPanel(activeToolTab: StudyToolTabId, redraw: () => void): VNode | null {
  if (activeToolTab === 'comments') return renderCommentsToolPanel(redraw);
  if (activeToolTab === 'questionnaire') return renderQuestionnaireToolPanel(redraw);
  if (activeToolTab === 'organize') return renderOrganizeToolPanel(redraw);
  if (activeToolTab === 'orp') return renderOrpToolPanel(redraw);
  if (activeToolTab === 'practice') return renderPracticeToolPanel(redraw);
  return null;
}


const AUTHORING_ROLE_LABELS: Record<BranchRole, string> = {
  'mainline-correct': 'Mainline correct',
  'accepted-alternate': 'Accepted alternate',
  'wrong-refutation': 'Wrong / refutation',
  'reference-only': 'Reference only',
  'needs-classification': 'Needs classification',
};
const AUTHORING_TRAINABILITIES: readonly DecisionTrainability[] = [
  'required', 'optional-practice', 'reference-only', 'untrainable',
];
const AUTHORING_TRAINABILITY_LABELS: Record<DecisionTrainability, string> = {
  'required': 'Required',
  'optional-practice': 'Optional practice',
  'reference-only': 'Reference only',
  'untrainable': 'Untrainable',
};
const AUTHORING_BLOCKER_LABELS: Record<LessonBlockerKind, string> = {
  'missing-recall-prompt': 'Missing recall prompt',
  'unclassified-branch': 'Unclassified branch',
  'duplicate-required-cue': 'Duplicate Required cue',
  'unreachable-path': 'Broken authored path',
};

/** Node-contextual move label for the authoring header. */
function authoringNodeLabel(node: TreeNode | null | undefined): string {
  return formatStudyMoveContext(node);
}

/** One authored-text field (prompt / hint / deviation / wrong-refutation / cue). Mirrors the Organize
 * panel's draft-on-input, commit-on-blur cadence so the caret never jumps mid-edit; the in-memory
 * decision model is updated on every keystroke, and validation refreshes on blur. Each field carries
 * an associated accessible label + a More-Help explainer (no echo-the-label tooltip). */
function renderAuthoredTextField(
  decision: LessonDecision,
  field: AuthoredTextField,
  labelText: string,
  helpText: string,
  placeholder: string,
  multiline: boolean,
  redraw: () => void,
): VNode {
  const content = authoredContentFor(_authoredContent, decision.identity.decisionId);
  const value = content[field] ?? '';
  const selector = multiline ? 'textarea.study-authoring__textarea' : 'input.study-authoring__input';
  return h('label.study-tools-col__field', [
    h('span.study-tools-col__label', labelText),
    h(selector, {
      attrs: {
        ...(multiline ? {} : { type: 'text' }),
        placeholder,
        'aria-label': labelText,
        ...controlExplainerAttrs({ label: labelText, description: helpText }),
      },
      props: { value },
      on: {
        input: (e: Event) => { setAuthoredContent(editAuthoredField(content, field, (e.target as HTMLInputElement | HTMLTextAreaElement).value)); },
        blur: () => redraw(),
      },
    }),
  ]);
}











let _drillLaunchNotice: { readonly message: string; readonly path: string } | null = null;

function renderPracticeToolPanel(redraw: () => void): VNode {
  const study = studyDetail();
  const root = detailRoot();
  if (!study || !root) {
    return h('div.study-tools-col__panel.study-tools-col__practice', [
      h('div.study-tools-col__empty', 'Study not loaded.'),
    ]);
  }

  ensureAuthoringModel(study, root, redraw);
  const path = detailPath();
  const currentNode = detailNode();
  const decision = _authoringDecisions.find(d => d.identity.authoredPath === path);
  const scope = validateScopeReadiness({ decisions: _authoringDecisions, content: _authoredContent, root });





  const drillBlocked = engineDrillActive() || engineDrillFinished();

  if (_drillLaunchNotice !== null && _drillLaunchNotice.path !== path) _drillLaunchNotice = null;
  const launchNotice = _drillLaunchNotice?.message ?? null;
  const drillLaunch = h('div.study-tools-col__field', [
    h('button.study-tools-col__drill-from-here', {
      attrs: {
        type: 'button',
        disabled: drillBlocked ? 'true' : false,
        ...controlExplainerAttrs({
          label: drillBlocked ? 'Drill from here (unavailable)' : 'Drill from here',
          description: drillBlocked
            ? 'An engine drill is already open — finish or close it on the analysis board first.'
            : 'Leaves this Study and starts an engine drill from the current position on the analysis board.',
          tier: 'essential',
        }),
      },
      on: {
        click: () => {
          _drillLaunchNotice = null; // a new attempt clears any stale failure notice
          const launched = requestStudyDrillLaunch({
            pgn: buildStudyPgn(),
            path,
            studyItemId: study.id,
            studyNodePath: path,
            difficulty: 'casual',
          });
          if (launched.ok) {
            writeHashRoute('#/analysis');
          } else if (launched.reason === 'landing-failed') {
            _drillLaunchNotice = { message: 'Could not open this position on the analysis board — the drill was not started.', path };
          }
          redraw();
        },
      },
    }, 'Drill from here'),
    launchNotice !== null ? h('div.study-tools-col__drill-notice', launchNotice) : null,
  ]);

  const children: (VNode | null)[] = [
    drillLaunch,
    h('div.study-tools-col__orp-head', [
      h('div.study-tools-col__orp-title', 'Lesson authoring'),
      h('div.study-tools-col__orp-context', [
        h('span.study-tools-col__orp-context-label', 'At'),
        h('span.study-tools-col__orp-context-value', authoringNodeLabel(currentNode)),
      ]),
    ]),
  ];

  if (!decision) {
    // Empty state: no authored decision at this node (e.g. the root position).
    children.push(h('div.study-tools-col__empty',
      'Select a move to author its lesson decision. The root position has no decision to author.'));
  } else {
    // Branch role selector (Essential — consequential; classifies the branch).
    children.push(h('div.study-tools-col__field', [
      h('span.study-tools-col__label', 'Branch role'),
      h('div.study-authoring__seg-list',
        BRANCH_ROLES.map(role => h('button.study-authoring__seg', {
          key: role,
          class: { 'study-authoring__seg--active': decision.role === role },
          attrs: {
            type: 'button', 'aria-pressed': String(decision.role === role),
            ...controlExplainerAttrs({ label: `Set branch role: ${AUTHORING_ROLE_LABELS[role]}`, description: 'Sets the explicit role for this branch.', tier: 'essential' }),
          },
          on: { click: () => { replaceAuthoringDecision(editDecisionRole(decision, role)); redraw(); } },
        }, AUTHORING_ROLE_LABELS[role])),
      ),
    ]));

    // Trainability selector (Essential — consequential; only Required blocks coverage / enrolls SRS).
    children.push(h('div.study-tools-col__field', [
      h('span.study-tools-col__label', 'Trainability'),
      h('div.study-authoring__seg-list',
        AUTHORING_TRAINABILITIES.map(trainability => h('button.study-authoring__seg', {
          key: trainability,
          class: { 'study-authoring__seg--active': decision.trainability === trainability },
          attrs: {
            type: 'button', 'aria-pressed': String(decision.trainability === trainability),
            ...controlExplainerAttrs({ label: `Set trainability: ${AUTHORING_TRAINABILITY_LABELS[trainability]}`, description: 'Sets whether and how this decision is trained.', tier: 'essential' }),
          },
          on: { click: () => { replaceAuthoringDecision(editDecisionTrainability(decision, trainability)); redraw(); } },
        }, AUTHORING_TRAINABILITY_LABELS[trainability])),
      ),
    ]));

    // Learner side/orientation toggle (Essential — consequential).
    children.push(h('div.study-tools-col__field', [
      h('span.study-tools-col__label', 'Learner side'),
      h('div.study-authoring__seg-list', (['white', 'black'] as const).map(side => h('button.study-authoring__seg', {
        key: side,
        class: { 'study-authoring__seg--active': decision.learnerSide === side },
        attrs: {
          type: 'button', 'aria-pressed': String(decision.learnerSide === side),
          ...controlExplainerAttrs({ label: side === 'white' ? 'Learner plays White' : 'Learner plays Black', description: 'Sets which side the learner recalls this decision as.', tier: 'essential' }),
        },
        on: { click: () => { replaceAuthoringDecision(editDecisionLearnerSide(decision, side)); redraw(); } },
      }, side === 'white' ? 'White' : 'Black'))),
    ]));

    // Authored-text fields (More Help by default). Comments/glyphs/arrows/shapes are authored on the
    // board via its own Comment box + glyph toolbar + shape drawing — NOT re-implemented here.
    children.push(renderAuthoredTextField(decision, 'instructionalPrompt', 'Recall prompt',
      'The question the learner answers from this position in Learn.', 'e.g. What is the plan here?', true, redraw));
    children.push(renderAuthoredTextField(decision, 'hiddenHint', 'Hidden hint',
      'An optional hint revealed on request during Learn.', 'Optional hint…', true, redraw));
    children.push(renderAuthoredTextField(decision, 'genericDeviation', 'Deviation explanation',
      'The fallback explanation shown for an off-book move.', 'Why other moves miss…', true, redraw));
    children.push(renderAuthoredTextField(decision, 'wrongRefutationExplanation', 'Wrong / refutation note',
      'The branch-specific explanation for this wrong or refuting line.', 'Refutation detail…', true, redraw));
    children.push(renderAuthoredTextField(decision, 'authoredBranchName', 'Required cue',
      'A unique branch name or recall cue used when a position has several Required continuations. It must not reveal the move.',
      'e.g. Kingside plan', false, redraw));

    children.push(h('div.study-tools-col__hint',
      'Comments, glyphs, arrows, and shapes are authored on the board and its Comment box — they are not duplicated here.'));
  }

  // Scoped readiness ("Preview as learner"): blocked list with repair routes, or trainable
  // confirmation. Blocks ONLY this scope (P2-ORP-15). Preview action is Essential; disabled while
  // blockers remain, with the exact scoped reason.
  if (scope.trainable) {
    children.push(h('div.study-authoring__ready', [
      h('span.study-authoring__ready-icon', { attrs: { 'aria-hidden': 'true' } }, '✓'),
      h('span', 'This scope is ready to train — no blockers.'),
    ]));
    children.push(h('button.study-authoring__preview', {
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({ label: 'Preview as learner', description: 'Opens this ready scope from the learner’s side to check it.', tier: 'essential' }),
      },
      on: { click: () => { _authoringPreviewAt = decision?.identity.decisionId ?? path; redraw(); } },
    }, 'Preview as learner'));
    if (_authoringPreviewAt) {
      children.push(h('div.study-tools-col__hint',
        `Previewing from ${decision?.learnerSide ?? 'the learner'}’s side. Use the board and move list to walk the line.`));
    }
  } else {
    children.push(h('div.study-authoring__blockers', [
      h('div.study-authoring__blockers-title', `${scope.blockers.length} blocker${scope.blockers.length === 1 ? '' : 's'} to resolve`),
      ...scope.blockers.map((blocker, index) => h('button.study-authoring__blocker-route', {
        key: `${blocker.kind}-${index}`,
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({ label: `Go to repair: ${AUTHORING_BLOCKER_LABELS[blocker.kind]}`, description: blocker.message, tier: 'essential' }),
        },
        on: {
          click: () => {
            const target = blocker.routes[0]?.authoredPath;
            if (target != null) { navigateTo(target, redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); }
          },
        },
      }, [
        h('span.study-authoring__blocker-kind', AUTHORING_BLOCKER_LABELS[blocker.kind]),
        h('span.study-authoring__blocker-msg', blocker.message),
      ])),
    ]));
    children.push(renderDisabledControlExplainer(
      {
        label: 'Preview as learner',
        description: `Resolve ${scope.blockers.length} blocker${scope.blockers.length === 1 ? '' : 's'} before previewing this scope.`,
      },
      h('button.study-authoring__preview', { attrs: { type: 'button', disabled: true } }, 'Preview as learner'),
    ));
  }

  return h('div.study-tools-col__panel.study-tools-col__practice.study-authoring', children);
}

// Defined at module scope so it survives the shared board's insert hook closure and any hook
// callback fired outside a render pass.
let _studyRedraw: () => void = () => {};

// --- Move input: consumed via the SHARED board (T5-D22b/c) ---
// board/index.ts's renderBoard() wires its own onUserMove -> applyMoveToTree, which (D22a) calls
// activeWorkspace().handleUserMove(parentPath, newNode) for a brand-new node, or navigates
// directly to an existing child. Study's own move-shaping logic (handleStudyMove) has been
// retired — see studyDetailCtrl.ts buildStudyWorkspaceAdapter's handleUserMove.
//
// route into main.ts's initGround() `navigate` closure for the existing-child-follow branch: this
// is invoked (via activeWorkspace-aware routing in main.ts, T5-D22b/c) instead of Analysis's own
// navigate() when Study is the mounted workspace, so it must apply the same tail effects Study's
// own nav-button/move-list handlers already apply (session update, board resync, route write).
export function studyBoardNavigate(path: string, redraw: () => void): void {
  navigateTo(path, redraw);
  syncStudyBoard(redraw);
  writeStudyDetailRoute();
}

// --- Hand-drawn shape (arrow/circle) persistence ---
// board/index.ts's shared renderBoard()/syncBoard() only wire `drawable.enabled` — they have no
// per-node shape save/restore (that's Study's own annotation feature: [%cal]/[%csl] round-tripped
// through buildStudyPgn/pgnToTree). Layered here via cgInstance.set() (an already-exported seam)
// so switching to the shared board does not silently drop it. Not editing board/index.ts.
function onStudyShapesChange(cgShapes: DrawShape[]): void {
  const converted = cgShapes.map(s => ({
    orig:  s.orig as string,
    ...(s.dest  ? { dest:  s.dest  as string } : {}),
    ...(s.brush ? { brush: s.brush            } : {}),
  }));
  updateCurrentNodeShapes(converted, _studyRedraw);
}

function currentStudyNodeShapes(): DrawShape[] {
  const node = detailNode();
  return (node?.shapes ?? []).map(s =>
    s.dest
      ? { orig: s.orig as DrawShape['orig'], dest: s.dest as NonNullable<DrawShape['dest']>, brush: s.brush ?? 'green' }
      : { orig: s.orig as DrawShape['orig'], brush: s.brush ?? 'green' }
  );
}

// Always pass enabled+onChange+shapes together — chessground's `.set()` does not guarantee
// partial-field merge of `drawable` across calls, so a shapes-only or onChange-only `.set()` could
// silently drop the other.
function syncStudyShapeDrawable(): void {
  cgInstance?.set({ drawable: { enabled: true, onChange: onStudyShapesChange, shapes: currentStudyNodeShapes() } });
}









function neutralizeStudyShapeDrawable(): void {
  cgInstance?.set({ drawable: { enabled: false, onChange: () => {}, shapes: [] } });
}





function isOrdinaryStudyBoardActive(): boolean {
  return isStudyWorkspaceActive() && activeWorkspace()?.boardInputMode === 'always-new-variation';
}









export function syncStudyBoard(redraw?: () => void): void {
  if (!isStudyWorkspaceActive()) return;
  // P0 first: apply the visible position for either Study sibling before any lower-priority work.
  syncBoard();
  if (activeWorkspace()?.boardInputMode !== 'always-new-variation') {



    neutralizeStudyShapeDrawable();
    return;
  }
  syncStudyShapeDrawable();
  if (redraw) scheduleStudyEngineSync(redraw);
}

// Re-syncs the shared board after ANY committed board move while Study is mounted — covers both
// the "new variation" branch (studyDetailCtrl's handleUserMove already ran addNode/setPath/
// markDirty/redraw by the time this fires) and the "existing child, follow it" branch (handled by
// studyBoardNavigate above, which already calls syncStudyBoard itself — this call is then a
// harmless, idempotent no-op-ish re-sync). Registered once; safe to fire on Analysis's own moves
// too since syncStudyBoard() no-ops unless Study is the active workspace.
onBoardUserMove(() => { syncStudyBoard(); });



let _studyMenuOpen = false;

function reportStudyIssue(): void {
  const session = reportIssue({ triggeredBy: 'study-route', route: '/study' });
  console.info('[diagnostics] report issue session', session);
}

// Flip icon codepoint — Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_FLIP = ''; // licon.ChasingArrows — flip board



let _studyEngineOn = false;
let _studyEngineSyncGeneration = 0;
let _studyEngineSyncTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleStudyEngineSync(redraw: () => void): void {
  const generation = ++_studyEngineSyncGeneration;
  clearTimeout(_studyEngineSyncTimer);
  _studyEngineSyncTimer = setTimeout(() => {
    if (generation !== _studyEngineSyncGeneration) return;
    if (activeWorkspace()?.boardInputMode !== 'always-new-variation') return;
    syncStudyEngine(redraw);
  }, 120);
}

// Prior main-surface live-eval save callback, captured when the Study Detail engine starts and
// RESTORED when it stops, so the main analysis board keeps auto-persisting live-eval improvements
// after Study Detail exits (BUG-2026-07-12-001). `undefined` = no capture in effect (idle);
// a captured value may legitimately be `null` (nothing was registered on the main surface), so
// `undefined` is the distinct empty sentinel.
let _priorOnLiveEvalImproved: (() => void) | null | undefined;





let _studyPositionContextTestOverride: (() => EnginePositionContext | null) | undefined;

export function studyEngineOn(): boolean { return _studyEngineOn; }

function studyPositionContext(): EnginePositionContext | null {
  if (_studyPositionContextTestOverride) return _studyPositionContextTestOverride();
  const root = detailRoot();
  const node = detailNode();
  if (!node) return null;
  if (!root) return fenOnlyPositionContext(node.fen, 'study-detail', 'missing-study-root');
  const path = detailPath();
  return contextFromNodeList(nodeListAt(root, path), 'study-detail', path);
}

function startStudyEngine(redraw: () => void): void {
  const context = studyPositionContext();
  if (!context) return;
  _studyEngineOn = true;
  setEvalPositionOverride('study-detail', context);
  // Save the current (main-surface) live-eval callback so stopStudyEngine can restore it instead of
  // nulling it. Only capture when the slot is empty so a double-start (start called again before a
  // stop) can't overwrite the saved main callback with the study redraw (BUG-2026-07-12-001).
  if (_priorOnLiveEvalImproved === undefined) _priorOnLiveEvalImproved = getOnLiveEvalImproved();
  setOnLiveEvalImproved(redraw);
  evalCurrentPosition();
  redraw();
}

function stopStudyEngine(redraw: () => void): void {
  ++_studyEngineSyncGeneration;
  clearTimeout(_studyEngineSyncTimer);
  _studyEngineOn = false;
  protocol.stop();
  clearEvalPositionOverride('study-detail');
  // Restore the previously-registered (main-surface) live-eval callback instead of nulling it, so
  // the main analysis board resumes auto-persisting live-eval improvements after study exit. If no
  // prior was captured (stop without a preceding start), fall back to null — the pre-fix behavior.
  setOnLiveEvalImproved(_priorOnLiveEvalImproved ?? null);
  _priorOnLiveEvalImproved = undefined;
  redraw();
}

function toggleStudyEngine(redraw: () => void): void {
  if (_studyEngineOn) stopStudyEngine(redraw);
  else startStudyEngine(redraw);
}

// Called after navigation — restarts engine on the new position if it was on.
function syncStudyEngine(redraw: () => void): void {
  if (!_studyEngineOn) return;
  const context = studyPositionContext();
  if (!context) return;
  setEvalPositionOverride('study-detail', context);
  evalCurrentPosition();
}





export const __ccp2016CallbackOwnershipTestSeam = {
  startStudyEngine,
  stopStudyEngine,
  setOnLiveEvalImproved,
  getOnLiveEvalImproved,
  setPositionContextOverride(fn: (() => EnginePositionContext | null) | null): void {
    _studyPositionContextTestOverride = fn ?? undefined;
  },
};

type StudyPlayerColor = 'white' | 'black';

const STUDY_PV_SLOT_COUNT = 20;

function studyPlayerResult(study: StudyItem, color: StudyPlayerColor): string | null {
  const result = study.result?.trim();
  if (!result || result === '*') return null;
  const parts = result.split('-');
  if (parts.length !== 2) return result.replace('1/2', '½');
  return (color === 'white' ? parts[0] : parts[1])?.replace('1/2', '½') ?? null;
}

function renderStudyPlayerBar(study: StudyItem, color: StudyPlayerColor, placement: 'top' | 'bottom'): VNode {
  const name = (color === 'white' ? study.white : study.black) || (color === 'white' ? 'White' : 'Black');
  const result = studyPlayerResult(study, color);
  return h(`div.study-player-bar.study-player-bar--${placement}`, [
    h(`span.study-player-bar__dot.study-player-bar__dot--${color}`, { attrs: { 'aria-hidden': 'true' } }),
    h('span.study-player-bar__name', name),
    result ? h('span.study-player-bar__result', result) : null,
  ]);
}

function studyBoardPlayerColors(): { top: StudyPlayerColor; bottom: StudyPlayerColor } {
  return detailOrientation() === 'white'
    ? { top: 'black', bottom: 'white' }
    : { top: 'white', bottom: 'black' };
}

function hasStudyEvalData(ev: PositionEval | EvalLine | undefined): boolean {
  return !!ev && (ev.cp !== undefined || ev.mate !== undefined || !!ev.best || !!ev.moves?.length);
}

function studyVisibleEvalForCurrentFen(): { fen: string; ev: PositionEval } | null {
  const node = detailNode();
  if (!node) return null;
  return { fen: node.fen, ev: visibleEvalForFen(node.fen) };
}

function studyPvLinesForEval(fen: string, ev: PositionEval): Array<PositionEval | EvalLine> {
  const candidates: Array<PositionEval | EvalLine> = [];
  if (hasStudyEvalData(ev)) candidates.push(ev);
  for (const line of ev.lines ?? []) {
    if (hasStudyEvalData(line)) candidates.push(line);
  }
  return candidates.filter(line => evalLineFirstMoveLegalInFen(fen, line));
}

function studyPvMovesAsSan(fen: string, moves: string[] | undefined): string {
  if (!moves?.length) return '';
  try {
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    const sans: string[] = [];
    for (const uci of moves.slice(0, 10)) {
      const move = parseUci(uci);
      if (!move || !pos.isLegal(move)) break;
      const prefix = pos.turn === 'white'
        ? `${pos.fullmoves}.`
        : sans.length === 0 ? `${pos.fullmoves}...` : '';
      const san = makeSanAndPlay(pos, move);
      if (san === '--') break;
      sans.push(prefix ? `${prefix} ${san}` : san);
    }
    return sans.join(' ');
  } catch {
    return moves.slice(0, 10).join(' ');
  }
}

function renderStudyPvRow(fen: string, line: PositionEval | EvalLine | undefined, index: number): VNode {
  if (!line) {
    return h('div.study-local-analysis__pv-row.study-local-analysis__pv-row--empty', [
      h('span.study-local-analysis__pv-index', `${index + 1}`),
      h('span.study-local-analysis__pv-placeholder', index === 0 && _studyEngineOn ? 'Waiting for current position...' : ''),
    ]);
  }

  const moves = line.moves ?? (line.best ? [line.best] : []);
  const moveText = studyPvMovesAsSan(fen, moves);
  return h('div.study-local-analysis__pv-row', [
    h('span.study-local-analysis__pv-index', `${index + 1}`),
    h('strong.study-local-analysis__pv-score', formatScore(line)),
    h('span.study-local-analysis__pv-moves', moveText || (line.best ?? '')),
  ]);
}

function renderStudyLocalAnalysisPanel(): VNode {
  const visible = studyVisibleEvalForCurrentFen();
  const lines = visible ? studyPvLinesForEval(visible.fen, visible.ev) : [];
  const depth = visible?.ev.depth;
  const status = !_studyEngineOn
    ? 'Engine off'
    : !engineReady
      ? 'Loading...'
      : lines.length > 0
        ? depth !== undefined ? `depth ${depth}` : 'current FEN'
        : 'No exact-FEN eval yet';
  const slotLines = Array.from({ length: STUDY_PV_SLOT_COUNT }, (_, i) => lines[i]);

  return h('aside.study-local-analysis', {
    attrs: {
      'aria-label': 'Local analysis',
      'data-current-fen': visible?.fen ?? '',
    },
  }, [
    h('div.study-local-analysis__head', [
      h('div.study-local-analysis__title', [
        h('span.study-local-analysis__engine', protocol.engineName ?? 'Stockfish 18'),
        h('span.study-local-analysis__mode', 'Local analysis'),
      ]),
      h('span.study-local-analysis__status', status),
    ]),
    !_studyEngineOn
      ? h('div.study-local-analysis__idle', 'Enable Engine from the Study menu to show current-position lines.')
      : h('div.study-local-analysis__pv-list',
          slotLines.map((line, index) => renderStudyPvRow(visible?.fen ?? '', line, index)),
        ),
  ]);
}

function renderStudyEvalGraphPlaceholder(): VNode {
  return h('div.study-eval-graph-placeholder', [
    h('span.study-eval-graph-placeholder__line', { attrs: { 'aria-hidden': 'true' } }),
    h('span.study-eval-graph-placeholder__text', 'Analyze game to see graph'),
  ]);
}

function renderStudyBoardRegion(study: StudyItem, redraw: () => void): VNode {
  const colors = studyBoardPlayerColors();
  return h('div.study-board-region', [
    h('div.study-board-stack', [
      renderStudyPlayerBar(study, colors.top, 'top'),
      renderStudyBoardArea(),
      renderStudyPlayerBar(study, colors.bottom, 'bottom'),
      renderStudyEvalGraphPlaceholder(),
      h('div.study-board-controls', [
        renderStudyNavBar(redraw),
        renderManualReviewToggle(redraw),
      ]),
      _glyphQuickSelectOpen ? renderGlyphQuickSelect(redraw) : null,
    ]),
    renderStudyLocalAnalysisPanel(),
  ]);
}

// --- Board VNode (T5-D22b/c: the shared board, board/index.ts renderBoard()) ---
// Wrapped in a keyed parent whose OWN insert hook fires after the child's (Snabbdom fires insert
// hooks bottom-up: a vnode's children are created/inserted before the vnode itself is pushed onto
// the insert queue), so cgInstance already exists by the time syncStudyShapeDrawable() runs here,
// attaching Study's shape-drawing persistence without editing board/index.ts.
function renderStudyBoardArea(): VNode {
  return h('div.study-board-wrap', {
    key: 'study-board-wrap',










    hook: { insert: () => {
      if (isOrdinaryStudyBoardActive()) syncStudyShapeDrawable();
      else if (isStudyWorkspaceActive()) neutralizeStudyShapeDrawable();
    } },
  }, [renderBoard(), renderPromotionDialog()]);
}





function renderStudyActionMenu(redraw: () => void): VNode | null {
  if (!_studyMenuOpen) return null;
  const close = () => { _studyMenuOpen = false; redraw(); };

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: iconControlExplainerAttrs({ label: 'Close Study menu' }),
      on:    { click: close },
    }, '×'),

    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      // Flip board — mirrors lichess-org/lila: actionMenu.ts ctrl.flip() action
      h('button', {
        attrs: { 'data-icon': ICON_FLIP, ...controlExplainerAttrs({ label: 'Flip board', description: 'Reverses the Study board orientation.' }) },
        on: { click: () => {
          flipStudyBoard(redraw);
          writeStudyDetailRoute();
          close();
        } },
      }, 'Flip board'),
      h('button', {
        attrs: controlExplainerAttrs({ label: 'Report a Study issue', description: 'Opens diagnostics reporting for the Study page.' }),
        on: { click: () => { reportStudyIssue(); close(); } },
      }, 'Report issue'),
    ]),

    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow(
        'study-engine',
        'Engine',
        _studyEngineOn,
        (v) => { if (v) startStudyEngine(redraw); else stopStudyEngine(redraw); },
      ),
    ]),
  ]);
}




function renderStudyNavBar(redraw: () => void): VNode {
  const canPrev = detailPath() !== '';
  const canNext = (detailNode()?.children.length ?? 0) > 0;
  const override: MoveNavOverride = {
    canPrev,
    canNext,
    first:     () => { navigateFirst(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    prev:      () => { navigatePrev(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    next:      () => { navigateNext(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    last:      () => { navigateLast(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    // No onBook: study view has no explorer plumbing, so the book button is intentionally omitted.
    menuTitle: 'Study menu',
    menuOpen:  _studyMenuOpen,
    onMenu:    () => { _studyMenuOpen = !_studyMenuOpen; redraw(); },
  };
  return renderMoveNavBar([], override);
}


let _showBookmarksOnly = false;

function toggleBookmarkFilter(redraw: () => void): void {
  _showBookmarksOnly = !_showBookmarksOnly;
  redraw();
}

// Build a Set of bookmarked paths from the study for use in renderMoveList.
// Reads directly from studyDetail() to avoid separate prop drilling.
function bookmarkedPathsSet(): Set<string> | undefined {
  if (!_showBookmarksOnly) return undefined; // undefined = no filter, show all
  // Even in filter mode, pass the full set so icons show on bookmarked moves.
  // Filtering the tree itself is done by returning undefined nodes — out of scope here.
  // Just return an always-defined set so bookmark icons are always visible when filter is on.
  return undefined;
}

// Returns a set of all bookmarked paths for icon rendering (always active when study loaded).
function allBookmarkedPaths(): Set<string> {
  const study = studyDetail();
  return new Set(study?.bookmarks ?? []);
}


const _foldedVariations = new Set<string>();

function toggleFold(path: string, redraw: () => void): void {
  if (_foldedVariations.has(path)) _foldedVariations.delete(path);
  else _foldedVariations.add(path);
  redraw();
}


let _studyCtxPath: string | null = null;
let _studyCtxPos:  { x: number; y: number } = { x: 0, y: 0 };

function openStudyCtxMenu(path: string, e: MouseEvent, redraw: () => void): void {
  _studyCtxPath = path;
  _studyCtxPos  = { x: e.clientX, y: e.clientY };
  redraw();
}

function closeStudyCtxMenu(redraw: () => void): void {
  _studyCtxPath = null;
  redraw();
}

function renderStudyContextMenu(redraw: () => void): VNode | null {
  const path = _studyCtxPath;
  if (!path) return null;

  const root = detailRoot();
  if (!root) return null;

  // Only show the context menu on non-mainline paths (variations).
  // Main line is always accessible — only show promote/delete on side branches.
  const isMainline = (() => {
    let node = root;
    let remaining = path;
    while (remaining.length >= 2) {
      const id = remaining.slice(0, 2);
      remaining = remaining.slice(2);
      const child = node.children.find(c => c.id === id);
      if (!child) return false;
      if (node.children[0]?.id !== id) return false; // branched off mainline
      node = child;
    }
    return true;
  })();

  const items: VNode[] = [];

  if (!isMainline) {
    items.push(
      h('div.study-ctx-item', {
        attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Promote variation', description: 'Moves this variation one level closer to the main line.' }) },
        on: { click: () => {
          if (_studyCtxPath && root) { promoteAt(root, _studyCtxPath, false); }
          writeStudyDetailRoute();
          closeStudyCtxMenu(redraw);
        }, keydown: (e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (_studyCtxPath && root) promoteAt(root, _studyCtxPath, false);
          writeStudyDetailRoute();
          closeStudyCtxMenu(redraw);
        }},
      }, 'Promote variation'),
      h('div.study-ctx-item', {
        attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Make main line', description: 'Promotes this variation to become the main line.' }) },
        on: { click: () => {
          if (_studyCtxPath && root) { promoteAt(root, _studyCtxPath, true); }
          writeStudyDetailRoute();
          closeStudyCtxMenu(redraw);
        }, keydown: (e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (_studyCtxPath && root) promoteAt(root, _studyCtxPath, true);
          writeStudyDetailRoute();
          closeStudyCtxMenu(redraw);
        }},
      }, 'Make main line'),
    );
  }

  items.push(
    h('div.study-ctx-item', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Practice from here', description: 'Starts opening practice from this Study position.' }) },
      on: { click: () => {
        _practiceFromPath = _studyCtxPath;
        _showColorPicker  = true;
        closeStudyCtxMenu(redraw);
      }, keydown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        _practiceFromPath = _studyCtxPath;
        _showColorPicker = true;
        closeStudyCtxMenu(redraw);
      }},
    }, 'Practice from here'),
    h('div.study-ctx-item.study-ctx-item--danger', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Delete from here', description: 'Permanently removes this move and every continuation below it.' }) },
      on: { click: () => {
        if (_studyCtxPath && root) { deleteNodeAt(root, _studyCtxPath); }
        // If deleted path is active, navigate to its parent
        const curPath = detailPath();
        if (_studyCtxPath && curPath.startsWith(_studyCtxPath)) {
          navigateTo(pathInit(_studyCtxPath), redraw);
          syncStudyBoard(redraw);
        }
        writeStudyDetailRoute();
        closeStudyCtxMenu(redraw);
      }, keydown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (_studyCtxPath && root) deleteNodeAt(root, _studyCtxPath);
        const curPath = detailPath();
        if (_studyCtxPath && curPath.startsWith(_studyCtxPath)) {
          navigateTo(pathInit(_studyCtxPath), redraw);
          syncStudyBoard(redraw);
        }
        writeStudyDetailRoute();
        closeStudyCtxMenu(redraw);
      }},
    }, 'Delete from here'),
  );

  return h('div.study-ctx-overlay', {
    attrs: { 'aria-label': 'Close variation menu', ...controlExplainerAttrs({ label: 'Close variation menu' }) },
    on: { click: () => closeStudyCtxMenu(redraw) },
  }, [
    h('div.study-ctx-menu', {
      attrs: { 'aria-label': 'Variation menu', ...controlExplainerAttrs({ label: 'Variation menu' }) },
      style: { left: `${_studyCtxPos.x}px`, top: `${_studyCtxPos.y}px` },
      on: { click: (e: MouseEvent) => e.stopPropagation() },
    }, items),
  ]);
}


let _glyphQuickSelectOpen = false;
let _glyphQuickSelectKey  = '';

function renderGlyphQuickSelect(redraw: () => void): VNode {
  // Filter glyphs by which key triggered the select (! shows !-family, ? shows ?-family)
  const filtered = _glyphQuickSelectKey === '!'
    ? GLYPHS.filter(g => g.symbol.startsWith('!') || g.symbol === '=' || g.symbol.includes('+'))
    : GLYPHS.filter(g => g.symbol.includes('?'));

  return h('div.glyph-quick-select', [
    h('span.glyph-quick-select__label', 'Pick:'),
    ...filtered.map(glyph =>
      h('button.glyph-btn', {
        attrs: iconControlExplainerAttrs({ label: glyph.name, description: 'Toggles this annotation on the current move.' }),
        on:    { click: () => {
          const node = detailNode();
          if (node) {
            const current = node.glyphs ?? [];
            const hasIt   = current.some(g => g.id === glyph.id);
            const updated = hasIt ? current.filter(g => g.id !== glyph.id) : [...current, glyph];
            updateCurrentNodeGlyphs(updated, redraw);
          }
          _glyphQuickSelectOpen = false;
          redraw();
        } },
      }, glyph.symbol)
    ),
    h('button.glyph-btn', {
      attrs: iconControlExplainerAttrs({ label: 'Cancel glyph selection' }),
      on:    { click: () => { _glyphQuickSelectOpen = false; redraw(); } },
    }, '×'),
  ]);
}



function handleStudyKeydown(e: KeyboardEvent, redraw: () => void): void {
  if (_glyphQuickSelectOpen) {
    if (e.key === 'Escape') { _glyphQuickSelectOpen = false; redraw(); }
    return;
  }
  if (e.key === '!' || e.key === '?') {
    _glyphQuickSelectOpen = true;
    _glyphQuickSelectKey  = e.key;
    redraw();
  }
  // Nav keys
  if (e.key === 'ArrowLeft')  { navigatePrev(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); }
  if (e.key === 'ArrowRight') { navigateNext(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); }
}



function loadPracticeLinesForStudy(studyId: string, redraw: () => void): void {
  if (_practiceLinesStudyId === studyId && _practiceLinesLoaded) return;
  _practiceLinesStudyId = studyId;
  _practiceLinesLoaded  = false;
  _practiceLinesError   = false;
  void listPracticeLines(studyId).then(lines => {
    _practiceLines       = lines;
    _practiceLinesError  = false;
    _practiceLinesLoaded = true;
    redraw();
  }).catch(e => {
    // BUG-2026-07-10-008 P2 freeze guard: listPracticeLines now REJECTS on a genuine storage
    // failure (previously it masked the failure as []). Without this catch the panel would spin
    // on "Loading practice lines…" forever (loaded flag set only inside .then) and the rejection
    // would go unhandled. Latch loaded + an error flag so the panel renders an honest inline error
    // instead of a permanent spinner or a false "no practice lines" empty state.
    console.warn('[studyDetailView] listPracticeLines failed', e);
    _practiceLines       = [];
    _practiceLinesError  = true;
    _practiceLinesLoaded = true;
    redraw();
  });
}

function renderPracticeLinesPanel(studyId: string, redraw: () => void): VNode {
  if (!_practiceLinesLoaded) return h('div.study-practice-lines', 'Loading practice lines…');
  if (_practiceLinesError) return h('div.study-practice-lines.study-practice-lines--empty', 'Could not load practice lines (storage error). Reopen this study to try again.');
  if (_practiceLines.length === 0) return h('div.study-practice-lines.study-practice-lines--empty', 'No practice lines. Click "Practice this line" to create one.');

  const pMap = progressMap();

  return h('div.study-practice-lines', [
    h('div.study-practice-lines__title', 'Practice Lines'),
    h('ul.study-practice-lines__list',
      _practiceLines.map(line => {
        const dueForLine = countDuePositions([line], pMap);
        const isRenaming = _renamingLineId === line.id;
        return h('li.study-practice-line', { key: line.id }, [
          isRenaming
            ? h('input.study-practice-line__rename', {
                attrs: { value: _renamingLineValue, 'aria-label': 'Practice line name', ...controlExplainerAttrs({ label: 'Practice line name', description: 'Renames this practice line when the field loses focus.' }) },
                hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
                on: {
                  input:   (e: Event) => { _renamingLineValue = (e.target as HTMLInputElement).value; },
                  blur:    () => {
                    const newLabel = _renamingLineValue.trim() || line.label;
                    void savePracticeLine({ ...line, label: newLabel }).then(() => {
                      _practiceLines = _practiceLines.map(l => l.id === line.id ? { ...l, label: newLabel } : l);
                      _renamingLineId    = null;
                      _renamingLineValue = '';
                      redraw();
                    });
                  },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { _renamingLineId = null; redraw(); }
                  },
                },
              })
            : h('span.study-practice-line__label', {
                attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: `Rename ${line.label}`, description: 'Opens this practice line name for editing.' }) },
                on: {
                  dblclick: () => { _renamingLineId = line.id; _renamingLineValue = line.label; redraw(); },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    _renamingLineId = line.id;
                    _renamingLineValue = line.label;
                    redraw();
                  },
                },
              }, line.label),
          h('span.study-practice-line__color', line.trainAs === 'white' ? '♙' : '♟'),
          h('span.study-practice-line__status', {
            class: { 'study-practice-line__status--paused': line.status === 'paused' },
          }, line.status === 'active' ? '●' : '⏸'),
          h('span.study-practice-line__count', `${line.sans.length} moves`),
          dueForLine > 0
            ? h('span.study-practice-line__due', `${dueForLine} due`)
            : null,
          h('div.study-practice-line__actions', [
            h('button.study-practice-line__btn', {
              attrs: iconControlExplainerAttrs({ label: 'Practice now', description: 'Starts a drill with this saved practice line.' }),
              on: { click: () => {
                // Embedded Study launch: restore the Study workspace when the drill finally exits
                // (CCW-H03b). The one-shot callback survives "Practice Again" and is consumed only
                // on final teardown, and only if the drill was still the active workspace.
                initDrillView(
                  [line],
                  line.fens[0] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                  line.trainAs,
                  redraw,
                  'quiz',
                  () => mountStudyWorkspace(redraw),
                );
                redraw();
              }},
            }, '▶'),
            h('button.study-practice-line__btn', {
              attrs: {
                ...iconControlExplainerAttrs({ label: line.status === 'active' ? 'Pause practice line' : 'Resume practice line', description: `${line.status === 'active' ? 'Pauses' : 'Resumes'} scheduling for this practice line.` }),
              },
              on: { click: () => {
                const newStatus = line.status === 'active' ? 'paused' : 'active';
                void savePracticeLine({ ...line, status: newStatus }).then(() => {
                  _practiceLines = _practiceLines.map(l => l.id === line.id ? { ...l, status: newStatus } : l);
                  redraw();
                });
              }},
            }, line.status === 'active' ? '⏸' : '▶▶'),
            h('button.study-practice-line__btn.study-practice-line__btn--danger', {
              attrs: iconControlExplainerAttrs({ label: 'Delete practice line', description: 'Permanently deletes this saved practice line.' }),
              on: { click: () => {
                void deletePracticeLine(line.id).then(() => {
                  _practiceLines = _practiceLines.filter(l => l.id !== line.id);
                  redraw();
                });
              }},
            }, '✕'),
          ]),
        ]);
      }),
    ),
  ]);
}




function renderColorPicker(study: StudyItem, root: import('../tree/types').TreeNode, redraw: () => void): VNode {
  const currentPath = detailPath();
  const fromPath    = _practiceFromPath; // set by "Practice from here", null for "Practice this line"

  const launch = (color: 'white' | 'black') => {
    _showColorPicker  = false;
    _practiceFromPath = null;
    const title = study.title;
    const seqId  = `${study.id}_${color}_${Date.now()}`;
    let seq;
    let startFen: string;

    if (fromPath) {
      // "Practice from here" — extract from the context-menu path.
      seq      = extractFromPath(root, fromPath, study.id, `${title} (from move)`, color, seqId);
      startFen = getNodeAtPath(root, fromPath)?.fen ?? root.fen;
    } else if (_practiceScope === 'current' && currentPath) {
      seq      = extractFromPath(root, currentPath, study.id, `${title} (from current)`, color, seqId);
      startFen = getNodeAtPath(root, currentPath)?.fen ?? root.fen;
    } else if (_practiceScope === 'variation' && currentPath) {
      seq      = extractFromVariationPath(root, currentPath, study.id, `${title} (variation)`, color, seqId);
      startFen = root.fen;
    } else {
      // Full game — mainline from root.
      seq      = extractMainline(root, study.id, title, color, seqId);
      startFen = root.fen;
    }

    if (!seq) { redraw(); return; }
    // Embedded Study launch (color-picker / extracted-line): restore the Study workspace on final
    // drill exit (CCW-H03b). One-shot; survives "Practice Again"; consumed only if the drill was
    // still the active workspace.
    initDrillView([seq], startFen, color, redraw, 'quiz', () => mountStudyWorkspace(redraw));
    redraw();
  };

  // Scope buttons only shown when triggered from "Practice this line" (not from context menu).
  const showScopeSelector = !fromPath;
  const hasCurrentPath    = currentPath.length > 0;

  return h('div.study-color-picker-overlay', {
    attrs: { 'aria-label': 'Close practice setup', ...controlExplainerAttrs({ label: 'Close practice setup' }) },
    on: { click: (e: Event) => { if (e.target === e.currentTarget) { _showColorPicker = false; _practiceFromPath = null; redraw(); } } },
  }, [
    h('div.study-color-picker', [
      showScopeSelector
        ? h('div.study-scope-selector', [
            h('div.study-scope-selector__title', 'Scope'),
            h('div.study-scope-selector__options', [
              h('button.study-scope-btn', {
                class: { 'study-scope-btn--active': _practiceScope === 'full' },
                attrs: { type: 'button', 'aria-pressed': String(_practiceScope === 'full'), ...controlExplainerAttrs({ label: 'Practice full game', description: 'Builds the practice sequence from the full game main line.' }) },
                on: { click: () => { _practiceScope = 'full'; redraw(); } },
              }, 'Full game'),
              hasCurrentPath
                ? h('button.study-scope-btn', {
                    class: { 'study-scope-btn--active': _practiceScope === 'current' },
                    attrs: { type: 'button', 'aria-pressed': String(_practiceScope === 'current'), ...controlExplainerAttrs({ label: 'Practice from current position', description: 'Builds the practice sequence from the current position.' }) },
                    on: { click: () => { _practiceScope = 'current'; redraw(); } },
                  }, 'From current position')
                : null,
              hasCurrentPath
                ? h('button.study-scope-btn', {
                    class: { 'study-scope-btn--active': _practiceScope === 'variation' },
                    attrs: { type: 'button', 'aria-pressed': String(_practiceScope === 'variation'), ...controlExplainerAttrs({ label: 'Practice selected variation', description: 'Builds the practice sequence from the selected variation.' }) },
                    on: { click: () => { _practiceScope = 'variation'; redraw(); } },
                  }, 'Selected variation')
                : null,
            ]),
          ])
        : null,
      h('div.study-color-picker__title', 'Practice as…'),
      h('div.study-color-picker__buttons', [
        h('button.study-color-picker__btn.study-color-picker__btn--white', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Practice as White', description: 'Starts the selected practice sequence from White’s perspective.' }) },
          on: { click: () => launch('white') },
        }, '♙ White'),
        h('button.study-color-picker__btn.study-color-picker__btn--black', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Practice as Black', description: 'Starts the selected practice sequence from Black’s perspective.' }) },
          on: { click: () => launch('black') },
        }, '♟ Black'),
      ]),
      h('button.study-color-picker__cancel', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel practice setup' }) },
        on: { click: () => { _showColorPicker = false; _practiceFromPath = null; redraw(); } },
      }, 'Cancel'),
    ]),
  ]);
}

// --- Detail view entry point ---
export function renderStudyDetail(id: string, redraw: () => void, routeQuery = ''): VNode {
  _studyRedraw = redraw;



















  const routeKey = `${id}?${routeQuery}`;
  syncToolsStateFromRoute(routeKey, routeQuery);
  const hydrationQuery = coreRouteQuery(routeQuery);
  const hydrationKey = `${id}?${hydrationQuery}`;
  if (coreLoadRouteKey(detailLoadRouteKey()) !== hydrationKey) {
    hydrateStudyDetailRoute(id, routeQuery, redraw);
  } else {
    // Tools-only route updates deliberately skip hydration but still become rollback truth.
    // Update the retained query only after the core comparison so a path/orientation change
    // cannot hide the hydration it requires.
    rememberStudyDetailRouteQuery(id, routeQuery);
  }
  if (!detailLoaded()) {
    return h('div.study-detail', h('div.study-detail__loading', 'Loading…'));
  }


  loadPracticeLinesForStudy(id, redraw);

  const study = studyDetail();
  if (!study) {





    return h('div.study-detail', [
      h('div.study-detail__empty', 'Study not found.'),
    ]);
  }

  const root = detailRoot();
  const path = detailPath();












  const practiceRequested = _toolsOpen && _activeToolTab === 'practice' && !isDrillActive() && !isDrillSummary() && !isSourcePreviewOpen();
  reconcileStudyPracticeSlot(practiceRequested, redraw);







  establishRouteDestination({ name: 'study-detail', params: { id }, query: routeQuery }, isStudyWorkspaceActive());





  if (isSourcePreviewOpen()) {
    return renderSourcePreview(redraw);
  }


  if (isDrillActive() || isDrillSummary()) {
    return h('div.study-detail', [
      h('div.study-detail__header', [
        h('button.study-back', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Back to Library', description: 'Ends the current drill and returns to the Study Library.' }) },
          on: { click: () => { endDrill('study-back', 'dismiss'); _showColorPicker = false; redraw(); } },
        }, '← Library'),
        h('h1.study-detail__title', study.title),
      ]),
      renderDrillView(redraw),
    ]);
  }

  return h('div.study-detail', [




    h('div.study-detail__header', [
      h('h1.study-detail__title', study.title),

      h('div.study-header-actions', [
        h('button.study-btn', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Copy PGN', description: 'Copies the annotated Study PGN to the clipboard.' }) },
          on: { click: () => {
            const pgn = buildStudyPgn();
            void navigator.clipboard.writeText(pgn).then(() => redraw());
          }},
        }, 'Copy PGN'),
        h('button.study-btn', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Download PGN', description: 'Downloads the annotated Study game as a PGN file.' }) },
          on: { click: () => {
            const pgn  = buildStudyPgn();
            const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.setAttribute('data-ui-explainer-exempt', 'programmatic-download-node');
            a.href     = url;
            a.download = `${study.title.replace(/[^a-z0-9]/gi, '_')}.pgn`;
            a.click();
            URL.revokeObjectURL(url);
          }},
        }, 'Download PGN'),
        root
          ? h('button.study-btn.study-btn--practice', {
              attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Practice this line', description: 'Opens practice setup for the current Study line.' }) },
              on: { click: () => { _showColorPicker = true; redraw(); } },
            }, 'Practice this line')
          : null,
      ]),
    ]),

    _showColorPicker ? renderColorPicker(study, root!, redraw) : null,


    renderStudyContextMenu(redraw),

    // Main layout: board column + tools column
    h('div.study-detail__layout', [
      // Board column — keyboard handlers for glyph quick-select and nav
      h('div.study-detail__board-col', {
        attrs: { tabindex: '0', 'data-ui-explainer-exempt': 'chessboard-play-surface' },
        on:    { keydown: (e: KeyboardEvent) => handleStudyKeydown(e, redraw) },
      }, [
        renderStudyBoardRegion(study, redraw),
      ]),

      // Tools column: move list + annotation panel
      h('div.study-detail__tools-col', [
        // Study action menu overlay — must be first child so position:absolute covers the column.
        // Mirrors the pattern in openings/view.ts renderOpeningsActionMenu placement.
        renderStudyActionMenu(redraw),
        // Bookmark filter toggle
        h('div.study-tools-bar', [
          h('button.study-btn', {
            class: { 'study-btn--active': _showBookmarksOnly },
            attrs: { type: 'button', 'aria-pressed': String(_showBookmarksOnly), ...controlExplainerAttrs({ label: _showBookmarksOnly ? 'Show all moves' : 'Show bookmarked moves only', description: `${_showBookmarksOnly ? 'Stops filtering' : 'Filters'} the move list by bookmarked positions.` }) },
            on:    { click: () => toggleBookmarkFilter(redraw) },
          }, _showBookmarksOnly ? '★ Bookmarks' : '☆ Bookmarks'),
          isBookmarked(path)
            ? h('span.study-bookmark-indicator', '★')
            : null,
        ]),
        root
          ? renderMoveList(
              root,
              path,
              () => undefined,        // no eval lookup in study view
              (p) => { navigateTo(p, redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
              null,                   // no user color
              false,
              (p) => {
                deleteNodeAt(root, p);
                const cur = detailPath();
                if (cur.startsWith(p)) {
                  navigateTo(pathInit(p), redraw);
                  syncStudyBoard(redraw);
                } else {
                  redraw();
                }
                writeStudyDetailRoute();
              },
              _studyCtxPath,
              (p, e) => openStudyCtxMenu(p, e, redraw),
              undefined,
              _foldedVariations,
              (p) => toggleFold(p, redraw),
              allBookmarkedPaths(),
              (p) => { toggleBookmark(p, redraw); },
            )
          : h('div.study-detail__empty', 'No moves.'),
        renderGlyphToolbar(redraw),
        renderCommentPanel(redraw),
        renderPracticeLinesPanel(id, redraw),
      ]),
    ]),
  ]);
}
