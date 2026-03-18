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
  puzzleCandidates = [];
  batchQueue     = [];
  batchDone      = 0;
  batchAnalyzing = false;
  batchState     = 'idle';
  syncBoard();
  syncArrow();
  evalCurrentPosition();
  redraw();
}

// --- IndexedDB persistence ---
// Minimal local storage for imported games — one DB, one store, one record.
// Mirrors the pattern of lichess-org/lila: ui/analyse/src/idbTree.ts but stripped
// to the minimum needed for persisting the imported games list only.

interface StoredGames {
  games: ImportedGame[];
  selectedId: string | null;
  path?: string;
}

let _idb: IDBDatabase | undefined;

function openGameDb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('patzer-pro', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('game-library');
    req.onsuccess    = () => { _idb = req.result; resolve(_idb); };
    req.onerror      = () => reject(req.error);
  });
}

async function saveGamesToIdb(): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('game-library', 'readwrite');
    tx.objectStore('game-library').put(
      { games: importedGames, selectedId: selectedGameId, path: ctrl.path } satisfies StoredGames,
      'imported-games',
    );
  } catch (e) {
    console.warn('[idb] save failed', e);
  }
}

async function loadGamesFromIdb(): Promise<StoredGames | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('game-library', 'readonly')
        .objectStore('game-library').get('imported-games');
      req.onsuccess = () => resolve(req.result as StoredGames | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] load failed', e);
    return undefined;
  }
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

// --- Batch analysis queue ---
// Sequential mainline analysis driven by the bestmove callback.
// When batchAnalyzing is true the batch owns the engine; evalCurrentPosition() yields.

interface BatchItem {
  nodeId:       string;
  nodePly:      number;
  parentNodeId: string;
  fen:          string;
}

type BatchState = 'idle' | 'analyzing' | 'complete';

let batchQueue:     BatchItem[] = [];
let batchDone      = 0;
let batchAnalyzing = false;
let batchState: BatchState = 'idle';

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
      if (!batchAnalyzing) {
        console.log('[eval]', { ...currentEval });
        syncArrow();
        redraw();
      }
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
    if (batchAnalyzing) {
      advanceBatch(); // drives the queue; skips syncArrow/redraw until done
    } else {
      syncArrow();
      redraw();
    }
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
  if (batchAnalyzing) return; // batch owns the engine; ignore interactive requests
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

function startBatchAnalysis(): void {
  if (!engineEnabled || !engineReady || batchAnalyzing) return;

  // Build queue: mainline nodes excluding root and already-cached positions
  const queue: BatchItem[] = [];
  let parentId = '';
  for (const node of ctrl.mainline) {
    if (!evalCache.has(node.id)) {
      queue.push({ nodeId: node.id, nodePly: node.ply, parentNodeId: parentId, fen: node.fen });
    }
    parentId = node.id;
  }

  batchQueue     = queue;
  batchDone      = 0;
  batchAnalyzing = queue.length > 0;
  batchState     = queue.length > 0 ? 'analyzing' : 'complete';
  redraw();

  if (queue.length > 0) evalBatchItem(queue[0]!);
}

function evalBatchItem(item: BatchItem): void {
  evalNodeId      = item.nodeId;
  evalNodePly     = item.nodePly;
  evalParentNodeId = item.parentNodeId;
  currentEval     = {};
  protocol.stop();
  protocol.setPosition(item.fen);
  protocol.go(10);
}

function advanceBatch(): void {
  batchDone++;
  redraw();
  if (batchDone < batchQueue.length) {
    evalBatchItem(batchQueue[batchDone]!);
  } else {
    batchAnalyzing = false;
    batchState     = 'complete';
    syncArrow(); // restore arrow for current board position
    redraw();
  }
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
  void saveGamesToIdb();
  redraw();
}

