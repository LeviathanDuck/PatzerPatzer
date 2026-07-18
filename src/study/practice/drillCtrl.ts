























import type { TrainableSequence } from '../types';
import { gradeDecision, type GradeOutcome, type PlayedMove } from './grader';
import type { LessonDecision } from './material';
import type { AuthoredLessonContent } from './lessonAuthoring';
import type { SrsAssistanceType, SrsFirstAttemptResult, SrsSessionState } from './srsTypes';

// --- Legacy drill types (consumed by drillView.ts / libraryView.ts — preserved, see header) ---

export type DrillFeedback =
  | 'waiting'      // awaiting user move
  | 'correct'      // last move was correct, brief animation then advance
  | 'incorrect'    // last move was wrong, highlight hint or retry
  | 'showAnswer'   // too many incorrect — reveal the answer
  | 'complete';    // sequence fully drilled

/**
 * Drill session mode:
 * - 'learn'  — system auto-plays the full line first (no user input); after first pass, transitions to 'quiz'.
 * - 'quiz'   — standard interactive quiz mode (default).
 */
export type DrillMode = 'learn' | 'quiz';

export interface DrillSession {
  /** Current position index within the active sequence (0-based, advances on correct) */
  readonly positionIndex: number;
  /** Index into the sequences list */
  readonly sequenceIndex: number;
  /** Current feedback state */
  readonly feedback: DrillFeedback;
  /** How many attempts at the current position (resets on advance) */
  readonly attemptsAtPosition: number;
  /**
   * Current mode — 'learn' (auto-play pass) or 'quiz' (interactive).
   * Starts as 'learn' when `createDrillSession` is called with mode='learn'.
   */
  readonly mode: DrillMode;
  /** Submit a user move (SAN) and return updated session */
  submitMove: (userSan: string) => DrillSession;
  /** Advance past the current position (e.g. after showAnswer) */
  advance: () => DrillSession;
  /** Helpers */
  readonly currentSequence: TrainableSequence | undefined;
  readonly currentExpectedSan: string | undefined;
  readonly isDone: boolean;
}

// Maximum wrong attempts before revealing the answer.
const MAX_WRONG_BEFORE_SHOW_ANSWER = 3;

// --- Factory ---

/**
 * Create a new drill session for the given sequences.
 * @param mode  'learn' auto-plays the line first, then switches to quiz; 'quiz' goes straight to quiz.
 * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts puzzle session lifecycle.
 */
export function createDrillSession(sequences: TrainableSequence[], mode: DrillMode = 'quiz'): DrillSession {
  return makeSession(sequences, 0, 0, 'waiting', 0, mode);
}

function makeSession(
  sequences:          TrainableSequence[],
  sequenceIndex:      number,
  positionIndex:      number,
  feedback:           DrillFeedback,
  attemptsAtPosition: number,
  mode:               DrillMode = 'quiz',
): DrillSession {
  const currentSequence    = sequences[sequenceIndex];
  const currentExpectedSan = currentSequence?.sans[positionIndex];
  const isDone = sequenceIndex >= sequences.length;

  const submitMove = (userSan: string): DrillSession => {
    // In learn mode, submitMove is a no-op — the view should use advance() instead.
    if (mode === 'learn') return makeSession(sequences, sequenceIndex, positionIndex, feedback, attemptsAtPosition, mode);
    if (feedback === 'complete' || isDone) return makeSession(sequences, sequenceIndex, positionIndex, feedback, attemptsAtPosition, mode);
    if (!currentExpectedSan) return makeSession(sequences, sequenceIndex, positionIndex, 'complete', attemptsAtPosition, mode);

    // Legacy SAN-equality check (formerly delegated to the Phase-4 `gradeMove`, which D7 re-derived
    // into the role-aware Learn grader). Inlined here so grader.ts carries only the new grader.
    const correct = userSan.trim() === currentExpectedSan.trim();
    if (correct) {
      return makeSession(sequences, sequenceIndex, positionIndex, 'correct', attemptsAtPosition, mode);
    } else {
      const newAttempts = attemptsAtPosition + 1;
      if (newAttempts >= MAX_WRONG_BEFORE_SHOW_ANSWER) {
        return makeSession(sequences, sequenceIndex, positionIndex, 'showAnswer', newAttempts, mode);
      }
      return makeSession(sequences, sequenceIndex, positionIndex, 'incorrect', newAttempts, mode);
    }
  };

  const advance = (): DrillSession => {
    if (!currentSequence) return makeSession(sequences, sequenceIndex, positionIndex, 'complete', 0, mode);

    const nextPositionIndex = positionIndex + 1;
    if (nextPositionIndex >= currentSequence.sans.length) {
      // Sequence complete — move to next sequence (in learn mode) or transition to quiz.
      const nextSeqIndex = sequenceIndex + 1;
      if (mode === 'learn' && nextSeqIndex >= sequences.length) {
        // Learn pass complete: restart from beginning in quiz mode.
        return makeSession(sequences, 0, 0, 'waiting', 0, 'quiz');
      }
      if (nextSeqIndex >= sequences.length) {
        return makeSession(sequences, nextSeqIndex, 0, 'complete', 0, mode);
      }
      return makeSession(sequences, nextSeqIndex, 0, 'waiting', 0, mode);
    }
    return makeSession(sequences, sequenceIndex, nextPositionIndex, 'waiting', 0, mode);
  };

  return {
    positionIndex,
    sequenceIndex,
    feedback,
    attemptsAtPosition,
    mode,
    submitMove,
    advance,
    currentSequence,
    currentExpectedSan,
    isDone,
  };
}




















