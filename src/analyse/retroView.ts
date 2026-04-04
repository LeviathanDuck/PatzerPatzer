// Retrospection feedback box and entry button rendering.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroView.ts
//
// This module owns only rendering — no session state, no lifecycle, no navigation.
// All mutable deps (retro session, navigate, redraw, uciToSan) are passed explicitly
// so this module has no imports from main.ts or module-level side effects.

import { h, type VNode } from 'snabbdom';
import type { RetroCtrl, SolvingMoveSnapshot } from './retroCtrl';
import type { RetroCandidate } from './retro';
import { playUciMove } from '../board/index';
import { setRetroVisibleEngineEnabled, resetRetroVisibleEngineUi } from '../ceval/view';
import { syncArrow } from '../engine/ctrl';
import { type EvalDiff } from './evalDiff';
import { evalWinChances } from '../engine/winchances';
import { retroCandidateToDefinition } from '../puzzles/adapters';
import { savePuzzleDefinition, saveAttempt } from '../puzzles/puzzleDb';
import type { PuzzleAttempt, FailureReason, SolveResult } from '../puzzles/types';
import type { RetroOutcome } from './retroCtrl';

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

/** Render the eval diff value when available. Copy/styling is deferred to a polish task. */
function renderEvalDiff(diff: EvalDiff | undefined): VNode | null {
  if (!diff) return null;
  // Hide the badge when the difference is zero or negative (eval noise / near-equal move).
  // For cp-backed diffs use cpDiff; for mate-miss cases (cpDiff null) fall back to wcDiff.
  if (diff.cpDiff !== null ? diff.cpDiff <= 0 : diff.wcDiff <= 0) return null;
  return h('span.retro-feedback__eval-diff', diff.formatted);
}

function renderGameMoveEvalDiff(cand: RetroCandidate | null): VNode | null {
  if (!cand) return null;
  return renderEvalDiff(cand.evalDiff);
}

// --- Dual eval diff boxes (CCP-634) ---

/**
 * Convert a white-perspective cp value to mover-perspective cp.
 * Returns the diff in pawn units, or null if either input is undefined.
 */
type DualEvalComparison =
  | { kind: 'cp'; diff: number }
  | { kind: 'wc'; diff: number };

function computeDualEvalComparison(
  a: { cp?: number; mate?: number },
  b: { cp?: number; mate?: number },
  color: SolvingMoveSnapshot['playerColor'],
): DualEvalComparison | null {
  if (a.cp !== undefined && b.cp !== undefined) {
    const moverA = color === 'white' ? a.cp : -a.cp;
    const moverB = color === 'white' ? b.cp : -b.cp;
    return { kind: 'cp', diff: (moverA - moverB) / 100 };
  }
  const wcA = evalWinChances(a);
  const wcB = evalWinChances(b);
  if (wcA === undefined || wcB === undefined) return null;
  const moverA = color === 'white' ? wcA : -wcA;
  const moverB = color === 'white' ? wcB : -wcB;
  return { kind: 'wc', diff: ((moverA - moverB) / 2) * 100 };
}

/**
 * Format a dual-box comparison display.
 * Clamp negative/positive zero after rounding so tiny eval noise does not
 * render as misleading "-0.0" or "+0.0" in the UI.
 */
function formatDualEvalDiff(diff: DualEvalComparison): string {
  if (diff.kind === 'wc') {
    const rounded = Math.round(diff.diff);
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return `${normalized}%`;
  }
  const rounded = Math.round(diff.diff * 10) / 10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return normalized.toFixed(1);
}

function renderEvalBox(grade: string, label: string, display: string): VNode {
  return h('div.retro-eval-box', { class: { [`retro-eval-box--${grade}`]: true } }, [
    h('span.retro-eval-box__label', label),
    h('span.retro-eval-box__value', display),
  ]);
}

