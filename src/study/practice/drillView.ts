




import type { Key } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { parseFen, makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs } from '../../ui/controlExplainer';
import { createDrillBoardAdapter, type DrillBoardController } from './boardAdapter';
import { createDrillSession, type DrillSession, type DrillMode } from './drillCtrl';
import {
  createLearnController,
  type LearnController,
  type LearnState,
  type LearnStep,
  type LearnReply,
  type LearnTargetCompletion,
  type LearnTimer,
  type LearnTimerHandle,
} from './drillCtrl';
import { buildLearnSteps, type LearnScope } from './sessionBuilder';
import type { LessonDecision } from './material';
import type { AuthoredLessonContent } from './lessonAuthoring';
import { scheduleNext, positionKey, isDue } from './scheduler';
import { getPositionProgress, savePositionProgress, saveDrillAttempt } from '../studyDb';
import { renderBoard } from '../../board/index';
import {
  mountWorkspace,
  unmountWorkspace,
  type WorkspaceInstance,
} from '../../analyse/workspaceCore';
import type { Shape, TreePath } from '../../tree/types';
import type { TrainableSequence, PositionProgress, DrillAttempt } from '../types';

// --- Module-level drill state ---

let _session:    DrillSession | null  = null;
let _sequences:  TrainableSequence[]  = [];
let _rootFen:    string               = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let _trainAs:    'white' | 'black'    = 'white';
let _startedAt:  number               = 0;
let _adapter:    DrillBoardController | null = null;
let _redraw:     () => void           = () => {};

// --- Workspace-core migration state (CCW-H03b) ---
// The drill is now a module-owned workspace surface (boardAdapter.ts is its WorkspaceBoardInputModule)
// rather than a forked Chessground. `_workspaceInstance` is the instance mounted for the current run
// (unmounted by endDrill). `_drillRunGeneration` is a monotonic run id: every delayed
// opponent/learn/feedback/advance callback captures it and stale-drops if it no longer matches — a
// superseded workspace or a restarted/exited drill's timer must be a no-op (the P0 no-stale-mutation
// contract). All outstanding timer handles are tracked so restart/end can cancel them.
// `_restoreCallback` is the one-shot Study-restore callback for an embedded launch (survives
// "Practice Again", consumed only on final teardown).
let _workspaceInstance: WorkspaceInstance | null = null;
let _drillRunGeneration = 0;
let _restoreCallback: (() => void) | null = null;

let _teardownCallback: ((reason: string) => void) | null = null;
const _drillTimers = new Set<ReturnType<typeof setTimeout>>();

// --- Delayed-work scheduling + stale-drop guard (CCW-H03b) ---

/** Schedule a drill timer whose handle is tracked so restart/end can cancel it. */
function drillTimeout(fn: () => void, ms: number): void {
  const handle = setTimeout(() => {
    _drillTimers.delete(handle);
    fn();
  }, ms);
  _drillTimers.add(handle);
}

/** Cancel every outstanding drill timer (called on run restart in initDrillView and on endDrill). */
function clearDrillTimers(): void {
  for (const handle of _drillTimers) clearTimeout(handle);
  _drillTimers.clear();
}

/**
 * True when a delayed callback captured at `run`/`adapter` may still mutate the board or session:
 * the run must still be current, the adapter must still be the active controller, and its port must
 * be live (board present + workspace still the active one). A superseded workspace or a
 * restarted/exited drill's timer therefore becomes a no-op — the P0 no-stale-mutation contract.
 */
function drillCallbackLive(run: number, adapter: DrillBoardController | null): adapter is DrillBoardController {
  return run === _drillRunGeneration && adapter === _adapter && adapter !== null && adapter.isLive();
}









let _learn:            LearnController | null = null;
let _learnSteps:       readonly LearnStep[]   = [];
let _learnContent:     ReadonlyMap<string, AuthoredLessonContent> = new Map();
let _learnLeadInFenFor: (decision: LessonDecision) => string      = () => _rootFen;
let _learnShapesFor:   (decision: LessonDecision) => readonly Shape[] = () => [];
// The learner's last played uci this step — sourced only for the accepted-alternate board marker,
// which persists through the reply-pacing advance and clears at the next recall node.
let _learnLastPlayedUci: string | null = null;

/**
 * Injected pacing timer for `createLearnController` (LearnTimer). Wraps the tracked/stale-dropped
 * `_drillTimers` set so a superseded/exited run cancels the controller's comment-free reply pacing
 * exactly like every other delayed drill callback. After the controller advances on the timer, the
 * board re-syncs and redraws so the next recall position renders (board is P0 — this is lower-priority
 * pacing work that stale-drops).
 */
function makeLearnTimer(): LearnTimer {
  return {
    schedule(fn: () => void, ms: number): LearnTimerHandle {
      const run = _drillRunGeneration;
      const capAdapter = _adapter;
      const handle = setTimeout(() => {
        _drillTimers.delete(handle);
        if (!drillCallbackLive(run, capAdapter)) return; // stale-drop (P0)
        fn();
        syncLearnBoard();
        _redraw();
      }, ms);
      _drillTimers.add(handle);
      return handle;
    },
    cancel(handle: LearnTimerHandle): void {
      const t = handle as ReturnType<typeof setTimeout>;
      clearTimeout(t);
      _drillTimers.delete(t);
    },
  };
}

/** True when a Learn traversal is the active runtime. */
export function isLearnActive(): boolean {
  return _learn !== null;
}

// Performance stats — tracked during session, preserved for summary on completion/early exit.
let _totalPositions   = 0;
let _correctFirst     = 0;
// Snapshot preserved when session ends (early-exit or natural completion).
let _summaryPositions = 0;
let _summaryCorrect   = 0;
let _summarySequences = 0;
let _summaryStartedAt = 0;
let _showSummary      = false;

