// Engine lifecycle: protocol, eval state, arrows, threat mode.
// Mirrors lichess-org/lila: ui/lib/src/ceval/ toggle + state management.

import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { StockfishProtocol } from '../ceval/protocol';
import { evalWinChances } from './winchances';
import { pathIsMainline } from '../tree/ops';
import type { AnalyseCtrl } from '../analyse/ctrl';

// --- Types ---

export interface EvalLine {
  cp?:    number;
  mate?:  number;
  best?:  string;
  /** Full PV move sequence in UCI notation (for display). */
  moves?: string[];
}

export interface PositionEval {
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

// --- Injected deps (set at bootstrap via initEngine) ---

let _getCtrl: () => AnalyseCtrl = () => { throw new Error('engine not initialised'); };
let _getCgInstance: () => CgApi | undefined = () => undefined;
let _redraw: () => void = () => {};

export function initEngine(deps: {
  getCtrl:       () => AnalyseCtrl;
  getCgInstance: () => CgApi | undefined;
  redraw:        () => void;
}): void {
  _getCtrl       = deps.getCtrl;
  _getCgInstance = deps.getCgInstance;
  _redraw        = deps.redraw;
}

// --- Batch callback hooks (avoids circular import with engine/batch.ts) ---

let _isBatchActive: () => boolean   = () => false;
let _onBatchBestmove: (() => void) | null = null;

export function setIsBatchActive(fn: () => boolean): void   { _isBatchActive = fn; }
export function setOnBatchBestmove(fn: () => void): void    { _onBatchBestmove = fn; }

// --- Engine state ---

export const protocol = new StockfishProtocol();

export let engineEnabled     = false;
export let engineReady       = false;
let       engineInitialized  = false;
export let currentEval: PositionEval = {};
export const evalCache = new Map<string, PositionEval>();

let evalNodeId     = '';
let evalNodePath   = '';
let evalNodePly    = 0;
let evalParentPath = '';

/** True between sending 'go' and receiving the corresponding 'bestmove'. */
let engineSearchActive = false;
/**
 * Count of 'stop' commands sent to interrupt active searches that have not yet
 * produced their stale 'bestmove' reply.  Each arriving 'bestmove' while this
 * count > 0 is discarded and the count decremented.
 *
 * A counter rather than a boolean — a rapid stop/start sequence can have
 * multiple stale bestmoves in flight simultaneously (e.g. threat cleared then
 * navigation stop fires before the first stale reply arrives).  A boolean can
 * only discard one; the counter handles arbitrarily many.
 */
let pendingStopCount = 0;
/**
 * User navigated to a new position while the engine was busy.
 * When the current search's bestmove arrives, evalCurrentPosition() is called
 * automatically so every position is evaluated to full depth before the next.
 * Mirrors the "don't interrupt, queue" pattern from Lichess's ceval ctrl.
 */
let pendingEval = false;

// --- Engine settings ---
// Mirrors lichess-org/lila: ui/lib/src/ceval/view/settings.ts

export let multiPv         = 3;   // number of candidate lines (UCI MultiPV), 1–5
export let analysisDepth   = 30;  // live analysis depth (transient, does NOT overwrite review)
export let showEngineArrows = true;
export let arrowAllLines    = true;
export let showPlayedArrow  = true;

/** Accumulates secondary PV lines (multipv 2, 3, …) during an active search. */
export let pendingLines: EvalLine[] = [];

/** Arrow debounce timer — avoids flickering during live engine search. */
let arrowDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Arrows are suppressed until this timestamp to give the engine a settling window. */
let arrowSuppressUntil = 0;
/** Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts — Lichess uses 500 ms delay. */
const ARROW_SETTLE_MS = 500;

// --- Threat mode ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts toggleThreatMode + keyboard.ts 'x'

export let threatMode   = false;
let       evalIsThreat  = false;
let       threatEval: PositionEval = {};

// --- Setters for external write access ---

export function resetCurrentEval(): void          { currentEval = {}; }
export function setCurrentEval(ev: PositionEval): void { currentEval = { ...ev }; }
export function clearEvalCache(): void            { evalCache.clear(); }
export function setMultiPv(v: number): void       { multiPv = v; }
export function setAnalysisDepth(v: number): void { analysisDepth = v; }
export function clearPendingLines(): void         { pendingLines = []; }
export function setShowEngineArrows(v: boolean): void { showEngineArrows = v; }
export function setArrowAllLines(v: boolean): void    { arrowAllLines = v; }
export function setShowPlayedArrow(v: boolean): void  { showPlayedArrow = v; }
export function incrementPendingStopCount(): void { pendingStopCount++; }
export function stopProtocol(): void              { protocol.stop(); }

// --- Arrow rendering ---
// Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts makeShapesFromUci + compute

export function buildArrowShapes(): DrawShape[] {
  const shapes: DrawShape[] = [];
  const ctrl = _getCtrl();

  if (engineEnabled && showEngineArrows) {
    if (currentEval.best) {
      const uci = currentEval.best;
      shapes.push({ orig: uci.slice(0, 2) as any, dest: uci.slice(2, 4) as any, brush: 'paleBlue' });
    }
    // Secondary PV lines — paleGrey with lineWidth scaled by win% diff
    // Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts compute()
    if (arrowAllLines) {
      const topWc = evalWinChances(currentEval) ?? 0;
      for (const line of currentEval.lines ?? []) {
        if (!line.best) continue;
        const lineWc = evalWinChances(line) ?? 0;
        const shift = Math.abs(topWc - lineWc) / 2;
        if (shift >= 0.2) continue;
        const lineWidth = Math.max(2, Math.round(12 - shift * 50));
        const uci = line.best;
        shapes.push({
          orig: uci.slice(0, 2) as any,
          dest: uci.slice(2, 4) as any,
          brush: 'paleGrey',
          modifiers: { lineWidth },
        });
      }
    }
  }

  if (engineEnabled && threatMode && threatEval.best) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as any, dest: uci.slice(2, 4) as any, brush: 'red' });
  }

  // Only show the played-move arrow when the current path is on the original
  // game mainline.  Inside a side variation, children[0] is the first child of
  // the variation node — not the played game move — so the arrow is semantically
  // wrong and should be suppressed.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onMainline gate.
  if (showPlayedArrow && pathIsMainline(ctrl.root, ctrl.path)) {
    const nextNode = ctrl.node.children[0];
    if (nextNode?.uci) {
      const uci = nextNode.uci;
      shapes.push({
        orig: uci.slice(0, 2) as any,
        dest: uci.slice(2, 4) as any,
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
export function syncArrow(): void {
  const cg = _getCgInstance();
  if (!cg) return;
  if (arrowDebounceTimer !== null) { clearTimeout(arrowDebounceTimer); arrowDebounceTimer = null; }
  arrowSuppressUntil = 0;
  cg.set({ drawable: { autoShapes: buildArrowShapes() } });
}

/**
 * Apply arrow shapes after a settling delay — used during live engine search
 * to avoid flickering as the engine changes its mind on each depth iteration.
 * Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts (ARROW_SETTLE_MS).
 */
export function syncArrowDebounced(): void {
  const cg = _getCgInstance();
  if (!cg) return;
  const now = Date.now();
  if (now < arrowSuppressUntil) {
    if (arrowDebounceTimer === null) {
      arrowDebounceTimer = setTimeout(() => {
        arrowDebounceTimer = null;
        arrowSuppressUntil = 0;
        _getCgInstance()?.set({ drawable: { autoShapes: buildArrowShapes() } });
      }, arrowSuppressUntil - now);
    }
    return;
  }
  if (arrowDebounceTimer !== null) { clearTimeout(arrowDebounceTimer); }
  arrowDebounceTimer = setTimeout(() => {
    arrowDebounceTimer = null;
    _getCgInstance()?.set({ drawable: { autoShapes: buildArrowShapes() } });
  }, 150);
}

// --- UCI parsing ---

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
    let pvIndex = 1;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'multipv') {
        pvIndex = parseInt(parts[++i]);
      } else if (parts[i] === 'score') {
        isMate = parts[++i] === 'mate';
        score = parseInt(parts[++i]);
        if (parts[i + 1] === 'lowerbound' || parts[i + 1] === 'upperbound') i++;
      } else if (parts[i] === 'pv') {
        pvMoves = parts.slice(i + 1);
        best = pvMoves[0];
        break;
      }
    }

    if (pvIndex === 1) {
      // Path guard: discard info lines for a position we've already navigated away from.
      // Only the threat search is exempt — it always targets the current node.
      // During batch review the engine works through the mainline sequentially; evalNodePath
      // will rarely match the user's current navigation path, so skip the guard entirely
      // while a batch is active — batch items are identified by evalNodePath, not user path.
      // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onNewCeval `path === this.path` gate.
      if (!evalIsThreat && !_isBatchActive() && evalNodePath !== _getCtrl().path) return;
      const ev = evalIsThreat ? threatEval : currentEval;
      if (score !== undefined) {
        // Normalize to white's perspective — odd plies are black to move, so negate.
        const s = (!evalIsThreat && evalNodePly % 2 === 1) ? -score : score;
        if (isMate) { ev.mate = s; ev.cp = undefined; }
        else        { ev.cp = s;   ev.mate = undefined; }
      }
      if (best) ev.best = best;
      if (pvMoves.length > 0 && !evalIsThreat) ev.moves = pvMoves;
      if ((score !== undefined || best) && !_isBatchActive()) {
        syncArrowDebounced();
        _redraw();
      }
    } else if (!evalIsThreat && score !== undefined) {
      // Secondary PV line (MultiPV 2, 3, …).
      // Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts multiPv handling.
      if (evalNodePath !== _getCtrl().path) return; // stale path guard
      const s = evalNodePly % 2 === 1 ? -score : score;
      const idx = pvIndex - 1;
      if (!pendingLines[idx]) pendingLines[idx] = {};
      const pl = pendingLines[idx]!;
      if (isMate) { pl.mate = s; pl.cp = undefined; }
      else        { pl.cp = s;   pl.mate = undefined; }
      if (best) pl.best = best;
      if (pvMoves.length > 0) pl.moves = pvMoves;
      currentEval.lines = pendingLines.slice(1).filter(Boolean) as EvalLine[];
      if (!_isBatchActive()) _redraw();
    }
  } else if (parts[0] === 'bestmove') {
    // Discard the stale bestmove that arrives after a 'stop' interrupted a previous search.
    if (pendingStopCount > 0) {
      pendingStopCount--;
      currentEval  = {};
      pendingLines = [];
      console.log('[ceval] stale bestmove discarded — currentEval reset');
      return;
    }
    engineSearchActive = false;
    if (!parts[1] || parts[1] === '(none)') {
      if (_isBatchActive()) _onBatchBestmove?.();
      else if (pendingEval) evalCurrentPosition();
      return;
    }
    if (evalIsThreat) {
      threatEval.best = parts[1];
      evalIsThreat = false;
      syncArrow();
      _redraw();
    } else {
      // Path guard: if this bestmove is for an old position, don't update currentEval
      // or trigger UI redraws — but still advance a pending eval for the current position.
      // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onNewCeval `path === this.path` gate.
      if (!_isBatchActive() && evalNodePath !== _getCtrl().path) {
        pendingLines = [];
        if (pendingEval) evalCurrentPosition();
        else if (threatMode) evalThreatPosition();
        return;
      }
      currentEval.best = parts[1];
      const stored: PositionEval = { ...currentEval };
      pendingLines = [];
      currentEval = stored;
      if (_isBatchActive()) {
        // Route to batch for review-eval storage and queue advance.
        _onBatchBestmove?.();
      } else {
        syncArrowDebounced();
        _redraw();
        if (pendingEval) {
          evalCurrentPosition();
        } else if (threatMode) {
          evalThreatPosition();
        }
      }
    }
  }
}

