// Engine lifecycle: protocol, eval state, arrows, threat mode.
// Mirrors lichess-org/lila: ui/lib/src/ceval/ toggle + state management.

import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { annotationShapes as buildBoardGlyphShapes } from '../analyse/boardGlyphs';
import { StockfishProtocol } from '../ceval/protocol';
import { evalWinChances, classifyLoss, type MoveLabel } from './winchances';
import { isDeeperEval } from '../idb/index';
import { formatScore } from '../analyse/evalView';
import { pathInit, pathIsMainline } from '../tree/ops';
import type { AnalyseCtrl } from '../analyse/ctrl';
import type { Glyph } from '../tree/types';
import { type EngineMode, type EngineStrengthConfig, STRENGTH_LEVELS, DEFAULT_STRENGTH_LEVEL } from './types';
import { record, Severity } from '../diagnostics';
import {
  contextFromNodeList,
  engineFenEquals,
  engineFenHash,
  fenOnlyPositionContext,
  normalizeEngineFen,
  type EnginePositionContext,
} from './positionContext';

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
let _repertoireArrowShapeProvider: () => DrawShape[] = () => [];

export function initEngine(deps: {
  getCtrl:       () => AnalyseCtrl;
  getCgInstance: () => CgApi | undefined;
  redraw:        () => void;
}): void {
  performance.mark('engine-init-start');
  _getCtrl       = deps.getCtrl;
  _getCgInstance = deps.getCgInstance;
  _redraw        = deps.redraw;
  performance.mark('engine-init-end');
}

export function setRepertoireArrowShapeProvider(provider: (() => DrawShape[]) | null): void {
  _repertoireArrowShapeProvider = provider ?? (() => []);
}

// --- Silent LFYM eval hook ---

let silentEvalActive = false;
let onSilentEvalBestmove: (() => void) | null = null;

function isSilentEvalActive(): boolean {
  return silentEvalActive;
}

// Callback fired when live eval writes an improved result to evalCache.
// Registered by main.ts to debounce IDB persistence.
let _onLiveEvalImproved: (() => void) | null = null;
export function setOnLiveEvalImproved(fn: (() => void) | null): void { _onLiveEvalImproved = fn; }



let _onLiveEvalUpdated: ((path: string, eval_: PositionEval) => void) | null = null;
export function setOnLiveEvalUpdated(fn: ((path: string, eval_: PositionEval) => void) | null): void {
  _onLiveEvalUpdated = fn;
}

// Callback fired for primary live-analysis info lines before the final bestmove lands.
// Registered by main.ts so LFYM can surface played-move feedback as soon as
// the current-node eval is available, instead of waiting for cache promotion.
let _onLiveEvalInfo: ((path: string, eval_: PositionEval) => void) | null = null;
export function setOnLiveEvalInfo(fn: ((path: string, eval_: PositionEval) => void) | null): void {
  _onLiveEvalInfo = fn;
}

// --- Engine state ---

export const protocol = new StockfishProtocol();

export let engineEnabled     = false;
export let engineReady       = false;
export let engineMode: EngineMode = 'analysis';
export let playStrengthConfig: EngineStrengthConfig | null = null;
let       engineInitialized  = false;
export let currentEval: PositionEval = {};

// Position override for non-analysis-board contexts (openings page, puzzle page).
// When set, evalCurrentPosition() evaluates this position instead of ctrl.node.fen
// and the analysis-board stale-path guards are bypassed.
let _evalPositionOverride: EnginePositionContext | null = null;
let _evalPositionOverrideOwner: SharedProtocolBusyOwner | null = null;
export function setEvalPositionOverride(owner: SharedProtocolBusyOwner, context: EnginePositionContext): void {
  _evalPositionOverrideOwner = owner;
  _evalPositionOverride = context;
}
export function clearEvalPositionOverride(owner: SharedProtocolBusyOwner): void {
  if (_evalPositionOverrideOwner !== owner) return;
  _evalPositionOverride = null;
  _evalPositionOverrideOwner = null;
  _activeOverrideFen = null;
  invalidateForegroundSearchIdentity();
}
export function forceClearEvalPositionOverride(_reason: string): void {
  const hadOverride = _evalPositionOverride !== null || _evalPositionOverrideOwner !== null || _activeOverrideFen !== null;
  _evalPositionOverride = null;
  _evalPositionOverrideOwner = null;
  _activeOverrideFen = null;
  if (hadOverride) {
    invalidateForegroundSearchIdentity();
    if (engineEnabled && engineReady && engineMode === 'analysis' && protocol.isAnalyzing()) {
      pendingStopCount++;
      protocol.stop();
      pendingEval = true;
    }
  }
}
/**
 * Records the exact FEN that the currently-running override search was started for.
 * Set at protocol.setPositionContext() call in the override branch; cleared when a normal
 * (non-override) search starts.  Used by the three stale guards to reject output from
 * a superseded override search even while _evalPositionOverride is still set.
 * Mirrors the Lichess `onNewCeval` exact-FEN check (node.fen !== ev.fen).
 */
let _activeOverrideFen: string | null = null;
export const evalCache = new Map<string, PositionEval>();











let evalCacheRevision = 0;
export function bumpEvalCacheRevision(): void { evalCacheRevision++; }
export function getEvalCacheRevision(): number { return evalCacheRevision; }

let evalNodeId     = '';
let evalNodePath   = '';
let evalNodePly    = 0;
let evalParentPath = '';

