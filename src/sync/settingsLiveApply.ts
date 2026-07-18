export const SETTINGS_LIVE_APPLY_EVENT = 'patzer:settings-live-apply';

export type SettingsLiveApplySource =
  | 'remoteSync-pull'
  | 'account-hydration';

export type SettingsLiveApplyStatus =
  | 'applied'
  | 'reload-recommended';

export interface SettingsLiveApplyGroup {
  id: string;
  label: string;
  keys: readonly string[];
  prefixes?: readonly string[];
  handlerId: string;
  status: SettingsLiveApplyStatus;
}

export interface SettingsLiveApplyGroupResult {
  groupId: string;
  label: string;
  changedCount: number;
  handlerId: string;
  status: SettingsLiveApplyStatus;
}

export interface SettingsLiveApplyResult {
  source: SettingsLiveApplySource;
  changedCount: number;
  groups: SettingsLiveApplyGroupResult[];
  reloadRecommended: boolean;
  latestUpdatedAt?: number;
}

export const SETTINGS_LIVE_APPLY_GROUPS: readonly SettingsLiveApplyGroup[] = Object.freeze([
  {
    id: 'control-help',
    label: 'Control help',
    keys: [
      'patzer.controlHelp.mode',
      'patzer.controlHelp.hoverDelayMs',
      'patzer.controlHelp.teachingCadence',
      'patzer.controlHelp.learningGeneration',
    ],
    prefixes: [
      'patzer.controlHelp.learned.',
      'patzer.controlHelp.snoozed.',
    ],
    handlerId: 'control-help.runtime-event',
    status: 'applied',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    keys: [
      'patzer.appearance.v1',
      'patzer.appearance.motion.v1',
      'gamesListBoardPreviewEnabled',
      'gamesListBoardPreviewSize',
      'patzer.games.underboardDensity.v1',
      'patzer.games.underboardPageSize.v1',
      'patzer.studyNavUiScalePct',
      'patzer.studyNavRowHeightPx',
      'patzer.studyNavRowHeightScaleText',
      'patzer.studyItemRowHeightPx',
      'patzer.studyItemRowHeightScaleText',
    ],
    handlerId: 'appearance.runtime-event',
    status: 'applied',
  },
  {
    id: 'board-cosmetics',
    label: 'Board cosmetics',
    keys: [
      'boardWheelNavEnabled',
      'reviewDotsUserOnly',
      'boardZoom',
      'boardTheme',
      'pieceSet',
      'chessBoardAnimationSpeed',
      'puzzleBoardAnimationSpeed',
      'boardSoundEnabled',
      'boardSoundVolume',
      'patzer.openings.boardSoundEnabled',
      'patzer.openings.targetColors.v1',
    ],
    prefixes: ['boardFilter.'],
    handlerId: 'board-cosmetics.reload-recommended',
    status: 'reload-recommended',
  },
  {
    id: 'engine-display',
    label: 'Engine display',
    keys: [
      'patzer.multiPv',
      'patzer.analysisDepth',
      'patzer.searchTime',
      'patzer.searchUntilDepth',
      'patzer.showEngineArrows',
      'patzer.arrowAllLines',
      'patzer.showArrowLabels',
      'patzer.showReviewLabels',
      'patzer.showBoardReviewGlyphs',
      'patzer.arrowLabelSize',
      'patzer.playStrengthLevel',
    ],
    handlerId: 'engine-display.reload-recommended',
    status: 'reload-recommended',
  },
  {
    id: 'review-depth',
    label: 'Review depth',
    keys: [
      'patzer.reviewDepth',
      'patzer.reviewDepth.bulk',
      'patzer.reviewMovetime',
    ],
    handlerId: 'review-depth.reload-recommended',
    status: 'reload-recommended',
  },
  {
    id: 'explorer',
    label: 'Opening explorer',
    keys: [
      'analyse.explorer.enabled',
      'explorer.db2.standard',
      'explorer.speed',
      'analyse.explorer.rating',
      'explorer.mode',
      'analyse.explorer.player.name',
      'explorer.player.name.previous',
    ],
    prefixes: ['analyse.explorer.since-2.', 'analyse.explorer.until-2.'],
    handlerId: 'explorer.reload-recommended',
    status: 'reload-recommended',
  },
  {
    id: 'games-filters',
    label: 'Games filters',
    keys: ['patzer.games.accountFilter.v1'],
    handlerId: 'games-filters.reload-recommended',
    status: 'reload-recommended',
  },
  {
    id: 'puzzle-retro',
    label: 'Puzzle and retrospection settings',
    keys: [
      'puzzleAutoNext',
      'missedMomentConfig',
      'retroConfig',
    ],
    handlerId: 'puzzle-retro.reload-recommended',
    status: 'reload-recommended',
  },
  {
    id: 'analysis-panel',
    label: 'Analysis panel',
    keys: [
      'patzer.postGameSummaryOpen',
      'patzer.evalGraphHeightPct',
      'patzer.evalGraphTheme',
      'patzer.evalGraphTooltip',
      'patzer.evalGraphGuides',
      'patzer.evalGraphRingMarker',
    ],
    handlerId: 'analysis-panel.reload-recommended',
    status: 'reload-recommended',
  },
  {




    id: 'orp-practice',
    label: 'ORP practice settings',
    keys: ['patzer.orp.settings.v1', 'patzer.orp.studyOverrides.v1'],
    handlerId: 'orp-practice.storage-reread',
    status: 'applied',
  },
]);

