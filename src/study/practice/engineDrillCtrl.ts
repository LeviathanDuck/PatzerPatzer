





















import type { EngineStrengthConfig } from '../../engine/types';
import { scoreDrillMoves, type DrillScore, type DrillScoredMove } from '../../analyse/evalView';

// --- Difficulty (contract §12.2) --------------------------------------------------------------------

export type DrillDifficulty = 'casual' | 'mastery';

/** Casual — depth 18. Full-strength play at a bounded depth. */
export const CASUAL_STRENGTH: EngineStrengthConfig = { level: 8, uciElo: 3200, maxDepth: 18 };
/**
 * Mastery — "up to 60 seconds". The engine protocol is depth-parameterized today, so Mastery is
 * MODELED as an uncapped-depth search the host budget-stops at 60s (consult §7 disclosed
 * approximation; a movetime seam is a candidate engine-protocol follow-up — NOT added here).
 */
export const MASTERY_STRENGTH: EngineStrengthConfig = { level: 8, uciElo: 3200, maxDepth: 99 };
export const MASTERY_TIME_BUDGET_MS = 60_000;

export function strengthFor(difficulty: DrillDifficulty): EngineStrengthConfig {
  return difficulty === 'casual' ? CASUAL_STRENGTH : MASTERY_STRENGTH;
}

/** Nearest-supported substitution (contract §12.3): unavailable configs resolve to the closest
 *  supported difficulty, DISCLOSED, with the original preserved by the caller in history. */
export function resolveDifficulty(
  requested: string,
  available: readonly DrillDifficulty[] = ['casual', 'mastery'],
): { readonly difficulty: DrillDifficulty; readonly substituted: boolean } {
  if ((available as readonly string[]).includes(requested)) {
    return { difficulty: requested as DrillDifficulty, substituted: false };
  }
  return { difficulty: available[0] ?? 'casual', substituted: true };
}

// --- Goals (contract §12.3 bounded grammar) ---------------------------------------------------------

export type DrillGoal =
  | { readonly kind: 'outcome'; readonly want: 'win' | 'draw' }
  | { readonly kind: 'survive'; readonly moves: number }
  | { readonly kind: 'mate' }
  | { readonly kind: 'mate-in'; readonly moves: number }
  | { readonly kind: 'promote' }
  | {
      readonly kind: 'eval-threshold';
      /** Learner-perspective centipawn threshold to reach and hold. */
      readonly cp: number;
      /** Consecutive qualifying verdicts required (configurable hold duration). */
      readonly holdCount: number;
    }
  | { readonly kind: 'max-critical-mistakes'; readonly max: number };

/** Minimum verdict depth an engine-adjudicated goal accepts (the §12.2 confidence/depth gate). */
export const MIN_GOAL_VERDICT_DEPTH = 12;

// --- Records / state --------------------------------------------------------------------------------

export interface DrillMoveRecord {
  readonly index: number;
  readonly uci: string;
  readonly san?: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly byLearner: boolean;
  /** False for a post-takeback replay — the ORIGINAL stays the scored first attempt (§12.2). */
  readonly firstAttempt: boolean;
  readonly assistanceUsed: readonly string[];
  /** White-perspective evals when the verdict path captured them (scoring inputs). */
  readonly evalBefore?: { readonly cp?: number; readonly mate?: number };
  readonly evalAfter?: { readonly cp?: number; readonly mate?: number };
  readonly at: number;
}

export type DrillTerminal =
  | { readonly kind: 'checkmate'; readonly winnerIsLearner: boolean; readonly mateInMoves?: number }
  | { readonly kind: 'stalemate' }
  | { readonly kind: 'draw' }
  | { readonly kind: 'resignation'; readonly byLearner: boolean }
  | { readonly kind: 'promotion'; readonly byLearner: boolean };

export type DrillPhase = 'awaiting-user' | 'awaiting-reply' | 'complete';

export type DrillEndReason =
  | 'terminal' | 'finish-drill' | 'move-limit' | 'time-limit';

export interface DrillGoalResult {
  readonly goal: DrillGoal;
  readonly met: boolean | null; // null = undetermined at end (e.g. never reached the hold)
}

export interface EngineDrillState {
  readonly phase: DrillPhase;
  readonly moves: readonly DrillMoveRecord[];
  readonly difficulty: DrillDifficulty;
  readonly substituted: boolean;
  readonly takebacks: number;
  readonly endReason: DrillEndReason | null;
  readonly terminal: DrillTerminal | null;
  readonly goalResults: readonly DrillGoalResult[] | null;
  readonly score: DrillScore | null;
}

