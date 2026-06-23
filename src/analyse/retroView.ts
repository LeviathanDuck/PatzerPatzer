// Retrospection feedback box and entry button rendering.
// Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroView.ts
//
// This module owns only rendering — no session state, no lifecycle, no navigation.
// All mutable deps (retro session, navigate, redraw, uciToSan) are passed explicitly
// so this module has no imports from main.ts or module-level side effects.

import { h, type VNode } from 'snabbdom';
import type { RetroCtrl, SolvingMoveSnapshot } from './retroCtrl';
import type { RetroCandidate } from './retro';
import {
  RETRO_CHOICE_CATEGORIES,
  RETRO_CHOICE_SEVERITY_PRESETS,
  filterRetroCandidatesForChoice,
  formatRetroChoiceLossPercent,
  summarizeRetroChoiceCounts,
  type RetroChoiceCategoryId,
  type RetroChoiceSelection,
  type RetroChoiceState,
  type RetroChoiceSeverityPresetId,
} from './retroChoice';
import { playUciMove } from '../board/index';
import { setRetroVisibleEngineEnabled, resetRetroVisibleEngineUi } from '../ceval/view';
import { syncArrow, evalCache } from '../engine/ctrl';
import { evalWinChances } from '../engine/winchances';
import { retroCandidateToDefinition } from '../puzzles/adapters';
import { savePuzzleDefinition, saveAttempt } from '../puzzles/puzzleDb';
import type { PuzzleAttempt, FailureReason, SolveResult } from '../puzzles/types';
import type { RetroOutcome } from './retroCtrl';
import {
  getSeverityFeedback,
  classifyEvalBoxGrade,
  getEvalBoxGradeMeta,
  classifyMistakeCount,
  mistakeCountSessionIntro,
  mistakeCountSessionEnd,
  buildDetailLine,
  LFYM_MESSAGES,
} from '../feedback/severity';
import type { FeedbackTone } from '../feedback/severity';
import { retroConfig } from './retroConfig';

// --- Entry button ---

export interface RetroEntryDeps {
  /** Active retro session, or undefined when not in retro mode. */
  retro:            RetroCtrl | undefined;
  /** True when the LFYM pre-session choice page is open. */
  choiceOpen:       boolean;
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
  const { retro, choiceOpen, analysisComplete, batchAnalyzing, onToggle } = deps;
  const active = !!retro || choiceOpen;
  return h('button', {
    class: { active },
    attrs: {
      disabled: !analysisComplete || batchAnalyzing,
      title: retro
        ? 'Close mistake review'
        : choiceOpen
          ? 'Close mistake choices'
        : analysisComplete
          ? 'Review your mistakes from this game'
          : 'Complete game review first',
    },
    on: { click: onToggle },
  }, active ? 'Close' : 'Mistakes');
}

// --- Choice page ---

export interface RetroChoicePageDeps {
  choice:            RetroChoiceState | undefined;
  onSelectionChange: (selection: RetroChoiceSelection) => void;
  onBegin:           () => void;
  onClose:           () => void;
}

function toggleChoiceCategory(
  selection: RetroChoiceSelection,
  categoryId: RetroChoiceCategoryId,
): RetroChoiceSelection {
  const selected = new Set(selection.categoryIds);
  if (selected.has(categoryId)) selected.delete(categoryId);
  else selected.add(categoryId);
  return {
    ...selection,
    categoryIds: RETRO_CHOICE_CATEGORIES
      .map(c => c.id)
      .filter(id => selected.has(id)),
  };
}

function setChoiceSeverity(
  selection: RetroChoiceSelection,
  severityPresetId: RetroChoiceSeverityPresetId,
): RetroChoiceSelection {
  return { ...selection, severityPresetId };
}

