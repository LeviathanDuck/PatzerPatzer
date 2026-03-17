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
  /**
   * Win-chance shift from the mover's perspective (positive = worse for mover).
   * Replaces raw cp loss — uses the sigmoid scale so lopsided positions don't over-trigger.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/winningChances.ts + practiceCtrl.ts
   */
  loss?: number;
}

// --- Win-chances conversion ---
// Adapted from lichess-org/lila: ui/lib/src/ceval/winningChances.ts
// Maps centipawns to a [-1, 1] win-probability scale via sigmoid.
// This compresses the scale in lopsided positions so a 200cp swing when already
// up +800 correctly registers as much smaller than the same swing near equality.

const WIN_CHANCE_MULTIPLIER = -0.00368208; // https://github.com/lichess-org/lila/pull/11148

function rawWinChances(cp: number): number {
  return 2 / (1 + Math.exp(WIN_CHANCE_MULTIPLIER * cp)) - 1;
}

function evalWinChances(ev: PositionEval): number | undefined {
  if (ev.mate !== undefined) {
    const cp = (21 - Math.min(10, Math.abs(ev.mate))) * 100;
    return rawWinChances(cp * (ev.mate > 0 ? 1 : -1));
  }
  if (ev.cp !== undefined) {
    return rawWinChances(Math.min(Math.max(-1000, ev.cp), 1000));
  }
  return undefined;
}

let engineEnabled = false;
let engineReady = false;
let engineInitialized = false;
let currentEval: PositionEval = {};
const evalCache = new Map<string, PositionEval>();
let evalNodeId = '';
let evalNodePly = 0;
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
    // Raw cp delta (kept for reference)
    if (parentEval?.cp !== undefined && stored.cp !== undefined) {
      stored.delta = stored.cp - parentEval.cp;
    }
    // Win-chance shift from mover's perspective.
    // Mirrors lichess-org/lila: ui/lib/src/ceval/winningChances.ts + practiceCtrl.ts
    // povDiff(moverColor, nodeEval, prevEval) = (moverNodeWc - moverPrevWc) / 2
    // loss = -povDiff = (moverPrevWc - moverNodeWc) / 2  [positive = worse for mover]
    if (parentEval) {
      const nodeWc   = evalWinChances(stored);
      const parentWc = evalWinChances(parentEval);
      if (nodeWc !== undefined && parentWc !== undefined) {
        const whiteToMove   = evalNodePly % 2 === 1;
        const moverNodeWc   = whiteToMove ? nodeWc   : -nodeWc;
        const moverParentWc = whiteToMove ? parentWc : -parentWc;
        stored.loss = (moverParentWc - moverNodeWc) / 2;
      }
    }
    evalCache.set(evalNodeId, stored);
    currentEval = stored;
    console.log('[eval cache]', evalNodeId, { cp: stored.cp, delta: stored.delta, loss: stored.loss?.toFixed(4) });
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
  evalNodePly = ctrl.node.ply;
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

// Classification thresholds — win-chance shift from mover's perspective (0–1 scale).
// Mirrors lichess-org/lila: ui/analyse/src/practice/practiceCtrl.ts verdict thresholds exactly.
const LOSS_THRESHOLDS = {
  inaccuracy: 0.025,
  mistake:    0.06,
  blunder:    0.14,
} as const;

type MoveLabel = 'inaccuracy' | 'mistake' | 'blunder';

function classifyLoss(loss: number): MoveLabel | null {
  if (loss >= LOSS_THRESHOLDS.blunder)    return 'blunder';
  if (loss >= LOSS_THRESHOLDS.mistake)    return 'mistake';
  if (loss >= LOSS_THRESHOLDS.inaccuracy) return 'inaccuracy';
  return null;
}

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
    const cached = evalCache.get(node.id);
    const label = cached?.loss !== undefined ? classifyLoss(cached.loss) : null;
    moves.push(h('span.move', {
      class: { active: nodePath === ctrl.path },
      on: { click: () => { ctrl.setPath(nodePath); syncBoard(); evalCurrentPosition(); redraw(); } },
    }, label ? `${node.san} ${label}` : (node.san ?? '')));
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

// --- Chess.com username import ---
// Adapted from docs/reference/api/chesscom.js
// Fetches the most recent month of rated standard games for a given username.

let chesscomUsername = '';
let chesscomLoading = false;
let chesscomError: string | null = null;

const CHESSCOM_BASE = 'https://api.chess.com/pub/player';

function normalizeChesscomResult(whiteResult: string, blackResult: string): string {
  if (whiteResult === 'win') return '1-0';
  if (blackResult === 'win') return '0-1';
  return '1/2-1/2';
}