/** True between sending 'go' and receiving the corresponding 'bestmove'. */
let engineSearchActive = false;
/** Timestamp (ms) when the current search started. Used for time-based progress display. */
let searchStartedAt: number | null = null;
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

export let multiPv         = storedInt('patzer.multiPv', 3, 1, 5);
export let analysisDepth   = storedInt('patzer.analysisDepth', 30, 18, 30);
export let searchTime      = storedInt('patzer.searchTime', 10000, 1000, 60000);
/** When true, engine searches until depth is reached regardless of searchTime. Default on. */
export let searchUntilDepth = localStorage.getItem('patzer.searchUntilDepth') !== 'false';
export let showEngineArrows = localStorage.getItem('patzer.showEngineArrows') !== 'false';
export let arrowAllLines    = localStorage.getItem('patzer.arrowAllLines') !== 'false';
export let showPlayedArrow  = true;
export let showArrowLabels  = localStorage.getItem('patzer.showArrowLabels') !== 'false';
export let showReviewLabels = localStorage.getItem('patzer.showReviewLabels') !== 'false';
export let showBoardReviewGlyphs = localStorage.getItem('patzer.showBoardReviewGlyphs') !== 'false';
// Default label size is larger on touch/mobile devices (coarse pointer) for legibility.
const ARROW_LABEL_SIZE_DEFAULT = window.matchMedia('(pointer: coarse)').matches ? 18 : 10;
export let arrowLabelSize   = storedInt('patzer.arrowLabelSize', ARROW_LABEL_SIZE_DEFAULT, 6, 18);

// Initialize playStrengthConfig from the stored level on module load.
// Mirrors storedInt pattern used by sibling engine settings above.
playStrengthConfig = STRENGTH_LEVELS[storedInt('patzer.playStrengthLevel', DEFAULT_STRENGTH_LEVEL, 1, 8) - 1] ?? null;

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














let pendingLivePromotion: {
  nodePath:   string;
  nodePly:    number;
  parentPath: string;
  identity:   ForegroundEvalIdentity;
  snapshot:   PositionEval;
} | null = null;

// --- Threat mode ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts toggleThreatMode + keyboard.ts 'x'

export let threatMode   = false;
let       evalIsThreat  = false;
let       threatEval: PositionEval = {};

// --- Setters for external write access ---

export function resetCurrentEval(): void          { currentEval = {}; currentEvalIdentity = null; }
export function setCurrentEval(ev: PositionEval, identity?: CurrentEvalIdentityInput): void {
  currentEval = { ...ev };
  setCurrentEvalIdentity(identity);
}
export function clearEvalCache(): void            { evalCache.clear(); bumpEvalCacheRevision(); }
export function setMultiPv(v: number): void          { multiPv = v; localStorage.setItem('patzer.multiPv', String(v)); }
export function setAnalysisDepth(v: number): void    { analysisDepth = v; localStorage.setItem('patzer.analysisDepth', String(v)); }
export function setSearchTime(v: number): void       { searchTime = v; localStorage.setItem('patzer.searchTime', String(v)); }
export function setSearchUntilDepth(v: boolean): void { searchUntilDepth = v; localStorage.setItem('patzer.searchUntilDepth', String(v)); }
export function isEngineSearching(): boolean       { return engineSearchActive; }
export type SharedProtocolBusyOwner =
  | 'analysis-live'
  | 'analysis-threat'
  | 'play'
  | 'play-delayed'
  | 'lfym-visible-eval'
  | 'lfym-silent-eval'
  | 'puzzle-post-solve'
  | 'study-detail'
  | 'openings-live'
  | 'unknown';

export interface SharedProtocolBusyState {
  busy: boolean;
  owner: SharedProtocolBusyOwner | null;
  surface: string | null;
  analyzing: boolean;
}

interface ForegroundEvalIdentity {
  owner: SharedProtocolBusyOwner;
  fen: string;
  fenHash: string;
  generation: number;
  path?: string;
}

export interface CurrentEvalIdentityInput {
  owner: SharedProtocolBusyOwner;
  fen: string;
  path?: string;
}

let foregroundSearchGeneration = 0;
let activeForegroundSearchIdentity: ForegroundEvalIdentity | null = null;
let currentEvalIdentity: ForegroundEvalIdentity | null = null;
const visibleGuidanceDropLogAt = new Map<string, number>();
const VISIBLE_GUIDANCE_DROP_THROTTLE_MS = 15_000;

function identityFromContext(owner: SharedProtocolBusyOwner, context: EnginePositionContext): ForegroundEvalIdentity | null {
  const normalizedFen = normalizeEngineFen(context.currentFen);
  if (normalizedFen === null) return null;
  return {
    owner,
    fen: normalizedFen,
    fenHash: engineFenHash(normalizedFen),
    generation: ++foregroundSearchGeneration,
    ...(context.path !== undefined ? { path: context.path } : {}),
  };
}

function identityFromInput(input: CurrentEvalIdentityInput): ForegroundEvalIdentity | null {
  const normalizedFen = normalizeEngineFen(input.fen);
  if (normalizedFen === null) return null;
  return {
    owner: input.owner,
    fen: normalizedFen,
    fenHash: engineFenHash(normalizedFen),
    generation: foregroundSearchGeneration,
    ...(input.path !== undefined ? { path: input.path } : {}),
  };
}

function beginForegroundSearch(owner: SharedProtocolBusyOwner, context: EnginePositionContext): ForegroundEvalIdentity | null {
  const identity = identityFromContext(owner, context);
  activeForegroundSearchIdentity = identity;
  currentEvalIdentity = null;
  return identity;
}

