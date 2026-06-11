




import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
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
import { analysisComplete, batchAnalyzing } from '../engine/batch';

// --- Action-menu open/close state ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts actionMenu() reactive field.

let _actionMenuOpen = false;
let _actionMenuSubView: null | 'mistake-detection' = null;

export function isActionMenuOpen(): boolean {
  return _actionMenuOpen;
}

export function toggleActionMenu(): void {
  _actionMenuOpen = !_actionMenuOpen;
}

export function closeActionMenu(): void {
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
  onToggleRetro:    () => void;

  onToggleExplorer: () => void;
  explorerEnabled:  () => boolean;

  onSaveToLibrary:  () => void;
  // LFYM settings count preview for the current analysis game.
  getRetroConfigCountSummary?: () => RetroChoiceCountSummary | null;
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









export function renderExplorerEntry(): VNode | null {
  const deps    = _deps!;
  const ctrl    = deps.getCtrl();
  if (ctrl.retro) return null;
  const active  = deps.explorerEnabled();
  return h('button.fbt', {
    class: { active },
    attrs: { 'data-icon': ICON_BOOK, title: 'Opening explorer' },
    on:    { click: () => { deps.onToggleExplorer(); deps.redraw(); } },
  });
}









export interface MoveNavOverride {
  canPrev:      boolean;
  canNext:      boolean;
  first:        () => void;
  prev:         () => void;
  next:         () => void;
  last:         () => void;
  bookActive?:  boolean;
  onBook?:      () => void;
  rightSlot?:   VNode | null;
}

export function renderMoveNavBar(leftNodes: Array<VNode | null>, nav?: MoveNavOverride): VNode {
  let canPrev: boolean, canNext: boolean, first: () => void, prev: () => void, next: () => void, last: () => void;
  let explorerBtn: VNode | null = null;
  let rightZone: VNode;

  if (nav) {
    ({ canPrev, canNext, first, prev, next, last } = nav);
    if (nav.onBook !== undefined) {
      explorerBtn = h('button.fbt', {
        class: { active: !!nav.bookActive },
        attrs: { 'data-icon': ICON_BOOK, title: 'Opening explorer' },
        on:    { click: nav.onBook },
      });
    }
    rightZone = h('div.move-nav-bar__right', nav.rightSlot ? [nav.rightSlot] : []);
  } else {
    // Analysis context — use injected deps and render explorer + hamburger slots.
    const deps = _deps!;
    const ctrl = deps.getCtrl();
    canPrev = ctrl.path !== '';
    canNext = !!ctrl.node.children[0];
    first   = deps.first;
    prev    = deps.prev;
    next    = deps.next;
    last    = deps.last;
    explorerBtn = renderExplorerEntry();
    rightZone = h('div.move-nav-bar__right', [
      h('button.fbt', {
        class: { active: _actionMenuOpen },
        attrs: { 'data-icon': ICON_HAMBURGER, title: 'Analysis menu' },
        on:    { click: () => { toggleActionMenu(); deps.redraw(); } },
      }),
    ]);
  }

  return h('div.move-nav-bar', [
    h('div.move-nav-bar__left', leftNodes.filter((n): n is VNode => n !== null)),
    ...(explorerBtn ? [explorerBtn] : []),
    h('div.move-nav-bar__middle', [
      h('div.jumps', [
        h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_FIRST, disabled: !canPrev, title: 'First move' },
          on:    { click: first },
        }),
        h('button.fbt', {
          attrs: { 'data-icon': ICON_PREV, disabled: !canPrev, title: 'Previous move' },
          on:    { click: prev },
        }),
        h('button.fbt', {
          attrs: { 'data-icon': ICON_NEXT, disabled: !canNext, title: 'Next move' },
          on:    { click: next },
        }),
        h('button.fbt', {
          attrs: { 'data-icon': ICON_JUMP_LAST, disabled: !canNext, title: 'Last move' },
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








export function renderActionMenu(): VNode | null {
  if (!_actionMenuOpen) return null;
  const deps     = _deps!;
  const ctrl     = deps.getCtrl();
  const close    = () => { closeActionMenu(); deps.redraw(); };
  const hasRetro = !!ctrl.retro || !!ctrl.retroChoice;
  const canLFYM  = analysisComplete && !batchAnalyzing;


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

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: { title: 'Close menu' },
      on:    { click: close },
    }, '×'),

    // Tools section — mirrors lichess-org/lila: actionMenu.ts Tools group
    h('h2', 'Tools'),
    h('div.action-menu__tools', [

      h('button', {
        attrs: { title: 'Save this game to Study Library' },
        on:    { click: () => { deps.onSaveToLibrary(); close(); } },
      }, 'Save game to Library'),

      // Flip board — mirrors lichess-org/lila: actionMenu.ts ctrl.flip() action
      h('button', {
        attrs: { 'data-icon': ICON_FLIP, title: 'Flip board (hotkey: f)' },
        on:    { click: () => { deps.onFlipBoard(); close(); } },
      }, 'Flip board'),
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