/** JSON-safe partial/complete snapshot (contract §12.3: resume with complete moves, side, goals,
 *  limits, settings, assistance, takebacks, and timing). */
export interface EngineDrillSnapshot {
  readonly version: 1;
  readonly startFen: string;
  readonly learnerIsWhite: boolean;
  readonly goals: readonly DrillGoal[];
  readonly moveLimit?: number;
  readonly timeLimitMs?: number;
  readonly difficulty: DrillDifficulty;
  readonly requestedDifficulty: string;
  readonly substituted: boolean;
  readonly moves: readonly DrillMoveRecord[];
  readonly takebacks: number;
  readonly startedAt: number;
  readonly elapsedMs: number;
  readonly phase: DrillPhase;
  readonly endReason: DrillEndReason | null;
  readonly terminal: DrillTerminal | null;



  readonly takenBackIndices?: readonly number[];
  readonly holdProgress?: readonly (readonly [number, number])[];
  readonly holdMet?: readonly number[];
  readonly promotionSeen?: boolean;
}

// --- Injected engine seams (real wiring = D14 over playMove.ts; tests inject fakes) ----------------

export interface EngineDrillDeps {
  /** Request ONE Stockfish reply for EXACTLY this FEN at this strength. The controller drops any
   *  reply whose bound FEN no longer matches the live position (exact-FEN stale-drop). */
  readonly requestReply: (
    fen: string,
    strength: EngineStrengthConfig,
    onMove: (uci: string, forFen: string) => void,
  ) => void;
  readonly cancelReply: () => void;
  /** Request a position verdict (white-perspective eval + reached depth) for EXACTLY this FEN. */
  readonly requestVerdict?: (
    fen: string,
    onEval: (result: { readonly fen: string; readonly cp?: number; readonly mate?: number; readonly depth: number }) => void,
  ) => void;
  readonly now: () => number;
}

export interface EngineDrillConfig {
  readonly startFen: string;
  readonly learnerIsWhite: boolean;
  readonly goals?: readonly DrillGoal[];
  readonly moveLimit?: number;
  readonly timeLimitMs?: number;
  readonly difficulty?: string; // resolved via resolveDifficulty (substitution disclosed)
  readonly deps: EngineDrillDeps;
  readonly onStateChange?: (state: EngineDrillState) => void;
}

export interface EngineDrillController {
  state(): EngineDrillState;
  /** The learner played a move (host-validated legal). fenAfter = the exact position it produced. */
  applyUserMove(input: {
    uci: string; san?: string; fenBefore: string; fenAfter: string;
    assistance?: readonly string[];


    evalBefore?: { readonly cp?: number; readonly mate?: number };
    evalAfter?: { readonly cp?: number; readonly mate?: number };
  }): void;
  /** The host's board adjudicated a terminal position. */
  applyTerminal(terminal: DrillTerminal): void;
  /** Difficulty change: applies to the NEXT reply; an in-flight reply for the CURRENT position is
   *  cancelled and re-requested at the new strength (safe same-FEN replacement, §12.2). */
  setDifficulty(next: string): void;
  /** Takeback: marks the last learner move as taken back (replays append; originals stay scored). */
  takeback(): void;
  /** Finish drill — always available (§12.3). */
  finish(): void;
  /** Optional wall-clock check the host calls periodically; ends the drill on a time limit. */
  checkTimeLimit(): void;



  attachEvalForFen(fen: string, ev: { readonly cp?: number; readonly mate?: number }): void;
  snapshot(): EngineDrillSnapshot;
}

// --- Factory ----------------------------------------------------------------------------------------