function acceptCurrentEvalIdentity(): void {
  currentEvalIdentity = activeForegroundSearchIdentity ? { ...activeForegroundSearchIdentity } : null;
}

function setCurrentEvalIdentity(input: CurrentEvalIdentityInput | null | undefined): void {
  currentEvalIdentity = input ? identityFromInput(input) : null;
}

function invalidateForegroundSearchIdentity(): void {
  foregroundSearchGeneration++;
  activeForegroundSearchIdentity = null;
  currentEvalIdentity = null;
}

function targetForCurrentForegroundSearch(): CurrentEvalIdentityInput | null {
  if (isSilentEvalActive()) return activeForegroundSearchIdentity?.owner === 'lfym-silent-eval' ? activeForegroundSearchIdentity : null;
  if (evalIsThreat) return activeForegroundSearchIdentity?.owner === 'analysis-threat' ? activeForegroundSearchIdentity : null;
  if (_evalPositionOverride && _evalPositionOverrideOwner) {
    return {
      owner: _evalPositionOverrideOwner,
      fen: _evalPositionOverride.currentFen,
      ...(_evalPositionOverride.path !== undefined ? { path: _evalPositionOverride.path } : {}),
    };
  }
  const ctrl = _getCtrl();
  return {
    owner: ctrlRetroFeedbackIsEval() ? 'lfym-visible-eval' : 'analysis-live',
    fen: ctrl.node.fen,
    path: ctrl.path,
  };
}

function foregroundSearchStillCurrent(): boolean {
  if (!activeForegroundSearchIdentity) return false;
  const target = targetForCurrentForegroundSearch();
  if (!target) return false;
  return identityMatchesTarget(activeForegroundSearchIdentity, target);
}

function identityMatchesTarget(identity: ForegroundEvalIdentity, target: CurrentEvalIdentityInput): boolean {
  if (identity.owner !== target.owner) return false;
  if (target.path !== undefined && identity.path !== target.path) return false;
  return engineFenEquals(identity.fen, target.fen);
}

function hasVisibleEvalData(): boolean {
  return currentEval.cp !== undefined
    || currentEval.mate !== undefined
    || currentEval.best !== undefined
    || (currentEval.moves?.length ?? 0) > 0
    || (currentEval.lines?.length ?? 0) > 0;
}

function recordVisibleGuidanceDrop(reason: string, visibleFen: string, uci?: string): void {
  const visibleFenHash = engineFenHash(visibleFen);
  const evalFenHash = currentEvalIdentity?.fenHash ?? activeForegroundSearchIdentity?.fenHash ?? null;
  const owner = currentEvalIdentity?.owner ?? activeForegroundSearchIdentity?.owner ?? _evalPositionOverrideOwner ?? 'unknown';
  const key = `${reason}|${owner}|${visibleFenHash}|${evalFenHash ?? 'none'}|${uci ?? ''}`;
  const now = Date.now();
  const last = visibleGuidanceDropLogAt.get(key) ?? 0;
  if (now - last < VISIBLE_GUIDANCE_DROP_THROTTLE_MS) return;
  visibleGuidanceDropLogAt.set(key, now);
  record({
    kind: 'engine',
    severity: Severity.Warn,
    source: 'engine.ctrl',
    sourceTag: 'engine',
    message: 'live-ceval-visible-guidance-drop',
    metadata: {
      reason,
      owner,
      surface: protocol.currentPositionContext()?.surface ?? null,
      route: location.hash || location.pathname,
      visibleFenHash,
      evalFenHash,
      overrideActive: _evalPositionOverride !== null,
      uci: uci ?? null,
    },
    redactionClass: 'safe',
  });
}

export function currentEvalMatchesFen(fen: string): boolean {
  if (!hasVisibleEvalData()) return false;
  if (!currentEvalIdentity) {
    recordVisibleGuidanceDrop('missing-eval-identity', fen);
    return false;
  }
  const matches = engineFenEquals(currentEvalIdentity.fen, fen);
  if (!matches) recordVisibleGuidanceDrop('eval-fen-mismatch', fen);
  return matches;
}

export function visibleEvalForFen(fen: string): PositionEval {
  return currentEvalMatchesFen(fen) ? currentEval : {};
}

export function isUciLegalInFen(fen: string, uci: string): boolean {
  const setup = parseFen(fen);
  if (!setup.isOk) return false;
  const position = Chess.fromSetup(setup.value);
  if (!position.isOk) return false;
  const move = parseUci(uci);
  return !!move && position.value.isLegal(move);
}

export function evalLineFirstMoveLegalInFen(fen: string, ev: Pick<EvalLine, 'best' | 'moves'>): boolean {
  const uci = ev.moves?.[0] ?? ev.best;
  if (!uci) return true;
  const legal = isUciLegalInFen(fen, uci);
  if (!legal) recordVisibleGuidanceDrop('illegal-visible-pv-first-move', fen, uci);
  return legal;
}

let playMoveRequestPending = false;

export function setPlayMoveRequestPending(pending: boolean): void {
  playMoveRequestPending = pending;
}