/** Learn = interactive guided recall (scoring); Read = manual non-scoring stepping (P2-ORP-16). */
export type LearnMode = 'learn' | 'read';

/** The guided-recall phase for the current step. */
export type LearnPhase =
  | 'recall'        // awaiting the learner's move (prompt shown; NEVER the answer — no demonstrate-first)
  | 'feedback'      // move graded; brief feedback before advancing
  | 'reply-pacing'  // an authored opponent reply is pacing (auto-advance delay, or paused for Next)
  | 'repair'        // wrong/assisted decision entered same-session repair; awaiting a retry
  | 'complete';     // traversal finished (or overridden)

/** A step is either a scored Required target or a non-due lead-in context move (never scored). */
export type LearnStepKind = 'target' | 'context';

/** An authored opponent reply that follows a learner move — the unit Gamebook pacing acts on. */
export interface LearnReply {
  readonly uci: string;
  readonly san: string;
  /** When present the reply carries a comment and pauses for Next; when absent it auto-advances. */
  readonly comment?: string;
  /** A root-position reply uses the shorter delay (lila pacing: `path ? 1000 : 300`). */
  readonly atRoot?: boolean;
}

/** One traversal step: the cued decision to recall, its authored siblings, and an optional reply. */
export interface LearnStep {
  readonly kind: LearnStepKind;
  readonly target: LessonDecision;
  readonly siblings: readonly LessonDecision[];
  readonly reply?: LearnReply;
}

export type LearnTimerHandle = unknown;

/** Injected pacing timer — deterministic in tests, a real `setTimeout` wrapper in D8's board host. */
export interface LearnTimer {
  schedule(fn: () => void, ms: number): LearnTimerHandle;
  cancel(handle: LearnTimerHandle): void;
}

export interface LearnControllerConfig {
  readonly steps: readonly LearnStep[];
  /** Authored content keyed by `decisionId` (prompts, hints, explanations). */
  readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  readonly timer: LearnTimer;
  /** Deterministic id mint for emitted first-attempt signals (precedent: material.ts:166-168). */
  readonly mintId?: () => string;
  /** Comment-free lead-in reply delay (lila: 1000ms). */
  readonly commentFreeReplyDelayMs?: number;
  /** Comment-free root reply delay (lila: 300ms). */
  readonly rootReplyDelayMs?: number;
  /** Maps a UI assistance action to its neutral kernel assistance vocabulary (default: identity). */
  readonly assistanceOf?: (kind: 'hint' | 'show-move') => SrsAssistanceType;
}

/**
 * An EMITTED immutable first-attempt signal for a scored Required target. Recorded ONCE per target on
 * its first scored attempt; a later repair correction NEVER rewrites it (P2-ORP-16 immutable first
 * attempt). This is NOT an `SrsAttemptRecord` — it is the light neutral signal D9 maps into the kernel.
 */
export interface LearnFirstAttempt {
  readonly attemptId: string;
  readonly targetId: string;
  readonly firstAttemptResult: SrsFirstAttemptResult;
  readonly assistanceTypes: readonly SrsAssistanceType[];
  readonly failedMoveKeys: readonly string[];
}

/** A same-session repair item (wrong/assisted target, or a missed context move — never auto-scored). */
export interface LearnRepairItem {
  readonly targetId: string;
  readonly kind: LearnStepKind;
  readonly failedMoveKeys: readonly string[];
}

