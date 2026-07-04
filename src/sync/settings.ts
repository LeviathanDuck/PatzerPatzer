// Account-backed settings sync for Patzer account sessions.
// Keeps localStorage as the runtime settings source while syncing an allowlisted
// preference subset through the authenticated Node sync API.

import {
  pullAccountSettings,
  pushAccountSettings,
  type AccountSettingSyncItem,
  type AuthStatus,
} from './client';
import { shouldSuppressRemoteSyncUpsert } from './remoteSync';
import { isSettingsRemoteApplySuppressed, withSettingsRemoteApplySuppressed } from './settingsSuppression';
import { applySettingsLive } from './settingsLiveApply';

const SETTING_UPDATED_AT_PREFIX = 'patzer.account.settingUpdatedAt.';
const FLUSH_DEBOUNCE_MS = 300;

const SETTINGS_KEYS = new Set([
  'patzer.reviewDepth',
  'patzer.reviewDepth.bulk',
  'patzer.reviewMovetime',
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
  'patzer.postGameSummaryOpen',
  'patzer.evalGraphHeightPct',
  'missedMomentConfig',
  'retroConfig',
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
  'puzzleAutoNext',
  'patzer.games.accountFilter.v1',
  'analyse.explorer.enabled',
  'explorer.db2.standard',
  'explorer.speed',
  'analyse.explorer.rating',
  'explorer.mode',
  'analyse.explorer.player.name',
  'explorer.player.name.previous',
]);

const SETTINGS_PREFIXES = [
  'boardFilter.',
  'analyse.explorer.since-2.',
  'analyse.explorer.until-2.',
];

let observerInstalled = false;
let applyingRemoteSettings = false;
let activeIdentityKey: string | null = null;
let flushTimer: number | null = null;
const pendingSettings = new Map<string, AccountSettingSyncItem>();

function settingUpdatedAtKey(key: string): string {
  return `${SETTING_UPDATED_AT_PREFIX}${key}`;
}

function settingUpdatedAt(key: string): number {
  const raw = localStorage.getItem(settingUpdatedAtKey(key));
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

function setSettingUpdatedAt(key: string, updatedAt: number): void {
  localStorage.setItem(settingUpdatedAtKey(key), String(Math.max(0, Math.floor(updatedAt))));
}

function isForbiddenSettingKey(key: string): boolean {
  return key === 'lastSyncedAt'
    || key === 'patzer.lichess.clientAuth'
    || key === 'patzer.lichess.oauthPending'
    || key === 'patzer.lichess.bookOAuthPending'
    || key === 'patzer.lichess.bookOAuthCallback'
    || key === 'chesspatzer.remoteSync.adminSyncToken'
    || key.startsWith('chesspatzer.remoteSync.')
    || key.startsWith('patzer.account.')
    || key.startsWith(SETTING_UPDATED_AT_PREFIX);
}

export function isAccountSyncedSettingKey(key: string): boolean {
  if (isForbiddenSettingKey(key)) return false;
  return SETTINGS_KEYS.has(key) || SETTINGS_PREFIXES.some(prefix => key.startsWith(prefix));
}

function identityKey(auth: Pick<AuthStatus, 'provider' | 'userId' | 'email' | 'username' | 'source'>): string | null {
  if (auth.source !== 'server' || auth.provider !== 'patzer') return null;
  const id = auth.userId?.trim();
  if (id) return `patzer:${id}`;
  const email = auth.email?.trim().toLowerCase();
  if (email) return `patzer-email:${email}`;
  return null;
}

function normalizeRemoteSetting(item: AccountSettingSyncItem): AccountSettingSyncItem | null {
  if (!item || typeof item !== 'object') return null;
  if (!isAccountSyncedSettingKey(item.key)) return null;
  if (typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) return null;
  if (item.deleted === true) {
    return { key: item.key, value: '', updatedAt: Math.max(0, Math.floor(item.updatedAt)), deleted: true };
  }
  if (typeof item.value !== 'string') return null;
  return { key: item.key, value: item.value, updatedAt: Math.max(0, Math.floor(item.updatedAt)) };
}

function readLocalSettingsSnapshot(): AccountSettingSyncItem[] {
  const items: AccountSettingSyncItem[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isAccountSyncedSettingKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    let updatedAt = settingUpdatedAt(key);
    if (updatedAt === 0) {
      updatedAt = Date.now();
      setSettingUpdatedAt(key, updatedAt);
    }
    items.push({
      key,
      value,
      updatedAt,
    });
  }
  return items;
}

function clearPendingSettings(): void {
  pendingSettings.clear();
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush(): void {
  if (!activeIdentityKey || pendingSettings.size === 0) return;
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushPendingSettings();
  }, FLUSH_DEBOUNCE_MS);
}