function prev(): void {
  if (ctrl.path === '') return;
  ctrl.setPath(pathInit(ctrl.path));
  syncBoard();
  evalCurrentPosition();
  void saveGamesToIdb();
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
      on: { click: () => { ctrl.setPath(nodePath); syncBoard(); evalCurrentPosition(); void saveGamesToIdb(); redraw(); } },
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

// --- Puzzle candidate extraction ---
// Adapted from lichess-org/lila: ui/analyse/src/practice/practiceCtrl.ts (makeComment)
// A candidate is any mainline position where the played move crossed the blunder threshold
// and the engine had a better move available in the pre-mistake position.
// The puzzle starts at the parent's FEN; the solution is the engine's best from there.

// Minimum win-chance loss to qualify as a puzzle candidate.
// Matches LOSS_THRESHOLDS.blunder — tune here only.
const PUZZLE_CANDIDATE_MIN_LOSS = 0.14;

interface PuzzleCandidate {
  gameId:    string | null; // source game
  path:      string;        // TreePath to the mistake node
  fen:       string;        // FEN of the position BEFORE the mistake (puzzle start)
  bestMove:  string;        // engine best from that position (puzzle solution)
  san:       string;        // the mistake move that was played
  loss:      number;        // win-chance shift (mover's perspective)
}

let puzzleCandidates: PuzzleCandidate[] = [];

/**
 * Scan the current mainline for blunder-level moves that have engine data.
 * Returns candidates and stores them in puzzleCandidates.
 * Mirrors the swing-detection loop in lichess-org/lila: practiceCtrl.ts makeComment.
 */
function extractPuzzleCandidates(): PuzzleCandidate[] {
  const candidates: PuzzleCandidate[] = [];
  let path = '';
  for (let i = 1; i < ctrl.mainline.length; i++) {
    const node   = ctrl.mainline[i]!;
    const parent = ctrl.mainline[i - 1]!;
    path += node.id;

    const nodeEval   = evalCache.get(node.id);
    const parentEval = evalCache.get(parent.id);

    // Require: evaluated loss above threshold + engine best move from parent position
    if (
      nodeEval?.loss !== undefined &&
      nodeEval.loss >= PUZZLE_CANDIDATE_MIN_LOSS &&
      parentEval?.best
    ) {
      candidates.push({
        gameId:   selectedGameId,
        path,
        fen:      parent.fen,
        bestMove: parentEval.best,
        san:      node.san ?? '',
        loss:     nodeEval.loss,
      });
    }
  }
  puzzleCandidates = candidates;
  console.log('[puzzles] extracted', candidates.length, 'candidates', candidates);
  return candidates;
}

function renderAnalyzeAll(): VNode {
  const canRun = engineEnabled && engineReady && !batchAnalyzing;
  const label = batchAnalyzing
    ? `Analyzing… ${batchDone} / ${batchQueue.length}`
    : batchState === 'complete'
      ? `Analysis complete (${batchDone} / ${batchQueue.length + batchDone} nodes)`
      : 'Analyze All Moves';
  return h('div.pgn-import', [
    h('div.pgn-import__row', [
      h('button', { attrs: { disabled: !canRun }, on: { click: startBatchAnalysis } }, label),
    ]),
  ]);
}

function renderPuzzleCandidates(): VNode {
  const label = engineEnabled
    ? `Find Puzzles (${puzzleCandidates.length})`
    : 'Find Puzzles (engine off)';
  return h('div.pgn-import', [
    h('div.pgn-import__row', [
      h('button', {
        attrs: { disabled: !engineEnabled },
        on: { click: () => { extractPuzzleCandidates(); redraw(); } },
      }, label),
      puzzleCandidates.length > 0
        ? h('span', { attrs: { style: 'font-size:0.8rem;color:#888' } },
            `${puzzleCandidates.length} candidate${puzzleCandidates.length === 1 ? '' : 's'} found`)
        : h('span'),
    ]),
  ]);
}

// --- Import filters ---
// Adapted from docs/reference/ImportControls/index.jsx
// Shared filters applied to both Chess.com and Lichess username imports.

type ImportSpeed = 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical';

let importFilterRated = true;
let importFilterSpeed: ImportSpeed = 'all';

const SPEED_OPTIONS: { value: ImportSpeed; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'bullet',    label: 'Bullet'    },
  { value: 'blitz',     label: 'Blitz'     },
  { value: 'rapid',     label: 'Rapid'     },
  { value: 'classical', label: 'Classical' },
];

