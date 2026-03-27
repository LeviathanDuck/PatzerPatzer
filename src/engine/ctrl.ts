// Engine lifecycle: protocol, eval state, arrows, threat mode.
// Mirrors lichess-org/lila: ui/lib/src/ceval/ toggle + state management.

import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { annotationShapes as buildBoardGlyphShapes } from '../analyse/boardGlyphs';
import { StockfishProtocol } from '../ceval/protocol';
import { puzzleHidesAnalysis } from '../puzzles/runtime';
import { evalWinChances, classifyLoss, type MoveLabel } from './winchances';
import { formatScore } from '../analyse/evalView';
import { pathInit, pathIsMainline } from '../tree/ops';
import type { AnalyseCtrl } from '../analyse/ctrl';
import type { Glyph } from '../tree/types';

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
  /**
   * Persisted move-review annotation hydrated from IndexedDB on restore.
   * Absent during live/batch analysis (set only after a save+restore cycle).
   * UI consumers should prefer this over recomputing classifyLoss(loss) when present.
   * Mirrors the node.glyphs annotation layer in lichess-org/lila: ui/lib/src/tree/types.ts
   */
  label?: MoveLabel;
  /** Secondary PV lines when MultiPV > 1 (indices 0+ correspond to multipv 2, 3, …). */
  lines?: EvalLine[];
  /**
   * Search depth of the most recent info line for this position.
   * Used by retroCtrl.ts onCeval() to determine ceval readiness.
   * Mirrors lichess-org/lila: retroCtrl.ts isCevalReady node.ceval.depth check.
   */
  depth?: number;
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

/**
 * Read an integer from localStorage, returning def when the key is absent,
 * unparseable, or out of [min, max].
 * Mirrors lichess-org/lila: ui/lib/src/ceval/ctrl.ts storedIntProp pattern.
 */
function storedInt(key: string, def: number, min: number, max: number): number {
  const v = parseInt(localStorage.getItem(key) ?? '', 10);
  return (!isNaN(v) && v >= min && v <= max) ? v : def;
}

export let multiPv         = storedInt('patzer.multiPv', 1, 1, 5);
export let analysisDepth   = storedInt('patzer.analysisDepth', 30, 18, 30);
export let showEngineArrows = true;
export let arrowAllLines    = true;
export let showPlayedArrow  = true;
export let showArrowLabels  = localStorage.getItem('patzer.showArrowLabels') !== 'false';
export let showReviewLabels = localStorage.getItem('patzer.showReviewLabels') !== 'false';
export let showBoardReviewGlyphs = localStorage.getItem('patzer.showBoardReviewGlyphs') !== 'false';
// Default label size is larger on touch/mobile devices (coarse pointer) for legibility.
const ARROW_LABEL_SIZE_DEFAULT = window.matchMedia('(pointer: coarse)').matches ? 18 : 10;
export let arrowLabelSize   = storedInt('patzer.arrowLabelSize', ARROW_LABEL_SIZE_DEFAULT, 6, 18);

/** Accumulates secondary PV lines (multipv 2, 3, …) during an active search. */
export let pendingLines: EvalLine[] = [];

/** Arrow debounce timer — avoids flickering during live engine search. */
let arrowDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Arrows are suppressed until this timestamp to give the engine a settling window. */
let arrowSuppressUntil = 0;
/** Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts — Lichess uses 500 ms delay. */
const ARROW_SETTLE_MS = 500;
let lastAutoShapesHash: string | null = null;
let lastAutoShapesCg: CgApi | undefined;
/** Mirrors lichess-org/lila: ui/lib/src/ceval/ctrl.ts onEmit throttle(200, ...) */
const LIVE_ENGINE_UI_THROTTLE_MS = 200;
let liveEngineUiTimer: ReturnType<typeof setTimeout> | null = null;
let liveEngineUiLastFlushAt = 0;
let liveEngineUiNeedsRetroCheck = false;

// --- Threat mode ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts toggleThreatMode + keyboard.ts 'x'

export let threatMode   = false;
let       evalIsThreat  = false;
let       threatEval: PositionEval = {};

// --- Setters for external write access ---

