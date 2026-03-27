// Background bulk review queue.
// Manages a second independent Stockfish engine instance that analyzes games
// in the background without interfering with the live analysis engine.
// Each game in the queue has its own AnalyseCtrl and eval cache.

import { StockfishProtocol } from '../ceval/protocol';
import { AnalyseCtrl } from '../analyse/ctrl';
import { evalWinChances } from './winchances';
import { hasMissedMoments, detectMissedMoments, onMissedMomentConfigChange, getMissedMoments, setMissedMoments, clearMissedMoments, type MissedMoment } from './tactics';
import { computeAnalysisSummary } from '../analyse/evalView';
import { buildAnalysisNodes, saveAnalysisToIdb } from '../idb/index';
import { pgnToTree } from '../tree/pgn';
import { reviewDepth } from './batch';
import type { ImportedGame } from '../import/types';
import type { PositionEval } from './ctrl';

// --- Background engine instance ---
// Initialized lazily on first enqueueBulkReview call.
// Runs at Threads=1, Hash=32 to minimize CPU/memory competition with the live engine.

export const reviewProtocol = new StockfishProtocol({ threads: 1, hash: 32 });
let reviewEngineReady       = false;
let reviewEngineInitStarted = false;

// --- Types ---

export interface ReviewQueueEntry {
  game:   ImportedGame;
  ctrl:   AnalyseCtrl;
  cache:  Map<string, PositionEval>;
  done:   number;
  total:  number;
  status: 'pending' | 'analyzing' | 'complete' | 'error';
}

interface ReviewBatchItem {
  nodeId:     string;
  nodePly:    number;
  nodePath:   string;
  parentPath: string;
  fen:        string;
}

// --- Queue state ---

let queue:      ReviewQueueEntry[] = [];
let activeIndex = -1;
let queuePaused = false;

// --- Per-position engine state ---
// Mirrors the evalNodePath/currentEval/engineSearchActive pattern in engine/ctrl.ts.

let reviewCurrentEval:     PositionEval = {};
let reviewNodePath         = '';
let reviewNodePly          = 0;
let reviewParentPath       = '';
let reviewSearchActive     = false;
let reviewPendingStopCount = 0;
let reviewItemQueue:       ReviewBatchItem[] = [];
let reviewItemIndex        = 0;

// --- Injected deps (set via initReviewQueue) ---

let _analyzedGameIds:      Set<string>                                                 = new Set();
let _missedTacticGameIds:  Set<string>                                                 = new Set();
let _analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }> = new Map();
let _getUserColor:         (game: ImportedGame) => 'white' | 'black' | null            = () => null;
let _redraw:               () => void                                                   = () => {};


export function initReviewQueue(deps: {
  analyzedGameIds:      Set<string>;
  missedTacticGameIds:  Set<string>;
  analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }>;
  getUserColor:         (game: ImportedGame) => 'white' | 'black' | null;
  redraw:               () => void;
}): void {
  _analyzedGameIds      = deps.analyzedGameIds;
  _missedTacticGameIds  = deps.missedTacticGameIds;
  _analyzedGameAccuracy = deps.analyzedGameAccuracy;
  _getUserColor         = deps.getUserColor;
  _redraw               = deps.redraw;

  // Re-run missed-moment detection for all completed queue entries whenever
  // the detection config is changed via the Detection Settings menu.
  // Only covers games reviewed in the current session — IDB-restored games
  // from previous sessions are not in the queue and keep their stored result.
  onMissedMomentConfigChange(recomputeMissedTactics);
}

function recomputeMissedTactics(): void {
  // Only update entries that are in the current session's queue — IDB-restored
  // games are not present and their flags are left untouched.
  for (const entry of queue) {
    if (entry.status !== 'complete') continue;
    const userColor = _getUserColor(entry.game);
    const moments = detectMissedMoments(entry.ctrl.mainline, entry.cache, userColor);
    setMissedMoments(entry.game.id, moments);
    if (moments.length > 0) {
      _missedTacticGameIds.add(entry.game.id);
    } else {
      _missedTacticGameIds.delete(entry.game.id);
    }
  }
  _redraw();
}


// --- Background engine init ---

export async function initReviewEngine(baseUrl: string): Promise<void> {
  if (reviewEngineInitStarted) return;
  reviewEngineInitStarted = true;

  reviewProtocol.onMessage(line => {
    if (line.trim() === 'readyok') {
      reviewEngineReady = true;
      console.log('[review-engine] ready');
      // If a game is waiting for the engine, kick off its batch now.
      const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
      if (entry && entry.status === 'analyzing' && reviewItemQueue.length > 0) {
        sendNextItem();
      }
      return;
    }
    parseReviewLine(line);
  });

  await reviewProtocol.init(baseUrl);
}

// --- UCI line parser for the background engine ---
// Mirrors parseEngineLine in engine/ctrl.ts, single-PV only (batch always uses MultiPV=1).

