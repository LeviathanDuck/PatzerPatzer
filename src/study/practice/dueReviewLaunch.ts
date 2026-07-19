












import { initLearnView } from './drillView';
import {
  startDueReviewSession,
  resumePersistedDueReview,
  markDueReviewSessionPartial,
  type DueReviewHostRuntime,
  type ResumeDueReviewResult,
  type StartDueReviewInput,
  type StartDueReviewResult,
} from './dueReviewHost';
import type { RepairCycleDriver } from './drillCtrl';
import type { DueReviewScorecard } from './sessionBuilder';
import type { SrsTraversalPlanEntry } from './srsTypes';

/** Upcoming-load preview size surfaced with the scorecard (a projection, never a schedule write). */
const UPCOMING_PREVIEW_LIMIT = 5;

/** Optional surface hooks. `onSessionEnd` receives the final scorecard and the upcoming-load
 *  preview (default: console log). */
export interface DueReviewLaunchHooks {
  readonly onSessionEnd?: (
    scorecard: DueReviewScorecard,
    upcoming?: readonly SrsTraversalPlanEntry[],
  ) => void;
}

function surfaceScorecard(
  runtime: DueReviewHostRuntime,
  redraw: () => void,
  hooks: DueReviewLaunchHooks,
): void {
  const card = runtime.scorecard();
  const upcoming = runtime.upcoming(UPCOMING_PREVIEW_LIMIT);
  if (hooks.onSessionEnd) {
    hooks.onSessionEnd(card, upcoming);
  } else {
    console.info(
      `[dueReviewLaunch] due review complete: ${card.clean}/${card.total} clean` +
      ` (${Math.round(card.accuracy * 100)}% accuracy; ${card.failed} failed, ${card.assisted} assisted);` +
      ` ${upcoming.length} upcoming target(s) in the preview window`,
    );
  }
  redraw();
}




function interruptionHook(runtime: DueReviewHostRuntime): (reason: string) => void {
  return () => {
    if (runtime.currentReplay() !== undefined) {
      void markDueReviewSessionPartial(runtime.sessionId);
    }
  };
}

/**
 * P2-ORP-5 interleaved repair cycle (Sol A5: exported by the host but previously never wired):
 * after the plan drains, failed targets resurface round-robin until each records the required
 * consecutive clean retries. SCHEDULE-NEUTRAL by construction — repair retries record into the
 * driver only; `completeTarget` is never called (the cursor is already past these targets, and
 * repair repetitions must not touch SRS).
 */
function presentRepairReplay(
  runtime: DueReviewHostRuntime,
  driver: RepairCycleDriver,
  redraw: () => void,
  hooks: DueReviewLaunchHooks,
): void {
  const targetId = driver.peek();
  if (targetId === null) {
    surfaceScorecard(runtime, redraw, hooks);
    return;
  }
  const entry = runtime.session.plan.entries.find(e => e.targetId === targetId);
  const model = entry === undefined ? undefined : runtime.viewMaterialFor(entry.lessonId);
  if (entry === undefined || model === undefined) {
    // Unresolvable repair material (dropped lesson): never fake a clean run — end the cycle
    // honestly at the scorecard.
    console.warn(`[dueReviewLaunch] no repair material for target ${targetId}; ending repair cycle`);
    surfaceScorecard(runtime, redraw, hooks);
    return;
  }
  let retryClean = false;
  initLearnView({
    line: model.line,
    content: model.content,
    replies: model.replies,
    siblingsAt: model.siblingsAt,
    targetIds: new Set([targetId]),
    leadInFenFor: model.leadInFenFor,
    shapesFor: model.shapesFor,
    rootFen: model.rootFen,
    trainAs: model.line[0]?.learnerSide ?? 'white',
    redraw,
    onTargetComplete: (completion) => {
      retryClean = completion.attempt.firstAttemptResult === 'clean'
        && completion.attempt.assistanceTypes.length === 0;
    },
    onLineComplete: () => {
      driver.recordRetry(retryClean);
      presentRepairReplay(runtime, driver, redraw, hooks);
    },
    onTeardown: interruptionHook(runtime),
  });
  redraw();
}

/**
 * Present the runtime's next per-target replay in guided recall — or, when nothing deliverable
 * remains, run the repair cycle and then surface the scorecard. Completion performs the one
 * awaited write; line completion advances ONLY after that write settles (Sol A11).
 */
export function presentNextDueReplay(
  runtime: DueReviewHostRuntime,
  redraw: () => void,
  hooks: DueReviewLaunchHooks = {},
): void {
  const replay = runtime.currentReplay();
  if (replay === undefined) {
    presentRepairReplay(runtime, runtime.repairDriver(), redraw, hooks);
    return;
  }
  const model = runtime.viewMaterialFor(replay.lessonId);
  if (model === undefined) {
    console.warn(`[dueReviewLaunch] no material for lesson ${replay.lessonId}; stopping session`);
    return;
  }
  // Sol A11 (HIGH): the completion promise must settle BEFORE the next replay presents — the
  // runtime cursor only advances when the atomic write commits, so advancing early re-presented
  // the SAME target and mis-sequenced persistence on lines without a delayed opponent reply.
  let pendingCompletion: Promise<unknown> | null = null;
  initLearnView({
    line: model.line,
    content: model.content,
    replies: model.replies,
    siblingsAt: model.siblingsAt,
    targetIds: new Set([replay.targetId]),
    leadInFenFor: model.leadInFenFor,
    shapesFor: model.shapesFor,
    rootFen: model.rootFen,
    trainAs: model.line[0]?.learnerSide ?? 'white',
    redraw,
    onTargetComplete: (completion) => { pendingCompletion = runtime.completeTarget(completion); },
    onLineComplete: () => {
      void (async () => {
        try {
          if (pendingCompletion !== null) await pendingCompletion;
        } catch {
          // The host returns typed results; a raw rejection still must not stall the session.
        }
        presentNextDueReplay(runtime, redraw, hooks);
      })();
    },
    onTeardown: interruptionHook(runtime),
  });
  redraw();
}

/** Start a fresh due-review session and present its first replay. Typed result passthrough. */
export async function launchDueReview(
  input: StartDueReviewInput,
  redraw: () => void,
  hooks: DueReviewLaunchHooks = {},
): Promise<StartDueReviewResult> {
  const started = await startDueReviewSession(input);
  if (started.ok) presentNextDueReplay(started.runtime, redraw, hooks);
  return started;
}

/** Resume a persisted (partial) session and present its next replay. Typed result passthrough. */
export async function resumeDueReview(
  sessionId: string,
  input: Pick<StartDueReviewInput, 'scope' | 'learnerSideFor'>,
  redraw: () => void,
  hooks: DueReviewLaunchHooks = {},
): Promise<ResumeDueReviewResult> {
  const resumed = await resumePersistedDueReview(sessionId, input);
  if (resumed.ok) presentNextDueReplay(resumed.runtime, redraw, hooks);
  return resumed;
}