/** An honest manual override signal (Mark as learned) — DISTINCT from a graded clean pass; it never
 *  fabricates a clean first-attempt or accuracy result (P2-ORP-4 :937-938). */
export interface LearnOverride {
  readonly kind: 'override';
  readonly targetId: string;
}

/** A readonly snapshot of controller state (the view D8 renders from). */
export interface LearnState {
  readonly mode: LearnMode;
  readonly phase: LearnPhase;
  readonly stepIndex: number;
  /** The authored recall prompt for the current step (never the answer move). */
  readonly prompt: string | null;
  /** Whether the solution shape has been revealed (Show move assistance) — starts false. */
  readonly revealed: boolean;
  readonly hintShown: boolean;
  readonly assistanceUsed: readonly SrsAssistanceType[];
  /** True when a commented reply is paused for the user's Next. */
  readonly awaitingNext: boolean;
  readonly sessionState: SrsSessionState;
  /** True only after one clean, unassisted, repair-free traversal of the Required material. */
  readonly completedClean: boolean;
  readonly lastOutcome: GradeOutcome | null;
}

export interface LearnController {
  readonly state: LearnState;
  /** The PURE dispatch entry-point D8's board module calls after a legal learner move. Grades the
   *  current step's target (using the pure grader), records the emitted signals, and advances the
   *  traversal / enters repair / paces the reply. `assist` are assistance types used on THIS move. */
  gradeAndAdvance(move: PlayedMove, assist?: readonly SrsAssistanceType[]): LearnState;
  /** Toggle the authored hidden hint — marks assistance; does NOT reveal the answer move. */
  useHint(): LearnState;
  /** Reveal the solution shape — marks assistance (P2-ORP-10) and sets `revealed`. */
  showMove(): LearnState;
  /** Advance past a paused reply / feedback (the Gamebook Next / space action). */
  next(): LearnState;
  /** Enter non-scoring Read mode — abandons only the unfinished SCORED traversal (a state flag). */
  enterRead(): LearnState;
  /** Return to Learn mode. */
  enterLearn(): LearnState;
  /** Manual non-scoring forward step (Read mode only). */
  readForward(): LearnState;
  /** Manual non-scoring backward step (Read mode only). */
  readBack(): LearnState;
  /** Leave to Analysis/elsewhere — freeze the traversal as `partial` and resumable. */
  interrupt(): LearnState;
  /** Resume a frozen `partial` traversal at its frozen position with prior first-attempt truth intact. */
  resume(): LearnState;
  /** Honest manual override (Mark as learned) — emits override signals; fabricates no clean pass. */
  markAsLearned(): LearnState;
  /** Re-open the line to re-learn; clears completed-clean + live traversal WITHOUT deleting history. */
  reset(): LearnState;
  /** D9-facing emit accessors (the controller never applies these — it only emits). */
  getFirstAttempts(): readonly LearnFirstAttempt[];
  getRepairQueue(): readonly LearnRepairItem[];
  getOverrides(): readonly LearnOverride[];
}

/**
 * Create a Gamebook Learn/Read controller over an ordered traversal of authored decisions.
 *
 * Starts IMMEDIATELY in interactive guided recall (P2-ORP-4 :931 — no demonstrate-first pass, the
 * ratified divergence from Gamebook's `good`-shows-the-move behavior). Emits neutral signals; applies
 * nothing to SRS.
 */
