// Analysis-controls owner.
// Owns action-menu open/close state, the control-bar render seam, and the action-menu overlay.
// CCP-241: initial seam extraction. CCP-242: three-zone bar. CCP-243: action-menu overlay.
// Adapted from lichess-org/lila: ui/analyse/src/view/controls.ts and actionMenu.ts ownership model

import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
import type { AnalyseCtrl } from './ctrl';
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
  // CCP-244: analysis-local action callbacks
  onFlipBoard:      () => void;
  onToggleRetro:    () => void;
  // CCP-245: opening explorer toggle
  onToggleExplorer: () => void;
  explorerEnabled:  () => boolean;
  // CCP-525: save current game to Study Library
  onSaveToLibrary:  () => void;
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

/**
 * Opening explorer control-bar entry button.
 * Hidden when retro is active — mirrors lichess-org/lila: ui/analyse/src/view/controls.ts
 *   hidden: !!ctrl.retro && !isMobileUi()
 * Returns null when retro is active so it can be filtered from the left zone.
 * CCP-245: first-class explorer control-bar tool.
 * Adapted from lichess-org/lila: ui/analyse/src/view/controls.ts opening-explorer action
 */
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

/**
 * Render the three-zone Lichess-style analysis control bar.
 * Left zone: tool/action entry buttons (review, retro, etc.) passed by caller.
 * Middle zone: first / prev / next / last jump buttons.
 * Right zone: hamburger menu trigger.
 * Mirrors lichess-org/lila: ui/analyse/src/view/controls.ts renderControls() zone split.
 * CCP-241 introduced the seam; CCP-242 replaces renderJumpButtons with this full bar.
 */
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

/**
 * Analysis-local action menu overlay.
 * Renders inside .analyse__tools with position: absolute; inset: 0.
 * Returns null when the menu is closed so the tools column renders normally.
 * CCP-243: shell + section structure + close behavior.
 * CCP-244 wires real items into Tools and Display sections.
 * Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts structure
 */
// Icon codepoints for action-menu items.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_FLIP   = '\ue020'; // licon.ChasingArrows — flip board
const ICON_RETRO  = '\ue05c'; // licon.Bullseye       — learn from your mistakes

/**
 * Analysis-local action menu overlay.
 * Renders inside .analyse__tools with position: absolute; inset: 0.
 * Returns null when the menu is closed so the tools column renders normally.
 * CCP-243: shell. CCP-244: real items wired in.
 * Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts
 */
export function renderActionMenu(): VNode | null {
  if (!_actionMenuOpen) return null;
  const deps     = _deps!;
  const ctrl     = deps.getCtrl();
  const close    = () => { closeActionMenu(); deps.redraw(); };
  const hasRetro = !!ctrl.retro;
  const canLFYM  = analysisComplete && !batchAnalyzing;

  // Sub-panel: inline Mistake Detection settings (CCP-756)
  if (_actionMenuSubView === 'mistake-detection') {
    return h('div.action-menu', [
      h('button.action-menu__back-btn', {
        on: { click: () => { _actionMenuSubView = null; deps.redraw(); } },
      }, '\u2190 Back'),
      h('h2', 'Mistake Detection'),
      h('div.action-menu__subpanel', renderRetroConfigBody(deps.redraw)),
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
      // Save game to Study Library (CCP-525)
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

    // Mistakes section — LFYM and detection settings (CCP-756)
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

      // Mistake Detection — opens inline sub-panel (CCP-756)
      h('button', {
        attrs: { title: 'Configure mistake detection thresholds' },
        on: { click: () => { _actionMenuSubView = 'mistake-detection'; deps.redraw(); } },
      }, 'Mistake Detection'),
    ]),

    // Display section — analysis-local display toggles.
    // Arrow display settings moved here from engine gear (CCP-246).
    // showBoardReviewGlyphs, showReviewLabels: primary ownership now here (removed from gear).
    // reviewDotsUserOnly moved here from global header menu (CCP-244).
    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow('am-board-glyphs', 'Move markers on board', showBoardReviewGlyphs, (v) => { setShowBoardReviewGlyphs(v); syncArrow(); deps.redraw(); }),
      renderToggleRow('am-move-labels', 'Move labels', showReviewLabels, (v) => { setShowReviewLabels(v); deps.redraw(); }),
      // Review dots user-only — moved from global header menu (CCP-244).
      // Storage owner (reviewDotsUserOnly / setReviewDotsUserOnly in src/board/cosmetics.ts) unchanged.
      renderToggleRow('am-review-dots', 'Review dots: my moves only', reviewDotsUserOnly, (v) => { setReviewDotsUserOnly(v); deps.redraw(); }),
      // Arrow display settings — moved from engine gear (CCP-246).
      // Storage owners in engine/ctrl.ts unchanged.
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