function renderDualEvalBoxes(retro: RetroCtrl): VNode | null {
  const snapshot = retro.getSolvingMoveSnapshot();
  if (!snapshot) return null;

  const solvingEval = {
    ...(snapshot.solvingMoveCp   !== undefined && { cp:   snapshot.solvingMoveCp }),
    ...(snapshot.solvingMoveMate !== undefined && { mate: snapshot.solvingMoveMate }),
  };
  const engineBestEval = {
    ...(snapshot.engineBestCp   !== undefined && { cp:   snapshot.engineBestCp }),
    ...(snapshot.engineBestMate !== undefined && { mate: snapshot.engineBestMate }),
  };
  const gameMoveEval = {
    ...(snapshot.gameMoveCp   !== undefined && { cp:   snapshot.gameMoveCp }),
    ...(snapshot.gameMoveMate !== undefined && { mate: snapshot.gameMoveMate }),
  };

  const vsBestDiff = computeDualEvalComparison(solvingEval, engineBestEval, snapshot.playerColor);
  const vsGameDiff = computeDualEvalComparison(solvingEval, gameMoveEval, snapshot.playerColor);

  // --- vs Engine Best box ---
  let vsBestGrade: string;
  let vsBestDisplay: string;
  if (vsBestDiff === null) {
    vsBestGrade = 'bad';
    vsBestDisplay = '—';
  } else if (Math.abs(vsBestDiff.diff) < 0.005) {
    // Exact best move (within rounding tolerance)
    vsBestGrade = 'best';
    vsBestDisplay = '✓';
  } else if (vsBestDiff.kind === 'cp' && vsBestDiff.diff > -0.5 && vsBestDiff.diff < 0) {
    // Slightly worse than best
    vsBestGrade = 'near';
    vsBestDisplay = formatDualEvalDiff(vsBestDiff);
  } else if (vsGameDiff !== null && vsGameDiff.diff > 0) {
    // Clearly worse than best but still better than the game move
    vsBestGrade = 'ok';
    vsBestDisplay = formatDualEvalDiff(vsBestDiff);
  } else {
    // Worse than or equal to the original game move
    vsBestGrade = 'bad';
    vsBestDisplay = formatDualEvalDiff(vsBestDiff);
  }

  // --- vs Move Played (game move) box ---
  let vsGameGrade: string;
  let vsGameDisplay: string;
  if (vsGameDiff === null) {
    vsGameGrade = 'bad';
    vsGameDisplay = '—';
  } else if (vsGameDiff.diff > 0.005) {
    const formatted = formatDualEvalDiff(vsGameDiff);
    if (formatted === '0.0' || formatted === '0%') {
      vsGameGrade = 'near';
      vsGameDisplay = formatted;
    } else {
      vsGameGrade = 'ok';
      vsGameDisplay = `+${formatted}`;
    }
  } else if (vsGameDiff.diff > -0.005) {
    const formatted = formatDualEvalDiff(vsGameDiff);
    vsGameGrade = 'near';
    vsGameDisplay = formatted;
  } else {
    const formatted = formatDualEvalDiff(vsGameDiff);
    if (formatted === '0.0' || formatted === '0%') {
      vsGameGrade = 'near';
      vsGameDisplay = formatted;
    } else {
      vsGameGrade = 'bad';
      vsGameDisplay = formatted;
    }
  }

  return h('div.retro-eval-boxes', [
    renderEvalBox(vsBestGrade, 'vs Engine Best', vsBestDisplay),
    renderEvalBox(vsGameGrade, 'vs Move Played', vsGameDisplay),
  ]);
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
        retro.revealGuidance();
        setRetroVisibleEngineEnabled(true);
        if (cand) {
          navigate(cand.parentPath);
          playUciMove(cand.bestMove);
        } else {
          redraw();
        }
      }},
    }, 'View the solution'),
    h('a', {
      on: { click: () => {
        retro.skip();
        resetRetroVisibleEngineUi();
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
      resetRetroVisibleEngineUi();
      const next = retro.current();
      if (next) navigate(next.parentPath);
      else redraw();
    }},
  }, [
    h('span.retro-continue__icon', '▶'),
    'Next',
  ]);
}

// "Chosen because..." note shown on terminal states (win / view).
// Reflects the detector that selected this candidate so the user understands
// which configured parameter caused this moment to be included.
// Only shown when a candidate is active; returns null otherwise.
function renderReasonNote(cand: RetroCandidate | null): VNode | null {
  if (!cand) return null;
  return h('div.retro-reason', [
    h('span.retro-reason__label', `Chosen because: ${cand.reason.label}`),
    h('span.retro-reason__summary', cand.reason.summary),
  ]);
}