// --- Public interface ---

export function isDrillActive(): boolean {
  // Summary is still Drill-owned presentation. Treat it as active ownership so the app-wide
  // route-exit signal dismisses a visible summary even after End Session cleared `_session`.
  return _session !== null || _learn !== null || _showSummary;
}

/**
 * Initialise and start a new drill session.
 * Must be called before renderDrillView().
 */
export function initDrillView(
  sequences:      TrainableSequence[],
  rootFen:        string,
  trainAs:        'white' | 'black',
  redraw:         () => void,
  mode:           DrillMode = 'quiz',
  onExitRestore?: () => void,
): void {
  // New run: bump the generation and cancel any leftover timers so a prior run's callbacks no-op.
  _drillRunGeneration++;
  clearDrillTimers();

  _sequences      = sequences;
  _rootFen        = rootFen;
  _trainAs        = trainAs;
  _redraw         = redraw;
  _session        = createDrillSession(sequences, mode);
  _startedAt      = Date.now();
  _totalPositions = 0;
  _correctFirst   = 0;
  _showSummary    = false;

  // One-shot Study-restore callback: only (re)set when an embedded launch supplies one, so a
  // "Practice Again" restart (which omits it) preserves the original restore without briefly
  // restoring Study. Cleared on final teardown (endDrill).
  if (onExitRestore !== undefined) _restoreCallback = onExitRestore;

  // Build the drill board-input controller and mount it as the active workspace. The controller
  // drives the board only through the guarded port it receives at attach time; the board itself is
  // rendered by the shared lifecycle's renderBoard() inside `.drill-board-wrap` (renderDrillBoard).
  // syncDrillBoard() runs from the controller's onAttached, i.e. once the port is attached.
  const run = _drillRunGeneration;
  const adapter = createDrillBoardAdapter({
    initialFen:         rootFen,
    initialOrientation: trainAs,
    handleMove:         (orig, dest) => { onUserMove(orig, dest); },
    handleKeydown:      handleDrillKeydown,
    onAttached:         () => { syncDrillBoard(); },
    isRunCurrent:       () => run === _drillRunGeneration,
  });
  _adapter = adapter;
  _workspaceInstance = mountWorkspace({
    id: 'orp-drill',
    boardInputMode: 'practice-grading',
    boardInputModule: adapter.module,
    getCursor: adapter.getCursor,
    getOrientation: adapter.getOrientation,
    redraw,
    // Module-owned dispatch runs on movable.events.after (sharedTreeMoveTarget returns null for
    // module-owned), so this shared-tree commit hook is intentionally unreachable.
    handleUserMove: () => {},
  });
}
















export interface LearnViewConfig {
  /** The authored learner-side decisions in traversal order (a single authored line). */
  readonly line: readonly LessonDecision[];
  /** Authored content keyed by `decisionId` — prompts/hints/explanations the controller resolves. */
  readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  /** Authored opponent replies keyed by the learner decision id (Stockfish never selects a reply). */
  readonly replies?: ReadonlyMap<string, LearnReply>;
  /** Authored siblings at a lead-in authored path (for branch-specific wrong/refutation grading). */
  readonly siblingsAt?: (leadInPath: TreePath) => readonly LessonDecision[];
  /** This session's scored decision ids; empty ⇒ D8 single-line (every Required decision is target). */
  readonly targetIds?: ReadonlySet<string>;
  readonly scope?: LearnScope;
  /** The board FEN the learner recalls FROM for a decision (the position BEFORE the authored move). */
  readonly leadInFenFor: (decision: LessonDecision) => string;
  /** Authored arrows/highlights on the decision's node (`TreeNode.shapes`), restored on recall. */
  readonly shapesFor?: (decision: LessonDecision) => readonly Shape[];
  readonly rootFen: string;
  readonly trainAs: 'white' | 'black';
  readonly redraw: () => void;
  readonly onExitRestore?: () => void;



  readonly onTargetComplete?: (completion: LearnTargetCompletion) => void;
  readonly onLineComplete?: () => void;



  readonly onTeardown?: (reason: string) => void;
}

/**
 * Initialise and start a guided-recall Learn traversal. Drives `createLearnController` fed by
 * `buildLearnSteps` — never the legacy `createDrillSession` auto-play. Mounts the same module-owned
 * workspace board as the quiz drill; board input is P0 (a legal move applies through Chessground
 * immediately, then `gradeAndAdvance` grades — grading/shape/pacing never gate the move).
 */
