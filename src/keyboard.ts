// Keyboard navigation and branch-jumping for the analysis board.
// Adapted from lichess-org/lila: ui/analyse/src/keyboard.ts,
// ui/analyse/src/control.ts (previousBranch / nextBranch)

import type { Role } from 'chessops';
import { h, type VNode } from 'snabbdom';
import type { AnalyseCtrl } from './analyse/ctrl';
import {
  currentEval,
  toggleEngine, toggleThreatMode,
  showEngineArrows, setShowEngineArrows, syncArrow,
} from './engine/ctrl';
import { getActivePuzzleCtrl } from './puzzles/runtime';
import { handlePuzzleKey } from './puzzles/index';
import { pathInit } from './tree/ops';

// --- Injected deps ---

let _getCtrl:     () => AnalyseCtrl                                      = () => { throw new Error('keyboard not initialised'); };
let _navigate:    (path: string) => void                                 = () => {};
let _next:        () => void                                             = () => {};
let _prev:        () => void                                             = () => {};
let _first:       () => void                                             = () => {};
let _last:        () => void                                             = () => {};
let _flip:        () => void                                             = () => {};
let _completeMove:(orig: string, dest: string, promotion?: Role) => void = () => {};
let _redraw:      () => void                                             = () => {};

export function bindKeyboardHandlers(deps: {
  getCtrl:     () => AnalyseCtrl;
  navigate:    (path: string) => void;
  next:        () => void;
  prev:        () => void;
  first:       () => void;
  last:        () => void;
  flip:        () => void;
  completeMove:(orig: string, dest: string, promotion?: Role) => void;
  redraw:      () => void;
}): void {
  _getCtrl      = deps.getCtrl;
  _navigate     = deps.navigate;
  _next         = deps.next;
  _prev         = deps.prev;
  _first        = deps.first;
  _last         = deps.last;
  _flip         = deps.flip;
  _completeMove = deps.completeMove;
  _redraw       = deps.redraw;

  // Adapted from lichess-org/lila: ui/analyse/src/keyboard.ts
  // C.1: a (arrows), l (engine), space (best move), ? (help), f (flip), x (threat)
  // C.2: Shift+arrows for branch/sibling navigation
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // When a puzzle is active, delegate to the puzzle key handler first.
    // 'f' (flip) is not intercepted — it falls through to the standard handler below.
    if (getActivePuzzleCtrl()) {
      if (e.key !== 'f' && e.key !== 'F') {
        const consumed = handlePuzzleKey(e.key);
        if (consumed) { e.preventDefault(); return; }
      }
    }

    if (e.shiftKey) {
      if (e.key === 'ArrowLeft')       { e.preventDefault(); previousBranch(); _redraw(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nextBranch();     _redraw(); }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); nextSibling();    _redraw(); }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); prevSibling();    _redraw(); }
      return;
    }
    if (e.key === 'ArrowRight')        { _next();  _redraw(); }
    else if (e.key === 'ArrowLeft')    { _prev();  _redraw(); }
    else if (e.key === 'ArrowUp')      { e.preventDefault(); _first(); _redraw(); }
    else if (e.key === 'ArrowDown')    { e.preventDefault(); _last();  _redraw(); }
    else if (e.key === 'f' || e.key === 'F') _flip();
    else if (e.key === 'x' || e.key === 'X') toggleThreatMode();
    else if (e.key === 'l' || e.key === 'L') toggleEngine();
    else if (e.key === 'a' || e.key === 'A') { setShowEngineArrows(!showEngineArrows); syncArrow(); _redraw(); }
    else if (e.key === ' ')            { e.preventDefault(); playBestMove(); }
    else if (e.key === '?')            { showKeyboardHelp = !showKeyboardHelp; _redraw(); }
  });
}

// --- Branch navigation ---

/**
 * Jump back to the nearest fork (a position with multiple children).
 * Mirrors lichess-org/lila: ui/analyse/src/control.ts previousBranch
 */