function sharedProtocolOwnerForSurface(surface: string | null): SharedProtocolBusyOwner {
  if (surface === 'analysis-threat') return 'analysis-threat';
  if (surface === 'analysis-live') return ctrlRetroFeedbackIsEval() ? 'lfym-visible-eval' : 'analysis-live';
  if (surface === 'lfym-silent-parent') return 'lfym-silent-eval';
  if (surface === 'puzzle-engine' || surface === 'puzzle-engine-view') return 'puzzle-post-solve';
  if (surface === 'study-detail') return 'study-detail';
  if (surface === 'openings-live') return 'openings-live';
  if (surface === 'opening-practice-play') return 'play';
  return surface ? 'unknown' : 'analysis-live';
}

function ctrlRetroFeedbackIsEval(): boolean {
  try {
    return _getCtrl().retro?.feedback() === 'eval';
  } catch {
    return false;
  }
}

/**
 * Minimal read-only busy signal for the shared foreground Stockfish protocol.
 * This intentionally classifies the current protocol owner from existing local state and the
 * most recent EnginePositionContext; it is not a general owner registry.
 */
export function sharedProtocolBusyState(): SharedProtocolBusyState {
  if (playMoveRequestPending) {
    return { busy: true, owner: 'play-delayed', surface: 'opening-practice-play', analyzing: protocol.isAnalyzing() };
  }
  if (engineMode === 'play' && (_playMoveCallback !== null || protocol.isAnalyzing())) {
    return {
      busy: true,
      owner: 'play',
      surface: protocol.currentPositionContext()?.surface ?? 'opening-practice-play',
      analyzing: protocol.isAnalyzing(),
    };
  }
  if (evalIsThreat) {
    return { busy: true, owner: 'analysis-threat', surface: 'analysis-threat', analyzing: protocol.isAnalyzing() };
  }

  const context = protocol.currentPositionContext();
  const surface = context?.surface ?? null;
  const owner = sharedProtocolOwnerForSurface(surface);
  const analyzing = protocol.isAnalyzing() || engineSearchActive;

  if (isSilentEvalActive()) return { busy: true, owner: 'lfym-silent-eval', surface, analyzing };

  if (!analyzing) return { busy: false, owner: null, surface, analyzing: false };
  return { busy: true, owner, surface, analyzing: true };
}

export function isSharedProtocolBusy(): boolean {
  return sharedProtocolBusyState().busy;
}
/**
 * Returns 0–1 representing how far the current search has progressed.
 * Uses whichever of depth or elapsed time is further along, so the bar
 * advances at a useful rate even before the first deep info line arrives.
 */
export function getSearchProgress(): number {
  if (!engineSearchActive || currentEval.depth === undefined && searchStartedAt === null) return 0;
  const depthFraction  = currentEval.depth !== undefined ? currentEval.depth / analysisDepth : 0;
  const timeFraction   = searchStartedAt !== null ? (Date.now() - searchStartedAt) / searchTime : 0;
  return Math.min(1, Math.max(depthFraction, timeFraction));
}
export function clearPendingLines(): void         { pendingLines = []; }
export function setShowEngineArrows(v: boolean): void { showEngineArrows = v; localStorage.setItem('patzer.showEngineArrows', String(v)); }
export function setArrowAllLines(v: boolean): void    { arrowAllLines = v; localStorage.setItem('patzer.arrowAllLines', String(v)); }
export function setShowPlayedArrow(v: boolean): void  { showPlayedArrow = v; }
export function setShowArrowLabels(v: boolean): void  { showArrowLabels = v; localStorage.setItem('patzer.showArrowLabels', String(v)); }
export function setShowReviewLabels(v: boolean): void { showReviewLabels = v; localStorage.setItem('patzer.showReviewLabels', String(v)); }
export function setShowBoardReviewGlyphs(v: boolean): void { showBoardReviewGlyphs = v; localStorage.setItem('patzer.showBoardReviewGlyphs', String(v)); }
export function setArrowLabelSize(v: number): void    { arrowLabelSize = v; localStorage.setItem('patzer.arrowLabelSize', String(v)); }
export function resetEngineSettingsRuntimeForDataManagement(): void {
  multiPv = 3;
  analysisDepth = 30;
  searchTime = 10_000;
  searchUntilDepth = true;
  showEngineArrows = true;
  arrowAllLines = true;
  showArrowLabels = true;
  showReviewLabels = true;
  showBoardReviewGlyphs = true;
  arrowLabelSize = ARROW_LABEL_SIZE_DEFAULT;
  clearPendingLines();
  resetCurrentEval();
  syncArrow();
}
export function incrementPendingStopCount(): void { pendingStopCount++; }
export function stopProtocol(): void              { protocol.stop(); }
export let _playMoveCallback: ((uci: string) => void) | null = null;
export function setPlayMoveCallback(cb: ((uci: string) => void) | null): void { _playMoveCallback = cb; }














let _pendingPlayDispatch: (() => void) | null = null;

/** Drops any queued play-mode dispatch without running it (used by cancelPlayMove()). */
export function clearPendingPlayDispatch(): void {
  _pendingPlayDispatch = null;
}

/**
 * Switch engine to play mode at the given strength level, then invoke `dispatch` (which sends
 * the position + go for the actual play search). If a search is currently outstanding — either
 * still analyzing or already stopped but not yet drained — the mode switch and dispatch are
 * deferred until the engine is confirmed idle (see _pendingPlayDispatch above).
 */
export function enterPlayMode(config: EngineStrengthConfig, dispatch: () => void): void {
  playStrengthConfig = config;
  if (pendingStopCount > 0 || protocol.isAnalyzing() || engineSearchActive) {
    if (protocol.isAnalyzing()) {
      pendingStopCount++;
      protocol.stop();
    }
    _pendingPlayDispatch = () => {
      engineMode = 'play';
      protocol.setPlayStrength(config);
      dispatch();
    };
    return;
  }
  engineMode = 'play';
  protocol.setPlayStrength(config);
  dispatch();
}

