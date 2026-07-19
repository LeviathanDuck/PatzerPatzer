





















import { h, type VNode } from 'snabbdom';
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { makeSan } from 'chessops/san';
import { makePgn, defaultHeaders, ChildNode, Node as PgnNode, type PgnNodeData } from 'chessops/pgn';
import { chainDrillLine } from './drillPromotion';
import { openDrillCatalogPromotion } from './drillCatalogView';
import { requestSelectedGameAnalysis } from '../../analyse/pgnExport';
import { requestPlayMove, cancelPlayMove } from '../../engine/playMove';
import { fenOnlyPositionContext } from '../../engine/positionContext';
import { engineMode, exitPlayMode } from '../../engine/ctrl';
import { controlExplainerAttrs } from '../../ui/controlExplainer';
import { resolveOrpSettings } from './settings';
import { readOrpGlobalDefaults } from '../../sync/settingsLiveApply';
import {
  createEngineDrill, resumeEngineDrill, applyReplyPosition,
  MIN_GOAL_VERDICT_DEPTH,
  type EngineDrillController, type EngineDrillState, type EngineDrillSnapshot,
  type DrillGoal, type DrillDifficulty, type DrillTerminal,
} from './engineDrillCtrl';
import {
  renderDrillSetup, renderDrillReadout, renderDrillResult,
  type DrillGoalChoice, type DrillAutoNextProps,
} from './engineDrillView';
import {
  createEngineDrillRecord, saveEngineDrillRecord,
} from '../studyDb';
import type { EngineDrillRecord, EngineDrillSettingsChange, EngineDrillOutcome } from '../types';

export interface EngineDrillHostDeps {
  /** Exact FEN of the current board position. */
  getCurrentFen(): string;
  /** Current tree path (captured at drill start so retry/next can return there). */
  getCurrentPath(): string;
  /** Navigate the board to a tree path (used to return to the drill start). */
  navigate(path: string): void;
  /** Apply a UCI move to the live board/tree (engine replies land through here). */
  playUciMove(uci: string): void;


  getEvalForCurrent(): { readonly cp?: number; readonly mate?: number; readonly depth?: number; readonly best?: string } | undefined;


  openPgnOnBoard?(pgn: string): void;



  engineSeam?: {
    requestReply(fen: string, maxDepth: number, onMove: (uci: string) => void, onError: () => void): void;
    cancelReply(): void;
  };
  redraw(): void;
  now(): number;
}

let deps: EngineDrillHostDeps | null = null;

// --- Active-drill module state ----------------------------------------------

let _drill: EngineDrillController | null = null;
let _drillId: string | null = null;
let _record: EngineDrillRecord | null = null;
let _startPath: string | null = null;
let _finishedState: EngineDrillState | null = null; // result surface source after completion
let _settingsHistory: EngineDrillSettingsChange[] = [];
let _lastConfig: DrillStartConfig | null = null;    // for Next drill / Retry
let _clockTimer: ReturnType<typeof setInterval> | null = null;



let _pendingBoardReply: { readonly uci: string; readonly forFen: string } | null = null;

let _assistanceThisMove: string[] = [];
let _revealedBest: { readonly fen: string; readonly san: string } | null = null;

// Pending verdict probes: exact FEN → callbacks, resolved from live-eval ticks at the depth gate.
const _pendingVerdicts = new Map<string, Array<(r: { readonly fen: string; readonly cp?: number; readonly mate?: number; readonly depth: number }) => void>>();
const MAX_PENDING_VERDICT_FENS = 8;

// Setup surface state (module-owned; the D14 view is stateless).
let _setupGoal: DrillGoalChoice = 'outcome-win';
let _setupGoalMoves = 10;

let _setupEvalCp = 100;
let _setupEvalHold = 3;
let _setupMaxCritical = 0;
let _setupTimeLimitMinutes: number | null = null;
let _setupDifficulty: DrillDifficulty = 'casual';
let _setupDifficultySynced = false;
let _setupLearnerIsWhite = true;
let _setupMoveLimit: number | null = null;