export function initLearnView(config: LearnViewConfig): void {
  // New run: bump the generation and cancel any leftover timers so a prior run's callbacks no-op.
  _drillRunGeneration++;
  clearDrillTimers();

  _session   = null;
  _rootFen   = config.rootFen;
  _trainAs   = config.trainAs;
  _redraw    = config.redraw;
  _startedAt = Date.now();
  _showSummary = false;

  _learnContent      = config.content;
  _learnLeadInFenFor = config.leadInFenFor;
  _learnShapesFor    = config.shapesFor ?? (() => []);
  _learnLastPlayedUci = null;

  _learnSteps = buildLearnSteps({
    line:      config.line,
    content:   config.content,
    ...(config.replies    ? { replies:    config.replies }    : {}),
    ...(config.siblingsAt ? { siblingsAt: config.siblingsAt } : {}),
    targetIds: config.targetIds ?? new Set<string>(),
    scope:     config.scope ?? 'full',
  });
  _learn = createLearnController({
    steps:   _learnSteps,
    content: config.content,
    timer:   makeLearnTimer(),
    ...(config.onTargetComplete ? { onTargetComplete: config.onTargetComplete } : {}),
    ...(config.onLineComplete ? { onLineComplete: config.onLineComplete } : {}),
  });

  if (config.onExitRestore !== undefined) _restoreCallback = config.onExitRestore;
  if (config.onTeardown !== undefined) _teardownCallback = config.onTeardown;

  const run = _drillRunGeneration;
  const adapter = createDrillBoardAdapter({
    initialFen:         config.rootFen,
    initialOrientation: config.trainAs,
    handleMove:         (orig, dest) => { learnUserMove(orig, dest); },
    handleKeydown:      handleLearnKeydown,
    onAttached:         () => { syncLearnBoard(); },
    isRunCurrent:       () => run === _drillRunGeneration,
    authoredShapes:     learnAuthoredShapes,
  });
  _adapter = adapter;
  _workspaceInstance = mountWorkspace({
    id: 'orp-drill',
    boardInputMode: 'practice-grading',
    boardInputModule: adapter.module,
    getCursor: adapter.getCursor,
    getOrientation: adapter.getOrientation,
    redraw: config.redraw,
    handleUserMove: () => {},
  });
}

/** The current Learn step (the cued decision to recall), or undefined once complete. */
function currentLearnStep(): LearnStep | undefined {
  return _learn ? _learnSteps[_learn.state.stepIndex] : undefined;
}

function uciToAfterFen(fromFen: string, uci: string): { keys: [Key, Key]; afterFen: string } | null {
  const keys = uciToKeys(uci);
  if (!keys) return null;
  try {
    const setup = parseFen(fromFen).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    const move  = parseUci(uci);
    if (!move) return null;
    makeSanAndPlay(pos, move); // mutates `pos` to the resulting position
    return { keys, afterFen: makeFen(pos.toSetup()) };
  } catch {
    // Fall back to the from-position FEN so the piece still animates from/to on the current board.
    return { keys, afterFen: fromFen };
  }
}

/**
 * Sync the Learn board to the controller's current `LearnState`. Board mutations are lower-priority
 * than raw input and stale-drop; the authored-shape provider (registered on the board module) reads
 * the CURRENT step each call so a superseded node never renders stale shapes.
 */
function syncLearnBoard(): void {
  const adapter = _adapter;
  const learn   = _learn;
  if (!adapter || !learn) return;
  const st   = learn.state;
  const step = _learnSteps[st.stepIndex];

  if (st.phase === 'complete' || !step) {
    _learnLastPlayedUci = null;
    adapter.disableUserInput();
    adapter.refreshShapes();
    return;
  }

  if (st.phase === 'recall' || st.phase === 'repair') {
    // A new recall clears the transient accepted-alternate marker.
    _learnLastPlayedUci = null;
    const fenBefore = _learnLeadInFenFor(step.target);
    adapter.setPosition(fenBefore, _trainAs);
    adapter.enableUserInput(computeDrillDests(fenBefore));
    adapter.refreshShapes();
    return;
  }

  if (st.phase === 'reply-pacing') {
    // The learner's move is already on the board (P0). Animate the authored opponent reply, then the
    // controller's injected timer (comment-free) or the Next control (commented) advances the step.
    adapter.disableUserInput();
    const reply = step.reply;
    if (reply) {
      const animated = uciToAfterFen(step.target.evidence.fen, reply.uci);
      if (animated) adapter.animateOpponentMove(animated.keys[0], animated.keys[1], animated.afterFen);
    }
    adapter.refreshShapes();
    return;
  }

  // 'feedback' (or any other transient) — freeze input; shapes re-evaluate.
  adapter.disableUserInput();
  adapter.refreshShapes();
}

/** Authored-shape provider for the Learn board (registered on the module in boardAdapter.attach).
 *  Reads the CURRENT controller/step state each call (stale-safe): authored node shapes + the
 *  Show-move solution arrow + the persistent accepted-alternate marker (all paired with a brush and
 *  never color-only in the UI — the feedback strip carries the text/icon per P2-ORP-21). */
function learnAuthoredShapes(): DrawShape[] {
  const learn = _learn;
  const step  = currentLearnStep();
  if (!learn || !step) return [];
  const st = learn.state;
  const shapes: DrawShape[] = [];

  // 1. Authored arrows/highlights on the recall node.
  for (const s of _learnShapesFor(step.target)) {
    shapes.push({
      orig: s.orig as Key,
      ...(s.dest ? { dest: s.dest as Key } : {}),
      brush: s.brush ?? 'green',
    });
  }

  const solutionKeys = uciToKeys(step.target.evidence.uci);
  // 2. Show-move solution arrow (only once assistance revealed it).
  if (st.revealed && solutionKeys) {
    shapes.push({ orig: solutionKeys[0], dest: solutionKeys[1], brush: 'blue' });
  } else if (st.hintShown && solutionKeys) {
    // 3. Hint highlights the from-square only (never the full solution move).
    shapes.push({ orig: solutionKeys[0], brush: 'yellow' });
  }

  // 4. Accepted-alternate marker — persists from the accepted play through reply-pacing until the
  //    next recall node clears `_learnLastPlayedUci`. Sourced from the played move + a correct outcome
  //    on a non-target-mainline branch (accepted-optional / reference-acknowledged).
  const outcome = st.lastOutcome;
  if (
    _learnLastPlayedUci &&
    (st.phase === 'reply-pacing' || st.phase === 'feedback') &&
    outcome &&
    (outcome.category === 'accepted-optional' || outcome.category === 'reference-acknowledged')
  ) {
    const acceptedKeys = uciToKeys(_learnLastPlayedUci);
    if (acceptedKeys) shapes.push({ orig: acceptedKeys[0], dest: acceptedKeys[1], brush: 'green' });
  }
  return shapes;
}