/** Returns the last-used strength level (1–8) from localStorage, defaulting to DEFAULT_STRENGTH_LEVEL. */
export function getPlayStrengthLevel(): number {
  return storedInt('patzer.playStrengthLevel', DEFAULT_STRENGTH_LEVEL, 1, 8);
}

/** Persists the selected strength level (1–8) and updates playStrengthConfig. */
export function setPlayStrengthLevel(level: number): void {
  if (level < 1 || level > 8) return;
  localStorage.setItem('patzer.playStrengthLevel', String(level));
  playStrengthConfig = STRENGTH_LEVELS[level - 1] ?? null;
}

/**
 * Return engine to analysis mode and resume evaluating the current position.
 */
export function exitPlayMode(): void {
  engineMode = 'analysis';
  playStrengthConfig = null;
  protocol.setAnalysisMode();
  if (engineEnabled && engineReady) {
    evalCurrentPosition();
  }
}

// --- Arrow rendering ---
// Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts makeShapesFromUci + compute

export function buildArrowShapes(): DrawShape[] {
  const shapes: DrawShape[] = [];
  const ctrl = _getCtrl();
  if (isSilentEvalActive()) return shapes;

  // Suppress engine-guidance arrows whenever retrospection is active and the user has not
  // manually revealed guidance for the current candidate.
  // Covers all retro states (find, fail, win, view, offTrack) — not just isSolving() —
  // so the answer is never accidentally visible at any point during a session.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts showBestMoveArrows() returning false
  // when retro.hideComputerLine(node) is true for unsolved candidate plies.
  const retroHidden = ctrl.retro !== undefined && !ctrl.retro.guidanceRevealed();
  // Additional external suppression (e.g. analysis practice hides the engine display by
  // default while its own verdict/reply evals keep running internally — mirrors
  // lichess-org/lila practiceCtrl hiding ceval UI during practice). Combined with retroHidden
  // below for every gate except the retro-only candidate-arrow branch, which requires
  // ctrl.retro itself and stays keyed on retroHidden alone.
  const externallyHidden = _extraArrowSuppressProvider?.() ?? false;
  const engineGuidanceHidden = retroHidden || externallyHidden;

  if (ctrl.retro === undefined) {
    shapes.push(..._repertoireArrowShapeProvider());
  }

  shapes.push(...buildEngineArrowShapes({ suppress: engineGuidanceHidden, includeThreat: false }));

  if (engineEnabled && threatMode && threatEval.best && !engineGuidanceHidden) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as any, dest: uci.slice(2, 4) as any, brush: 'red' });
  }

  // Board review glyphs: suppress during retro/practice so the opponent's previous move
  // (ctrl.node.uci) does not draw a confusing ?/??  arrow on the exercise/practice position.
  if (showBoardReviewGlyphs && !engineGuidanceHidden) {
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
  if (showPlayedArrow && pathIsMainline(ctrl.root, ctrl.path) && !engineGuidanceHidden) {
    const nextNode = ctrl.node.children[0];
    if (nextNode?.uci) {
      const uci = nextNode.uci;
      const nextEval = evalCache.get(ctrl.path + nextNode.id);
      const visibleEval = visibleEvalForFen(ctrl.node.fen);
      // Use plain red without lineWidth modifier so the arrowhead uses the well-known
      // 'r' brush key (marker arrowhead-r is guaranteed in defs).
      // Mirrors lichess-org/lila: ui/analyse/src/autoShape.ts compute() played-move brush.
      const playedEval = visibleEval.best !== uci ? nextEval : undefined;
      shapes.push(buildArrowShape(uci, 'red'));
      const labelShape = buildArrowLabelShape(uci, playedEval);
      if (labelShape) shapes.push(labelShape);
    }
  }

  const koOverlay = buildKoOverlayShape(ctrl.node.fen);
  if (koOverlay) shapes.push(koOverlay);


  shapes.push(...(_extraAutoShapesProvider?.() ?? []));

  return shapes;
}








let _extraArrowSuppressProvider: (() => boolean) | null = null;
export function setExtraArrowSuppressProvider(fn: (() => boolean) | null): void {
  _extraArrowSuppressProvider = fn;
}

// Extra auto-shape provider seam — lets a feature module (e.g. analysis practice) merge
// its own shapes into the shared auto-shape pipeline without owning cg.setAutoShapes.
// Mirrors lichess-org/lila: ui/analyse/src/autoShape.ts practice hint/hover shape merge.
let _extraAutoShapesProvider: (() => DrawShape[]) | null = null;
export function setExtraAutoShapesProvider(fn: (() => DrawShape[]) | null): void {
  _extraAutoShapesProvider = fn;
}

