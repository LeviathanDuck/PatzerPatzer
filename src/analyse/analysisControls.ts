




import { h, type VNode } from 'snabbdom';
import type { Color } from 'chessops/types';
import { renderToggleRow } from '../ui';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';
import { writeHashRoute } from '../router';
import type { AnalyseCtrl } from './ctrl';
import type { RetroChoiceCountSummary } from './retroChoice';
import { renderRetroConfigBody } from '../header/index';
import {
  showBoardReviewGlyphs, setShowBoardReviewGlyphs,
  showReviewLabels, setShowReviewLabels,
  showEngineArrows, setShowEngineArrows,
  arrowAllLines, setArrowAllLines,
  showPlayedArrow, setShowPlayedArrow,
  showArrowLabels, setShowArrowLabels,
  arrowLabelSize, setArrowLabelSize,
  syncArrow,
} from '../engine/ctrl';
import { reviewDotsUserOnly, setReviewDotsUserOnly } from '../board/cosmetics';
import { analysisComplete } from '../engine/reviewStatus';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import {
  openLichessCompareFlow,
  closeLichessCompareFlow,
  renderLichessComparePanel,
} from './lichessCompareUi';
import { renderStrengthSelector } from '../engine/strengthView';
import {
  practiceActive,
  practiceStrengthLevel,
  setPracticeStrengthLevel,
  startPractice,
  stopPractice,
} from './practice/practiceCtrl';
import { requestSelectedGameAnalysis } from './pgnExport';
import {
  unmountWorkspace,
  type WorkspaceCursor,
  type WorkspaceInstance,
} from './workspaceCore';
import { mountStudyPracticeWorkspace } from '../study/practice/workspaceModule';
import { renderPracticePanel, type PracticePanelProps, type PracticePanelTab, type PanelDrillsSection, type ProgressTabData, type ProgressLessonOption } from '../study/practice/practiceView';
import { engineDrillActive, engineDrillFinished, engineDrillPanelVnode, openDrillRecordOnBoard } from '../study/practice/engineDrillHost';
import { openDrillCatalog } from '../study/practice/drillCatalogView';
import { listRecentEngineDrills } from '../study/studyDb';
import { loadGlobalPracticePanelData, listRecentProgressLessons, loadLessonProgress, type StudyPracticePanelData } from '../study/practice/practicePanelData';
import { launchDueReview, resumeDueReview } from '../study/practice/dueReviewLaunch';
import { isDrillActive, renderDrillView } from '../study/practice/drillView';
import { launchGuidedLearn } from '../study/libraryView';
import type { LearnTabData } from '../study/practice/practiceView';
import type { EngineDrillRecord } from '../study/types';
import type { TreeNode } from '../tree/types';

// --- Action-menu open/close state ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts actionMenu() reactive field.

let _actionMenuOpen = false;
let _actionMenuSubView: null | 'mistake-detection' | 'lichess-compare' | 'practice' = null;

export function isActionMenuOpen(): boolean {
  return _actionMenuOpen;
}

export function toggleActionMenu(): void {
  _actionMenuOpen = !_actionMenuOpen;
}

export function closeActionMenu(): void {


  if (_actionMenuSubView === 'lichess-compare') closeLichessCompareFlow();
  _actionMenuOpen = false;
  _actionMenuSubView = null;
}

// --- Injected deps ---

interface AnalysisControlsDeps {
  getCtrl:          () => AnalyseCtrl;
  prev:             () => void;
  next:             () => void;
  first:            () => void;
  last:             () => void;
  navigate:         (path: string) => void;
  redraw:           () => void;

  onFlipBoard:      () => void;
  onNewBoard:       () => void;
  onToggleRetro:    () => void;

  onSaveToLibrary:  () => void;
  // LFYM settings count preview for the current analysis game.
  getRetroConfigCountSummary?: () => RetroChoiceCountSummary | null;


  getSelectedGameForCompare?: () => { gameId: string; pgn: string } | null;


  hasCompletedReviewForSelectedGame?: () => boolean;


  onTogglePractice?: () => void;

  getOrientation?: () => Color;




  onToggleQuestionnaire?: () => void;
}