/** Board-input entry for a legal learner move in Learn (P0). The move is already on the board via
 *  Chessground; this grades it through the controller (lower-priority) and renders the next phase. */
function learnUserMove(orig: Key, dest: Key): void {
  const learn = _learn;
  const adapter = _adapter;
  if (!learn || !adapter) return;
  const step = currentLearnStep();
  if (!step) return;

  const fenBefore = _learnLeadInFenFor(step.target);
  let san = '';
  let uci = `${orig}${dest}`;
  try {
    const setup = parseFen(fenBefore).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    const move  = parseUci(uci);
    if (!move) { syncLearnBoard(); return; }
    san = makeSanAndPlay(pos, move);
  } catch {
    syncLearnBoard();
    return;
  }

  _learnLastPlayedUci = uci;
  // Grade + advance (the controller already holds any Hint/Show-move assistance recorded this step).
  const st = learn.gradeAndAdvance({ uci, san });

  if (st.phase === 'repair') {
    adapter.flashFeedback('incorrect');
  } else {
    adapter.flashFeedback('correct');
  }
  // Render the resulting phase (walk back on repair, animate reply / advance on correct, end on
  // complete). Board input already applied — grading/pacing/shape work never gated it (P0).
  syncLearnBoard();
  _redraw();
}

/** Snapshot current stats and show summary without destroying session data. */
function captureSummary(): void {
  _summaryPositions = _totalPositions;
  _summaryCorrect   = _correctFirst;
  _summarySequences = _session?.sequenceIndex ?? _sequences.length;
  _summaryStartedAt = _startedAt;
  _showSummary      = true;
}

export type DrillSummaryDisposition = 'retain' | 'dismiss';

/** Tear down the drill: unmount the workspace, cancel timers, and restore Study if this was an
 *  embedded launch still owning the active workspace. `route-exit` always dismisses Drill
 *  presentation; explicit End/Escape retain the summary until a Back action dismisses it. */
export function endDrill(
  reason: string = 'drill-end',
  summaryDisposition: DrillSummaryDisposition = reason === 'route-exit' ? 'dismiss' : 'retain',
): void {
  if (summaryDisposition === 'retain') {
    if (!_showSummary) captureSummary();
  } else {
    _showSummary = false;
  }
  // Bump the run generation before any teardown so every in-flight timer stale-drops, then cancel
  // the tracked handles.
  _drillRunGeneration++;
  clearDrillTimers();
  // Capture and clear the stored instance + restore callback before unmounting.
  const instance = _workspaceInstance;
  const restore  = _restoreCallback;
  const teardown = _teardownCallback;
  _workspaceInstance = null;
  _restoreCallback   = null;
  _teardownCallback  = null;


  if (teardown) { try { teardown(reason); } catch { /* teardown must complete */ } }
  // Guarded unmount: releases the drill ONLY if it is still the active workspace, so a stale drill
  // exit can never replace a newer Analysis/Study/other workspace.
  const wasActive = instance ? unmountWorkspace(instance, reason) : false;
  _adapter  = null;
  _session  = null;
  _learn    = null;
  _learnSteps = [];
  _learnLastPlayedUci = null;
  // Restore Study only after a still-active embedded drill was actually unmounted. Retained
  // summary may launch Practice Again; preserve its one-shot restore only in that case so the
  // restarted embedded drill can restore Study on its eventual final dismissal.
  if (wasActive && restore) {
    restore();
    if (summaryDisposition === 'retain') _restoreCallback = restore;
  }
}

export function isDrillSummary(): boolean {
  return _showSummary;
}

// --- Board helpers ---

function getFenBefore(positionIndex: number, seq: TrainableSequence | undefined): string {
  if (!seq) return _rootFen;
  if (positionIndex === 0) return _rootFen;
  return seq.fens[positionIndex - 1] ?? _rootFen;
}

function isUserTurn(positionIndex: number, seq: TrainableSequence | undefined): boolean {
  if (!seq) return true;
  const ply = seq.startPly + positionIndex;
  const moveColor = ply % 2 === 0 ? 'white' : 'black';
  return moveColor === _trainAs;
}

function computeDrillDests(fen: string): Map<Key, Key[]> {
  try {
    const setup = parseFen(fen).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    return chessgroundDests(pos) as Map<Key, Key[]>;
  } catch {
    return new Map();
  }
}

