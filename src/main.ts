import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import { uciToMove } from '@lichess-org/chessground/util';
import { init, classModule, attributesModule, eventListenersModule, h, type VNode } from 'snabbdom';
import { AnalyseCtrl } from './analyse/ctrl';
import { StockfishProtocol } from './ceval/protocol';
import { current, onChange, type Route } from './router';
import { pathInit } from './tree/ops';
import { pgnToTree } from './tree/pgn';

console.log('Patzer Pro');

const patch = init([classModule, attributesModule, eventListenersModule]);

// --- Analysis controller (persists for the session) ---

const TEST_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';
const ctrl = new AnalyseCtrl(pgnToTree(TEST_PGN));

// --- Engine ---
// Mirrors lichess-org/lila: ui/lib/src/ceval/ toggle + state management

interface PositionEval {
  cp?: number;
  mate?: number;
  best?: string;
}

let engineEnabled = false;
let engineReady = false;
let engineInitialized = false;
let currentEval: PositionEval = {};
const protocol = new StockfishProtocol();

/**
 * Parse a single UCI output line into currentEval.
 * Adapted from lichess-org/lila: ui/lib/src/ceval/protocol.ts received
 */
function parseEngineLine(line: string): void {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === 'info') {
    let isMate = false;
    let score: number | undefined;
    let best: string | undefined;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'score') {
        isMate = parts[++i] === 'mate';
        score = parseInt(parts[++i]);
        // skip lowerbound / upperbound tokens
        if (parts[i + 1] === 'lowerbound' || parts[i + 1] === 'upperbound') i++;
      } else if (parts[i] === 'pv') {
        best = parts[i + 1]; // first move in principal variation
        break;
      }
    }
    if (score !== undefined) {
      if (isMate) {
        currentEval.mate = score;
        currentEval.cp = undefined;
      } else {
        currentEval.cp = score;
        currentEval.mate = undefined;
      }
    }
    if (best) currentEval.best = best;
    if (score !== undefined || best) {
      console.log('[eval]', { ...currentEval });
      redraw();
    }
  } else if (parts[0] === 'bestmove' && parts[1] && parts[1] !== '(none)') {
    currentEval.best = parts[1];
    console.log('[eval] bestmove', { ...currentEval });
    redraw();
  }
}

protocol.onMessage(line => {
  if (line.trim() === 'readyok') {
    engineReady = true;
    evalCurrentPosition();
    redraw(); // update button label: Loading → On
  } else {
    parseEngineLine(line);
  }
});

function evalCurrentPosition(): void {
  if (!engineEnabled || !engineReady) return;
  currentEval = {}; // reset for new position
  protocol.stop();
  protocol.setPosition(ctrl.node.fen);
  protocol.go(10);
}

// Adapted from lichess-org/lila: ui/lib/src/ceval/ctrl.ts toggle
function toggleEngine(): void {
  engineEnabled = !engineEnabled;
  if (engineEnabled) {
    if (!engineInitialized) {
      engineInitialized = true;
      // Relative URL resolves against the page (public/index.html) → public/stockfish/...
      protocol.init('stockfish/stockfish-nnue-16-single.js');
      // evalCurrentPosition() will be called once readyok arrives
    } else if (engineReady) {
      evalCurrentPosition();
    }
  } else {
    protocol.stop();
  }
  redraw();
}

// --- Board sync ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts showGround / makeCgOpts
// Board state is updated directly via cgInstance.set() — never via Snabbdom re-render.
// The cg-wrap element is keyed so Snabbdom always reuses it rather than recreating it.

function syncBoard(): void {
  if (!cgInstance) return;
  const node = ctrl.node;
  cgInstance.set({
    fen: node.fen,
    lastMove: uciToMove(node.uci),
    turnColor: node.ply % 2 === 0 ? 'white' : 'black',
  });
}

// --- Navigation ---

function next(): void {
  const child = ctrl.node.children[0];
  if (!child) return;
  ctrl.setPath(ctrl.path + child.id);
  syncBoard();
  evalCurrentPosition();
  redraw();
}

function prev(): void {
  if (ctrl.path === '') return;
  ctrl.setPath(pathInit(ctrl.path));
  syncBoard();
  evalCurrentPosition();
  redraw();
}

// --- App nav ---

function activeSection(route: Route): string {
  switch (route.name) {
    case 'analysis':
    case 'analysis-game':
      return 'analysis';
    case 'puzzles':  return 'puzzles';
    case 'openings': return 'openings';
    case 'stats':    return 'stats';
    default:         return '';
  }
}