async function flushPendingSettings(): Promise<void> {
  if (!activeIdentityKey || pendingSettings.size === 0) return;
  const flushIdentity = activeIdentityKey;
  const items = [...pendingSettings.values()];
  pendingSettings.clear();
  const result = await pushAccountSettings(items);
  if (!result.success) {
    if (activeIdentityKey !== flushIdentity) {
      console.warn('[settings-sync] Dropping failed settings push after account changed:', result.error);
      return;
    }
    for (const item of items) pendingSettings.set(item.key, item);
    console.warn('[settings-sync] Settings push failed:', result.error);
  }
}

function queueSetting(item: AccountSettingSyncItem): void {
  if (!activeIdentityKey) return;
  pendingSettings.set(item.key, item);
  scheduleFlush();
}

function installSettingsObserver(): void {
  if (observerInstalled) return;
  observerInstalled = true;

  const proto = Storage.prototype;
  const originalSetItem = proto.setItem;
  const originalRemoveItem = proto.removeItem;

  proto.setItem = function setItem(key: string, value: string): void {
    originalSetItem.call(this, key, value);
    if (applyingRemoteSettings || isSettingsRemoteApplySuppressed() || this !== localStorage || !isAccountSyncedSettingKey(key)) return;
    const updatedAt = Date.now();
    originalSetItem.call(this, settingUpdatedAtKey(key), String(updatedAt));
    queueSetting({ key, value, updatedAt });
  };

  proto.removeItem = function removeItem(key: string): void {
    originalRemoveItem.call(this, key);
    if (applyingRemoteSettings || isSettingsRemoteApplySuppressed() || this !== localStorage || !isAccountSyncedSettingKey(key)) return;
    const updatedAt = Date.now();
    originalSetItem.call(this, settingUpdatedAtKey(key), String(updatedAt));
    queueSetting({ key, value: '', updatedAt, deleted: true });
  };
}

function applyRemoteSettings(items: AccountSettingSyncItem[]): { changed: boolean; changedKeys: string[] } {
  let changed = false;
  const changedKeys: string[] = [];
  applyingRemoteSettings = true;
  try {
    withSettingsRemoteApplySuppressed(() => {
      for (const raw of items) {
        const item = normalizeRemoteSetting(raw);
        if (!item) continue;
        if (item.updatedAt < settingUpdatedAt(item.key)) continue;
        if (!item.deleted && shouldSuppressRemoteSyncUpsert('settings', item.key, item.updatedAt)) continue;
        const currentValue = localStorage.getItem(item.key);
        if (item.deleted) {
          if (currentValue !== null) {
            localStorage.removeItem(item.key);
            changed = true;
            changedKeys.push(item.key);
          }
          setSettingUpdatedAt(item.key, item.updatedAt);
          continue;
        }
        if (currentValue !== item.value) {
          localStorage.setItem(item.key, item.value);
          changed = true;
          changedKeys.push(item.key);
        }
        setSettingUpdatedAt(item.key, item.updatedAt);
      }
    });
  } finally {
    applyingRemoteSettings = false;
  }
  return { changed, changedKeys };
}

async function pushLocalSettingsSnapshot(): Promise<void> {
  const snapshot = readLocalSettingsSnapshot();
  if (snapshot.length === 0) return;
  const result = await pushAccountSettings(snapshot);
  if (!result.success) console.warn('[settings-sync] Local settings snapshot push failed:', result.error);
}

export async function startAccountSettingsSync(auth: AuthStatus): Promise<void> {
  const identity = identityKey(auth);
  if (!identity) {
    stopAccountSettingsSync();
    return;
  }
  installSettingsObserver();
  if (activeIdentityKey === identity) return;
  clearPendingSettings();
  activeIdentityKey = identity;

  try {
    const remoteSettings = await pullAccountSettings();
    if (activeIdentityKey !== identity) return;
    const { changed, changedKeys } = applyRemoteSettings(remoteSettings);
    if (activeIdentityKey !== identity) return;
    applySettingsLive({
      source: 'account-hydration',
      changedKeys,
    });
    if (changed) return;
    await pushLocalSettingsSnapshot();
    if (activeIdentityKey !== identity) return;
    await flushPendingSettings();
  } catch (error) {
    console.warn('[settings-sync] Startup settings sync failed:', error);
  }
}

export function stopAccountSettingsSync(): void {
  activeIdentityKey = null;
  clearPendingSettings();
}