function uciToKeys(uci: string): [Key, Key] | null {
  if (uci.length < 4) return null;
  return [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
}










function syncDrillBoard(): void {
  const adapter = _adapter;
  if (!adapter || !_session) return;

  const session = _session;
  const seq     = session.currentSequence;



  if (seq && seq.trainAs !== _trainAs) {
    _trainAs = seq.trainAs;
    adapter.reorient(_trainAs);
  }

  if (session.isDone || session.feedback === 'complete') {
    adapter.disableUserInput();
    return;
  }

  const idx = session.positionIndex;







  if (session.feedback === 'waiting') {
    if (isUserTurn(idx, seq)) {
      // User must play the expected move.
      const fenBefore = getFenBefore(idx, seq);
      adapter.setPosition(fenBefore, _trainAs);
      const dests = computeDrillDests(fenBefore);
      adapter.enableUserInput(dests);
    } else {
      // Opponent's turn: auto-animate their move, then advance.
      adapter.disableUserInput();
      const uci  = seq?.moves[idx];
      const keys = uci ? uciToKeys(uci) : null;
      if (keys) {
        const afterFen = seq?.fens[idx] ?? _rootFen;
        const run     = _drillRunGeneration;
        const capAdapter = adapter;
        drillTimeout(() => {
          if (!drillCallbackLive(run, capAdapter)) return;           // stale-drop (P0)
          capAdapter.animateOpponentMove(keys[0], keys[1], afterFen);
          _session = _session?.advance() ?? null;
          _redraw();
          const run2 = _drillRunGeneration;
          const capAdapter2 = _adapter;
          drillTimeout(() => {
            if (!drillCallbackLive(run2, capAdapter2)) return;       // stale-drop (P0)
            syncDrillBoard();
          }, 350);
        }, 500);
      } else {
        // No move data — advance anyway.
        _session = _session?.advance() ?? null;
        syncDrillBoard();
      }
    }
  } else if (session.feedback === 'correct' || session.feedback === 'showAnswer') {
    adapter.disableUserInput();
  } else if (session.feedback === 'incorrect') {
    // Re-enable input at same position — user gets another attempt.
    const fenBefore = getFenBefore(idx, seq);
    adapter.setPosition(fenBefore, _trainAs);
    const dests = computeDrillDests(fenBefore);
    adapter.enableUserInput(dests);
  }
}






/**
 * Persist the graded position result to IDB (fire-and-forget).
 * Loads or creates PositionProgress, applies scheduleNext(), saves back.
 * Appends a DrillAttempt record.
 */
async function persistGrading(
  fenBefore:    string,
  seqId:        string,
  expectedSan:  string,
  userSan:      string,
  correct:      boolean,
  attemptsBeforeCorrect: number,
): Promise<void> {
  const key       = positionKey(fenBefore);
  const now       = Date.now();
  let existing: PositionProgress | undefined;
  try {
    existing = await getPositionProgress(key);
  } catch (e) {
    // BUG-2026-07-10-008 P2 data-integrity guard: getPositionProgress now REJECTS on a genuine
    // storage read failure (was masked as undefined). If we treated that as "no progress" (prev =
    // level 0), scheduleNext would run from scratch and savePositionProgress would silently RESET
    // this position's spaced-repetition level. Skip the whole persist instead so the stored level
    // is preserved; the drill session continues normally (board still advances). One graded attempt
    // is not recorded — an acceptable trade to protect existing SRS progress.
    console.warn('[drillView] persistGrading skipped — position-progress read failed; not writing to avoid resetting the spaced-repetition level', e);
    return;
  }
  const prev: PositionProgress = existing ?? {
    key,
    level:           0,
    nextDueAt:       0,
    attempts:        0,
    correct:         0,
    incorrect:       0,
    streak:          0,
    lastAttemptAt:   0,
    sequenceIds:     [],
  };

  // Warmup check: if this position is not yet due, grade differently.
  // Due position: normal grading (advance or drop level).
  // Warmup correct: no-op (do not update progress — position is context, not scheduled review).
  // Warmup incorrect: reset to level 1 (creates a new review obligation).
  const due = isDue(prev, now);
  if (!due && correct) {
    // Warmup correct — record sequenceId link but do not change level or scheduling.
    if (existing && !existing.sequenceIds.includes(seqId)) {
      await savePositionProgress({
        ...existing,
        sequenceIds: [...existing.sequenceIds, seqId],
      }).catch(() => {});
    }
    return;
  }

  let newLevel: number;
  let nextDueAt: number;
  if (!due && !correct) {
    // Warmup incorrect — reset to level 1 and schedule for review tomorrow.
    newLevel  = 1;
    nextDueAt = now + (await import('./scheduler')).INTERVALS_MS[1]!;
  } else {
    // Normal grading (due position).
    ({ newLevel, nextDueAt } = scheduleNext(prev.level, correct, now));
  }

  const updated: PositionProgress = {
    ...prev,
    level:         newLevel,
    nextDueAt,
    attempts:      prev.attempts + 1,
    correct:       prev.correct  + (correct ? 1 : 0),
    incorrect:     prev.incorrect + (correct ? 0 : 1),
    streak:        correct ? prev.streak + 1 : 0,
    lastAttemptAt: now,
    sequenceIds:   prev.sequenceIds.includes(seqId)
      ? prev.sequenceIds
      : [...prev.sequenceIds, seqId],
  };

  await savePositionProgress(updated).catch(e =>
    console.warn('[drillView] savePositionProgress failed', e),
  );

  const attempt: DrillAttempt = {
    positionKey:          key,
    sequenceId:           seqId,
    timestamp:            now,
    result:               correct ? 'correct' : 'incorrect',
    expectedMove:         expectedSan,
    attemptsBeforeCorrect,
    ...(correct ? {} : { userMove: userSan }),
  };
  await saveDrillAttempt(attempt).catch(e =>
    console.warn('[drillView] saveDrillAttempt failed', e),
  );
}

function onUserMove(orig: Key, dest: Key): void {
  if (!_session || !_adapter) return;

  // Convert cg move to SAN via chessops.
  const seq      = _session.currentSequence;
  const idx      = _session.positionIndex;
  const fenBefore = getFenBefore(idx, seq);

  let san = '';
  try {
    const setup = parseFen(fenBefore).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    const move  = parseUci(`${orig}${dest}`);
    if (!move) { syncDrillBoard(); return; }
    san = makeSanAndPlay(pos, move);
  } catch {
    syncDrillBoard();
    return;
  }

  const prevFeedback = _session.feedback;
  _session = _session.submitMove(san);

  const expectedSan = seq?.sans[idx] ?? '';
  const seqId       = seq?.id ?? '';

  if (_session.feedback === 'correct') {
    _totalPositions++;
    if (prevFeedback === 'waiting') _correctFirst++;
    _adapter.flashFeedback('correct');
    _redraw();
    // Persist correct grading (fire-and-forget). This may finish after exit — it records an attempt
    // that already occurred and touches only IDB, never board/session state.
    void persistGrading(fenBefore, seqId, expectedSan, san, true, _session.attemptsAtPosition).catch(e =>
      console.warn('[drillView] persistGrading failed', e),
    );
    // Advance after brief pause.
    const run = _drillRunGeneration;
    const capAdapter = _adapter;
    drillTimeout(() => {
      if (!drillCallbackLive(run, capAdapter)) return;               // stale-drop (P0)
      if (!_session) return;
      _session = _session.advance();
      _redraw();
      syncDrillBoard();
    }, 600);
  } else if (_session.feedback === 'incorrect') {
    _totalPositions++;
    // Persist incorrect attempt (fire-and-forget).
    void persistGrading(fenBefore, seqId, expectedSan, san, false, _session.attemptsAtPosition).catch(e =>
      console.warn('[drillView] persistGrading failed', e),
    );
    _adapter.flashFeedback('incorrect');
    _redraw();
  } else if (_session.feedback === 'showAnswer') {
    // Show the correct move and wait for user to click Next.
    const uci  = seq?.moves[idx];
    const keys = uci ? uciToKeys(uci) : null;
    if (keys) _adapter.showCorrectMove(keys[0], keys[1], seq?.fens[idx] ?? _rootFen);
    _adapter.disableUserInput();
    _redraw();
  }
}

// --- VNode rendering ---

export function renderDrillView(redraw: () => void): VNode {
  // Learn traversal (guided recall) — rendered from the controller's readonly LearnState.
  if (_learn) {
    return h('div.drill-session.drill-session--learn', [
      renderDrillBoard(),
      renderLearnSidebar(_learn.state, redraw),
    ]);
  }
  if (_showSummary || !_session || _session.isDone || _session.feedback === 'complete') {
    if (_session?.isDone || _session?.feedback === 'complete') captureSummary();
    return renderDrillSummary(redraw);
  }
  return h('div.drill-session', [
    renderDrillBoard(),
    renderDrillSidebar(redraw),
  ]);
}

/**
 * Surface-owned drill keyboard handler (CCW-H03b). Was a document-level `keydown` listener bound on
 * the drill session's insert/destroy hooks; it is now routed here by src/keyboard.ts ONLY while the
 * drill is the active workspace, so Analysis branch navigation, flip, engine, threat, best-move, and
 * help are suppressed throughout the drill. Inert during the summary screen and once no session
 * remains, matching the pre-migration lifecycle where the listener was removed when the drill board
 * unmounted.
 */
function handleDrillKeydown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (_showSummary || !_session) return;

  if (e.key === 'Enter' || e.key === ' ') {
    const fb = _session.feedback;
    if (fb === 'correct' || fb === 'showAnswer' || fb === 'complete') {
      e.preventDefault();
      _session = _session.advance();
      _redraw();
      syncDrillBoard();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    captureSummary();
    endDrill('keyboard-escape');
    _redraw();
  } else if (
    e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
    e.key === 'ArrowUp'   || e.key === 'ArrowDown'
  ) {
    e.preventDefault();
  }
}

/**
 * Surface-owned Learn keyboard handler (P2-ORP-21). Space/Enter advance a paused reply / repair retry
 * (the contextually-safe action) and NEVER trigger assistance; arrows are bounded (Read-only stepping,
 * no browse-ahead in Learn); Escape ends the session. Assistance (Hint/Show move) is deliberately NOT
 * bound to any bare navigation key.
 */
function handleLearnKeydown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const learn = _learn;
  if (!learn) return;
  const st = learn.state;

  if (e.key === 'Enter' || e.key === ' ') {
    // Contextually-safe advance only: a paused (commented) reply or a repair retry. Never assistance.
    if (st.phase === 'reply-pacing' && st.awaitingNext) {
      e.preventDefault();
      learn.next();
      syncLearnBoard();
      _redraw();
    } else if (st.phase === 'repair') {
      e.preventDefault();
      learn.next(); // re-enter recall for the retry
      syncLearnBoard();
      _redraw();
    }
  } else if (e.key === 'ArrowLeft') {
    // Backward stepping is allowed only in non-scoring Read mode (bounds enforced by the controller).
    if (st.mode === 'read') { e.preventDefault(); learn.readBack(); syncLearnBoard(); _redraw(); }
    else e.preventDefault(); // Learn: swallow — no free backward jump on the scored traversal.
  } else if (e.key === 'ArrowRight') {
    if (st.mode === 'read') { e.preventDefault(); learn.readForward(); syncLearnBoard(); _redraw(); }
    else e.preventDefault(); // Learn: browsing ahead is not allowed (P2-ORP-16).
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    endDrill('keyboard-escape', 'dismiss');
    _redraw();
  }
}