export function resetCurrentEval(): void          { currentEval = {}; }
export function setCurrentEval(ev: PositionEval): void { currentEval = { ...ev }; }
export function clearEvalCache(): void            { evalCache.clear(); }
export function setMultiPv(v: number): void       { multiPv = v; localStorage.setItem('patzer.multiPv', String(v)); }
export function setAnalysisDepth(v: number): void { analysisDepth = v; localStorage.setItem('patzer.analysisDepth', String(v)); }
export function clearPendingLines(): void         { pendingLines = []; }
export function setShowEngineArrows(v: boolean): void { showEngineArrows = v; }
export function setArrowAllLines(v: boolean): void    { arrowAllLines = v; }
export function setShowPlayedArrow(v: boolean): void  { showPlayedArrow = v; }
export function setShowArrowLabels(v: boolean): void  { showArrowLabels = v; localStorage.setItem('patzer.showArrowLabels', String(v)); }
export function setShowReviewLabels(v: boolean): void { showReviewLabels = v; localStorage.setItem('patzer.showReviewLabels', String(v)); }
export function setShowBoardReviewGlyphs(v: boolean): void { showBoardReviewGlyphs = v; localStorage.setItem('patzer.showBoardReviewGlyphs', String(v)); }
export function setArrowLabelSize(v: number): void    { arrowLabelSize = v; localStorage.setItem('patzer.arrowLabelSize', String(v)); }
export function incrementPendingStopCount(): void { pendingStopCount++; }
export function stopProtocol(): void              { protocol.stop(); }

// --- Arrow rendering ---
// Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts makeShapesFromUci + compute

export function buildArrowShapes(): DrawShape[] {
  const shapes: DrawShape[] = [];
  const ctrl = _getCtrl();
  if (_isBatchActive()) return shapes;
  if (puzzleHidesAnalysis()) return shapes;

  // Suppress engine-guidance arrows whenever retrospection is active and the user has not
  // manually revealed guidance for the current candidate.
  // Covers all retro states (find, fail, win, view, offTrack) — not just isSolving() —
  // so the answer is never accidentally visible at any point during a session.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts showBestMoveArrows() returning false
  // when retro.hideComputerLine(node) is true for unsolved candidate plies.
  const retroHidden = ctrl.retro !== undefined && !ctrl.retro.guidanceRevealed();

  if (engineEnabled && showEngineArrows && !retroHidden) {
    if (currentEval.best) {
      const uci = currentEval.best;
      shapes.push(buildArrowShape(uci, 'paleBlue'));
      const labelShape = buildArrowLabelShape(uci, currentEval);
      if (labelShape) shapes.push(labelShape);
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
        shapes.push(buildArrowShape(uci, 'paleGrey', { lineWidth }));
        const labelShape = buildArrowLabelShape(uci, line);
        if (labelShape) shapes.push(labelShape);
      }
    }
  }

  if (engineEnabled && threatMode && threatEval.best && !retroHidden) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as any, dest: uci.slice(2, 4) as any, brush: 'red' });
  }

  // Board review glyphs: suppress during retro so the opponent's previous move
  // (ctrl.node.uci) does not draw a confusing ?/??  arrow on the exercise position.
  if (showBoardReviewGlyphs && !retroHidden) {
    shapes.push(...buildCurrentNodeReviewGlyphShapes(ctrl));
  }

  // During retro solving, show the user's game mistake as a red arrow so they
  // know which move they need to improve upon.  This replaces the generic
  // played-move arrow (which showed children[0] — the opponent's next move from
  // the perspective of the parent position) with the specific candidate move.
  if (retroHidden && ctrl.retro!.isSolving()) {
    const c = ctrl.retro!.current();
    if (c && ctrl.path === c.parentPath) {
      shapes.push(buildArrowShape(c.playedMove, 'red'));
    }
  }

  // Only show the generic played-move arrow (children[0]) when NOT in retro mode,
  // on the original game mainline.  Suppressed during retro to avoid showing the
  // opponent's reply as if it were the candidate mistake.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onMainline gate.
  if (showPlayedArrow && pathIsMainline(ctrl.root, ctrl.path) && !retroHidden) {
    const nextNode = ctrl.node.children[0];
    if (nextNode?.uci) {
      const uci = nextNode.uci;
      const nextEval = evalCache.get(ctrl.path + nextNode.id);
      // Use plain red without lineWidth modifier so the arrowhead uses the well-known
      // 'r' brush key (marker arrowhead-r is guaranteed in defs).
      // Mirrors lichess-org/lila: ui/analyse/src/autoShape.ts compute() played-move brush.
      const playedEval = currentEval.best !== uci ? nextEval : undefined;
      shapes.push(buildArrowShape(uci, 'red'));
      const labelShape = buildArrowLabelShape(uci, playedEval);
      if (labelShape) shapes.push(labelShape);
    }
  }

  const koOverlay = buildKoOverlayShape(ctrl.node.fen);
  if (koOverlay) shapes.push(koOverlay);

  return shapes;
}

