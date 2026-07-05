




import { h, type VNode } from 'snabbdom';
import type { Color } from 'chessops/types';
import { renderToggleRow } from '../ui';
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
  practiceStrengthConfig,
  practiceStrengthLevel,
  setPracticeStrengthLevel,
  startPractice,
  stopPractice,
} from './practice/practiceCtrl';

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
        attrs: { 'data-icon': ICON_BOOK, title: 'Opening explorer', 'aria-label': 'Opening explorer' },
        on:    { click: nav.onBook },
      })
    : null;

  // Right zone: hamburger from override when provided, otherwise analysis hamburger.
  const rightZone: VNode = nav?.menuHidden
    ? h('div.move-nav-bar__right')
    : (nav?.menuTitle !== undefined && nav?.onMenu !== undefined)
    ? h('div.move-nav-bar__right', [h('button.fbt', {
        class: { active: !!nav.menuOpen },
        attrs: { 'data-icon': ICON_HAMBURGER, title: nav.menuTitle, 'aria-label': nav.menuTitle },
        on:    { click: nav.onMenu },
      })])
    : h('div.move-nav-bar__right', [
        h('button.fbt', {
          class: { active: _actionMenuOpen },
          attrs: { 'data-icon': ICON_HAMBURGER, title: 'Analysis menu', 'aria-label': 'Analysis menu' },
          on:    { click: () => { toggleActionMenu(); deps?.redraw(); } },
        }),
      ]);

  return h('div.move-nav-bar', [
    h('div.move-nav-bar__left', leftNodes.filter((n): n is VNode => n !== null)),
    ...(explorerBtn ? [explorerBtn] : []),
    h('div.move-nav-bar__middle', [
      h('div.jumps', [
        h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_FIRST, disabled: !canPrev, title: 'First move', 'aria-label': 'First move' },
          on:    { click: first },
        }),
        h('button.fbt', {
          attrs: { 'data-icon': ICON_PREV, disabled: !canPrev, title: 'Previous move', 'aria-label': 'Previous move' },
          on:    { click: prev },
        }),
        h('button.fbt', {
          attrs: { 'data-icon': ICON_NEXT, disabled: !canNext, title: 'Next move', 'aria-label': 'Next move' },
          on:    { click: next },
        }),
        h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_LAST, disabled: !canNext, title: 'Last move', 'aria-label': 'Last move' },
          on:    { click: last },
        }),
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



  const canCompareWithLichess = !!deps.hasCompletedReviewForSelectedGame?.();


  if (_actionMenuSubView === 'mistake-detection') {
    return h('div.action-menu', [
      h('button.action-menu__back-btn', {
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
        on: { click: () => { closeLichessCompareFlow(); _actionMenuSubView = null; deps.redraw(); } },
      }, '\u2190 Back'),
      h('h2', 'Compare with Lichess analysis'),
      h('div.action-menu__subpanel', [renderLichessComparePanel()]),
    ]);
  }

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: { title: 'Close menu', 'aria-label': 'Close menu' },
      on:    { click: close },
    }, '×'),

    // Tools section — mirrors lichess-org/lila: actionMenu.ts Tools group
    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      h('button', {
        attrs: { title: 'Open a fresh standard analysis board' },
        on:    { click: () => { deps.onNewBoard(); close(); } },
      }, 'New Board'),


      h('button', {
        attrs: { title: 'Save this game to Study Library' },
        on:    { click: () => { deps.onSaveToLibrary(); close(); } },
      }, 'Save game to Library'),

      // Flip board — mirrors lichess-org/lila: actionMenu.ts ctrl.flip() action
      h('button', {
        attrs: { 'data-icon': ICON_FLIP, title: 'Flip board (hotkey: f)' },
        on:    { click: () => { deps.onFlipBoard(); close(); } },
      }, 'Flip board'),

      // Board Editor — mirrors lichess-org/lila: actionMenu.ts Board editor link
      // (`?fen=&color=`), seeded with the current node's position and orientation.
      h('button', {
        attrs: { title: 'Open this position in the Board Editor' },
        on: { click: () => {
          const fen = deps.getCtrl().node.fen;
          const boardOrientation = deps.getOrientation?.() ?? 'white';
          writeHashRoute(editorRouteFromPosition(fen, boardOrientation));
          close();
        } },
      }, 'Board Editor'),

      h('button', {
        attrs: { title: 'Report an issue with the Analysis page' },
        on:    { click: () => {
          const session = reportIssue({ triggeredBy: 'analysis-route', route: '/analysis' });
          console.info('[diagnostics] report issue session', session);
          close();
        } },
      }, 'Report issue'),


      ...(canCompareWithLichess ? [h('button', {
        attrs: { title: 'Compare this Game Review against Lichess server analysis' },
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
      h('button', {
        class:  { active: hasRetro },
        attrs:  {
          'data-icon': ICON_RETRO,
          title: canLFYM
            ? (hasRetro ? 'Exit mistakes review' : 'Review your mistakes')
            : 'Analyze the game first',
          disabled: !canLFYM,
        },
        on: { click: () => { if (canLFYM) { deps.onToggleRetro(); close(); } } },
      }, hasRetro ? 'Close Mistakes' : 'Learn From Your Mistakes'),


      h('button', {
        attrs: { title: 'Configure mistake detection thresholds' },
        on: { click: () => { _actionMenuSubView = 'mistake-detection'; deps.redraw(); } },
      }, 'Mistake Detection'),
    ]),




    h('h2', 'Practice vs. Computer'),
    h('div.action-menu__tools', [
      h('button', {
        class: { active: practiceActive() },
        attrs: {
          'data-icon': ICON_PRACTICE,
          title: practiceActive()
            ? 'Stop playing against the computer'
            : 'Play this position against the computer',
        },
        on: { click: () => {
          if (deps.onTogglePractice) deps.onTogglePractice();
          else if (practiceActive()) stopPractice();
          else startPractice();
          close();
        } },
      }, practiceActive() ? 'Stop practice' : 'Practice vs. Computer'),
      h('button', {
        attrs: { title: 'Choose the computer opponent strength' },
        on: { click: () => { _actionMenuSubView = 'practice'; deps.redraw(); } },
      }, `Strength: ${practiceStrengthConfig().label}`),
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
          attrs: { type: 'range', min: 6, max: 18, step: 1, value: arrowLabelSize },
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