// Result-surface UI state. Auto-next is OFF by default and remembered ONLY for this session
// (§12.4) — module state, never persisted.
let _secondaryOpen = false;
let _autoNextEnabled = false;
let _autoNextSeconds: number | undefined;
let _autoNextTimer: ReturnType<typeof setInterval> | null = null;
let _panelNotice: string | null = null;
const AUTO_NEXT_COUNTDOWN_S = 5;

export interface DrillStartConfig {
  readonly startFen: string;
  readonly learnerIsWhite: boolean;
  readonly goals: readonly DrillGoal[];
  readonly moveLimit?: number;
  readonly timeLimitMs?: number;
  readonly difficulty: string;
  readonly retryOfDrillId?: string;
}

export function initEngineDrillHost(d: EngineDrillHostDeps): void {
  deps = d;
}

export function engineDrillActive(): boolean {
  return _drill !== null;
}
export function engineDrillFinished(): boolean {
  return _finishedState !== null;
}

// --- Chess adjudication (host-owned) ----------------------------------------

function positionFromFen(fen: string): Chess | null {
  const setup = parseFen(fen);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.value);
  return pos.isErr ? null : pos.value;
}

/** Post-move FEN computed from the EXACT bound pre-move FEN — never from board state. */
function fenAfterUci(fen: string, uci: string): { readonly fen: string; readonly san?: string } | null {
  const pos = positionFromFen(fen);
  const move = parseUci(uci);
  if (!pos || !move) return null;
  if (!pos.isLegal(move)) return null;
  const san = makeSan(pos, move);
  pos.play(move);
  return { fen: makeFen(pos.toSetup()), san };
}

function adjudicate(fenAfter: string, learnerIsWhite: boolean): DrillTerminal | null {
  const pos = positionFromFen(fenAfter);
  if (!pos) return null;
  const outcome = pos.outcome();
  if (outcome) {
    if (outcome.winner !== undefined) {
      return { kind: 'checkmate', winnerIsLearner: outcome.winner === (learnerIsWhite ? 'white' : 'black') };
    }
    return pos.isStalemate() ? { kind: 'stalemate' } : { kind: 'draw' };
  }
  if (fenAfter.split(' ')[4] === '100') return { kind: 'draw' };
  return null;
}

// --- Persistence (D15 incremental saves) ------------------------------------

function outcomeOf(state: EngineDrillState, learnerResigned = false): EngineDrillOutcome | null {
  const t = state.terminal;
  if (t?.kind === 'checkmate') return t.winnerIsLearner ? 'won' : 'lost';
  if (t?.kind === 'stalemate' || t?.kind === 'draw') return 'draw';
  if (t?.kind === 'resignation') return t.byLearner ? 'lost' : 'won';
  if (learnerResigned) return 'lost';
  if (state.phase === 'complete') return 'ended';
  return null;
}

function persistActiveDrill(completionState?: 'interrupted'): void {
  const drill = _drill;
  const d = deps;
  if (!drill || !d || _drillId === null || _record === null) return;
  const state = drill.state();
  const updated: EngineDrillRecord = {
    ..._record,
    snapshot: drill.snapshot(),
    settingsHistory: [..._settingsHistory],
    outcome: outcomeOf(state),


    ...(state.phase === 'complete' && state.score !== null ? { finalScore: state.score } : {}),
    ...(state.phase === 'complete' && state.goalResults !== null ? { goalResults: state.goalResults } : {}),
    completionState: completionState ?? (state.phase === 'complete' ? 'complete' : 'partial'),
    updatedAt: d.now(),
  };
  _record = updated;
  saveEngineDrillRecord(updated).catch(e => {
    console.warn('engine-drill: incremental catalog save failed', e);
  });
}

// --- Verdict seam (live-eval ticks → depth-gated exact-FEN forwarding) -------

