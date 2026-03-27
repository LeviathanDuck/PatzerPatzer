// Retrospection feedback box and entry button rendering.
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

// --- Active-session feedback box ---

export interface RetroStripDeps {
  /** Active retro session — returns null when not in retro mode. */
  retro:             RetroCtrl | undefined;
  /** Navigate to a tree path; provided by the analysis board owner. */
  navigate:          (path: string) => void;
  /** Trigger a Snabbdom redraw. */
  redraw:            () => void;
  /** Convert a UCI move string to SAN given a position FEN. */
  uciToSan:          (fen: string, uci: string) => string;
  /** Reveal engine guidance for the current candidate and redraw. */
  onRevealGuidance:  () => void;
  /** Close the retro session. */
  onClose:           () => void;
  /** Returns current engine search depth for the progress bar. */
  getEvalDepth?:     () => number | undefined;
}

// Eval progress bar — mirrors lichess-org/lila: retroView.ts renderEvalProgress
// Shows engine search depth as a thin animated bar.
// minDepth/maxDepth match the Lichess isCevalReady thresholds (8 → 18).
const MIN_DEPTH = 8;
const MAX_DEPTH = 18;

function renderEvalProgress(depth: number | undefined): VNode {
  const pct = depth ? Math.min(100, Math.max(0, (100 * (depth - MIN_DEPTH)) / (MAX_DEPTH - MIN_DEPTH))) : 0;
  return h('div.retro-progress', h('div', { attrs: { style: `width: ${pct}%` } }));
}

// Shared "view solution / skip" choice links.
// Mirrors lichess-org/lila: retroView.ts skipOrViewSolution
function renderSkipOrView(
  retro: RetroCtrl,
  navigate: (path: string) => void,
  redraw: () => void,
): VNode {
  const cand = retro.current();
  return h('div.retro-choices', [
    h('a', {
      on: { click: () => {
        retro.viewSolution();
        if (cand) navigate(cand.path);
        else redraw();
      }},
    }, 'View the solution'),
    h('a', {
      on: { click: () => {
        retro.skip();
        const next = retro.current();
        if (next) navigate(next.parentPath);
        else redraw();
      }},
    }, 'Skip this move'),
  ]);
}

// Blue "▶ Next" continue half-button.
// Mirrors lichess-org/lila: retroView.ts jumpToNext VNode (a.half.continue)
function renderContinue(retro: RetroCtrl, navigate: (path: string) => void, redraw: () => void): VNode {
  return h('a.retro-continue', {
    on: { click: () => {
      retro.jumpToNext();
      const next = retro.current();
      if (next) navigate(next.parentPath);
      else redraw();
    }},
  }, [
    h('span.retro-continue__icon', '▶'),
    'Next',
  ]);
}

/**
 * Renders the active-session feedback box shown while retrospection is running.
 * Returns null when no retro session is active.
 * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroView.ts
 */
