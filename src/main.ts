import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { key2pos, uciToMove } from '@lichess-org/chessground/util';
import type { NormalMove, Role } from 'chessops';
import { Chess } from 'chessops/chess';
import { scalachessCharPair } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, makeSanAndPlay } from 'chessops/san';
import { makeSquare, makeUci, parseSquare, parseUci } from 'chessops/util';
import { init, classModule, attributesModule, eventListenersModule, h, type VNode } from 'snabbdom';
import { AnalyseCtrl } from './analyse/ctrl';
import { StockfishProtocol } from './ceval/protocol';
import { current, onChange, type Route } from './router';
import { addNode, pathInit } from './tree/ops';
import { pgnToTree } from './tree/pgn';
import type { TreeNode } from './tree/types';

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
  batchQueue       = [];
  batchDone        = 0;
  batchAnalyzing   = false;
  batchState       = 'idle';
  analysisRunning  = false;
  analysisComplete = false;
  syncBoard();
  syncArrow();
  // Restore persisted analysis from IndexedDB; falls back to live eval if nothing stored
  if (selectedGameId) void loadAndRestoreAnalysis(selectedGameId);
  else evalCurrentPosition();
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

// --- Stored analysis schema ---
// Persists per-game mainline engine analysis to IndexedDB so results survive refresh.
// Keyed by gameId in the 'analysis-library' store.

const ANALYSIS_VERSION = 1;

type AnalysisStatus = 'idle' | 'partial' | 'complete';

interface StoredNodeEntry {
  nodeId: string;
  path:   string;
  fen:    string;
  cp?:    number;
  mate?:  number;
  best?:  string;
  loss?:  number;
  delta?: number;
}

interface StoredAnalysis {
  gameId:          string;
  analysisVersion: number;
  analysisDepth:   number;
  status:          AnalysisStatus;
  updatedAt:       number;           // Date.now()
  nodes:           Record<string, StoredNodeEntry>; // keyed by nodeId
}

let _idb: IDBDatabase | undefined;

function openGameDb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('patzer-pro', 3);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('game-library'))     db.createObjectStore('game-library');
      if (!db.objectStoreNames.contains('puzzle-library'))   db.createObjectStore('puzzle-library');
      if (!db.objectStoreNames.contains('analysis-library')) db.createObjectStore('analysis-library');
    };
    req.onsuccess    = () => { _idb = req.result; resolve(_idb); };
    req.onerror      = () => reject(req.error);
  });
}

// Saved puzzles — persisted to the puzzle-library store
let savedPuzzles: PuzzleCandidate[] = [];

async function savePuzzlesToIdb(): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('puzzle-library', 'readwrite');
    tx.objectStore('puzzle-library').put(savedPuzzles, 'saved-puzzles');
  } catch (e) {
    console.warn('[idb] puzzle save failed', e);
  }
}

async function loadPuzzlesFromIdb(): Promise<PuzzleCandidate[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('puzzle-library', 'readonly')
        .objectStore('puzzle-library').get('saved-puzzles');
      req.onsuccess = () => resolve((req.result as PuzzleCandidate[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] puzzle load failed', e);
    return [];
  }
}

function savePuzzle(c: PuzzleCandidate): void {
  // Deduplicate by gameId + path
  const already = savedPuzzles.some(p => p.gameId === c.gameId && p.path === c.path);
  if (already) return;
  savedPuzzles = [...savedPuzzles, c];
  void savePuzzlesToIdb();
  redraw();
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

async function saveAnalysisToIdb(status: AnalysisStatus): Promise<void> {
  if (!selectedGameId) return;
  try {
    const db = await openGameDb();
    const nodes: Record<string, StoredNodeEntry> = {};
    let path = '';
    for (let i = 1; i < ctrl.mainline.length; i++) {
      const node = ctrl.mainline[i]!;
      path += node.id;
      const ev = evalCache.get(node.id);
      if (ev) {
        const entry: StoredNodeEntry = { nodeId: node.id, path, fen: node.fen };
        if (ev.cp    !== undefined) entry.cp    = ev.cp;
        if (ev.mate  !== undefined) entry.mate  = ev.mate;
        if (ev.best  !== undefined) entry.best  = ev.best;
        if (ev.loss  !== undefined) entry.loss  = ev.loss;
        if (ev.delta !== undefined) entry.delta = ev.delta;
        nodes[node.id] = entry;
      }
    }
    const record: StoredAnalysis = {
      gameId:          selectedGameId,
      analysisVersion: ANALYSIS_VERSION,
      analysisDepth:   analysisDepth,
      status,
      updatedAt:       Date.now(),
      nodes,
    };
    const tx = db.transaction('analysis-library', 'readwrite');
    tx.objectStore('analysis-library').put(record, selectedGameId);
  } catch (e) {
    console.warn('[idb] analysis save failed', e);
  }
}

async function loadAnalysisFromIdb(gameId: string): Promise<StoredAnalysis | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('analysis-library', 'readonly')
        .objectStore('analysis-library').get(gameId);
      req.onsuccess = () => resolve(req.result as StoredAnalysis | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] analysis load failed', e);
    return undefined;
  }
}

async function clearAnalysisFromIdb(gameId: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('analysis-library', 'readwrite');
    tx.objectStore('analysis-library').delete(gameId);
  } catch (e) {
    console.warn('[idb] analysis clear failed', e);
  }
}

/**
 * Load stored analysis for a game into evalCache and restore completion state.
 * Called when a game is loaded (page load or game switch).
 * Mirrors the IndexedDB restore pattern in lichess-org/lila: ui/analyse/src/idbTree.ts
 */
async function loadAndRestoreAnalysis(gameId: string): Promise<void> {
  const stored = await loadAnalysisFromIdb(gameId);
  if (!stored) return;
  // Stale data: version or depth changed — discard
  if (stored.analysisVersion !== ANALYSIS_VERSION) return;
  if (stored.analysisDepth !== analysisDepth) return;
  // Repopulate evalCache from stored node entries
  for (const entry of Object.values(stored.nodes)) {
    const ev: PositionEval = {};
    if (entry.cp    !== undefined) ev.cp    = entry.cp;
    if (entry.mate  !== undefined) ev.mate  = entry.mate;
    if (entry.best  !== undefined) ev.best  = entry.best;
    if (entry.loss  !== undefined) ev.loss  = entry.loss;
    if (entry.delta !== undefined) ev.delta = entry.delta;
    evalCache.set(entry.nodeId, ev);
  }
  if (stored.status === 'complete') {
    analyzedGameIds.add(gameId);
    analysisComplete = true;
    batchState       = 'complete';
    const game = importedGames.find(g => g.id === gameId);
    const userColor = game ? getUserColor(game) : null;
    if (detectMissedTactics(userColor)) missedTacticGameIds.add(gameId);
  }
  // Sync display to the restored eval for the current node
  const restoredEval = evalCache.get(ctrl.node.id);
  if (restoredEval) currentEval = { ...restoredEval };
  syncArrow();
  redraw();
}

// --- Engine ---
// Mirrors lichess-org/lila: ui/lib/src/ceval/ toggle + state management

interface EvalLine {
  cp?:    number;
  mate?:  number;
  best?:  string;
  /** Full PV move sequence in UCI notation (for display). */
  moves?: string[];
}

interface PositionEval {
  cp?: number;
  mate?: number;
  best?: string;
  /** Full PV move sequence in UCI notation (for display). */
  moves?: string[];
  /** cp delta vs previous mainline position (positive = better for white) */
  delta?: number;
  /**
   * Win-chance shift from the mover's perspective (positive = worse for mover).
   * Replaces raw cp loss — uses the sigmoid scale so lopsided positions don't over-trigger.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/winningChances.ts + practiceCtrl.ts
   */
  loss?: number;
  /** Secondary PV lines when MultiPV > 1 (indices 0+ correspond to multipv 2, 3, …). */
  lines?: EvalLine[];
}

// --- Win-chances conversion ---
// Adapted from lichess-org/lila: ui/lib/src/ceval/winningChances.ts
//
// ── Sign convention (critical) ──────────────────────────────────────────────
// Stockfish reports cp from the SIDE-TO-MOVE's perspective (UCI standard).
// When black is to move (odd ply), a positive cp means black is winning.
// We must negate odd-ply scores to get a consistently WHITE-perspective value,
// matching how Lichess stores ceval.cp in its tree nodes.
// This normalization happens in parseEngineLine and is guarded by evalNodePly.
//
// ── Exact Lichess parity ────────────────────────────────────────────────────
// • Sigmoid formula and multiplier −0.00368208 (lila PR #11148)
// • cp clamped to [−1000, 1000] before the sigmoid
// • Mate converted to cp equivalent: (21 − min(10, |mate|)) × 100
// • povDiff formula: loss = (moverPrevWc − moverNodeWc) / 2
// • Classification thresholds: 0.025 / 0.06 / 0.14
// • Best-move short-circuit: if played UCI equals parent engine best, no label
//
// ── Intentional divergence ──────────────────────────────────────────────────
// • Mover perspective: Lichess practice mode uses a fixed bottomColor() (one
//   player's POV). We use node.ply % 2 to identify each move's actual mover,
//   so both players' mistakes are labelled correctly in post-game analysis.
//
// ── Known approximations ────────────────────────────────────────────────────
// • No tablebase / threefold / 50-move-rule overrides: Lichess sets cp=0 for
//   drawn positions. We use raw engine cp.

const WIN_CHANCE_MULTIPLIER = -0.00368208; // https://github.com/lichess-org/lila/pull/11148

function rawWinChances(cp: number): number {
  return 2 / (1 + Math.exp(WIN_CHANCE_MULTIPLIER * cp)) - 1;
}