// --- Learn sidebar (guided-recall rendering from LearnState) ---

function learnPromptFor(step: LearnStep | undefined): string {
  if (!step) return '';
  const content = _learnContent.get(step.target.identity.decisionId);
  return content?.instructionalPrompt?.trim() || 'Play the required move.';
}

function renderLearnSidebar(st: LearnState, redraw: () => void): VNode {
  const step = _learnSteps[st.stepIndex];
  const total = _learnSteps.filter(s => s.kind === 'target').length;
  const seen  = _learnSteps.slice(0, st.stepIndex + 1).filter(s => s.kind === 'target').length;

  return h('div.drill-sidebar.drill-sidebar--learn', [
    h('div.drill-header', [
      h('div.drill-sequence-label', st.mode === 'read' ? 'Read (non-scoring)' : 'Learn'),


      h('div.drill-move-counter', { attrs: { role: 'status', 'aria-live': 'polite' } },
        total > 0 ? `Target ${Math.min(seen, total)} of ${total}` : ''),
    ]),
    renderLearnFeedback(st, step),
    renderLearnControls(st, redraw),
  ]);
}

function renderLearnFeedback(st: LearnState, step: LearnStep | undefined): VNode {
  // Every state pairs color with text/icon (never color-only) and is announced via aria-live without
  // stealing board focus (P2-ORP-21). loading/empty/error/ready are folded into the phase render:
  // an empty plan completes immediately (handled by 'complete' below with a "nothing to learn" note).
  if (st.phase === 'complete') {
    const clean = st.completedClean;
    return h('div.drill-feedback.drill-feedback--learn.drill-feedback--complete', {
      attrs: { role: 'status', 'aria-live': 'polite' },
    }, [
      h('span.drill-feedback__icon', clean ? '✓' : '•'),
      h('span.drill-feedback__text',
        _learnSteps.length === 0
          ? 'Nothing to learn in this line yet.'
          : clean ? 'Line complete — clean traversal.' : 'Line complete.'),
    ]);
  }

  const outcome = st.lastOutcome;
  let icon = '›';
  let text = learnPromptFor(step);
  let mod  = 'recall';

  if (st.phase === 'repair') {
    mod  = 'repair';
    icon = '↺';
    // Branch-specific wrong/refutation explanation, else generic deviation, else a plain retry cue.
    text = outcome?.explanation
      ?? (outcome?.category === 'deviation' ? 'Off book — return and play the required move.' : 'Not quite — try the required move again.');
  } else if (st.phase === 'reply-pacing') {
    mod  = 'correct';
    icon = '✓';
    text = st.awaitingNext ? 'Correct. Read the note, then continue.' : 'Correct.';
  } else if (st.revealed) {
    mod  = 'assisted';
    icon = '👁';
    text = 'Solution shown — this attempt is marked assisted.';
  } else if (st.hintShown) {
    mod  = 'assisted';
    icon = '💡';
    text = 'Hint shown — this attempt is marked assisted.';
  }

  return h(`div.drill-feedback.drill-feedback--learn.drill-feedback--${mod}`, {
    attrs: { role: 'status', 'aria-live': 'polite' },
  }, [
    h('span.drill-feedback__icon', icon),
    h('span.drill-feedback__text', text),
  ]);
}