// --- Save to Library ---

// Tracks which candidates have been saved during this page session to prevent duplicates.
// Keyed by candidate path (unique per game position).
const _savedPaths = new Set<string>();

// Tracks paths that are currently showing the "Saved!" confirmation, to revert after timeout.
const _savingConfirm = new Set<string>();

/**
 * Renders a "Save to Library" / "Saved!" button for the current retro candidate.
 * Shown on win, fail, and view feedback states so the user can persist the exercise.
 */
function renderSaveToLibrary(
  cand: RetroCandidate,
  retro: RetroCtrl,
  redraw: () => void,
): VNode {
  const alreadySaved = _savedPaths.has(cand.path);
  const showingConfirm = _savingConfirm.has(cand.path);

  if (alreadySaved && !showingConfirm) {
    return h('div.retro-save', h('span.retro-save__done', 'Saved'));
  }
  if (showingConfirm) {
    return h('div.retro-save', h('span.retro-save__confirm', 'Saved!'));
  }
  return h('div.retro-save', h('button.retro-save__btn', {
    on: { click: () => {
      const def = retroCandidateToDefinition(cand);
      const outcome = retro.getOutcome(cand.ply);
      savePuzzleDefinition(def).then(() => {
        _savedPaths.add(cand.path);
        _savingConfirm.add(cand.path);
        redraw();
        setTimeout(() => { _savingConfirm.delete(cand.path); redraw(); }, 2000);
        // Persist retro outcome as first-attempt record.
        if (outcome) {
          saveAttempt(retroOutcomeToAttempt(def.id, outcome)).catch(e =>
            console.warn('[retro-save] attempt save failed', e),
          );
        }
      });
    }},
  }, 'Save to Library'));
}

// --- Bulk Save to Library (session-end) ---

// Tracks bulk-save state: 'idle' | 'saving' | 'done'
let _bulkSaveState: 'idle' | 'saving' | 'done' = 'idle';
let _bulkSaveCount = 0;

/**
 * Renders a "Save N failed to Library" button at session end.
 * Bulk-saves all candidates the user got wrong, viewed, or skipped.
 * Reuses _savedPaths to skip individually-saved candidates.
 */
/**
 * Map a retro outcome to a first-attempt PuzzleAttempt record.
 * This preserves the retro session result when bulk-saving to the puzzle library.
 * The attempt records that the user already encountered this position in a retro session.
 */
function retroOutcomeToAttempt(puzzleId: string, outcome: RetroOutcome): PuzzleAttempt {
  const now = Date.now();
  let result: SolveResult;
  const failureReasons: FailureReason[] = [];
  let skipped = false;

  switch (outcome) {
    case 'win':
      result = 'clean-solve';
      break;
    case 'fail':
      result = 'failed';
      failureReasons.push('wrong-first-move');
      break;
    case 'view':
      result = 'failed';
      failureReasons.push('solution-revealed');
      break;
    case 'skip':
      result = 'skipped';
      failureReasons.push('skip-pressed');
      skipped = true;
      break;
  }

  return {
    puzzleId,
    startedAt: now,
    completedAt: now,
    result,
    failureReasons,
    usedHint: false,
    usedEngineReveal: false,
    revealedSolution: outcome === 'view',
    openedNotesDuringSolve: false,
    skipped,
  };
}