function buildArrowShape(
  uci: string,
  brush: string,
  modifiers?: DrawShape['modifiers'],
): DrawShape {
  const shape: DrawShape = {
    orig: uci.slice(0, 2) as any,
    dest: uci.slice(2, 4) as any,
    brush,
  };
  if (modifiers) shape.modifiers = modifiers;
  return shape;
}

function buildArrowLabelShape(
  uci: string,
  ev?: Pick<PositionEval, 'cp' | 'mate'> | Pick<EvalLine, 'cp' | 'mate'>,
): DrawShape | null {
  const labelSvg = buildArrowLabelSvg(ev);
  if (!labelSvg) return null;
  return {
    orig: uci.slice(0, 2) as any,
    dest: uci.slice(2, 4) as any,
    customSvg: { html: labelSvg, center: 'label' },
  };
}

function buildArrowLabelSvg(ev?: Pick<PositionEval, 'cp' | 'mate'> | Pick<EvalLine, 'cp' | 'mate'>): string | null {
  if (!showArrowLabels || !ev) return null;
  if (ev.cp === undefined && ev.mate === undefined) return null;
  const text = formatScore(ev);
  return `<text x="50" y="54" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="${arrowLabelSize}" font-weight="400" fill="#fff" stroke="rgba(0,0,0,0.72)" stroke-width="2" paint-order="stroke">${escapeArrowLabelText(text)}</text>`;
}

function escapeArrowLabelText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildCurrentNodeReviewGlyphShapes(ctrl: AnalyseCtrl): DrawShape[] {
  const glyphNode = currentNodeBoardGlyphNode(ctrl);
  return glyphNode ? buildBoardGlyphShapes(glyphNode) : [];
}

function currentNodeBoardGlyphNode(ctrl: AnalyseCtrl): { uci: string; san: string; glyphs: Glyph[] } | null {
  const { node, path } = ctrl;
  if (!node.uci || !node.san) return null;
  if (node.glyphs?.length) return { uci: node.uci, san: node.san, glyphs: node.glyphs };

  const cached = evalCache.get(path);
  if (!cached) return null;

  const parentCached = evalCache.get(pathInit(path));
  const playedBest = node.uci === parentCached?.best;
  if (playedBest) return null;

  const label = cached.label ?? (cached.loss !== undefined ? classifyLoss(cached.loss) : null);
  const symbol = labelToBoardReviewSymbol(label);
  if (!symbol) return null;

  return {
    uci: node.uci,
    san: node.san,
    glyphs: [{ id: 0, name: symbol, symbol }],
  };
}

function labelToBoardReviewSymbol(label: MoveLabel | null | undefined): string | null {
  if (label === 'blunder') return '??';
  if (label === 'mistake') return '?';
  if (label === 'inaccuracy') return '?!';
  return null;
}