function evalWinChances(ev: PositionEval): number | undefined {
  if (ev.mate !== undefined) {
    // Mate in N converted to a large cp equivalent, capped at mate-in-10.
    // Matches lichess-org/lila: ui/lib/src/ceval/winningChances.ts mateWinningChances
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

// --- Engine settings ---
// Mirrors lichess-org/lila: ui/lib/src/ceval/view/settings.ts
let multiPv = 3;             // number of candidate lines (UCI MultiPV), 1–5
let showEngineSettings = false;
/** PV board preview — set when hovering a pv-san span; cleared on mouseleave. */
let pvBoard: { fen: string; uci: string } | null = null;
/** Last known mouse position for floating preview placement. */
let pvBoardPos: { x: number; y: number } = { x: 0, y: 0 };
let showEngineArrows = true; // show engine line arrows on board (default on)
let arrowAllLines = true;    // draw arrows for all PV lines; false = top line only
let showPlayedArrow = true;  // draw arrow for the next move actually played in game
/** Debounce timer for arrow updates during live engine search — avoids flickering. */
let arrowDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Arrows are suppressed until this timestamp to give the engine a settling window. */
let arrowSuppressUntil = 0;
/** Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts — Lichess uses 500 ms delay. */
const ARROW_SETTLE_MS = 500;
/** Accumulates secondary PV lines (multipv 2, 3, …) during an active search. */
let pendingLines: EvalLine[] = [];

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

let analysisDepth    = 18; // Lichess commentable() requires depth >= 15; 18 matches practice mode default
let analysisRunning  = false;
let pendingBatchOnReady = false; // queued batch start — fires on next readyok
let analysisComplete = false;
const analyzedGameIds    = new Set<string>(); // games that have completed a full batch analysis
const missedTacticGameIds = new Set<string>(); // games where the user missed a significant tactic

// Win-chance swing threshold for missed-tactic detection.
// Mirrors lichess-org/lila: ui/analyse/src/nodeFinder.ts evalSwings (0.10).
// Not lowered below Lichess's level — we want clear missed wins, not borderline moves.
const MISSED_TACTIC_THRESHOLD = 0.10;

// Ply cutoff for phase gating. Beyond this we're likely in endgame / time scramble territory.
// Only opening + middlegame misses are flagged (approx first 30 moves).
const MISSED_TACTIC_MAX_PLY = 60;

// Threat mode: evaluates the opponent's best response from the current position.
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts toggleThreatMode + keyboard.ts 'x'
let threatMode   = false;
let evalIsThreat = false; // true while engine is working on the threat position
let threatEval: PositionEval = {};

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
    let pvMoves: string[] = [];
    let pvIndex = 1; // multipv line index (1-based); 1 when MultiPV = 1 or not reported
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'multipv') {
        pvIndex = parseInt(parts[++i]);
      } else if (parts[i] === 'score') {
        isMate = parts[++i] === 'mate';
        score = parseInt(parts[++i]);
        // skip lowerbound / upperbound tokens
        if (parts[i + 1] === 'lowerbound' || parts[i + 1] === 'upperbound') i++;
      } else if (parts[i] === 'pv') {
        // Capture full PV sequence — mirrors lichess renderPvMoves (uses all moves, not just first)
        pvMoves = parts.slice(i + 1);
        best = pvMoves[0];
        break;
      }
    }

    if (pvIndex === 1) {
      // Primary line — route into threat or normal eval as before
      const ev = evalIsThreat ? threatEval : currentEval;
      if (score !== undefined) {
        // Normalize to white's perspective: Stockfish reports from the SIDE-TO-MOVE's perspective.
        // At odd plies (black to move) the raw score is from black's POV — negate for white's POV.
        // Mirrors the normalization Lichess applies when storing ceval.cp in tree nodes.
        const s = (!evalIsThreat && evalNodePly % 2 === 1) ? -score : score;
        if (isMate) { ev.mate = s; ev.cp = undefined; }
        else        { ev.cp = s;   ev.mate = undefined; }
      }
      if (best) ev.best = best;
      if (pvMoves.length > 0 && !evalIsThreat) ev.moves = pvMoves;
      if ((score !== undefined || best) && !batchAnalyzing) {
        syncArrowDebounced();
        redraw();
      }
    } else if (!evalIsThreat && score !== undefined) {
      // Secondary PV line (MultiPV 2, 3, …).
      // Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts multiPv handling.
      const s = evalNodePly % 2 === 1 ? -score : score;
      const idx = pvIndex - 1; // pendingLines[1] = multipv 2, [2] = multipv 3, …
      if (!pendingLines[idx]) pendingLines[idx] = {};
      const pl = pendingLines[idx]!;
      if (isMate) { pl.mate = s; pl.cp = undefined; }
      else        { pl.cp = s;   pl.mate = undefined; }
      if (best) pl.best = best;
      if (pvMoves.length > 0) pl.moves = pvMoves;
      // Push secondary lines into currentEval.lines in real-time so renderPvBox
      // shows all lines during analysis — mirrors Lichess's progressive pv accumulation.
      currentEval.lines = pendingLines.slice(1).filter(Boolean) as EvalLine[];
      if (!batchAnalyzing) redraw();
    }
  } else if (parts[0] === 'bestmove' && parts[1] && parts[1] !== '(none)') {
    if (evalIsThreat) {
      // Threat eval complete — store best move and redraw
      threatEval.best = parts[1];
      evalIsThreat = false;
      syncArrow();
      redraw();
    } else {
      currentEval.best = parts[1];
      const stored: PositionEval = { ...currentEval }; // includes .lines set by secondary info handler
      pendingLines = [];
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
        syncArrowDebounced(); // bestmove finalizes — debounce cancels and draws immediately
        redraw();
        if (threatMode) evalThreatPosition(); // chain threat eval after normal eval
      }
    }
  }
}

protocol.onMessage(line => {
  if (line.trim() === 'readyok') {
    engineReady = true;
    if (pendingBatchOnReady) {
      pendingBatchOnReady = false;
      startBatchAnalysis();
    } else {
      evalCurrentPosition();
    }
    redraw(); // update button label: Loading → On
  } else {
    parseEngineLine(line);
  }
});

// Flip the active color in a FEN string (null-move trick for threat analysis).
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts threatMode position setup.
// En passant square is cleared since it becomes invalid after a null move.
function flipFenColor(fen: string): string {
  const parts = fen.split(' ');
  if (parts.length >= 2) parts[1] = parts[1] === 'w' ? 'b' : 'w';
  if (parts.length >= 4) parts[3] = '-'; // clear en passant
  return parts.join(' ');
}

function evalThreatPosition(): void {
  if (!engineEnabled || !engineReady || batchAnalyzing) return;
  threatEval   = {};
  evalIsThreat = true;
  protocol.stop();
  protocol.setPosition(flipFenColor(ctrl.node.fen));
  protocol.go(analysisDepth); // always 1 line — only the best move arrow is needed
}

// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts toggleThreatMode (keyboard 'x')
function toggleThreatMode(): void {
  threatMode = !threatMode;
  if (threatMode) {
    evalThreatPosition();
  } else {
    if (evalIsThreat) { protocol.stop(); evalIsThreat = false; }
    threatEval = {};
    syncArrow();
    redraw();
  }
}

function evalCurrentPosition(): void {
  if (batchAnalyzing) return; // batch owns the engine; ignore interactive requests
  if (!engineEnabled || !engineReady) return;
  // Abort any in-flight threat eval — it belongs to the previous position
  if (evalIsThreat) { protocol.stop(); evalIsThreat = false; }
  threatEval = {};
  const cached = evalCache.get(ctrl.node.id);
  // Use cache only when it already has enough PV lines for the current multiPv setting.
  // Batch analysis stores single-line evals (no .lines), so those always fall through
  // to a live engine search — matching Lichess's startCeval which always runs the engine.
  const cachedHasLines = (cached?.lines?.length ?? 0) >= multiPv - 1;
  if (cached && cachedHasLines) {
    currentEval = { ...cached };
    syncArrow();
    redraw();
    if (threatMode) evalThreatPosition();
    return;
  }
  // Cache miss or insufficient lines — start the engine.
  // Show whatever cached data exists immediately; suppress arrow flicker for ARROW_SETTLE_MS.
  currentEval  = cached ? { ...cached } : {};
  pendingLines = [];
  arrowSuppressUntil = Date.now() + ARROW_SETTLE_MS;
  syncArrow(); // clear stale arrows from previous position immediately
  evalNodeId       = ctrl.node.id;
  evalNodePly      = ctrl.node.ply;
  evalParentNodeId = ctrl.nodeList[ctrl.nodeList.length - 2]?.id ?? '';
  protocol.stop();
  protocol.setPosition(ctrl.node.fen);
  protocol.go(analysisDepth, multiPv);
}

/**
 * Enable the engine if needed, then start batch analysis.
 * If the engine is mid-init (enabled but not yet ready), queues the batch
 * via pendingBatchOnReady so it fires automatically on readyok.
 */
function startBatchWhenReady(): void {
  if (!engineEnabled) {
    pendingBatchOnReady = true;
    toggleEngine(); // sets engineEnabled, inits or resumes engine
    return;
  }
  if (!engineReady) {
    pendingBatchOnReady = true; // readyok will trigger startBatchAnalysis
    return;
  }
  startBatchAnalysis();
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

  batchQueue       = queue;
  batchDone        = 0;
  batchAnalyzing   = queue.length > 0;
  batchState       = queue.length > 0 ? 'analyzing' : 'complete';
  analysisRunning  = queue.length > 0;
  analysisComplete = queue.length === 0;
  redraw();

  if (queue.length > 0) evalBatchItem(queue[0]!);
}

function evalBatchItem(item: BatchItem): void {
  evalNodeId      = item.nodeId;
  evalNodePly     = item.nodePly;
  evalParentNodeId = item.parentNodeId;
  currentEval     = {};
  pendingLines    = [];
  protocol.stop();
  protocol.setPosition(item.fen);
  protocol.go(analysisDepth); // always MultiPV=1 for batch efficiency
}

/**
 * Determine which color the importing user played in a given game.
 * Matches white/black names against the known import usernames (case-insensitive).
 * Returns null if unknown (e.g. PGN paste with no username on record).
 */