const navLinks: { label: string; href: string; section: string }[] = [
  { label: 'Analysis', href: '#/analysis', section: 'analysis' },
  { label: 'Puzzles',  href: '#/puzzles',  section: 'puzzles'  },
  { label: 'Openings', href: '#/openings', section: 'openings' },
  { label: 'Stats',    href: '#/stats',    section: 'stats'    },
];

function renderNav(route: Route): VNode {
  const active = activeSection(route);
  return h('nav', navLinks.map(({ label, href, section }) =>
    h('a', { attrs: { href }, class: { active: active === section } }, label)
  ));
}

// --- Board ---

let cgInstance: CgApi | undefined;
let orientation: 'white' | 'black' = 'white';

// Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts (flip)
function flip(): void {
  orientation = orientation === 'white' ? 'black' : 'white';
  cgInstance?.set({ orientation });
  redraw();
}

// Adapted from lichess-org/lila: ui/analyse/src/ground.ts render
function renderBoard(): VNode {
  return h('div.cg-wrap', {
    key: 'board',
    hook: {
      insert: vnode => {
        cgInstance = makeChessground(vnode.elm as HTMLElement, {
          orientation,
          viewOnly: false,
          drawable: { enabled: true },
          fen: ctrl.node.fen,
          lastMove: uciToMove(ctrl.node.uci),
          turnColor: ctrl.node.ply % 2 === 0 ? 'white' : 'black',
        });
      },
      destroy: () => {
        cgInstance?.destroy();
        cgInstance = undefined;
      },
    },
  });
}

// --- Move list ---
// Adapted from lichess-org/lila: ui/analyse/src/treeView/inlineView.ts

function renderMoveList(): VNode {
  const moves: VNode[] = [];
  let path = '';
  for (let i = 1; i < ctrl.mainline.length; i++) {
    const node = ctrl.mainline[i]!;
    path += node.id;
    const nodePath = path; // capture for closure
    const isWhite = node.ply % 2 === 1;
    if (isWhite) {
      moves.push(h('span.move-num', `${Math.ceil(node.ply / 2)}.`));
    }
    moves.push(h('span.move', {
      class: { active: nodePath === ctrl.path },
      on: { click: () => { ctrl.setPath(nodePath); syncBoard(); evalCurrentPosition(); redraw(); } },
    }, node.san ?? ''));
  }
  return h('div.move-list', moves);
}

// --- Eval display ---
// Adapted from lichess-org/lila: ui/analyse/src/view/ (evaluation rendering)

function renderEval(): VNode {
  if (!engineEnabled) return h('div.eval-display');
  const score = currentEval.mate !== undefined
    ? `Mate in ${Math.abs(currentEval.mate)}`
    : currentEval.cp !== undefined
      ? `Eval: ${currentEval.cp >= 0 ? '+' : ''}${(currentEval.cp / 100).toFixed(2)}`
      : 'Evaluating…';
  const best = currentEval.best ? ` | Best: ${currentEval.best}` : '';
  return h('div.eval-display', score + best);
}

// --- Route views ---

function routeContent(route: Route): VNode {
  switch (route.name) {
    case 'analysis-game':
      return h('h1', `Analysis Game: ${route.params['id']}`);
    case 'analysis':
      return h('div.analyse', [
        h('h1', 'Analysis Page'),
        renderEval(),
        h('div.controls', [
          h('button', { on: { click: prev }, attrs: { disabled: ctrl.path === '' } }, '← Prev'),
          h('button', { on: { click: flip } }, 'Flip Board'),
          h('button', { on: { click: next }, attrs: { disabled: !ctrl.node.children[0] } }, 'Next →'),
          h('button', { on: { click: toggleEngine }, class: { active: engineEnabled } },
            engineEnabled ? (engineReady ? 'Engine: On' : 'Engine: Loading…') : 'Engine: Off'
          ),
        ]),
        h('div.analyse__board', [renderBoard()]),
        renderMoveList(),
      ]);
    case 'puzzles':  return h('h1', 'Puzzles Page');
    case 'openings': return h('h1', 'Openings Page');
    case 'stats':    return h('h1', 'Stats Page');
    default:         return h('h1', 'Home');
  }
}

function view(route: Route): VNode {
  return h('div#shell', [
    h('header', [h('span', 'Patzer Pro'), renderNav(route)]),
    h('main', [routeContent(route)]),
  ]);
}

// --- Keyboard navigation ---
// Adapted from lichess-org/lila: ui/analyse/src/keyboard.ts

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
});

// --- Bootstrap ---

const app = document.getElementById('app')!;
let currentRoute = current();
let vnode = patch(app, view(currentRoute));

function redraw(): void {
  vnode = patch(vnode, view(currentRoute));
}

onChange(route => {
  currentRoute = route;
  vnode = patch(vnode, view(currentRoute));
});