function previousBranch(): void {
  const ctrl = _getCtrl();
  let path = pathInit(ctrl.path);
  while (path.length > 0) {
    const parent = (() => {
      let p = ctrl.root;
      const parts = [];
      for (let i = 0; i < path.length; i += 2) parts.push(path.slice(i, i + 2));
      for (const id of parts.slice(0, -1)) {
        const child = p.children.find(c => c.id === id);
        if (!child) return null;
        p = child;
      }
      return p;
    })();
    if (parent && parent.children.length >= 2) { _navigate(path); return; }
    path = pathInit(path);
  }
  _navigate('');
}

/**
 * Jump forward to the next fork, following the current branch.
 * Mirrors lichess-org/lila: ui/analyse/src/control.ts nextBranch
 */
function nextBranch(): void {
  const ctrl = _getCtrl();
  let path = ctrl.path;
  let node = ctrl.node;
  while (node.children.length === 1) {
    const onlyChild = node.children[0];
    if (!onlyChild) break;
    path += onlyChild.id;
    node = onlyChild;
  }
  const firstChild = node.children[0];
  if (node.children.length >= 2 && firstChild) _navigate(path + firstChild.id);
  else _last(); // no fork ahead — go to end
}

/**
 * At the current fork, switch to the next sibling variation.
 * Mirrors lichess-org/lila: ui/analyse/src/keyboard.ts Shift+Down
 */
function nextSibling(): void {
  const ctrl = _getCtrl();
  const parentPath = pathInit(ctrl.path);
  const parentNode = ctrl.nodeList[ctrl.nodeList.length - 2];
  if (!parentNode || parentNode.children.length < 2) return;
  const idx  = parentNode.children.findIndex(c => c.id === ctrl.node.id);
  const next = parentNode.children[(idx + 1) % parentNode.children.length];
  if (!next) return;
  _navigate(parentPath + next.id);
}

/**
 * At the current fork, switch to the previous sibling variation.
 * Mirrors lichess-org/lila: ui/analyse/src/keyboard.ts Shift+Up
 */
function prevSibling(): void {
  const ctrl = _getCtrl();
  const parentPath = pathInit(ctrl.path);
  const parentNode = ctrl.nodeList[ctrl.nodeList.length - 2];
  if (!parentNode || parentNode.children.length < 2) return;
  const idx  = parentNode.children.findIndex(c => c.id === ctrl.node.id);
  const prev = parentNode.children[(idx - 1 + parentNode.children.length) % parentNode.children.length];
  if (!prev) return;
  _navigate(parentPath + prev.id);
}

/**
 * Play the engine's best move from the current position.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts playBestMove
 */
function playBestMove(): void {
  const best = currentEval.best;
  if (!best || best.length < 4) return;
  const orig      = best.slice(0, 2);
  const dest      = best.slice(2, 4);
  const promotion = best.length > 4 ? best.slice(4) as Role : undefined;
  _completeMove(orig, dest, promotion);
}

// --- Keyboard help overlay ---

let showKeyboardHelp = false;

export function renderKeyboardHelp(): VNode | null {
  if (!showKeyboardHelp) return null;
  return h('div.keyboard-help', {
    on: { click: () => { showKeyboardHelp = false; _redraw(); } },
  }, [
    h('div.keyboard-help__box', { on: { click: (e: Event) => e.stopPropagation() } }, [
      h('h2', 'Keyboard shortcuts'),
      h('table', [
        h('tbody', [
          ['←  /  →',    'Previous / next move'],
          ['↑  /  ↓',    'First / last move'],
          ['Shift + ←',  'Jump to previous fork'],
          ['Shift + →',  'Jump to next fork'],
          ['Shift + ↑↓', 'Switch variation at fork'],
          ['Space',      'Play engine best move'],
          ['l',          'Toggle engine'],
          ['a',          'Toggle engine arrows'],
          ['x',          'Toggle threat mode'],
          ['f',          'Flip board'],
          ['?',          'Show this help'],
        ].map(([key, desc]) => h('tr', [h('td', key as string), h('td', desc as string)]))),
      ]),
      h('button.keyboard-help__close', {
        on: { click: () => { showKeyboardHelp = false; _redraw(); } },
      }, '✕'),
    ]),
  ]);
}