export function createLearnController(config: LearnControllerConfig): LearnController {
  const {
    steps,
    content,
    timer,
    commentFreeReplyDelayMs = 1000,
    rootReplyDelayMs = 300,
  } = config;
  const mint = config.mintId ?? (() => crypto.randomUUID());
  const assistanceOf = config.assistanceOf ?? ((kind) => kind);

  // --- Mutable session state (closure) ---
  let mode: LearnMode = 'learn';
  let phase: LearnPhase = 'recall';
  let stepIndex = 0;
  let prompt: string | null = null;
  let revealed = false;
  let hintShown = false;
  let assistanceUsed: SrsAssistanceType[] = [];
  let awaitingNext = false;
  let sessionState: SrsSessionState = 'active';
  let completedClean = false;
  let lastOutcome: GradeOutcome | null = null;

  // --- Append-only emitted history + live queues ---
  const firstAttempts: LearnFirstAttempt[] = [];
  const firstAttemptByTarget = new Map<string, LearnFirstAttempt>();
  const repairQueue: LearnRepairItem[] = [];
  const overrides: LearnOverride[] = [];
  let anyFailedOrAssisted = false;
  let pendingReplyTimer: LearnTimerHandle | null = null;

  const currentStep = (): LearnStep | undefined => steps[stepIndex];

  const promptFor = (step: LearnStep | undefined): string | null =>
    step ? content.get(step.target.identity.decisionId)?.instructionalPrompt ?? null : null;

  const startRecall = (index: number): void => {
    stepIndex = index;
    const step = currentStep();
    // Guided recall: show the prompt, wait for the move. NEVER reveal the answer here.
    prompt = promptFor(step);
    revealed = false;
    hintShown = false;
    assistanceUsed = [];
    awaitingNext = false;
    phase = 'recall';
  };

  const cancelPendingTimer = (): void => {
    if (pendingReplyTimer !== null) {
      timer.cancel(pendingReplyTimer);
      pendingReplyTimer = null;
    }
  };

  const finishTraversal = (): void => {
    cancelPendingTimer();
    phase = 'complete';
    sessionState = 'completed';
    // "one clean unassisted traversal of the targeted Required material" — a genuinely clean pass only.
    completedClean = !anyFailedOrAssisted && repairQueue.length === 0;
  };

  const advanceToNextStep = (): void => {
    cancelPendingTimer();
    const next = stepIndex + 1;
    if (next >= steps.length) finishTraversal();
    else startRecall(next);
  };

  // Comment-sensitive pacing (re-derived from gamebookPlayCtrl :52-55): a comment-free reply
  // auto-advances after a short delay; a commented reply pauses for Next.
  const paceReply = (reply: LearnReply): void => {
    if (reply.comment !== undefined) {
      awaitingNext = true;
      phase = 'reply-pacing';
      return;
    }
    phase = 'reply-pacing';
    awaitingNext = false;
    const delay = reply.atRoot ? rootReplyDelayMs : commentFreeReplyDelayMs;
    pendingReplyTimer = timer.schedule(() => {
      pendingReplyTimer = null;
      advanceToNextStep();
    }, delay);
  };

  const completeStepThenAdvance = (step: LearnStep): void => {
    if (step.reply) paceReply(step.reply);
    else advanceToNextStep();
  };

  const addAssistance = (types: readonly SrsAssistanceType[]): void => {
    for (const t of types) if (!assistanceUsed.includes(t)) assistanceUsed.push(t);
  };

  const snapshot = (): LearnState => ({
    mode,
    phase,
    stepIndex,
    prompt,
    revealed,
    hintShown,
    assistanceUsed: assistanceUsed.slice(),
    awaitingNext,
    sessionState,
    completedClean,
    lastOutcome,
  });

  // Initialise: empty plan completes immediately; otherwise start in guided recall.
  if (steps.length === 0) {
    phase = 'complete';
    sessionState = 'completed';
    completedClean = true;
  } else {
    startRecall(0);
  }

  const gradeAndAdvance = (move: PlayedMove, assist: readonly SrsAssistanceType[] = []): LearnState => {
    // Read mode is non-scoring and grade dispatch is inert; only recall/repair accept a graded move.
    if (mode === 'read' || (phase !== 'recall' && phase !== 'repair')) return snapshot();
    const step = currentStep();
    if (!step) return snapshot();

    addAssistance(assist);
    const outcome = gradeDecision({
      target: step.target,
      siblings: step.siblings,
      played: move,
      content,
      assistance: assistanceUsed.slice(),
      isContext: step.kind === 'context',
    });
    lastOutcome = outcome;

    // Record immutable first-attempt truth ONCE per target, only for a scored outcome. A later repair
    // correction finds the target already recorded and never rewrites it (P2-ORP-16 :1136).
    const targetId = step.target.identity.decisionId;
    if (outcome.scored && !firstAttemptByTarget.has(targetId)) {
      const record: LearnFirstAttempt = {
        attemptId: mint(),
        targetId,
        firstAttemptResult: outcome.firstAttemptResult ?? 'failed',
        assistanceTypes: outcome.assistanceTypes.slice(),
        failedMoveKeys: outcome.failedMoveKeys.slice(),
      };
      firstAttempts.push(record);
      firstAttemptByTarget.set(targetId, record);
    }

    // A clean unassisted correct target keeps the traversal clean; anything else taints it.
    if (!(outcome.category === 'correct' && outcome.firstAttemptResult === 'clean')) {
      anyFailedOrAssisted = true;
    }

    switch (outcome.continuation) {
      case 'repair':
        // Wrong / assisted / off-book / missed-context → same-session repair; walk back to lead-in
        // (stay on this step) and retry. A missed CONTEXT move is queued diagnostic-only (:877).
        repairQueue.push({
          targetId: outcome.decisionId,
          kind: step.kind,
          failedMoveKeys: outcome.failedMoveKeys.slice(),
        });
        phase = 'repair';
        awaitingNext = false;
        return snapshot();

      case 'none':
        // needs-classification: not graded/scored; route to authoring. Stay in recall for a retry.
        phase = 'recall';
        return snapshot();

      case 'return-to-trained-path':
      case 'advance-played-branch':
      default:
        completeStepThenAdvance(step);
        return snapshot();
    }
  };

  const useHint = (): LearnState => {
    if (mode !== 'learn' || (phase !== 'recall' && phase !== 'repair')) return snapshot();
    hintShown = !hintShown;
    if (hintShown) addAssistance([assistanceOf('hint')]);
    return snapshot();
  };

  const showMove = (): LearnState => {
    if (mode !== 'learn' || (phase !== 'recall' && phase !== 'repair')) return snapshot();
    revealed = true;
    addAssistance([assistanceOf('show-move')]);
    return snapshot();
  };

  const next = (): LearnState => {
    if (phase === 'reply-pacing') {
      advanceToNextStep();
    } else if (phase === 'repair') {
      // Retry the failed decision: re-enter recall on the same step (first-attempt truth is held).
      phase = 'recall';
    } else if (phase === 'feedback') {
      advanceToNextStep();
    }
    return snapshot();
  };

  const enterRead = (): LearnState => {
    cancelPendingTimer();
    mode = 'read';
    // Entering Read abandons only the unfinished SCORED traversal — a state flag, not an SRS write.
    if (phase !== 'complete') sessionState = 'partial';
    return snapshot();
  };

  const enterLearn = (): LearnState => {
    mode = 'learn';
    return snapshot();
  };

  const readForward = (): LearnState => {
    if (mode !== 'read') return snapshot();
    if (stepIndex < steps.length - 1) stepIndex += 1;
    return snapshot();
  };

  const readBack = (): LearnState => {
    if (mode !== 'read') return snapshot();
    if (stepIndex > 0) stepIndex -= 1;
    return snapshot();
  };

  const interrupt = (): LearnState => {
    cancelPendingTimer();
    // Freeze the active traversal against its starting snapshot; it becomes Partial and resumable.
    if (phase !== 'complete') sessionState = 'partial';
    return snapshot();
  };

  const resume = (): LearnState => {
    mode = 'learn';
    sessionState = 'active';
    // Resume at the frozen position; prior first-attempt truth (firstAttempts) is untouched.
    startRecall(stepIndex);
    return snapshot();
  };

  const markAsLearned = (): LearnState => {
    cancelPendingTimer();
    // Honest override: emit an override signal per Required target that has no first attempt yet.
    // NEVER fabricate a clean first-attempt or accuracy result (P2-ORP-4 :937-938).
    for (const step of steps) {
      if (step.kind !== 'target') continue;
      const id = step.target.identity.decisionId;
      if (!overrides.some((o) => o.targetId === id)) overrides.push({ kind: 'override', targetId: id });
    }
    phase = 'complete';
    sessionState = 'completed';
    // completedClean stays as-is (false unless a genuine clean pass already set it) — an override is
    // explicitly NOT a graded clean pass.
    return snapshot();
  };

  const reset = (): LearnState => {
    cancelPendingTimer();
    // Re-open the line to re-learn move by move. Clears completed-clean + live traversal state but
    // NEVER deletes append-only attempt history (firstAttempts / overrides survive).
    repairQueue.length = 0;
    anyFailedOrAssisted = false;
    completedClean = false;
    sessionState = 'active';
    mode = 'learn';
    lastOutcome = null;
    if (steps.length === 0) {
      phase = 'complete';
      sessionState = 'completed';
    } else {
      startRecall(0);
    }
    return snapshot();
  };

  return {
    get state() {
      return snapshot();
    },
    gradeAndAdvance,
    useHint,
    showMove,
    next,
    enterRead,
    enterLearn,
    readForward,
    readBack,
    interrupt,
    resume,
    markAsLearned,
    reset,
    getFirstAttempts: () => firstAttempts.slice(),
    getRepairQueue: () => repairQueue.slice(),
    getOverrides: () => overrides.slice(),
  };
}