function parseReviewLine(line: string): void {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === 'info') {
    let isMate = false;
    let score: number | undefined;
    let best:  string | undefined;
    let pvMoves: string[] = [];
    let pvIndex = 1;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'multipv') {
        const next = parts[i + 1];
        if (next === undefined) break;
        pvIndex = parseInt(next, 10);
        i++;
      } else if (parts[i] === 'score') {
        const scoreType  = parts[i + 1];
        const scoreValue = parts[i + 2];
        if (scoreType === undefined || scoreValue === undefined) break;
        isMate = scoreType === 'mate';
        score  = parseInt(scoreValue, 10);
        i += 2;
        if (parts[i + 1] === 'lowerbound' || parts[i + 1] === 'upperbound') i++;
      } else if (parts[i] === 'pv') {
        pvMoves = parts.slice(i + 1);
        best    = pvMoves[0];
        break;
      }
    }
    if (pvIndex === 1 && score !== undefined) {
      // Normalize to white perspective: odd ply = black to move, negate.
      const s = reviewNodePly % 2 === 1 ? -score : score;
      if (isMate) {
        reviewCurrentEval.mate = s;
        delete reviewCurrentEval.cp;
      } else {
        reviewCurrentEval.cp = s;
        delete reviewCurrentEval.mate;
      }
    }
    if (pvIndex === 1 && best) {
      reviewCurrentEval.best = best;
      reviewCurrentEval.moves = pvMoves;
    }
  } else if (parts[0] === 'bestmove') {
    if (reviewPendingStopCount > 0) {
      reviewPendingStopCount--;
      reviewCurrentEval = {};
      return;
    }
    reviewSearchActive = false;
    if (parts[1] && parts[1] !== '(none)') {
      reviewCurrentEval.best = parts[1];
    }
    onReviewBestmove();
  }
}

// --- Bestmove handler ---

function onReviewBestmove(): void {
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (!entry) return;

  const stored     = { ...reviewCurrentEval };
  const nodePath   = reviewNodePath;
  const nodePly    = reviewNodePly;
  const parentPath = reviewParentPath;

  if (stored.cp !== undefined || stored.mate !== undefined) {
    const parentEval = entry.cache.get(parentPath);
    if (parentEval?.cp !== undefined && stored.cp !== undefined) {
      stored.delta = stored.cp - parentEval.cp;
    }
    if (parentEval) {
      const nodeWc   = evalWinChances(stored);
      const parentWc = evalWinChances(parentEval);
      if (nodeWc !== undefined && parentWc !== undefined) {
        const whiteToMove   = nodePly % 2 === 1;
        const moverNodeWc   = whiteToMove ? nodeWc   : -nodeWc;
        const moverParentWc = whiteToMove ? parentWc : -parentWc;
        stored.loss = (moverParentWc - moverNodeWc) / 2;
      }
    }
    entry.cache.set(nodePath, stored);
  }

  entry.done++;
  reviewItemIndex++;
  reviewCurrentEval = {};

  void saveAnalysisToIdb(
    'partial',
    entry.game.id,
    buildAnalysisNodes(entry.ctrl.mainline, p => entry.cache.get(p)),
    reviewDepth,
  );
  _redraw();

  if (reviewItemIndex < reviewItemQueue.length) {
    sendNextItem();
  } else {
    finishEntry(entry);
  }
}

// --- Send next batch item to the background engine ---

function sendNextItem(): void {
  const item = reviewItemQueue[reviewItemIndex];
  if (!item) return;

  reviewCurrentEval     = {};
  reviewNodePath        = item.nodePath;
  reviewNodePly         = item.nodePly;
  reviewParentPath      = item.parentPath;
  reviewSearchActive    = true;

  console.log('[review-batch]', reviewItemIndex + 1, '/', reviewItemQueue.length,
    'nodeId:', item.nodeId, 'path:', item.nodePath, 'ply:', item.nodePly);

  reviewProtocol.setPosition(item.fen);
  reviewProtocol.go(reviewDepth);
}

// --- Finish a single game ---

function finishEntry(entry: ReviewQueueEntry): void {
  entry.status = 'complete';

  const userColor = _getUserColor(entry.game);
  _analyzedGameIds.add(entry.game.id);
  const moments = detectMissedMoments(entry.ctrl.mainline, entry.cache, userColor);
  setMissedMoments(entry.game.id, moments);
  if (moments.length > 0) _missedTacticGameIds.add(entry.game.id);
  const summary = computeAnalysisSummary(entry.ctrl.mainline, entry.cache);
  if (summary) {
    _analyzedGameAccuracy.set(entry.game.id, {
      white: summary.white.accuracy,
      black: summary.black.accuracy,
    });
  }

  void saveAnalysisToIdb(
    'complete',
    entry.game.id,
    buildAnalysisNodes(entry.ctrl.mainline, p => entry.cache.get(p)),
    reviewDepth,
  );

  console.log('[review-engine] game complete:', entry.game.id);
  _redraw();
  advanceQueue();
}