function getUserColor(game: ImportedGame): 'white' | 'black' | null {
  const knownNames = [chesscomUsername, lichessUsername]
    .map(n => n.trim().toLowerCase())
    .filter(Boolean);
  if (knownNames.length === 0) return null;
  if (game.white && knownNames.includes(game.white.toLowerCase())) return 'white';
  if (game.black && knownNames.includes(game.black.toLowerCase())) return 'black';
  return null;
}

/**
 * Scan the analyzed mainline for significant missed wins by the user.
 * Mirrors the evalSwings logic in lichess-org/lila: ui/analyse/src/nodeFinder.ts,
 * with a ply-based phase gate to exclude endgame / time-scramble positions.
 *
 * Triggers on:
 *   1. Win-chance loss > MISSED_TACTIC_THRESHOLD for user's color, within MISSED_TACTIC_MAX_PLY
 *   2. Missed forced mate ≤ 3 (phase-agnostic — a forced mate is always a real miss)
 *
 * userColor null = check both colors (PGN paste / unknown importer).
 */
function detectMissedTactics(userColor: 'white' | 'black' | null): boolean {
  for (let i = 1; i < ctrl.mainline.length; i++) {
    const node   = ctrl.mainline[i]!;
    const parent = ctrl.mainline[i - 1]!;

    const isWhiteMove = node.ply % 2 === 1;
    const isUserMove  = userColor === null
      || (userColor === 'white' && isWhiteMove)
      || (userColor === 'black' && !isWhiteMove);
    if (!isUserMove) continue;

    const nodeEval   = evalCache.get(node.id);
    const parentEval = evalCache.get(parent.id);
    // Require both evals and a known engine best from the parent position
    if (!nodeEval || !parentEval || !parentEval.best) continue;

    // Condition 2 (checked first — phase-agnostic):
    // User had a forced mate in ≤ 3 available but didn't play it.
    // Mirrors: prev.eval.mate && !curr.eval.mate && Math.abs(prev.eval.mate) <= 3
    const userParentMate = isWhiteMove ? parentEval.mate : (parentEval.mate !== undefined ? -parentEval.mate : undefined);
    if (userParentMate !== undefined && userParentMate > 0 && userParentMate <= 3 && !nodeEval.mate) return true;

    // Phase gate: only opening + middlegame for the swing condition
    if (node.ply >= MISSED_TACTIC_MAX_PLY) continue;

    // Condition 1: significant win-chance loss for the user (Lichess evalSwings threshold)
    // nodeEval.loss is already the mover's perspective win-chance drop (positive = worse for mover)
    if (nodeEval.loss !== undefined && nodeEval.loss > MISSED_TACTIC_THRESHOLD) return true;
  }
  return false;
}

function advanceBatch(): void {
  batchDone++;
  void saveAnalysisToIdb('partial');
  redraw();
  if (batchDone < batchQueue.length) {
    evalBatchItem(batchQueue[batchDone]!);
  } else {
    batchAnalyzing   = false;
    batchState       = 'complete';
    analysisRunning  = false;
    analysisComplete = true;
    if (selectedGameId) {
      analyzedGameIds.add(selectedGameId);
      const game = importedGames.find(g => g.id === selectedGameId);
      const userColor = game ? getUserColor(game) : null;
      if (detectMissedTactics(userColor)) missedTacticGameIds.add(selectedGameId);
    }
    void saveAnalysisToIdb('complete');
    // Re-evaluate the current node interactively with the configured multiPv so PV
    // lines come back after batch. Batch always uses MultiPV=1 for efficiency, so
    // we drop the current node's cache entry and let evalCurrentPosition re-run it.
    evalCache.delete(ctrl.node.id);
    currentEval  = {};
    pendingLines = [];
    evalCurrentPosition();
  }
}

// Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts makeShapesFromUci + compute
// autoShapes is the programmatic layer — does not affect user-drawn shapes.
// Brush colors match Lichess exactly:
//   paleBlue = top engine line, paleGrey (scaled lineWidth) = secondary lines,
//   green = played move, red = threat.
function buildArrowShapes(): DrawShape[] {
  const shapes: DrawShape[] = [];

  if (engineEnabled && showEngineArrows) {
    // Top engine line — paleBlue (matches Lichess)
    if (currentEval.best) {
      const uci = currentEval.best;
      shapes.push({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'paleBlue' });
    }
    // Secondary PV lines — paleGrey with lineWidth scaled by win% diff (matches Lichess)
    // Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts compute()
    if (arrowAllLines) {
      const topWc = evalWinChances(currentEval) ?? 0;
      for (const line of currentEval.lines ?? []) {
        if (!line.best) continue;
        const lineWc = evalWinChances(line) ?? 0;
        const shift = Math.abs(topWc - lineWc) / 2; // povDiff equivalent
        if (shift >= 0.2) continue; // too weak — Lichess skips these
        const lineWidth = Math.max(2, Math.round(12 - shift * 50));
        const uci = line.best;
        shapes.push({
          orig: uci.slice(0, 2) as Key,
          dest: uci.slice(2, 4) as Key,
          brush: 'paleGrey',
          modifiers: { lineWidth },
        });
      }
    }
  }

  // Threat arrow — red (opponent best response, keyboard 'x')
  if (engineEnabled && threatMode && threatEval.best) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'red' });
  }

  // Played move arrow — pushed last so it always renders on top of engine arrows.
  // Uses solid red (opacity 1) at lineWidth 9 so it isn't color-blended by the
  // paleBlue engine arrow beneath; the wider paleBlue still shows as a visible border.
  if (showPlayedArrow) {
    const nextNode = ctrl.node.children[0];
    if (nextNode?.uci) {
      const uci = nextNode.uci;
      shapes.push({
        orig: uci.slice(0, 2) as Key,
        dest: uci.slice(2, 4) as Key,
        brush: 'red',
        modifiers: { lineWidth: 9 },
      });
    }
  }

  return shapes;
}

/**
 * Apply arrow shapes immediately (navigation, cache hits, engine off).
 * Called directly when we don't need the settling delay.
 */
function syncArrow(): void {
  if (!cgInstance) return;
  if (arrowDebounceTimer !== null) { clearTimeout(arrowDebounceTimer); arrowDebounceTimer = null; }
  arrowSuppressUntil = 0;
  cgInstance.set({ drawable: { autoShapes: buildArrowShapes() } });
}

/**
 * Apply arrow shapes after a settling delay — used during live engine search
 * to avoid flickering as the engine changes its mind on each depth iteration.
 * Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts (ARROW_SETTLE_MS).
 */
function syncArrowDebounced(): void {
  if (!cgInstance) return;
  const now = Date.now();
  if (now < arrowSuppressUntil) {
    // Still in the initial suppression window — schedule one deferred apply
    if (arrowDebounceTimer === null) {
      arrowDebounceTimer = setTimeout(() => {
        arrowDebounceTimer = null;
        arrowSuppressUntil = 0;
        cgInstance?.set({ drawable: { autoShapes: buildArrowShapes() } });
      }, arrowSuppressUntil - now);
    }
    return;
  }
  if (arrowDebounceTimer !== null) { clearTimeout(arrowDebounceTimer); }
  arrowDebounceTimer = setTimeout(() => {
    arrowDebounceTimer = null;
    cgInstance?.set({ drawable: { autoShapes: buildArrowShapes() } });
  }, 150); // 150 ms debounce — smooths out rapid depth updates
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
    currentEval  = {};
    evalIsThreat = false;
    threatEval   = {};
    syncArrow(); // clear arrows when engine turns off
  }
  redraw();
}

// --- Board sync ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts showGround / makeCgOpts
// Board state is updated directly via cgInstance.set() — never via Snabbdom re-render.
// The cg-wrap element is keyed so Snabbdom always reuses it rather than recreating it.

/**
 * Compute legal destinations for the current position.
 * Returns a Map<square, dest[]> suitable for Chessground movable.dests.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts makeCgOpts (dests computation)
 */
function computeDests(fen: string): Map<string, string[]> {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const dests = new Map<string, string[]>();
  for (const [from, tos] of pos.allDests()) {
    const toKeys: string[] = [];
    for (const to of tos) toKeys.push(makeSquare(to));
    if (toKeys.length > 0) dests.set(makeSquare(from), toKeys);
  }
  return dests;
}

/**
 * Convert a UCI move string to readable SAN given the position FEN.
 * Falls back to the raw UCI string if conversion fails for any reason.
 * Mirrors the SAN derivation used in lichess-org/lila: ui/lib/src/ceval/util.ts
 */
function uciToSan(fen: string, uci: string): string {
  try {
    const move = parseUci(uci);
    if (!move) return uci;
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    return makeSan(pos, move);
  } catch {
    return uci;
  }
}

/**
 * Handle a legal move played on the board.
 * If the move already exists as a child: navigate to it.
 * Otherwise: create a new variation node, add to tree, navigate.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts addNodeLocally + addNode
 */
