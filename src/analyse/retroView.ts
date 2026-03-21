// Retrospection feedback strip and entry button rendering.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroView.ts
//
// This module owns only rendering — no session state, no lifecycle, no navigation.
// All mutable deps (retro session, navigate, redraw, uciToSan) are passed explicitly
// so this module has no imports from main.ts or module-level side effects.

import { h, type VNode } from 'snabbdom';
import type { RetroCtrl } from './retroCtrl';

// --- Entry button ---

export interface RetroEntryDeps {
  /** Active retro session, or undefined when not in retro mode. */
  retro:            RetroCtrl | undefined;
  /** True when game review has completed and the Mistakes button should be enabled. */
  analysisComplete: boolean;
  /** True while batch review is in progress — keeps the button disabled. */
  batchAnalyzing:   boolean;
  /** Toggles retrospection on/off; orchestration stays in the caller. */
  onToggle:         () => void;
}

/**
 * Renders the Mistakes / Close entry button for retrospection.
 * Placed inside the analysis controls row (extraButtons slot of renderAnalysisControls).
 * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroView.ts entry affordance.
 */
export function renderRetroEntry(deps: RetroEntryDeps): VNode {
  const { retro, analysisComplete, batchAnalyzing, onToggle } = deps;
  return h('button', {
    class: { active: !!retro },
    attrs: {
      disabled: !analysisComplete || batchAnalyzing,
      title: retro
        ? 'Close mistake review'
        : analysisComplete
          ? 'Review your mistakes from this game'
          : 'Complete game review first',
    },
    on: { click: onToggle },
  }, retro ? 'Close' : 'Mistakes');
}

// --- Active-session feedback strip ---

export interface RetroStripDeps {
  /** Active retro session — returns null when not in retro mode. */
  retro:    RetroCtrl | undefined;
  /** Navigate to a tree path; provided by the analysis board owner. */
  navigate: (path: string) => void;
  /** Trigger a Snabbdom redraw. */
  redraw:   () => void;
  /** Convert a UCI move string to SAN given a position FEN. */
  uciToSan: (fen: string, uci: string) => string;
}

/**
 * Renders the active-session feedback strip shown while retrospection is running.
 * Returns null when no retro session is active.
 * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroView.ts
 */
export function renderRetroStrip(deps: RetroStripDeps): VNode | null {
  const { retro, navigate, redraw, uciToSan } = deps;
  if (!retro) return null;

  const feedback  = retro.feedback();
  const cand      = retro.current();
  const [solved, total] = retro.completion();

  // Progress indicator — mirrors Lichess "X / Y" completion display
  const progress = h('span.retro-strip__progress', `${solved} / ${total}`);

  // Action buttons vary by feedback state.
  // Mirrors lichess-org/lila: retroView.ts feedback.find / fail / win / view rendering.
  const buttons: (VNode | null)[] = [];

  if (feedback === 'find' || feedback === 'offTrack') {
    buttons.push(
      h('button.retro-strip__btn', {
        on: { click: () => {
          retro.viewSolution();
          // Navigate to the mistake node so the solution is visible on the board.
          if (cand) navigate(cand.path);
        }},
      }, 'Show answer'),
      h('button.retro-strip__btn', {
        on: { click: () => {
          retro.skip();
          const next = retro.current();
          if (next) navigate(next.parentPath);
          else redraw();
        }},
      }, 'Skip'),
    );
  } else if (feedback === 'win') {
    buttons.push(
      h('button.retro-strip__btn.retro-strip__btn--next', {
        on: { click: () => {
          retro.jumpToNext();
          const next = retro.current();
          if (next) navigate(next.parentPath);
          else redraw();
        }},
      }, 'Next →'),
    );
  } else if (feedback === 'fail') {
    buttons.push(
      h('button.retro-strip__btn', {
        on: { click: () => {
          // Already at parentPath (board/index.ts navigated back); just reset feedback.
          retro.setFeedback('find');
          redraw();
        }},
      }, 'Retry'),
      h('button.retro-strip__btn', {
        on: { click: () => {
          retro.viewSolution();
          if (cand) navigate(cand.path);
        }},
      }, 'Show answer'),
    );
  } else if (feedback === 'view') {
    // Show the engine best move in SAN so the user knows what to play.
    const bestSan = cand ? uciToSan(cand.fenBefore, cand.bestMove) : null;
    if (bestSan) buttons.push(h('span.retro-strip__best', `Best: ${bestSan}`));
    buttons.push(
      h('button.retro-strip__btn.retro-strip__btn--next', {
        on: { click: () => {
          retro.jumpToNext();
          const next = retro.current();
          if (next) navigate(next.parentPath);
          else redraw();
        }},
      }, 'Next →'),
    );
  }

  // Label line: describes the current state to the user.
  // Mirrors lichess-org/lila: retroView.ts feedback.find / fail / win / view labels.
  let label: string;
  if (!cand) {
    label = 'Review complete!';
  } else if (feedback === 'win') {
    label = 'Correct!';
  } else if (feedback === 'fail') {
    label = 'Not the best move.';
  } else if (feedback === 'view') {
    label = `${cand.classification.charAt(0).toUpperCase() + cand.classification.slice(1)} on move ${Math.ceil(cand.ply / 2)}`;
  } else if (feedback === 'offTrack') {
    label = 'Navigate back to resume';
  } else {
    const color = cand.ply % 2 === 1 ? 'White' : 'Black';
    label = `Find the best move for ${color}`;
  }

  return h('div.retro-strip', [
    h('div.retro-strip__label', label),
    h('div.retro-strip__actions', [...buttons, progress]),
  ]);
}