// readyok callback — batch.ts registers this to handle the pending-batch-on-ready case
// and the normal eval-on-ready case in a single hook.
let _onEngineReady: (() => void) | null = null;
export function setOnEngineReady(fn: (() => void) | null): void { _onEngineReady = fn; }

// Wire protocol message handler at module init.
protocol.onMessage(line => {
  if (line.trim() === 'readyok') {
    engineReady = true;
    if (_onEngineReady) {
      _onEngineReady();
    } else {
      evalCurrentPosition();
    }
    _redraw();
  } else {
    if (!_isBatchActive() && (line.startsWith('info') || line.startsWith('bestmove'))) {
      console.log('[live-diag]', line.slice(0, 120));
    }
    parseEngineLine(line);
  }
});

// --- Flip FEN color (null-move trick for threat analysis) ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts threatMode position setup.
export function flipFenColor(fen: string): string {
  const parts = fen.split(' ');
  if (parts.length >= 2) parts[1] = parts[1] === 'w' ? 'b' : 'w';
  if (parts.length >= 4) parts[3] = '-';
  return parts.join(' ');
}

// --- Threat mode ---

export function evalThreatPosition(): void {
  if (!engineEnabled || !engineReady || _isBatchActive()) return;
  threatEval   = {};
  evalIsThreat = true;
  protocol.stop();
  protocol.setPosition(flipFenColor(_getCtrl().node.fen));
  protocol.go(analysisDepth);
}

// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts toggleThreatMode (keyboard 'x')
export function toggleThreatMode(): void {
  threatMode = !threatMode;
  if (threatMode) {
    evalThreatPosition();
  } else {
    if (evalIsThreat) { protocol.stop(); evalIsThreat = false; }
    threatEval = {};
    syncArrow();
    _redraw();
  }
}

// --- Live eval ---

export function evalCurrentPosition(): void {
  if (_isBatchActive()) return;
  if (!engineEnabled || !engineReady) return;
  if (evalIsThreat) { pendingStopCount++; protocol.stop(); evalIsThreat = false; }
  threatEval = {};
  const ctrl = _getCtrl();
  const cached = evalCache.get(ctrl.path);
  const cachedHasLines = !!cached?.moves?.length && (cached?.lines?.length ?? 0) >= multiPv - 1;
  if (cached && cachedHasLines) {
    currentEval = { ...cached };
    syncArrow();
    _redraw();
    if (threatMode) evalThreatPosition();
    return;
  }
  currentEval  = cached ? { ...cached } : {};
  pendingLines = [];
  // Clear old arrows immediately, THEN arm the suppress window.
  // Order matters: syncArrow() resets arrowSuppressUntil = 0, so setting the
  // suppress window before syncArrow() would be immediately undone.
  // With the window correctly set after syncArrow(), syncArrowDebounced() on the
  // first info line from the new search schedules exactly one deferred update at
  // arrowSuppressUntil (≈500ms). Subsequent info lines during the suppress window
  // are no-ops (timer already queued), so rapid shallow-depth info bursts cannot
  // continuously reset the debounce timer and block arrow updates.
  // Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts ARROW_SETTLE_MS intent.
  syncArrow();
  arrowSuppressUntil = Date.now() + ARROW_SETTLE_MS;

  if (engineSearchActive) {
    // Stop the old search immediately so the new position starts evaluating sooner.
    // The stale bestmove that arrives after stop is discarded by the path guard in
    // parseEngineLine (evalNodePath !== _getCtrl().path), which then calls
    // evalCurrentPosition() via pendingEval.
    // Mirrors lichess-org/lila: ui/lib/src/ceval/ctrl.ts stop-before-go on navigation.
    protocol.stop();
    pendingEval = true;
    _redraw();
    return;
  }

  pendingEval        = false;
  engineSearchActive = true;
  evalNodeId         = ctrl.node.id;
  evalNodePath       = ctrl.path;
  evalNodePly        = ctrl.node.ply;
  evalParentPath     = ctrl.path.length >= 2 ? ctrl.path.slice(0, -2) : '';
  console.log('[live-diag] starting live eval — path:', evalNodePath, 'ply:', evalNodePly, 'multiPv:', multiPv);
  protocol.setPosition(ctrl.node.fen);
  protocol.go(analysisDepth, multiPv);
}