// SVG content (injected into Chessground's 100×100 viewBox wrapper) for the KO
// overlay placed on the losing king's square at checkmate.
// Inlined from public/images/ko_purple.svg — avoids async <image> load issues.
// IDs prefixed with "ko-" to avoid conflicts with other inline SVG defs on the page.
const KO_PATH = 'M 398 142 L 368 128 L 344 127 L 340 131 L 327 133 L 320 130 L 316 135 L 302 137 L 285 144 L 281 140 L 278 147 L 266 144 L 267 149 L 257 162 L 309 159 L 311 162 L 307 165 L 294 166 L 289 171 L 282 172 L 267 184 L 258 187 L 249 204 L 243 209 L 243 217 L 240 220 L 238 219 L 230 234 L 230 245 L 226 248 L 220 246 L 215 269 L 219 277 L 217 282 L 222 294 L 233 304 L 232 306 L 236 311 L 247 318 L 264 322 L 296 322 L 322 313 L 327 308 L 343 301 L 378 273 L 401 242 L 416 212 L 420 196 L 419 175 L 415 162 Z M 251 128 L 160 170 L 171 125 L 168 117 L 145 112 L 131 126 L 109 164 L 89 213 L 45 238 L 55 242 L 48 250 L 50 255 L 38 264 L 42 267 L 59 260 L 62 273 L 59 288 L 42 322 L 41 331 L 47 325 L 43 349 L 53 329 L 56 332 L 52 342 L 65 327 L 71 330 L 68 341 L 78 326 L 84 328 L 83 333 L 87 331 L 116 257 L 121 259 L 146 296 L 200 340 L 226 349 L 237 344 L 220 330 L 230 327 L 189 285 L 164 240 L 153 236 L 151 228 L 162 217 L 166 205 L 181 201 L 185 195 L 247 164 L 249 151 L 238 151 L 236 146 L 253 136 L 244 136 Z M 371 169 L 376 177 L 376 183 L 375 184 L 376 190 L 368 203 L 368 206 L 365 209 L 362 216 L 358 221 L 356 225 L 355 232 L 349 239 L 348 246 L 340 251 L 341 252 L 340 255 L 342 257 L 332 263 L 329 268 L 327 268 L 316 274 L 311 272 L 303 277 L 304 278 L 303 283 L 296 288 L 294 288 L 293 285 L 284 285 L 278 282 L 276 280 L 277 278 L 273 277 L 270 274 L 270 271 L 267 266 L 267 257 L 269 254 L 269 249 L 271 243 L 276 237 L 278 232 L 282 228 L 283 225 L 301 206 L 316 193 L 327 186 L 331 182 L 337 179 L 336 176 L 337 174 L 342 170 L 354 163 Z M 234 304 L 236 302 L 237 302 L 238 301 L 240 303 L 242 300 L 246 300 L 247 301 L 247 303 L 251 303 L 252 302 L 254 302 L 255 303 L 257 303 L 258 302 L 260 304 L 260 305 L 262 307 L 265 307 L 265 306 L 266 305 L 267 305 L 268 306 L 271 306 L 272 307 L 272 308 L 271 309 L 271 310 L 273 310 L 274 311 L 274 310 L 275 309 L 279 309 L 280 310 L 284 310 L 285 311 L 285 313 L 284 314 L 282 314 L 281 313 L 279 313 L 279 314 L 280 313 L 281 314 L 281 315 L 283 315 L 284 316 L 284 317 L 283 318 L 283 320 L 282 321 L 281 320 L 281 321 L 280 322 L 279 321 L 275 321 L 274 322 L 273 322 L 272 321 L 270 321 L 269 320 L 267 320 L 266 321 L 265 320 L 261 320 L 260 319 L 257 319 L 256 318 L 253 318 L 252 317 L 249 317 L 248 316 L 246 316 L 243 313 L 242 313 L 239 310 L 238 310 L 237 309 L 237 308 L 234 305 Z';
const KO_SVG_HTML = [
  '<defs>',
  '<linearGradient id="ko-grad" x1="0%" y1="20%" x2="100%" y2="80%">',
  '<stop offset="0%" stop-color="#f3b7ff"/>',
  '<stop offset="18%" stop-color="#c86bff"/>',
  '<stop offset="48%" stop-color="#8a35ff"/>',
  '<stop offset="100%" stop-color="#3d0b73"/>',
  '</linearGradient>',
  '<filter id="ko-glow" x="-20%" y="-20%" width="140%" height="140%">',
  '<feGaussianBlur stdDeviation="1.4" result="blur"/>',
  '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
  '</filter>',
  '<filter id="ko-ds" x="-25%" y="-25%" width="150%" height="150%">',
  '<feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="rgba(0,0,0,0.9)"/>',
  '</filter>',
  '</defs>',
  '<g filter="url(#ko-ds)">',
  '<svg viewBox="0 0 433 405" width="100" height="100">',
  '<g filter="url(#ko-glow)">',
  `<path d="${KO_PATH}" fill="url(#ko-grad)" fill-rule="evenodd" stroke="#f8dcff" stroke-width="1.6" stroke-linejoin="round"/>`,
  '</g>',
  '</svg>',
  '</g>',
].join('');