function uniqueKeys(keys: Iterable<string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function keyMatchesGroup(key: string, group: SettingsLiveApplyGroup): boolean {
  return group.keys.includes(key)
    || (group.prefixes ?? []).some(prefix => key.startsWith(prefix));
}

export function collectSettingKeysFromSyncItems(items: readonly unknown[]): string[] {
  const keys: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as { store?: unknown; itemKey?: unknown };
    if (record.store !== 'settings' || typeof record.itemKey !== 'string') continue;
    keys.push(record.itemKey);
  }
  return uniqueKeys(keys);
}

export function evaluateSettingsLiveApply(input: {
  source: SettingsLiveApplySource;
  changedKeys: readonly string[];
  latestUpdatedAt?: number;
}): SettingsLiveApplyResult {
  const changedKeys = uniqueKeys(input.changedKeys);
  const groups: SettingsLiveApplyGroupResult[] = [];
  for (const group of SETTINGS_LIVE_APPLY_GROUPS) {
    const changedCount = changedKeys.filter(key => keyMatchesGroup(key, group)).length;
    if (changedCount === 0) continue;
    groups.push({
      groupId: group.id,
      label: group.label,
      changedCount,
      handlerId: group.handlerId,
      status: group.status,
    });
  }
  const coveredCount = groups.reduce((sum, group) => sum + group.changedCount, 0);
  if (changedKeys.length > coveredCount) {
    groups.push({
      groupId: 'unknown-settings',
      label: 'Unknown settings',
      changedCount: changedKeys.length - coveredCount,
      handlerId: 'unknown-settings.reload-recommended',
      status: 'reload-recommended',
    });
  }
  return {
    source: input.source,
    changedCount: changedKeys.length,
    groups,
    reloadRecommended: groups.some(group => group.status === 'reload-recommended'),
    ...(input.latestUpdatedAt !== undefined ? { latestUpdatedAt: input.latestUpdatedAt } : {}),
  };
}

export function applySettingsLive(input: {
  source: SettingsLiveApplySource;
  changedKeys: readonly string[];
  latestUpdatedAt?: number;
}): SettingsLiveApplyResult {
  const result = evaluateSettingsLiveApply(input);
  if (result.changedCount > 0) {
    window.dispatchEvent(new CustomEvent(SETTINGS_LIVE_APPLY_EVENT, { detail: result }));
  }
  return result;
}















import {
  ORP_DEFAULT_SETTINGS,
  type OrpSettingsValues, type OrpSettingsLayer,
} from '../study/practice/settings';

export const ORP_SETTINGS_GLOBAL_KEY = 'patzer.orp.settings.v1';
export const ORP_SETTINGS_STUDY_OVERRIDES_KEY = 'patzer.orp.studyOverrides.v1';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null; // malformed storage falls back to defaults — never throws into render
  }
}

/** Global ORP defaults: stored partial merged over the shipped defaults. */
export function readOrpGlobalDefaults(): OrpSettingsValues {
  const stored = readJson(ORP_SETTINGS_GLOBAL_KEY);
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return ORP_DEFAULT_SETTINGS;
  return { ...ORP_DEFAULT_SETTINGS, ...(stored as Partial<OrpSettingsValues>) };
}

/** "Save as ORP defaults" (§10): merges changes into the stored global defaults. */
export function writeOrpGlobalDefaults(changes: OrpSettingsLayer): OrpSettingsValues {
  const next = { ...readOrpGlobalDefaults(), ...changes };
  localStorage.setItem(ORP_SETTINGS_GLOBAL_KEY, JSON.stringify(next));
  return next;
}

export function readOrpStudyOverride(studyItemId: string): OrpSettingsLayer {
  const stored = readJson(ORP_SETTINGS_STUDY_OVERRIDES_KEY);
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const layer = (stored as Record<string, unknown>)[studyItemId];
  if (typeof layer !== 'object' || layer === null || Array.isArray(layer)) return {};
  return layer as OrpSettingsLayer;
}

/** "Save only for this Study" / "Reset to inherited" (§10): writes ONE Study's override layer;
 *  an empty layer removes the entry so absent-means-inherited stays structural in storage too. */
export function writeOrpStudyOverride(studyItemId: string, layer: OrpSettingsLayer): void {
  const stored = readJson(ORP_SETTINGS_STUDY_OVERRIDES_KEY);
  const map: Record<string, unknown> =
    typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? { ...(stored as Record<string, unknown>) }
      : {};
  if (Object.keys(layer).length === 0) delete map[studyItemId];
  else map[studyItemId] = layer;
  localStorage.setItem(ORP_SETTINGS_STUDY_OVERRIDES_KEY, JSON.stringify(map));
}
