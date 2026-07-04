






import { DB_NAME as MAIN_DB_NAME, DB_VERSION as MAIN_DB_VERSION, upgradeGameDbSchema } from '../idb/index';
import type { SyncResult } from './client';
import {
  drainDurableVersionedOutbox,
  runVersionedPreWriteGate,
  type VersionedWriteBatchRequest,
  type VersionedWriteBatchResponse,
} from './versionDrain';
import {
  createRemoteSyncItemVersionResolver,
  getRemoteSyncItemVersion,
  readRemoteSyncVersionMetadata,
  recordRemoteSyncItemVersion,
  setRemoteSyncLatestVersion,
} from './versionMetadata';
import {
  defaultDurableVersionedOutboxStorage,
  enqueueDurableVersionedOutboxEntries,
  enqueueDurableVersionedOutboxEntry,
  readDurableVersionedOutbox,
} from './versionOutbox';
import {
  REMOTE_SYNC_STORE_NAMES,
  migrateRemoteSyncItem,
  type RemoteSyncItem,
  type RemoteSyncOperation,
  type RemoteSyncStoreName,
} from './remoteSyncMigrations';
import {
  SYNC_ACCOUNT_CURSOR_FIELDS,
  SYNC_ACCOUNT_PROFILE_FIELDS,
} from './generatedManifest';
import { shouldRunFullVersionedPull } from './versionRecovery';
import { isSettingsRemoteApplySuppressed, withSettingsRemoteApplySuppressed } from './settingsSuppression';
import { applySettingsLive, collectSettingKeysFromSyncItems } from './settingsLiveApply';

const API_BASE = '/api/patzer-sync';
const PUZZLE_DB_NAME = 'patzer-puzzle-v1';
const PUZZLE_DB_VERSION = 3;
const TOKEN_KEY = 'chesspatzer.remoteSync.adminSyncToken';
const LAST_SYNC_KEY = 'chesspatzer.remoteSync.lastSyncedAt';
const LAST_CHECK_KEY = 'chesspatzer.remoteSync.lastCheckedAt';
const OUTBOX_KEY = 'chesspatzer.remoteSync.outbox';
const DEVICE_TAG_KEY = 'chesspatzer.remoteSync.deviceTag';
const SYNC_LOG_KEY = 'chesspatzer.remoteSync.syncLog';
const SERVER_GENERATION_KEY = 'chesspatzer.remoteSync.syncGeneration';
const SERVER_IDENTITY_KEY = 'chesspatzer.remoteSync.syncIdentity';
const SERVER_LATEST_VERSION_KEY_PREFIX = 'chesspatzer.remoteSync.lastObservedServerVersion';
const FULL_PULL_REQUIRED_KEY = 'chesspatzer.remoteSync.fullPullRequired';
const CLOUD_STATE_STALE_KEY = 'chesspatzer.remoteSync.cloudStateStale';
const CAS_CLIENT_ID_KEY = 'chesspatzer.remoteSync.casClientId';
export const REMOTE_SYNC_LOG_EVENT = 'chesspatzer:remoteSync-sync-log-changed';
export const REMOTE_SYNC_ANALYSIS_CHANGED_EVENT = 'chesspatzer:remoteSync-analysis-changed';
export const REMOTE_SYNC_APPLIED_EVENT = 'chesspatzer:remoteSync-remote-sync-applied';
export const REMOTE_SYNC_ACTIVITY_EVENT = 'chesspatzer:remoteSync-sync-activity-changed';
const SETTING_UPDATED_AT_PREFIX = 'chesspatzer.remoteSync.settingUpdatedAt.';
const ITEM_UPDATED_AT_PREFIX = 'chesspatzer.remoteSync.itemUpdatedAt.';
const ITEM_DELETED_AT_PREFIX = 'chesspatzer.remoteSync.itemDeletedAt.';
const PUSH_BATCH_SIZE = 100;
const RESTORE_CHUNK_SIZE = 100;
const FLUSH_DEBOUNCE_MS = 250;
const FLUSH_INTERVAL_MS = 15_000;
const REMOTE_POLL_INTERVAL_MS = 60_000;
const SYNC_LOG_LIMIT = 80;
const BACKUP_FORMAT = 'patzer-sync-backup';

export type { RemoteSyncItem, RemoteSyncOperation, RemoteSyncStoreName };
export type RemoteStoreName = RemoteSyncStoreName;

export interface RemoteSyncDeleteKey {
  store: RemoteSyncStoreName;
  itemKey: string;
}

export interface RemoteSyncPersistenceOperation {
  operation: 'put' | 'delete';
  dbName:    string;
  storeName: string;
  itemKey:   string;
  updatedAt: number;
  payload?:  unknown;
}

export type RemoteSyncLogAction =
  | 'backup'
  | 'data-management'
  | 'restore'
  | 'invalidate'
  | 'login'
  | 'logout'
  | 'test'
  | 'push'
  | 'pull'
  | 'flush'
  | 'reconcile'
  | 'token'
  | 'system';

export type RemoteSyncLogStatus = 'success' | 'error' | 'info';

export interface RemoteSyncLogEntry {
  id: string;
  at: number;
  action: RemoteSyncLogAction;
  status: RemoteSyncLogStatus;
  message: string;
  deviceTag: string;
  counts?: Record<string, number>;
}

export type RemoteSyncFreshnessState = 'fresh' | 'stale' | 'unknown';

export interface RemoteSyncIdentitySnapshot {
  hasToken: boolean;
  identityLabel: string | null;
  lastSyncedAt: string | null;
  lastCheckedAt: string | null;
  freshnessState: RemoteSyncFreshnessState;
  freshnessWarning: boolean;
  freshnessLabel: string;
  freshnessTitle: string;
  localVersion: number | null;
  serverVersion: number | null;
  fullPullRequired: boolean;
  cloudStateStale: boolean;
}

interface PullResponse {
  ok?: boolean;
  code?: string;
  items?: unknown[];
  latestUpdatedAt?: number;
  latestVersion?: number;
  syncGeneration?: number;
  generationReason?: string;
  skippedMalformedJson?: number;
  fullPullRequired?: boolean;
  error?: string;
}

interface RemoteSyncPullOptions {
  since?: number | null;
  flushAfter?: boolean;
  logNoop?: boolean;
}

type RemoteSyncPullPlan =
  | { mode: 'cursor'; path: string; cursor: number; forcedFullPull: boolean }
  | { mode: 'since'; path: string; since: number };

interface DataManagementDeleteResponse {
  ok?: boolean;
  items?: unknown[];
  counts?: Record<string, number>;
  latestUpdatedAt?: number;
  latestVersion?: number;
  syncGeneration?: number;
  generationReason?: string;
  error?: string;
}

interface ApiErrorBody {
  error?: string;
  code?: string;
  authIdentity?: string;
  userKey?: string;
  syncGeneration?: number;
  generationReason?: string;
}

interface OutboxSnapshot {
  valid: RemoteSyncItem[];
  preservedInvalid: unknown[];
}

export interface RemoteSyncDataManagementDeleteTransaction {
  readonly actionId: string;
  stageKeys(keys: readonly RemoteSyncDeleteKey[]): void;
  commit(keys: readonly RemoteSyncDeleteKey[]): Promise<SyncResult>;
  release(): void;
}

interface StatusStoreSummary {
  items: number;
  tombstones: number;
  latestUpdatedAt: number;
}

interface StatusResponse {
  ok?: boolean;
  authIdentity?: string;
  userKey?: string;
  items?: number;
  tombstones?: number;
  latestUpdatedAt?: number;
  latestVersion?: number;
  stores?: Record<string, StatusStoreSummary>;
  syncGeneration?: number;
  generationReason?: string;
  code?: string;
  error?: string;
}

interface BackupCounts {
  items: number;
  tombstones: number;
  stores: Record<string, { items: number; tombstones: number }>;
}

interface RawBackupBundle {
  ok?: boolean;
  format?: string;
  version?: number;
  exportedAt?: string;
  userKey?: string;
  syncGeneration?: number;
  generationReason?: string;
  items?: unknown[];
  counts?: unknown;
  skippedMalformedJson?: number;
  repairedInvalidUpdatedAt?: number;
  error?: string;
}

export interface RemoteSyncBackupPreview {
  fileName: string;
  exportedAt: string;
  userKey?: string;
  syncGeneration: number;
  generationReason?: string;
  currentSyncGeneration: number;
  expectedSyncGeneration: number;
  items: RemoteSyncItem[];
  counts: BackupCounts;
  hash: string;
  warnings: string[];
}

type IdbKeyMode = 'keyPath' | 'explicit' | 'scan';

interface IdbRecord {
  primaryKey: IDBValidKey;
  value: unknown;
}