function editorRouteFromPosition(fen: string, orientation: Color): string {
  const params = new URLSearchParams();
  params.set('fen', fen);
  if (orientation === 'black') params.set('color', 'black');
  return `#/editor?${params.toString()}`;
}

let _deps: AnalysisControlsDeps | null = null;

export function initAnalysisControls(deps: AnalysisControlsDeps): void {
  _deps = deps;
}



















interface AnalysisPracticeSlotDeps {
  /** Live Analysis cursor read — the SAME AnalyseCtrl session Analysis's own mount reads. */
  getCursor: () => WorkspaceCursor;
  /** Live Analysis orientation read — the shared board orientation (no duplicate snapshot). */
  getOrientation: () => Color;
  /** Analysis shell redraw. */
  redraw: () => void;
  /** Analysis shared-tree navigation (existing-child follow) the module's placeholder dispatch uses. */
  navigate: (path: string) => void;
  /** Analysis's own add-and-navigate tree commit for board-created nodes. */
  handleUserMove: (parentPath: string, node: TreeNode) => void;
  /**
   * Re-mount the module-less `analysis/free-analysis` fallback (main.ts's mountAnalysisWorkspace).
   * Injected so this coordinator holds NO knowledge of how the fallback is built — main.ts owns that
   * mechanics, keeping feature policy out of the bootstrap.
   */
  remountFreeAnalysis: () => void;
}

let _practiceSlotDeps: AnalysisPracticeSlotDeps | null = null;

// The single Practice WorkspaceInstance this coordinator most recently mounted, or null when Analysis
// is in its normal module-less state. Retained so deactivation guard-closes EXACTLY that instance and
// can never tear down a newer (e.g. Study excursion) workspace.
let _practiceSlotInstance: WorkspaceInstance | null = null;

export function initAnalysisPracticeSlot(deps: AnalysisPracticeSlotDeps): void {
  _practiceSlotDeps = deps;
}

/** Whether the Analysis slot is currently hosting the shared study-practice module. */
export function isAnalysisPracticeSlotActive(): boolean {
  return _practiceSlotInstance !== null;
}








let _analysisPracticeTab: PracticePanelTab = 'review';


let _analysisPanelDrills: EngineDrillRecord[] | null = null;
let _analysisPanelDrillsLoading = false;

function analysisPanelDrillsSection(redraw: () => void): PanelDrillsSection {
  if (_analysisPanelDrills === null && !_analysisPanelDrillsLoading) {
    _analysisPanelDrillsLoading = true;
    listRecentEngineDrills(5).then(records => {
      _analysisPanelDrills = records;
      _analysisPanelDrillsLoading = false;
      redraw();
    }).catch(() => { _analysisPanelDrills = []; _analysisPanelDrillsLoading = false; redraw(); });
  }
  return {
    recent: (_analysisPanelDrills ?? []).map(r => ({
      label: `${r.snapshot.learnerIsWhite ? 'White' : 'Black'} · ${r.snapshot.goals.map(g => g.kind).join(', ') || 'open-ended'} · ${r.outcome ?? r.completionState}`,
      sublabel: `${r.snapshot.moves.length} moves`,
      resumable: r.completionState === 'partial',
      onOpen: () => { openDrillRecordOnBoard(r); },
    })),
    onOpenCatalog: () => {
      // The catalog takeover renders on the library surface.
      openDrillCatalog({ kind: 'global' }, redraw);
      writeHashRoute('#/study');
      redraw();
    },
  };
}



let _analysisPanelData: StudyPracticePanelData | null = null;
let _analysisPanelLoading = false;
let _analysisPanelGeneration = 0;


let _analysisProgressLessons: readonly ProgressLessonOption[] | null = null;
let _analysisProgressLesson: string | null = null;
let _analysisProgressData: ProgressTabData | null = null;