function renderLearnControls(st: LearnState, redraw: () => void): VNode {
  const learn = _learn!;
  const inRecall = st.phase === 'recall' || st.phase === 'repair';
  const buttons: (VNode | null)[] = [];

  // Hint (Essential — consequential: marks the position assisted/failed).
  if (st.mode === 'learn' && inRecall) {
    buttons.push(h('button.drill-btn.drill-btn--hint', {
      attrs: {
        type: 'button',
        'aria-pressed': String(st.hintShown),
        ...controlExplainerAttrs({
          tier: 'essential',
          label: 'Hint',
          description: 'Reveals the authored hint. Using it marks this position as failed for scheduling.',
        }),
      },
      on: { click: () => { learn.useHint(); if (_adapter) _adapter.refreshShapes(); redraw(); } },
    }, 'Hint'));

    // Show move (Essential — consequential + assistance-marking).
    buttons.push(h('button.drill-btn.drill-btn--show', {
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({
          tier: 'essential',
          label: 'Show move',
          description: 'Draws the solution move. Using it marks this position as failed for scheduling.',
        }),
      },
      on: { click: () => { learn.showMove(); syncLearnBoard(); if (_adapter) _adapter.refreshShapes(); redraw(); } },
    }, 'Show move'));
  }

  // Next (More Help — advance the paced reply / repair retry).
  if ((st.phase === 'reply-pacing' && st.awaitingNext) || st.phase === 'repair') {
    buttons.push(h('button.drill-btn.drill-btn--next', {
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({ label: 'Next', description: 'Advances past the paced reply or repair prompt.' }),
      },
      on: { click: () => { learn.next(); syncLearnBoard(); redraw(); } },
    }, 'Next'));
  }

  // Read-mode toggle (Essential — explains Read is non-scoring stepping).
  buttons.push(h('button.drill-btn.drill-btn--read', {
    attrs: {
      type: 'button',
      'aria-pressed': String(st.mode === 'read'),
      ...controlExplainerAttrs({
        tier: 'essential',
        label: st.mode === 'read' ? 'Exit Read' : 'Read',
        description: 'Read mode steps through the line without scoring. It never marks the position failed.',
      }),
    },
    on: { click: () => { if (st.mode === 'read') learn.enterLearn(); else learn.enterRead(); syncLearnBoard(); redraw(); } },
  }, st.mode === 'read' ? 'Exit Read' : 'Read'));

  if (st.phase === 'complete') {
    // Mark as learned (Essential — honest override; not a clean pass).
    buttons.push(h('button.drill-btn.drill-btn--again', {
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({ label: 'Replay line', description: 'Re-opens this line to learn it again from the start.' }),
      },
      on: { click: () => { learn.reset(); syncLearnBoard(); redraw(); } },
    }, 'Replay'));
  } else {
    buttons.push(h('button.drill-btn.drill-btn--marklearned', {
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({
          tier: 'essential',
          label: 'Mark as learned',
          description: 'Records an honest override for this line. It does not fabricate a clean pass or accuracy.',
        }),
      },
      on: { click: () => { learn.markAsLearned(); syncLearnBoard(); redraw(); } },
    }, 'Mark as learned'));
  }

  // End session (Essential — consequential).
  buttons.push(h('button.drill-btn.drill-btn--end', {
    attrs: {
      type: 'button',
      ...controlExplainerAttrs({ tier: 'essential', label: 'End session', description: 'Ends this Learn session and returns to the Study.' }),
    },
    on: { click: () => { endDrill('learn-end', 'dismiss'); redraw(); } },
  }, 'End session'));

  return h('div.drill-controls.drill-controls--learn', buttons);
}

