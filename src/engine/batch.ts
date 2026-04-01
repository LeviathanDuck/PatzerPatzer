// Batch analysis (full-game review) pipeline.
// Drives the engine through every mainline position and stores results to evalCache.
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts batch/review flow.

import {
  protocol,
  evalCache,
  currentEval,
  evalCurrentPosition,
  syncArrow,
  toggleEngine,
  engineEnabled,
  engineReady,
  resetCurrentEval,
  clearPendingLines,
  setIsBatchActive,
  setOnBatchBestmove,
  setOnEngineReady,
  setEvalNode,
  setEngineSearchActive,
  incrementPendingStopCount,
  isEngineSearchActive,
  getEvalNodePath,
  getEvalNodePly,
  getEvalParentPath,
} from './ctrl';
import { evalWinChances } from './winchances';
import { hasMissedMoments, detectMissedMoments, setMissedMoments } from './tactics';
import { computeAnalysisSummary } from '../analyse/evalView';
import { buildAnalysisNodes, saveAnalysisToIdb, saveGameSummary } from '../idb/index';
import { extractGameSummary } from '../stats/extract';
import { invalidateSummariesCache } from '../stats/ctrl';
import type { AnalyseCtrl } from '../analyse/ctrl';
import type { ImportedGame } from '../import/types';

// --- Types ---

export interface BatchItem {
  nodeId:     string;
  nodePly:    number;
  nodePath:   string;
  parentPath: string;
  fen:        string;
}

export type BatchState = 'idle' | 'analyzing' | 'complete';

// --- Injected deps ---

let _getCtrl: () => AnalyseCtrl = () => { throw new Error('batch not initialised'); };
let _getSelectedGameId: () => string | null = () => null;
let _getImportedGames: () => ImportedGame[] = () => [];
let _analyzedGameIds: Set<string>;
let _missedTacticGameIds: Set<string>;
let _analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }>;
let _getUserColor: (game: ImportedGame) => 'white' | 'black' | null;
let _redraw: () => void = () => {};
let _onBatchComplete: (() => void) | null = null;

export function initBatch(deps: {
  getCtrl:              () => AnalyseCtrl;
  getSelectedGameId:    () => string | null;
  getImportedGames:     () => ImportedGame[];
  analyzedGameIds:      Set<string>;
  missedTacticGameIds:  Set<string>;
  analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }>;
  getUserColor:         (game: ImportedGame) => 'white' | 'black' | null;
  redraw:               () => void;
  onBatchComplete?:     () => void;
}): void {
  _getCtrl              = deps.getCtrl;
  _getSelectedGameId    = deps.getSelectedGameId;
  _getImportedGames     = deps.getImportedGames;
  _analyzedGameIds      = deps.analyzedGameIds;
  _missedTacticGameIds  = deps.missedTacticGameIds;
  _analyzedGameAccuracy = deps.analyzedGameAccuracy;
  _getUserColor         = deps.getUserColor;
  _redraw               = deps.redraw;
  _onBatchComplete      = deps.onBatchComplete ?? null;

  // Register with ctrl.ts to avoid circular import.
  setIsBatchActive(() => batchAnalyzing);
  setOnBatchBestmove(onBatchBestmove);
  setOnEngineReady(() => {
    if (pendingBatchOnReady) {
      pendingBatchOnReady = false;
      startBatchAnalysis();
    } else {
      evalCurrentPosition();
    }
  });
}

// --- Batch state ---

export let batchQueue:      BatchItem[] = [];
export let batchDone        = 0;
export let batchAnalyzing   = false;
export let batchState: BatchState = 'idle';
export let analysisRunning  = false;
export let analysisComplete = false;
/**
 * Read an integer from localStorage, returning def when the key is absent,
 * unparseable, or out of [min, max].
 * Mirrors lichess-org/lila: ui/lib/src/ceval/ctrl.ts storedIntProp pattern.
 */
function storedInt(key: string, def: number, min: number, max: number): number {
  const v = parseInt(localStorage.getItem(key) ?? '', 10);
  return (!isNaN(v) && v >= min && v <= max) ? v : def;
}

export let reviewDepth      = storedInt('patzer.reviewDepth', 16, 12, 20);
export let pendingBatchOnReady = false;


// --- Setters (used by main.ts render code and loadGame) ---

export function setReviewDepth(v: number): void      { reviewDepth = v; localStorage.setItem('patzer.reviewDepth', String(v)); }
export function setBatchAnalyzing(v: boolean): void  { batchAnalyzing = v; }
export function setBatchState(v: BatchState): void   { batchState = v; }
export function setAnalysisRunning(v: boolean): void { analysisRunning = v; }
export function setAnalysisComplete(v: boolean): void { analysisComplete = v; }
export function clearBatchQueue(): void              { batchQueue = []; batchDone = 0; }
export function resetBatchState(): void {
  batchQueue       = [];
  batchDone        = 0;
  batchAnalyzing   = false;
  batchState       = 'idle';
  analysisRunning  = false;
  analysisComplete = false;
}

// --- Missed tactic detection ---

/**
 * Returns true if the analyzed mainline contains any missed tactical moment
 * for the given user color.  Delegates to engine/tactics.ts which holds all
 * configurable thresholds and category logic.
 *
 * Exported so main.ts can call it when restoring previously-analyzed games
 * from IDB (the evalCache is populated at that point).
 */
export function detectMissedTactics(userColor: 'white' | 'black' | null): boolean {
  return hasMissedMoments(_getCtrl().mainline, evalCache, userColor);
}

// --- Batch engine control ---

