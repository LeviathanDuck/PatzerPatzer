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
import { retroCandidateDefinitionId, retroCandidateToDefinition } from '../puzzles/adapters';
import { savePuzzleDefinition, saveAttempt, summarizeBulkSaveResults } from '../puzzles/puzzleDb';
import type { PuzzleAttempt, FailureReason, SolveResult } from '../puzzles/types';
import SaveFlowCtrl, { type SaveFlowContext, type SaveFlowResult } from '../save/saveFlowCtrl';
import renderSaveFlowModal from '../save/saveFlowView';
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
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';

function activateOnKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

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
 *
 * LFYM brand (approved redesign 2026-07-05, "Underboard set" -> "Mistakes / LFYM brand"): the
 * solid amber "?!" badge replaces the borrowed Lichess bullseye. Idle = ghost amber chip; active
 * (retro session or choice page open) = solid amber chip with an inverted badge.
 */
export function renderRetroEntry(deps: RetroEntryDeps): VNode {
  const { retro, choiceOpen, analysisComplete, batchAnalyzing, onToggle } = deps;
  const active = !!retro || choiceOpen;
  const content = [
    h('span.lfym-badge', { class: { 'lfym-badge--inverted': active } }, '?!'),
    active ? ' Close Mistakes' : ' Mistakes',
  ];
  const disabledReason = batchAnalyzing
    ? 'Wait for the current batch analysis to finish.'
    : 'Analyze the game before reviewing its mistakes.';
  if (!analysisComplete || batchAnalyzing) return renderDisabledControlExplainer({
    label: active ? 'Close Mistakes' : 'Mistakes',
    description: disabledReason,
  }, h('button.btn-mistakes', {
    class: { 'btn-mistakes--active': active },
    attrs: {
      disabled: true,
      ...controlExplainerAttrs({
        label: active ? 'Close Mistakes' : 'Mistakes',
        description: retro
          ? 'Close the active Learn From Your Mistakes session.'
          : choiceOpen
            ? 'Close the mistake-selection choices.'
          : disabledReason,
      }),
    },
    on: { click: onToggle },
  }, content));
  return h('button.btn-mistakes', {
    class: { 'btn-mistakes--active': active },
    attrs: controlExplainerAttrs({
      label: active ? 'Close Mistakes' : 'Mistakes',
      description: retro
        ? 'Close the active Learn From Your Mistakes session.'
        : choiceOpen
          ? 'Close the mistake-selection choices.'
          : 'Review the learning moments found in this game.',
    }),
    on: { click: onToggle },
  }, content);
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
      h('button.retro-box__close', {
        on: { click: onClose },
        attrs: iconControlExplainerAttrs({ label: 'Close mistake choices' }),
      }, '✕'),
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
              attrs: { type: 'checkbox', ...controlExplainerAttrs({
                label: category.label,
                description: `${checked ? 'Exclude' : 'Include'} ${category.description.toLowerCase()}.`,
              }) },
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
              ...controlExplainerAttrs({
                label: preset.label,
                description: preset.helper,
              }),
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
      selectedCount > 0 ? h('button.retro-choice__begin', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: beginLabel,
          description: selectedCount === 0
            ? 'Choose at least one matching mistake category and severity.'
            : 'Start a Learn From Your Mistakes session with the selected moments.',
        }) },
        on: { click: () => { if (filterRetroCandidatesForChoice(choice.candidates, choice.selection).length > 0) onBegin(); } },
      }, beginLabel) : renderDisabledControlExplainer({
        label: beginLabel,
        description: 'Choose at least one matching mistake category and severity.',
      }, h('button.retro-choice__begin', {
        attrs: { type: 'button', disabled: true, ...controlExplainerAttrs({
          label: beginLabel,
          description: 'Choose at least one matching mistake category and severity.',
        }) },
        on: { click: onBegin },
      }, beginLabel)),
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
  /**
   * Opponent's name for the current game, when known. Used to build the
   * save-flow modal's source context line (e.g. "vs NajdorfNick77").
   * Undefined when no game is loaded or the user's color/opponent is unknown.
   */
  opponentName?:     string;
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
  // so that async evalPositionSilent() results populate the vs-Engine-Best box.
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
  const viewSolution = () => {
    retro.viewSolution();
    retro.revealGuidance();
    setRetroVisibleEngineEnabled(true);
    if (cand) {
      navigate(cand.parentPath);
      playUciMove(cand.bestMove);
    } else {
      redraw();
    }
  };
  const skip = () => {
    retro.skip();
    resetRetroVisibleEngineUi();
    const next = retro.current();
    if (next) navigate(next.parentPath);
    else redraw();
  };
  return h('div.retro-choices', [
    h('a', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
        label: LFYM_MESSAGES[retroConfig.feedbackTone].viewTheSolution,
        description: 'Reveal and play the engine’s best move for this learning moment.',
      }) },
      on: {
        click: viewSolution,
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, viewSolution),
      },
    }, LFYM_MESSAGES[retroConfig.feedbackTone].viewTheSolution),
    h('a', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
        label: LFYM_MESSAGES[retroConfig.feedbackTone].skipThisMove,
        description: 'Skip this learning moment and continue to the next one.',
      }) },
      on: {
        click: skip,
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, skip),
      },
    }, LFYM_MESSAGES[retroConfig.feedbackTone].skipThisMove),
  ]);
}

