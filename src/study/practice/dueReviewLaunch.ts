






import { initLearnView } from './drillView';
import {
  startDueReviewSession,
  resumePersistedDueReview,
  type DueReviewHostRuntime,
  type ResumeDueReviewResult,
  type StartDueReviewInput,
  type StartDueReviewResult,
} from './dueReviewHost';
import type { DueReviewScorecard } from './sessionBuilder';

/** Optional surface hooks. `onSessionEnd` receives the final scorecard (default: console log). */
export interface DueReviewLaunchHooks {
  readonly onSessionEnd?: (scorecard: DueReviewScorecard) => void;
}

/**
 * Present the runtime's next per-target replay in guided recall — or, when nothing deliverable
 * remains, surface the scorecard. The controller's emits drive the host: completion performs the
 * one awaited write; line completion advances to the next frozen-plan replay.
 */
export function presentNextDueReplay(
  runtime: DueReviewHostRuntime,
  redraw: () => void,
  hooks: DueReviewLaunchHooks = {},
): void {
  const replay = runtime.currentReplay();
  if (replay === undefined) {
    const card = runtime.scorecard();
    if (hooks.onSessionEnd) {
      hooks.onSessionEnd(card);
    } else {
      console.info(
        `[dueReviewLaunch] due review complete: ${card.clean}/${card.total} clean` +
        ` (${Math.round(card.accuracy * 100)}% accuracy; ${card.failed} failed, ${card.assisted} assisted)`,
      );
    }
    redraw();
    return;
  }
  const model = runtime.viewMaterialFor(replay.lessonId);
  if (model === undefined) {
    console.warn(`[dueReviewLaunch] no material for lesson ${replay.lessonId}; stopping session`);
    return;
  }
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
    onTargetComplete: (completion) => { void runtime.completeTarget(completion); },
    onLineComplete: () => { presentNextDueReplay(runtime, redraw, hooks); },
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
