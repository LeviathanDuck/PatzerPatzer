// Shared Learn From Your Mistakes choice-page model.
//
// This module is intentionally pure: it filters already-built RetroCandidate
// lists but does not rebuild sessions or mutate retroConfig. Candidate discovery
// remains owned by retro.ts and keeps its Lichess-aligned thresholds there.

import { LOSS_THRESHOLDS } from '../engine/winchances';
import type { LearnableReasonCode } from '../tree/types';
import type { RetroCandidate } from './retro';

export type RetroChoiceCategoryId =
  | 'missed-opportunities'
  | 'forced-tactics'
  | 'conversion-survival';

export type RetroChoiceSeverityPresetId =
  | 'all-mistake-moments'
  | 'mistakes-or-worse'
  | 'blunders-only';

export interface RetroChoiceCategory {
  id: RetroChoiceCategoryId;
  label: string;
  description: string;
  reasonCodes: readonly LearnableReasonCode[];
}

export interface RetroChoiceSeverityPreset {
  id: RetroChoiceSeverityPresetId;
  label: string;
  helper: string;
  /**
   * Candidate-generation floor later prompts can apply when rebuilding the
   * broad candidate list for this preset. Stored as Patzer's scaled loss value.
   */
  generationLossThreshold: number;
}

export interface RetroChoiceSelection {
  categoryIds: readonly RetroChoiceCategoryId[];
  severityPresetId: RetroChoiceSeverityPresetId;
}

export interface RetroChoiceState {
  candidates: readonly RetroCandidate[];
  userColor: 'white' | 'black' | null;
  selection: RetroChoiceSelection;
}

export interface RetroChoiceCount {
  id: RetroChoiceCategoryId | RetroChoiceSeverityPresetId;
  label: string;
  helper?: string;
  count: number;
}

export interface RetroChoiceCountSummary {
  total: number;
  categories: readonly RetroChoiceCount[];
  presets: readonly RetroChoiceCount[];






  configPreview?: RetroConfigPreviewSummary | null;
}

export const RETRO_CHOICE_CATEGORIES: readonly RetroChoiceCategory[] = [
  {
    id:          'missed-opportunities',
    label:       'Missed opportunities',
    description: 'Clear win-chance swings from the move played.',
    reasonCodes: ['swing'],
  },
  {
    id:          'forced-tactics',
    label:       'Forced tactics',
    description: 'Missed forced mates and missed punishment after an opponent mistake.',
    reasonCodes: ['missed-mate', 'punish'],
  },
  {
    id:          'conversion-survival',
    label:       'Conversion and survival',
    description: 'Blown wins and missed defensive resources.',
    reasonCodes: ['collapse', 'defensive'],
  },
];

export const RETRO_CHOICE_SEVERITY_PRESETS: readonly RetroChoiceSeverityPreset[] = [
  {
    id:                      'all-mistake-moments',
    label:                   'All mistake moments',
    helper:                  'Every eligible LFYM moment',
    generationLossThreshold: LOSS_THRESHOLDS.inaccuracy,
  },
  {
    id:                      'mistakes-or-worse',
    label:                   'Mistakes or worse',
    helper:                  '10%+ lost',
    generationLossThreshold: LOSS_THRESHOLDS.mistake,
  },
  {
    id:                      'blunders-only',
    label:                   'Blunders only',
    helper:                  '15%+ lost',
    generationLossThreshold: LOSS_THRESHOLDS.blunder,
  },
];

export const DEFAULT_RETRO_CHOICE_SELECTION: Readonly<RetroChoiceSelection> = {
  categoryIds:      RETRO_CHOICE_CATEGORIES.map(c => c.id),
  severityPresetId: 'mistakes-or-worse',
};

export const RETRO_CHOICE_CATEGORY_BY_ID: Readonly<Record<RetroChoiceCategoryId, RetroChoiceCategory>> = {
  'missed-opportunities': RETRO_CHOICE_CATEGORIES[0]!,
  'forced-tactics':       RETRO_CHOICE_CATEGORIES[1]!,
  'conversion-survival':  RETRO_CHOICE_CATEGORIES[2]!,
};

export const RETRO_CHOICE_SEVERITY_PRESET_BY_ID: Readonly<Record<RetroChoiceSeverityPresetId, RetroChoiceSeverityPreset>> = {
  'all-mistake-moments': RETRO_CHOICE_SEVERITY_PRESETS[0]!,
  'mistakes-or-worse':   RETRO_CHOICE_SEVERITY_PRESETS[1]!,
  'blunders-only':       RETRO_CHOICE_SEVERITY_PRESETS[2]!,
};

export function createDefaultRetroChoiceSelection(): RetroChoiceSelection {
  return {
    categoryIds:      [...DEFAULT_RETRO_CHOICE_SELECTION.categoryIds],
    severityPresetId: DEFAULT_RETRO_CHOICE_SELECTION.severityPresetId,
  };
}

export function cloneRetroChoiceSelection(selection: RetroChoiceSelection): RetroChoiceSelection {
  return {
    categoryIds:      [...selection.categoryIds],
    severityPresetId: selection.severityPresetId,
  };
}