// --- Engine toggle ---
// Adapted from lichess-org/lila: ui/lib/src/ceval/ctrl.ts toggle

export function toggleEngine(): void {
  engineEnabled = !engineEnabled;
  if (engineEnabled) {
    if (!engineInitialized) {
      engineInitialized = true;
      // Load Stockfish 18 (smallnet) via @lichess-org/stockfish-web.
      // Requires COOP+COEP headers — use `pnpm serve` (server.mjs), not file://.
      // Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts
      void protocol.init('/stockfish-web').catch((err: unknown) => {
        console.error('[engine] failed to load:', err);
        engineEnabled     = false;
        engineInitialized = false;
        _redraw();
      });
    } else if (engineReady) {
      evalCurrentPosition();
    }
  } else {
    protocol.stop();
    currentEval  = {};
    evalIsThreat = false;
    threatEval   = {};
    syncArrow();
  }
  _redraw();
}

// Export internal state getters for batch.ts (avoids exporting mutable internals)
export function getEvalNodePath(): string   { return evalNodePath; }
export function getEvalNodePly(): number    { return evalNodePly; }
export function getEvalParentPath(): string { return evalParentPath; }
export function getEvalNodeId(): string     { return evalNodeId; }
export function setEngineSearchActive(v: boolean): void { engineSearchActive = v; }
export function setEvalNode(id: string, path: string, ply: number, parentPath: string): void {
  evalNodeId     = id;
  evalNodePath   = path;
  evalNodePly    = ply;
  evalParentPath = parentPath;
}
export function isEngineSearchActive(): boolean { return engineSearchActive; }