function refreshAnalysisPanelData(redraw: () => void): void {
  if (_analysisPanelLoading) return;
  _analysisPanelLoading = true;
  const generation = ++_analysisPanelGeneration;
  void loadGlobalPracticePanelData().then(data => {
    if (generation !== _analysisPanelGeneration) return;
    _analysisPanelData = data;
    _analysisPanelLoading = false;
    redraw();
  }).catch(e => {
    if (generation !== _analysisPanelGeneration) return;
    _analysisPanelLoading = false;
    console.warn('[analysisControls] practice panel feed failed', e);
    redraw();
  });
  void listRecentProgressLessons().then(lessons => {
    if (generation !== _analysisPanelGeneration) return;
    _analysisProgressLessons = lessons;
    redraw();
  }).catch(() => {
    if (generation !== _analysisPanelGeneration) return;
    _analysisProgressLessons = [];
    redraw();
  });
}

function selectAnalysisProgressLesson(lessonId: string | null, redraw: () => void): void {
  _analysisProgressLesson = lessonId;
  _analysisProgressData = lessonId === null ? null : { status: 'loading' };
  if (lessonId === null) { redraw(); return; }
  const generation = _analysisPanelGeneration;
  void loadLessonProgress(lessonId).then(data => {
    if (generation !== _analysisPanelGeneration || _analysisProgressLesson !== lessonId) return;
    _analysisProgressData = data;
    redraw();
  });
  redraw();
}

function analysisProgressTabData(redraw: () => void): ProgressTabData {
  if (_analysisProgressLesson !== null) {
    const loaded = _analysisProgressData ?? { status: 'loading' };
    if (loaded.status === 'ready') {
      return { ...loaded, onBack: () => { selectAnalysisProgressLesson(null, redraw); } };
    }
    return loaded;
  }
  if (_analysisProgressLessons === null) return { status: 'loading' };
  return {
    status: 'picker',
    lessons: _analysisProgressLessons,
    onSelect: (lessonId) => { selectAnalysisProgressLesson(lessonId, redraw); },
  };
}

/** Render the Analysis Practice panel, or null while the practice slot is not active. */
export function renderAnalysisPracticePanel(redraw: () => void): VNode | null {
  if (!isAnalysisPracticeSlotActive()) return null;
  if (_analysisPanelData === null && !_analysisPanelLoading) refreshAnalysisPanelData(redraw);
  const data = _analysisPanelData;
  const onSessionEnd = (): void => { _analysisPanelData = null; refreshAnalysisPanelData(redraw); };
  let review: PracticePanelProps['review'];
  if (data === null) {
    review = { status: 'loading' };
  } else if (data.review.status === 'ready') {
    const resumableId = data.resumableSessionId;
    review = {
      ...data.review,
      ...(resumableId !== undefined
        ? { onResume: () => { void resumeDueReview(resumableId, {}, redraw, { onSessionEnd }); } }
        : { onStart: () => { void launchDueReview({}, redraw, { onSessionEnd }); } }),
    };
  } else {
    review = data.review;
  }


  let learn: LearnTabData;
  if (isDrillActive()) {
    learn = { status: 'active', body: renderDrillView(redraw) };
  } else if (engineDrillActive() || engineDrillFinished()) {


    learn = { status: 'error', message: 'Finish or close the engine drill first — Learn opens when the board is free.' };
  } else if (data === null) {
    learn = { status: 'loading' };
  } else if (data.learn === undefined) {
    learn = { status: 'error', message: 'Could not load your learnable lines.' };
  } else {
    learn = {
      status: 'ready',
      entries: data.learn.map(entry => ({
        id: entry.id,
        label: entry.label,
        onStart: () => { void launchGuidedLearn([entry.sequence], 0, redraw); },
      })),
    };
  }
  const props: PracticePanelProps = {
    activeTab: _analysisPracticeTab,
    onSelectTab: (tab: PracticePanelTab) => { _analysisPracticeTab = tab; redraw(); },
    learn,
    review,
    practice: { status: 'empty' },
    progress: analysisProgressTabData(redraw),
    drills: analysisPanelDrillsSection(redraw),
  };
  return h('div.analyse__practice-panel', [
    renderPracticePanel(props),




    _analysisPracticeTab === 'practice' || engineDrillActive() || engineDrillFinished()
      ? engineDrillPanelVnode()
      : null,
  ]);
}