/** Live analysis eval landed — called from the same ticks that drive practiceOnCeval. */
export function engineDrillOnCeval(): void {
  const d = deps;
  if (!d || _drill === null) return;
  const fen = d.getCurrentFen();
  applyPendingBoardReplyIfAtPosition(fen);
  const ev = d.getEvalForCurrent();
  if (ev === undefined || ev.depth === undefined || ev.depth < MIN_GOAL_VERDICT_DEPTH) return;


  _drill.attachEvalForFen(fen, {
    ...(ev.cp !== undefined ? { cp: ev.cp } : {}),
    ...(ev.mate !== undefined ? { mate: ev.mate } : {}),
    ...(ev.depth !== undefined ? { depth: ev.depth } : {}),
  });
  const callbacks = _pendingVerdicts.get(fen);
  if (callbacks === undefined) return;
  _pendingVerdicts.delete(fen);
  const result = {
    fen,
    ...(ev.cp !== undefined ? { cp: ev.cp } : {}),
    ...(ev.mate !== undefined ? { mate: ev.mate } : {}),
    depth: ev.depth,
  };
  for (const cb of callbacks) cb(result);
}

// --- Drill lifecycle ---------------------------------------------------------

function clearTimers(): void {
  if (_clockTimer !== null) { clearInterval(_clockTimer); _clockTimer = null; }
  cancelAutoNext();
}

function cancelAutoNext(): void {
  if (_autoNextTimer !== null) { clearInterval(_autoNextTimer); _autoNextTimer = null; }
  _autoNextSeconds = undefined;
}

function teardownDrill(): void {


  if (_drill !== null) _drill.dispose();
  clearTimers();
  _pendingVerdicts.clear();
  _pendingBoardReply = null;
  _assistanceThisMove = [];
  _revealedBest = null;
  cancelPlayMove();
  if (engineMode === 'play') exitPlayMode();
  _drill = null;
}

function buildDeps(learnerIsWhite: boolean): Parameters<typeof createEngineDrill>[0]['deps'] {
  const d = deps!;
  void learnerIsWhite;
  const dispatchReply = (
    fen: string,
    strength: Parameters<typeof requestPlayMove>[0]['strength'],
    onMove: (uci: string) => void,
    onError: () => void,
  ): void => {
    const seam = d.engineSeam;
    if (seam !== undefined) {
      seam.requestReply(fen, strength.maxDepth, onMove, onError);
      return;
    }
    requestPlayMove({
      position: fenOnlyPositionContext(fen, 'engine-drill-play', 'engine drill reply'),
      strength,
      onMove,
      onError,
    });
  };
  return {
    requestReply: (fen, strength, onMove) => {
      dispatchReply(fen, strength,
        uci => {
          // The controller's exact-FEN stale-drop runs inside onMove; the host resolves the
          // post-reply FEN from the BOUND fen (chessops), never from live board state.
          const drill = _drill;
          if (drill === null) return;
          const applied = fenAfterUci(fen, uci);
          if (applied === null) return; // illegal/garbled reply — never guess (stale-dropped)
          onMove(uci, fen);
          // The controller may have stale-dropped the reply (phase/FEN mismatch). Only proceed
          // when it ACCEPTED: the newest move is the engine's, awaiting its host-resolved FEN —
          // a dropped reply must never touch the board or adjudication.
          const afterState = drill.state();
          const lastMove = afterState.moves[afterState.moves.length - 1];
          if (lastMove === undefined || lastMove.byLearner || afterState.phase !== 'awaiting-user') return;
          applyReplyPosition(drill, applied.fen);
          if (engineMode === 'play') exitPlayMode();



          if (d.getCurrentFen() === fen) {
            d.playUciMove(uci);
          } else {
            _pendingBoardReply = { uci, forFen: fen };
            _panelNotice = 'The engine has replied — return to the drill position to see its move.';
          }
          const terminal = adjudicate(applied.fen, _lastConfig?.learnerIsWhite ?? true);
          if (terminal !== null) drill.applyTerminal(terminal);
          d.redraw();
        },
        () => {
          if (engineMode === 'play') exitPlayMode();
          d.redraw();
        });
    },
    cancelReply: () => { if (d.engineSeam !== undefined) d.engineSeam.cancelReply(); else cancelPlayMove(); },
    requestVerdict: (fen, onEval) => {
      const existing = _pendingVerdicts.get(fen);
      if (existing !== undefined) { existing.push(onEval); return; }
      if (_pendingVerdicts.size >= MAX_PENDING_VERDICT_FENS) {
        const oldest = _pendingVerdicts.keys().next().value;
        if (oldest !== undefined) _pendingVerdicts.delete(oldest);
      }
      _pendingVerdicts.set(fen, [onEval]);
    },
    now: () => d.now(),
  };
}