function onUserMove(orig: string, dest: string): void {
  // Check existing children first — follow the tree if this move is already there
  const existingChild = ctrl.node.children.find(c => c.uci === orig + dest || c.uci?.startsWith(orig + dest));
  if (existingChild) {
    navigate(ctrl.path + existingChild.id);
    return;
  }

  // Detect pawn promotion — show dialog instead of auto-queening
  const setup = parseFen(ctrl.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq   = parseSquare(dest);
  if (fromSq === undefined || toSq === undefined) return;
  const piece = pos.board.get(fromSq);
  if (piece?.role === 'pawn' && ((pos.turn === 'white' && toSq >= 56) || (pos.turn === 'black' && toSq < 8))) {
    pendingPromotion = { orig, dest, color: pos.turn };
    redraw();
    return;
  }

  completeMove(orig, dest);
}

/**
 * Finalise a move (with optional promotion role) and add it to the tree.
 * Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts addNodeLocally
 */
function completeMove(orig: string, dest: string, promotion?: Role): void {
  const setup = parseFen(ctrl.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq = parseSquare(dest);
  if (fromSq === undefined || toSq === undefined) return;
  const move: NormalMove = { from: fromSq, to: toSq, promotion };
  const san = makeSanAndPlay(pos, move);
  const newNode: TreeNode = {
    id: scalachessCharPair(move),
    ply: ctrl.node.ply + 1,
    san,
    uci: makeUci(move),
    fen: makeFen(pos.toSetup()),
    children: [],
  };
  addNode(ctrl.root, ctrl.path, newNode);
  navigate(ctrl.path + newNode.id);
}

/**
 * Called when the user selects a piece in the promotion dialog.
 * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts PromotionCtrl.finish
 */
function completePromotion(role: Role): void {
  if (!pendingPromotion) return;
  const { orig, dest } = pendingPromotion;
  pendingPromotion = null;
  completeMove(orig, dest, role);
}

const PROMOTION_ROLES: Role[] = ['queen', 'knight', 'rook', 'bishop'];

/**
 * Renders the promotion piece-choice dialog overlaid on the board.
 * Positions itself at the destination column, stacking from the back rank.
 * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts renderPromotion
 */
function renderPromotionDialog(): VNode | null {
  if (!pendingPromotion) return null;
  const { dest, color } = pendingPromotion;
  const [file] = key2pos(dest as Key);
  // Column left% — same formula as Lichess
  const left = orientation === 'white' ? file * 12.5 : (7 - file) * 12.5;
  const vertical = color === orientation ? 'top' : 'bottom';

  // Wrap in .cg-wrap so Chessground's piece background-image CSS rules cascade in
  return h('div.cg-wrap.promotion-wrap', {
    on: { click: () => { pendingPromotion = null; syncBoard(); redraw(); } },
  }, [
    h('div#promotion-choice.' + vertical, {}, PROMOTION_ROLES.map((role, i) => {
      const top = (color === orientation ? i : 7 - i) * 12.5;
      return h('square', {
        attrs: { style: `top:${top}%;left:${left}%` },
        on: { click: (e: Event) => { e.stopPropagation(); completePromotion(role); } },
      }, [h(`piece.${role}.${color}`)]);
    })),
  ]);
}

function syncBoard(): void {
  if (!cgInstance) return;
  const node = ctrl.node;
  const dests = computeDests(node.fen);
  cgInstance.set({
    fen: node.fen,
    lastMove: uciToMove(node.uci),
    turnColor: node.ply % 2 === 0 ? 'white' : 'black',
    movable: {
      color: node.ply % 2 === 0 ? 'white' : 'black',
      dests,
    },
  });
}

// --- Navigation ---
// Single navigation helper: every path change must go through here so that
// board, eval arrow, graph, and move list always stay in sync.
// Mirrors the userJump pattern in lichess-org/lila: ui/analyse/src/ctrl.ts

function navigate(path: string): void {
  ctrl.setPath(path);
  syncBoard();
  evalCurrentPosition(); // updates currentEval, arrow, and triggers threat eval if on
  void saveGamesToIdb();
  redraw();
  scrollActiveIntoView();
}

// Keep the active move visible in the move list after each navigation step.
// Mirrors lichess-org/lila: ui/analyse/src/view/moves.ts (tree scroll helper)
function scrollActiveIntoView(): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('.move.active')?.scrollIntoView({ block: 'nearest' });
  });
}

function next(): void {
  const child = ctrl.node.children[0];
  if (!child) return;
  navigate(ctrl.path + child.id);
}

function prev(): void {
  if (ctrl.path === '') return;
  navigate(pathInit(ctrl.path));
}

// Mirrors lichess-org/lila: ui/analyse/src/control.ts first / last
function first(): void {
  navigate('');
}

function last(): void {
  // Path to the final mainline node = all non-root node IDs concatenated
  navigate(ctrl.mainline.slice(1).reduce((acc, n) => acc + n.id, ''));
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
/** Pending pawn promotion — set when a pawn reaches the back rank, cleared after piece selection. */
let pendingPromotion: { orig: string; dest: string; color: 'white' | 'black' } | null = null;

// Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts (flip)
function flip(): void {
  orientation = orientation === 'white' ? 'black' : 'white';
  cgInstance?.set({ orientation });
  redraw();
}

// --- Material difference ---
// Adapted from lichess-org/lila: ui/lib/src/game/material.ts

type MaterialDiffSide = Record<Role, number>;
interface MaterialDiff { white: MaterialDiffSide; black: MaterialDiffSide; }

const ROLE_ORDER: Role[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const ROLE_POINTS: Record<string, number> = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, king: 0 };

function getMaterialDiff(fen: string): MaterialDiff {
  const diff: MaterialDiff = {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
  };
  const fenBoard = fen.split(' ')[0];
  const charToRole: Record<string, Role> = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
  for (const ch of fenBoard) {
    const lower = ch.toLowerCase();
    const role = charToRole[lower];
    if (!role) continue;
    const color: 'white' | 'black' = ch === lower ? 'black' : 'white';
    const opp = color === 'white' ? 'black' : 'white';
    if (diff[opp][role] > 0) diff[opp][role]--;
    else diff[color][role]++;
  }
  return diff;
}

function getMaterialScore(diff: MaterialDiff): number {
  return ROLE_ORDER.reduce((sum, role) => sum + (diff.white[role] - diff.black[role]) * ROLE_POINTS[role], 0);
}

/**
 * Renders captured pieces for one side as overlapping mono piece icons.
 * Adapted from lichess-org/lila: ui/lib/src/game/view/material.ts renderMaterialDiff
 * Uses mono SVG piece images (public/piece/mono/) — no .cg-wrap scope needed.
 */
function renderMaterialPieces(diff: MaterialDiff, color: 'white' | 'black', score: number): VNode {
  const groups: VNode[] = [];
  for (const role of ROLE_ORDER) {
    const count = diff[color][role];
    if (count <= 0) continue;
    const pieces: VNode[] = [];
    for (let i = 0; i < count; i++) pieces.push(h('mpiece.' + role));
    groups.push(h('div', pieces));
  }
  return h('div.material', [
    ...groups,
    score > 0 ? h('score', '+' + score) : null,
  ]);
}

/**
 * Format centiseconds as M:SS or H:MM:SS, matching Lichess clockContent.
 * Adapted from lichess-org/lila: ui/analyse/src/view/clocks.ts
 */
function formatClock(centis: number): string {
  const totalSecs = Math.floor(centis / 100);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n: number) => n < 10 ? '0' + n : String(n);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Walk the nodeList to find the most recent clock for each color.
 * node.clock stores the time remaining AFTER the move at that node.
 * White moves are at odd plies, black moves at even plies (ply 1 = white's first).
 * Adapted from lichess-org/lila: ui/analyse/src/view/clocks.ts renderClocks
 */
function getClocksAtPath(): { white: number | undefined; black: number | undefined } {
  const nodes = ctrl.nodeList;
  let white: number | undefined;
  let black: number | undefined;
  // Walk from most recent backwards so we get the closest available clock
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.clock === undefined) continue;
    // ply 1 = white moved, ply 2 = black moved, etc.
    if (n.ply % 2 === 1 && white === undefined) white = n.clock;
    if (n.ply % 2 === 0 && n.ply > 0 && black === undefined) black = n.clock;
    if (white !== undefined && black !== undefined) break;
  }
  return { white, black };
}

// Adapted from lichess-org/lila: ui/analyse/src/view/components.ts renderPlayerStrips
// Layout: [result] [color-dot] [name] [material] ... [clock]
// Result badge on left, clock on right — matching Lichess analyse__player_strip.
function renderPlayerStrips(): [VNode, VNode] {
  const game = importedGames.find(g => g.id === selectedGameId);
  const whiteName = game?.white ?? 'White';
  const blackName = game?.black ?? 'Black';
  const result    = game?.result ?? '*';

  const diff   = getMaterialDiff(ctrl.node.fen);
  const score  = getMaterialScore(diff);
  const clocks = getClocksAtPath();

  const whiteResult = result === '1-0' ? '1' : result === '0-1' ? '0' : result === '1/2-1/2' ? '½' : null;
  const blackResult = result === '0-1' ? '1' : result === '1-0' ? '0' : result === '1/2-1/2' ? '½' : null;

  const strip = (color: 'white' | 'black'): VNode => {
    const name     = color === 'white' ? whiteName : blackName;
    const badge    = color === 'white' ? whiteResult : blackResult;
    const winner   = (color === 'white' && result === '1-0') || (color === 'black' && result === '0-1');
    const matScore = color === 'white' ? score : -score;
    const centis   = color === 'white' ? clocks.white : clocks.black;
    return h('div.analyse__player_strip', [
      badge ? h('span.player-strip__result', { class: { 'player-strip__result--winner': winner } }, badge) : null,
      h('span.player-strip__color-icon', { class: { 'player-strip__color-icon--white': color === 'white', 'player-strip__color-icon--black': color === 'black' } }),
      h('span.player-strip__name', name),
      renderMaterialPieces(diff, color, matScore > 0 ? matScore : 0),
      centis !== undefined ? h('div.analyse__clock', formatClock(centis)) : null,
    ]);
  };

  const topColor    = orientation === 'white' ? 'black' : 'white';
  const bottomColor = orientation === 'white' ? 'white' : 'black';
  return [strip(topColor), strip(bottomColor)];
}