/**
 * Activate the in-place Practice takeover: mount the shared `study-practice` module (a FRESH instance
 * via the host-neutral factory) into the single Analysis workspace slot as `practice-grading`. No-op
 * if the coordinator is not initialized or Practice is already active. Synchronous/bounded (P0).
 *
 * Fail-closed is provided by the core: mountWorkspace validates mode BEFORE allocating/mutating the
 * slot, so a rejected Practice mount leaves the current free-analysis workspace alive.
 */
export function activateAnalysisPracticeSlot(): void {
  const deps = _practiceSlotDeps;
  if (!deps || _practiceSlotInstance) return;
  _practiceSlotInstance = mountStudyPracticeWorkspace({
    hostId: 'analysis',
    getCursor: deps.getCursor,
    getOrientation: deps.getOrientation,
    redraw: deps.redraw,
    navigate: deps.navigate,
    handleUserMove: deps.handleUserMove,
  });
}

/**
 * Deactivate the Practice takeover with the guarded stale-owner rule: unmount EXACTLY the instance
 * this coordinator mounted, then remount the module-less `analysis/free-analysis` fallback ONLY when
 * that unmount returned `true` (i.e. the Practice instance was still the active workspace). When it
 * returns `false` the instance was already superseded by a newer workspace (e.g. a Study excursion),
 * so restoring the fallback would clobber it — do NOT. No-op when Practice is not active.
 */
export function deactivateAnalysisPracticeSlot(reason: string): void {
  const instance = _practiceSlotInstance;
  if (!instance) return;
  _practiceSlotInstance = null;
  const wasActive = unmountWorkspace(instance, reason);
  if (wasActive) _practiceSlotDeps?.remountFreeAnalysis();
}

// --- Render helpers ---

// Icon codepoints for first/prev/next/last, hamburger, and explorer.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_JUMP_FIRST = '\ue035'; // licon.JumpFirst
const ICON_PREV       = '\ue027'; // licon.LessThan
const ICON_NEXT       = '\ue026'; // licon.GreaterThan
const ICON_JUMP_LAST  = '\ue034'; // licon.JumpLast
const ICON_HAMBURGER  = '\ue039'; // licon.Hamburger
const ICON_BOOK       = '\ue03b'; // licon.Book — opening explorer













export interface MoveNavOverride {
  canPrev?:     boolean;
  canNext?:     boolean;
  first?:       () => void;
  prev?:        () => void;
  next?:        () => void;
  last?:        () => void;
  bookActive?:  boolean;
  onBook?:      () => void;
  menuTitle?:   string;
  menuOpen?:    boolean;
  onMenu?:      () => void;
  menuHidden?:  boolean;
}