export function createEngineDrill(config: EngineDrillConfig): EngineDrillController {
  const deps = config.deps;
  const goals = config.goals ?? [];
  const resolved = resolveDifficulty(config.difficulty ?? 'casual');

  let phase: DrillPhase = 'awaiting-user';
  let moves: DrillMoveRecord[] = [];
  let difficulty: DrillDifficulty = resolved.difficulty;
  let substituted = resolved.substituted;
  let takebacks = 0;
  let endReason: DrillEndReason | null = null;
  let terminal: DrillTerminal | null = null;
  let currentFen = config.startFen;
  /** The FEN an outstanding reply request is bound to (null = none in flight). */
  let replyBoundFen: string | null = null;
  const startedAt = deps.now();
  let priorElapsedMs = 0; // carried across resume

  // Eval-threshold hold tracking (consecutive qualifying verdicts per goal index).
  const holdProgress = new Map<number, number>();
  const holdMet = new Map<number, boolean>();
  let promotionSeen = false;

  const emit = (): void => { config.onStateChange?.(snapshotState()); };

  const learnerMoves = (): DrillMoveRecord[] => moves.filter(m => m.byLearner && !mTakenBack.has(m.index));
  const mTakenBack = new Set<number>(); // learner move indexes taken back (replays append after)

  function scoredInputs(): DrillScoredMove[] {
    return moves
      .filter(m => m.byLearner && m.evalBefore !== undefined && m.evalAfter !== undefined)
      .map(m => ({
        evalBefore: m.evalBefore!,
        evalAfter: m.evalAfter!,
        moverIsWhite: config.learnerIsWhite,
        firstAttempt: m.firstAttempt,
        moveIndex: m.index,
      }));
  }

  function evaluateGoals(): DrillGoalResult[] {
    const score = scoreDrillMoves(scoredInputs());
    return goals.map((goal, index) => {
      switch (goal.kind) {
        case 'outcome': {
          if (terminal?.kind === 'checkmate') return { goal, met: goal.want === 'win' ? terminal.winnerIsLearner : false };
          if (terminal?.kind === 'draw' || terminal?.kind === 'stalemate') return { goal, met: goal.want === 'draw' };
          if (terminal?.kind === 'resignation') return { goal, met: goal.want === 'win' ? !terminal.byLearner : false };
          return { goal, met: null };
        }
        case 'survive':
          return { goal, met: learnerMoves().length >= goal.moves };
        case 'mate':
          return { goal, met: terminal?.kind === 'checkmate' && terminal.winnerIsLearner };
        case 'mate-in': {
          if (terminal?.kind !== 'checkmate' || !terminal.winnerIsLearner) return { goal, met: false };
          const within = terminal.mateInMoves !== undefined
            ? terminal.mateInMoves <= goal.moves
            : learnerMoves().length <= goal.moves;
          return { goal, met: within };
        }
        case 'promote':
          return { goal, met: promotionSeen || terminal?.kind === 'promotion' && terminal.byLearner };
        case 'eval-threshold':
          return { goal, met: holdMet.get(index) ?? false };
        case 'max-critical-mistakes':
          return { goal, met: score.criticalMistakes <= goal.max };
      }
    });
  }

  function snapshotState(): EngineDrillState {
    const done = phase === 'complete';
    return {
      phase, moves: [...moves], difficulty, substituted, takebacks, endReason, terminal,
      goalResults: done ? evaluateGoals() : null,
      score: done ? scoreDrillMoves(scoredInputs()) : null,
    };
  }

  function complete(reason: DrillEndReason): void {
    if (phase === 'complete') return;
    phase = 'complete';
    endReason = reason;
    if (replyBoundFen !== null) {
      replyBoundFen = null;
      deps.cancelReply();
    }
    emit();
  }

  function requestReplyFor(fen: string): void {
    replyBoundFen = fen;
    deps.requestReply(fen, strengthFor(difficulty), (uci, forFen) => {
      // EXACT-FEN stale-drop (the binding contract): a reply bound to any other position — or
      // arriving after the drill moved on / ended — never advances the state.
      if (phase !== 'awaiting-reply' || forFen !== replyBoundFen || forFen !== currentFen) return;
      replyBoundFen = null;
      moves.push({
        index: moves.length, uci, fenBefore: currentFen,
        fenAfter: '', // the HOST resolves the post-reply FEN via applyReplyApplied below? No —
        byLearner: false, firstAttempt: true, assistanceUsed: [], at: deps.now(),
      });
      phase = 'awaiting-user';
      emit();
    });
  }

  // NOTE: the reply's fenAfter is host-resolved (the controller holds no chess rules). The host
  // MUST call `applyReplyPosition(fenAfter)` right after the emit above; see applyReplyPosition.
  function applyReplyPosition(fenAfter: string): void {
    const last = moves[moves.length - 1];
    if (last === undefined || last.byLearner || last.fenAfter !== '') return;
    moves[moves.length - 1] = { ...last, fenAfter };
    currentFen = fenAfter;
    maybeEvalThresholdProbe();
    emit();
  }

  function maybeEvalThresholdProbe(): void {
    if (deps.requestVerdict === undefined) return;
    goals.forEach((goal, index) => {
      if (goal.kind !== 'eval-threshold' || holdMet.get(index) === true) return;
      const askedFen = currentFen;
      deps.requestVerdict!(askedFen, (result) => {
        // Exact-FEN + min-depth confidence gate (§12.2): under-depth or off-FEN verdicts never count.
        if (result.fen !== askedFen || result.depth < MIN_GOAL_VERDICT_DEPTH) return;
        if (phase === 'complete') return;


        if (askedFen !== currentFen) return;
        const whiteCp = result.mate !== undefined
          ? (result.mate > 0 ? 10_000 : -10_000)
          : (result.cp ?? 0);
        const learnerCp = config.learnerIsWhite ? whiteCp : -whiteCp;
        const qualifies = learnerCp >= goal.cp;
        const run = qualifies ? (holdProgress.get(index) ?? 0) + 1 : 0;
        holdProgress.set(index, run);
        if (run >= goal.holdCount) holdMet.set(index, true);
      });
    });
  }

  const controller: EngineDrillController = {
    state: snapshotState,

    applyUserMove(input) {
      if (phase !== 'awaiting-user') return;
      if (input.fenBefore !== currentFen) return; // stale user move (host desync) — ignored
      moves.push({
        index: moves.length,
        uci: input.uci,
        ...(input.san !== undefined ? { san: input.san } : {}),
        fenBefore: input.fenBefore,
        fenAfter: input.fenAfter,


        ...(input.evalBefore !== undefined ? { evalBefore: input.evalBefore } : {}),
        ...(input.evalAfter !== undefined ? { evalAfter: input.evalAfter } : {}),
        byLearner: true,
        // A move played after ANY takeback of a learner move at this or later index is a replay;
        // v1 rule: once a takeback happened, subsequent learner moves at replayed positions are
        // non-first-attempts iff an original learner move exists for the same fenBefore.
        firstAttempt: !moves.some(m => m.byLearner && m.fenBefore === input.fenBefore),
        assistanceUsed: [...(input.assistance ?? [])],
        at: deps.now(),
      });
      if (input.uci.length === 5 && 'qrbn'.includes(input.uci[4]!)) promotionSeen = true;
      currentFen = input.fenAfter;
      phase = 'awaiting-reply';
      emit();
      maybeEvalThresholdProbe();
      // Optional move limit: a NORMAL ending unless a goal makes it a failure — the goal results
      // (evaluated at completion) carry that semantic; the end reason stays 'move-limit' (§12.3).
      const moveLimit = config.moveLimit;
      if (moveLimit !== undefined && learnerMoves().length >= moveLimit) {
        complete('move-limit');
        return;
      }
      requestReplyFor(input.fenAfter);
    },

    applyTerminal(t) {
      if (phase === 'complete') return;
      terminal = t;
      complete('terminal');
    },

    setDifficulty(next) {
      const r = resolveDifficulty(next);
      difficulty = r.difficulty;
      substituted = substituted || r.substituted;
      // Safe same-FEN replacement: an in-flight reply for the current position is re-requested at
      // the new strength (§12.2 — "may safely replace an in-flight search for the same exact FEN").
      if (phase === 'awaiting-reply' && replyBoundFen === currentFen) {
        deps.cancelReply();
        requestReplyFor(currentFen);
      }
      emit();
    },

    takeback() {
      if (phase === 'complete') return;
      // Find the last learner move not already taken back; mark it (records stay — append-only).
      for (let i = moves.length - 1; i >= 0; i--) {
        const m = moves[i]!;
        if (m.byLearner && !mTakenBack.has(m.index)) {
          mTakenBack.add(m.index);
          takebacks++;
          currentFen = m.fenBefore;
          if (replyBoundFen !== null) { replyBoundFen = null; deps.cancelReply(); }
          phase = 'awaiting-user';
          emit();
          return;
        }
      }
    },

    finish() { complete('finish-drill'); },

    checkTimeLimit() {
      const limit = config.timeLimitMs;
      if (limit === undefined || phase === 'complete') return;
      if (priorElapsedMs + (deps.now() - startedAt) >= limit) complete('time-limit');
    },

    attachEvalForFen(fen, ev) {
      if (ev.cp === undefined && ev.mate === undefined) return;
      let changed = false;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i]!;
        if (m.fenBefore === fen && m.evalBefore === undefined) {
          moves[i] = { ...m, evalBefore: { ...(ev.cp !== undefined ? { cp: ev.cp } : {}), ...(ev.mate !== undefined ? { mate: ev.mate } : {}) } };
          changed = true;
        }
        if (m.fenAfter === fen && m.evalAfter === undefined) {
          moves[i] = { ...moves[i]!, evalAfter: { ...(ev.cp !== undefined ? { cp: ev.cp } : {}), ...(ev.mate !== undefined ? { mate: ev.mate } : {}) } };
          changed = true;
        }
      }
      if (changed) emit();
    },

    snapshot(): EngineDrillSnapshot {
      return {
        version: 1,
        startFen: config.startFen,
        learnerIsWhite: config.learnerIsWhite,
        goals: [...goals],
        ...(config.moveLimit !== undefined ? { moveLimit: config.moveLimit } : {}),
        ...(config.timeLimitMs !== undefined ? { timeLimitMs: config.timeLimitMs } : {}),
        difficulty,
        requestedDifficulty: config.difficulty ?? 'casual',
        substituted,
        moves: [...moves],
        takebacks,
        startedAt,
        elapsedMs: priorElapsedMs + (deps.now() - startedAt),
        phase,
        endReason,
        terminal,
        takenBackIndices: [...mTakenBack],
        holdProgress: [...holdProgress.entries()],
        holdMet: [...holdMet.entries()].filter(([, met]) => met).map(([i]) => i),
        promotionSeen,
      };
    },
  };

  // Internal seam the host uses right after a reply lands (kept off the public surface via a
  // symbol-free convention: D14 wires it through the same module).
  (controller as EngineDrillController & { applyReplyPosition: (fen: string) => void }).applyReplyPosition = applyReplyPosition;

  // Resume support: when config carries prior state (via resumeEngineDrill), it is installed below.
  const install = (snap: EngineDrillSnapshot): void => {
    moves = [...snap.moves];
    takebacks = snap.takebacks;


    mTakenBack.clear();
    for (const i of snap.takenBackIndices ?? []) mTakenBack.add(i);
    holdProgress.clear();
    for (const [i, run] of snap.holdProgress ?? []) holdProgress.set(i, run);
    holdMet.clear();
    for (const i of snap.holdMet ?? []) holdMet.set(i, true);
    promotionSeen = snap.promotionSeen ?? false;
    difficulty = snap.difficulty;
    substituted = snap.substituted;
    phase = snap.phase === 'complete' ? 'complete' : 'awaiting-user'; // a partial resumes at the user's turn
    endReason = snap.endReason;
    terminal = snap.terminal;
    priorElapsedMs = snap.elapsedMs;



    let cur = snap.startFen;
    for (const m of moves) {
      if (m.byLearner && mTakenBack.has(m.index)) continue;
      if (m.fenAfter !== '') cur = m.fenAfter;
    }
    currentFen = cur;
  };
  (controller as EngineDrillController & { __install: (s: EngineDrillSnapshot) => void }).__install = install;

  return controller;
}

/** Reconstruct a live controller from a snapshot (partial → resumable; complete → read-only). */
export function resumeEngineDrill(
  snapshot: EngineDrillSnapshot,
  deps: EngineDrillDeps,
  onStateChange?: (state: EngineDrillState) => void,
): EngineDrillController {
  const controller = createEngineDrill({
    startFen: snapshot.startFen,
    learnerIsWhite: snapshot.learnerIsWhite,
    goals: snapshot.goals,
    ...(snapshot.moveLimit !== undefined ? { moveLimit: snapshot.moveLimit } : {}),
    ...(snapshot.timeLimitMs !== undefined ? { timeLimitMs: snapshot.timeLimitMs } : {}),
    difficulty: snapshot.requestedDifficulty,
    deps,
    ...(onStateChange !== undefined ? { onStateChange } : {}),
  });
  (controller as EngineDrillController & { __install: (s: EngineDrillSnapshot) => void }).__install(snapshot);
  return controller;
}

/** The host-facing post-reply position seam (see the reply flow note above). */
export function applyReplyPosition(controller: EngineDrillController, fenAfter: string): void {
  (controller as EngineDrillController & { applyReplyPosition?: (fen: string) => void }).applyReplyPosition?.(fenAfter);
}