// Blue "▶ Next" continue half-button.
// Mirrors lichess-org/lila: retroView.ts jumpToNext VNode (a.half.continue)
function renderContinue(retro: RetroCtrl, navigate: (path: string) => void, redraw: () => void): VNode {
  const next = () => {
    retro.jumpToNext();
    resetRetroVisibleEngineUi();
    const candidate = retro.current();
    if (candidate) navigate(candidate.parentPath);
    else redraw();
  };
  return h('a.retro-continue', {
    attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
      label: 'Next mistake',
      description: 'Continue to the next Learn From Your Mistakes moment.',
    }) },
    on: {
      click: next,
      keydown: (event: KeyboardEvent) => activateOnKeyboard(event, next),
    },
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
// TreePath repeats across games, so this uses the adapter's canonical persisted identity.
const _savedDefinitionIds = new Set<string>();

// Tracks canonical definition ids currently showing "Saved!", to revert after timeout.
const _savingConfirmDefinitionIds = new Set<string>();








let _activeSaveFlow: SaveFlowCtrl | null = null;

// Move-number prefix for a ply, e.g. "24." (white) or "24..." (black).
function movePrefixLabel(ply: number): string {
  const moveNumber = Math.max(1, Math.ceil(ply / 2));
  return ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
}

/**
 * Builds the save-flow modal's context lines for an LFYM candidate.
 * `variant` distinguishes the two LFYM save entry points that both render through
 * renderSaveToLibrary: 'save' is the in-session per-candidate save (P2-LFYM-1, shown on
 * fail/view), 'force-save' is saving an already-solved puzzle on demand (P2-LFYM-3,
 * shown on win).
 */
function lfymSaveContext(
  cand: RetroCandidate,
  variant: 'save' | 'force-save',
  opponentName: string | undefined,
): SaveFlowContext {
  const movePart = `${movePrefixLabel(cand.ply)} ${cand.playedMoveSan}`;
  const line = opponentName
    ? `From Learn From Your Mistakes — vs ${opponentName} · ${movePart}`
    : `From Learn From Your Mistakes — ${movePart}`;
  const source = variant === 'force-save'
    ? 'In-session force-save (P2-LFYM-3)'
    : 'In-session save (P2-LFYM-1)';
  return { line, source };
}

/**
 * Persists a resolved save-flow result onto a fresh puzzle definition built from the
 * retro candidate. Same underlying persistence as before T2 (puzzle-v1 `definitions`
 * store via savePuzzleDefinition, plus a first-attempt record via saveAttempt when a
 * retro outcome is available) — now carrying the categorize-on-save fields
 * (P2-SAVE-1..4) and LFYM provenance.
 */