function buildKoOverlayShape(fen: string): DrawShape | null {
  if (currentEval.mate !== 0) return null;
  const losingColor = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const kingSquare = findKingSquare(fen, losingColor);
  if (!kingSquare) return null;
  return {
    orig: kingSquare as any,
    customSvg: { html: KO_SVG_HTML },
  };
}

function findKingSquare(fen: string, color: 'white' | 'black'): string | null {
  const board = fen.split(' ')[0] ?? '';
  const target = color === 'white' ? 'K' : 'k';
  let rank = 8;
  let file = 0;
  for (const ch of board) {
    if (ch === '/') {
      rank--;
      file = 0;
      continue;
    }
    const empty = Number.parseInt(ch, 10);
    if (!Number.isNaN(empty)) {
      file += empty;
      continue;
    }
    if (ch === target) return `${'abcdefgh'[file]}${rank}`;
    file++;
  }
  return null;
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
  applyAutoShapes(buildArrowShapes());
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
        applyAutoShapes(buildArrowShapes());
      }, arrowSuppressUntil - now);
    }
    return;
  }
  if (arrowDebounceTimer !== null) { clearTimeout(arrowDebounceTimer); }
  arrowDebounceTimer = setTimeout(() => {
    arrowDebounceTimer = null;
    applyAutoShapes(buildArrowShapes());
  }, 150);
}

function applyAutoShapes(shapes: DrawShape[]): void {
  const cg = _getCgInstance();
  if (!cg) return;
  if (cg !== lastAutoShapesCg) {
    lastAutoShapesCg = cg;
    lastAutoShapesHash = null;
  }
  const nextHash = autoShapesHash(shapes);
  if (nextHash === lastAutoShapesHash) return;
  lastAutoShapesHash = nextHash;
  cg.setAutoShapes(shapes);
}

function autoShapesHash(shapes: DrawShape[]): string {
  return shapes.map(shape => [
    shape.orig ?? '',
    shape.dest ?? '',
    shape.brush ?? '',
    shape.piece ? `${shape.piece.color}|${shape.piece.role}|${shape.piece.scale ?? ''}` : '',
    shape.modifiers ? `${shape.modifiers.lineWidth ?? ''}|${shape.modifiers.hilite ?? ''}` : '',
    shape.customSvg ? `${shape.customSvg.center ?? ''}|${shape.customSvg.html}` : '',
    shape.label ? `${shape.label.text}|${shape.label.fill ?? ''}` : '',
    shape.below ? '1' : '',
  ].join('~')).join(';');
}

function cancelLiveEngineUiRefresh(): void {
  if (liveEngineUiTimer !== null) {
    clearTimeout(liveEngineUiTimer);
    liveEngineUiTimer = null;
  }
  liveEngineUiNeedsRetroCheck = false;
}

function flushLiveEngineUiRefresh(): void {
  liveEngineUiTimer = null;
  liveEngineUiLastFlushAt = Date.now();
  syncArrowDebounced();
  _redraw();
  if (liveEngineUiNeedsRetroCheck) _getCtrl().retro?.onCeval();
  liveEngineUiNeedsRetroCheck = false;
}

