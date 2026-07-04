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
    ],
    handlerId: 'analysis-panel.reload-recommended',
    status: 'reload-recommended',
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