interface IdbStoreSpec {
  store: RemoteSyncStoreName;
  dbName: string;
  dbVersion: number;
  objectStore: string;
  keyMode: IdbKeyMode;
  keyForRecord: (record: unknown, primaryKey?: IDBValidKey) => string | undefined;
  updatedAt: (record: unknown) => number;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: unknown, field: string): string | undefined {
  const value = objectValue(record)?.[field];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberField(record: unknown, field: string): number {
  const value = objectValue(record)?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function createLogId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultDeviceTag(): string {
  return `Device ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function isCounts(value: unknown): value is Record<string, number> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(v => typeof v === 'number' && Number.isFinite(v));
}

function normalizeLogEntry(value: unknown): RemoteSyncLogEntry | null {
  const entry = objectValue(value);
  if (!entry) return null;
  if (typeof entry.id !== 'string' || !entry.id.trim()) return null;
  if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return null;
  if (typeof entry.action !== 'string') return null;
  if (entry.status !== 'success' && entry.status !== 'error' && entry.status !== 'info') return null;
  if (typeof entry.message !== 'string') return null;
  if (typeof entry.deviceTag !== 'string') return null;
  const counts = isCounts(entry.counts) ? entry.counts : undefined;
  return {
    id: entry.id,
    at: entry.at,
    action: entry.action as RemoteSyncLogAction,
    status: entry.status,
    message: entry.message,
    deviceTag: entry.deviceTag,
    ...(counts ? { counts } : {}),
  };
}

function emitSyncLogChanged(): void {
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_LOG_EVENT));
}

function emitAnalysisChanged(): void {
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_ANALYSIS_CHANGED_EVENT));
}

function storesChangedByCounts(counts: Record<string, number>): RemoteSyncStoreName[] {
  const stores = new Set<RemoteSyncStoreName>();
  for (const [key, value] of Object.entries(counts)) {
    if (value <= 0) continue;
    const store = key.split(':')[0];
    if (REMOTE_SYNC_STORE_NAMES.includes(store as RemoteSyncStoreName)) {
      stores.add(store as RemoteSyncStoreName);
    }
  }
  return [...stores];
}

function emitRemoteSyncApplied(counts: Record<string, number>, latestUpdatedAt: number): void {
  const stores = storesChangedByCounts(counts);
  if (stores.length === 0) return;
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_APPLIED_EVENT, {
    detail: {
      counts,
      latestUpdatedAt,
      stores,
    },
  }));
}

class RemoteSyncStaleSessionError extends Error {
  readonly syncGeneration: number | undefined;
  readonly generationReason: string | undefined;

  constructor(body: ApiErrorBody) {
    super(body.error || 'This browser session is stale. Re-enter the admin token and pull before pushing.');
    this.name = 'RemoteSyncStaleSessionError';
    this.syncGeneration = body.syncGeneration;
    this.generationReason = body.generationReason;
  }
}

function storedServerGeneration(): number | undefined {
  const raw = localStorage.getItem(SERVER_GENERATION_KEY);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function getRemoteSyncGeneration(): number | undefined {
  return storedServerGeneration();
}

function rememberServerGeneration(generation: unknown, reason?: unknown): void {
  if (typeof generation !== 'number' || !Number.isFinite(generation) || generation <= 0) return;
  localStorage.setItem(SERVER_GENERATION_KEY, String(Math.floor(generation)));
  if (typeof reason === 'string' && reason.trim()) {
    localStorage.setItem(`${SERVER_GENERATION_KEY}.reason`, reason);
  }
}

function rememberServerIdentity(identity: unknown, userKey: unknown): void {
  const value = typeof identity === 'string' && identity.trim()
    ? identity.trim()
    : typeof userKey === 'string' && userKey.trim()
      ? userKey.trim()
      : '';
  if (value) localStorage.setItem(SERVER_IDENTITY_KEY, value);
}

function storedServerIdentity(): string {
  return localStorage.getItem(SERVER_IDENTITY_KEY)?.trim() || 'admin-beta';
}

function storedServerIdentityLabel(): string | null {
  return localStorage.getItem(SERVER_IDENTITY_KEY)?.trim() || null;
}

function observedServerVersionKey(identity: string): string {
  return `${SERVER_LATEST_VERSION_KEY_PREFIX}.${encodeURIComponent(identity)}`;
}

function validSyncVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function normalizeSyncVersion(value: unknown): number | null {
  if (validSyncVersion(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  return null;
}

function rememberObservedServerLatestVersion(latestVersion: unknown): void {
  const version = normalizeSyncVersion(latestVersion);
  if (version === null) return;
  const identity = storedServerIdentityLabel();
  if (!identity) return;
  localStorage.setItem(observedServerVersionKey(identity), String(version));
}

function getObservedServerLatestVersion(identity: string): number | null {
  const raw = localStorage.getItem(observedServerVersionKey(identity));
  if (raw === null) return null;
  const parsed = Number(raw);
  return validSyncVersion(parsed) ? parsed : null;
}

function clearObservedServerLatestVersions(): void {
  const prefix = `${SERVER_LATEST_VERSION_KEY_PREFIX}.`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) localStorage.removeItem(key);
}

function syncFreshnessSnapshot(
  hasToken: boolean,
  identityLabel: string | null,
): Pick<
  RemoteSyncIdentitySnapshot,
  | 'freshnessState'
  | 'freshnessWarning'
  | 'freshnessLabel'
  | 'freshnessTitle'
  | 'localVersion'
  | 'serverVersion'
  | 'fullPullRequired'
  | 'cloudStateStale'
> {
  const fullPullRequired = isRemoteSyncFullPullRequired();
  const cloudStateStale = isRemoteSyncCloudStateStale();
  if (!hasToken) {
    return {
      freshnessState: 'unknown',
      freshnessWarning: false,
      freshnessLabel: 'Logged out',
      freshnessTitle: 'Sync is logged out.',
      localVersion: null,
      serverVersion: null,
      fullPullRequired,
      cloudStateStale,
    };
  }
  if (!identityLabel) {
    return {
      freshnessState: 'unknown',
      freshnessWarning: false,
      freshnessLabel: 'Freshness pending',
      freshnessTitle: 'Waiting for the server to confirm this token identity.',
      localVersion: null,
      serverVersion: null,
      fullPullRequired,
      cloudStateStale,
    };
  }

  const metadata = readRemoteSyncVersionMetadata(localStorage, identityLabel);
  const localVersion = metadata.needsFullPull ? null : metadata.latestVersion;
  const serverVersion = getObservedServerLatestVersion(identityLabel);
  const stale = (label: string, title: string) => ({
    freshnessState: 'stale' as const,
    freshnessWarning: true,
    freshnessLabel: label,
    freshnessTitle: title,
    localVersion,
    serverVersion,
    fullPullRequired,
    cloudStateStale,
  });

  if (fullPullRequired) return stale('Sync may be stale', 'Full pull required before local data is current.');
  if (cloudStateStale) return stale('Sync may be stale', 'Local sync state needs a fresh pull from the server.');
  if (metadata.needsFullPull) return stale('Sync may be stale', 'Local sync cursor is missing; pull the token database before trusting local data.');
  if (serverVersion !== null && localVersion !== null && serverVersion > localVersion) {
    return stale('Sync may be stale', 'Server has newer sync data than this browser.');
  }
  if (getRemoteSyncLastCheckedAt() && !getRemoteSyncLastSyncedAt()) {
    return stale('Sync may be stale', 'No completed sync has been recorded after the last database check.');
  }
  if (serverVersion !== null && localVersion !== null && localVersion >= serverVersion) {
    return {
      freshnessState: 'fresh',
      freshnessWarning: false,
      freshnessLabel: 'Up to date',
      freshnessTitle: 'This browser is current as of the last server check.',
      localVersion,
      serverVersion,
      fullPullRequired,
      cloudStateStale,
    };
  }
  return {
    freshnessState: 'unknown',
    freshnessWarning: false,
    freshnessLabel: 'Freshness pending',
    freshnessTitle: 'No server freshness comparison is available yet.',
    localVersion,
    serverVersion,
    fullPullRequired,
    cloudStateStale,
  };
}

export function getRemoteSyncIdentitySnapshot(): RemoteSyncIdentitySnapshot {
  const hasToken = hasRemoteSyncToken();
  const identityLabel = hasToken ? storedServerIdentityLabel() : null;
  return {
    hasToken,
    identityLabel,
    lastSyncedAt: getRemoteSyncLastSyncedAt(),
    lastCheckedAt: getRemoteSyncLastCheckedAt(),
    ...syncFreshnessSnapshot(hasToken, identityLabel),
  };
}

function clearServerGeneration(): void {
  localStorage.removeItem(SERVER_GENERATION_KEY);
  localStorage.removeItem(`${SERVER_GENERATION_KEY}.reason`);
  localStorage.removeItem(SERVER_IDENTITY_KEY);
  clearObservedServerLatestVersions();
  localStorage.removeItem(CLOUD_STATE_STALE_KEY);
}

export function isRemoteSyncFullPullRequired(): boolean {
  return localStorage.getItem(FULL_PULL_REQUIRED_KEY) === '1';
}

function isRemoteSyncCloudStateStale(): boolean {
  return localStorage.getItem(CLOUD_STATE_STALE_KEY) === '1';
}

function markRemoteSyncCloudStateStale(): void {
  localStorage.setItem(CLOUD_STATE_STALE_KEY, '1');
}

function clearRemoteSyncCloudStateStale(): void {
  localStorage.removeItem(CLOUD_STATE_STALE_KEY);
}

function requireRemoteSyncFullPull(): void {
  localStorage.setItem(FULL_PULL_REQUIRED_KEY, '1');
}

function clearRemoteSyncFullPullRequirement(): void {
  localStorage.removeItem(FULL_PULL_REQUIRED_KEY);
}

export function getRemoteSyncDeviceTag(): string {
  let stored = '';
  try {
    stored = localStorage.getItem(DEVICE_TAG_KEY)?.trim() ?? '';
  } catch {
    stored = '';
  }
  if (stored) return stored;
  const tag = defaultDeviceTag();
  try {
    localStorage.setItem(DEVICE_TAG_KEY, tag);
  } catch {
    // Device labels are convenience metadata and must never block sync.
  }
  return tag;
}

export function setRemoteSyncDeviceTag(tag: string): string {
  const value = tag.trim() || defaultDeviceTag();
  try {
    localStorage.setItem(DEVICE_TAG_KEY, value);
    emitSyncLogChanged();
  } catch {
    // Device labels are convenience metadata and must never block sync.
  }
  return value;
}

export function getRemoteSyncLog(): RemoteSyncLogEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeLogEntry)
      .filter((entry): entry is RemoteSyncLogEntry => entry !== null)
      .sort((a, b) => b.at - a.at)
      .slice(0, SYNC_LOG_LIMIT);
  } catch {
    return [];
  }
}

export function clearRemoteSyncLog(): void {
  try {
    localStorage.removeItem(SYNC_LOG_KEY);
    emitSyncLogChanged();
  } catch {
    // Local log cleanup is best-effort.
  }
}

export function recordRemoteSyncLog(
  action: RemoteSyncLogAction,
  status: RemoteSyncLogStatus,
  message: string,
  counts?: Record<string, number>,
): RemoteSyncLogEntry {
  const entry: RemoteSyncLogEntry = {
    id: createLogId(),
    at: Date.now(),
    action,
    status,
    message,
    deviceTag: getRemoteSyncDeviceTag(),
    ...(counts ? { counts } : {}),
  };
  try {
    const next = [entry, ...getRemoteSyncLog()].slice(0, SYNC_LOG_LIMIT);
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(next));
    emitSyncLogChanged();
  } catch {
    // The audit trail is local-only evidence. It must not change sync outcomes.
  }
  return entry;
}

function isoTimeField(record: unknown, field: string): number {
  const value = objectValue(record)?.[field];
  if (typeof value !== 'string' || !value.trim()) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function maxTimestamp(...values: number[]): number {
  return Math.max(0, ...values.filter(value => Number.isFinite(value)));
}

function genericUpdatedAt(record: unknown): number {
  return maxTimestamp(
    numberField(record, 'updatedAt'),
    numberField(record, 'savedAt'),
    numberField(record, 'completedAt'),
    numberField(record, 'timestamp'),
    numberField(record, 'lastAttemptAt'),
    numberField(record, 'nextDueAt'),
    numberField(record, 'createdAt'),
    numberField(record, 'importedAt'),
    isoTimeField(record, 'analyzedAt'),
  );
}





const ACCOUNT_PROFILE_FIELDS = SYNC_ACCOUNT_PROFILE_FIELDS;
const ACCOUNT_CURSOR_FIELDS = SYNC_ACCOUNT_CURSOR_FIELDS;

function accountProfileUpdatedAt(record: unknown): number {
  return maxTimestamp(
    numberField(record, 'profileUpdatedAt'),
    numberField(record, 'addedAt'),
  );
}

function accountCursorUpdatedAt(record: unknown): number {
  return maxTimestamp(
    numberField(record, 'syncCursorUpdatedAt'),
    numberField(record, 'lastSyncedAt'),
    numberField(record, 'newestGameTimestamp'),
    numberField(record, 'oldestGameTimestamp'),
  );
}

function accountUpdatedAt(record: unknown): number {
  return maxTimestamp(
    accountProfileUpdatedAt(record),
    accountCursorUpdatedAt(record),
    numberField(record, 'addedAt'),
  );
}

function copyAccountFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (field in source) target[field] = source[field];
  }
}

function earliestPositiveTimestamp(left: number, right: number): number {
  if (left > 0 && right > 0) return Math.min(left, right);
  return Math.max(left, right);
}

function normalizeAccountPayload(record: unknown, itemKey?: string): Record<string, unknown> | null {
  const account = objectValue(record);
  if (!account) return null;
  const normalized: Record<string, unknown> = { ...account };
  if (itemKey && !stringField(normalized, 'id')) normalized.id = itemKey;
  const profileUpdatedAt = accountProfileUpdatedAt(normalized);
  const syncCursorUpdatedAt = accountCursorUpdatedAt(normalized);
  if (profileUpdatedAt > 0) normalized.profileUpdatedAt = profileUpdatedAt;
  if (syncCursorUpdatedAt > 0) normalized.syncCursorUpdatedAt = syncCursorUpdatedAt;
  return normalized;
}

export function mergeRemoteSyncAccountPayload(
  existingRecord: unknown,
  incomingRecord: unknown,
  itemKey?: string,
): Record<string, unknown> | null {
  const incoming = normalizeAccountPayload(incomingRecord, itemKey);
  if (!incoming) return null;
  const existing = normalizeAccountPayload(existingRecord, itemKey);
  if (!existing) return incoming;

  const existingProfileUpdatedAt = accountProfileUpdatedAt(existing);
  const incomingProfileUpdatedAt = accountProfileUpdatedAt(incoming);
  const existingCursorUpdatedAt = accountCursorUpdatedAt(existing);
  const incomingCursorUpdatedAt = accountCursorUpdatedAt(incoming);
  const profileSource = incomingProfileUpdatedAt >= existingProfileUpdatedAt ? incoming : existing;
  const cursorSource = incomingCursorUpdatedAt >= existingCursorUpdatedAt ? incoming : existing;
  const merged: Record<string, unknown> = { ...existing, ...incoming };

  merged.id = stringField(existing, 'id') ?? stringField(incoming, 'id') ?? itemKey ?? '';
  merged.platform = stringField(existing, 'platform') ?? stringField(incoming, 'platform') ?? '';
  merged.username = stringField(existing, 'username') ?? stringField(incoming, 'username') ?? '';
  merged.addedAt = earliestPositiveTimestamp(numberField(existing, 'addedAt'), numberField(incoming, 'addedAt'));

  copyAccountFields(merged, profileSource, ACCOUNT_PROFILE_FIELDS);
  merged.profileUpdatedAt = Math.max(accountProfileUpdatedAt(profileSource), numberField(merged, 'addedAt'));

  copyAccountFields(merged, cursorSource, ACCOUNT_CURSOR_FIELDS);
  merged.syncCursorUpdatedAt = accountCursorUpdatedAt(cursorSource);

  return merged;
}

function singletonKey(key: string): () => string {
  return () => key;
}

function attemptKey(record: unknown): string | undefined {
  const puzzleId = stringField(record, 'puzzleId');
  const startedAt = numberField(record, 'startedAt');
  const completedAt = numberField(record, 'completedAt');
  if (!puzzleId || completedAt <= 0) return undefined;
  return startedAt > 0 ? `${puzzleId}::${startedAt}::${completedAt}` : `${puzzleId}::${completedAt}`;
}

function drillAttemptKey(record: unknown): string | undefined {
  const positionKey = stringField(record, 'positionKey');
  const sequenceId = stringField(record, 'sequenceId');
  const timestamp = numberField(record, 'timestamp');
  return positionKey && sequenceId && timestamp > 0 ? `${positionKey}::${sequenceId}::${timestamp}` : undefined;
}

const IDB_STORE_SPECS: IdbStoreSpec[] = [
  {
    store: 'games',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'games',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => maxTimestamp(numberField(record, 'updatedAt'), numberField(record, 'importedAt')),
  },
  {
    store: 'analysis',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'analysis-library',
    keyMode: 'explicit',
    keyForRecord: record => stringField(record, 'gameId'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
  {
    store: 'game-summaries',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'game-summaries',
    keyMode: 'explicit',
    keyForRecord: record => stringField(record, 'gameId'),
    updatedAt: record => maxTimestamp(isoTimeField(record, 'analyzedAt'), numberField(record, 'updatedAt')),
  },
  {
    store: 'retro-results',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'retro-results',
    keyMode: 'explicit',
    keyForRecord: record => stringField(record, 'gameId'),
    updatedAt: record => numberField(record, 'savedAt'),
  },
  {
    store: 'saved-review-puzzles',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'puzzle-library',
    keyMode: 'explicit',
    keyForRecord: singletonKey('saved-puzzles'),
    updatedAt: record => Array.isArray(record)
      ? maxTimestamp(...record.map(item => genericUpdatedAt(item)))
      : genericUpdatedAt(record),
  },
  {
    store: 'studies',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'studies',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
  {
    store: 'practice-lines',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'practice-lines',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
  {
    store: 'position-progress',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'position-progress',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'key'),
    updatedAt: record => maxTimestamp(numberField(record, 'lastAttemptAt'), numberField(record, 'nextDueAt')),
  },
  {
    store: 'drill-attempts',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'drill-attempts',
    keyMode: 'scan',
    keyForRecord: drillAttemptKey,
    updatedAt: record => numberField(record, 'timestamp'),
  },
  {
    store: 'folders',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'folders',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
  {
    store: 'accounts',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'accounts',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: accountUpdatedAt,
  },
  {
    store: 'puzzle-definitions',
    dbName: PUZZLE_DB_NAME,
    dbVersion: PUZZLE_DB_VERSION,
    objectStore: 'definitions',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => maxTimestamp(numberField(record, 'updatedAt'), numberField(record, 'createdAt')),
  },
  {
    store: 'puzzle-attempts',
    dbName: PUZZLE_DB_NAME,
    dbVersion: PUZZLE_DB_VERSION,
    objectStore: 'attempts',
    keyMode: 'scan',
    keyForRecord: attemptKey,
    updatedAt: record => maxTimestamp(numberField(record, 'updatedAt'), numberField(record, 'completedAt')),
  },
  {
    store: 'puzzle-user-meta',
    dbName: PUZZLE_DB_NAME,
    dbVersion: PUZZLE_DB_VERSION,
    objectStore: 'user-meta',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'puzzleId'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
  {
    store: 'puzzle-user-perf',
    dbName: PUZZLE_DB_NAME,
    dbVersion: PUZZLE_DB_VERSION,
    objectStore: 'user-perf',
    keyMode: 'explicit',
    keyForRecord: singletonKey('puzzle'),
    updatedAt: record => numberField(record, 'latest'),
  },
  {
    store: 'puzzle-rating-history',
    dbName: PUZZLE_DB_NAME,
    dbVersion: PUZZLE_DB_VERSION,
    objectStore: 'rating-history',
    keyMode: 'scan',
    keyForRecord: record => {
      const timestamp = numberField(record, 'timestamp');
      const rating = numberField(record, 'rating');
      const deviation = numberField(record, 'deviation');
      return timestamp > 0 ? `${timestamp}::${rating}::${deviation}` : undefined;
    },
    updatedAt: record => numberField(record, 'timestamp'),
  },
  {
    store: 'opening-collections',
    dbName: 'patzer-openings',
    dbVersion: 3,
    objectStore: 'collections',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
  {
    store: 'opening-session',
    dbName: 'patzer-openings',
    dbVersion: 3,
    objectStore: 'session',
    keyMode: 'explicit',
    keyForRecord: singletonKey('current'),
    updatedAt: record => numberField(record, 'savedAt'),
  },
  {
    store: 'opening-training-variations',
    dbName: 'patzer-openings',
    dbVersion: 3,
    objectStore: 'training-variations',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => maxTimestamp(numberField(objectValue(record)?.stats, 'lastAttempt'), numberField(record, 'createdAt')),
  },
  {
    store: 'repertoire-sources',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'repertoire-sources',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'id'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
  {
    store: 'repertoire-match-records',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'repertoire-match-records',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'key'),
    updatedAt: record => maxTimestamp(numberField(record, 'scannedAt'), numberField(record, 'updatedAt')),
  },
  {
    store: 'repertoire-scan-runs',
    dbName: MAIN_DB_NAME,
    dbVersion: MAIN_DB_VERSION,
    objectStore: 'repertoire-scan-runs',
    keyMode: 'keyPath',
    keyForRecord: record => stringField(record, 'runId'),
    updatedAt: record => numberField(record, 'updatedAt'),
  },
];

const IDB_SPECS_BY_STORE = new Map<RemoteSyncStoreName, IdbStoreSpec>(
  IDB_STORE_SPECS.map(spec => [spec.store, spec]),
);

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

let autoSyncStarted = false;
let flushDebounceTimer: number | null = null;
let flushIntervalTimer: number | null = null;
let remotePollIntervalTimer: number | null = null;
let visibilityFlushHandler: (() => void) | null = null;
let pageShowSyncHandler: (() => void) | null = null;
let focusSyncHandler: (() => void) | null = null;
let onlineSyncHandler: (() => void) | null = null;
let settingsObserverInstalled = false;
let applyingRemoteSync = false;
let syncGeneration = 0;
let skipNextStartupPush = false;
let activeSyncOperationCount = 0;
let autoPullInFlight = false;
let pendingVersionedOutboxEnqueues: Promise<void>[] = [];

interface ActiveDataManagementDelete {
  actionId: string;
  keyIds: Set<string>;
}

let activeDataManagementDelete: ActiveDataManagementDelete | null = null;

function deleteKeyId(store: RemoteSyncStoreName, itemKey: string): string {
  return `${store}\u0000${itemKey}`;
}

function normalizeDeleteKeys(keys: readonly RemoteSyncDeleteKey[]): RemoteSyncDeleteKey[] {
  const normalized: RemoteSyncDeleteKey[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!REMOTE_SYNC_STORE_NAMES.includes(key.store)) throw new Error(`Unsupported Remote sync store: ${key.store}`);
    if (!key.itemKey.trim()) throw new Error('RemoteSync delete key is missing itemKey.');
    const id = deleteKeyId(key.store, key.itemKey);
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push({ store: key.store, itemKey: key.itemKey });
  }
  return normalized;
}

function isActiveDataManagementDeleteKey(store: RemoteSyncStoreName, itemKey: string): boolean {
  return activeDataManagementDelete?.keyIds.has(deleteKeyId(store, itemKey)) ?? false;
}

function stageActiveDataManagementDeleteKeys(keys: readonly RemoteSyncDeleteKey[]): void {
  const active = activeDataManagementDelete;
  if (!active) return;
  for (const key of normalizeDeleteKeys(keys)) active.keyIds.add(deleteKeyId(key.store, key.itemKey));
}

function emitSyncActivityChanged(): void {
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_ACTIVITY_EVENT, {
    detail: { active: isRemoteSyncActive() },
  }));
}

export function isRemoteSyncActive(): boolean {
  return activeSyncOperationCount > 0;
}

async function withRemoteSyncActivity<T>(run: () => Promise<T>): Promise<T> {
  activeSyncOperationCount += 1;
  if (activeSyncOperationCount === 1) emitSyncActivityChanged();
  try {
    return await run();
  } finally {
    activeSyncOperationCount = Math.max(0, activeSyncOperationCount - 1);
    if (activeSyncOperationCount === 0) emitSyncActivityChanged();
  }
}

function specForPersistenceOperation(operation: RemoteSyncPersistenceOperation): IdbStoreSpec | undefined {
  const directStore = IDB_SPECS_BY_STORE.get(operation.storeName as RemoteSyncStoreName);
  if (directStore && directStore.dbName === operation.dbName) return directStore;
  return IDB_STORE_SPECS.find(spec => spec.dbName === operation.dbName && spec.objectStore === operation.storeName);
}

function scheduleRemoteSyncFlush(delayMs = FLUSH_DEBOUNCE_MS): void {
  if (!hasRemoteSyncToken()) return;
  if (isRemoteSyncFullPullRequired()) return;
  if (activeDataManagementDelete) return;
  if (flushDebounceTimer !== null) window.clearTimeout(flushDebounceTimer);
  flushDebounceTimer = window.setTimeout(() => {
    flushDebounceTimer = null;
    void flushRemoteSyncOutbox();
  }, delayMs);
}

function itemUpdatedAtKey(store: RemoteSyncStoreName, itemKey: string): string {
  return `${ITEM_UPDATED_AT_PREFIX}${store}.${itemKey}`;
}

function itemDeletedAtKey(store: RemoteSyncStoreName, itemKey: string): string {
  return `${ITEM_DELETED_AT_PREFIX}${store}.${itemKey}`;
}

function localStorageValueChars(key: string): number {
  try {
    return localStorage.getItem(key)?.length ?? 0;
  } catch {
    return 0;
  }
}

function localStorageKeyCount(): number {
  try {
    return localStorage.length;
  } catch {
    return 0;
  }
}

function storageErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'StorageError';
}

function legacyStorageFailureCounts(key: string, value: string): Record<string, number> {
  return {
    localStorageKeys: localStorageKeyCount(),
    storageKeyChars: key.length,
    valueChars: value.length,
    legacyOutboxChars: localStorageValueChars(OUTBOX_KEY),
  };
}

function recordLegacySyncStorageFailure(label: string, key: string, value: string, error: unknown): void {
  recordRemoteSyncLog(
    'flush',
    'error',
    `Legacy RemoteSync ${label} localStorage update failed (${storageErrorName(error)}); durable CAS outbox remains authoritative.`,
    legacyStorageFailureCounts(key, value),
  );
}

function setLegacySyncStorageItem(key: string, value: string, label: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    recordLegacySyncStorageFailure(label, key, value, error);
  }
}

function removeLegacySyncStorageItem(key: string, label: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    recordLegacySyncStorageFailure(label, key, '', error);
  }
}

function rememberedItemUpdatedAt(store: RemoteSyncStoreName, itemKey: string): number {
  const raw = localStorage.getItem(itemUpdatedAtKey(store, itemKey));
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

function rememberedItemDeletedAt(store: RemoteSyncStoreName, itemKey: string): number {
  const raw = localStorage.getItem(itemDeletedAtKey(store, itemKey));
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

function rememberItemUpdatedAt(store: RemoteSyncStoreName, itemKey: string, updatedAt: number): void {
  setLegacySyncStorageItem(
    itemUpdatedAtKey(store, itemKey),
    String(Math.max(0, Math.floor(updatedAt))),
    'item updated-at marker',
  );
}

function rememberItemDeletedAt(store: RemoteSyncStoreName, itemKey: string, updatedAt: number): void {
  const value = String(Math.max(0, Math.floor(updatedAt)));
  setLegacySyncStorageItem(itemDeletedAtKey(store, itemKey), value, 'item deleted-at marker');
  setLegacySyncStorageItem(itemUpdatedAtKey(store, itemKey), value, 'item updated-at marker');
}

function clearItemDeletedAt(store: RemoteSyncStoreName, itemKey: string): void {
  removeLegacySyncStorageItem(itemDeletedAtKey(store, itemKey), 'item deleted-at marker');
}

function pendingOutboxItem(store: RemoteSyncStoreName, itemKey: string): RemoteSyncItem | undefined {
  return readOutbox().find(item => item.store === store && item.itemKey === itemKey);
}

function localVersionForItem(spec: IdbStoreSpec, itemKey: string, existing: unknown | undefined): number {
  return Math.max(
    existing === undefined ? 0 : spec.updatedAt(existing),
    rememberedItemUpdatedAt(spec.store, itemKey),
    rememberedItemDeletedAt(spec.store, itemKey),
    pendingOutboxItem(spec.store, itemKey)?.updatedAt ?? 0,
  );
}

function pendingDeleteUpdatedAt(store: RemoteSyncStoreName, itemKey: string): number {
  const pending = pendingOutboxItem(store, itemKey);
  return pending && isDeletedItem(pending) ? pending.updatedAt : 0;
}

function shouldSuppressLocalSnapshotItem(
  store: RemoteSyncStoreName,
  itemKey: string,
  payloadUpdatedAt: number,
): boolean {
  if (isActiveDataManagementDeleteKey(store, itemKey)) return true;
  const deletedAt = Math.max(
    rememberedItemDeletedAt(store, itemKey),
    pendingDeleteUpdatedAt(store, itemKey),
  );
  return deletedAt > 0 && payloadUpdatedAt <= deletedAt;
}

export function shouldSuppressRemoteSyncUpsert(
  store: RemoteSyncStoreName,
  itemKey: string,
  updatedAt: number,
): boolean {
  if (isActiveDataManagementDeleteKey(store, itemKey)) return true;
  const deletedAt = rememberedItemDeletedAt(store, itemKey);
  return deletedAt > 0 && updatedAt <= deletedAt;
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
): void {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function ensureStore(
  db: IDBDatabase,
  event: IDBVersionChangeEvent,
  name: string,
  options?: IDBObjectStoreParameters,
): IDBObjectStore {
  if (!db.objectStoreNames.contains(name)) return db.createObjectStore(name, options);
  const tx = (event.target as IDBOpenDBRequest).transaction;
  if (!tx) throw new Error(`IndexedDB upgrade transaction missing for ${name}.`);
  return tx.objectStore(name);
}

function upgradePuzzleDb(db: IDBDatabase, event: IDBVersionChangeEvent): void {
  const definitions = ensureStore(db, event, 'definitions', { keyPath: 'id' });
  ensureIndex(definitions, 'sourceKind', 'sourceKind', { unique: false });
  ensureIndex(definitions, 'createdAt', 'createdAt', { unique: false });

  const attempts = ensureStore(db, event, 'attempts', { autoIncrement: true });
  ensureIndex(attempts, 'puzzleId', 'puzzleId', { unique: false });
  ensureIndex(attempts, 'completedAt', 'completedAt', { unique: false });

  ensureStore(db, event, 'user-meta', { keyPath: 'puzzleId' });
  ensureStore(db, event, 'user-perf');

  const history = ensureStore(db, event, 'rating-history', { autoIncrement: true });
  ensureIndex(history, 'timestamp', 'timestamp', { unique: false });
}

function upgradeOpeningsDb(db: IDBDatabase, event: IDBVersionChangeEvent): void {
  ensureStore(db, event, 'collections', { keyPath: 'id' });
  ensureStore(db, event, 'session');
  ensureStore(db, event, 'training-variations', { keyPath: 'id' });
}

function upgradeForDb(name: string): ((db: IDBDatabase, event: IDBVersionChangeEvent) => void) | undefined {
  if (name === MAIN_DB_NAME) return upgradeGameDbSchema;
  if (name === PUZZLE_DB_NAME) return upgradePuzzleDb;
  if (name === 'patzer-openings') return upgradeOpeningsDb;
  return undefined;
}

function openIdb(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = event => {
      upgradeForDb(name)?.(req.result, event);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function groupSyncedStoresByDb(): Map<string, { dbName: string; dbVersion: number; stores: Set<string> }> {
  const groups = new Map<string, { dbName: string; dbVersion: number; stores: Set<string> }>();
  for (const spec of IDB_STORE_SPECS) {
    const key = `${spec.dbName}::${spec.dbVersion}`;
    const group = groups.get(key) ?? { dbName: spec.dbName, dbVersion: spec.dbVersion, stores: new Set<string>() };
    group.stores.add(spec.objectStore);
    if (spec.store === 'games') group.stores.add('game-library');
    groups.set(key, group);
  }
  return groups;
}

function clearStores(db: IDBDatabase, storeNames: string[]): Promise<void> {
  const existing = storeNames.filter(storeName => db.objectStoreNames.contains(storeName));
  if (existing.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(existing, 'readwrite');
    for (const storeName of existing) tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function clearLocalSyncedIdbStores(): Promise<void> {
  for (const group of groupSyncedStoresByDb().values()) {
    const db = await openIdb(group.dbName, group.dbVersion);
    try {
      await clearStores(db, [...group.stores]);
    } finally {
      db.close();
    }
  }
}

function clearLocalSyncedSettings(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isAllowedSettingKey(key)) keysToRemove.push(key);
  }
  withSettingsRemoteApplySuppressed(() => {
    for (const key of keysToRemove) localStorage.removeItem(key);
  });
}

async function clearLocalSyncedDataForRestore(): Promise<void> {
  await clearLocalSyncedIdbStores();
  clearLocalSyncedSettings();
  clearRemoteSyncMarkers({ clearOutbox: true });
}

function readAllFromStore(db: IDBDatabase, storeName: string): Promise<IdbRecord[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve([]);
    const results: IdbRecord[] = [];
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).openCursor();
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) {
        resolve(results);
        return;
      }
      results.push({ primaryKey: cursor.primaryKey, value: cursor.value });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

function readRecordByItemKey(db: IDBDatabase, spec: IdbStoreSpec, itemKey: string): Promise<unknown | undefined> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(spec.objectStore)) return resolve(undefined);
    const tx = db.transaction(spec.objectStore, 'readonly');
    const store = tx.objectStore(spec.objectStore);
    if (spec.keyMode === 'keyPath' || spec.keyMode === 'explicit') {
      const req = store.get(itemKey);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      return;
    }
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) {
        resolve(undefined);
        return;
      }
      if (spec.keyForRecord(cursor.value, cursor.primaryKey) === itemKey) {
        resolve(cursor.value);
        return;
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

function deleteRecordByItemKey(db: IDBDatabase, spec: IdbStoreSpec, itemKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(spec.objectStore)) return resolve();
    const tx = db.transaction(spec.objectStore, 'readwrite');
    const store = tx.objectStore(spec.objectStore);
    if (spec.keyMode === 'keyPath' || spec.keyMode === 'explicit') {
      store.delete(itemKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      return;
    }
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) return;
      if (spec.keyForRecord(cursor.value, cursor.primaryKey) === itemKey) cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function deleteLegacyImportedGameById(db: IDBDatabase, gameId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('game-library')) return resolve();
    const tx = db.transaction('game-library', 'readwrite');
    const store = tx.objectStore('game-library');
    const gamesReq = store.get('imported-games');
    const navReq = store.get('imported-nav');

    gamesReq.onsuccess = () => {
      const value = gamesReq.result as { games?: unknown[] } | undefined;
      const games = Array.isArray(value?.games) ? value.games : [];
      if (games.length === 0) return;
      const next = games.filter(game => objectValue(game)?.id !== gameId);
      if (next.length === games.length) return;
      if (next.length === 0) store.delete('imported-games');
      else store.put({ ...(value ?? {}), games: next }, 'imported-games');
    };
    gamesReq.onerror = () => reject(gamesReq.error);

    navReq.onsuccess = () => {
      const nav = objectValue(navReq.result);
      if (nav?.selectedId === gameId) store.delete('imported-nav');
    };
    navReq.onerror = () => reject(navReq.error);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function writeRecordByItemKey(db: IDBDatabase, spec: IdbStoreSpec, itemKey: string, payload: unknown): Promise<void> {
  if (spec.keyMode !== 'explicit') {
    const payloadKey = spec.keyForRecord(payload);
    if (!payloadKey || payloadKey !== itemKey) {
      throw new Error(`Remote sync payload key mismatch for ${spec.store}.`);
    }
  }

  await new Promise<void>((resolve, reject) => {
    if (!db.objectStoreNames.contains(spec.objectStore)) return resolve();
    const tx = db.transaction(spec.objectStore, 'readwrite');
    const store = tx.objectStore(spec.objectStore);
    if (spec.keyMode === 'explicit') {
      store.put(payload, itemKey);
    } else if (spec.keyMode === 'keyPath') {
      store.put(payload);
    } else {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) {
          store.add(payload);
          return;
        }
        if (spec.keyForRecord(cursor.value, cursor.primaryKey) === itemKey) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
  return key === TOKEN_KEY
    || key === LAST_SYNC_KEY
    || key === OUTBOX_KEY
    || key.startsWith(ITEM_UPDATED_AT_PREFIX)
    || key.startsWith(SETTING_UPDATED_AT_PREFIX)
    || key === 'lastSyncedAt'
    || key === 'patzer.lichess.clientAuth'
    || key === 'patzer.lichess.oauthPending'
    || key === 'patzer.lichess.bookOAuthPending'
    || key === 'patzer.lichess.bookOAuthCallback'
    || key.startsWith('chesspatzer.remoteSync.');
}

function isAllowedSettingKey(key: string): boolean {
  if (isForbiddenSettingKey(key)) return false;
  return SETTINGS_KEYS.has(key) || SETTINGS_PREFIXES.some(prefix => key.startsWith(prefix));
}

function readLocalSettingsItems(): RemoteSyncItem[] {
  const items: RemoteSyncItem[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isAllowedSettingKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    let updatedAt = settingUpdatedAt(key);
    if (updatedAt <= 0) {
      updatedAt = Date.now();
      setSettingUpdatedAt(key, updatedAt);
    }
    if (shouldSuppressLocalSnapshotItem('settings', key, updatedAt)) continue;
    items.push({
      store: 'settings',
      itemKey: key,
      updatedAt,
      payload: { key, value },
    });
  }
  return items;
}

export function readRemoteSyncLocalSettingsItemsForTest(): RemoteSyncItem[] {
  return readLocalSettingsItems();
}

export function readRemoteSyncLocalSnapshotItemForTest(
  store: RemoteSyncStoreName,
  itemKey: string,
  payload: unknown,
  payloadUpdatedAt: number,
): RemoteSyncItem | null {
  if (shouldSuppressLocalSnapshotItem(store, itemKey, payloadUpdatedAt)) return null;
  return {
    store,
    itemKey,
    payload,
    updatedAt: Math.max(payloadUpdatedAt, rememberedItemUpdatedAt(store, itemKey)),
    operation: 'upsert',
  };
}

function payloadSettingValue(payload: unknown, fallbackKey: string): string | undefined {
  if (typeof payload === 'string') return payload;
  const obj = objectValue(payload);
  if (!obj) return undefined;
  const key = obj.key;
  const value = obj.value;
  if (typeof key === 'string' && key !== fallbackKey) return undefined;
  return typeof value === 'string' ? value : undefined;
}

// Pull/apply skip classification contract: benign reasons are deterministic local-policy no-ops
// (re-pulling the row can never change the outcome), so they must not block cursor/version
// metadata advancement. Unsafe reasons mean the row was not represented locally, so they land in
// the blocking `skipped` count and keep full-pull-required set. Any new skip path defaults to
// blocking unless it is explicitly listed as benign here.
type RemoteSyncApplySkipReason =
  | 'stale-remote'
  | 'suppressed-upsert'
  | 'disallowed-setting'
  | 'unknown-store'
  | 'missing-payload'
  | 'merge-failed'
  | 'invalid-payload';

interface RemoteSyncSkippedApplyResult {
  skipped: RemoteSyncApplySkipReason;
}

const BENIGN_SKIP_COUNT_KEYS: Partial<Record<RemoteSyncApplySkipReason, string>> = {
  'stale-remote': 'skippedStaleRemote',
  'suppressed-upsert': 'skippedSuppressedUpsert',
  'disallowed-setting': 'skippedDisallowedSetting',
};

const UNSAFE_SKIP_DETAIL_COUNT_KEYS: Partial<Record<RemoteSyncApplySkipReason, string>> = {
  'unknown-store': 'skippedUnknownStore',
  'missing-payload': 'skippedMissingPayload',
  'merge-failed': 'skippedMergeFailed',
  'invalid-payload': 'skippedInvalidPayload',
};

function countSkippedApplyResult(counts: Record<string, number>, reason: RemoteSyncApplySkipReason): void {
  const benignKey = BENIGN_SKIP_COUNT_KEYS[reason];
  if (benignKey) {
    counts[benignKey] = (counts[benignKey] ?? 0) + 1;
    return;
  }
  counts.skipped = (counts.skipped ?? 0) + 1;
  const detailKey = UNSAFE_SKIP_DETAIL_COUNT_KEYS[reason];
  if (detailKey) counts[detailKey] = (counts[detailKey] ?? 0) + 1;
}

function applySettingItem(item: RemoteSyncItem): 'applied' | RemoteSyncSkippedApplyResult {
  if (!isAllowedSettingKey(item.itemKey)) return { skipped: 'disallowed-setting' };
  if (item.updatedAt < settingUpdatedAt(item.itemKey)) return { skipped: 'stale-remote' };
  if (!isDeletedItem(item) && shouldSuppressRemoteSyncUpsert('settings', item.itemKey, item.updatedAt)) return { skipped: 'suppressed-upsert' };
  if (isDeletedItem(item)) {
    withSettingsRemoteApplySuppressed(() => {
      localStorage.removeItem(item.itemKey);
      setSettingUpdatedAt(item.itemKey, item.updatedAt);
      rememberItemDeletedAt('settings', item.itemKey, item.updatedAt);
    });
    return 'applied';
  }
  const value = payloadSettingValue(item.payload, item.itemKey);
  if (value === undefined) return { skipped: 'invalid-payload' };
  withSettingsRemoteApplySuppressed(() => {
    localStorage.setItem(item.itemKey, value);
    setSettingUpdatedAt(item.itemKey, item.updatedAt);
    clearItemDeletedAt('settings', item.itemKey);
  });
  return 'applied';
}

function installSettingsObserver(): void {
  if (settingsObserverInstalled) return;
  settingsObserverInstalled = true;

  const proto = Storage.prototype;
  const originalSetItem = proto.setItem;
  const originalRemoveItem = proto.removeItem;

  proto.setItem = function setItem(key: string, value: string): void {
    originalSetItem.call(this, key, value);
    if (applyingRemoteSync || isSettingsRemoteApplySuppressed() || this !== localStorage || !isAllowedSettingKey(key)) return;
    const updatedAt = Date.now();
    originalSetItem.call(this, settingUpdatedAtKey(key), String(updatedAt));
    enqueueRemoteSyncUpsert('settings', key, { key, value }, updatedAt);
  };

  proto.removeItem = function removeItem(key: string): void {
    originalRemoveItem.call(this, key);
    if (applyingRemoteSync || isSettingsRemoteApplySuppressed() || this !== localStorage || !isAllowedSettingKey(key)) return;
    const updatedAt = Date.now();
    originalSetItem.call(this, settingUpdatedAtKey(key), String(updatedAt));
    enqueueRemoteSyncDelete('settings', key, updatedAt);
  };
}

function storedToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function getRemoteSyncToken(): string {
  return storedToken();
}

export function hasRemoteSyncToken(): boolean {
  return storedToken().trim().length > 0;
}

export function setRemoteSyncToken(token: string): void {
  const value = token.trim();
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearRemoteSyncToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function runVisibleAutoPull(): void {
  if (!hasRemoteSyncToken()) return;
  if (document.visibilityState !== 'visible') return;
  if (autoPullInFlight) return;
  if (activeDataManagementDelete) return;
  markRemoteSyncCloudStateStale();
  autoPullInFlight = true;
  void pullFromRemoteSync({
    flushAfter: !isRemoteSyncFullPullRequired(),
    logNoop: false,
  }).finally(() => {
    autoPullInFlight = false;
  });
}

export function startRemoteSyncAutoSync(options: { pushAfterHydrate?: boolean } = {}): void {
  if (autoSyncStarted) return;
  autoSyncStarted = true;
  const generation = syncGeneration;
  const pushAfterHydrate = options.pushAfterHydrate ?? true;
  installSettingsObserver();

  visibilityFlushHandler = () => {
    runVisibleAutoPull();
  };
  window.addEventListener('visibilitychange', visibilityFlushHandler);
  pageShowSyncHandler = () => runVisibleAutoPull();
  focusSyncHandler = () => runVisibleAutoPull();
  onlineSyncHandler = () => runVisibleAutoPull();
  window.addEventListener('pageshow', pageShowSyncHandler);
  window.addEventListener('focus', focusSyncHandler);
  window.addEventListener('online', onlineSyncHandler);

  flushIntervalTimer = window.setInterval(() => {
    void flushRemoteSyncOutbox();
  }, FLUSH_INTERVAL_MS);
  remotePollIntervalTimer = window.setInterval(() => {
    runVisibleAutoPull();
  }, REMOTE_POLL_INTERVAL_MS);

  void withRemoteSyncActivity(async () => {
    await hydrateFromRemoteSync();
    const shouldPush = pushAfterHydrate && !skipNextStartupPush && !isRemoteSyncFullPullRequired();
    skipNextStartupPush = false;
    if (shouldPush && syncGeneration === generation && hasRemoteSyncToken()) return pushToRemoteSync({ skipFreshPull: true });
    return { success: true, counts: {} };
  })
    .catch(error => console.warn('[remote-sync] Startup hydrate failed', error));
}

export function stopRemoteSyncAutoSync(): void {
  syncGeneration++;
  autoSyncStarted = false;
  if (flushDebounceTimer !== null) {
    window.clearTimeout(flushDebounceTimer);
    flushDebounceTimer = null;
  }
  if (flushIntervalTimer !== null) {
    window.clearInterval(flushIntervalTimer);
    flushIntervalTimer = null;
  }
  if (remotePollIntervalTimer !== null) {
    window.clearInterval(remotePollIntervalTimer);
    remotePollIntervalTimer = null;
  }
  if (visibilityFlushHandler) {
    window.removeEventListener('visibilitychange', visibilityFlushHandler);
    visibilityFlushHandler = null;
  }
  if (pageShowSyncHandler) {
    window.removeEventListener('pageshow', pageShowSyncHandler);
    pageShowSyncHandler = null;
  }
  if (focusSyncHandler) {
    window.removeEventListener('focus', focusSyncHandler);
    focusSyncHandler = null;
  }
  if (onlineSyncHandler) {
    window.removeEventListener('online', onlineSyncHandler);
    onlineSyncHandler = null;
  }
  autoPullInFlight = false;
}

export function logoutRemoteSync(): void {
  clearRemoteSyncToken();
  stopRemoteSyncAutoSync();
  recordRemoteSyncLog('logout', 'info', 'Token session cleared for this browser.');
}

function clearRemoteSyncMarkers(options: { clearOutbox?: boolean; clearGeneration?: boolean; clearFullPull?: boolean } = {}): void {
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem(LAST_CHECK_KEY);
  if (options.clearOutbox) localStorage.removeItem(OUTBOX_KEY);
  if (options.clearGeneration) clearServerGeneration();
  if (options.clearFullPull) clearRemoteSyncFullPullRequirement();
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith(ITEM_UPDATED_AT_PREFIX)
      || key.startsWith(ITEM_DELETED_AT_PREFIX)
      || key.startsWith(SETTING_UPDATED_AT_PREFIX)
    ) keysToRemove.push(key);
  }
  for (const key of keysToRemove) localStorage.removeItem(key);
}

export function clearRemoteSyncLocalSyncState(): void {
  logoutRemoteSync();
  clearRemoteSyncMarkers({ clearOutbox: true, clearGeneration: true, clearFullPull: true });
}

export function getRemoteSyncLastSyncedAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

export function getRemoteSyncLastCheckedAt(): string | null {
  return localStorage.getItem(LAST_CHECK_KEY);
}

function setRemoteSyncLastSyncedAt(updatedAt?: number): void {
  const time = updatedAt && updatedAt > 0 ? updatedAt : Date.now();
  localStorage.setItem(LAST_SYNC_KEY, new Date(time).toISOString());
}

function setRemoteSyncLastCheckedAt(checkedAt = Date.now()): void {
  localStorage.setItem(LAST_CHECK_KEY, new Date(checkedAt).toISOString());
  emitSyncLogChanged();
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Remote sync API returned ${res.headers.get('content-type') || 'non-JSON'} instead of JSON.`);
  }
}