async function fetchChesscomGames(username: string): Promise<ImportedGame[]> {
  // 1. Fetch archive list (one URL per month the player has games)
  const archivesRes = await fetch(`${CHESSCOM_BASE}/${username.toLowerCase()}/games/archives`);
  if (!archivesRes.ok) {
    throw new Error(archivesRes.status === 404 ? 'Chess.com: user not found' : `Chess.com API error ${archivesRes.status}`);
  }
  const archivesData = await archivesRes.json() as { archives?: string[] };
  const archives = archivesData.archives ?? [];
  if (archives.length === 0) return [];

  // 2. Fetch only the most recent archive month
  const latestUrl = archives[archives.length - 1]!;
  const gamesRes = await fetch(latestUrl);
  if (!gamesRes.ok) throw new Error(`Chess.com API error ${gamesRes.status}`);
  const gamesData = await gamesRes.json() as { games?: any[] };
  const rawGames: any[] = gamesData.games ?? [];

  // 3. Normalize: rated, standard, no daily — newest first
  const result: ImportedGame[] = [];
  for (let i = rawGames.length - 1; i >= 0; i--) {
    const raw = rawGames[i];
    if (!raw.rated || raw.rules !== 'chess' || raw.time_class === 'daily') continue;
    const pgn: string = raw.pgn ?? '';
    if (!pgn) continue;
    try {
      pgnToTree(pgn); // validate — skip games that fail to parse
    } catch {
      continue;
    }
    result.push({
      id: `game-${++gameIdCounter}`,
      pgn,
      white:  raw.white?.username ?? undefined,
      black:  raw.black?.username ?? undefined,
      result: normalizeChesscomResult(raw.white?.result ?? '', raw.black?.result ?? ''),
      date:   parsePgnHeader(pgn, 'Date')?.replace(/\./g, '-'),
    });
  }
  return result;
}

async function importChesscom(): Promise<void> {
  const name = chesscomUsername.trim();
  if (!name || chesscomLoading) return;
  chesscomLoading = true;
  chesscomError = null;
  redraw();
  try {
    const games = await fetchChesscomGames(name);
    if (games.length === 0) {
      chesscomError = 'No recent rated games found.';
    } else {
      importedGames = [...importedGames, ...games];
      selectedGameId = games[0]!.id;
      loadGame(games[0]!.pgn); // calls redraw()
    }
  } catch (err) {
    chesscomError = err instanceof Error ? err.message : 'Import failed.';
  } finally {
    chesscomLoading = false;
    redraw();
  }
}

function renderChesscomImport(): VNode {
  return h('div.pgn-import', [
    h('div.pgn-import__row', [
      h('input', {
        attrs: { placeholder: 'Chess.com username', type: 'text', disabled: chesscomLoading },
        on: { input: (e: Event) => { chesscomUsername = (e.target as HTMLInputElement).value; } },
      }),
      h('button', {
        attrs: { disabled: chesscomLoading || !chesscomUsername.trim() },
        on: { click: () => { void importChesscom(); } },
      }, chesscomLoading ? 'Importing…' : 'Import Chess.com'),
    ]),
    chesscomError ? h('span.pgn-import__error', chesscomError) : h('span'),
  ]);
}

// --- Lichess username import ---
// Lichess public API: GET /api/games/user/{username}?max=N&rated=true
// Returns multi-game PGN text when Accept: application/x-chess-pgn is sent.
// Lichess uses UTCDate rather than Date in PGN headers.

let lichessUsername = '';
let lichessLoading = false;
let lichessError: string | null = null;

async function fetchLichessGames(username: string): Promise<ImportedGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=30&rated=true`;
  const res = await fetch(url, { headers: { 'Accept': 'application/x-chess-pgn' } });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Lichess: user not found' : `Lichess API error ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];

  // Split multi-game PGN: blank line followed by the next [Event header
  const gameTexts = text.trim().split(/\n\n(?=\[Event )/).filter(s => s.trim());

  const result: ImportedGame[] = [];
  for (const pgn of gameTexts) {
    try {
      pgnToTree(pgn); // validate — skip games that fail to parse
    } catch {
      continue;
    }
    // Lichess uses UTCDate; fall back to Date if absent
    const date = (parsePgnHeader(pgn, 'UTCDate') ?? parsePgnHeader(pgn, 'Date'))?.replace(/\./g, '-');
    result.push({
      id:     `game-${++gameIdCounter}`,
      pgn,
      white:  parsePgnHeader(pgn, 'White'),
      black:  parsePgnHeader(pgn, 'Black'),
      result: parsePgnHeader(pgn, 'Result'),
      date,
    });
  }
  return result;
}

async function importLichess(): Promise<void> {
  const name = lichessUsername.trim();
  if (!name || lichessLoading) return;
  lichessLoading = true;
  lichessError = null;
  redraw();
  try {
    const games = await fetchLichessGames(name);
    if (games.length === 0) {
      lichessError = 'No recent rated games found.';
    } else {
      importedGames = [...importedGames, ...games];
      selectedGameId = games[0]!.id;
      loadGame(games[0]!.pgn); // calls redraw()
    }
  } catch (err) {
    lichessError = err instanceof Error ? err.message : 'Import failed.';
  } finally {
    lichessLoading = false;
    redraw();
  }
}

function renderLichessImport(): VNode {
  return h('div.pgn-import', [
    h('div.pgn-import__row', [
      h('input', {
        attrs: { placeholder: 'Lichess username', type: 'text', disabled: lichessLoading },
        on: { input: (e: Event) => { lichessUsername = (e.target as HTMLInputElement).value; } },
      }),
      h('button', {
        attrs: { disabled: lichessLoading || !lichessUsername.trim() },
        on: { click: () => { void importLichess(); } },
      }, lichessLoading ? 'Importing…' : 'Import Lichess'),
    ]),
    lichessError ? h('span.pgn-import__error', lichessError) : h('span'),
  ]);
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
        renderChesscomImport(),
        renderLichessImport(),
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