// Adapted from lichess-org/lila: ui/analyse/src/ground.ts render + makeConfig
function renderBoard(): VNode {
  return h('div.cg-wrap', {
    key: 'board',
    hook: {
      insert: vnode => {
        const node = ctrl.node;
        const dests = computeDests(node.fen);
        cgInstance = makeChessground(vnode.elm as HTMLElement, {
          orientation,
          viewOnly: false,
          drawable: {
            enabled: true,
            brushes: {
              // Boost paleBlue opacity from default 0.4 → 0.65 for a bolder engine line
              paleBlue: { key: 'pb', color: '#003088', opacity: 0.65, lineWidth: 15 },
            },
          },
          fen: node.fen,
          lastMove: uciToMove(node.uci),
          turnColor: node.ply % 2 === 0 ? 'white' : 'black',
          movable: {
            free: false,
            color: node.ply % 2 === 0 ? 'white' : 'black',
            dests,
            showDests: true,
          },
          events: {
            move: onUserMove,
          },
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

// --- Analysis accuracy summary ---
// Adapted from lichess-org/lila: modules/analyse/src/main/AccuracyPercent.scala
//
// Per-move accuracy uses the exponential decay curve fit to win-percent loss.
// Game accuracy = (volatility-weighted mean + harmonic mean) / 2.
// Both formulas match Lichess exactly — see AccuracyPercent.scala for derivation.

/**
 * Per-move accuracy from a win-percent diff (mover's perspective).
 * diff > 0 = mover lost advantage; diff < 0 = mover improved.
 * Matches lichess-org/lila: modules/analyse/src/main/AccuracyPercent.scala fromWinPercentDiff
 */
function moveAccuracyFromDiff(diff: number): number {
  if (diff < 0) return 100; // improvement → perfect
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) + -3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

interface PlayerSummary {
  accuracy: number | null;
  blunders:     number;
  mistakes:     number;
  inaccuracies: number;
}

interface AnalysisSummary {
  white: PlayerSummary;
  black: PlayerSummary;
}

/**
 * Aggregate per-move accuracy into a game accuracy figure.
 * Matches lichess-org/lila: modules/analyse/src/main/AccuracyPercent.scala gameAccuracy.
 * window = max(2, min(8, floor(n/10)));  weights = stdDev per sliding window, clamped [0.5, 12].
 * Result = (volatility-weighted mean + harmonic mean) / 2, clamped [0, 100].
 */
function aggregateAccuracy(accs: number[]): number | null {
  const n = accs.length;
  if (n < 2) return null;

  const window = Math.max(2, Math.min(8, Math.floor(n / 10)));

  // Sliding window std devs — moves.sliding(window) in Lichess produces n-window+1 entries.
  const weights: number[] = [];
  for (let s = 0; s + window <= n; s++) {
    const slice = accs.slice(s, s + window);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    weights.push(Math.max(0.5, Math.min(12, Math.sqrt(variance))));
  }

  // Lichess zip truncates to the shorter sequence (n - window + 1 pairs)
  const pairLen = weights.length;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < pairLen; i++) {
    weightedSum += accs[i]! * weights[i]!;
    totalWeight += weights[i]!;
  }
  const weightedMean = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Harmonic mean uses all n moves (Lichess: moves.size / moves.map(1/a).sum)
  const harmonicMean = n / accs.reduce((acc, a) => acc + 1 / Math.max(a, 0.001), 0);

  return Math.max(0, Math.min(100, (weightedMean + harmonicMean) / 2));
}

function computeAnalysisSummary(): AnalysisSummary | null {
  if (evalCache.size === 0) return null;

  const whiteAccs: number[] = [];
  const blackAccs: number[] = [];
  let wBlunders = 0, wMistakes = 0, wInaccuracies = 0;
  let bBlunders = 0, bMistakes = 0, bInaccuracies = 0;

  for (let i = 1; i < ctrl.mainline.length; i++) {
    const node   = ctrl.mainline[i]!;
    const parent = ctrl.mainline[i - 1]!;

    const nodeEval   = evalCache.get(node.id);
    const parentEval = evalCache.get(parent.id);
    if (!nodeEval || !parentEval) continue;

    const nodeWc   = evalWinChances(nodeEval);
    const parentWc = evalWinChances(parentEval);
    if (nodeWc === undefined || parentWc === undefined) continue;

    // Convert win-chance [-1,1] → win-percent [0,100] (white perspective)
    const nodeWp   = (nodeWc   + 1) / 2 * 100;
    const parentWp = (parentWc + 1) / 2 * 100;

    const isWhiteMove = node.ply % 2 === 1;

    // diff = mover's advantage before move - mover's advantage after move
    // White: loses advantage when nodeWp < parentWp → diff = parentWp - nodeWp
    // Black: loses advantage when nodeWp > parentWp → diff = nodeWp - parentWp
    // Matches lichess-org/lila: AccuracyPercent.scala color.fold((prev,next),(next,prev))
    const diff = isWhiteMove ? (parentWp - nodeWp) : (nodeWp - parentWp);
    const acc  = moveAccuracyFromDiff(diff);

    if (isWhiteMove) {
      whiteAccs.push(acc);
    } else {
      blackAccs.push(acc);
    }

    // Count move labels using the same best-move-played short-circuit as renderMoveList
    const playedBest = node.uci !== undefined && node.uci === parentEval.best;
    const label = (!playedBest && nodeEval.loss !== undefined) ? classifyLoss(nodeEval.loss) : null;
    if (isWhiteMove) {
      if (label === 'blunder') wBlunders++;
      else if (label === 'mistake') wMistakes++;
      else if (label === 'inaccuracy') wInaccuracies++;
    } else {
      if (label === 'blunder') bBlunders++;
      else if (label === 'mistake') bMistakes++;
      else if (label === 'inaccuracy') bInaccuracies++;
    }
  }

  if (whiteAccs.length === 0 && blackAccs.length === 0) return null;

  return {
    white: { accuracy: aggregateAccuracy(whiteAccs), blunders: wBlunders, mistakes: wMistakes, inaccuracies: wInaccuracies },
    black: { accuracy: aggregateAccuracy(blackAccs), blunders: bBlunders, mistakes: bMistakes, inaccuracies: bInaccuracies },
  };
}

function renderAnalysisSummary(): VNode {
  // Only show once there's enough eval data to be meaningful
  if (!analysisComplete && evalCache.size < 4) return h('div');

  const summary = computeAnalysisSummary();
  if (!summary) return h('div');

  const game = importedGames.find(g => g.id === selectedGameId);
  const whiteName = game?.white ?? 'White';
  const blackName = game?.black ?? 'Black';

  function playerCol(name: string, data: PlayerSummary, color: 'white' | 'black'): VNode {
    const accText = data.accuracy !== null ? `${Math.round(data.accuracy)}%` : '—';
    const breakdown: VNode[] = [];
    if (data.blunders     > 0) breakdown.push(h('span.summary__blunder',     `${data.blunders} blunder${data.blunders !== 1 ? 's' : ''}`));
    if (data.mistakes     > 0) breakdown.push(h('span.summary__mistake',     `${data.mistakes} mistake${data.mistakes !== 1 ? 's' : ''}`));
    if (data.inaccuracies > 0) breakdown.push(h('span.summary__inaccuracy',  `${data.inaccuracies} inaccurac${data.inaccuracies !== 1 ? 'ies' : 'y'}`));
    return h('div.summary__col', [
      h('div.summary__name', [
        h('span.summary__color-icon', { class: { 'summary__color-icon--white': color === 'white', 'summary__color-icon--black': color === 'black' } }),
        name,
      ]),
      h('div.summary__accuracy', accText),
      breakdown.length > 0 ? h('div.summary__breakdown', breakdown) : h('div.summary__breakdown', '—'),
    ]);
  }

  return h('div.analysis-summary', [
    playerCol(whiteName, summary.white, 'white'),
    playerCol(blackName, summary.black, 'black'),
  ]);
}

// --- Move list (tree view) ---
// Adapted from lichess-org/lila: ui/analyse/src/treeView/inlineView.ts
//
// Renders the full move tree with mainline and inline side variations.
// Mainline = children[0] at every level; variations = children[1+].
// Each variation is wrapped in parens: ( 1...c5 2. Nf3 )
// After a variation block, the mainline black move shows an explicit "N…" index.

/** One clickable move span, with eval label if applicable. */
// Glyph symbol → CSS color, matching Lichess move annotation colors
const GLYPH_COLORS: Record<string, string> = {
  '??': '#f66', '?': '#f84', '?!': '#fa4',
  '!!': '#5af', '!': '#8cf', '!?': '#aaa',
};

function renderMoveSpan(node: TreeNode, path: TreePath, parent: TreeNode): VNode {
  const cached       = evalCache.get(node.id);
  const parentCached = evalCache.get(parent.id);

  // PGN glyphs take priority; fall back to engine-computed label if no glyph present.
  // Mirrors lichess-org/lila: ui/analyse/src/treeView/inlineView.ts moveNode
  const pgnGlyph = node.glyphs?.[0];
  const playedBest = node.uci !== undefined && node.uci === parentCached?.best;
  const computedLabel = (!playedBest && cached?.loss !== undefined) ? classifyLoss(cached.loss) : null;
  const computedSymbol = computedLabel === 'blunder' ? '??' : computedLabel === 'mistake' ? '?' : computedLabel === 'inaccuracy' ? '?!' : null;

  const symbol = pgnGlyph?.symbol ?? computedSymbol;
  const color  = symbol ? (GLYPH_COLORS[symbol] ?? '#aaa') : undefined;

  return h('span.move', {
    class: { active: path === ctrl.path },
    on: { click: () => navigate(path) },
  }, symbol ? [
    node.san ?? '',
    h('span.move__glyph', { attrs: { style: `color:${color}` } }, symbol),
  ] : (node.san ?? ''));
}

/**
 * Recursively render a node and its full continuation.
 *
 * needsMoveNum — caller sets true at the start of a variation or after any
 * inline variation block so that a black move gets an explicit "N…" prefix.
 *
 * Mirrors the rendering logic of lichess-org/lila:
 *   ui/analyse/src/treeView/inlineView.ts renderNodes / moveNode
 */
function renderNodeLine(node: TreeNode, path: TreePath, parent: TreeNode, needsMoveNum: boolean): VNode[] {
  const out: VNode[] = [];

  // Move index: always before white's move; before black's if explicitly requested
  if (needsMoveNum || node.ply % 2 === 1) {
    const n = Math.ceil(node.ply / 2);
    out.push(h('span.move-num', node.ply % 2 === 1 ? `${n}.` : `${n}…`));
  }

  out.push(renderMoveSpan(node, path, parent));

  const [mainChild, ...varChildren] = node.children;

  // Inline variation blocks: children[1+] at this position
  // Mirrors lichess-org/lila: ui/analyse/src/treeView/inlineView.ts lines()
  for (const varChild of varChildren) {
    const varPath = path + varChild.id;
    const varContent = renderNodeLine(varChild, varPath, node, true);
    out.push(h('span', {
      attrs: { style: 'color:#666;font-size:0.9em;margin:0 2px' },
    }, ['( ', ...varContent, ' )']));
  }

  // Mainline continuation: after any variation block a black move needs "N…"
  if (mainChild) {
    const mainPath = path + mainChild.id;
    const contNeedsNum = varChildren.length > 0 && mainChild.ply % 2 === 0;
    out.push(...renderNodeLine(mainChild, mainPath, node, contNeedsNum));
  }

  return out;
}

function renderMoveList(): VNode {
  const firstChild = ctrl.root.children[0];
  if (!firstChild) return h('div.move-list');
  return h('div.move-list', renderNodeLine(firstChild, firstChild.id, ctrl.root, true));
}

// --- Eval bar ---
// Adapted from lichess-org/lila: ui/analyse/src/view/ (evaluation bar)

function evalPct(): number {
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

// --- Evaluation graph ---
// Adapted from lichess-org/lila: ui/chart/src/acpl.ts (concept)
// Pure SVG, no charting library. X = move index, Y = white-perspective win chances.
// Data source: evalCache (same normalized white-perspective values used for labels).

const GRAPH_W = 600;
const GRAPH_H = 80;

function renderEvalGraph(): VNode {
  const mainline = ctrl.mainline;
  const n = mainline.length - 1; // non-root move count

  if (n < 2) {
    return h('div.eval-graph', [
      h('div.eval-graph__empty', n === 0 ? 'No moves to graph.' : 'Analyze game to see graph.'),
    ]);
  }

  interface Pt { x: number; y: number; path: string; label: MoveLabel | null; }

  const pts: (Pt | null)[] = [];
  let path = '';
  for (let i = 1; i <= n; i++) {
    const node   = mainline[i]!;
    const parent = mainline[i - 1]!;
    path += node.id;
    const cached       = evalCache.get(node.id);
    const parentCached = evalCache.get(parent.id);
    const wc = cached !== undefined ? evalWinChances(cached) : undefined;
    if (wc !== undefined) {
      const playedBest = node.uci !== undefined && node.uci === parentCached?.best;
      const label = (!playedBest && cached?.loss !== undefined) ? classifyLoss(cached.loss) : null;
      pts.push({
        x: ((i - 1) / (n - 1)) * GRAPH_W,
        y: ((1 - wc) / 2) * GRAPH_H, // wc=+1 → top, wc=0 → middle, wc=−1 → bottom
        path,
        label,
      });
    } else {
      pts.push(null);
    }
  }

  const valid = pts.filter((p): p is Pt => p !== null);

  if (valid.length < 2) {
    return h('div.eval-graph', [
      h('div.eval-graph__empty', 'Analyze game to see graph.'),
    ]);
  }

  const cy = GRAPH_H / 2;
  const svgNodes: VNode[] = [];

  // Background: upper half = white territory, lower half = black territory
  svgNodes.push(h('rect', { attrs: { x: 0, y: 0, width: GRAPH_W, height: cy, fill: 'rgba(235,225,180,0.07)' } }));
  svgNodes.push(h('rect', { attrs: { x: 0, y: cy, width: GRAPH_W, height: cy, fill: 'rgba(0,0,0,0.2)' } }));

  // Filled polygon: eval trace closed at the center line
  const polyPts = [
    `${valid[0]!.x},${cy}`,
    ...valid.map(p => `${p.x},${p.y}`),
    `${valid[valid.length - 1]!.x},${cy}`,
  ].join(' ');
  svgNodes.push(h('polygon', { attrs: { points: polyPts, fill: 'rgba(160,160,160,0.1)', stroke: 'none' } }));

  // Center line (eval = 0)
  svgNodes.push(h('line', { attrs: { x1: 0, y1: cy, x2: GRAPH_W, y2: cy, stroke: '#444', 'stroke-width': 1 } }));

  // Eval trace
  svgNodes.push(h('polyline', { attrs: {
    points: valid.map(p => `${p.x},${p.y}`).join(' '),
    fill: 'none',
    stroke: '#888',
    'stroke-width': 1.5,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  } }));

  // Vertical bar at current move (drawn before dots so dots render on top)
  const curPt = valid.find(p => p.path === ctrl.path);
  if (curPt) {
    svgNodes.push(h('line', { attrs: {
      x1: curPt.x, y1: 0, x2: curPt.x, y2: GRAPH_H,
      stroke: '#4a8', 'stroke-width': 1, opacity: '0.55',
    } }));
  }

  // Click strips (wider target than the dot) + dots
  for (const pt of valid) {
    const capturePath = pt.path;
    const isCurrent = pt.path === ctrl.path;

    // Invisible wide strip for easier clicking
    svgNodes.push(h('rect', {
      attrs: { x: pt.x - 5, y: 0, width: 10, height: GRAPH_H, fill: 'transparent' },
      on: { click: () => navigate(capturePath) },
    }));

    // Visible dot — colored by move classification, current position overrides to green
    const dotColor = isCurrent ? '#4a8'
      : pt.label === 'blunder'     ? '#f66'
      : pt.label === 'mistake'     ? '#f84'
      : pt.label === 'inaccuracy'  ? '#fa4'
      : '#888';
    const dotR = isCurrent ? 3.5 : pt.label ? 2.5 : 2;
    svgNodes.push(h('circle', { attrs: {
      cx: pt.x, cy: pt.y,
      r: dotR,
      fill: dotColor,
      stroke: isCurrent ? '#fff' : 'none',
      'stroke-width': 1,
    } }));
  }

  return h('div.eval-graph', [
    h('svg', { attrs: {
      viewBox: `0 0 ${GRAPH_W} ${GRAPH_H}`,
      width: '100%',
      height: GRAPH_H,
      preserveAspectRatio: 'none',
    } }, svgNodes),
  ]);
}

// --- Eval display ---
// Adapted from lichess-org/lila: ui/lib/src/ceval/util.ts renderEval
// Score is always from white's perspective (positive = white winning).

/** Format centipawns as +0.8 / -1.2 / #3 / #-3. Matches Lichess renderEval util. */
function formatScore(ev: PositionEval): string {
  if (ev.mate !== undefined) {
    // Positive mate = white mates, negative = black mates (white perspective)
    return ev.mate > 0 ? `#${ev.mate}` : `#${ev.mate}`;
  }
  if (ev.cp !== undefined) {
    // Round to 1 decimal, cap at ±99 — mirrors lichess-org/lila: ui/lib/src/ceval/util.ts
    const e = Math.max(Math.min(Math.round(ev.cp / 10) / 10, 99), -99);
    return (e > 0 ? '+' : '') + e.toFixed(1);
  }
  return '…';
}

function renderEval(): VNode {
  if (!engineEnabled) return h('div.ceval-box.ceval-box--off');

  const score = formatScore(currentEval);
  const isPositive = currentEval.cp !== undefined
    ? currentEval.cp > 0
    : currentEval.mate !== undefined
      ? currentEval.mate > 0
      : null;

  const computing = !currentEval.cp && currentEval.mate === undefined && engineReady;

  return h('div.ceval-box', [
    h('span.ceval__score', {
      class: { 'ceval__score--white': isPositive === true, 'ceval__score--black': isPositive === false },
    }, computing ? '…' : score),
    currentEval.best
      ? h('span.ceval__best', uciToSan(ctrl.node.fen, currentEval.best))
      : engineReady
        ? h('span.ceval__info', batchAnalyzing ? `Analyzing ${batchDone}/${batchQueue.length}…` : '')
        : h('span.ceval__info', 'Loading engine…'),
  ]);
}

/**
 * Render a PV move sequence as SAN spans with move-number prefixes.
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvMoves
 */
function renderPvMoves(fen: string, moves: string[]): VNode[] {
  const MAX_PV_MOVES = 12;
  try {
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    const vnodes: VNode[] = [];
    for (let i = 0; i < Math.min(moves.length, MAX_PV_MOVES); i++) {
      if (pos.turn === 'white') {
        vnodes.push(h('span.pv-num', `${pos.fullmoves}.`));
      } else if (i === 0) {
        vnodes.push(h('span.pv-num', `${pos.fullmoves}…`));
      }
      const uci = moves[i]!;
      const move = parseUci(uci);
      if (!move) break;
      const san = makeSanAndPlay(pos, move);
      if (san === '--') break;
      // Store FEN + UCI on each move so hover can preview the resulting position.
      // Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvMoves
      const boardFen = makeFen(pos.toSetup());
      vnodes.push(h('span.pv-san', { key: `${i}|${uci}`, attrs: { 'data-board': `${boardFen}|${uci}` } }, san));
    }
    return vnodes;
  } catch {
    return [];
  }
}

/**
 * Render the PV lines box below the eval bar.
 * When MultiPV > 1: shows score + moves for each line.
 * When MultiPV = 1: shows just the primary move sequence (no score — already shown above).
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvs + renderPv
 */
function renderPvBox(): VNode | null {
  if (!engineEnabled) return null;
  const primaryMoves = currentEval.moves ?? [];
  const secondaryLines = currentEval.lines ?? [];
  if (primaryMoves.length === 0 && secondaryLines.length === 0) return null;

  const fen = ctrl.node.fen;

  function pvRow(ev: EvalLine | PositionEval, showScore: boolean): VNode {
    const score = formatScore(ev);
    const isPositive = ev.cp !== undefined ? ev.cp > 0 : ev.mate !== undefined ? ev.mate > 0 : null;
    const pvNodes = ev.moves ? renderPvMoves(fen, ev.moves) : [];
    return h('div.pv', [
      showScore
        ? h('strong', {
            class: { 'pv__score--white': isPositive === true, 'pv__score--black': isPositive === false },
          }, score)
        : null,
      ...pvNodes,
    ]);
  }

  const showScore = multiPv > 1;
  const rows: VNode[] = [];
  if (primaryMoves.length > 0) rows.push(pvRow(currentEval, showScore));
  for (const line of secondaryLines) {
    if (line.moves?.length) rows.push(pvRow(line, showScore));
  }

  if (rows.length === 0) return null;

  // Attach hover listeners imperatively to avoid per-move re-registration overhead.
  // mousemove updates the floating overlay position directly (no redraw) for smoothness.
  // Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvs hook
  return h('div.pv_box', {
    hook: {
      insert: (vnode) => {
        const el = vnode.elm as HTMLElement;
        el.addEventListener('mouseover', (e: MouseEvent) => {
          const dataBoard = (e.target as HTMLElement).dataset.board;
          if (!dataBoard) return;
          const sep = dataBoard.indexOf('|');
          const newFen = dataBoard.slice(0, sep);
          const newUci = dataBoard.slice(sep + 1);
          pvBoardPos = { x: e.clientX, y: e.clientY };
          if (pvBoard?.fen === newFen && pvBoard?.uci === newUci) return;
          pvBoard = { fen: newFen, uci: newUci };
          redraw();
        });
        el.addEventListener('mousemove', (e: MouseEvent) => {
          pvBoardPos = { x: e.clientX, y: e.clientY };
          // Update position directly on DOM to avoid Snabbdom redraw per-frame.
          const overlay = document.querySelector<HTMLElement>('.pv-board-float');
          if (overlay) {
            const left = Math.min(e.clientX + 16, window.innerWidth - 208);
            const top  = Math.min(e.clientY + 16, window.innerHeight - 208);
            overlay.style.left = `${left}px`;
            overlay.style.top  = `${top}px`;
          }
        });
        el.addEventListener('mouseleave', () => {
          if (!pvBoard) return;
          pvBoard = null;
          redraw();
        });
      },
    },
  }, rows);
}

/**
 * Floating PV board preview — fixed overlay near the mouse cursor.
 * Shown when hovering a pv-san span; hidden when pvBoard is null.
 * Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvBoard
 */
function renderPvBoard(): VNode | null {
  if (!pvBoard) return null;
  const { fen, uci } = pvBoard;
  const left = Math.min(pvBoardPos.x + 16, window.innerWidth - 208);
  const top  = Math.min(pvBoardPos.y + 16, window.innerHeight - 208);
  const arrow = uci.length >= 4
    ? [{ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'paleBlue' }]
    : [];
  const cgConfig = {
    fen,
    lastMove: uciToMove(uci),
    orientation,
    coordinates: false,
    viewOnly: true,
    drawable: { enabled: false, visible: true, autoShapes: arrow },
  };
  return h('div.pv-board-float', {
    key: 'pv-board-float',
    attrs: { style: `left:${left}px;top:${top}px` },
  }, [
    h('div.cg-wrap', {
      hook: {
        insert: (vnode) => {
          (vnode.elm as any)._cg = makeChessground(vnode.elm as HTMLElement, cgConfig);
        },
        update: (_old, vnode) => {
          (vnode.elm as any)._cg?.set(cgConfig);
        },
        destroy: (vnode) => {
          (vnode.elm as any)._cg?.destroy();
        },
      },
    }),
  ]);
}

/**
 * Engine settings panel — Lines (MultiPV) and Depth sliders.
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/settings.ts renderCevalSettings
 */
function renderEngineSettings(): VNode | null {
  if (!showEngineSettings) return null;
  return h('div.ceval-settings', [
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-multipv' } }, 'Lines'),
      h('input#ceval-multipv', {
        attrs: { type: 'range', min: 1, max: 5, step: 1, value: multiPv },
        on: {
          input: (e: Event) => {
            multiPv = parseInt((e.target as HTMLInputElement).value);
            pendingLines = [];
            // Re-evaluate current position with new MultiPV setting
            if (engineEnabled && engineReady && !batchAnalyzing) {
              currentEval = {};
              evalCurrentPosition();
            }
            redraw();
          },
        },
      }),
      h('span.ceval-settings__val', `${multiPv} / 5`),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-depth' } }, 'Depth'),
      h('input#ceval-depth', {
        attrs: { type: 'range', min: 8, max: 24, step: 1, value: analysisDepth },
        on: {
          input: (e: Event) => {
            analysisDepth = parseInt((e.target as HTMLInputElement).value);
            redraw();
          },
        },
      }),
      h('span.ceval-settings__val', String(analysisDepth)),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-arrows' } }, 'Arrows'),
      h('input#ceval-arrows', {
        attrs: { type: 'checkbox', checked: showEngineArrows },
        on: {
          change: (e: Event) => {
            showEngineArrows = (e.target as HTMLInputElement).checked;
            syncArrow();
            redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-arrow-lines' } }, 'All lines'),
      h('input#ceval-arrow-lines', {
        attrs: { type: 'checkbox', checked: arrowAllLines },
        on: {
          change: (e: Event) => {
            arrowAllLines = (e.target as HTMLInputElement).checked;
            syncArrow();
            redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-played-arrow' } }, 'Played'),
      h('input#ceval-played-arrow', {
        attrs: { type: 'checkbox', checked: showPlayedArrow },
        on: {
          change: (e: Event) => {
            showPlayedArrow = (e.target as HTMLInputElement).checked;
            syncArrow();
            redraw();
          },
        },
      }),
    ]),
  ]);
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
  ply:       number;        // ply of the mistake node (for move number display)
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
        ply:      node.ply,
      });
    }
  }
  puzzleCandidates = candidates;
  console.log('[puzzles] extracted', candidates.length, 'candidates', candidates);
  return candidates;
}

function renderAnalysisControls(): VNode {
  const canRun  = !batchAnalyzing && ctrl.mainline.length > 1;
  const hasGame = ctrl.mainline.length > 1;

  const statusText = analysisRunning
    ? `Analyzing… ${batchDone} / ${batchQueue.length}`
    : analysisComplete
      ? `Analysis complete (${batchDone} positions)`
      : 'Idle';

  return h('div.pgn-import', [
    h('div.pgn-import__row', [
      h('span', { attrs: { style: 'font-size:0.8rem;color:#888' } }, statusText),
    ]),
    h('div.pgn-import__row', [
      h('button', {
        attrs: { disabled: !canRun },
        on: { click: startBatchWhenReady },
      }, 'Analyze All'),
      h('button', {
        attrs: { disabled: !hasGame || batchAnalyzing },
        on: {
          click: () => {
            if (selectedGameId) {
              void clearAnalysisFromIdb(selectedGameId);
              analyzedGameIds.delete(selectedGameId);
              missedTacticGameIds.delete(selectedGameId);
            }
            evalCache.clear();
            currentEval = {};
            puzzleCandidates = [];
            batchQueue       = [];
            batchDone        = 0;
            batchAnalyzing   = false;
            batchState       = 'idle';
            analysisRunning  = false;
            analysisComplete = false;
            syncArrow();
            startBatchWhenReady();
          },
        },
      }, 'Re-analyze'),
      h('button', {
        attrs: { disabled: batchAnalyzing },
        on: {
          click: () => {
            evalCache.clear();
            currentEval = {};
            puzzleCandidates = [];
            analysisRunning  = false;
            analysisComplete = false;
            syncArrow();
            redraw();
          },
        },
      }, 'Clear Eval Cache'),
    ]),
  ]);
}

function renderPuzzleCandidates(): VNode {
  const canExtract = engineEnabled && !batchAnalyzing;
  const btnLabel = canExtract
    ? `Find Puzzles (${puzzleCandidates.length})`
    : batchAnalyzing ? 'Find Puzzles (analyzing…)' : 'Find Puzzles (engine off)';

  const rows = puzzleCandidates.map(c => {
    const moveNum  = Math.ceil(c.ply / 2);
    const side     = c.ply % 2 === 1 ? '' : '…';
    const heading  = `${moveNum}${side}. ${c.san}`;
    const lossText = `−${(c.loss * 100).toFixed(0)}%`;
    const isActive = ctrl.path === c.path;
    const isSaved  = savedPuzzles.some(p => p.gameId === c.gameId && p.path === c.path);
    return h('li', { attrs: { style: 'display:flex;align-items:center' } }, [
      h('button.game-list__row', {
        class: { active: isActive },
        attrs: { style: 'flex:1' },
        on: { click: () => navigate(c.path) },
      }, [
        h('span', { attrs: { style: 'font-weight:600;margin-right:8px' } }, heading),
        h('span', { attrs: { style: 'color:#f88;margin-right:8px' } }, lossText),
        h('span', { attrs: { style: 'color:#888;font-size:0.8rem' } }, `best: ${uciToSan(c.fen, c.bestMove)}`),
      ]),
      h('button', {
        attrs: {
          style: 'flex-shrink:0;padding:2px 8px;font-size:0.75rem;margin-left:4px;cursor:pointer',
          disabled: isSaved,
          title: isSaved ? 'Already saved' : 'Save this puzzle',
        },
        on: { click: () => { savePuzzle(c); } },
      }, isSaved ? '✓ Saved' : 'Save'),
    ]);
  });

  return h('div.game-list', { attrs: { style: 'max-width:600px' } }, [
    h('div.pgn-import__row', { attrs: { style: 'margin-bottom:6px' } }, [
      h('button', {
        attrs: { disabled: !canExtract },
        on: { click: () => { extractPuzzleCandidates(); redraw(); } },
      }, btnLabel),
    ]),
    puzzleCandidates.length > 0
      ? h('ul', rows)
      : h('div.game-list__header', batchState === 'complete'
          ? 'No blunder-level candidates found in this game.'
          : 'Run extraction after analysis completes.'),
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
      const isAnalyzed     = analyzedGameIds.has(game.id);
      const hasMissedTactic = missedTacticGameIds.has(game.id);
      return h('li', h('button.game-list__row', {
        class: { active: game.id === selectedGameId },
        on: { click: () => { selectedGameId = game.id; loadGame(game.pgn); } },
      }, [
        isAnalyzed    ? h('span', { attrs: { style: 'color:#4a8;margin-right:4px;font-size:0.8em', title: 'Analyzed' } }, '✓') : null,
        hasMissedTactic ? h('span', { attrs: { style: 'color:#f84;margin-right:6px;font-size:0.85em;font-weight:700', title: 'Missed tactic in opening/middlegame' } }, '!') : null,
        label,
      ]));
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
        renderPvBox(),
        renderEngineSettings(),
        h('div.controls', [
          h('button', { on: { click: prev }, attrs: { disabled: ctrl.path === '' } }, '← Prev'),
          h('button', { on: { click: flip } }, 'Flip Board'),
          h('button', { on: { click: next }, attrs: { disabled: !ctrl.node.children[0] } }, 'Next →'),
          h('button', { on: { click: toggleEngine }, class: { active: engineEnabled } },
            engineEnabled ? (engineReady ? 'Engine: On' : 'Engine: Loading…') : 'Engine: Off'
          ),
          h('button', {
            class: { active: showEngineSettings },
            attrs: { title: 'Engine settings' },
            on: { click: () => { showEngineSettings = !showEngineSettings; redraw(); } },
          }, '⚙'),
        ]),
        renderAnalysisControls(),
        h('div.analyse__board-wrap', [
          ...(engineEnabled ? [renderEvalBar()] : []),
          (() => {
            const [topStrip, bottomStrip] = renderPlayerStrips();
            return h('div.analyse__board', [topStrip, h('div.analyse__board-inner', [renderBoard(), renderPromotionDialog()]), bottomStrip]);
          })(),
        ]),
        renderEvalGraph(),
        renderAnalysisSummary(),
        renderMoveList(),
        renderPuzzleCandidates(),
        renderImportFilters(),
        renderChesscomImport(),
        renderLichessImport(),
        renderPgnImport(),
        renderGameList(),
        renderKeyboardHelp(),
      ]);
    case 'puzzles':  return h('h1', 'Puzzles Page');
    case 'openings': return h('h1', 'Openings Page');
    case 'stats':    return h('h1', 'Stats Page');
    default:         return h('h1', 'Home');
  }
}

/**
 * Dev utility: wipe all IndexedDB stores and reset in-memory state to defaults.
 * Reloads the page so the app boots clean.
 */
async function resetAllData(): Promise<void> {
  if (!confirm('Reset all data? This clears imported games, analysis, and puzzles.')) return;
  try {
    const db = await openGameDb();
    const tx = db.transaction(['game-library', 'puzzle-library', 'analysis-library'], 'readwrite');
    tx.objectStore('game-library').clear();
    tx.objectStore('puzzle-library').clear();
    tx.objectStore('analysis-library').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[reset] IDB clear failed', e);
  }
  window.location.reload();
}

function view(route: Route): VNode {
  return h('div#shell', [
    h('header', [
      h('span', 'Patzer Pro'),
      renderNav(route),
      h('button.dev-reset', { on: { click: () => void resetAllData() } }, 'Reset Data'),
    ]),
    h('main', [routeContent(route)]),
    renderPvBoard(),
  ]);
}

// --- Keyboard navigation ---
// --- Branch navigation ---
// Adapted from lichess-org/lila: ui/analyse/src/control.ts previousBranch / nextBranch

/**
 * Jump back to the nearest fork (a position with multiple children).
 * Mirrors lichess-org/lila: ui/analyse/src/control.ts previousBranch
 */
function previousBranch(): void {
  let path = pathInit(ctrl.path);
  while (path.length > 0) {
    const node = ctrl.nodeList.find(n => ctrl.path.startsWith(path) && path.length === ctrl.nodeList.indexOf(n) * 2);
    // Walk up until we find a parent with 2+ children
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
    if (parent && parent.children.length >= 2) { navigate(path); return; }
    path = pathInit(path);
  }
  navigate('');
}

/**
 * Jump forward to the next fork, following the current branch.
 * Mirrors lichess-org/lila: ui/analyse/src/control.ts nextBranch
 */
function nextBranch(): void {
  let path = ctrl.path;
  let node = ctrl.node;
  while (node.children.length === 1) {
    path += node.children[0].id;
    node = node.children[0];
  }
  if (node.children.length >= 2) navigate(path + node.children[0].id);
  else last(); // no fork ahead — go to end
}

/**
 * At the current fork, switch to the next sibling variation.
 * Mirrors lichess-org/lila: ui/analyse/src/keyboard.ts Shift+Down
 */
function nextSibling(): void {
  const parentPath = pathInit(ctrl.path);
  const parentNode = ctrl.nodeList[ctrl.nodeList.length - 2];
  if (!parentNode || parentNode.children.length < 2) return;
  const idx = parentNode.children.findIndex(c => c.id === ctrl.node.id);
  const next = parentNode.children[(idx + 1) % parentNode.children.length];
  navigate(parentPath + next.id);
}

/**
 * At the current fork, switch to the previous sibling variation.
 * Mirrors lichess-org/lila: ui/analyse/src/keyboard.ts Shift+Up
 */
function prevSibling(): void {
  const parentPath = pathInit(ctrl.path);
  const parentNode = ctrl.nodeList[ctrl.nodeList.length - 2];
  if (!parentNode || parentNode.children.length < 2) return;
  const idx = parentNode.children.findIndex(c => c.id === ctrl.node.id);
  const prev = parentNode.children[(idx - 1 + parentNode.children.length) % parentNode.children.length];
  navigate(parentPath + prev.id);
}

/**
 * Play the engine's best move from the current position.
 * If the engine has a suggestion, add it to the tree and navigate to it.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts playBestMove
 */
function playBestMove(): void {
  const best = currentEval.best;
  if (!best || best.length < 4) return;
  const orig = best.slice(0, 2);
  const dest = best.slice(2, 4);
  const promotion = best.length > 4 ? best.slice(4) as Role : undefined;
  completeMove(orig, dest, promotion);
}

// --- Keyboard help overlay ---
let showKeyboardHelp = false;

function renderKeyboardHelp(): VNode | null {
  if (!showKeyboardHelp) return null;
  return h('div.keyboard-help', {
    on: { click: () => { showKeyboardHelp = false; redraw(); } },
  }, [
    h('div.keyboard-help__box', { on: { click: (e: Event) => e.stopPropagation() } }, [
      h('h2', 'Keyboard shortcuts'),
      h('table', [
        h('tbody', [
          ['←  /  →',      'Previous / next move'],
          ['↑  /  ↓',      'First / last move'],
          ['Shift + ←',    'Jump to previous fork'],
          ['Shift + →',    'Jump to next fork'],
          ['Shift + ↑↓',   'Switch variation at fork'],
          ['Space',        'Play engine best move'],
          ['l',            'Toggle engine'],
          ['a',            'Toggle engine arrows'],
          ['x',            'Toggle threat mode'],
          ['f',            'Flip board'],
          ['?',            'Show this help'],
        ].map(([key, desc]) => h('tr', [h('td', key as string), h('td', desc as string)]))),
      ]),
      h('button.keyboard-help__close', { on: { click: () => { showKeyboardHelp = false; redraw(); } } }, '✕'),
    ]),
  ]);
}

// Adapted from lichess-org/lila: ui/analyse/src/keyboard.ts
// C.1: a (arrows), l (engine), space (best move), ? (help), f (flip), x (threat)
// C.2: Shift+arrows for branch/sibling navigation
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.shiftKey) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); previousBranch(); redraw(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nextBranch(); redraw(); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); nextSibling(); redraw(); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); prevSibling(); redraw(); }
    return;
  }
  if (e.key === 'ArrowRight')     { next(); redraw(); }
  else if (e.key === 'ArrowLeft') { prev(); redraw(); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); first(); redraw(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); last(); redraw(); }
  else if (e.key === 'f' || e.key === 'F') flip();
  else if (e.key === 'x' || e.key === 'X') toggleThreatMode();
  else if (e.key === 'l' || e.key === 'L') toggleEngine();
  else if (e.key === 'a' || e.key === 'A') { showEngineArrows = !showEngineArrows; syncArrow(); redraw(); }
  else if (e.key === ' ') { e.preventDefault(); playBestMove(); }
  else if (e.key === '?') { showKeyboardHelp = !showKeyboardHelp; redraw(); }
});

// Mousewheel navigation over the board — scroll down = next move, up = prev move.
// Adapted from lichess-org/lila: ui/lib/src/view/controls.ts stepwiseScroll
// Pixel-mode (trackpad) accumulates delta and requires ≥10px before stepping,
// preventing accidental triggers on inertia scrolls.
let wheelPixelAccum = 0;
document.addEventListener('wheel', (e: WheelEvent) => {
  if (e.ctrlKey) return; // allow pinch-zoom
  const boardWrap = document.querySelector('.analyse__board-wrap');
  if (!boardWrap?.contains(e.target as Node)) return;
  e.preventDefault();
  if (e.deltaMode === 0) {
    // Pixel mode: accumulate until threshold to avoid over-triggering on trackpads
    wheelPixelAccum += e.deltaY;
    if (Math.abs(wheelPixelAccum) < 10) return;
  }
  wheelPixelAccum = 0;
  if (e.deltaY > 0) next();
  else prev();
  redraw();
}, { passive: false });

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

// --- Startup: restore persisted puzzles ---
void loadPuzzlesFromIdb().then(puzzles => { savedPuzzles = puzzles; });

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
  // Restore persisted engine analysis for this game
  void loadAndRestoreAnalysis(toLoad.id);
});