function onDrillStateChange(state: EngineDrillState): void {
  persistActiveDrill();
  if (state.phase === 'complete' && _finishedState === null) {
    _finishedState = state;
    clearTimers();
    _pendingVerdicts.clear();
    if (engineMode === 'play') exitPlayMode();
    if (_autoNextEnabled) startAutoNextCountdown();
  }
}

function mintDrillId(): string {
  return crypto.randomUUID();
}

/** Start a drill (the §12.1 "Drill from here" default start; also Next drill / Retry). */
export function startEngineDrill(config: DrillStartConfig): void {
  const d = deps;
  if (!d || _drill !== null) return;
  const drillId = mintDrillId();
  const startedAt = d.now();


  _setupDifficultySynced = false;
  _drillId = drillId;
  _startPath = d.getCurrentPath();
  _finishedState = null;
  _secondaryOpen = false;
  _panelNotice = null;
  _lastConfig = config;
  // §12.3 nearest-supported substitution, disclosed, original preserved in history: Mastery is
  // modeled as an uncapped-depth search the host budget-stops (D13 consult) — but the shared
  // engine has no stop-and-keep seam yet, so an uncapped search could never deliver a usable
  // bestmove. Until that protocol seam lands (disclosed follow-up), Casual is the only
  // SUPPORTED live configuration; a Mastery request runs Casual with the substitution recorded.
  const requestedDifficulty = config.difficulty;
  const runDifficulty: DrillDifficulty = 'casual';
  const substituted = requestedDifficulty !== 'casual';
  if (substituted) {
    _panelNotice = 'Mastery strength needs an engine seam that arrives with a follow-up — '
      + 'running Casual; your requested setting is kept in the drill history.';
  }
  _settingsHistory = [{
    at: startedAt,
    requestedDifficulty,
    difficulty: runDifficulty,
    substituted,
  }];
  _drill = createEngineDrill({
    startFen: config.startFen,
    learnerIsWhite: config.learnerIsWhite,
    goals: config.goals,
    ...(config.moveLimit !== undefined ? { moveLimit: config.moveLimit } : {}),
    ...(config.timeLimitMs !== undefined ? { timeLimitMs: config.timeLimitMs } : {}),
    difficulty: runDifficulty,
    deps: buildDeps(config.learnerIsWhite),
    onStateChange: onDrillStateChange,
  });
  _record = {
    drillId,
    startFen: config.startFen,
    snapshot: _drill.snapshot(),
    settingsHistory: [..._settingsHistory],
    outcome: null,
    completionState: 'partial',
    ...(config.retryOfDrillId !== undefined ? { retryOfDrillId: config.retryOfDrillId } : {}),
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  createEngineDrillRecord(_record).then(r => {
    // Existence-rejecting create: a duplicate UUID must never overwrite (§14.1). Fail closed.
    if (r.duplicate) {
      console.warn('engine-drill: drillId collision on create — drill not persisted', drillId);
      _drillId = null;
    }
  }).catch(e => console.warn('engine-drill: catalog create failed', e));
  if (config.timeLimitMs !== undefined) {
    _clockTimer = setInterval(() => {
      const drill = _drill;
      if (drill === null) { clearTimers(); return; }
      drill.checkTimeLimit();
      d.redraw();
    }, 1000);
  }
}



function applyPendingBoardReplyIfAtPosition(boardFen: string): void {
  const d = deps;
  const pending = _pendingBoardReply;
  if (!d || pending === null) return;
  if (boardFen !== pending.forFen) return;
  _pendingBoardReply = null;
  _panelNotice = null;
  d.playUciMove(pending.uci);
}

/** The learner played a board move while a drill is active. fenBefore MUST be captured before
 *  the move applied (main.ts onBeforeBoardUserMove); fenAfter/uci/san read after it landed. */
export function engineDrillOnUserMove(input: {
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly uci: string;
  readonly san?: string;



  readonly evalBefore?: { readonly cp?: number; readonly mate?: number; readonly depth?: number };
}): void {
  const drill = _drill;
  if (drill === null || _finishedState !== null) return;
  const assistance = _assistanceThisMove;
  _assistanceThisMove = [];
  _revealedBest = null;
  drill.applyUserMove({
    uci: input.uci,
    ...(input.san !== undefined ? { san: input.san } : {}),
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
    ...(input.evalBefore !== undefined ? { evalBefore: input.evalBefore } : {}),
    ...(assistance.length > 0 ? { assistance } : {}),
  });
  const terminal = adjudicate(input.fenAfter, _lastConfig?.learnerIsWhite ?? true);
  if (terminal !== null) drill.applyTerminal(terminal);
}

/** Finish drill — always available (§12.3). */
export function finishEngineDrill(): void {
  _drill?.finish();
}

/** Abandon without a result: persists the partial as 'interrupted' and tears down. */
export function abandonEngineDrill(): void {
  if (_drill === null) return;
  persistActiveDrill('interrupted');
  teardownDrill();
  _finishedState = null;
  _drillId = null;
  _record = null;
  deps?.redraw();
}



/** Minimal drill-line PGN: SetUp/FEN headers off-initial + the played SAN mainline. A mainline-
 *  only sibling of drillPromotion's fuller chapter builder — enough to position the board. */
function drillRecordPgn(record: EngineDrillRecord, includeMoves: boolean): string {
  const headers = defaultHeaders();
  headers.set('Event', 'Engine Drill');
  headers.set('Site', 'ChessPatzer');
  if (record.startFen.split(' ').slice(0, 4).join(' ') !== INITIAL_FEN.split(' ').slice(0, 4).join(' ')) {
    headers.set('SetUp', '1');
    headers.set('FEN', record.startFen);
  }
  const root = new PgnNode<PgnNodeData>();
  if (includeMoves) {
    // A corrupt/unchainable record falls back to the bare start position — never a guessed line.
    const line = chainDrillLine(record) ?? [];
    let cursor: PgnNode<PgnNodeData> = root;
    for (const m of line) {
      const child = new ChildNode<PgnNodeData>({ san: m.san });
      cursor.children.push(child);
      cursor = child;
    }
  }
  return makePgn({ headers, moves: root });
}

/** Load a drill record's material onto the analysis board (played line, or bare start position
 *  when `atStart`). No-op when the host is uninitialized or the seam is unwired. */
export function openDrillRecordOnBoard(record: EngineDrillRecord, opts?: { readonly atStart?: boolean }): void {
  deps?.openPgnOnBoard?.(drillRecordPgn(record, opts?.atStart !== true));
}

/** Resume a partial drill from its persisted record (catalog resume rides D16; exported now so
 *  the persistence contract is honored end-to-end by the host). */
export function resumePersistedEngineDrill(record: EngineDrillRecord): void {
  const d = deps;
  if (!d || _drill !== null) return;
  const snapshot: EngineDrillSnapshot = record.snapshot;
  _drillId = record.drillId;
  _record = record;
  _startPath = d.getCurrentPath();
  _finishedState = null;
  _settingsHistory = [...record.settingsHistory];
  _lastConfig = {
    startFen: snapshot.startFen,
    learnerIsWhite: snapshot.learnerIsWhite,
    goals: snapshot.goals,
    ...(snapshot.moveLimit !== undefined ? { moveLimit: snapshot.moveLimit } : {}),
    ...(snapshot.timeLimitMs !== undefined ? { timeLimitMs: snapshot.timeLimitMs } : {}),
    difficulty: snapshot.difficulty,
  };
  _drill = resumeEngineDrill(snapshot, buildDeps(snapshot.learnerIsWhite), onDrillStateChange);
  if (snapshot.timeLimitMs !== undefined) {
    _clockTimer = setInterval(() => {
      const drill = _drill;
      if (drill === null) { clearTimers(); return; }
      drill.checkTimeLimit();
      d.redraw();
    }, 1000);
  }
  d.redraw();
}

function closeResult(): void {
  cancelAutoNext();
  teardownDrill();
  _finishedState = null;
  _drillId = null;
  _record = null;
  deps?.redraw();
}

function startFollowUpDrill(retry: boolean): void {
  const d = deps;
  const config = _lastConfig;
  const priorDrillId = _drillId;
  closeResult();
  if (!d || config === null) return;
  if (_startPath !== null) d.navigate(_startPath);
  startEngineDrill(retry && priorDrillId !== null
    ? { ...config, retryOfDrillId: priorDrillId }
    : config);
  d.redraw();
}



function revealDrillHint(kind: 'hint' | 'show-move'): void {
  const d = deps;
  if (!d || _drill === null) return;
  const fen = d.getCurrentFen();
  const ev = d.getEvalForCurrent();
  const best = ev?.best;
  if (best === undefined) {
    _panelNotice = 'No engine suggestion yet — let the evaluation run a moment.';
    d.redraw();
    return;
  }
  if (!_assistanceThisMove.includes(kind)) _assistanceThisMove.push(kind);
  const shown = kind === 'show-move' ? best : `${best.slice(0, 2)}…`;
  _revealedBest = { fen, san: shown };
  _panelNotice = null;
  d.redraw();
}



export function takebackDrillMove(): void {
  const d = deps;
  const drill = _drill;
  if (!d || drill === null) return;
  drill.takeback();
  _assistanceThisMove = [];
  _revealedBest = null;




  if (_pendingBoardReply !== null) _panelNotice = null;
  _pendingBoardReply = null;
  persistActiveDrill();
  if (_record !== null) openDrillRecordOnBoard(_record);
  d.redraw();
}

function startAutoNextCountdown(): void {
  cancelAutoNext();
  _autoNextSeconds = AUTO_NEXT_COUNTDOWN_S;
  _autoNextTimer = setInterval(() => {
    if (_autoNextSeconds === undefined) { cancelAutoNext(); return; }
    _autoNextSeconds -= 1;
    if (_autoNextSeconds <= 0) {
      cancelAutoNext();
      startFollowUpDrill(false);
      return;
    }
    deps?.redraw();
  }, 1000);
  deps?.redraw();
}

// --- Setup state mutators (panel surface) ------------------------------------

function goalFromChoice(choice: DrillGoalChoice, moves: number): DrillGoal {
  switch (choice) {
    case 'outcome-win':    return { kind: 'outcome', want: 'win' };
    case 'outcome-draw':   return { kind: 'outcome', want: 'draw' };
    case 'survive':        return { kind: 'survive', moves };
    case 'mate':           return { kind: 'mate' };
    case 'mate-in':        return { kind: 'mate-in', moves };
    case 'promote':        return { kind: 'promote' };

    case 'eval-threshold': return { kind: 'eval-threshold', cp: _setupEvalCp, holdCount: _setupEvalHold };
    case 'max-critical':   return { kind: 'max-critical-mistakes', max: _setupMaxCritical };
  }
}

function startFromSetup(): void {
  const d = deps;
  if (!d) return;
  const startFen = d.getCurrentFen();
  // v1 constraint: the learner drills the SIDE TO MOVE at the start position — the D13 machine
  // opens awaiting-user, and the shared controller has no engine-moves-first opening (a
  // side-flip would need one; rides a follow-up). The setup surface reflects this honestly
  // (side shown = side to move; the side control explains instead of silently overriding).
  const learnerIsWhite = startFen.includes(' w ');
  _setupLearnerIsWhite = learnerIsWhite;
  startEngineDrill({
    startFen,
    learnerIsWhite,
    goals: [goalFromChoice(_setupGoal, _setupGoalMoves)],
    ...(_setupMoveLimit !== null ? { moveLimit: _setupMoveLimit } : {}),
    ...(_setupTimeLimitMinutes !== null ? { timeLimitMs: _setupTimeLimitMinutes * 60_000 } : {}),
    difficulty: _setupDifficulty,
  });
  d.redraw();
}

// --- Vnode feeds (composition of the D14 surfaces; render-only call sites) ----

/** The rail-sibling readout (Screen 5) — null when no drill is live. */
export function engineDrillReadoutVnode(): VNode | null {
  const drill = _drill;
  if (drill === null || _finishedState !== null) return null;
  const snapshot = drill.snapshot();
  const state = drill.state();
  const remaining = snapshot.timeLimitMs !== undefined
    ? Math.max(0, snapshot.timeLimitMs - snapshot.elapsedMs)
    : undefined;
  return renderDrillReadout({
    state,
    goals: snapshot.goals,
    ...(remaining !== undefined ? { remainingMs: remaining } : {}),
  });
}

/** The Practice-panel Engine Drill section: setup → live controls → result. */
export function engineDrillPanelVnode(): VNode {
  const finished = _finishedState;
  if (finished !== null) {
    const autoNext: DrillAutoNextProps = {
      enabled: _autoNextEnabled,
      onToggle: enabled => {
        _autoNextEnabled = enabled;
        if (!enabled) cancelAutoNext();


        else if (_finishedState !== null && _autoNextTimer === null) startAutoNextCountdown();
        deps?.redraw();
      },
      ...(_autoNextSeconds !== undefined ? { countdownSeconds: _autoNextSeconds } : {}),
      onCancelCountdown: () => { cancelAutoNext(); deps?.redraw(); },
      onStartNow: () => { cancelAutoNext(); startFollowUpDrill(false); },
    };
    return h('div.drill-host', [
      renderDrillResult(finished, {



        onAnalyze: () => {
          const record = _record;
          if (record !== null) openDrillRecordOnBoard(record);
          const started = requestSelectedGameAnalysis();
          if (!started) {
            _panelNotice = 'The drill game is on the analysis board — start Analyze from the board controls.';
          }
          closeResult();
        },
        onOpenInAnalysis: () => {
          const record = _record;
          if (record !== null) openDrillRecordOnBoard(record);
          closeResult();
        },
        onNextDrill: () => startFollowUpDrill(false),
        onRetry: () => startFollowUpDrill(true),
        onPromote: () => {
          const record = _record;
          closeResult();
          if (record !== null) openDrillCatalogPromotion(record, deps?.redraw ?? (() => {}));
          deps?.redraw();
        },
      }, autoNext, _secondaryOpen, open => { _secondaryOpen = open; deps?.redraw(); }),
      _panelNotice !== null ? h('div.drill-host__notice', _panelNotice) : null,
    ]);
  }
  if (_drill !== null) {




    const liveEval = deps?.getEvalForCurrent();
    const bestSan = _revealedBest !== null && _revealedBest.fen === deps?.getCurrentFen()
      ? _revealedBest.san : null;
    return h('div.drill-host', [
      engineDrillReadoutVnode(),
      h('div.drill-host__live-controls', [
        h('button.drill-host__control', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Hint',
            description: 'Reveals the piece the engine would move. Counts as assistance on this move.',
            tier: 'essential',
          }) },
          on: { click: () => { revealDrillHint('hint'); } },
        }, 'Hint'),
        h('button.drill-host__control', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Show move',
            description: 'Reveals the engine\u2019s best move. Counts as assistance on this move.',
            tier: 'essential',
          }) },
          on: { click: () => { revealDrillHint('show-move'); } },
        }, 'Show move'),
        h('button.drill-host__control', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Takeback',
            description: 'Takes back your last move. The original stays the scored first attempt.',
            tier: 'essential',
          }) },
          on: { click: () => { takebackDrillMove(); } },
        }, 'Takeback'),
        h('button.drill-host__finish', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Finish drill',
            description: 'Ends the drill now and shows the result. Always available.',
            tier: 'essential',
          }) },
          on: { click: () => { finishEngineDrill(); deps?.redraw(); } },
        }, 'Finish drill'),
      ]),
      bestSan !== null
        ? h('div.drill-host__hint-reveal', `Engine suggestion: ${bestSan}`)
        : null,
      liveEval === undefined && _revealedBest !== null
        ? h('div.drill-host__hint-reveal', 'Waiting for the engine\u2019s evaluation\u2026')
        : null,
      _panelNotice !== null ? h('div.drill-host__notice', _panelNotice) : null,
    ]);
  }
  // The side shown is the side to move at the current position (the v1 constraint recorded in
  // startFromSetup); choosing the other side explains rather than silently overriding.
  const sideToMoveIsWhite = deps !== null ? deps.getCurrentFen().includes(' w ') : true;
  _setupLearnerIsWhite = sideToMoveIsWhite;



  if (!_setupDifficultySynced) {
    const resolved = resolveOrpSettings(readOrpGlobalDefaults(), undefined, undefined, Date.now()).values;
    _setupDifficulty = resolved.drillDifficulty === 'mastery' ? 'mastery' : 'casual';
    _setupDifficultySynced = true;
  }
  return h('div.drill-host', [
    renderDrillSetup({
      startLabel: 'Drill from here',
      goal: _setupGoal,
      goalMoves: _setupGoalMoves,
      evalThresholdCp: _setupEvalCp,
      evalHoldCount: _setupEvalHold,
      maxCriticalMistakes: _setupMaxCritical,
      difficulty: _setupDifficulty,
      learnerIsWhite: _setupLearnerIsWhite,
      moveLimit: _setupMoveLimit,
      timeLimitMinutes: _setupTimeLimitMinutes,
      onGoalChange: goal => { _setupGoal = goal; deps?.redraw(); },
      onGoalMovesChange: moves => { _setupGoalMoves = moves; deps?.redraw(); },
      onEvalThresholdChange: cp => { _setupEvalCp = cp; deps?.redraw(); },
      onEvalHoldChange: hold => { _setupEvalHold = hold; deps?.redraw(); },
      onMaxCriticalChange: max => { _setupMaxCritical = max; deps?.redraw(); },
      onMoveLimitChange: moves => { _setupMoveLimit = moves; deps?.redraw(); },
      onTimeLimitChange: minutes => { _setupTimeLimitMinutes = minutes; deps?.redraw(); },
      onDifficultyChange: difficulty => { _setupDifficulty = difficulty; deps?.redraw(); },
      onSideChange: () => {
        _panelNotice = 'Drill from here plays the side to move. To drill the other side, '
          + 'step the board one move first.';
        deps?.redraw();
      },
      onStart: startFromSetup,
    }),
    _panelNotice !== null ? h('div.drill-host__notice', _panelNotice) : null,
  ]);
}

// (Mastery's 60s budget seam lives in D13/engine-protocol territory — see the substitution note
// in startEngineDrill.)