export function evalBatchItem(item: BatchItem): void {
  const wasActive      = isEngineSearchActive();
  if (wasActive) incrementPendingStopCount(); // discard stale bestmove if one is in flight
  setEngineSearchActive(true);
  setEvalNode(item.nodeId, item.nodePath, item.nodePly, item.parentPath);
  resetCurrentEval();
  clearPendingLines();
  console.log('[batch]', batchDone + 1, '/', batchQueue.length, 'nodeId:', item.nodeId, 'path:', item.nodePath, 'ply:', item.nodePly);
  if (wasActive) protocol.stop();
  protocol.setPosition(item.fen);
  protocol.go(reviewDepth);
}

/**
 * Called from ctrl.ts via the _onBatchBestmove callback when a batch bestmove arrives.
 * Handles both the Review eval storage and the queue advance.
 */
function onBatchBestmove(): void {
  // At this point currentEval has the latest eval (ctrl.ts already set currentEval.best).
  const stored = { ...currentEval };
  const nodePath   = getEvalNodePath();
  const nodePly    = getEvalNodePly();
  const parentPath = getEvalParentPath();

  if (stored.cp !== undefined || stored.mate !== undefined) {
    const parentEval = evalCache.get(parentPath);
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
    evalCache.set(nodePath, stored);
    console.log('[review cache] path:', nodePath, 'ply:', nodePly, 'best:', stored.best,
      { cp: stored.cp, delta: stored.delta, loss: stored.loss?.toFixed(4) });
  } else {
    console.log('[review cache] skip (no score) — path:', nodePath, 'ply:', nodePly);
  }

  advanceBatch();
}

export function advanceBatch(): void {
  batchDone++;
  const gameId = _getSelectedGameId();
  if (gameId) void saveAnalysisToIdb('partial', gameId, buildAnalysisNodes(_getCtrl().mainline, p => evalCache.get(p)), reviewDepth);
  _redraw();
  if (batchDone < batchQueue.length) {
    evalBatchItem(batchQueue[batchDone]!);
  } else {
    batchAnalyzing   = false;
    batchState       = 'complete';
    analysisRunning  = false;
    analysisComplete = true;
    if (gameId) {
      _analyzedGameIds.add(gameId);
      const game = _getImportedGames().find(g => g.id === gameId);
      const userColor = game ? _getUserColor(game) : null;
      const moments = detectMissedMoments(_getCtrl().mainline, evalCache, userColor);
      setMissedMoments(gameId, moments);
      if (moments.length > 0) _missedTacticGameIds.add(gameId);
      const liveSummary = computeAnalysisSummary(_getCtrl().mainline, evalCache);
      if (liveSummary) {
        _analyzedGameAccuracy.set(gameId, { white: liveSummary.white.accuracy, black: liveSummary.black.accuracy });
      }
      if (userColor) {
        const summary = extractGameSummary(
          game!,
          _getCtrl().mainline,
          p => evalCache.get(p),
          userColor,
          moments,
          reviewDepth,
        );
        void saveGameSummary(summary);
        invalidateSummariesCache();
      }
    }
    if (gameId) void saveAnalysisToIdb('complete', gameId, buildAnalysisNodes(_getCtrl().mainline, p => evalCache.get(p)), reviewDepth);
    // Re-evaluate current node interactively after batch (batch always uses MultiPV=1)
    evalCache.delete(_getCtrl().path);
    resetCurrentEval();
    clearPendingLines();
    evalCurrentPosition();
    // Notify caller so it can advance a multi-game analysis queue.
    _onBatchComplete?.();
  }
}

export function startBatchAnalysis(): void {
  console.log('[batch] startBatchAnalysis — engineEnabled:', engineEnabled, 'engineReady:', engineReady, 'batchAnalyzing:', batchAnalyzing);
  if (!engineEnabled || !engineReady || batchAnalyzing) return;

  const ctrl = _getCtrl();
  const queue: BatchItem[] = [];
  let path = '';
  let prevPath = '';
  for (let i = 0; i < ctrl.mainline.length; i++) {
    const node = ctrl.mainline[i]!;
    prevPath = path;
    if (i > 0) path += node.id;
    if (!evalCache.has(path)) {
      queue.push({ nodeId: node.id, nodePly: node.ply, nodePath: path, parentPath: prevPath, fen: node.fen });
    }
  }

  batchQueue       = queue;
  batchDone        = 0;
  batchAnalyzing   = queue.length > 0;
  batchState       = queue.length > 0 ? 'analyzing' : 'complete';
  analysisRunning  = queue.length > 0;
  analysisComplete = queue.length === 0;
  syncArrow();
  _redraw();

  if (queue.length > 0) evalBatchItem(queue[0]!);
}

/**
 * Enable the engine if needed, then start batch analysis.
 * If the engine is mid-init (enabled but not yet ready), queues the batch
 * via pendingBatchOnReady so it fires automatically on readyok.
 */
export function startBatchWhenReady(): void {
  console.log('[batch] startBatchWhenReady — engineEnabled:', engineEnabled, 'engineReady:', engineReady, 'batchAnalyzing:', batchAnalyzing);
  if (!engineEnabled) {
    pendingBatchOnReady = true;
    toggleEngine();
    // If the engine was already initialized and ready, toggleEngine() will not
    // trigger another readyok — the _onEngineReady hook that consumes
    // pendingBatchOnReady will never fire.  Start the batch directly.
    if (engineReady) {
      pendingBatchOnReady = false;
      startBatchAnalysis();
    }
    return;
  }
  if (!engineReady) {
    pendingBatchOnReady = true;
    return;
  }
  startBatchAnalysis();
}