function scheduleLiveEngineUiRefresh(includeRetroCheck = false): void {
  liveEngineUiNeedsRetroCheck ||= includeRetroCheck;
  const elapsed = Date.now() - liveEngineUiLastFlushAt;
  if (elapsed >= LIVE_ENGINE_UI_THROTTLE_MS && liveEngineUiTimer === null) {
    flushLiveEngineUiRefresh();
    return;
  }
  if (liveEngineUiTimer !== null) return;
  const wait = Math.max(0, LIVE_ENGINE_UI_THROTTLE_MS - elapsed);
  liveEngineUiTimer = setTimeout(flushLiveEngineUiRefresh, wait);
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
    let depth: number | undefined;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'multipv') {
        const next = parts[i + 1];
        if (next === undefined) break;
        pvIndex = parseInt(next, 10);
        i++;
      } else if (parts[i] === 'depth') {
        // Parse search depth — used by retroCtrl.ts onCeval() readiness check.
        // Mirrors lichess-org/lila: retroCtrl.ts isCevalReady node.ceval.depth.
        const next = parts[i + 1];
        if (next === undefined) break;
        depth = parseInt(next, 10);
        i++;
      } else if (parts[i] === 'score') {
        const scoreType = parts[i + 1];
        const scoreValue = parts[i + 2];
        if (scoreType === undefined || scoreValue === undefined) break;
        isMate = scoreType === 'mate';
        score = parseInt(scoreValue, 10);
        i += 2;
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
        if (isMate) {
          ev.mate = s;
          delete ev.cp;
        } else {
          ev.cp = s;
          delete ev.mate;
        }
      }
      if (best) ev.best = best;
      if (pvMoves.length > 0 && !evalIsThreat) ev.moves = pvMoves;
      if (depth !== undefined && !evalIsThreat) ev.depth = depth;
      if ((score !== undefined || best) && !_isBatchActive()) {
        scheduleLiveEngineUiRefresh(!evalIsThreat);
      }
    } else if (!evalIsThreat && score !== undefined) {
      // Secondary PV line (MultiPV 2, 3, …).
      // Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts multiPv handling.
      if (evalNodePath !== _getCtrl().path) return; // stale path guard
      const s = evalNodePly % 2 === 1 ? -score : score;
      const idx = pvIndex - 1;
      if (!pendingLines[idx]) pendingLines[idx] = {};
      const pl = pendingLines[idx]!;
      if (isMate) {
        pl.mate = s;
        delete pl.cp;
      } else {
        pl.cp = s;
        delete pl.mate;
      }
      if (best) pl.best = best;
      if (pvMoves.length > 0) pl.moves = pvMoves;
      currentEval.lines = pendingLines.slice(1).filter(Boolean) as EvalLine[];
      if (!_isBatchActive()) scheduleLiveEngineUiRefresh();
    }
  } else if (parts[0] === 'bestmove') {
    cancelLiveEngineUiRefresh();
    // Discard the stale bestmove that arrives after a 'stop' interrupted a previous search.
    // Also resume any pending eval so the current position is not left unevaluated.
    if (pendingStopCount > 0) {
      pendingStopCount--;
      currentEval  = {};
      pendingLines = [];
      if (pendingEval) {
        // The stopped search has ended — the engine is now idle.
        // Reset engineSearchActive before resuming so evalCurrentPosition() sees a
        // genuinely idle engine and enters the start-new-search branch.
        // Without this reset, evalCurrentPosition() sees engineSearchActive=true,
        // sends another stop (incrementing pendingStopCount back to 1), receives no
        // bestmove in reply (engine was already idle), and analysis stalls permanently.
        engineSearchActive = false;
        evalCurrentPosition();
      }
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
  cancelLiveEngineUiRefresh();
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
    cancelLiveEngineUiRefresh();
    currentEval = { ...cached };
    syncArrow();
    _redraw();
    if (threatMode) evalThreatPosition();
    return;
  }
  cancelLiveEngineUiRefresh();
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
    // But if a reevaluation is already pending, don't queue additional stale-bestmove
    // discards for the same interrupted search. Rapid navigation can call
    // evalCurrentPosition() multiple times before the engine answers the first stop;
    // incrementing pendingStopCount on every call leaves extra stale credits behind,
    // so a later real bestmove for the current position is wrongly discarded and
    // live analysis appears to stall.
    // Mirrors the Lichess ceval pattern of swapping to the latest queued work rather
    // than repeatedly stacking stop bookkeeping for the same in-flight search.
    if (!pendingEval) {
      pendingStopCount++;
      protocol.stop();
    }
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
    cancelLiveEngineUiRefresh();
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