export function getRetroChoiceCandidateCategoryId(candidate: RetroCandidate): RetroChoiceCategoryId {
  const code = candidate.reason.code;
  if (candidate.isMissedMate || code === 'punish') return 'forced-tactics';
  if (code === 'collapse' || code === 'defensive') return 'conversion-survival';
  const category = RETRO_CHOICE_CATEGORIES.find(c => c.reasonCodes.includes(code));
  return category?.id ?? 'missed-opportunities';
}

export function candidateMatchesRetroChoiceCategory(
  candidate: RetroCandidate,
  categoryId: RetroChoiceCategoryId,
): boolean {
  return getRetroChoiceCandidateCategoryId(candidate) === categoryId;
}

export function candidateMatchesRetroChoiceSeverityPreset(
  candidate: RetroCandidate,
  presetId: RetroChoiceSeverityPresetId,
): boolean {
  const preset = RETRO_CHOICE_SEVERITY_PRESET_BY_ID[presetId];
  if (preset.id === 'all-mistake-moments') return true;
  return candidate.loss >= preset.generationLossThreshold;
}

export function filterRetroCandidatesForChoice(
  candidates: readonly RetroCandidate[],
  selection: RetroChoiceSelection = DEFAULT_RETRO_CHOICE_SELECTION,
): RetroCandidate[] {
  const selectedCategories = new Set(selection.categoryIds);
  return candidates.filter(candidate =>
    selectedCategories.has(getRetroChoiceCandidateCategoryId(candidate)) &&
    candidateMatchesRetroChoiceSeverityPreset(candidate, selection.severityPresetId),
  );
}

export function countRetroChoiceCandidates(
  candidates: readonly RetroCandidate[],
  selection: RetroChoiceSelection = DEFAULT_RETRO_CHOICE_SELECTION,
): number {
  return filterRetroCandidatesForChoice(candidates, selection).length;
}

export function summarizeRetroChoiceCounts(
  candidates: readonly RetroCandidate[],
  selection: RetroChoiceSelection = DEFAULT_RETRO_CHOICE_SELECTION,
): RetroChoiceCountSummary {
  const selectedCategories = new Set(selection.categoryIds);
  const categories = RETRO_CHOICE_CATEGORIES.map(category => ({
    id:    category.id,
    label: category.label,
    count: candidates.filter(candidate =>
      candidateMatchesRetroChoiceCategory(candidate, category.id) &&
      candidateMatchesRetroChoiceSeverityPreset(candidate, selection.severityPresetId),
    ).length,
  }));

  const presets = RETRO_CHOICE_SEVERITY_PRESETS.map(preset => ({
    id:     preset.id,
    label:  preset.label,
    helper: preset.helper,
    count:  candidates.filter(candidate =>
      selectedCategories.has(getRetroChoiceCandidateCategoryId(candidate)) &&
      candidateMatchesRetroChoiceSeverityPreset(candidate, preset.id),
    ).length,
  }));

  return {
    total: countRetroChoiceCandidates(candidates, selection),
    categories,
    presets,
  };
}

export function formatRetroChoiceLossPercent(loss: number): string {
  return `${Math.round(Math.max(0, loss) * 100)}%`;
}








export type RetroConfigPreviewFamilyId =
  | 'sensitivity'
  | 'missed-mate'
  | 'collapse'
  | 'defensive'
  | 'punish';

export interface RetroConfigPreviewMove {
  ply: number;
  san:  string;
}

export interface RetroConfigFamilyPreview {
  id:    RetroConfigPreviewFamilyId;
  count: number;
  moves: readonly RetroConfigPreviewMove[];
}

export interface RetroConfigPreviewSummary {
  total:    number;
  families: readonly RetroConfigFamilyPreview[];
}

const RETRO_CONFIG_PREVIEW_FAMILY_IDS: readonly RetroConfigPreviewFamilyId[] = [
  'sensitivity', 'missed-mate', 'collapse', 'defensive', 'punish',
];

/**
 * Which settings-panel family a candidate currently belongs to.
 * Precedence mirrors getRetroChoiceCandidateCategoryId above: isMissedMate wins
 * first (a missed mate that also cleared the loss floor is still surfaced under
 * Missed Mates, matching retro.ts's own "always included" framing), then the
 * candidate's reason.code, else the core sensitivity gate ('swing').
 */
function retroConfigPreviewFamilyOf(candidate: RetroCandidate): RetroConfigPreviewFamilyId {
  if (candidate.isMissedMate) return 'missed-mate';
  if (candidate.reason.code === 'collapse')  return 'collapse';
  if (candidate.reason.code === 'defensive') return 'defensive';
  if (candidate.reason.code === 'punish')    return 'punish';
  return 'sensitivity';
}

/**
 * Build the Mistake Detection settings panel's live move preview directly from an
 * already-built RetroCandidate[] -- a pure bucket-and-sort of candidates that
 * buildRetroCandidates (retro.ts) already produced for the current retroConfig.
 */
export function buildRetroConfigPreview(candidates: readonly RetroCandidate[]): RetroConfigPreviewSummary {
  const families = RETRO_CONFIG_PREVIEW_FAMILY_IDS.map(id => {
    const moves = candidates
      .filter(c => retroConfigPreviewFamilyOf(c) === id)
      .slice()
      .sort((a, b) => a.ply - b.ply)
      .map(c => ({ ply: c.ply, san: c.playedMoveSan }));
    return { id, count: moves.length, moves };
  });
  return { total: candidates.length, families };
}