export function renderMoveNavBar(leftNodes: Array<VNode | null>, nav?: MoveNavOverride): VNode {
  // Navigation fields: use override when provided, fall back to analysis deps.
  // _deps may be null in non-analysis contexts (puzzle, openings) — only access when needed.
  const deps = _deps;
  const ctrl = deps?.getCtrl();
  const canPrev = nav?.canPrev ?? (ctrl ? ctrl.path !== '' : false);
  const canNext = nav?.canNext ?? (ctrl ? !!ctrl.node.children[0] : false);
  const first   = nav?.first   ?? deps?.first   ?? (() => {});
  const prev    = nav?.prev    ?? deps?.prev    ?? (() => {});
  const next    = nav?.next    ?? deps?.next    ?? (() => {});
  const last    = nav?.last    ?? deps?.last    ?? (() => {});

  // Book button — single construction path for all contexts.
  // Present only when onBook is supplied; omitting it hides the button (analysis retro-mode gate).
  // Mirrors lichess-org/lila: ui/analyse/src/view/controls.ts opening-explorer action
  const explorerBtn: VNode | null = nav?.onBook !== undefined
    ? h('button.fbt', {
        class: { active: !!nav.bookActive },
        attrs: { 'data-icon': ICON_BOOK, ...iconControlExplainerAttrs({
          label: 'Opening explorer',
          description: `${nav.bookActive ? 'Close' : 'Open'} moves from the opening database for this position.`,
        }) },
        on:    { click: nav.onBook },
      })
    : null;

  // Right zone: hamburger from override when provided, otherwise analysis hamburger.
  const rightZone: VNode = nav?.menuHidden
    ? h('div.move-nav-bar__right')
    : (nav?.menuTitle !== undefined && nav?.onMenu !== undefined)
    ? h('div.move-nav-bar__right', [h('button.fbt', {
        class: { active: !!nav.menuOpen },
        attrs: { 'data-icon': ICON_HAMBURGER, ...iconControlExplainerAttrs({
          label: `${nav.menuOpen ? 'Close' : 'Open'} ${nav.menuTitle}`,
          description: `${nav.menuOpen ? 'Close' : 'Open'} ${nav.menuTitle.toLowerCase()}.`,
        }) },
        on:    { click: nav.onMenu },
      })])
    : h('div.move-nav-bar__right', [
        h('button.fbt', {
          class: { active: _actionMenuOpen },
          attrs: { 'data-icon': ICON_HAMBURGER, ...iconControlExplainerAttrs({
            label: _actionMenuOpen ? 'Close Analysis menu' : 'Open Analysis menu',
            description: `${_actionMenuOpen ? 'Close' : 'Open'} the Analysis tools menu.`,
          }) },
          on:    { click: () => { toggleActionMenu(); deps?.redraw(); } },
        }),
      ]);

  return h('div.move-nav-bar', [
    h('div.move-nav-bar__left', leftNodes.filter((n): n is VNode => n !== null)),
    ...(explorerBtn ? [explorerBtn] : []),
    h('div.move-nav-bar__middle', [
      h('div.jumps', [
        canPrev ? h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_FIRST, ...iconControlExplainerAttrs({
            label: 'First move',
            description: 'Jump to the starting position.',
          }) },
          on:    { click: first },
        }) : renderDisabledControlExplainer({
          label: 'First move',
          description: 'Already at the starting position.',
        }, h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_FIRST, disabled: true, ...iconControlExplainerAttrs({
            label: 'First move', description: 'Already at the starting position.',
          }) },
          on: { click: first },
        })),
        canPrev ? h('button.fbt', {
          attrs: { 'data-icon': ICON_PREV, ...iconControlExplainerAttrs({
            label: 'Previous move',
            description: 'Step back one move.',
          }) },
          on:    { click: prev },
        }) : renderDisabledControlExplainer({
          label: 'Previous move',
          description: 'There is no previous move.',
        }, h('button.fbt', {
          attrs: { 'data-icon': ICON_PREV, disabled: true, ...iconControlExplainerAttrs({
            label: 'Previous move', description: 'There is no previous move.',
          }) },
          on: { click: prev },
        })),
        canNext ? h('button.fbt', {
          attrs: { 'data-icon': ICON_NEXT, ...iconControlExplainerAttrs({
            label: 'Next move',
            description: 'Step forward one move.',
          }) },
          on:    { click: next },
        }) : renderDisabledControlExplainer({
          label: 'Next move',
          description: 'There is no next move.',
        }, h('button.fbt', {
          attrs: { 'data-icon': ICON_NEXT, disabled: true, ...iconControlExplainerAttrs({
            label: 'Next move', description: 'There is no next move.',
          }) },
          on: { click: next },
        })),
        canNext ? h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_LAST, ...iconControlExplainerAttrs({
            label: 'Last move',
            description: 'Jump to the end of this line.',
          }) },
          on:    { click: last },
        }) : renderDisabledControlExplainer({
          label: 'Last move',
          description: 'Already at the end of this line.',
        }, h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_LAST, disabled: true, ...iconControlExplainerAttrs({
            label: 'Last move', description: 'Already at the end of this line.',
          }) },
          on: { click: last },
        })),
      ]),
    ]),
    rightZone,
  ]);
}









// Icon codepoints for action-menu items.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_FLIP   = '\ue020'; // licon.ChasingArrows — flip board
const ICON_RETRO  = '\ue05c'; // licon.Bullseye       — learn from your mistakes
const ICON_PRACTICE = '\ue05c'; // licon.Bullseye — practice with computer (same icon as lila)