function persistLfymSaveFlowResult(
  cand: RetroCandidate,
  outcome: RetroOutcome | undefined,
  result: SaveFlowResult,
  redraw: () => void,
): void {
  const def = retroCandidateToDefinition(cand);
  if (result.mode === 'quick') {
    def.uncategorized = true;
  } else if (result.primaryCategory !== undefined) {
    def.primaryCategory = result.primaryCategory;
  }
  if (result.tags.length > 0) def.tags = result.tags;
  if (result.notes !== undefined) def.saveNotes = result.notes;
  def.savedFrom = {
    gameId: cand.gameId,
    ply: Math.max(0, cand.ply - 1),
    fen: cand.fenBefore,
    source: 'lfym',
  };
  // Success UI ("Saved!") only after an actual write — a rejected save must not
  // flash a false confirmation (Decision 7 / BUG-030).
  savePuzzleDefinition(def).then(result => {
    if (!result.ok) {
      console.warn('[retro-save] definition save rejected', cand.path, result.reason);
      redraw();
      return;
    }
    const definitionId = retroCandidateDefinitionId(cand);
    _savedDefinitionIds.add(definitionId);
    _savingConfirmDefinitionIds.add(definitionId);
    redraw();
    setTimeout(() => { _savingConfirmDefinitionIds.delete(definitionId); redraw(); }, 2000);
    // Persist retro outcome as first-attempt record.
    if (outcome) {
      saveAttempt(retroOutcomeToAttempt(def.id, outcome)).catch(e =>
        console.warn('[retro-save] attempt save failed', e),
      );
    }
  });
}

// Opens the universal save-flow modal for the current candidate (P2-SAVE-1). The
// candidate's retro outcome is captured now (not re-read on resolve) so a later state
// change cannot shift which outcome gets attached to the saved record.
function openLfymSaveFlow(
  cand: RetroCandidate,
  retro: RetroCtrl,
  variant: 'save' | 'force-save',
  opponentName: string | undefined,
  redraw: () => void,
): void {
  const outcome = retro.getOutcome(cand.ply);
  _activeSaveFlow = new SaveFlowCtrl({
    itemType: 'puzzle',
    context: lfymSaveContext(cand, variant, opponentName),
    onResolve: result => {
      _activeSaveFlow = null;
      persistLfymSaveFlowResult(cand, outcome, result, redraw);
    },
    onCancel: () => {
      _activeSaveFlow = null;
      redraw();
    },
  }, redraw);
  redraw();
}

/**
 * Renders a "Save to Library" / "Saved!" button for the current retro candidate.
 * Shown on win, fail, and view feedback states so the user can persist the exercise.
 * Clicking opens the universal save-flow modal (P2-SAVE-1) instead of saving directly;
 * `variant` labels which LFYM ledger entry point this call site is (P2-LFYM-1 in-session
 * save on fail/view, P2-LFYM-3 force-save on win) in the modal's context line.
 */
function renderSaveToLibrary(
  cand: RetroCandidate,
  retro: RetroCtrl,
  variant: 'save' | 'force-save',
  opponentName: string | undefined,
  redraw: () => void,
): VNode {
  const definitionId = retroCandidateDefinitionId(cand);
  const alreadySaved = _savedDefinitionIds.has(definitionId);
  const showingConfirm = _savingConfirmDefinitionIds.has(definitionId);

  if (alreadySaved && !showingConfirm) {
    return h('div.retro-save', h('span.retro-save__done', 'Saved'));
  }
  if (showingConfirm) {
    return h('div.retro-save', h('span.retro-save__confirm', 'Saved!'));
  }
  return h('div.retro-save', h('button.retro-save__btn', {
    attrs: controlExplainerAttrs({
      label: LFYM_MESSAGES[retroConfig.feedbackTone].saveToLibrary,
      description: 'Open the save flow for this learning moment.',
    }),
    on: { click: () => openLfymSaveFlow(cand, retro, variant, opponentName, redraw) },
  }, LFYM_MESSAGES[retroConfig.feedbackTone].saveToLibrary));
}

// --- Bulk Save to Library (session-end) ---

// Tracks bulk-save state: 'idle' | 'saving' | 'done'
let _bulkSaveState: 'idle' | 'saving' | 'done' = 'idle';
// Real-write accounting for the completed bulk save (never derived from Promise.all
// completion alone): _bulkSaveCount = writes that actually landed (ok:true),
// _bulkSaveFailed = rejected saves. Drives the honest done-state UI below.
let _bulkSaveCount = 0;
let _bulkSaveFailed = 0;
// Bulk lifecycle belongs to one RetroCtrl session and its canonical candidate identities.
// The controller boundary resets same-game restarts/rebuilds; the canonical identity boundary
// prevents equal TreePaths in different games from sharing Saving/Saved UI. The generation also
// stale-drops completion/timer callbacks from a superseded session.
let _bulkSaveOwner: RetroCtrl | null = null;
let _bulkSaveOwnerIdentity = '';
let _bulkSaveGeneration = 0;