export function renderRetroStrip(deps: RetroStripDeps): VNode | null {
  const { retro, navigate, redraw, uciToSan, onRevealGuidance, onClose, getEvalDepth } = deps;
  if (!retro) return null;

  const feedback        = retro.feedback();
  const cand            = retro.current();
  const [solved, total] = retro.completion();
  const revealed        = retro.guidanceRevealed();

  // Progress counter: "1 / 5" — mirrors Lichess title span
  // Show next-to-solve index (current + 1), capped at total.
  const progressText = `${Math.min(solved + 1, total)} / ${total}`;

  // --- Feedback content, per state ---
  // Mirrors lichess-org/lila: retroView.ts feedback.{state}() functions

  let feedbackContent: VNode[];

  if (!cand) {
    // Session complete — no more candidates.
    // Mirrors lichess-org/lila: retroView.ts feedback.end()
    feedbackContent = [
      h('div.retro-player', [
        h('div.retro-king', '♚'),
        h('div.retro-instruction', [
          h('em', total === 0 ? 'No mistakes found.' : 'Done reviewing mistakes.'),
          h('div.retro-choices', [
            total > 0 && h('a', { on: { click: () => { retro.reset(); const f = retro.current(); if (f) navigate(f.parentPath); else redraw(); } } }, 'Do it again'),
          ].filter(Boolean) as VNode[]),
        ]),
      ]),
    ];
  } else if (feedback === 'find') {
    // Waiting for the user to find the best move.
    // Mirrors lichess-org/lila: retroView.ts feedback.find()
    const color = cand.playerColor === 'white' ? 'White' : 'Black';
    feedbackContent = [
      h('div.retro-player', [
        h('div.retro-instruction', [
          h('strong', [
            h('move', cand.playedMoveSan),
            ' was played',
          ]),
          h('em', `Find a better move for ${color}`),
          renderSkipOrView(retro, navigate, redraw),
        ]),
      ]),
    ];
  } else if (feedback === 'offTrack') {
    // User navigated away.
    // Mirrors lichess-org/lila: retroView.ts feedback.offTrack()
    feedbackContent = [
      h('div.retro-player', [
        h('div.retro-icon.retro-icon--off', '!'),
        h('div.retro-instruction', [
          h('strong', 'You browsed away'),
          h('div.retro-choices.retro-choices--off', [
            h('a', {
              on: { click: () => {
                const c = retro.current();
                if (c) navigate(c.parentPath);
                else redraw();
              }},
            }, 'Resume learning'),
          ]),
        ]),
      ]),
    ];
  } else if (feedback === 'fail') {
    // User played a suboptimal move — nuanced message based on failKind.
    // Mirrors lichess-org/lila: retroView.ts feedback.fail()
    const fk = retro.failKind();
    const color = cand.playerColor === 'white' ? 'White' : 'Black';
    let strongText: string;
    if (fk === 'better') {
      strongText = 'Better, but not the best move available.';
    } else if (fk === 'worse') {
      strongText = 'That move is even worse.';
    } else {
      strongText = 'You can do better.';
    }
    feedbackContent = [
      h('div.retro-player', [
        h('div.retro-icon.retro-icon--fail', '✗'),
        h('div.retro-instruction', [
          h('strong', strongText),
          h('em', `Try another move for ${color}`),
          renderSkipOrView(retro, navigate, redraw),
        ]),
      ]),
    ];
  } else if (feedback === 'eval') {
    // Engine is silently judging the played move.
    // Mirrors lichess-org/lila: retroView.ts feedback.eval()
    const depth = getEvalDepth?.();
    feedbackContent = [
      h('div.retro-half.retro-half--top',
        h('div.retro-player.retro-player--center', [
          h('div.retro-instruction', [
            h('strong', 'Evaluating your move\u2026'),
            renderEvalProgress(depth),
          ]),
        ]),
      ),
    ];
  } else if (feedback === 'win') {
    // User found a good move.
    // Mirrors lichess-org/lila: retroView.ts feedback.win()
    const wk = retro.winKind();
    const msg = wk === 'near-best' ? 'Good enough!' : 'Good move!';
    feedbackContent = [
      h('div.retro-half.retro-half--top',
        h('div.retro-player', [
          h('div.retro-icon.retro-icon--win', '✓'),
          h('div.retro-instruction', h('strong', msg)),
        ]),
      ),
      renderContinue(retro, navigate, redraw),
    ];
  } else {
    // feedback === 'view' — solution revealed.
    // Mirrors lichess-org/lila: retroView.ts feedback.view()
    const bestSan = uciToSan(cand.fenBefore, cand.bestMove);
    feedbackContent = [
      h('div.retro-half.retro-half--top',
        h('div.retro-player', [
          h('div.retro-icon.retro-icon--win', '✓'),
          h('div.retro-instruction', [
            h('strong', 'Solution'),
            h('em', ['Best was ', h('strong', bestSan)]),
          ]),
        ]),
      ),
      renderContinue(retro, navigate, redraw),
    ];
  }

  // "Show engine" button — lets the user reveal PV lines for this candidate.
  // Mirrors lichess-org/lila: retroCtrl.ts showBadNode reveal affordance.
  // Hidden once guidance is already revealed.
  const showEngineBtn = (!revealed && cand && feedback !== 'eval') ? [
    h('div.retro-engine-reveal', [
      h('a', { on: { click: onRevealGuidance } }, 'Show engine'),
    ]),
  ] : [];

  return h('div.retro-box.training-box', [
    // Title bar — mirrors lichess-org/lila: retroView.ts div.title
    h('div.retro-box__title', [
      h('span', 'Learn from your mistakes'),
      h('span.retro-box__progress', progressText),
      h('button.retro-box__close', { on: { click: onClose }, attrs: { title: 'Close' } }, '✕'),
    ]),
    // Feedback area — mirrors lichess-org/lila: retroView.ts div.feedback.{state}
    h('div.retro-feedback.' + feedback, [
      ...feedbackContent,
      ...showEngineBtn,
    ]),
  ]);
}