export function buildEngineArrowShapes(opts?: { suppress?: boolean; includeThreat?: boolean; fen?: string }): DrawShape[] {
  const shapes: DrawShape[] = [];
  const suppress = opts?.suppress === true;
  const includeThreat = opts?.includeThreat !== false;
  const visibleFen = opts?.fen ?? _getCtrl().node.fen;

  if (engineEnabled && showEngineArrows && !suppress && currentEvalMatchesFen(visibleFen)) {
    if (currentEval.best) {
      const uci = currentEval.best;
      if (isUciLegalInFen(visibleFen, uci)) {
        shapes.push(buildArrowShape(uci, 'paleBlue'));
        const labelShape = buildArrowLabelShape(uci, currentEval);
        if (labelShape) shapes.push(labelShape);
      } else {
        recordVisibleGuidanceDrop('illegal-visible-best-arrow', visibleFen, uci);
      }
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
        if (isUciLegalInFen(visibleFen, uci)) {
          shapes.push(buildArrowShape(uci, 'paleGrey', { lineWidth }));
          const labelShape = buildArrowLabelShape(uci, line);
          if (labelShape) shapes.push(labelShape);
        } else {
          recordVisibleGuidanceDrop('illegal-visible-line-arrow', visibleFen, uci);
        }
      }
    }
  }

  if (includeThreat && engineEnabled && threatMode && threatEval.best && !suppress) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as any, dest: uci.slice(2, 4) as any, brush: 'red' });
  }

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
  const visibleEval = visibleEvalForFen(fen);
  if (visibleEval.mate !== 0) return null;
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

export function syncArrowForced(): void {
  lastAutoShapesHash = null;
  syncArrow();
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
  // Discard any captured promotion candidate along with the refresh it was scheduled
  // for — every caller of cancelLiveEngineUiRefresh() (navigation, threat mode, engine
  // toggle-off, every bestmove) is exactly the set of events that can make evalNodePath
  // move on, so a candidate surviving past a cancel would risk promoting stale data.
  pendingLivePromotion = null;
}

function flushLiveEngineUiRefresh(): void {
  liveEngineUiTimer = null;
  liveEngineUiLastFlushAt = Date.now();
  const candidate = pendingLivePromotion;
  pendingLivePromotion = null;
  if (candidate && !evalIsThreat && !isSilentEvalActive() && engineMode !== 'play') {
    // Re-validate against the position currently on screen: this flush can fire up to
    // LIVE_ENGINE_UI_THROTTLE_MS after the info line was captured, so the user may have
    // navigated away (or the override position may have changed) in the interim. Mirrors
    // the bestmove branch's own stale-path re-check (ctrl.ts:877), which itself mirrors
    // lichess-org/lila onNewCeval's `node.fen !== ev.fen` guard.
    const target = targetForCurrentForegroundSearch();
    if (target && identityMatchesTarget(candidate.identity, target)) {
      promoteLiveEval(candidate.nodePath, candidate.nodePly, candidate.parentPath, candidate.snapshot);
    }
  }
  syncArrowDebounced();
  _redraw();
  if (liveEngineUiNeedsRetroCheck) _getCtrl().retro?.onCeval();
  liveEngineUiNeedsRetroCheck = false;
}













function computeLiveEvalPromotion(
  cached:     PositionEval | undefined,
  parentEval: PositionEval | undefined,
  nodePly:    number,
  evalData:   PositionEval,
): PositionEval | null {
  if (evalData.depth === undefined) return null;
  if (evalData.cp === undefined && evalData.mate === undefined) return null;
  if (!isDeeperEval(cached, evalData)) return null;
  const stored: PositionEval = { ...evalData };
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
  // Preserve fields the promoted snapshot may not have populated (an intermediate
  // info-line iteration can still be missing `best`/`label` that a completed search or a
  // stored review already established) so children's played-best checks and stored
  // review labels don't regress.
  if (cached?.best && !stored.best) stored.best = cached.best;
  if (cached?.label && !stored.label) stored.label = cached.label;
  return stored;
}