function bulkSaveOwnerIdentity(retro: RetroCtrl): string {
  // `candidates` is canonical on production RetroCtrl. Fall back to the same canonical failed
  // set for older structural test/controllers that predate the readonly field.
  const candidates = retro.candidates ?? retro.getFailedCandidates();
  return JSON.stringify(candidates.map(retroCandidateDefinitionId));
}

function bindBulkSaveLifecycle(retro: RetroCtrl): number {
  const ownerIdentity = bulkSaveOwnerIdentity(retro);
  if (_bulkSaveOwner !== retro || _bulkSaveOwnerIdentity !== ownerIdentity) {
    _bulkSaveOwner = retro;
    _bulkSaveOwnerIdentity = ownerIdentity;
    _bulkSaveState = 'idle';
    _bulkSaveCount = 0;
    _bulkSaveFailed = 0;
    _bulkSaveGeneration += 1;
  }
  return _bulkSaveGeneration;
}

function ownsBulkSaveLifecycle(retro: RetroCtrl, generation: number): boolean {
  return _bulkSaveOwner === retro
    && _bulkSaveOwnerIdentity === bulkSaveOwnerIdentity(retro)
    && _bulkSaveGeneration === generation;
}

/**
 * Renders a "Save N failed to Library" button at session end.
 * Bulk-saves all candidates the user got wrong, viewed, or skipped.
 * Reuses canonical definition ids to skip individually-saved candidates.
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
  // Bind before inspecting module-level state so a newly-active session can never render the
  // previous session's Saving/Saved result or have its own canonical unsaved set suppressed.
  const bulkSaveGeneration = bindBulkSaveLifecycle(retro);
  const failed = retro.getFailedCandidates();
  // Filter out candidates that were already individually saved during the session.
  const unsaved = failed.filter(c => !_savedDefinitionIds.has(retroCandidateDefinitionId(c)));

  if (_bulkSaveState === 'done') {

    if (_bulkSaveCount === 0) {
      // Every write was rejected — explicit FAILURE, never a false "Saved 0 puzzles!".
      // State reverts to idle after the timeout, re-offering the button for retry.
      return h('div.retro-bulk-save', h('span.retro-save__error',
        `Could not save ${_bulkSaveFailed} position${_bulkSaveFailed === 1 ? '' : 's'} — try again`,
      ));
    }
    if (_bulkSaveFailed > 0) {
      // Partial success — report the real written count AND surface that some failed.
      return h('div.retro-bulk-save', h('span.retro-save__confirm',
        `Saved ${_bulkSaveCount} — ${_bulkSaveFailed} failed`,
      ));
    }
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
    attrs: controlExplainerAttrs({
      label: `Save ${count} missed position${count === 1 ? '' : 's'}`,
      description: 'Save all unsaved missed positions from this session to the puzzle library.',
    }),
    on: { click: () => {
      _bulkSaveState = 'saving';
      redraw();




      const saves = unsaved.map(c => {
        const def = retroCandidateToDefinition(c);
        const outcome = retro.getOutcome(c.ply);
        return savePuzzleDefinition(def).then(async result => {
          if (!result.ok) {
            console.warn('[retro-bulk-save] definition save rejected', c.path, result.reason);
            return result;
          }
          _savedDefinitionIds.add(retroCandidateDefinitionId(c));
          // Persist the retro outcome as a first-attempt record so retry/due logic knows
          // this puzzle was already encountered and what happened.
          if (outcome) {
            await saveAttempt(retroOutcomeToAttempt(def.id, outcome)).catch(e =>
              console.warn('[retro-bulk-save] attempt save failed', e),
            );
          }
          return result;
        });
      });
      Promise.all(saves).then(results => {
        if (!ownsBulkSaveLifecycle(retro, bulkSaveGeneration)) return;
        const summary = summarizeBulkSaveResults(results);
        _bulkSaveCount = summary.saved;
        _bulkSaveFailed = summary.failed;
        _bulkSaveState = 'done';
        redraw();
        // Revert to quiet state after 3 seconds (re-offers the button for any failures).
        setTimeout(() => {
          if (!ownsBulkSaveLifecycle(retro, bulkSaveGeneration)) return;
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
  const { retro, navigate, redraw, uciToSan, onClose, getEvalDepth, opponentName } = deps;
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
    const restart = () => {
      retro.reset();
      const first = retro.current();
      if (first) navigate(first.parentPath);
      else redraw();
    };
    feedbackContent = [
      h('div.retro-player', [
        h('div.retro-king', '♚'),
        h('div.retro-instruction', [
          h('em', { style: { color: countFeedback.color } }, mistakeCountSessionEnd(countFeedback, tone)),
          h('div.retro-choices', [
            total > 0 && h('a', {
              attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
                label: msg.doItAgain,
                description: 'Restart this Learn From Your Mistakes session from the first moment.',
              }) },
              on: {
                click: restart,
                keydown: (event: KeyboardEvent) => activateOnKeyboard(event, restart),
              },
            }, msg.doItAgain),
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
    const resume = () => {
      const current = retro.current();
      if (current) navigate(current.parentPath);
      else redraw();
    };
    feedbackContent = [
      h('div.retro-player', [
        h('div.retro-icon.retro-icon--off', '!'),
        h('div.retro-instruction', [
          h('strong', msg.offTrackMessage),
          h('div.retro-choices.retro-choices--off', [
            h('a', {
              attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
                label: msg.offTrackResume,
                description: 'Return to the active learning moment and resume the session.',
              }) },
              on: {
                click: resume,
                keydown: (event: KeyboardEvent) => activateOnKeyboard(event, resume),
              },
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
          renderSaveToLibrary(cand, retro, 'save', opponentName, redraw),
          h('div.retro-save', h('button.retro-save__btn', { on: { click: () => {
            retro.resetForRetry();
            resetRetroVisibleEngineUi();
            if (cand) navigate(cand.parentPath);
            syncArrow();
            redraw();
          }}, attrs: controlExplainerAttrs({
            label: msg.tryAnotherMove,
            description: 'Reset this learning moment and try a different move.',
          }) }, msg.tryAnotherMove)),
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





    const solvingMoveDeliveredMate = !!retro.getSolvingMoveSnapshot()?.solvingMoveDeliveredMate;
    const winMsg = wk === 'near-best' ? msg.winNearBest : msg.winExact;
    const winLabel = solvingMoveDeliveredMate ? `Checkmate! ${winMsg}` : winMsg;
    feedbackContent = [
      h('div.retro-half.retro-half--top',
        h('div.retro-player', [
          h('div.retro-icon.retro-icon--win', solvingMoveDeliveredMate ? '♚' : '✓'),
          h('div.retro-instruction', [
            h('strong', winLabel),
            renderDualEvalBoxes(retro),
            renderReasonNote(cand, wk === 'exact', candBestSan),
            renderSaveToLibrary(cand, retro, 'force-save', opponentName, redraw),
            h('div.retro-save', h('button.retro-save__btn', { on: { click: () => {
              retro.resetForRetry();
              resetRetroVisibleEngineUi();
              if (cand) navigate(cand.parentPath);
              syncArrow();
              redraw();
            }}, attrs: controlExplainerAttrs({
              label: msg.tryAnotherMove,
              description: 'Reset this learning moment and try a different move.',
            }) }, msg.tryAnotherMove)),
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
            renderSaveToLibrary(cand, retro, 'save', opponentName, redraw),
            h('div.retro-save', h('button.retro-save__btn', { on: { click: () => {
              retro.resetForRetry();
              resetRetroVisibleEngineUi();
              if (cand) navigate(cand.parentPath);
              syncArrow();
              redraw();
            }}, attrs: controlExplainerAttrs({
              label: msg.tryAnotherMove,
              description: 'Reset this learning moment and try a different move.',
            }) }, msg.tryAnotherMove)),
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
        h('button.retro-box__close', {
          on: { click: onClose },
          attrs: iconControlExplainerAttrs({
            label: 'Close Learn From Your Mistakes',
            description: 'End the current mistake-review session.',
          }),
        }, '✕'),
      ].filter(Boolean) as VNode[]),
    ]),
    // Feedback area — mirrors lichess-org/lila: retroView.ts div.feedback.{state}
    h('div.retro-feedback.' + feedback, feedbackContent),
  ]);
}









export function resetLfymSaveFlow(): void {
  _activeSaveFlow = null;
}

/**
 * Renders the active universal save-flow modal for an LFYM save (P2-SAVE-1), or null
 * when no save is in progress. Mount this at the app shell root alongside other
 * always-rendered overlay slots — same idiom as
 * src/diagnostics/reviewError/submitModal.ts's renderReviewErrorPackageSubmitModal.
 */
export function renderActiveLfymSaveFlowModal(): VNode | null {
  return _activeSaveFlow ? renderSaveFlowModal(_activeSaveFlow) : null;
}
