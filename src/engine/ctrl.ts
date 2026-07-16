// Engine lifecycle: protocol, eval state, arrows, threat mode.
// Mirrors lichess-org/lila: ui/lib/src/ceval/ toggle + state management.

import type { Api as CgApi } from '@lichess-org/chessground/api';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { StockfishProtocol } from '../ceval/protocol';
import { evalWinChances, type MoveLabel } from './winchances';
import { isDeeperEval } from '../idb/index';
import type { AnalyseCtrl } from '../analyse/ctrl';
import { type EngineMode, type EngineStrengthConfig, STRENGTH_LEVELS, DEFAULT_STRENGTH_LEVEL } from './types';
import { record, Severity } from '../diagnostics';
import { nodeListAt } from '../tree/ops';
import {
  contextFromNodeList,
  engineFenEquals,
  engineFenHash,
  fenOnlyPositionContext,
  normalizeEngineFen,
  type EnginePositionContext,
} from './positionContext';




import {
  initShapeSink,
  buildArrowShapes,
  buildEngineArrowShapes,
  setRepertoireArrowShapeProvider,
  setExtraArrowSuppressProvider,
  setExtraAutoShapesProvider,
  syncArrow,
  syncArrowForced,
  syncArrowDebounced,
  armArrowSuppressWindow,
} from '../board/shapeSink';

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
  performance.mark('engine-init-start');
  _getCtrl       = deps.getCtrl;
  _getCgInstance = deps.getCgInstance;
  _redraw        = deps.redraw;
  initShapeSink({ getCtrl: deps.getCtrl, getCgInstance: deps.getCgInstance });
  performance.mark('engine-init-end');
}

// --- Silent LFYM eval hook ---

let silentEvalActive = false;
let onSilentEvalBestmove: (() => void) | null = null;


let silentEvalFenGuardDropLogAt = 0;
const SILENT_EVAL_FEN_GUARD_DROP_THROTTLE_MS = 15_000;


let silentEvalCancelStopFailureLogAt = 0;
// Bounded diagnostic throttle for an owner-aware foreground cancellation whose protocol stop
// throws synchronously. Kept separate from the LFYM silent-eval diagnostic because the two
// cancellation paths have independent owners and recovery semantics.
let foregroundCancelStopFailureLogAt = 0;

export function isSilentEvalActive(): boolean {
  return silentEvalActive;
}

// Callback fired when live eval writes an improved result to evalCache.
// Registered by main.ts to debounce IDB persistence.
let _onLiveEvalImproved: (() => void) | null = null;
export function setOnLiveEvalImproved(fn: (() => void) | null): void { _onLiveEvalImproved = fn; }
// Symmetric getter so a transient owner (e.g. Study Detail's engine) can capture the current
// callback before overwriting it and RESTORE it on exit, instead of nulling it (BUG-2026-07-12-001).
export function getOnLiveEvalImproved(): (() => void) | null { return _onLiveEvalImproved; }



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
















interface ActiveSearchDescriptor {
  /** True when the active search is an override (openings / puzzle / study-detail). */
  isOverride: boolean;
  /** Override searches only: negate raw engine scores to white POV (searched FEN is black-to-move). */
  blackToMove: boolean;
  /** False for override searches — they have no analysis-tree node to promote into `evalCache`. */
  hasCacheTarget: boolean;
}
let _activeSearchDescriptor: ActiveSearchDescriptor = {
  isOverride: false,
  blackToMove: false,
  hasCacheTarget: true,
};

/** Whether a FEN's side-to-move field is black. */
function fenIsBlackToMove(fen: string): boolean {
  return fen.split(' ')[1] === 'b';
}

/**
 * Whether the active search's raw engine score must be negated to reach white POV.
 * Threat mode never negates (threatEval is displayed from the threatened side). Override searches
 * derive it from the searched FEN's side-to-move (Decision 2); normal analysis uses tree-ply
 * parity (odd ply = black to move), unchanged.
 */
function scoreShouldNegateForWhitePov(): boolean {
  if (evalIsThreat) return false;
  if (_activeSearchDescriptor.isOverride) return _activeSearchDescriptor.blackToMove;
  return evalNodePly % 2 === 1;
}

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
let        evalIsThreat = false;
export let threatEval: PositionEval = {};

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