const FILTER_PILL_BASE  = 'background:#1a1a1a;color:#888;border:1px solid #333;border-radius:3px;padding:2px 7px;font-size:0.8rem;cursor:pointer';
const FILTER_PILL_ACTIVE = 'background:#1e3a1e;color:#6f6;border:1px solid #3a7a3a;border-radius:3px;padding:2px 7px;font-size:0.8rem;cursor:pointer';

function renderImportFilters(): VNode {
  return h('div.pgn-import', [
    h('div.pgn-import__row', [
      h('label', { attrs: { style: 'display:flex;align-items:center;gap:5px;font-size:0.85rem;cursor:pointer;user-select:none' } }, [
        h('input', {
          attrs: { type: 'checkbox', checked: importFilterRated },
          on: { change: (e: Event) => { importFilterRated = (e.target as HTMLInputElement).checked; redraw(); } },
        }),
        'Rated only',
      ]),
      h('span', { attrs: { style: 'color:#888;font-size:0.8rem;margin-left:8px' } }, 'Speed:'),
      ...SPEED_OPTIONS.map(({ value, label }) =>
        h('button', {
          attrs: { style: importFilterSpeed === value ? FILTER_PILL_ACTIVE : FILTER_PILL_BASE },
          on: { click: () => { importFilterSpeed = value; redraw(); } },
        }, label)
      ),
    ]),
  ]);
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

async function fetchChesscomGames(username: string, rated: boolean, speed: ImportSpeed): Promise<ImportedGame[]> {
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

  // 3. Normalize: standard, no daily, apply filters — newest first
  const result: ImportedGame[] = [];
  for (let i = rawGames.length - 1; i >= 0; i--) {
    const raw = rawGames[i];
    if (raw.rules !== 'chess' || raw.time_class === 'daily') continue;
    if (rated && !raw.rated) continue;
    if (speed !== 'all' && raw.time_class !== speed) continue;
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
    const games = await fetchChesscomGames(name, importFilterRated, importFilterSpeed);
    if (games.length === 0) {
      chesscomError = 'No recent rated games found.';
    } else {
      importedGames = [...importedGames, ...games];
      selectedGameId = games[0]!.id;
      void saveGamesToIdb();
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

async function fetchLichessGames(username: string, rated: boolean, speed: ImportSpeed): Promise<ImportedGame[]> {
  const params = new URLSearchParams({ max: '30' });
  if (rated) params.set('rated', 'true');
  if (speed !== 'all') params.set('perfType', speed);
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
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
    const games = await fetchLichessGames(name, importFilterRated, importFilterSpeed);
    if (games.length === 0) {
      lichessError = 'No recent rated games found.';
    } else {
      importedGames = [...importedGames, ...games];
      selectedGameId = games[0]!.id;
      void saveGamesToIdb();
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
    void saveGamesToIdb();
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
        renderAnalyzeAll(),
        renderPuzzleCandidates(),
        renderImportFilters(),
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

// --- Startup: restore persisted games ---
// Runs after the initial render so the board already exists when syncBoard is called.
// Mirrors the deferred-load pattern of lichess-org/lila: ui/analyse/src/idbTree.ts merge()
void loadGamesFromIdb().then(stored => {
  if (!stored || stored.games.length === 0) return;
  importedGames = stored.games;
  // Restore the previously selected game, or fall back to the first one
  const toLoad = stored.games.find(g => g.id === stored.selectedId) ?? stored.games[0]!;
  selectedGameId = toLoad.id;
  selectedGamePgn = toLoad.pgn;
  ctrl = new AnalyseCtrl(pgnToTree(toLoad.pgn));
  evalCache.clear();
  currentEval = {};
  // Restore analysis path — ctrl.setPath is a no-op if the path is invalid for this tree
  if (stored.path) ctrl.setPath(stored.path);
  syncBoard();
  syncArrow();
  redraw();
});