function promoteLiveEval(
  nodePath:   string,
  nodePly:    number,
  parentPath: string,
  evalData:   PositionEval,
): void {
  const cached     = evalCache.get(nodePath);
  const parentEval = evalCache.get(parentPath);
  const stored = computeLiveEvalPromotion(cached, parentEval, nodePly, evalData);
  if (!stored) return;
  evalCache.set(nodePath, stored);
  bumpEvalCacheRevision();
  _onLiveEvalImproved?.();
  _onLiveEvalUpdated?.(nodePath, stored);
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












  if (parts[0] === 'bestmove' && pendingStopCount > 0) {
    cancelLiveEngineUiRefresh();
    pendingStopCount--;
    currentEval  = {};
    currentEvalIdentity = null;
    pendingLines = [];
    engineSearchActive = false;
    if (pendingStopCount === 0 && _pendingPlayDispatch) {
      const dispatch = _pendingPlayDispatch;
      _pendingPlayDispatch = null;
      dispatch();
    } else if (pendingEval) {
      evalCurrentPosition();
    }
    return;
  }

  // In play mode, ignore info lines entirely — they must not update currentEval or arrows.
  // Route bestmove to _playMoveCallback instead of the analysis eval path.
  // By this point pendingStopCount is guaranteed 0 (the gate above handled it otherwise), so
  // any bestmove reaching here genuinely belongs to the currently active search.
  if (engineMode === 'play') {
    if (parts[0] === 'bestmove') {
      const uci = parts[1];
      const cb = _playMoveCallback;
      _playMoveCallback = null;
      engineSearchActive = false;
      if (uci && uci !== '(none)' && cb) cb(uci);
    }
    return;
  }
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
      // Silent LFYM eval targets a background parent path and suppresses visible live-eval UI
      // while still storing by explicit evalNodePath.
      // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onNewCeval `path === this.path` gate.
      // Override mode: only allow output through when the active search FEN matches the current
      // override FEN — drops stale output for a superseded override position.
      if (!foregroundSearchStillCurrent()) return;
      if (!evalIsThreat) acceptCurrentEvalIdentity();
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
      if ((score !== undefined || best) && !isSilentEvalActive()) {
        if (!evalIsThreat) {
          _onLiveEvalInfo?.(evalNodePath, { ...currentEval });




          if (currentEval.depth !== undefined && (currentEval.cp !== undefined || currentEval.mate !== undefined)) {
            const identity = activeForegroundSearchIdentity;
            if (identity) {
              pendingLivePromotion = {
                nodePath:   evalNodePath,
                nodePly:    evalNodePly,
                parentPath: evalParentPath,
                identity:   { ...identity },
                snapshot:   { ...currentEval },
              };
            }
          }
        }
        scheduleLiveEngineUiRefresh(!evalIsThreat);
      }
    } else if (!evalIsThreat && score !== undefined) {
      // Secondary PV line (MultiPV 2, 3, …).
      // Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts multiPv handling.
      if (!foregroundSearchStillCurrent()) return; // stale owner/FEN guard
      acceptCurrentEvalIdentity();
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
      if (!isSilentEvalActive()) scheduleLiveEngineUiRefresh();
    }
  } else if (parts[0] === 'bestmove') {
    cancelLiveEngineUiRefresh();
    // pendingStopCount > 0 is already handled by the uniform gate at the top of this
    // function, so every bestmove reaching here genuinely belongs to the active search.
    engineSearchActive = false;
    if (!parts[1] || parts[1] === '(none)') {
      if (isSilentEvalActive()) onSilentEvalBestmove?.();
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
      // Override mode: additionally reject bestmove if the active search FEN no longer matches
      // the current override FEN (i.e. the override position changed mid-search).
      if (!foregroundSearchStillCurrent()) {


        // Instrument stale bestmove drop for the live engine: record event type, depth, and movetime.
        // Position context is ply only — never raw FEN.
        record({
          kind: 'engine',
          severity: Severity.Info,
          source: 'engine.ctrl',
          sourceTag: 'engine',
          message: 'stale-bestmove-drop',
          metadata: {
            eventType:    'stale-bestmove-drop',
            depthTarget:  analysisDepth,
            depthReached: currentEval.depth ?? null,
            movetimeMs:   searchUntilDepth ? null : searchTime,
            ply:          evalNodePly,
          },
          redactionClass: 'safe',
        });

        pendingLines = [];
        if (pendingEval) evalCurrentPosition();
        else if (threatMode) evalThreatPosition();
        return;
      }
      acceptCurrentEvalIdentity();
      currentEval.best = parts[1];
      const stored: PositionEval = { ...currentEval };
      pendingLines = [];
      currentEval = stored;
      if (isSilentEvalActive()) {
        onSilentEvalBestmove?.();
      } else {




        promoteLiveEval(evalNodePath, evalNodePly, evalParentPath, stored);
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

// Optional readyok callback for modules that need to customize engine-ready behavior.
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
    if (!isSilentEvalActive() && (line.startsWith('info') || line.startsWith('bestmove'))) {
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
  if (!engineEnabled || !engineReady || isSilentEvalActive()) return;
  if (engineMode === 'play') return;
  cancelLiveEngineUiRefresh();
  threatEval   = {};
  evalIsThreat = true;
  protocol.stop();
  const context = fenOnlyPositionContext(
    flipFenColor(_getCtrl().node.fen),
    'analysis-threat',
    'threat-mode-flips-side-to-move',
  );
  beginForegroundSearch('analysis-threat', context);
  protocol.setPositionContext(context);
  protocol.go(analysisDepth, 1, searchUntilDepth ? undefined : searchTime);
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
  if (isSilentEvalActive()) return;
  if (!engineEnabled || !engineReady) return;
  if (engineMode === 'play') return;
  if (evalIsThreat) { pendingStopCount++; protocol.stop(); evalIsThreat = false; }
  threatEval = {};

  // Override mode: non-analysis-board contexts (openings page, puzzle page) set a
  // position override. Skip ctrl-based path tracking and cache lookup entirely.
  if (_evalPositionOverride) {
    const positionOverride = _evalPositionOverride;
    cancelLiveEngineUiRefresh();
    currentEval  = {};
    currentEvalIdentity = null;
    pendingLines = [];
    syncArrow();
    arrowSuppressUntil = Date.now() + ARROW_SETTLE_MS;
    if (engineSearchActive) {
      if (!pendingEval) { pendingStopCount++; protocol.stop(); }
      pendingEval = true;
      _redraw();
      return;
    }
    pendingEval        = false;
    engineSearchActive = true; searchStartedAt = Date.now();
    evalNodeId         = '';
    evalNodePath       = '';
    evalNodePly        = 0;
    evalParentPath     = '';
    // Record the FEN this override search is actually evaluating so the three stale
    // guards can reject output when the override position changes before bestmove arrives.
    const owner = _evalPositionOverrideOwner ?? sharedProtocolOwnerForSurface(positionOverride.surface);
    beginForegroundSearch(owner, positionOverride);
    _activeOverrideFen = positionOverride.currentFen;
    protocol.setPositionContext(positionOverride);



    const overrideMultiPv = window.matchMedia('(pointer: coarse)').matches ? 1 : multiPv;
    protocol.go(analysisDepth, overrideMultiPv, searchUntilDepth ? undefined : searchTime);
    return;
  }

  const ctrl = _getCtrl();
  const cached = evalCache.get(ctrl.path);
  const cachedHasLines = !!cached?.moves?.length && (cached?.lines?.length ?? 0) >= multiPv - 1;
  if (cached && cachedHasLines) {
    cancelLiveEngineUiRefresh();
    currentEval = { ...cached };
    setCurrentEvalIdentity({
      owner: ctrlRetroFeedbackIsEval() ? 'lfym-visible-eval' : 'analysis-live',
      fen: ctrl.node.fen,
      path: ctrl.path,
    });
    syncArrow();
    _redraw();
    if (threatMode) evalThreatPosition();
    return;
  }
  cancelLiveEngineUiRefresh();
  currentEval  = cached ? { ...cached } : {};
  setCurrentEvalIdentity(cached ? {
    owner: ctrlRetroFeedbackIsEval() ? 'lfym-visible-eval' : 'analysis-live',
    fen: ctrl.node.fen,
    path: ctrl.path,
  } : null);
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
  engineSearchActive = true; searchStartedAt = Date.now();
  evalNodeId         = ctrl.node.id;
  evalNodePath       = ctrl.path;
  evalNodePly        = ctrl.node.ply;
  evalParentPath     = ctrl.path.length >= 2 ? ctrl.path.slice(0, -2) : '';
  // Non-override search: clear the active override FEN so stale override guards
  // do not interfere with normal path-based evaluation.
  _activeOverrideFen = null;
  const context = contextFromNodeList(ctrl.nodeList, 'analysis-live', ctrl.path);
  beginForegroundSearch(ctrlRetroFeedbackIsEval() ? 'lfym-visible-eval' : 'analysis-live', context);
  if (cached) acceptCurrentEvalIdentity();
  protocol.setPositionContext(context);
  protocol.go(analysisDepth, multiPv, searchUntilDepth ? undefined : searchTime);
}

// --- Engine toggle ---
// Adapted from lichess-org/lila: ui/lib/src/ceval/ctrl.ts toggle

export function toggleEngine(): void {
  engineEnabled = !engineEnabled;
  if (engineEnabled) {
    if (location.hash.startsWith('#/analysis')) forceClearEvalPositionOverride('analysis-toggle-on');
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
    currentEvalIdentity = null;
    evalIsThreat = false;
    threatEval   = {};
    forceClearEvalPositionOverride('engine-toggle-off');
    syncArrow();
  }
  _redraw();
}

/**
 * Force-set the engineEnabled flag without triggering analysis-board side effects.
 * Used by the puzzle page to make renderCeval/renderPvBox reflect puzzle engine state.
 */
export function setEngineEnabledFlag(on: boolean): void {
  engineEnabled = on;
}

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

/**
 * Evaluate a single FEN position silently (no UI updates, no arrows, no redraws).
 * Stores the result in evalCache at `nodePath` when the engine bestmove arrives.
 *
 * Uses an explicit silent-eval mode so all live-eval UI side effects are suppressed.
 * Resumes normal live eval after the silent eval completes.
 *
 * Used by retro background eval for candidates missing cp-quality diff data.
 * Mirrors lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts background eval intent
 * (Lichess fires a silent ceval on the candidate's parent position).
 */
export function evalPositionSilent(
  positionContext: EnginePositionContext,
  nodePath:        string,
  parentPath:      string,
  nodePly:         number,
): void {
  if (!engineEnabled || !engineReady) return;
  if (engineMode === 'play') return;
  if (isSilentEvalActive()) return;
  if (engineSearchActive) return;

  // Park the eval-node tracking on the target path so the bestmove path guard
  // (line 715) does not reject the result as stale.
  evalNodeId     = '';
  evalNodePath   = nodePath;
  evalNodePly    = nodePly;
  evalParentPath = parentPath;

  // Activate silent mode so info/bestmove handlers skip visible UI side effects.
  silentEvalActive = true;

  onSilentEvalBestmove = () => {
    // Immediately restore normal state so live eval can resume.
    silentEvalActive = false;
    onSilentEvalBestmove = null;

    const stored: PositionEval = { ...currentEval };
    if (stored.depth !== undefined && (stored.cp !== undefined || stored.mate !== undefined)) {
      const cached = evalCache.get(nodePath);
      if (!cached || !cached.depth || stored.depth > cached.depth) {
        const pEval = evalCache.get(parentPath);
        if (pEval?.cp !== undefined && stored.cp !== undefined) {
          stored.delta = stored.cp - pEval.cp;
        }
        if (pEval) {
          const nodeWcV    = evalWinChances(stored);
          const parentWcV  = evalWinChances(pEval);
          if (nodeWcV !== undefined && parentWcV !== undefined) {
            const whiteToMove    = nodePly % 2 === 1;
            const moverNodeWc    = whiteToMove ? nodeWcV   : -nodeWcV;
            const moverParentWc  = whiteToMove ? parentWcV : -parentWcV;
            stored.loss = (moverParentWc - moverNodeWc) / 2;
          }
        }
        if (cached?.label && !stored.label) stored.label = cached.label;
        evalCache.set(nodePath, stored);
        bumpEvalCacheRevision();
      }
    }
    // Resume live analysis once the silent eval is done.
    evalCurrentPosition();
  };

  engineSearchActive = true;
  searchStartedAt    = Date.now();
  currentEval        = {};
  currentEvalIdentity = null;
  pendingLines       = [];
  beginForegroundSearch('lfym-silent-eval', positionContext);
  protocol.setPositionContext(positionContext);
  protocol.go(analysisDepth, 1, searchUntilDepth ? undefined : searchTime);
}