export function recordVisibleGuidanceDrop(reason: string, visibleFen: string, uci?: string): void {
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
 * Cancel exactly the active foreground search owned by `owner`.
 *
 * Surface teardown must not stop whichever shared-protocol user happens to be current. The
 * immutable foreground identity is the authority: a different owner (or no identity) is a strict
 * no-op. An accepted cancellation invalidates result/UI promotion identity and drops any queued
 * successor before issuing an exactly-once credited stop. The credit is published before stop so
 * a synchronous bestmove can drain re-entrantly; nothing is written after a successful stop.
 */
export function cancelForegroundSearchForOwner(owner: SharedProtocolBusyOwner): boolean {
  if (activeForegroundSearchIdentity?.owner !== owner) return false;

  const searchOutstanding = engineSearchActive;
  // Only pendingEval proves that the global credit belongs to this exact interrupted foreground
  // search. A nonzero global count may instead belong to another drain already in flight.
  const alreadyStopping = pendingEval && pendingStopCount > 0;

  invalidateForegroundSearchIdentity();
  pendingEval = false;
  cancelLiveEngineUiRefresh();

  if (!searchOutstanding || alreadyStopping) return true;

  pendingStopCount++;
  const creditsBeforeStop = pendingStopCount;
  try {
    protocol.stop();
  } catch (error) {
    // If stop synchronously delivered bestmove before throwing, the drain gate already consumed
    // this credit. Roll back only an undrained credit and never let engine health block P0 close.
    if (pendingStopCount === creditsBeforeStop) pendingStopCount--;
    // A protocol implementation may become idle before its send throws. Keep controller search
    // state aligned so reopen cannot queue behind a bestmove the idle protocol will never emit.
    if (!protocol.isAnalyzing()) engineSearchActive = false;
    const now = Date.now();
    if (now - foregroundCancelStopFailureLogAt >= SILENT_EVAL_FEN_GUARD_DROP_THROTTLE_MS) {
      foregroundCancelStopFailureLogAt = now;
      record({
        kind: 'engine',
        severity: Severity.Warn,
        source: 'engine.ctrl',
        sourceTag: 'engine',
        message: 'foreground-owner-cancel-stop-failed',
        metadata: {
          eventType: 'foreground-owner-cancel-stop-failed',
          owner,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        redactionClass: 'safe',
      });
    }
  }
  return true;
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
let _pendingAnalysisResume = false;

/** Drops any queued play-mode dispatch without running it (used by cancelPlayMove()). */
export function clearPendingPlayDispatch(): void {
  _pendingPlayDispatch = null;
}

/**
 * Cancelling a Practice request before its dispatch must not strand the shared foreground engine
 * after the predecessor drain. Replace only an actually queued Practice destination with one
 * current-FEN Analysis resume; delayed/idle cancellation remains a no-op.
 */
export function replacePendingPlayDispatchWithAnalysisResume(): void {
  if (_pendingPlayDispatch === null) return;
  _pendingPlayDispatch = null;
  _pendingAnalysisResume = true;
}

function resumeAnalysisModeNow(): void {
  engineMode = 'analysis';
  playStrengthConfig = null;
  // This destination is the latest Analysis request. Consume any older pendingEval token before
  // evalCurrentPosition(), including the cached-hit path that returns without clearing it.
  pendingEval = false;
  protocol.setAnalysisMode();
  if (engineEnabled && engineReady) evalCurrentPosition();
}

/** Dispatches the exclusive latest Practice-or-Analysis destination after every stop drains. */
function dispatchPendingForegroundDestination(): boolean {
  if (pendingStopCount > 0) return false;
  if (_pendingPlayDispatch) {
    const dispatch = _pendingPlayDispatch;
    _pendingPlayDispatch = null;
    _pendingAnalysisResume = false;
    dispatch();
    return true;
  }
  if (_pendingAnalysisResume) {
    _pendingAnalysisResume = false;
    resumeAnalysisModeNow();
    return true;
  }
  return false;
}

/**
 * Stops one currently-running foreground search and records its exact owed bestmove before the
 * stop send. This is used at the point where a new stop is actually issued, so consecutive owners
 * retain one drain credit per predecessor instead of collapsing them into a guessed count later.
 */
function stopForegroundSearchWithDrainCredit(): boolean {
  if (!protocol.isAnalyzing()) return false;
  pendingStopCount++;
  protocol.stop();
  return true;
}

/**
 * Own the exact shared-foreground predecessor set before dispatching a queued destination. An
 * actively analyzing protocol is a distinct current search and must receive its own stop credit
 * even when older stopped searches are still draining. When the protocol is already idle, an
 * existing credit proves that predecessor was already accounted; otherwise the controller-active
 * fallback recovers one externally stopped predecessor without sending a duplicate stop.
 */
function ensureForegroundPredecessorDrainCredit(): void {
  if (stopForegroundSearchWithDrainCredit()) return;
  if (pendingStopCount > 0) return;
  const predecessorOutstanding = engineSearchActive;
  if (!predecessorOutstanding) return;
  pendingStopCount++;
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
    // Install the successor before stop(): Stockfish may emit the predecessor bestmove
    // synchronously from the stop send, and that drain must see the destination to dispatch.
    _pendingAnalysisResume = false;
    _pendingPlayDispatch = () => {
      engineMode = 'play';
      protocol.setPlayStrength(config);
      dispatch();
    };
    ensureForegroundPredecessorDrainCredit();
    return;
  }
  _pendingAnalysisResume = false;
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
  const analysisResumeMustWait = pendingStopCount > 0 || protocol.isAnalyzing() || engineSearchActive;
  if (analysisResumeMustWait) {
    _pendingPlayDispatch = null;
    _pendingAnalysisResume = true;
    // Normal Practice teardown already owns a credit via cancelPlayMove(). Keep exitPlayMode safe
    // for any direct active-search caller too, with destination-before-stop re-entrancy ordering.
    ensureForegroundPredecessorDrainCredit();
    return;
  }
  _pendingPlayDispatch = null;
  _pendingAnalysisResume = false;
  resumeAnalysisModeNow();
}

// --- Arrow rendering ---
// Moved to src/board/shapeSink.ts (CCW-H01) — buildArrowShapes, buildEngineArrowShapes, the
// arrow-shape builder helpers, the KO overlay, syncArrow/syncArrowForced/syncArrowDebounced,
// applyAutoShapes/autoShapesHash, and the provider-registration hooks all live there now.
// Re-exported here so every existing caller (main.ts, keyboard.ts, board/index.ts, ceval/view.ts,
// analysisControls.ts, pgnExport.ts, retroView.ts, puzzles/view.ts, openings/view.ts,
// openings/explorerView.ts) keeps importing from this same path, unchanged.
export {
  buildArrowShapes,
  buildEngineArrowShapes,
  setRepertoireArrowShapeProvider,
  setExtraArrowSuppressProvider,
  setExtraAutoShapesProvider,
  syncArrow,
  syncArrowForced,
  syncArrowDebounced,
};

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

  // Lichess keeps info inert once current work is stop-requested. Patzer's credited drain is the
  // equivalent owner boundary: until every predecessor bestmove arrives, no info line can belong
  // to the queued Practice-or-Analysis destination, regardless of mutable engineMode.
  if (parts[0] === 'info' && pendingStopCount > 0) return;












  if (parts[0] === 'bestmove' && pendingStopCount > 0) {
    cancelLiveEngineUiRefresh();
    pendingStopCount--;
    currentEval  = {};
    currentEvalIdentity = null;
    pendingLines = [];
    engineSearchActive = false;
    if (pendingStopCount === 0 && dispatchPendingForegroundDestination()) {
      // The exclusive foreground destination owns the now-idle protocol.
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



        const s = scoreShouldNegateForWhitePov() ? -score : score;
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







          if (!_activeSearchDescriptor.isOverride) {
            _onLiveEvalInfo?.(evalNodePath, { ...currentEval });
          }







          if (_activeSearchDescriptor.hasCacheTarget && currentEval.depth !== undefined && (currentEval.cp !== undefined || currentEval.mate !== undefined)) {
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
      // White-POV normalization for secondary PVs — same descriptor-aware rule as the primary
      // branch so override searches negate by searched-FEN side-to-move, not placeholder ply 0.
      const s = scoreShouldNegateForWhitePov() ? -score : score;
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








        if (_activeSearchDescriptor.hasCacheTarget) {
          promoteLiveEval(evalNodePath, evalNodePly, evalParentPath, stored);
        }
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




function handleEngineMessage(line: string): void {
  if (line.trim() === 'readyok') {
    engineReady = true;
    if (_onEngineReady) {
      _onEngineReady();
    } else {
      evalCurrentPosition();
    }
    _redraw();
  } else {
    parseEngineLine(line);
  }
}

// Wire protocol message handler at module init.
protocol.onMessage(handleEngineMessage);







export function __ingestEngineLineForTests(line: string): void {
  handleEngineMessage(line);
}

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
  if (pendingStopCount > 0 && (_pendingPlayDispatch !== null || _pendingAnalysisResume)) {
    ensureForegroundPredecessorDrainCredit();
    pendingEval = true;
    _redraw();
    return;
  }
  cancelLiveEngineUiRefresh();
  threatEval   = {};
  evalIsThreat = true;
  // Threat is not an override: scoreShouldNegateForWhitePov() short-circuits on evalIsThreat and
  // threat output never promotes, but reset the descriptor so no prior override state lingers.
  _activeSearchDescriptor = { isOverride: false, blackToMove: false, hasCacheTarget: true };
  stopForegroundSearchWithDrainCredit();
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
    if (evalIsThreat) { stopForegroundSearchWithDrainCredit(); evalIsThreat = false; }
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
  if (evalIsThreat) { stopForegroundSearchWithDrainCredit(); evalIsThreat = false; }
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
    armArrowSuppressWindow();
    if (pendingStopCount > 0 || engineSearchActive) {
      ensureForegroundPredecessorDrainCredit();
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


    _activeSearchDescriptor = {
      isOverride: true,
      blackToMove: fenIsBlackToMove(positionOverride.currentFen),
      hasCacheTarget: false,
    };
    protocol.setPositionContext(positionOverride);



    const overrideMultiPv = window.matchMedia('(pointer: coarse)').matches ? 1 : multiPv;
    protocol.go(analysisDepth, overrideMultiPv, searchUntilDepth ? undefined : searchTime);
    return;
  }

  const ctrl = _getCtrl();



  _activeSearchDescriptor = { isOverride: false, blackToMove: false, hasCacheTarget: true };
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
  // Order matters: syncArrow() resets the shape sink's arrowSuppressUntil to 0, so arming the
  // suppress window before syncArrow() would be immediately undone.
  // With the window correctly set after syncArrow(), syncArrowDebounced() on the
  // first info line from the new search schedules exactly one deferred update at
  // arrowSuppressUntil (≈500ms). Subsequent info lines during the suppress window
  // are no-ops (timer already queued), so rapid shallow-depth info bursts cannot
  // continuously reset the debounce timer and block arrow updates.
  // Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts ARROW_SETTLE_MS intent.
  syncArrow();
  armArrowSuppressWindow();

  if (pendingStopCount > 0 || engineSearchActive) {
    // Stop the old search immediately so the new position starts evaluating sooner.
    // But if a reevaluation is already pending, don't queue additional stale-bestmove
    // discards for the same interrupted search. Rapid navigation can call
    // evalCurrentPosition() multiple times before the engine answers the first stop;
    // incrementing pendingStopCount on every call leaves extra stale credits behind,
    // so a later real bestmove for the current position is wrongly discarded and
    // live analysis appears to stall.
    // Mirrors the Lichess ceval pattern of swapping to the latest queued work rather
    // than repeatedly stacking stop bookkeeping for the same in-flight search.
    ensureForegroundPredecessorDrainCredit();
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










    const silentCancelOwnedStop = cancelSilentEval();
    cancelLiveEngineUiRefresh();
    if (!silentCancelOwnedStop) protocol.stop();
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






function recordSilentEvalFenGuardDrop(stage: 'start' | 'store', nodePly: number, hasNode: boolean): void {
  const now = Date.now();
  if (now - silentEvalFenGuardDropLogAt < SILENT_EVAL_FEN_GUARD_DROP_THROTTLE_MS) return;
  silentEvalFenGuardDropLogAt = now;
  record({
    kind: 'engine',
    severity: Severity.Info,
    source: 'engine.ctrl',
    sourceTag: 'engine',
    message: 'silent-eval-fen-guard-drop',
    metadata: {
      eventType: 'silent-eval-fen-guard-drop',
      stage,
      ply:     nodePly,
      hasNode,
    },
    redactionClass: 'safe',
  });
}







function currentTreeNodeFenAtPath(path: string): string | null {
  try {
    const nodes = nodeListAt(_getCtrl().root, path);
    if (nodes.length !== path.length / 2 + 1) return null;
    return nodes[nodes.length - 1]?.fen ?? null;
  } catch {
    return null;
  }
}

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
  expectedNodeFen: string | null,
  onDisplayResult?: (ev: PositionEval) => void,
): void {
  if (!engineEnabled || !engineReady) return;
  if (engineMode === 'play') return;
  if (isSilentEvalActive()) return;
  if (engineSearchActive) return;















  const storeAllowed = expectedNodeFen !== null && engineFenEquals(expectedNodeFen, positionContext.currentFen);
  if (!storeAllowed && !onDisplayResult) {
    recordSilentEvalFenGuardDrop('start', nodePly, expectedNodeFen !== null);
    return;
  }
  // The searched FEN is this result's identity — captured here, never re-read from mutable state.
  const searchedFen = positionContext.currentFen;

  // Park the eval-node tracking on the target path so the bestmove path guard
  // (line 715) does not reject the result as stale.
  evalNodeId     = '';
  evalNodePath   = nodePath;
  evalNodePly    = nodePly;
  evalParentPath = parentPath;

  // Activate silent mode so info/bestmove handlers skip visible UI side effects.
  silentEvalActive = true;
  // Silent eval is not an override — it stores via its own explicit-path bestmove handler, not
  // promoteLiveEval — but reset the descriptor so no prior override state affects POV/promotion.
  _activeSearchDescriptor = { isOverride: false, blackToMove: false, hasCacheTarget: true };

  onSilentEvalBestmove = () => {
    // Immediately restore normal state so live eval can resume.
    silentEvalActive = false;
    onSilentEvalBestmove = null;

    const stored: PositionEval = { ...currentEval };
    const hasResult = stored.depth !== undefined && (stored.cp !== undefined || stored.mate !== undefined);
    if (!storeAllowed) {


      if (hasResult) onDisplayResult?.(stored);
    } else if (hasResult) {




      const nodeFenNow = currentTreeNodeFenAtPath(nodePath);
      if (nodeFenNow === null || !engineFenEquals(nodeFenNow, searchedFen)) {
        recordSilentEvalFenGuardDrop('store', nodePly, nodeFenNow !== null);
      } else {
        const cached = evalCache.get(nodePath);
        if (!cached || !cached.depth || stored.depth! > cached.depth) {
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

























export function cancelSilentEval(): boolean {
  if (!silentEvalActive) return false;
  const searchOutstanding = engineSearchActive;
  invalidateForegroundSearchIdentity();
  onSilentEvalBestmove = null;
  silentEvalActive     = false;
  currentEval          = {};
  currentEvalIdentity  = null;
  pendingLines         = [];
  pendingLivePromotion = null;
  // No override state may linger onto the successor search.
  _activeSearchDescriptor = { isOverride: false, blackToMove: false, hasCacheTarget: true };
  cancelLiveEngineUiRefresh();
  if (searchOutstanding) {









    pendingEval = true;
    pendingStopCount++;
    const creditsBeforeStop = pendingStopCount;
    try {
      protocol.stop();
    } catch (error) {




      const now = Date.now();
      if (now - silentEvalCancelStopFailureLogAt >= SILENT_EVAL_FEN_GUARD_DROP_THROTTLE_MS) {
        silentEvalCancelStopFailureLogAt = now;
        record({
          kind: 'engine',
          severity: Severity.Warn,
          source: 'engine.ctrl',
          sourceTag: 'engine',
          message: 'silent-eval-cancel-stop-failed',
          metadata: {
            eventType: 'silent-eval-cancel-stop-failed',
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
          redactionClass: 'safe',
        });
      }
      // Truthful accounting: the stop command was not accepted, so nothing will drain OUR credit —
      // roll it back. Skip the rollback when the module emitted the owed bestmove synchronously
      // BEFORE throwing (the drain gate already consumed the credit; never go negative).
      if (pendingStopCount === creditsBeforeStop) pendingStopCount--;
      // Successor delivery must not depend on the failed command. If the protocol reports no
      // active search, no bestmove will ever arrive to fire the queued pendingEval — clear the
      // dead search bookkeeping and start the successor directly (no-ops when the engine is
      // disabled, e.g. the toggle-off seam). If the protocol still reports analyzing, the old
      // search's own bestmove — its identity already invalidated above — will stale-drop through
      // parseEngineLine and fire pendingEval via the existing path.
      if (!protocol.isAnalyzing() && pendingEval) {
        engineSearchActive = false;
        evalCurrentPosition();
      }
    }
    return true;
  }
  return false;
}



export function __getPendingStopCountForTests(): number { return pendingStopCount; }
export function __getPendingEvalForTests(): boolean { return pendingEval; }
export function __resetEngineDrainStateForTests(): void {
  silentEvalActive     = false;
  onSilentEvalBestmove = null;
  pendingStopCount     = 0;
  pendingEval          = false;
  engineSearchActive   = false;
  currentEval          = {};
  currentEvalIdentity  = null;
  pendingLines         = [];
  pendingLivePromotion = null;
  _pendingPlayDispatch = null;
  _pendingAnalysisResume = false;
}