function handleStaleSession(body: ApiErrorBody): never {
  rememberServerGeneration(body.syncGeneration, body.generationReason);
  stopRemoteSyncAutoSync();
  clearRemoteSyncToken();
  clearRemoteSyncMarkers();
  requireRemoteSyncFullPull();
  const error = new RemoteSyncStaleSessionError(body);
  recordRemoteSyncLog('system', 'error', error.message, body.syncGeneration ? { syncGeneration: body.syncGeneration } : undefined);
  throw error;
}







// Derive a short stable label from a PHP endpoint path, e.g. "push.php?since=…" → "push".
function endpointClass(path: string): string {
  const base = path.split('?')[0] ?? path;
  return base.replace(/\.php$/i, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'unknown';
}

// Classify the payload shape without including any payload data.
// Derived entirely from the endpoint name; never reads request body content.
function payloadClassForEndpoint(endpoint: string): string {
  switch (endpoint) {
    case 'push': return 'items-batch';
    case 'pull': return 'pull-query';
    case 'status': return 'status-check';
    case 'export': return 'backup-export';
    case 'restore-start': return 'restore-start';
    case 'restore-chunk': return 'restore-chunk';
    case 'restore-commit': return 'restore-commit';
    case 'data-management-delete': return 'delete-tombstones';
    case 'invalidate': return 'invalidate-sessions';
    default: return endpoint;
  }
}

interface SyncFailureDiagnostic {
  endpointClass: string;
  payloadClass: string;
  httpStatus: number;
  latencyMs: number;
  retryCount: number;
  errorMessage: string;
}

function logSyncFailure(diagnostic: SyncFailureDiagnostic): void {
  console.warn('[remote-sync] fetch failure', diagnostic);
}

async function remoteSyncFetch<T>(path: string, init: RequestInit = {}, tokenOverride?: string, retryCount = 0): Promise<T> {
  const token = (tokenOverride ?? storedToken()).trim();
  if (!token) throw new Error('Enter the admin sync token first.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const generation = storedServerGeneration();
  if (generation !== undefined) headers.set('X-Patzer-Sync-Generation', String(generation));

  const fetchStart = Date.now();
  const res = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const latencyMs = Date.now() - fetchStart;

  const body = await readJsonResponse<ApiErrorBody & T>(res);
  rememberServerGeneration(body.syncGeneration, body.generationReason);
  rememberServerIdentity(body.authIdentity, body.userKey);
  rememberObservedServerLatestVersion((body as { latestVersion?: unknown }).latestVersion);
  if (!res.ok) {
    const ep = endpointClass(path);
    logSyncFailure({
      endpointClass: ep,
      payloadClass: payloadClassForEndpoint(ep),
      httpStatus: res.status,
      latencyMs,
      retryCount,
      errorMessage: body.error || `Remote sync API failed: ${res.status}`,
    });
    if (body.code === 'stale-session') handleStaleSession(body);
    throw new Error(body.error || `Remote sync API failed: ${res.status}`);
  }
  return body as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return remoteSyncFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function ensureServerGenerationLoaded(): Promise<void> {
  if (storedServerGeneration() !== undefined) return;
  const status = await remoteSyncFetch<StatusResponse>('status.php');
  if (!status.ok) throw new Error(status.error || 'Remote sync status failed.');
}

function isDeletedItem(item: Pick<RemoteSyncItem, 'deleted' | 'operation'>): boolean {
  return item.deleted === true || item.operation === 'delete';
}

function normalizeSyncItem(
  item: unknown,
  options: { logInvalid?: boolean; requireUpdatedAt?: boolean; logAction?: RemoteSyncLogAction } = {},
): RemoteSyncItem | null {
  const migrated = migrateRemoteSyncItem(item, {
    ...(options.requireUpdatedAt !== undefined ? { requireUpdatedAt: options.requireUpdatedAt } : {}),
  });
  if (migrated.ok) return migrated.item;

  if (options.logInvalid) {
    const target = [migrated.store, migrated.itemKey].filter(Boolean).join('/') || 'unknown item';
    recordRemoteSyncLog(options.logAction ?? 'pull', 'error', `Skipped ${target}: ${migrated.reason}`);
  }
  return null;
}

function numericField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

function computeBackupCounts(items: RemoteSyncItem[]): BackupCounts {
  const counts: BackupCounts = { items: 0, tombstones: 0, stores: {} };
  for (const item of items) {
    const deleted = isDeletedItem(item);
    counts.items++;
    if (deleted) counts.tombstones++;
    counts.stores[item.store] ??= { items: 0, tombstones: 0 };
    counts.stores[item.store]!.items++;
    if (deleted) counts.stores[item.store]!.tombstones++;
  }
  return counts;
}

function declaredBackupCounts(raw: unknown): BackupCounts {
  const obj = objectValue(raw);
  if (!obj) throw new Error('Backup counts are missing.');
  const items = numericField(obj.items);
  const tombstones = numericField(obj.tombstones);
  const storesObj = objectValue(obj.stores);
  if (items === undefined || tombstones === undefined || !storesObj) {
    throw new Error('Backup counts must include items, tombstones, and stores.');
  }
  const stores: BackupCounts['stores'] = {};
  for (const [store, value] of Object.entries(storesObj)) {
    if (!REMOTE_SYNC_STORE_NAMES.includes(store as RemoteSyncStoreName)) {
      throw new Error(`Backup counts include unsupported store ${store}.`);
    }
    const summary = objectValue(value);
    const storeItems = numericField(summary?.items);
    const storeTombstones = numericField(summary?.tombstones);
    if (storeItems === undefined || storeTombstones === undefined) {
      throw new Error(`Backup counts for ${store} are malformed.`);
    }
    stores[store] = { items: storeItems, tombstones: storeTombstones };
  }
  return { items, tombstones, stores };
}

function assertBackupCountsMatch(declared: BackupCounts, computed: BackupCounts): void {
  if (declared.items !== computed.items || declared.tombstones !== computed.tombstones) {
    throw new Error('Backup item counts do not match the item list.');
  }
  const stores = new Set([...Object.keys(declared.stores), ...Object.keys(computed.stores)]);
  for (const store of stores) {
    const expected = declared.stores[store] ?? { items: 0, tombstones: 0 };
    const actual = computed.stores[store] ?? { items: 0, tombstones: 0 };
    if (expected.items !== actual.items || expected.tombstones !== actual.tombstones) {
      throw new Error(`Backup counts do not match item list for ${store}.`);
    }
  }
}

function normalizeBackupBundle(raw: unknown, fileName: string): {
  exportedAt: string;
  userKey?: string;
  syncGeneration: number;
  generationReason?: string;
  items: RemoteSyncItem[];
  counts: BackupCounts;
  warnings: string[];
} {
  const bundle = objectValue(raw) as RawBackupBundle | null;
  if (!bundle) throw new Error('Backup file must contain a JSON object.');
  if (bundle.format !== BACKUP_FORMAT) throw new Error('Backup file is not a Patzer sync backup.');
  if (bundle.version !== 1) throw new Error('Backup version is not supported.');
  if (typeof bundle.exportedAt !== 'string' || !Number.isFinite(new Date(bundle.exportedAt).getTime())) {
    throw new Error('Backup is missing a valid exportedAt timestamp.');
  }
  if (!Array.isArray(bundle.items)) throw new Error('Backup file is missing the items array.');

  const items: RemoteSyncItem[] = [];
  for (const rawItem of bundle.items) {
    const item = normalizeSyncItem(rawItem, { requireUpdatedAt: true });
    if (!item) throw new Error('Backup contains an invalid sync item.');
    if (item.updatedAt <= 0) throw new Error(`Backup item ${item.store}/${item.itemKey} has an invalid updatedAt.`);
    items.push(item);
  }

  const computed = computeBackupCounts(items);
  const declared = declaredBackupCounts(bundle.counts);
  assertBackupCountsMatch(declared, computed);
  const syncGeneration = typeof bundle.syncGeneration === 'number' && Number.isFinite(bundle.syncGeneration)
    ? Math.max(1, Math.floor(bundle.syncGeneration))
    : 1;
  const warnings: string[] = [];
  if ((bundle.skippedMalformedJson ?? 0) > 0) {
    warnings.push(`${bundle.skippedMalformedJson} malformed row${bundle.skippedMalformedJson === 1 ? '' : 's'} were skipped during export.`);
  }
  if ((bundle.repairedInvalidUpdatedAt ?? 0) > 0) {
    warnings.push(`${bundle.repairedInvalidUpdatedAt} row${bundle.repairedInvalidUpdatedAt === 1 ? '' : 's'} with invalid updatedAt were repaired during export.`);
  }
  if (fileName.toLowerCase().endsWith('.json') === false) warnings.push('Backup file does not use a .json extension.');

  return {
    exportedAt: bundle.exportedAt,
    ...(typeof bundle.userKey === 'string' && bundle.userKey.trim() ? { userKey: bundle.userKey } : {}),
    syncGeneration,
    ...(typeof bundle.generationReason === 'string' && bundle.generationReason.trim() ? { generationReason: bundle.generationReason } : {}),
    items,
    counts: computed,
    warnings,
  };
}

function payloadJsonForHash(item: RemoteSyncItem): string {
  if (isDeletedItem(item)) return '';
  const json = JSON.stringify(item.payload);
  if (typeof json !== 'string') throw new Error(`Backup item ${item.store}/${item.itemKey} payload cannot be encoded.`);
  return json;
}

async function hashBackupItems(items: RemoteSyncItem[]): Promise<string> {
  const sorted = [...items].sort((a, b) => a.store.localeCompare(b.store) || a.itemKey.localeCompare(b.itemKey));
  const lines = sorted.map(item => [
    item.store,
    item.itemKey,
    String(Math.max(0, Math.floor(item.updatedAt))),
    isDeletedItem(item) ? '1' : '0',
    payloadJsonForHash(item),
  ].join('\0')).join('\n') + (sorted.length > 0 ? '\n' : '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function statusForBackupPreview(): Promise<StatusResponse> {
  const status = await remoteSyncFetch<StatusResponse>('status.php');
  if (!status.ok) throw new Error(status.error || 'Remote sync status failed.');
  return status;
}

export async function previewRemoteSyncBackupFile(file: File): Promise<RemoteSyncBackupPreview> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  const normalized = normalizeBackupBundle(parsed, file.name);
  const [hash, status] = await Promise.all([
    hashBackupItems(normalized.items),
    statusForBackupPreview(),
  ]);
  const currentSyncGeneration = status.syncGeneration ?? storedServerGeneration() ?? 1;
  return {
    fileName: file.name,
    ...normalized,
    hash,
    currentSyncGeneration,
    expectedSyncGeneration: currentSyncGeneration + 1,
  };
}

function readOutboxSnapshot(options: { logInvalid?: boolean } = {}): OutboxSnapshot {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return { valid: [], preservedInvalid: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { valid: [], preservedInvalid: [] };
    const snapshot: OutboxSnapshot = { valid: [], preservedInvalid: [] };
    for (const item of parsed) {
      const normalized = normalizeSyncItem(item, {
        ...(options.logInvalid !== undefined ? { logInvalid: options.logInvalid } : {}),
        logAction: 'system',
      });
      if (normalized) snapshot.valid.push(normalized);
      else snapshot.preservedInvalid.push(item);
    }
    return snapshot;
  } catch {
    return { valid: [], preservedInvalid: [] };
  }
}

function readOutbox(): RemoteSyncItem[] {
  return readOutboxSnapshot().valid;
}

function writeOutboxSnapshot(items: RemoteSyncItem[], preservedInvalid: unknown[] = []): void {
  const next = [...preservedInvalid, ...items];
  if (next.length === 0) {
    removeLegacySyncStorageItem(OUTBOX_KEY, 'outbox snapshot');
    return;
  }
  setLegacySyncStorageItem(OUTBOX_KEY, JSON.stringify(next), 'outbox snapshot');
}

function writeOutbox(items: RemoteSyncItem[]): void {
  writeOutboxSnapshot(items);
}

function casClientId(): string {
  const existing = localStorage.getItem(CAS_CLIENT_ID_KEY)?.trim();
  if (existing) return existing;
  const value = `cas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(CAS_CLIENT_ID_KEY, value);
  return value;
}

function queuePendingVersionedOutboxWrite(promise: Promise<void>): void {
  pendingVersionedOutboxEnqueues.push(promise);
  void promise.finally(() => {
    pendingVersionedOutboxEnqueues = pendingVersionedOutboxEnqueues.filter(entry => entry !== promise);
  });
}

async function waitForPendingVersionedOutboxWrites(): Promise<void> {
  while (pendingVersionedOutboxEnqueues.length > 0) {
    const pending = pendingVersionedOutboxEnqueues;
    await Promise.allSettled(pending);
    pendingVersionedOutboxEnqueues = pendingVersionedOutboxEnqueues.filter(entry => !pending.includes(entry));
  }
}

// Last known durable versioned outbox size. Batch enqueues and flush reads keep it current so
// the synchronous queued-count UI can reflect durable-only entries (bulk batches skip the legacy
// localStorage outbox mirror, which cannot hold them). null means unknown — fall back to legacy.
let durableOutboxCountCache: number | null = null;

async function enqueueVersionedOutboxItem(item: RemoteSyncItem): Promise<void> {
  const deleted = isDeletedItem(item);
  const payload = deleted ? undefined : item.payload;
  const baseVersion = getRemoteSyncItemVersion(localStorage, storedServerIdentity(), item.store, item.itemKey);
  await enqueueDurableVersionedOutboxEntry(defaultDurableVersionedOutboxStorage(), {
    store: item.store,
    itemKey: item.itemKey,
    operation: deleted ? 'delete' : 'upsert',
    baseVersion,
    clientUpdatedAt: item.updatedAt,
    ...(deleted ? {} : { payload }),
  });
}

async function enqueueVersionedOutboxItemsBatch(items: readonly RemoteSyncItem[]): Promise<void> {
  if (items.length === 0) return;
  const identity = storedServerIdentity();
  const resolveVersion = createRemoteSyncItemVersionResolver(localStorage, identity);
  const next = await enqueueDurableVersionedOutboxEntries(defaultDurableVersionedOutboxStorage(), items.map(item => {
    const deleted = isDeletedItem(item);
    return {
      store: item.store,
      itemKey: item.itemKey,
      operation: deleted ? 'delete' as const : 'upsert' as const,
      baseVersion: resolveVersion(item.store, item.itemKey),
      clientUpdatedAt: item.updatedAt,
      ...(deleted ? {} : { payload: item.payload }),
    };
  }));
  durableOutboxCountCache = next.length;
}

async function migrateLegacyOutboxToVersioned(): Promise<number> {
  const snapshot = readOutboxSnapshot({ logInvalid: true });
  if (snapshot.valid.length === 0) return 0;
  await Promise.all(snapshot.valid.map(enqueueVersionedOutboxItem));
  writeOutboxSnapshot([], snapshot.preservedInvalid);
  return snapshot.valid.length;
}

function sameOutboxItem(left: RemoteSyncItem, right: RemoteSyncItem): boolean {
  return left.store === right.store
    && left.itemKey === right.itemKey
    && left.updatedAt === right.updatedAt
    && isDeletedItem(left) === isDeletedItem(right)
    && (isDeletedItem(left) || JSON.stringify(left.payload) === JSON.stringify(right.payload));
}

function removeOutboxSnapshotItems(items: RemoteSyncItem[]): void {
  if (items.length === 0) return;
  const current = readOutboxSnapshot({ logInvalid: true });
  const valid = current.valid.filter(item => !items.some(pushed => sameOutboxItem(item, pushed)));
  writeOutboxSnapshot(valid, current.preservedInvalid);
}

function removeOutboxItemsForCommittedDeletes(items: RemoteSyncItem[]): void {
  const tombstones = items
    .filter(isDeletedItem)
    .map(item => ({ ...item, id: deleteKeyId(item.store, item.itemKey) }));
  if (tombstones.length === 0) return;
  const current = readOutboxSnapshot({ logInvalid: true });
  const valid = current.valid.filter(item => {
    const tombstone = tombstones.find(entry => entry.id === deleteKeyId(item.store, item.itemKey));
    return !tombstone || item.updatedAt > tombstone.updatedAt;
  });
  writeOutboxSnapshot(valid, current.preservedInvalid);
}

function mergeOutboxItem(outbox: RemoteSyncItem[], item: RemoteSyncItem): RemoteSyncItem[] {
  const index = outbox.findIndex(existing => existing.store === item.store && existing.itemKey === item.itemKey);
  if (index === -1) return [...outbox, item];
  const existing = outbox[index]!;
  if (existing.updatedAt > item.updatedAt) return outbox;
  const next = outbox.slice();
  next[index] = item;
  return next;
}

export function enqueueRemoteSyncItem(item: RemoteSyncItem): void {
  if (applyingRemoteSync) return;
  const normalized = normalizeSyncItem(item);
  if (!normalized) throw new Error('Invalid Remote sync item.');
  if (!isDeletedItem(normalized)) {
    if (shouldSuppressRemoteSyncUpsert(normalized.store, normalized.itemKey, normalized.updatedAt)) return;
  }
  durableOutboxCountCache = null;
  queuePendingVersionedOutboxWrite(enqueueVersionedOutboxItem(normalized).catch(error => {
    const message = error instanceof Error ? error.message : 'Could not persist versioned RemoteSync outbox entry.';
    recordRemoteSyncLog('flush', 'error', message);
  }));
  if (isDeletedItem(normalized)) rememberItemDeletedAt(normalized.store, normalized.itemKey, normalized.updatedAt);
  else {
    rememberItemUpdatedAt(normalized.store, normalized.itemKey, normalized.updatedAt);
    clearItemDeletedAt(normalized.store, normalized.itemKey);
  }
  const snapshot = readOutboxSnapshot({ logInvalid: true });
  writeOutboxSnapshot(mergeOutboxItem(snapshot.valid, normalized), snapshot.preservedInvalid);
  scheduleRemoteSyncFlush();
}

export function enqueueRemoteSyncOperation(operation: RemoteSyncPersistenceOperation): void {
  if (applyingRemoteSync) return;
  const spec = specForPersistenceOperation(operation);
  if (!spec) {
    console.warn('[remote-sync] Unsupported persistence store for sync', {
      dbName: operation.dbName,
      storeName: operation.storeName,
    });
    return;
  }
  if (operation.operation === 'delete') {
    enqueueRemoteSyncDelete(spec.store, operation.itemKey, operation.updatedAt);
    return;
  }
  if (operation.payload === undefined) {
    console.warn('[remote-sync] Ignoring put operation without payload', {
      store: spec.store,
      itemKey: operation.itemKey,
    });
    return;
  }
  enqueueRemoteSyncUpsert(spec.store, operation.itemKey, operation.payload, operation.updatedAt);
}





export function enqueueRemoteSyncItemsBatch(items: readonly RemoteSyncItem[]): void {
  if (applyingRemoteSync || items.length === 0) return;
  const normalized: RemoteSyncItem[] = [];
  for (const item of items) {
    const entry = normalizeSyncItem(item);
    if (!entry) throw new Error('Invalid Remote sync item.');
    if (!isDeletedItem(entry) && shouldSuppressRemoteSyncUpsert(entry.store, entry.itemKey, entry.updatedAt)) continue;
    normalized.push(entry);
  }
  if (normalized.length === 0) return;
  queuePendingVersionedOutboxWrite(enqueueVersionedOutboxItemsBatch(normalized).catch(error => {
    const message = error instanceof Error ? error.message : 'Could not persist versioned RemoteSync outbox entries.';
    recordRemoteSyncLog('flush', 'error', message);
  }));
  for (const entry of normalized) {
    if (isDeletedItem(entry)) rememberItemDeletedAt(entry.store, entry.itemKey, entry.updatedAt);
    else {
      rememberItemUpdatedAt(entry.store, entry.itemKey, entry.updatedAt);
      clearItemDeletedAt(entry.store, entry.itemKey);
    }
  }
  scheduleRemoteSyncFlush();
}

export function enqueueRemoteSyncUpsert(
  store: RemoteSyncStoreName,
  itemKey: string,
  payload: unknown,
  updatedAt = Date.now(),
): void {
  enqueueRemoteSyncItem({ store, itemKey, payload, updatedAt, operation: 'upsert' });
}

export function enqueueRemoteSyncDelete(
  store: RemoteSyncStoreName,
  itemKey: string,
  updatedAt = Date.now(),
): void {
  enqueueRemoteSyncItem({ store, itemKey, updatedAt, deleted: true, operation: 'delete' });
}

export function getRemoteSyncOutboxCount(): number {
  const snapshot = readOutboxSnapshot();
  const legacyCount = snapshot.valid.length + snapshot.preservedInvalid.length;
  // Single-item enqueues mirror into both queues, so max() avoids double counting while still
  // surfacing durable-only bulk entries that never touch the legacy outbox.
  return Math.max(legacyCount, durableOutboxCountCache ?? 0);
}

export async function queueAndFlushRemoteSyncUpsert(
  store: RemoteSyncStoreName,
  itemKey: string,
  payload: unknown,
  updatedAt = Date.now(),
): Promise<SyncResult> {
  enqueueRemoteSyncUpsert(store, itemKey, payload, updatedAt);
  return flushRemoteSyncOutbox();
}

export async function queueAndFlushRemoteSyncDelete(
  store: RemoteSyncStoreName,
  itemKey: string,
  updatedAt = Date.now(),
): Promise<SyncResult> {
  enqueueRemoteSyncDelete(store, itemKey, updatedAt);
  return flushRemoteSyncOutbox();
}

export async function queueRemoteSyncUpsert(
  store: RemoteSyncStoreName,
  itemKey: string,
  payload: unknown,
  updatedAt = Date.now(),
): Promise<SyncResult> {
  enqueueRemoteSyncUpsert(store, itemKey, payload, updatedAt);
  return hasRemoteSyncToken()
    ? flushRemoteSyncOutbox()
    : { success: true, counts: { queued: getRemoteSyncOutboxCount() } };
}

export async function queueRemoteSyncDelete(
  store: RemoteSyncStoreName,
  itemKey: string,
  updatedAt = Date.now(),
): Promise<SyncResult> {
  enqueueRemoteSyncDelete(store, itemKey, updatedAt);
  return hasRemoteSyncToken()
    ? flushRemoteSyncOutbox()
    : { success: true, counts: { queued: getRemoteSyncOutboxCount() } };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number> | undefined): void {
  for (const [key, value] of Object.entries(source ?? {})) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function applySettingsPullLiveIfNeeded(
  counts: Record<string, number>,
  latestUpdatedAt: number,
  items: readonly unknown[],
): void {
  if ((counts.settings ?? 0) + (counts['settings:deleted'] ?? 0) === 0) return;
  const changedKeys = collectSettingKeysFromSyncItems(items);
  applySettingsLive({
    source: 'remoteSync-pull',
    changedKeys,
    ...(latestUpdatedAt > 0 ? { latestUpdatedAt } : {}),
  });
}

function maxItemUpdatedAt(items: RemoteSyncItem[]): number {
  return maxTimestamp(...items.map(item => item.updatedAt));
}

function maxRawItemUpdatedAt(items: unknown[]): number {
  return maxTimestamp(
    ...items.flatMap(item => {
      const normalized = normalizeSyncItem(item, { requireUpdatedAt: true });
      return normalized ? [normalized.updatedAt] : [];
    }),
  );
}

function backupCountsForResult(counts: BackupCounts): Record<string, number> {
  const result: Record<string, number> = {
    items: counts.items,
    tombstones: counts.tombstones,
  };
  for (const [store, summary] of Object.entries(counts.stores)) {
    result[store] = summary.items;
    if (summary.tombstones > 0) result[`${store}:tombstones`] = summary.tombstones;
  }
  return result;
}

function backupDownloadName(exportedAt: string): string {
  const stamp = new Date(exportedAt).toISOString().replace(/[:.]/g, '-');
  return `patzer-sync-backup-${stamp}.json`;
}

function triggerJsonDownload(fileName: string, payload: unknown): void {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadRemoteSyncBackup(): Promise<SyncResult> {
  try {
    const bundle = await remoteSyncFetch<RawBackupBundle>('export.php');
    if (!bundle.ok) throw new Error(bundle.error || 'RemoteSync backup export failed.');
    const normalized = normalizeBackupBundle(bundle, 'patzer-sync-backup.json');
    triggerJsonDownload(backupDownloadName(normalized.exportedAt), bundle);
    const counts = backupCountsForResult(normalized.counts);
    recordRemoteSyncLog('backup', 'success', 'Token database backup downloaded.', counts);
    return { success: true, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RemoteSync backup export failed.';
    recordRemoteSyncLog('backup', 'error', message);
    return { success: false, error: message };
  }
}

interface RestoreStartResponse {
  ok?: boolean;
  restoreId?: string;
  syncGeneration?: number;
  generationReason?: string;
  error?: string;
}

interface RestoreCommitResponse {
  ok?: boolean;
  items?: number;
  tombstones?: number;
  syncGeneration?: number;
  generationReason?: string;
  error?: string;
}

export async function restoreRemoteSyncBackup(preview: RemoteSyncBackupPreview): Promise<SyncResult> {
  let localCleared = false;
  try {
    await ensureServerGenerationLoaded();
    const start = await postJson<RestoreStartResponse>('restore-start.php', {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: preview.exportedAt,
      userKey: preview.userKey,
      counts: preview.counts,
    });
    if (!start.ok || !start.restoreId) throw new Error(start.error || 'Could not start restore job.');

    for (const batch of chunks(preview.items, RESTORE_CHUNK_SIZE)) {
      const result = await postJson<{ ok?: boolean; error?: string }>('restore-chunk.php', {
        restoreId: start.restoreId,
        items: batch,
      });
      if (!result.ok) throw new Error(result.error || 'Restore chunk failed.');
    }

    const commit = await postJson<RestoreCommitResponse>('restore-commit.php', {
      restoreId: start.restoreId,
      expectedItems: preview.counts.items,
      expectedTombstones: preview.counts.tombstones,
      expectedHash: preview.hash,
    });
    if (!commit.ok) throw new Error(commit.error || 'Restore commit failed.');
    rememberServerGeneration(commit.syncGeneration, commit.generationReason);

    stopRemoteSyncAutoSync();
    await clearLocalSyncedDataForRestore();
    localCleared = true;
    requireRemoteSyncFullPull();
    const pull = await pullFromRemoteSync({ since: null, flushAfter: false });
    if (!pull.success) throw new Error(pull.error || 'Restore committed, but full pull failed.');
    if (hasRemoteSyncToken()) startRemoteSyncAutoSync({ pushAfterHydrate: false });

    const counts = {
      ...backupCountsForResult(preview.counts),
      pulled: Object.values(pull.counts ?? {}).reduce((sum, value) => sum + value, 0),
      syncGeneration: commit.syncGeneration ?? storedServerGeneration() ?? 0,
    };
    recordRemoteSyncLog('restore', 'success', 'Token database restored and full-pulled into this browser.', counts);
    return { success: true, counts };
  } catch (error) {
    if (localCleared) requireRemoteSyncFullPull();
    if (hasRemoteSyncToken() && !autoSyncStarted) startRemoteSyncAutoSync({ pushAfterHydrate: false });
    const message = error instanceof Error ? error.message : 'RemoteSync restore failed.';
    recordRemoteSyncLog('restore', 'error', message);
    return { success: false, error: message };
  }
}

export async function invalidateOtherRemoteSyncBrowsers(): Promise<SyncResult> {
  try {
    await ensureServerGenerationLoaded();
    const result = await postJson<{
      ok?: boolean;
      syncGeneration?: number;
      generationReason?: string;
      error?: string;
    }>('invalidate.php', {});
    if (!result.ok) throw new Error(result.error || 'Could not invalidate other browser sessions.');
    rememberServerGeneration(result.syncGeneration, result.generationReason);
    const counts = { syncGeneration: result.syncGeneration ?? storedServerGeneration() ?? 0 };
    recordRemoteSyncLog('invalidate', 'success', 'Other browser sessions will require token re-entry.', counts);
    return { success: true, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not invalidate other browser sessions.';
    recordRemoteSyncLog('invalidate', 'error', message);
    return { success: false, error: message };
  }
}

async function pushItems(items: RemoteSyncItem[]): Promise<Record<string, number>> {
  if (items.length === 0) return {};
  await ensureServerGenerationLoaded();
  const counts: Record<string, number> = {};
  for (const batch of chunks(items, PUSH_BATCH_SIZE)) {
    const result = await postJson<{ ok?: boolean; counts?: Record<string, number>; error?: string }>('push.php', { items: batch });
    if (!result.ok) throw new Error(result.error || 'Remote sync push failed.');
    mergeCounts(counts, result.counts);
  }
  return counts;
}

async function sendVersionedWriteBatch(request: VersionedWriteBatchRequest): Promise<VersionedWriteBatchResponse> {
  const result = await postJson<Partial<VersionedWriteBatchResponse> & { ok?: boolean; error?: string }>('push.php', request);
  if (!result.ok) throw new Error(result.error || 'RemoteSync CAS push failed.');
  return {
    ok: true,
    accepted: Array.isArray(result.accepted) ? result.accepted : [],
    conflicts: Array.isArray(result.conflicts) ? result.conflicts : [],
    rejected: Array.isArray(result.rejected) ? result.rejected : [],
    latestVersion: typeof result.latestVersion === 'number' ? result.latestVersion : 0,
    syncGeneration: typeof result.syncGeneration === 'number' ? result.syncGeneration : storedServerGeneration() ?? 1,
    generationReason: typeof result.generationReason === 'string' ? result.generationReason : 'unknown',
  };
}

function rememberVersionedPullMetadata(items: readonly unknown[], latestVersion: unknown): number {
  let latest = typeof latestVersion === 'number' && Number.isFinite(latestVersion) && latestVersion >= 0
    ? Math.floor(latestVersion)
    : 0;
  for (const raw of items) {
    const item = objectValue(raw);
    const store = typeof item?.store === 'string' ? item.store as RemoteSyncStoreName : null;
    const itemKey = typeof item?.itemKey === 'string' ? item.itemKey : null;
    const version = typeof item?.version === 'number' && Number.isFinite(item.version) && item.version >= 0
      ? Math.floor(item.version)
      : null;
    if (!store || !itemKey || version === null) continue;
    recordRemoteSyncItemVersion(localStorage, storedServerIdentity(), store, itemKey, version);
    latest = Math.max(latest, version);
  }
  setRemoteSyncLatestVersion(localStorage, storedServerIdentity(), latest);
  return latest;
}

function rawVersionedPullSortKey(raw: unknown): { version: number; store: string; itemKey: string } {
  const item = objectValue(raw);
  const version = typeof item?.version === 'number' && Number.isFinite(item.version) && item.version >= 0
    ? Math.floor(item.version)
    : Number.MAX_SAFE_INTEGER;
  return {
    version,
    store: typeof item?.store === 'string' ? item.store : '',
    itemKey: typeof item?.itemKey === 'string' ? item.itemKey : '',
  };
}

function versionOrderedRawItems(items: readonly unknown[]): unknown[] {
  return [...items].sort((left, right) => {
    const leftKey = rawVersionedPullSortKey(left);
    const rightKey = rawVersionedPullSortKey(right);
    if (leftKey.version !== rightKey.version) return leftKey.version - rightKey.version;
    if (leftKey.store !== rightKey.store) return leftKey.store.localeCompare(rightKey.store);
    return leftKey.itemKey.localeCompare(rightKey.itemKey);
  });
}

function planRemoteSyncPull(options: RemoteSyncPullOptions): RemoteSyncPullPlan {
  if (typeof options.since === 'number' && Number.isFinite(options.since)) {
    const since = Math.max(0, Math.floor(options.since));
    return { mode: 'since', path: `pull.php?since=${encodeURIComponent(String(since))}`, since };
  }

  const metadata = readRemoteSyncVersionMetadata(localStorage, storedServerIdentity());
  const forcedFullPull = isRemoteSyncFullPullRequired() || options.since === null || metadata.needsFullPull;
  const cursor = forcedFullPull ? 0 : metadata.latestVersion;
  return {
    mode: 'cursor',
    path: `pull.php?cursor=${encodeURIComponent(String(cursor))}`,
    cursor,
    forcedFullPull,
  };
}

function canAdvancePullVersionMetadata(counts: Record<string, number>): boolean {
  return (counts.cancelled ?? 0) === 0
    && (counts.skipped ?? 0) === 0
    && (counts.skippedMalformedJson ?? 0) === 0;
}

async function applyVersionedRevalidationPull(
  result: PullResponse,
  generation: number,
): Promise<{ ok: boolean; latestVersion?: number; error?: string }> {
  if (!result.ok) return { ok: false, error: result.error || 'RemoteSync pre-write revalidation failed.' };
  const items = result.items ?? [];
  const counts = await applyRemoteSyncItems(items, { generation });
  if ((result.skippedMalformedJson ?? 0) > 0) {
    counts.skippedMalformedJson = (counts.skippedMalformedJson ?? 0) + (result.skippedMalformedJson ?? 0);
    recordRemoteSyncLog('pull', 'error', `Skipped ${result.skippedMalformedJson} malformed database JSON row(s).`);
  }
  if (syncGeneration !== generation || !hasRemoteSyncToken() || (counts.cancelled ?? 0) > 0) {
    return { ok: false, error: 'RemoteSync pre-write revalidation was cancelled before cursor metadata advanced.' };
  }
  setRemoteSyncLastCheckedAt();
  const latestUpdatedAt = result.latestUpdatedAt ?? maxRawItemUpdatedAt(items);
  if (Object.values(counts).some(value => value > 0) || items.length > 0) {
    if (latestUpdatedAt > 0) setRemoteSyncLastSyncedAt(latestUpdatedAt);
    applySettingsPullLiveIfNeeded(counts, latestUpdatedAt, items);
    emitRemoteSyncApplied(counts, latestUpdatedAt);
  }
  if (!canAdvancePullVersionMetadata(counts)) {
    requireRemoteSyncFullPull();
    markRemoteSyncCloudStateStale();
    return { ok: false, error: 'RemoteSync pre-write revalidation skipped remote rows; pull the token database before pushing.' };
  }
  const latestVersion = rememberVersionedPullMetadata(items, result.latestVersion);
  clearRemoteSyncFullPullRequirement();
  clearRemoteSyncCloudStateStale();
  return { ok: true, latestVersion };
}

async function revalidateBeforeVersionedDrain(cursor: number): Promise<{ ok: boolean; latestVersion?: number; error?: string }> {
  const generation = syncGeneration;
  const result = await remoteSyncFetch<PullResponse>(`pull.php?cursor=${encodeURIComponent(String(cursor))}`);
  if (!result.ok && shouldRunFullVersionedPull(result)) {
    recordRemoteSyncLog('pull', 'info', 'Version cursor was too old; running full versioned pull before write drain.');
    const fullPull = await remoteSyncFetch<PullResponse>('pull.php?cursor=0');
    return applyVersionedRevalidationPull(fullPull, generation);
  }
  return applyVersionedRevalidationPull(result, generation);
}

async function drainVersionedRemoteSyncOutbox(): Promise<Record<string, number>> {
  await ensureServerGenerationLoaded();
  const migrated = await migrateLegacyOutboxToVersioned();
  await waitForPendingVersionedOutboxWrites();
  const result = await runVersionedPreWriteGate({
    versionStorage: localStorage,
    identity: storedServerIdentity(),
    cloudStateStale: isRemoteSyncCloudStateStale(),
    revalidate: async cursor => revalidateBeforeVersionedDrain(cursor),
    drain: () => drainDurableVersionedOutbox({
      outboxStorage: defaultDurableVersionedOutboxStorage(),
      versionStorage: localStorage,
      identity: storedServerIdentity(),
      clientId: casClientId(),
      sendBatch: sendVersionedWriteBatch,
      acceptedAdapter: {
        applyAccepted: async accepted => {
          if (accepted.store !== 'accounts') return;
          const counts = await applyRemoteSyncItems([accepted], { generation: syncGeneration });
          emitRemoteSyncApplied(counts, accepted.updatedAt);
        },
      },
      conflictAdapter: {
        applyCurrent: async current => {
          const counts = await applyRemoteSyncItems([current], { generation: syncGeneration });
          applySettingsPullLiveIfNeeded(counts, current.updatedAt, [current]);
          emitRemoteSyncApplied(counts, current.updatedAt);
        },
      },
    }),
  });
  const counts = { ...result.counts };
  if (migrated > 0) counts.migratedLegacyOutbox = migrated;
  if (!result.success) throw new Error(result.error || 'RemoteSync CAS outbox drain failed.');
  return counts;
}

async function commitDataManagementDeleteKeys(
  actionId: string,
  keys: readonly RemoteSyncDeleteKey[],
): Promise<SyncResult> {
  const items = normalizeDeleteKeys(keys);
  if (items.length === 0) return { success: true, counts: {} };
  if (isRemoteSyncFullPullRequired()) {
    const message = 'Pull the token database before deleting server data from this browser.';
    const counts = { queued: items.length };
    recordRemoteSyncLog('data-management', 'error', message, counts);
    return { success: false, error: message, counts };
  }
  if (!hasRemoteSyncToken()) {
    const counts = { queued: items.length };
    const message = 'Enter the admin sync token first.';
    recordRemoteSyncLog('data-management', 'error', message, counts);
    return { success: false, error: message, counts };
  }

  return withRemoteSyncActivity(async () => {
    try {
      await ensureServerGenerationLoaded();
      const result = await postJson<DataManagementDeleteResponse>('data-management-delete.php', {
        actionId,
        items,
      });
      if (!result.ok) throw new Error(result.error || 'RemoteSync data delete failed.');

      const tombstones = (result.items ?? [])
        .map(raw => normalizeSyncItem(raw, { logInvalid: true, requireUpdatedAt: true, logAction: 'data-management' }))
        .filter((item): item is RemoteSyncItem => item !== null && isDeletedItem(item));
      if (tombstones.length !== items.length) {
        throw new Error(`RemoteSync data delete confirmed ${tombstones.length} of ${items.length} requested tombstone${items.length === 1 ? '' : 's'}.`);
      }
      const latestVersion = rememberVersionedPullMetadata(result.items ?? [], result.latestVersion);
      for (const tombstone of tombstones) rememberItemDeletedAt(tombstone.store, tombstone.itemKey, tombstone.updatedAt);
      removeOutboxItemsForCommittedDeletes(tombstones);

      const latestUpdatedAt = result.latestUpdatedAt ?? maxItemUpdatedAt(tombstones);
      if (latestUpdatedAt > 0) setRemoteSyncLastSyncedAt(latestUpdatedAt);
      setRemoteSyncLastCheckedAt();
      rememberServerGeneration(result.syncGeneration, result.generationReason);

      const counts = {
        ...(result.counts ?? {}),
        tombstonesCommitted: tombstones.length,
        tombstoneLatestVersion: latestVersion,
      };
      recordRemoteSyncLog('data-management', 'success', 'Data Management delete tombstones committed to the token database.', counts);
      emitRemoteSyncApplied(counts, latestUpdatedAt);
      return { success: true, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RemoteSync data delete failed.';
      const counts = { queued: items.length };
      recordRemoteSyncLog('data-management', 'error', message, counts);
      return { success: false, error: message, counts };
    }
  });
}

export function beginRemoteSyncDataManagementDelete(actionId: string): RemoteSyncDataManagementDeleteTransaction {
  if (activeDataManagementDelete) throw new Error('Another Data Management delete is already in progress.');
  syncGeneration++;
  if (flushDebounceTimer !== null) {
    window.clearTimeout(flushDebounceTimer);
    flushDebounceTimer = null;
  }
  activeDataManagementDelete = { actionId, keyIds: new Set() };
  return {
    actionId,
    stageKeys(keys: readonly RemoteSyncDeleteKey[]): void {
      if (activeDataManagementDelete?.actionId !== actionId) return;
      stageActiveDataManagementDeleteKeys(keys);
    },
    async commit(keys: readonly RemoteSyncDeleteKey[]): Promise<SyncResult> {
      if (activeDataManagementDelete?.actionId !== actionId) {
        return { success: false, error: 'Data Management delete transaction is no longer active.', counts: {} };
      }
      stageActiveDataManagementDeleteKeys(keys);
      return commitDataManagementDeleteKeys(actionId, keys);
    },
    release(): void {
      if (activeDataManagementDelete?.actionId === actionId) {
        activeDataManagementDelete = null;
        syncGeneration++;
      }
    },
  };
}

function flattenLegacyGameLibrary(records: IdbRecord[]): unknown[] {
  const games: unknown[] = [];
  for (const record of records) {
    const value = objectValue(record.value)?.games;
    if (Array.isArray(value)) games.push(...value);
  }
  return games;
}

function recordsToSyncItems(spec: IdbStoreSpec, records: IdbRecord[]): RemoteSyncItem[] {
  return records.flatMap(record => {
    const itemKey = spec.keyForRecord(record.value, record.primaryKey);
    if (!itemKey) return [];
    const payloadUpdatedAt = spec.updatedAt(record.value);
    if (shouldSuppressLocalSnapshotItem(spec.store, itemKey, payloadUpdatedAt)) return [];
    const updatedAt = Math.max(payloadUpdatedAt, rememberedItemUpdatedAt(spec.store, itemKey));
    return [{
      store: spec.store,
      itemKey,
      updatedAt,
      payload: record.value,
      operation: 'upsert' as const,
    }];
  });
}

async function readLocalStoreItems(spec: IdbStoreSpec): Promise<RemoteSyncItem[]> {
  const db = await openIdb(spec.dbName, spec.dbVersion);
  try {
    const records = await readAllFromStore(db, spec.objectStore);
    if (spec.store === 'games' && records.length === 0) {
      const legacyGames = flattenLegacyGameLibrary(await readAllFromStore(db, 'game-library'));
      return legacyGames.flatMap(record => {
        const itemKey = stringField(record, 'id');
        const payloadUpdatedAt = genericUpdatedAt(record);
        if (itemKey && shouldSuppressLocalSnapshotItem('games', itemKey, payloadUpdatedAt)) return [];
        return itemKey
          ? [{ store: 'games' as const, itemKey, updatedAt: Math.max(payloadUpdatedAt, rememberedItemUpdatedAt('games', itemKey)), payload: record, operation: 'upsert' as const }]
          : [];
      });
    }
    return recordsToSyncItems(spec, records);
  } finally {
    db.close();
  }
}

export async function readLocalRemoteSyncItems(): Promise<RemoteSyncItem[]> {
  const groups = await Promise.all(IDB_STORE_SPECS.map(readLocalStoreItems));
  return [...groups.flat(), ...readLocalSettingsItems()];
}

async function applyIdbItem(item: RemoteSyncItem): Promise<'applied' | 'deleted' | RemoteSyncSkippedApplyResult> {
  const spec = IDB_SPECS_BY_STORE.get(item.store);
  if (!spec) return { skipped: 'unknown-store' };

  const db = await openIdb(spec.dbName, spec.dbVersion);
  try {
    const existing = await readRecordByItemKey(db, spec, item.itemKey);
    if (!isDeletedItem(item) && shouldSuppressRemoteSyncUpsert(spec.store, item.itemKey, item.updatedAt)) return { skipped: 'suppressed-upsert' };
    if (item.store === 'accounts' && !isDeletedItem(item)) {
      if (item.payload === undefined) return { skipped: 'missing-payload' };
      const merged = mergeRemoteSyncAccountPayload(existing, item.payload, item.itemKey);
      if (!merged) return { skipped: 'merge-failed' };
      await writeRecordByItemKey(db, spec, item.itemKey, merged);
      rememberItemUpdatedAt(spec.store, item.itemKey, maxTimestamp(item.updatedAt, accountUpdatedAt(merged)));
      clearItemDeletedAt(spec.store, item.itemKey);
      return 'applied';
    }

    const existingUpdatedAt = localVersionForItem(spec, item.itemKey, existing);
    if (item.updatedAt < existingUpdatedAt) return { skipped: 'stale-remote' };

    if (isDeletedItem(item)) {
      await deleteRecordByItemKey(db, spec, item.itemKey);
      if (spec.store === 'games') await deleteLegacyImportedGameById(db, item.itemKey);
      rememberItemDeletedAt(spec.store, item.itemKey, item.updatedAt);
      return 'deleted';
    }
    if (item.payload === undefined) return { skipped: 'missing-payload' };
    await writeRecordByItemKey(db, spec, item.itemKey, item.payload);
    rememberItemUpdatedAt(spec.store, item.itemKey, item.updatedAt);
    clearItemDeletedAt(spec.store, item.itemKey);
    return 'applied';
  } finally {
    db.close();
  }
}

export async function applyRemoteSyncItems(
  items: unknown[],
  options: { generation?: number } = {},
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let analysisChanged = false;
  applyingRemoteSync = true;
  try {
    for (const raw of items) {
      if (options.generation !== undefined && (syncGeneration !== options.generation || !hasRemoteSyncToken())) {
        counts.cancelled = (counts.cancelled ?? 0) + 1;
        break;
      }
      const item = normalizeSyncItem(raw, { logInvalid: true, requireUpdatedAt: true });
      if (!item) {
        counts.skipped = (counts.skipped ?? 0) + 1;
        counts.skippedNormalizeFailed = (counts.skippedNormalizeFailed ?? 0) + 1;
        continue;
      }

      try {
        const result = item.store === 'settings'
          ? applySettingItem(item)
          : await applyIdbItem(item);
        if (item.store === 'analysis' && (result === 'applied' || result === 'deleted')) {
          analysisChanged = true;
        }
        if (result === 'applied') counts[item.store] = (counts[item.store] ?? 0) + 1;
        else if (result === 'deleted') counts[`${item.store}:deleted`] = (counts[`${item.store}:deleted`] ?? 0) + 1;
        else countSkippedApplyResult(counts, result.skipped);
      } catch (error) {
        counts.skipped = (counts.skipped ?? 0) + 1;
        counts.skippedApplyFailed = (counts.skippedApplyFailed ?? 0) + 1;
        const message = error instanceof Error ? error.message : 'Could not apply sync item.';
        recordRemoteSyncLog('pull', 'error', `Skipped ${item.store}/${item.itemKey}: ${message}`);
      }
    }
  } finally {
    applyingRemoteSync = false;
    if (analysisChanged) emitAnalysisChanged();
  }
  return counts;
}

export async function validateRemoteSyncToken(token: string): Promise<SyncResult> {
  try {
    const value = token.trim();
    if (!value) return { success: false, error: 'Enter the admin sync token first.' };
    const status = await remoteSyncFetch<StatusResponse>('status.php', {}, value);
    if (!status.ok) return { success: false, error: status.error || 'Remote sync status failed.' };
    setRemoteSyncLastCheckedAt();
    const result = {
      success: true,
      counts: {
        items: status.items ?? 0,
        tombstones: status.tombstones ?? 0,
        latestUpdatedAt: status.latestUpdatedAt ?? 0,
        latestVersion: status.latestVersion ?? 0,
        syncGeneration: status.syncGeneration ?? storedServerGeneration() ?? 0,
      },
    };
    recordRemoteSyncLog('token', 'success', 'Token verified.', result.counts);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Remote sync status failed.';
    recordRemoteSyncLog('token', 'error', message);
    return { success: false, error: message };
  }
}

export async function rememberRemoteSyncToken(token: string): Promise<SyncResult> {
  const result = await validateRemoteSyncToken(token);
  if (result.success) setRemoteSyncToken(token);
  return result;
}

export async function testRemoteSyncConnection(): Promise<SyncResult> {
  return withRemoteSyncActivity(async () => {
    try {
      const status = await remoteSyncFetch<StatusResponse>('status.php');
      if (!status.ok) return { success: false, error: status.error || 'Remote sync status failed.' };
      setRemoteSyncLastCheckedAt();
      const result = {
        success: true,
        counts: {
          items: status.items ?? 0,
          tombstones: status.tombstones ?? 0,
          latestUpdatedAt: status.latestUpdatedAt ?? 0,
          latestVersion: status.latestVersion ?? 0,
          syncGeneration: status.syncGeneration ?? storedServerGeneration() ?? 0,
        },
      };
      recordRemoteSyncLog('test', 'success', 'Connection test passed.', result.counts);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote sync status failed.';
      recordRemoteSyncLog('test', 'error', message);
      return { success: false, error: message };
    }
  });
}

export async function flushRemoteSyncOutbox(): Promise<SyncResult> {
  const snapshot = readOutboxSnapshot({ logInvalid: true });
  const pendingVersioned = await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage());
  durableOutboxCountCache = pendingVersioned.length;
  const queued = snapshot.valid.length + pendingVersioned.length + pendingVersionedOutboxEnqueues.length;
  if (queued === 0) return { success: true, counts: {} };
  if (activeDataManagementDelete) return { success: true, counts: { paused: 1, queued } };
  if (isRemoteSyncFullPullRequired()) {
    const message = 'Pull the token database before pushing from this browser.';
    const counts = { queued };
    recordRemoteSyncLog('flush', 'error', message, counts);
    return { success: false, error: message, counts };
  }
  if (!hasRemoteSyncToken()) {
    const counts = { queued };
    recordRemoteSyncLog('flush', 'error', 'Enter the admin sync token first.', counts);
    return { success: false, error: 'Enter the admin sync token first.', counts };
  }

  return withRemoteSyncActivity(async () => {
    try {
      const counts = await drainVersionedRemoteSyncOutbox();
      durableOutboxCountCache = counts.queued ?? 0;
      setRemoteSyncLastSyncedAt(Date.now());
      recordRemoteSyncLog('flush', 'success', 'Queued CAS changes flushed.', counts);
      return { success: true, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote sync flush failed.';
      const remainingLegacy = readOutboxSnapshot({ logInvalid: true }).valid.length;
      const remainingVersioned = await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage());
      durableOutboxCountCache = remainingVersioned.length;
      const counts = { queued: remainingLegacy + remainingVersioned.length };
      recordRemoteSyncLog('flush', 'error', message, counts);
      return { success: false, error: message, counts };
    }
  });
}

export async function pushToRemoteSync(options: { skipFreshPull?: boolean } = {}): Promise<SyncResult> {
  if (activeDataManagementDelete) return { success: true, counts: { paused: 1 } };
  return withRemoteSyncActivity(async () => {
    try {
      let pullCounts: Record<string, number> | undefined;
      if (!options.skipFreshPull) {
        const pull = await pullFromRemoteSync({ since: null, flushAfter: false, logNoop: false });
        pullCounts = pull.counts;
        if (!pull.success) {
          const message = pull.error || 'Fresh pull failed before push.';
          recordRemoteSyncLog('push', 'error', message);
          return pull.counts
            ? { success: false, error: message, counts: pull.counts }
            : { success: false, error: message };
        }
      }
      if (isRemoteSyncFullPullRequired()) {
        const message = 'Pull the token database before pushing from this browser.';
        recordRemoteSyncLog('push', 'error', message);
        return pullCounts
          ? { success: false, error: message, counts: pullCounts }
          : { success: false, error: message };
      }
      const flush = await flushRemoteSyncOutbox();
      if (!flush.success) return flush;
      const counts = { ...(flush.counts ?? {}) };
      mergeCounts(counts, pullCounts);
      recordRemoteSyncLog('push', 'success', 'Database pulled, then queued CAS changes flushed.', counts);
      return { success: true, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote sync push failed.';
      recordRemoteSyncLog('push', 'error', message);
      return { success: false, error: message };
    }
  });
}

// Reconciliation for local data the sync layer never captured (e.g. enqueues lost to historical
// localStorage quota failures): queue every local item the server has no recorded version for.
// Explicit owner-triggered action — requires current pull state so the item-version metadata
// reflects the remote database, and only ADDS outbox entries that drain through the normal CAS
// path (baseVersion null → server-side create; existing rows resolve through the conflict path).
export async function queueLocalLibraryForRemoteSync(): Promise<SyncResult> {
  if (activeDataManagementDelete) return { success: true, counts: { paused: 1 } };
  const refuse = (message: string): SyncResult => {
    recordRemoteSyncLog('reconcile', 'error', message);
    return { success: false, error: message };
  };
  if (!hasRemoteSyncToken()) return refuse('Enter the admin sync token first.');
  if (isRemoteSyncFullPullRequired()) return refuse('Pull the token database before queueing the local library.');
  const identity = storedServerIdentity();
  if (readRemoteSyncVersionMetadata(localStorage, identity).needsFullPull) {
    return refuse('Pull the token database before queueing the local library.');
  }

  return withRemoteSyncActivity(async () => {
    try {
      const localItems = await readLocalRemoteSyncItems();
      const resolveVersion = createRemoteSyncItemVersionResolver(localStorage, identity);
      const pendingKeys = new Set(
        (await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage()))
          .map(entry => `${entry.store}\u0000${entry.itemKey}`),
      );
      const untracked: RemoteSyncItem[] = [];
      let alreadyTracked = 0;
      let alreadyQueued = 0;
      for (const item of localItems) {
        if (isDeletedItem(item)) continue;
        if (resolveVersion(item.store, item.itemKey) !== null) {
          alreadyTracked += 1;
          continue;
        }
        if (pendingKeys.has(`${item.store}\u0000${item.itemKey}`)) {
          alreadyQueued += 1;
          continue;
        }
        untracked.push(item);
      }
      const counts: Record<string, number> = {
        scannedLocal: localItems.length,
        alreadyTracked,
        alreadyQueued,
        queuedForSync: untracked.length,
      };
      for (const item of untracked) {
        counts[`queued:${item.store}`] = (counts[`queued:${item.store}`] ?? 0) + 1;
      }
      if (untracked.length > 0) {
        enqueueRemoteSyncItemsBatch(untracked);
        await waitForPendingVersionedOutboxWrites();
      }
      recordRemoteSyncLog('reconcile', 'success', 'Local items missing from the token database queued for sync.', counts);
      if (untracked.length === 0) return { success: true, counts };

      const flush = await flushRemoteSyncOutbox();
      if (!flush.success) {
        return {
          success: false,
          error: flush.error || 'Remote sync flush failed.',
          counts: { ...counts, ...(flush.counts ?? {}) },
        };
      }
      mergeCounts(counts, flush.counts);
      return { success: true, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not queue the local library for sync.';
      recordRemoteSyncLog('reconcile', 'error', message);
      return { success: false, error: message };
    }
  });
}

export async function pullFromRemoteSync(options: RemoteSyncPullOptions = {}): Promise<SyncResult> {
  if (activeDataManagementDelete) return { success: true, counts: { paused: 1 } };
  return withRemoteSyncActivity(async () => {
    try {
      await ensureServerGenerationLoaded();
      const generation = syncGeneration;
      const plan = planRemoteSyncPull(options);
      const result = await remoteSyncFetch<PullResponse>(plan.path);
      if (!result.ok) throw new Error(result.error || 'Remote sync pull failed.');
      setRemoteSyncLastCheckedAt();
      if (syncGeneration !== generation || !hasRemoteSyncToken()) return { success: true, counts: { cancelled: 1 } };

      const items = plan.mode === 'cursor'
        ? versionOrderedRawItems(result.items ?? [])
        : result.items ?? [];
      const counts = await applyRemoteSyncItems(items, { generation });
      let versionMetadataAdvanced = plan.mode !== 'cursor';
      if ((result.skippedMalformedJson ?? 0) > 0) {
        counts.skippedMalformedJson = (counts.skippedMalformedJson ?? 0) + (result.skippedMalformedJson ?? 0);
        recordRemoteSyncLog('pull', 'error', `Skipped ${result.skippedMalformedJson} malformed database JSON row(s).`);
      }
      if (syncGeneration !== generation || !hasRemoteSyncToken()) return { success: true, counts };
      if (plan.mode === 'cursor') {
        if (canAdvancePullVersionMetadata(counts)) {
          const latestVersion = rememberVersionedPullMetadata(items, result.latestVersion);
          counts.latestVersion = latestVersion;
          if (plan.forcedFullPull) counts.fullVersionPull = 1;
          clearRemoteSyncFullPullRequirement();
          clearRemoteSyncCloudStateStale();
          versionMetadataAdvanced = true;
        } else {
          requireRemoteSyncFullPull();
          markRemoteSyncCloudStateStale();
          counts.versionMetadataDeferred = 1;
        }
      }
      const latestUpdatedAt = result.latestUpdatedAt ?? maxRawItemUpdatedAt(items);
      if (latestUpdatedAt > 0 || items.length > 0) setRemoteSyncLastSyncedAt(latestUpdatedAt);
      applySettingsPullLiveIfNeeded(counts, latestUpdatedAt, items);
      emitRemoteSyncApplied(counts, latestUpdatedAt);

      if (options.flushAfter && !(plan.mode === 'cursor' && (plan.forcedFullPull || !versionMetadataAdvanced))) {
        const flush = await flushRemoteSyncOutbox();
        if (!flush.success) {
          return {
            success: false,
            error: flush.error || 'Remote sync flush failed.',
            counts: { ...counts, ...(flush.counts ?? {}) },
          };
        }
        mergeCounts(counts, flush.counts);
      }

      const shouldLog = options.logNoop !== false
        || Object.values(counts).some(value => value > 0)
        || items.length > 0;
      if (shouldLog) recordRemoteSyncLog('pull', 'success', 'Database changes pulled into local cache.', counts);
      return { success: true, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote sync pull failed.';
      recordRemoteSyncLog('pull', 'error', message);
      return { success: false, error: message };
    }
  });
}

export async function hydrateFromRemoteSync(): Promise<SyncResult> {
  return pullFromRemoteSync({ since: null, flushAfter: true });
}

export const startupHydrateFromRemoteSync = hydrateFromRemoteSync;