// --- Board ---

function renderDrillBoard(): VNode {
  // The drill board IS the shared lifecycle's renderBoard(): board/index.ts selects this surface's
  // module-owned config and installs the canonical movable.events.after callback. `.drill-board-wrap`
  // supplies the fixed board dimensions and receives the feedback-flash class (the module resolves it
  // via boardEl.closest('.drill-board-wrap') at attach). No local Chessground or key lifecycle here.
  return h('div.drill-board-wrap', {
    key: 'drill-board',
  }, [renderBoard()]);
}

// --- Sidebar ---

function renderDrillSidebar(redraw: () => void): VNode {
  const session = _session!;
  const seq     = session.currentSequence;

  return h('div.drill-sidebar', [
    renderDrillHeader(seq),
    renderDrillProgress(),
    renderDrillFeedbackStrip(session),
    renderDrillControls(session, redraw),
  ]);
}

function renderDrillHeader(seq: TrainableSequence | undefined): VNode {
  const label = seq?.label ?? '';
  const total = seq?.sans.length ?? 0;
  const idx   = _session?.positionIndex ?? 0;
  return h('div.drill-header', [
    h('div.drill-sequence-label', label),

    h('div.drill-move-counter', { attrs: { role: 'status', 'aria-live': 'polite' } },
      total > 0 ? `Position ${idx + 1} of ${total}` : ''),
  ]);
}

function renderDrillProgress(): VNode {
  const total    = _sequences.length;
  const done     = _session?.sequenceIndex ?? 0;
  const fraction = total > 0 ? done / total : 0;
  return h('div.drill-progress', [
    h('div.drill-progress-bar', [
      h('div.drill-progress-fill', { style: { width: `${Math.round(fraction * 100)}%` } }),
    ]),
    h('div.drill-progress-label', `${done}/${total} lines`),
  ]);
}

function renderDrillFeedbackStrip(session: DrillSession): VNode {
  let text = '';
  let cls  = 'drill-feedback';

  switch (session.feedback) {
    case 'waiting':    text = 'Your turn';                                         break;
    case 'correct':    text = 'Correct!';       cls += ' drill-feedback--correct'; break;
    case 'incorrect':  {
      const left = 3 - session.attemptsAtPosition;
      text = `Try again (${left} left)`;
      cls += ' drill-feedback--incorrect';
      break;
    }
    case 'showAnswer': {
      const expected = session.currentExpectedSan ?? '';
      text = `The move was ${expected}`;
      cls += ' drill-feedback--answer';
      break;
    }
    case 'complete':   text = 'Sequence complete!'; break;
  }

  return h(`div.${cls.replace(/ /g, '.')}`, text);
}

function renderDrillControls(session: DrillSession, redraw: () => void): VNode {
  const showNext = session.feedback === 'correct' || session.feedback === 'showAnswer';
  return h('div.drill-controls', [
    showNext
      ? h('button.drill-btn.drill-btn--next', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Next practice move' }) },
          on: { click: () => {
            if (!_session) return;
            _session = _session.advance();
            redraw();
            syncDrillBoard();
          }},
        }, 'Next')
      : null,
    h('button.drill-btn.drill-btn--end', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: 'End practice session', description: 'Ends this session and opens the session summary.' }) },
      on: { click: () => { captureSummary(); endDrill(); redraw(); } },
    }, 'End Session'),
  ]);
}



export function renderDrillSummary(redraw: () => void): VNode {
  const totalSequences = _sequences.length;
  const completed  = Math.min(_summarySequences, totalSequences);
  const accuracy   = _summaryPositions > 0
    ? Math.round((_summaryCorrect / _summaryPositions) * 100)
    : 0;
  const now        = Date.now();
  const elapsedMs  = _summaryStartedAt > 0 ? now - _summaryStartedAt : 0;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
  const durationStr = `${elapsedMin}:${String(elapsedSec).padStart(2, '0')}`;

  return h('div.drill-summary', [
    h('h2.drill-summary__title', 'Session Complete'),
    h('div.drill-summary__stats', [
      h('div.drill-summary__stat', [h('span.drill-summary__val', String(_summaryPositions)), h('span.drill-summary__key', 'Positions quizzed')]),
      h('div.drill-summary__stat', [h('span.drill-summary__val', `${accuracy}%`),           h('span.drill-summary__key', 'Accuracy')]),
      h('div.drill-summary__stat', [h('span.drill-summary__val', `${completed}/${totalSequences}`), h('span.drill-summary__key', 'Lines completed')]),
      h('div.drill-summary__stat', [h('span.drill-summary__val', durationStr),             h('span.drill-summary__key', 'Duration')]),
    ]),
    h('div.drill-summary__actions', [
      h('button.drill-btn.drill-btn--again', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Practice again', description: 'Starts a new session with the same lines.' }) },
        on: { click: () => {
          if (_sequences.length > 0) {
            initDrillView(_sequences, _rootFen, _trainAs, _redraw);
            redraw();
          }
        }},
      }, 'Practice Again'),
      h('button.drill-btn.drill-btn--back', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Back to Study Library' }) },
        on: { click: () => { endDrill('summary-back', 'dismiss'); redraw(); } },
      }, 'Back to Library'),
    ]),
  ]);
}
