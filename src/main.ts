import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { uciToMove } from '@lichess-org/chessground/util';
import { init, classModule, attributesModule, eventListenersModule, h, type VNode } from 'snabbdom';
import { AnalyseCtrl } from './analyse/ctrl';
import { StockfishProtocol } from './ceval/protocol';
import { current, onChange, type Route } from './router';
import { pathInit } from './tree/ops';
import { pgnToTree } from './tree/pgn';

console.log('Patzer Pro');

const patch = init([classModule, attributesModule, eventListenersModule]);

// --- Game library state ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts (game data passed in at boot)
// importedGames is populated by the game import flow (task 8.x).
// loadGame() is the integration point — call it when a game is selected.

export interface ImportedGame {
  id: string;
  pgn: string;
  white?: string;
  black?: string;
  result?: string;
  date?: string;
}

const SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';
let importedGames: ImportedGame[] = [];
let selectedGameId: string | null = null;
let selectedGamePgn: string | null = null;

function getActivePgn(): string {
  return selectedGamePgn ?? SAMPLE_PGN;
}

// --- Analysis controller (persists for the session) ---

let ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));

/**
 * Load a game into the analysis board by PGN.
 * Resets analysis state and re-evaluates if engine is on.
 */
function loadGame(pgn: string | null): void {
  selectedGamePgn = pgn;
  ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
  evalCache.clear();
  currentEval = {};
  syncBoard();
  syncArrow();
  evalCurrentPosition();
  redraw();
}

// --- Engine ---
// Mirrors lichess-org/lila: ui/lib/src/ceval/ toggle + state management

interface PositionEval {
  cp?: number;
  mate?: number;
  best?: string;
  /** cp delta vs previous mainline position (positive = better for white) */
  delta?: number;
}

let engineEnabled = false;
let engineReady = false;
let engineInitialized = false;
let currentEval: PositionEval = {};
const evalCache = new Map<string, PositionEval>();
let evalNodeId = '';
let evalParentNodeId = '';
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
      syncArrow();
      redraw();
    }
  } else if (parts[0] === 'bestmove' && parts[1] && parts[1] !== '(none)') {
    currentEval.best = parts[1];
    const stored: PositionEval = { ...currentEval };
    const parentEval = evalCache.get(evalParentNodeId);
    if (parentEval?.cp !== undefined && stored.cp !== undefined) {
      stored.delta = stored.cp - parentEval.cp;
    }
    evalCache.set(evalNodeId, stored);
    currentEval = stored;
    console.log('[eval cache]', evalNodeId, stored);
    syncArrow();
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
  const cached = evalCache.get(ctrl.node.id);
  if (cached) {
    currentEval = { ...cached };
    syncArrow();
    redraw();
    return;
  }
  evalNodeId = ctrl.node.id;
  evalParentNodeId = ctrl.nodeList[ctrl.nodeList.length - 2]?.id ?? '';
  currentEval = {}; // reset for new position
  syncArrow();      // clear stale arrow immediately
  protocol.stop();
  protocol.setPosition(ctrl.node.fen);
  protocol.go(10);
}

// Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts makeShapesFromUci
// autoShapes is the programmatic layer — does not affect user-drawn shapes.
function syncArrow(): void {
  if (!cgInstance) return;
  const shapes: DrawShape[] = [];
  if (engineEnabled && currentEval.best) {
    const uci = currentEval.best;
    shapes.push({
      orig: uci.slice(0, 2) as Key,
      dest: uci.slice(2, 4) as Key,
      brush: 'paleBlue',
    });
  }
  cgInstance.set({ drawable: { autoShapes: shapes } });
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
    currentEval = {};
    syncArrow(); // clear arrow when engine turns off
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

// --- Eval bar ---
// Adapted from lichess-org/lila: ui/analyse/src/view/ (evaluation bar)

function evalPct(): number {
  if (!engineEnabled) return 50;
  if (currentEval.mate !== undefined) return currentEval.mate > 0 ? 100 : 0;
  if (currentEval.cp !== undefined) {
    const pct = 50 + currentEval.cp / 20;
    return Math.max(0, Math.min(100, pct));
  }
  return 50;
}

function renderEvalBar(): VNode {
  const pct = evalPct();
  return h('div.eval-bar', [
    h('div.eval-bar__fill', { attrs: { style: `height: ${pct}%` } }),
  ]);
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

// --- PGN paste import ---

let pgnInput = '';
let pgnError: string | null = null;
let pgnKey = 0;      // incremented on successful import to reset the textarea via Snabbdom key
let gameIdCounter = 0;

function parsePgnHeader(pgn: string, tag: string): string | undefined {
  return pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))?.[1];
}

function importPgn(): void {
  const raw = pgnInput.trim();
  if (!raw) return;
  try {
    pgnToTree(raw); // validate — throws on bad PGN
    const game: ImportedGame = {
      id: `game-${++gameIdCounter}`,
      pgn: raw,
      white:  parsePgnHeader(raw, 'White'),
      black:  parsePgnHeader(raw, 'Black'),
      result: parsePgnHeader(raw, 'Result'),
      date:   parsePgnHeader(raw, 'Date')?.replace(/\./g, '-'),
    };
    importedGames = [...importedGames, game];
    selectedGameId = game.id;
    pgnError = null;
    pgnInput = '';
    pgnKey++;        // new key causes Snabbdom to recreate the textarea (clears it)
    loadGame(game.pgn); // calls redraw()
  } catch (_) {
    pgnError = 'Invalid PGN — could not parse.';
    redraw();
  }
}

function renderPgnImport(): VNode {
  return h('div.pgn-import', [
    h('textarea.pgn-import__input', {
      key: pgnKey,
      attrs: { placeholder: 'Paste PGN here…', rows: 4 },
      on: { input: (e: Event) => { pgnInput = (e.target as HTMLTextAreaElement).value; } },
    }),
    h('div.pgn-import__row', [
      h('button', { on: { click: importPgn } }, 'Import PGN'),
      pgnError ? h('span.pgn-import__error', pgnError) : h('span'),
    ]),
  ]);
}

// --- Game list ---
// Adapted from docs/reference/GameImport/index.jsx

function renderGameList(): VNode {
  if (importedGames.length === 0) return h('div');
  return h('div.game-list', [
    h('div.game-list__header', `${importedGames.length} imported game${importedGames.length === 1 ? '' : 's'}`),
    h('ul', importedGames.map(game => {
      const label = (game.white && game.black)
        ? `${game.white} vs ${game.black}${game.result ? ' · ' + game.result : ''}${game.date ? ' · ' + game.date.slice(0, 10) : ''}`
        : game.id;
      return h('li', h('button.game-list__row', {
        class: { active: game.id === selectedGameId },
        on: { click: () => { selectedGameId = game.id; loadGame(game.pgn); } },
      }, label));
    })),
  ]);
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
        h('div.analyse__board-wrap', [renderEvalBar(), h('div.analyse__board', [renderBoard()])]),
        renderMoveList(),
        renderPgnImport(),
        renderGameList(),
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