function renderBulkSaveToLibrary(
  retro: RetroCtrl,
  redraw: () => void,
): VNode | null {
  const failed = retro.getFailedCandidates();
  // Filter out candidates that were already individually saved during the session.
  const unsaved = failed.filter(c => !_savedPaths.has(c.path));

  if (_bulkSaveState === 'done') {
    return h('div.retro-bulk-save', h('span.retro-save__confirm',
      `Saved ${_bulkSaveCount} puzzle${_bulkSaveCount === 1 ? '' : 's'}!`,
    ));
  }

  if (unsaved.length === 0) {
    // Nothing to save — either no failures or all already saved individually.
    if (failed.length > 0) {
      return h('div.retro-bulk-save', h('span.retro-save__done', 'All missed positions saved'));
    }
    return null;
  }

  if (_bulkSaveState === 'saving') {
    return h('div.retro-bulk-save', h('span.retro-save__confirm', 'Saving\u2026'));
  }

  const count = unsaved.length;
  return h('div.retro-bulk-save', h('button.retro-save__btn', {
    on: { click: () => {
      _bulkSaveState = 'saving';
      redraw();
      const saves = unsaved.map(c => {
        const def = retroCandidateToDefinition(c);
        const outcome = retro.getOutcome(c.ply);
        return savePuzzleDefinition(def).then(() => {
          _savedPaths.add(c.path);
          // Persist the retro outcome as a first-attempt record so retry/due logic knows
          // this puzzle was already encountered and what happened.
          if (outcome) {
            return saveAttempt(retroOutcomeToAttempt(def.id, outcome)).catch(e =>
              console.warn('[retro-bulk-save] attempt save failed', e),
            );
          }
        });
      });
      Promise.all(saves).then(() => {
        _bulkSaveCount = count;
        _bulkSaveState = 'done';
        redraw();
        // Revert to quiet state after 3 seconds.
        setTimeout(() => {
          _bulkSaveState = 'idle';
          redraw();
        }, 3000);
      });
    }},
  }, `Save ${count} failed position${count === 1 ? '' : 's'} to Library`));
}

/**
 * Renders the active-session feedback box shown while retrospection is running.
 * Returns null when no retro session is active.
 * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroView.ts
 */
export function renderRetroStrip(deps: RetroStripDeps): VNode | null {
  const { retro, navigate, redraw, uciToSan, onClose, getEvalDepth } = deps;
  if (!retro) return null;

  const feedback        = retro.feedback();
  const cand            = retro.current();
  const [solved, total] = retro.completion();

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
          total > 0 ? renderBulkSaveToLibrary(retro, redraw) : null,
        ].filter(Boolean) as VNode[]),
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
      retro.isVindicated() ? h('div.retro-vindication', [
        h('div.retro-vindication__icon', '✓'),
        h('p.retro-vindication__msg',
          'Actually upon deeper review, you did play the best move during the game.'),
        renderContinue(retro, navigate, redraw),
      ]) : null,
    ].filter(Boolean) as VNode[];
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
          renderGameMoveEvalDiff(cand),
          renderDualEvalBoxes(retro),
          renderSkipOrView(retro, navigate, redraw),
          renderSaveToLibrary(cand, retro, redraw),
          h('a', { on: { click: () => {
            retro.resetForRetry();
            resetRetroVisibleEngineUi();
            if (cand) navigate(cand.parentPath);
            syncArrow();
            redraw();
          }}}, 'Try another move'),
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
          h('div.retro-instruction', [
            h('strong', msg),
            renderGameMoveEvalDiff(cand),
            renderDualEvalBoxes(retro),
            renderReasonNote(cand),
            renderSaveToLibrary(cand, retro, redraw),
            h('a', { on: { click: () => {
              retro.resetForRetry();
              resetRetroVisibleEngineUi();
              if (cand) navigate(cand.parentPath);
              syncArrow();
              redraw();
            }}}, 'Try another move'),
          ]),
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
            renderGameMoveEvalDiff(cand),
            renderDualEvalBoxes(retro),
            renderReasonNote(cand),
            renderSaveToLibrary(cand, retro, redraw),
            h('a', { on: { click: () => {
              retro.resetForRetry();
              resetRetroVisibleEngineUi();
              if (cand) navigate(cand.parentPath);
              syncArrow();
              redraw();
            }}}, 'Try another move'),
          ]),
        ]),
      ),
      renderContinue(retro, navigate, redraw),
    ];
  }

  return h('div.retro-box.training-box', [
    // Title bar — mirrors lichess-org/lila: retroView.ts div.title
    h('div.retro-box__title', [
      h('span', 'Learn from your mistakes'),
      h('span.retro-box__progress', progressText),
      h('button.retro-box__close', { on: { click: onClose }, attrs: { title: 'Close' } }, '✕'),
    ]),
    // Feedback area — mirrors lichess-org/lila: retroView.ts div.feedback.{state}
    h('div.retro-feedback.' + feedback, feedbackContent),
  ]);
}