// --- Start analysis for a queue entry ---

async function startEntryBatch(entry: ReviewQueueEntry): Promise<void> {
  // Build the list of positions to analyze (skip root node at index 0).
  const items: ReviewBatchItem[] = [];
  let path     = '';
  let prevPath = '';
  for (let i = 0; i < entry.ctrl.mainline.length; i++) {
    const node = entry.ctrl.mainline[i]!;
    prevPath = path;
    if (i > 0) path += node.id;
    if (!entry.cache.has(path)) {
      items.push({
        nodeId:     node.id,
        nodePly:    node.ply,
        nodePath:   path,
        parentPath: prevPath,
        fen:        node.fen,
      });
    }
  }

  entry.total = entry.ctrl.mainline.length > 1 ? entry.ctrl.mainline.length - 1 : 0;

  if (items.length === 0) {
    finishEntry(entry);
    return;
  }

  reviewItemQueue = items;
  reviewItemIndex = 0;
  reviewCurrentEval = {};

  // Ensure engine is ready before sending first position.
  if (!reviewEngineReady) {
    // initReviewEngine readyok handler will call sendNextItem when ready.
    return;
  }

  sendNextItem();
}

// --- Queue advance ---

function advanceQueue(): void {
  if (queuePaused) return;

  const nextIndex = queue.findIndex(e => e.status === 'pending');
  if (nextIndex < 0) {
    activeIndex = -1;
    _redraw();
    return;
  }

  activeIndex = nextIndex;
  const entry = queue[activeIndex]!;
  entry.status = 'analyzing';
  void startEntryBatch(entry);
}

// --- Public API ---

export function enqueueBulkReview(games: ImportedGame[]): void {
  console.log('[reviewQueue] enqueueBulkReview called — games:', games.map(g => g.id), 'queue len:', queue.length, 'activeIndex:', activeIndex, 'engineInitStarted:', reviewEngineInitStarted);
  for (const game of games) {
    // Skip already analyzed or already queued games.
    console.log('[reviewQueue]  game', game.id, '— alreadyAnalyzed:', _analyzedGameIds.has(game.id), 'alreadyQueued:', queue.some(e => e.game.id === game.id));
    if (_analyzedGameIds.has(game.id)) continue;
    if (queue.some(e => e.game.id === game.id)) continue;

    const ctrl  = new AnalyseCtrl(pgnToTree(game.pgn));
    const total = ctrl.mainline.length > 1 ? ctrl.mainline.length - 1 : 0;
    queue.push({
      game,
      ctrl,
      cache:  new Map<string, PositionEval>(),
      done:   0,
      total,
      status: 'pending',
    });
  }

  // Init engine lazily on first enqueue.
  if (!reviewEngineInitStarted) {
    void initReviewEngine('/stockfish-web');
  }

  // Start processing if nothing is running.
  if (activeIndex < 0) {
    advanceQueue();
  }
}

export function isBulkRunning(): boolean {
  if (queuePaused) return false;
  return queue.some(e => e.status === 'pending' || e.status === 'analyzing');
}

export function isBulkPaused(): boolean {
  return queuePaused && queue.some(e => e.status === 'pending' || e.status === 'analyzing');
}

export function cancelBulkReview(): void {
  if (reviewSearchActive) {
    reviewPendingStopCount++;
    reviewProtocol.stop();
    reviewSearchActive = false;
  }
  queue       = [];
  activeIndex = -1;
  queuePaused = false;
  _redraw();
}

export function pauseBulkReview(): void {
  if (!isBulkRunning()) return;
  queuePaused = true;
  if (reviewSearchActive) {
    reviewPendingStopCount++;
    reviewProtocol.stop();
    reviewSearchActive = false;
  }
  _redraw();
}

export function resumeBulkReview(): void {
  if (!queuePaused) return;
  queuePaused = false;
  // Resume the active entry if one was mid-analysis when paused.
  const entry = activeIndex >= 0 ? queue[activeIndex] : undefined;
  if (entry && entry.status === 'analyzing' && reviewItemIndex < reviewItemQueue.length) {
    sendNextItem();
  } else {
    advanceQueue();
  }
  _redraw();
}

export function getReviewProgress(gameId: string): number | undefined {
  const entry = queue.find(e => e.game.id === gameId);
  if (!entry) return undefined;
  if (entry.status === 'complete') return 100;
  if (entry.total === 0) return undefined;
  return Math.round((entry.done / entry.total) * 100);
}

export function getQueueSummary(): { total: number; done: number; running: boolean } {
  const total   = queue.length;
  const done    = queue.filter(e => e.status === 'complete').length;
  const running = isBulkRunning();
  return { total, done, running };
}

export function getAutoReview(): boolean {
  return localStorage.getItem('patzer.autoReview') === 'true';
}