export function renderRetroChoicePage(deps: RetroChoicePageDeps): VNode | null {
  const { choice, onSelectionChange, onBegin, onClose } = deps;
  if (!choice) return null;

  const summary = summarizeRetroChoiceCounts(choice.candidates, choice.selection);
  const selectedCount = summary.total;
  const selectedCategories = new Set(choice.selection.categoryIds);
  const selectedPreset = choice.selection.severityPresetId;
  const beginLabel = `Begin ${selectedCount} moment${selectedCount === 1 ? '' : 's'}`;

  return h('div.retro-box.training-box.retro-choice', [
    h('div.retro-box__title', [
      h('span', 'Learn From Your Mistakes'),
      h('span.retro-box__progress', `${choice.candidates.length} found`),
      h('button.retro-box__close', { on: { click: onClose }, attrs: { title: 'Close', 'aria-label': 'Close' } }, '✕'),
    ]),
    h('div.retro-choice__body', [
      h('div.retro-choice__section', [
        h('div.retro-choice__section-title', 'Mistake categories'),
        h('div.retro-choice__rows', RETRO_CHOICE_CATEGORIES.map(category => {
          const rowCount = summary.categories.find(c => c.id === category.id)?.count ?? 0;
          const checked = selectedCategories.has(category.id);
          return h('label.retro-choice__row', {
            class: { 'is-selected': checked },
          }, [
            h('input', {
              attrs: { type: 'checkbox' },
              props: { checked },
              on: { change: () => onSelectionChange(toggleChoiceCategory(choice.selection, category.id)) },
            }),
            h('span.retro-choice__row-main', [
              h('span.retro-choice__row-label', category.label),
              h('span.retro-choice__row-desc', category.description),
            ]),
            h('span.retro-choice__count', String(rowCount)),
          ]);
        })),
      ]),
      h('div.retro-choice__section', [
        h('div.retro-choice__section-title', 'Severity'),
        h('div.retro-choice__severity', {
          attrs: {
            role: 'radiogroup',
            'aria-label': 'Mistake severity',
          },
        }, RETRO_CHOICE_SEVERITY_PRESETS.map(preset => {
          const presetCount = summary.presets.find(p => p.id === preset.id)?.count ?? 0;
          const active = selectedPreset === preset.id;
          return h('button.retro-choice__severity-option', {
            class: { 'is-active': active },
            attrs: {
              type: 'button',
              role: 'radio',
              'aria-checked': active ? 'true' : 'false',
            },
            on: { click: () => onSelectionChange(setChoiceSeverity(choice.selection, preset.id)) },
          }, [
            h('span.retro-choice__severity-label', preset.label),
            h('span.retro-choice__severity-helper', preset.helper),
            h('span.retro-choice__severity-count', String(presetCount)),
          ]);
        })),
      ]),
      selectedCount === 0
        ? h('div.retro-choice__empty', 'No moments match these choices.')
        : null,
      h('button.retro-choice__begin', {
        attrs: { type: 'button', disabled: selectedCount === 0 },
        on: { click: () => { if (filterRetroCandidatesForChoice(choice.candidates, choice.selection).length > 0) onBegin(); } },
      }, beginLabel),
    ].filter(Boolean) as VNode[]),
  ]);
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

const RETRO_SEVERITY_BADGE_LABELS: Readonly<Record<RetroCandidate['classification'], string>> = {
  inaccuracy: 'Inaccuracy',
  mistake:    'Mistake',
  blunder:    'Blunder',
};

const RETRO_SEVERITY_BADGE_COLORS: Readonly<Record<RetroCandidate['classification'], string>> = {
  inaccuracy: '#56b4e9',
  mistake:    '#e69d00',
  blunder:    '#db3031',
};

function renderRetroSeverityBadge(cand: RetroCandidate): VNode {
  const label = RETRO_SEVERITY_BADGE_LABELS[cand.classification];
  const lossPercent = formatRetroChoiceLossPercent(cand.loss);
  const color = RETRO_SEVERITY_BADGE_COLORS[cand.classification];
  const isLossMeaningful = cand.loss > 0;
  const text = cand.isMissedMate && !isLossMeaningful
    ? `Missed mate - ${label}`
    : `${label} - Lost ${lossPercent}`;
  const ariaLabel = cand.isMissedMate && !isLossMeaningful
    ? `Missed forced mate, ${label.toLowerCase()}`
    : `${label}, lost ${lossPercent} win chance`;

  return h('span.retro-box__severity', {
    class: { [`retro-box__severity--${cand.classification}`]: true },
    attrs: {
      title:      text,
      'aria-label': ariaLabel,
      style:      `color: ${color}; border-color: ${color}; background-color: ${color}1a;`,
    },
  }, text);
}




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

function renderEvalBox(color: string, label: string, display: string): VNode {
  return h('div.retro-eval-box', {
    style: {
      borderColor: color + '66',    // ~40% opacity
      background:  color + '1a',    // ~10% opacity
    },
  }, [
    h('span.retro-eval-box__label', label),
    h('span.retro-eval-box__value', { style: { color } }, display),
  ]);
}

function renderDualEvalBoxes(retro: RetroCtrl): VNode | null {
  const snapshot = retro.getSolvingMoveSnapshot();
  if (!snapshot) return null;

  // Prefer frozen snapshot values; fall back to live evalCache on each render
  // so that async evalFenSilent() results populate the vs-Engine-Best box.
  const liveSolving    = snapshot.solvingPath ? evalCache.get(snapshot.solvingPath)    : undefined;
  const liveEngBest    = snapshot.parentPath  ? evalCache.get(snapshot.parentPath)     : undefined;
  const solvingEval = {
    ...(snapshot.solvingMoveCp   !== undefined ? { cp:   snapshot.solvingMoveCp }   : liveSolving?.cp   !== undefined ? { cp:   liveSolving.cp }   : {}),
    ...(snapshot.solvingMoveMate !== undefined ? { mate: snapshot.solvingMoveMate } : liveSolving?.mate !== undefined ? { mate: liveSolving.mate } : {}),
  };
  const engineBestEval = {
    ...(snapshot.engineBestCp   !== undefined ? { cp:   snapshot.engineBestCp }   : liveEngBest?.cp   !== undefined ? { cp:   liveEngBest.cp }   : {}),
    ...(snapshot.engineBestMate !== undefined ? { mate: snapshot.engineBestMate } : liveEngBest?.mate !== undefined ? { mate: liveEngBest.mate } : {}),
  };
  const gameMoveEval = {
    ...(snapshot.gameMoveCp   !== undefined && { cp:   snapshot.gameMoveCp }),
    ...(snapshot.gameMoveMate !== undefined && { mate: snapshot.gameMoveMate }),
  };

  const vsBestDiff = computeDualEvalComparison(solvingEval, engineBestEval, snapshot.playerColor);
  const vsGameDiff = computeDualEvalComparison(solvingEval, gameMoveEval, snapshot.playerColor);

  // --- vs Engine Best box ---
  // Compute win-chance loss between solving move and engine best.
  const solvingWc = evalWinChances(solvingEval);
  const engineBestWc = evalWinChances(engineBestEval);
  const gameMoveWc = evalWinChances(gameMoveEval);

  let vsBestColor: string;
  let vsBestDisplay: string;
  if (snapshot.isExactBest) {
    const isMate = snapshot.engineBestMate !== undefined;
    const grade = classifyEvalBoxGrade(0, true, isMate);
    const meta = getEvalBoxGradeMeta(grade);
    vsBestColor = meta.color;
    vsBestDisplay = isMate ? '#KO!' : '✓';
  } else if (vsBestDiff === null || solvingWc === undefined || engineBestWc === undefined) {
    vsBestColor = getEvalBoxGradeMeta('wrong').color;
    vsBestDisplay = '—';
  } else {
    const moverSolving = snapshot.playerColor === 'white' ? solvingWc : -solvingWc;
    const moverBest    = snapshot.playerColor === 'white' ? engineBestWc : -engineBestWc;
    const loss = Math.max(0, (moverBest - moverSolving) / 2);
    const grade = classifyEvalBoxGrade(loss, false, false);
    const meta = getEvalBoxGradeMeta(grade);
    vsBestColor = meta.color;
    vsBestDisplay = formatDualEvalDiff(vsBestDiff);
  }

  // --- vs Move Played (game move) box ---
  let vsGameColor: string;
  let vsGameDisplay: string;
  if (vsGameDiff === null || solvingWc === undefined || gameMoveWc === undefined) {
    vsGameColor = getEvalBoxGradeMeta('wrong').color;
    vsGameDisplay = '—';
  } else {
    const moverSolving = snapshot.playerColor === 'white' ? solvingWc : -solvingWc;
    const moverGame    = snapshot.playerColor === 'white' ? gameMoveWc : -gameMoveWc;
    // Positive means solving is better than game move; clamp loss to 0 in that case.
    const loss = Math.max(0, (moverGame - moverSolving) / 2);
    const grade = classifyEvalBoxGrade(loss, false, false);
    const meta = getEvalBoxGradeMeta(grade);
    vsGameColor = meta.color;
    const formatted = formatDualEvalDiff(vsGameDiff);
    vsGameDisplay = vsGameDiff.diff > 0.005 && formatted !== '0.0' && formatted !== '0%'
      ? `+${formatted}` : formatted;
  }

  return h('div.retro-eval-boxes', [
    renderEvalBox(vsBestColor, 'vs Engine Best', vsBestDisplay),
    renderEvalBox(vsGameColor, 'vs Move Played', vsGameDisplay),
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
    }, LFYM_MESSAGES[retroConfig.feedbackTone].viewTheSolution),
    h('a', {
      on: { click: () => {
        retro.skip();
        resetRetroVisibleEngineUi();
        const next = retro.current();
        if (next) navigate(next.parentPath);
        else redraw();
      }},
    }, LFYM_MESSAGES[retroConfig.feedbackTone].skipThisMove),
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
// Uses severity-modulated feedback so the language matches the severity of the mistake.
// Only shown when a candidate is active; returns null otherwise.
function renderReasonNote(
  cand: RetroCandidate | null,
  isExactBest: boolean = false,
  bestMoveSan: string = '',
): VNode | null {
  if (!cand) return null;
  const tone: FeedbackTone = retroConfig.feedbackTone;
  const fb = getSeverityFeedback(cand.reason.code, cand.loss, isExactBest, tone);
  const detailLine = buildDetailLine({
    reasonCode: cand.reason.code,
    tier: fb.tier.id,
    playedMoveSan: cand.playedMoveSan,
    bestMoveSan: bestMoveSan || cand.bestMove,
    evalDiffFormatted: cand.evalDiff?.formatted ?? null,
    mateDistance: cand.isMissedMate && cand.reason.code === 'missed-mate'
      ? null  // mate distance not stored on candidate — use null for generic text
      : null,
  }, tone);
  return h('div.retro-reason', [
    h('span.retro-reason__label', { style: { color: fb.tier.color } },
      `Chosen because: ${fb.label}`),
    h('span.retro-reason__detail', {
      style: { borderColor: fb.tier.color + '40', color: fb.tier.color },
    }, detailLine),
    h('span.retro-reason__summary', fb.summary),
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
  }, LFYM_MESSAGES[retroConfig.feedbackTone].saveToLibrary));
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
  const countFeedback   = classifyMistakeCount(total);
  const candBestSan     = cand ? uciToSan(cand.fenBefore, cand.bestMove) : '';
  const tone: FeedbackTone = retroConfig.feedbackTone;
  const msg             = LFYM_MESSAGES[tone];

  // Progress counter: "1 / 5" — mirrors Lichess title span
  // Show next-to-solve index (current + 1), capped at total.
  const progressText = `${Math.min(solved + 1, total)} / ${total}`;
  const severityBadge = cand ? renderRetroSeverityBadge(cand) : null;

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
          h('em', { style: { color: countFeedback.color } }, mistakeCountSessionEnd(countFeedback, tone)),
          h('div.retro-choices', [
            total > 0 && h('a', { on: { click: () => { retro.reset(); const f = retro.current(); if (f) navigate(f.parentPath); else redraw(); } } }, msg.doItAgain),
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
          h('strong', msg.findPlayed.replace('{move}', cand.playedMoveSan)),
          h('em', msg.findPrompt.replace('{color}', color)),
          solved === 0 && mistakeCountSessionIntro(countFeedback, tone)
            ? h('em.retro-session-intro', { style: { color: countFeedback.color, fontSize: '0.85em' } },
                mistakeCountSessionIntro(countFeedback, tone))
            : null,
          renderSkipOrView(retro, navigate, redraw),
        ]),
      ]),
      retro.isVindicated() ? h('div.retro-vindication', [
        h('div.retro-vindication__icon', '✓'),
        h('p.retro-vindication__msg', msg.vindicated),
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
          h('strong', msg.offTrackMessage),
          h('div.retro-choices.retro-choices--off', [
            h('a', {
              on: { click: () => {
                const c = retro.current();
                if (c) navigate(c.parentPath);
                else redraw();
              }},
            }, msg.offTrackResume),
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
      strongText = msg.failBetter;
    } else if (fk === 'worse') {
      strongText = msg.failWorse;
    } else {
      strongText = msg.failDefault;
    }
    feedbackContent = [
      h('div.retro-player', [
        h('div.retro-icon.retro-icon--fail', '✗'),
        h('div.retro-instruction', [
          h('strong', strongText),
          renderDualEvalBoxes(retro),
          renderSkipOrView(retro, navigate, redraw),
          renderSaveToLibrary(cand, retro, redraw),
          h('div.retro-save', h('button.retro-save__btn', { on: { click: () => {
            retro.resetForRetry();
            resetRetroVisibleEngineUi();
            if (cand) navigate(cand.parentPath);
            syncArrow();
            redraw();
          }}}, msg.tryAnotherMove)),
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
    const winMsg = wk === 'near-best' ? msg.winNearBest : msg.winExact;
    feedbackContent = [
      h('div.retro-half.retro-half--top',
        h('div.retro-player', [
          h('div.retro-icon.retro-icon--win', '✓'),
          h('div.retro-instruction', [
            h('strong', winMsg),
            renderDualEvalBoxes(retro),
            renderReasonNote(cand, wk === 'exact', candBestSan),
            renderSaveToLibrary(cand, retro, redraw),
            h('div.retro-save', h('button.retro-save__btn', { on: { click: () => {
              retro.resetForRetry();
              resetRetroVisibleEngineUi();
              if (cand) navigate(cand.parentPath);
              syncArrow();
              redraw();
            }}}, msg.tryAnotherMove)),
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
            h('strong', msg.viewSolution),
            h('em', [msg.viewBestWas + ' ', h('strong', bestSan)]),
            renderDualEvalBoxes(retro),
            renderReasonNote(cand, false, candBestSan),
            renderSaveToLibrary(cand, retro, redraw),
            h('div.retro-save', h('button.retro-save__btn', { on: { click: () => {
              retro.resetForRetry();
              resetRetroVisibleEngineUi();
              if (cand) navigate(cand.parentPath);
              syncArrow();
              redraw();
            }}}, msg.tryAnotherMove)),
          ]),
        ]),
      ),
      renderContinue(retro, navigate, redraw),
    ];
  }

  return h('div.retro-box.training-box', [
    // Title bar — mirrors lichess-org/lila: retroView.ts div.title
    h('div.retro-box__title', [
      h('span.retro-box__title-main', msg.sessionTitle),
      h('div.retro-box__title-meta', [
        severityBadge,
        h('span.retro-box__progress', { style: { color: countFeedback.color } }, progressText),
        h('button.retro-box__close', { on: { click: onClose }, attrs: { title: 'Close', 'aria-label': 'Close' } }, '✕'),
      ].filter(Boolean) as VNode[]),
    ]),
    // Feedback area — mirrors lichess-org/lila: retroView.ts div.feedback.{state}
    h('div.retro-feedback.' + feedback, feedbackContent),
  ]);
}