export function renderActionMenu(): VNode | null {
  if (!_actionMenuOpen) return null;
  const deps     = _deps!;
  const ctrl     = deps.getCtrl();
  const close    = () => { closeActionMenu(); deps.redraw(); };
  const hasRetro = !!ctrl.retro || !!ctrl.retroChoice;
  const canLFYM  = analysisComplete;


  const canQuestionnaire = analysisComplete;



  const canCompareWithLichess = !!deps.hasCompletedReviewForSelectedGame?.();


  if (_actionMenuSubView === 'mistake-detection') {
    return h('div.action-menu', [
      h('button.action-menu__back-btn', {
        attrs: controlExplainerAttrs({ label: 'Back to Analysis menu' }),
        on: { click: () => { _actionMenuSubView = null; deps.redraw(); } },
      }, '\u2190 Back'),
      h('h2', 'Mistake Detection'),
      h('div.action-menu__subpanel', renderRetroConfigBody(deps.redraw, {
        countSummary: deps.getRetroConfigCountSummary?.() ?? null,
        idPrefix: 'analysis-retro-config',
      })),
    ]);
  }




  if (_actionMenuSubView === 'practice') {
    return h('div.action-menu', [
      h('button.action-menu__back-btn', {
        attrs: controlExplainerAttrs({ label: 'Back to Analysis menu' }),
        on: { click: () => { _actionMenuSubView = null; deps.redraw(); } },
      }, '← Back'),
      h('h2', 'Practice vs. Computer'),
      h('div.action-menu__subpanel', [
        renderStrengthSelector(practiceStrengthLevel(), (level) => {
          setPracticeStrengthLevel(level);
          deps.redraw();
        }),
      ]),
    ]);
  }


  if (_actionMenuSubView === 'lichess-compare') {
    return h('div.action-menu', [
      h('button.action-menu__back-btn', {
        attrs: controlExplainerAttrs({ label: 'Back to Analysis menu' }),
        on: { click: () => { closeLichessCompareFlow(); _actionMenuSubView = null; deps.redraw(); } },
      }, '\u2190 Back'),
      h('h2', 'Compare with Lichess analysis'),
      h('div.action-menu__subpanel', [renderLichessComparePanel()]),
    ]);
  }

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: iconControlExplainerAttrs({ label: 'Close Analysis menu' }),
      on:    { click: close },
    }, '×'),

    // Tools section — mirrors lichess-org/lila: actionMenu.ts Tools group
    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      h('button', {
        attrs: controlExplainerAttrs({
          label: 'New Board',
          description: 'Open a fresh standard position on the Analysis Board.',
        }),
        on:    { click: () => { deps.onNewBoard(); close(); } },
      }, 'New Board'),

      ...(analysisComplete ? [h('button', {
        attrs: controlExplainerAttrs({
          label: 'Re-Analyze game',
          description: 'Run Stockfish again and replace this game’s stored analysis.',
        }),
        on: { click: () => {
          requestSelectedGameAnalysis();
          close();
        } },
      }, 'Re-analyze')] : []),


      h('button', {
        attrs: controlExplainerAttrs({
          label: 'Save game to Library',
          description: 'Save this game to the Study Library.',
        }),
        on:    { click: () => { deps.onSaveToLibrary(); close(); } },
      }, 'Save game to Library'),

      // Flip board — mirrors lichess-org/lila: actionMenu.ts ctrl.flip() action
      h('button', {
        attrs: { 'data-icon': ICON_FLIP, ...controlExplainerAttrs({
          label: 'Flip board',
          description: 'Reverse the board orientation; keyboard shortcut: F.',
        }) },
        on:    { click: () => { deps.onFlipBoard(); close(); } },
      }, 'Flip board'),

      // Board Editor — mirrors lichess-org/lila: actionMenu.ts Board editor link
      // (`?fen=&color=`), seeded with the current node's position and orientation.
      //
      // Uses closeActionMenu() directly instead of the shared close() helper (BUG-2026-07-05-015):
      // close() also calls deps.redraw(), which schedules an immediate rAF-based re-render of the
      // CURRENT (analysis) route. That re-render can win the race against the async native
      // `hashchange` event that writeHashRoute() below is about to fire and land first, rendering
      // the #/editor route and constructing+mounting a real EditorCtrl/Chessground BEFORE
      // main.ts's router onChange handler (which unconditionally drops the module-level
      // `editorCtrl` on every real navigation) runs its own patch. That handler then builds a
      // SECOND EditorCtrl from scratch, but Snabbdom's keyless positional diff sees a
      // structurally-identical vnode tree and reuses the already-mounted `div.cg-wrap` DOM node
      // without re-running its `insert` hook (no `update` hook exists to resync it either) — so
      // the second (now "live") EditorCtrl's `chessground` field is left permanently undefined
      // while every editor button/input gets rebound to it. Clear/Flip/etc. then silently no-op:
      // EditorCtrl.setFen() skips `chessground.set()` and EditorCtrl.getBoard() falls back to the
      // stale seeded FEN forever. Dropping the redundant redraw() here removes the race: the
      // upcoming route change's own re-render (triggered by the hashchange handler) is the only
      // render that constructs an EditorCtrl, so exactly one gets created and its Chessground
      // mounts normally, matching a direct/bare `#/editor` visit.
      h('button', {
        attrs: controlExplainerAttrs({
          label: 'Board Editor',
          description: 'Open the current position and orientation in the Board Editor.',
        }),
        on: { click: () => {
          const fen = deps.getCtrl().node.fen;
          const boardOrientation = deps.getOrientation?.() ?? 'white';
          writeHashRoute(editorRouteFromPosition(fen, boardOrientation));
          closeActionMenu();
        } },
      }, 'Board Editor'),

      h('button', {
        attrs: controlExplainerAttrs({
          label: 'Report issue',
          description: 'Create a diagnostics report for the Analysis page.',
        }),
        on:    { click: () => {
          const session = reportIssue({ triggeredBy: 'analysis-route', route: '/analysis' });
          console.info('[diagnostics] report issue session', session);
          close();
        } },
      }, 'Report issue'),


      ...(canCompareWithLichess ? [h('button', {
        attrs: controlExplainerAttrs({
          label: 'Compare with Lichess analysis',
          description: 'Compare this stored analysis with Lichess server analysis.',
        }),
        on: { click: () => {
          const selection = deps.getSelectedGameForCompare?.() ?? null;
          if (!selection) return;
          openLichessCompareFlow({ gameId: selection.gameId, pgn: selection.pgn, redraw: deps.redraw });
          _actionMenuSubView = 'lichess-compare';
          deps.redraw();
        } },
      }, 'Compare with Lichess analysis')] : []),
    ]),


    h('h2', 'Mistakes'),
    h('div.action-menu__tools', [
      // Learn From Your Mistakes — mirrors lichess-org/lila: actionMenu.ts canRetro → toggleRetro()
      // LFYM brand (approved redesign 2026-07-05): the ?! badge replaces the bullseye glyph.
      canLFYM ? h('button', {
        class:  { active: hasRetro },
        attrs:  {
          ...controlExplainerAttrs({
            label: hasRetro ? 'Close Learn From Your Mistakes' : 'Learn From Your Mistakes',
            description: hasRetro ? 'Exit the current mistakes review.' : 'Practice the learning moments found in this game.',
          }),
        },
        on: { click: () => { if (canLFYM) { deps.onToggleRetro(); close(); } } },
      }, [
        h('span.lfym-badge', { class: { 'lfym-badge--inverted': hasRetro } }, '?!'),
        hasRetro ? ' Close Mistakes' : ' Learn From Your Mistakes',
      ]) : renderDisabledControlExplainer({
        label: 'Learn From Your Mistakes',
        description: 'Analyze the game before reviewing its mistakes.',
      }, h('button', {
        attrs: { disabled: true, ...controlExplainerAttrs({
          label: 'Learn From Your Mistakes',
          description: 'Analyze the game before reviewing its mistakes.',
        }) },
        on: { click: () => { if (canLFYM) { deps.onToggleRetro(); close(); } } },
      }, [
        h('span.lfym-badge', '?!'),
        ' Learn From Your Mistakes',
      ])),







      ...(deps.onToggleQuestionnaire ? [canQuestionnaire ? h('button', {
        attrs: {
          ...controlExplainerAttrs({
            label: 'Post Game Review Questions',
            description: 'Open the manual post-game reflection questionnaire.',
          }),
        },
        on: { click: () => { if (canQuestionnaire) { deps.onToggleQuestionnaire!(); close(); } } },
      }, [
        h('span.qnr-pulse.qnr-pulse--unsatisfied'),
        ' Post Game Review Questions',
      ]) : renderDisabledControlExplainer({
        label: 'Post Game Review Questions',
        description: 'Analyze the game before completing the review questions.',
      }, h('button', {
        attrs: { disabled: true, ...controlExplainerAttrs({
          label: 'Post Game Review Questions',
          description: 'Analyze the game before completing the review questions.',
        }) },
        on: { click: () => { if (canQuestionnaire) { deps.onToggleQuestionnaire!(); close(); } } },
      }, [
        h('span.qnr-pulse.qnr-pulse--unsatisfied'),
        ' Post Game Review Questions',
      ]))] : []),


      h('button', {
        attrs: controlExplainerAttrs({
          label: 'Mistake Detection',
          description: 'Configure which mistakes become Learn From Your Mistakes moments.',
        }),
        on: { click: () => { _actionMenuSubView = 'mistake-detection'; deps.redraw(); } },
      }, 'Mistake Detection'),
    ]),




    h('h2', 'Practice vs. Computer'),
    h('div.action-menu__tools', [
      h('button', {
        class: { active: practiceActive() },
        attrs: {
          'data-icon': ICON_PRACTICE,
          ...controlExplainerAttrs({
            label: practiceActive() ? 'Stop practice' : 'Practice vs. Computer',
            description: practiceActive()
              ? 'Stop playing the current position against the computer.'
              : 'Play the current position against the computer.',
          }),
        },
        on: { click: () => {
          if (deps.onTogglePractice) deps.onTogglePractice();
          else if (practiceActive()) stopPractice();
          else startPractice();
          close();
        } },
      }, practiceActive() ? 'Stop practice' : 'Practice vs. Computer'),
      h('button', {
        attrs: controlExplainerAttrs({
          label: `Computer strength level ${practiceStrengthLevel()}`,
          description: 'Choose the computer opponent strength for practice.',
        }),
        on: { click: () => { _actionMenuSubView = 'practice'; deps.redraw(); } },
      }, `Strength: Level ${practiceStrengthLevel()}`),
    ]),





    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow('am-board-glyphs', 'Move markers on board', showBoardReviewGlyphs, (v) => { setShowBoardReviewGlyphs(v); syncArrow(); deps.redraw(); }),
      renderToggleRow('am-move-labels', 'Move labels', showReviewLabels, (v) => { setShowReviewLabels(v); deps.redraw(); }),


      renderToggleRow('am-review-dots', 'Review dots: my moves only', reviewDotsUserOnly, (v) => { setReviewDotsUserOnly(v); deps.redraw(); }),


      renderToggleRow('am-engine-arrows', 'Engine arrows', showEngineArrows, (v) => { setShowEngineArrows(v); syncArrow(); deps.redraw(); }),
      renderToggleRow('am-all-lines', 'All lines', arrowAllLines, (v) => { setArrowAllLines(v); syncArrow(); deps.redraw(); }),
      renderToggleRow('am-played-arrow', 'Played move arrow', showPlayedArrow, (v) => { setShowPlayedArrow(v); syncArrow(); deps.redraw(); }),
      renderToggleRow('am-arrow-labels', 'Arrow labels', showArrowLabels, (v) => { setShowArrowLabels(v); syncArrow(); deps.redraw(); }),
      h('div.action-menu__slider-row', [
        h('label', { attrs: { for: 'action-menu-label-size' } }, 'Label size'),
        h('input#action-menu-label-size', {
          attrs: { type: 'range', min: 6, max: 18, step: 1, value: arrowLabelSize, ...controlExplainerAttrs({
            label: 'Arrow label size',
            description: 'Set the text size used on engine-arrow labels.',
          }) },
          on:    { input: (e: Event) => {
            setArrowLabelSize(parseInt((e.target as HTMLInputElement).value));
            syncArrow();
            deps.redraw();
          }},
        }),
        h('span.action-menu__val', `${arrowLabelSize}px`),
      ]),
    ]),
  ]);
}
