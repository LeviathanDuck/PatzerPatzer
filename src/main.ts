import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { uciToMove } from '@lichess-org/chessground/util';
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
    // Route info into threat or normal eval
    const ev = evalIsThreat ? threatEval : currentEval;
    if (score !== undefined) {
      // Normalize to white's perspective: Stockfish reports from the SIDE-TO-MOVE's perspective.
      // At odd plies (black to move) the raw score is from black's POV — negate for white's POV.
      // Threat evals are skipped: we only use their .best UCI, not the score.
      // Mirrors the normalization Lichess applies when storing ceval.cp in tree nodes.
      const s = (!evalIsThreat && evalNodePly % 2 === 1) ? -score : score;
      if (isMate) { ev.mate = s; ev.cp = undefined; }
      else        { ev.cp = s;   ev.mate = undefined; }
    }
    if (best) ev.best = best;
    if ((score !== undefined || best) && !batchAnalyzing) {
      syncArrow();
      redraw();
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
  protocol.go(analysisDepth);
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
  if (cached) {
    currentEval = { ...cached };
    syncArrow();
    redraw();
    if (threatMode) evalThreatPosition(); // threat eval chains after cache hit too
    return;
  }
  evalNodeId = ctrl.node.id;
  evalNodePly = ctrl.node.ply;
  evalParentNodeId = ctrl.nodeList[ctrl.nodeList.length - 2]?.id ?? '';
  currentEval = {}; // reset for new position
  syncArrow();      // clear stale arrow immediately
  protocol.stop();
  protocol.setPosition(ctrl.node.fen);
  protocol.go(analysisDepth);
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
  protocol.stop();
  protocol.setPosition(item.fen);
  protocol.go(analysisDepth);
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
    syncArrow(); // restore arrow for current board position
    redraw();
  }
}

// Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts makeShapesFromUci
// autoShapes is the programmatic layer — does not affect user-drawn shapes.
// Blue = engine best move; Red = threat (opponent's best response, keyboard 'x').
function syncArrow(): void {
  if (!cgInstance) return;
  const shapes: DrawShape[] = [];
  if (engineEnabled && currentEval.best) {
    const uci = currentEval.best;
    shapes.push({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'paleBlue' });
  }
  if (engineEnabled && threatMode && threatEval.best) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'red' });
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

  // Build a new variation node from the current FEN
  const setup = parseFen(ctrl.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq = parseSquare(dest);
  if (fromSq === undefined || toSq === undefined) return;

  // Auto-promote to queen when a pawn reaches the back rank
  let promotion: Role | undefined;
  const piece = pos.board.get(fromSq);
  if (piece?.role === 'pawn') {
    if ((pos.turn === 'white' && toSq >= 56) || (pos.turn === 'black' && toSq < 8)) {
      promotion = 'queen';
    }
  }

  const move: NormalMove = { from: fromSq, to: toSq, promotion };
  const san = makeSanAndPlay(pos, move); // mutates pos to post-move state
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

// Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts (flip)
function flip(): void {
  orientation = orientation === 'white' ? 'black' : 'white';
  cgInstance?.set({ orientation });
  redraw();
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
          drawable: { enabled: true },
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

  function playerCol(name: string, data: PlayerSummary): VNode {
    const accText = data.accuracy !== null ? `${Math.round(data.accuracy)}%` : '—';
    const breakdown: VNode[] = [];
    if (data.blunders     > 0) breakdown.push(h('span.summary__blunder',     `${data.blunders} blunder${data.blunders !== 1 ? 's' : ''}`));
    if (data.mistakes     > 0) breakdown.push(h('span.summary__mistake',     `${data.mistakes} mistake${data.mistakes !== 1 ? 's' : ''}`));
    if (data.inaccuracies > 0) breakdown.push(h('span.summary__inaccuracy',  `${data.inaccuracies} inaccurac${data.inaccuracies !== 1 ? 'ies' : 'y'}`));
    return h('div.summary__col', [
      h('div.summary__name', name),
      h('div.summary__accuracy', accText),
      breakdown.length > 0 ? h('div.summary__breakdown', breakdown) : h('div.summary__breakdown', '—'),
    ]);
  }

  return h('div.analysis-summary', [
    playerCol(whiteName, summary.white),
    playerCol(blackName, summary.black),
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
function renderMoveSpan(node: TreeNode, path: TreePath, parent: TreeNode): VNode {
  const cached       = evalCache.get(node.id);
  const parentCached = evalCache.get(parent.id);
  // Mirrors lichess-org/lila: ui/analyse/src/practice/practiceCtrl.ts makeComment
  const playedBest = node.uci !== undefined && node.uci === parentCached?.best;
  const label = (!playedBest && cached?.loss !== undefined) ? classifyLoss(cached.loss) : null;
  return h('span.move', {
    class: { active: path === ctrl.path },
    on: { click: () => navigate(path) },
  }, label ? [
    node.san ?? '',
    h('span', { attrs: { style: `margin-left:3px;font-size:0.75em;color:${label === 'blunder' ? '#f66' : label === 'mistake' ? '#f84' : '#fa4'}` } }, label),
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
      ? h('span.ceval__best', `Best: ${uciToSan(ctrl.node.fen, currentEval.best)}`)
      : engineReady
        ? h('span.ceval__info', batchAnalyzing ? `Analyzing ${batchDone}/${batchQueue.length}…` : '')
        : h('span.ceval__info', 'Loading engine…'),
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

const DEPTH_OPTIONS = [8, 10, 12, 15, 18];

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
      h('span', { attrs: { style: 'color:#888;font-size:0.8rem' } }, 'Depth:'),
      ...DEPTH_OPTIONS.map(d =>
        h('button', {
          attrs: { style: analysisDepth === d ? FILTER_PILL_ACTIVE : FILTER_PILL_BASE },
          on: { click: () => { analysisDepth = d; redraw(); } },
        }, String(d))
      ),
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
        h('div.controls', [
          h('button', { on: { click: prev }, attrs: { disabled: ctrl.path === '' } }, '← Prev'),
          h('button', { on: { click: flip } }, 'Flip Board'),
          h('button', { on: { click: next }, attrs: { disabled: !ctrl.node.children[0] } }, 'Next →'),
          h('button', { on: { click: toggleEngine }, class: { active: engineEnabled } },
            engineEnabled ? (engineReady ? 'Engine: On' : 'Engine: Loading…') : 'Engine: Off'
          ),
        ]),
        renderAnalysisControls(),
        h('div.analyse__board-wrap', [
          ...(engineEnabled ? [renderEvalBar()] : []),
          h('div.analyse__board', [renderBoard()]),
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

// Keyboard navigation — mirrors lichess-org/lila: ui/analyse/src/keyboard.ts
// Left/Right: prev/next move; Up/Down: jump to start/end; X: toggle threat mode
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowRight')      next();
  else if (e.key === 'ArrowLeft')  prev();
  else if (e.key === 'ArrowUp')   { e.preventDefault(); first(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); last(); }
  else if (e.key === 'x' || e.key === 'X') flip();
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
