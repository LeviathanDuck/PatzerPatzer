






import { DB_NAME as MAIN_DB_NAME, DB_VERSION as MAIN_DB_VERSION, upgradeGameDbSchema } from '../idb/index';
import type { SyncResult } from './client';
import {
  drainDurableVersionedOutbox,
  runVersionedPreWriteGate,
  type VersionedOutboxDrainBatchProgress,
  type VersionedRejectedItem,
  type VersionedWriteBatchRequest,
  type VersionedWriteBatchResponse,
} from './versionDrain';
import {
  advanceRemoteSyncPullCursor,
  createRemoteSyncItemStateResolver,
  ensureRemoteSyncItemStateReady,
  ensureRemoteSyncItemVersionsActive,
  getRemoteSyncItemMarkers,
  getRemoteSyncItemStateVersion,
  isRemoteSyncItemStateEphemeral,
  migrateRemoteSyncItemMarkersToIdb,
  recordRemoteSyncItemMarkers,
  restoreRemoteSyncItemMarkersIfUnchanged,
  type RemoteSyncItemMarkerMaxMutation,
  type RemoteSyncItemMarkerRestore,
  waitForRemoteSyncItemStateWrites,
  readRemoteSyncVersionMetadata,
  recordRemoteSyncItemStateVersions,
  recordRemoteSyncItemVersions,
  resetRemoteSyncItemState,
  resetRemoteSyncVersionMetadata,
  setRemoteSyncPullCursor,
  type RemoteSyncItemVersionRecord,
} from './versionMetadata';
import {
  buildRecreateRequeueInput,
  collectOutboxMarkerCoverFromRaw,
  countDurableVersionedOutboxEntries,
  decideRecreateOverTombstone,
  defaultDurableVersionedOutboxStorage,
  enqueueDurableVersionedOutboxEntries,
  enqueueDurableVersionedOutboxEntry,
  migrateDurableLegacyOutboxMirror,
  removeDurableVersionedOutboxEntriesForCommittedDeletes,
  replaceDurableVersionedOutboxEntry,
  readDurableVersionedOutbox,
  readQuarantineRecords,
  removeQuarantineRecords,
  writeQuarantineRecords,
  type DurableQuarantineRecord,
  type DurableRetryOutboxEntry,
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
import { getSessionId } from '../diagnostics';
import {
  addRemoteSyncIssue,
  beginRemoteSyncOperation,
  clearRemoteSyncIssue,
  clearRestoredRemoteSyncOperations,
  completeRemoteSyncOperation,
  createRemoteSyncProgressStore,
  deriveRemoteSyncProgressSnapshot,
  failRemoteSyncOperation,
  restoreRemoteSyncProgressOperations,
  seedRemoteSyncProgressStoreFromPersisted,
  serializeRemoteSyncProgressStore,
  setRemoteSyncProgressBackoff,
  updateRemoteSyncOperation,
  type AddRemoteSyncIssueInput,
  type BeginRemoteSyncOperationOptions,
  type RemoteSyncBackoffState,
  type RemoteSyncIssueReason,
  type RemoteSyncOperationKind,
  type RemoteSyncProgressSnapshot,
  type RemoteSyncProgressStore,
  type FailRemoteSyncOperationOptions,
  type UpdateRemoteSyncOperationOptions,
} from './progress';

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




const SERVER_VERSION_GAP_KEY_PREFIX = 'chesspatzer.remoteSync.serverVersionGapObservation';
const CAS_CLIENT_ID_KEY = 'chesspatzer.remoteSync.casClientId';
export const REMOTE_SYNC_LOG_EVENT = 'chesspatzer:remoteSync-sync-log-changed';
export const REMOTE_SYNC_ANALYSIS_CHANGED_EVENT = 'chesspatzer:remoteSync-analysis-changed';
export const REMOTE_SYNC_APPLIED_EVENT = 'chesspatzer:remoteSync-remote-sync-applied';
export const REMOTE_SYNC_ACTIVITY_EVENT = 'chesspatzer:remoteSync-sync-activity-changed';
export const REMOTE_SYNC_PROGRESS_EVENT = 'chesspatzer:remoteSync-sync-progress-changed';
const SYNC_PROGRESS_SESSION_KEY = 'chesspatzer.remoteSync.syncProgressDenominators.v1';
/** Mirrors CR-10 / the live engine UI throttle (src/engine/ctrl.ts): >=200ms between emits, trailing state always flushed. */
const SYNC_PROGRESS_THROTTLE_MS = 200;
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

export type {
  RemoteSyncBackoffState,
  RemoteSyncIssue,
  RemoteSyncIssueReason,
  RemoteSyncOperationKind,
  RemoteSyncOperationSummary,
  RemoteSyncProgressIdentity,
  RemoteSyncProgressIdentityBlock,
  RemoteSyncProgressSeverity,
  RemoteSyncProgressSnapshot,
  RemoteSyncProgressState,
} from './progress';

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



export type RemoteSyncFreshnessState = 'fresh' | 'stale' | 'unknown' | 'catching-up';

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

type RemoteSyncCursorPullPlan = Extract<RemoteSyncPullPlan, { mode: 'cursor' }>;










interface RemoteSyncPullOutcome {
  result: SyncResult;
  flushEligible: boolean;
  flushed: boolean;
  revalidation?: { ok: boolean; latestVersion?: number; error?: string };
}

interface InFlightRemoteSyncPull {
  promise: Promise<RemoteSyncPullOutcome>;
  plan: RemoteSyncPullPlan;
  options: RemoteSyncPullOptions;
}

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

// Shared by rememberServerGeneration (generation-number-change path) and handleStaleSession
// (defense in depth). Targets only the CURRENT stored identity's blob (task item 4) — it is not a
// global reset, so other identities' cached CAS state is left untouched.
function resetCurrentIdentityVersionMetadata(): void {
  const identity = storedServerIdentity();
  resetRemoteSyncVersionMetadata(localStorage, identity);








  resetRemoteSyncItemState(identity, { rebuildMarkers: buildMarkerRebuildCover })
    .catch(error => {
      recordRemoteSyncLog('pull', 'error', `Could not clear per-item version state after a generation change: ${error instanceof Error ? error.message : String(error)}`);
    });
  // The gap-observation marker's `pullCursorAtObservation` is only meaningful relative to the
  // metadata blob just reset (pullCursor -> 0 on next read), so stale comparisons must not survive.
  clearServerVersionGapObservation(identity);
}

function rememberServerGeneration(generation: unknown, reason?: unknown): void {
  if (typeof generation !== 'number' || !Number.isFinite(generation) || generation <= 0) return;
  const next = Math.floor(generation);
  const previous = storedServerGeneration();
  localStorage.setItem(SERVER_GENERATION_KEY, String(next));
  const reasonText = typeof reason === 'string' && reason.trim() ? reason.trim() : undefined;
  if (reasonText) localStorage.setItem(`${SERVER_GENERATION_KEY}.reason`, reasonText);









  if (previous !== undefined && previous !== next) {
    resetCurrentIdentityVersionMetadata();
    requireRemoteSyncFullPull();












    syncGeneration++;





    inFlightRemoteSyncPull = null;
    recordRemoteSyncLog('system', 'info', `generation-changed:${reasonText ?? 'unknown'}`, { syncGeneration: next });
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

interface ServerVersionGapObservation {
  serverVersion: number;
  pullCursorAtObservation: number;
  confirmed: boolean;
}

function serverVersionGapKey(identity: string): string {
  return `${SERVER_VERSION_GAP_KEY_PREFIX}.${encodeURIComponent(identity)}`;
}

function readServerVersionGapObservation(identity: string): ServerVersionGapObservation | null {
  const raw = localStorage.getItem(serverVersionGapKey(identity));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServerVersionGapObservation>;
    if (
      !validSyncVersion(parsed.serverVersion)
      || !validSyncVersion(parsed.pullCursorAtObservation)
      || typeof parsed.confirmed !== 'boolean'
    ) return null;
    return {
      serverVersion: parsed.serverVersion,
      pullCursorAtObservation: parsed.pullCursorAtObservation,
      confirmed: parsed.confirmed,
    };
  } catch {
    return null;
  }
}

function writeServerVersionGapObservation(identity: string, observation: ServerVersionGapObservation): void {
  localStorage.setItem(serverVersionGapKey(identity), JSON.stringify(observation));
}

function clearServerVersionGapObservation(identity: string): void {
  localStorage.removeItem(serverVersionGapKey(identity));
}

function clearAllServerVersionGapObservations(): void {
  const prefix = `${SERVER_VERSION_GAP_KEY_PREFIX}.`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) localStorage.removeItem(key);
}
















function evaluateServerVersionGap(
  identity: string,
  serverVersion: number | null,
  pullCursor: number | null,
): { hasGap: boolean; confirmed: boolean; behind: number } {
  if (serverVersion === null || pullCursor === null || serverVersion <= pullCursor) {
    clearServerVersionGapObservation(identity);
    return { hasGap: false, confirmed: false, behind: 0 };
  }
  const behind = serverVersion - pullCursor;
  const existing = readServerVersionGapObservation(identity);
  if (!existing) {
    writeServerVersionGapObservation(identity, { serverVersion, pullCursorAtObservation: pullCursor, confirmed: false });
    return { hasGap: true, confirmed: false, behind };
  }
  if (pullCursor > existing.pullCursorAtObservation) {
    writeServerVersionGapObservation(identity, { serverVersion, pullCursorAtObservation: pullCursor, confirmed: true });
    return { hasGap: true, confirmed: true, behind };
  }
  if (existing.serverVersion !== serverVersion) {
    writeServerVersionGapObservation(identity, { ...existing, serverVersion });
  }
  return { hasGap: true, confirmed: existing.confirmed, behind };
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





  const localVersion = metadata.needsFullPull ? null : metadata.pullCursor;
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

  const gap = evaluateServerVersionGap(identityLabel, serverVersion, localVersion);
  if (gap.confirmed) {
    return stale(
      'Sync may be stale',
      `Server still has newer sync data (${gap.behind} version${gap.behind === 1 ? '' : 's'} behind) after a completed pull.`,
    );
  }
  if (gap.hasGap) {
    return {
      freshnessState: 'catching-up',
      freshnessWarning: false,
      freshnessLabel: 'Catching up',
      freshnessTitle: `Catching up · ${gap.behind} behind. Waiting for a completed pull to confirm.`,
      localVersion,
      serverVersion,
      fullPullRequired,
      cloudStateStale,
    };
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
  clearAllServerVersionGapObservations();
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
  safeAddProgressIssue({ reason: 'full-pull-required' });
}

function clearRemoteSyncFullPullRequirement(): void {
  localStorage.removeItem(FULL_PULL_REQUIRED_KEY);
  safeClearProgressIssue('full-pull-required');
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



let inFlightRemoteSyncPull: InFlightRemoteSyncPull | null = null;
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








let remoteSyncProgressStore: RemoteSyncProgressStore = createRemoteSyncProgressStore();

function shortIdSuffix(value: string, length = 8): string {
  const trimmed = value.trim();
  return trimmed.length <= length ? trimmed : trimmed.slice(-length);
}

function currentRemoteSyncProgressIdentity() {
  return {
    identityLabel: storedServerIdentityLabel(),
    deviceTag: getRemoteSyncDeviceTag(),
    clientIdShort: shortIdSuffix(casClientId()),
    sessionIdShort: shortIdSuffix(getSessionId()),
  };
}







export function getRemoteSyncProgressSnapshot(): RemoteSyncProgressSnapshot {
  return deriveRemoteSyncProgressSnapshot(remoteSyncProgressStore, currentRemoteSyncProgressIdentity());
}

let syncProgressEmitTimer: ReturnType<typeof setTimeout> | null = null;
let syncProgressLastEmitAt = 0;

function flushRemoteSyncProgressEmit(): void {
  syncProgressEmitTimer = null;
  syncProgressLastEmitAt = Date.now();
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_PROGRESS_EVENT, {
    detail: getRemoteSyncProgressSnapshot(),
  }));
}

/** Throttles progress-change emission to >=200ms between dispatches, always flushing the trailing state. */
function scheduleRemoteSyncProgressEmit(): void {
  const elapsed = Date.now() - syncProgressLastEmitAt;
  if (elapsed >= SYNC_PROGRESS_THROTTLE_MS && syncProgressEmitTimer === null) {
    flushRemoteSyncProgressEmit();
    return;
  }
  if (syncProgressEmitTimer !== null) return;
  const wait = Math.max(0, SYNC_PROGRESS_THROTTLE_MS - elapsed);
  syncProgressEmitTimer = window.setTimeout(flushRemoteSyncProgressEmit, wait);
}

function persistRemoteSyncProgressDenominators(): void {
  try {
    sessionStorage.setItem(SYNC_PROGRESS_SESSION_KEY, serializeRemoteSyncProgressStore(remoteSyncProgressStore));
  } catch {
    // Denominator persistence is a reload convenience only; it must never block sync.
  }
}

// Restored denominators are a boot-time display hint, not real operations: a real begin() of the
// same kind supersedes its hint (progress.ts), and any hint whose kind never resumes is expired
// here so a killed session's ghost operation cannot read as active forever (BUG-2026-07-05-009).
const RESTORED_SYNC_PROGRESS_TTL_MS = 30_000;

function loadPersistedRemoteSyncProgressDenominators(): void {
  try {
    const raw = sessionStorage.getItem(SYNC_PROGRESS_SESSION_KEY);
    const persisted = restoreRemoteSyncProgressOperations(raw);
    if (persisted.length === 0) return;
    remoteSyncProgressStore = seedRemoteSyncProgressStoreFromPersisted(remoteSyncProgressStore, persisted);
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(() => {
        const cleared = clearRestoredRemoteSyncOperations(remoteSyncProgressStore);
        if (cleared === remoteSyncProgressStore) return;
        remoteSyncProgressStore = cleared;
        persistRemoteSyncProgressDenominators();
        scheduleRemoteSyncProgressEmit();
      }, RESTORED_SYNC_PROGRESS_TTL_MS);
    }
  } catch {
    // Denominator restore is a reload convenience only; it must never block sync.
  }
}

if (typeof sessionStorage !== 'undefined') loadPersistedRemoteSyncProgressDenominators();

/** Begins tracking a new sync operation. Returns the opId to pass to update/complete/fail. */
export function beginRemoteSyncProgressOperation(
  kind: RemoteSyncOperationKind,
  options?: BeginRemoteSyncOperationOptions,
): string {
  const { store, opId } = beginRemoteSyncOperation(remoteSyncProgressStore, kind, options);
  remoteSyncProgressStore = store;
  if (typeof options?.total === 'number') persistRemoteSyncProgressDenominators();
  scheduleRemoteSyncProgressEmit();
  return opId;
}

/** Updates an in-flight sync operation (progress, phase label, or merged counts). */
export function updateRemoteSyncProgressOperation(
  opId: string,
  updates: UpdateRemoteSyncOperationOptions,
): void {
  remoteSyncProgressStore = updateRemoteSyncOperation(remoteSyncProgressStore, opId, updates);
  persistRemoteSyncProgressDenominators();
  scheduleRemoteSyncProgressEmit();
}

/** Marks a sync operation as finished successfully. */
export function completeRemoteSyncProgressOperation(opId: string): void {
  remoteSyncProgressStore = completeRemoteSyncOperation(remoteSyncProgressStore, opId);
  persistRemoteSyncProgressDenominators();
  scheduleRemoteSyncProgressEmit();
}

/** Ends a sync operation unsuccessfully, optionally recording a reason-coded issue. */
export function failRemoteSyncProgressOperation(
  opId: string,
  options?: FailRemoteSyncOperationOptions,
): void {
  remoteSyncProgressStore = failRemoteSyncOperation(remoteSyncProgressStore, opId, options);
  persistRemoteSyncProgressDenominators();
  scheduleRemoteSyncProgressEmit();
}

/** Adds (or replaces) the active issue for a reason code, independent of any specific operation. */
export function addRemoteSyncProgressIssue(issue: AddRemoteSyncIssueInput): void {
  remoteSyncProgressStore = addRemoteSyncIssue(remoteSyncProgressStore, issue);
  scheduleRemoteSyncProgressEmit();
}

/** Clears the active issue for a reason code, if any. */
export function clearRemoteSyncProgressIssue(reason: RemoteSyncIssueReason): void {
  remoteSyncProgressStore = clearRemoteSyncIssue(remoteSyncProgressStore, reason);
  scheduleRemoteSyncProgressEmit();
}





function safeBeginProgress(
  kind: RemoteSyncOperationKind,
  options?: BeginRemoteSyncOperationOptions,
): string {
  try {
    return beginRemoteSyncProgressOperation(kind, options);
  } catch {
    return '';
  }
}

function safeUpdateProgress(opId: string, updates: UpdateRemoteSyncOperationOptions): void {
  if (!opId) return;
  try {
    updateRemoteSyncProgressOperation(opId, updates);
  } catch {
    // Progress reporting must never break the sync path.
  }
}

function safeCompleteProgress(opId: string): void {
  if (!opId) return;
  try {
    completeRemoteSyncProgressOperation(opId);
  } catch {
    // Progress reporting must never break the sync path.
  }
}

function safeFailProgress(opId: string, options?: FailRemoteSyncOperationOptions): void {
  if (!opId) return;
  try {
    failRemoteSyncProgressOperation(opId, options);
  } catch {
    // Progress reporting must never break the sync path.
  }
}

function safeAddProgressIssue(issue: AddRemoteSyncIssueInput): void {
  try {
    addRemoteSyncProgressIssue(issue);
  } catch {
    // Progress reporting must never break the sync path.
  }
}

function safeClearProgressIssue(reason: RemoteSyncIssueReason): void {
  try {
    clearRemoteSyncProgressIssue(reason);
  } catch {
    // Progress reporting must never break the sync path.
  }
}

function skipIssueCounts(counts: Record<string, number>): Record<string, number> {
  const keys = [
    'skipped',
    'skippedUnknownStore',
    'skippedMissingPayload',
    'skippedMergeFailed',
    'skippedInvalidPayload',
    'skippedNormalizeFailed',
    'skippedApplyFailed',
    'skippedMalformedJson',
  ];
  const picked: Record<string, number> = {};
  for (const key of keys) {
    const value = counts[key];
    if (typeof value === 'number' && value > 0) picked[key] = value;
  }
  return picked;
}





function markVersionedPullUnsafeSkipped(counts: Record<string, number>): void {
  requireRemoteSyncFullPull();
  markRemoteSyncCloudStateStale();
  safeAddProgressIssue({ reason: 'unsafe-skips', counts: skipIssueCounts(counts) });
}

function clearVersionedPullUnsafeSkipped(): void {
  clearRemoteSyncFullPullRequirement();
  clearRemoteSyncCloudStateStale();
  safeClearProgressIssue('unsafe-skips');
}

// P6b (audit F-8 gap 2, ledger G-11): entries whose attemptCount reaches this threshold before
// the attempt-cap (12, DEFAULT_MAX_DRAIN_ATTEMPTS in versionDrain.ts) quarantines them are a
// "poisoned batch" signal worth surfacing well before the eventual quarantine.
const PUSH_RETRYING_ATTEMPT_THRESHOLD = 3;
const PUSH_RETRYING_NAMED_KEYS_LIMIT = 5;

/**
 * Derives idle-queue backoff state (P6b) and the push-retrying escalation issue from a snapshot
 * of the durable outbox entries, and applies both to the in-memory progress store. Both are pure
 * re-derivations of already-persisted `attemptCount`/`nextAttemptAt` fields (written by
 * versionDrain.ts's recordDurableVersionedOutboxFailure) — this only reads them from outside;
 * the drain's own retry/quarantine logic in versionDrain.ts is untouched. Escalation clears
 * itself naturally the next time this runs after the offending entries drain (removed from the
 * outbox on success) or are quarantined (removed on attempt-cap) — no separate clear path needed.
 */
function applyRemoteSyncBackoffAndEscalation(
  entries: readonly DurableRetryOutboxEntry[],
  now: number = Date.now(),
): void {
  const backedOff = entries.filter(entry => entry.attemptCount > 0 && entry.nextAttemptAt > now);
  remoteSyncProgressStore = setRemoteSyncProgressBackoff(
    remoteSyncProgressStore,
    backedOff.length > 0
      ? {
          count: backedOff.length,
          earliestNextAttemptAt: Math.min(...backedOff.map(entry => entry.nextAttemptAt)),
        }
      : null,
  );

  const escalated = entries.filter(entry => entry.attemptCount >= PUSH_RETRYING_ATTEMPT_THRESHOLD);
  if (escalated.length === 0) {
    remoteSyncProgressStore = clearRemoteSyncIssue(remoteSyncProgressStore, 'push-retrying');
    return;
  }
  const named = escalated
    .slice(0, PUSH_RETRYING_NAMED_KEYS_LIMIT)
    .map(entry => `${entry.store}/${entry.itemKey} (attempt ${entry.attemptCount})`)
    .join(', ');
  const suffix = escalated.length > PUSH_RETRYING_NAMED_KEYS_LIMIT
    ? `, and ${escalated.length - PUSH_RETRYING_NAMED_KEYS_LIMIT} more`
    : '';
  remoteSyncProgressStore = addRemoteSyncIssue(remoteSyncProgressStore, {
    reason: 'push-retrying',
    message: `${escalated.length} sync write${escalated.length === 1 ? '' : 's'} keep failing and are being retried: ${named}${suffix}.`,
    counts: { retrying: escalated.length },
  });
}

/**
 * Post-drain update (not a new refresh trigger): re-reads the durable outbox and re-derives
 * backoff/escalation state right after a real drain finishes, so the menu reflects the outcome
 * without waiting for the next sanctioned refresh. Best-effort; a stale view for a few seconds is
 * acceptable per the P6b policy.
 */
async function refreshRemoteSyncBackoffAndEscalation(): Promise<void> {
  try {
    const entries = await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage());
    applyRemoteSyncBackoffAndEscalation(entries);
    scheduleRemoteSyncProgressEmit();
  } catch {
    // Best-effort; keep whatever backoff/escalation state is already cached.
  }
}







export async function refreshRemoteSyncProgressSnapshot(): Promise<RemoteSyncProgressSnapshot> {
  try {
    const durableEntries = await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage());
    setDurableOutboxCount(durableEntries.length);
    applyRemoteSyncBackoffAndEscalation(durableEntries);
  } catch {
    // Best-effort refresh; keep whatever durable outbox count/backoff/escalation state is already cached.
  }




  try {
    const quarantineCount = (await readQuarantineRecords()).length;
    remoteSyncProgressStore = quarantineCount > 0
      ? addRemoteSyncIssue(remoteSyncProgressStore, {
          reason: 'quarantined-writes',
          message: `${quarantineCount} sync write${quarantineCount === 1 ? '' : 's'} were permanently dropped and need review.`,
          counts: { quarantined: quarantineCount },
        })
      : clearRemoteSyncIssue(remoteSyncProgressStore, 'quarantined-writes');
  } catch {
    // Best-effort; leave whatever quarantined-writes issue state is already cached.
  }

  const identity = storedServerIdentityLabel();
  const needsFullPull = isRemoteSyncFullPullRequired()
    || (identity !== null && readRemoteSyncVersionMetadata(localStorage, identity).needsFullPull);
  remoteSyncProgressStore = needsFullPull
    ? addRemoteSyncIssue(remoteSyncProgressStore, { reason: 'full-pull-required' })
    : clearRemoteSyncIssue(remoteSyncProgressStore, 'full-pull-required');





  await scanRemoteSyncUntrackedLocalItems();

  scheduleRemoteSyncProgressEmit();
  return getRemoteSyncProgressSnapshot();
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







function rememberedItemUpdatedAt(store: RemoteSyncStoreName, itemKey: string, identity?: string): number {
  if (isRemoteSyncItemStateEphemeral()) {
    const raw = localStorage.getItem(itemUpdatedAtKey(store, itemKey));
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) ? value : 0;
  }
  return getRemoteSyncItemMarkers(identity ?? storedServerIdentity(), store, itemKey).updatedAt;
}

function rememberedItemDeletedAt(store: RemoteSyncStoreName, itemKey: string, identity?: string): number {
  if (isRemoteSyncItemStateEphemeral()) {
    const raw = localStorage.getItem(itemDeletedAtKey(store, itemKey));
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) ? value : 0;
  }
  return getRemoteSyncItemMarkers(identity ?? storedServerIdentity(), store, itemKey).deletedAt;
}








function rememberItemUpdatedAt(store: RemoteSyncStoreName, itemKey: string, updatedAt: number, identity?: string): Promise<void> {
  const value = Math.max(0, Math.floor(updatedAt));
  if (isRemoteSyncItemStateEphemeral()) {
    setLegacySyncStorageItem(itemUpdatedAtKey(store, itemKey), String(value), 'item updated-at marker');
    return Promise.resolve();
  }
  return recordRemoteSyncItemMarkers(identity ?? storedServerIdentity(), [{ store, itemKey, updatedAt: value }]).catch(error => {
    recordRemoteSyncLog('flush', 'error', `Could not persist an updated-at marker: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  });
}

function rememberItemDeletedAt(store: RemoteSyncStoreName, itemKey: string, updatedAt: number, identity?: string): Promise<void> {
  const value = Math.max(0, Math.floor(updatedAt));
  if (isRemoteSyncItemStateEphemeral()) {
    setLegacySyncStorageItem(itemDeletedAtKey(store, itemKey), String(value), 'item deleted-at marker');
    setLegacySyncStorageItem(itemUpdatedAtKey(store, itemKey), String(value), 'item updated-at marker');
    return Promise.resolve();
  }
  return recordRemoteSyncItemMarkers(identity ?? storedServerIdentity(), [{ store, itemKey, updatedAt: value, deletedAt: value }]).catch(error => {
    recordRemoteSyncLog('flush', 'error', `Could not persist a deleted-at marker: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  });
}

function clearItemDeletedAt(store: RemoteSyncStoreName, itemKey: string, identity?: string): Promise<void> {





  removeLegacySyncStorageItem(itemDeletedAtKey(store, itemKey), 'item deleted-at marker');
  if (isRemoteSyncItemStateEphemeral()) {
    return Promise.resolve();
  }
  return recordRemoteSyncItemMarkers(identity ?? storedServerIdentity(), [{ store, itemKey, deletedAt: null }]).catch(error => {
    recordRemoteSyncLog('flush', 'error', `Could not clear a deleted-at marker: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  });
}







export function clearRemoteSyncDeletedAtMarker(store: RemoteSyncStoreName, itemKey: string): void {
  clearItemDeletedAt(store, itemKey).catch(() => {
    // Already logged by the helper; the void hook cannot propagate. The subsequent enqueue's
    // own marker/suppression handling is the enforcement point.
  });
}








const markerMigrationMemo = new Set<string>();
const MARKER_STORE_NAMES_LONGEST_FIRST = [...REMOTE_SYNC_STORE_NAMES].sort((a, b) => b.length - a.length);

function collectLegacyMarkerRecords(): Array<{ store: string; itemKey: string; updatedAt?: number; deletedAt?: number }> {
  const byKey = new Map<string, { store: string; itemKey: string; updatedAt?: number; deletedAt?: number }>();
  const prefixes: Array<[string, 'updatedAt' | 'deletedAt']> = [
    [ITEM_UPDATED_AT_PREFIX, 'updatedAt'],
    [ITEM_DELETED_AT_PREFIX, 'deletedAt'],
  ];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    for (const [prefix, field] of prefixes) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const store = MARKER_STORE_NAMES_LONGEST_FIRST.find(name => rest.startsWith(`${name}.`));
      if (!store) continue;
      const itemKey = rest.slice(store.length + 1);
      if (!itemKey) continue;
      const raw = localStorage.getItem(key);
      const value = raw ? Number.parseInt(raw, 10) : 0;
      if (!Number.isFinite(value) || value <= 0) continue;
      const mapKey = `${store}\u0000${itemKey}`;
      const record = byKey.get(mapKey) ?? { store, itemKey };
      record[field] = value;
      byKey.set(mapKey, record);
    }
  }
  return Array.from(byKey.values());
}

function removeLegacyMarkerKeys(): void {
  const doomed: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && (key.startsWith(ITEM_UPDATED_AT_PREFIX) || key.startsWith(ITEM_DELETED_AT_PREFIX))) doomed.push(key);
  }
  for (const key of doomed) removeLegacySyncStorageItem(key, 'legacy item marker');
}



export function resetMarkerMigrationMemoForTests(): void {
  markerMigrationMemo.clear();
}





export async function ensureRemoteSyncItemStateReadiness(): Promise<void> {
  await ensureRemoteSyncItemStateActive(storedServerIdentity());
}




async function ensureRemoteSyncItemStateActive(identity: string): Promise<string> {





  let gateIdentity = identity;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await activateItemStateForIdentity(gateIdentity);
    const current = storedServerIdentity();



    if (current === gateIdentity) return gateIdentity;
    gateIdentity = current;
  }
  // Reject explicitly at the cap (Sol Important-2): an unverified "ready" here would recreate
  // the original cold-identity throw downstream. Identity churn is a login-time event; the
  // caller's retry after login settles succeeds.
  throw new Error('RemoteSync identity kept changing during sync activation; retry after login settles.');
}

async function activateItemStateForIdentity(identity: string): Promise<void> {
  await ensureRemoteSyncItemVersionsActive(localStorage, identity);
  if (!isRemoteSyncItemStateEphemeral() && !markerMigrationMemo.has(identity)) {
    await migrateRemoteSyncItemMarkersToIdb(identity, collectLegacyMarkerRecords(), {
      cleanupLocalStorage: () => removeLegacyMarkerKeys(),
    });
    markerMigrationMemo.add(identity);
    // The migration invalidates the cache after committing its rows — re-hydrate so the
    // synchronous marker reads on this entry path are valid again.
    await ensureRemoteSyncItemStateReady(identity);
  }
}






const SUPPRESSED_ENQUEUE_COUNT_PREFIX = 'chesspatzer.remoteSync.suppressedEnqueueCount.';
const loggedSuppressedEnqueueKeys = new Set<string>();

function suppressedEnqueueCountKey(store: RemoteSyncStoreName): string {
  return `${SUPPRESSED_ENQUEUE_COUNT_PREFIX}${store}`;
}

function readSuppressedEnqueueCount(store: RemoteSyncStoreName): number {
  const raw = localStorage.getItem(suppressedEnqueueCountKey(store));
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function incrementSuppressedEnqueueCount(store: RemoteSyncStoreName): number {
  const next = readSuppressedEnqueueCount(store) + 1;
  setLegacySyncStorageItem(suppressedEnqueueCountKey(store), String(next), 'suppressed-enqueue counter');
  return next;
}

/** Never-silent hook for the two enqueue-side suppression checks (single + batch, below). Always
 * bumps the durable counter; logs once per store+itemKey per session (module lifetime) so a
 * repeatedly-retried write against the same shadowed item cannot spam the Sync Log. */
function recordSuppressedRemoteSyncEnqueue(store: RemoteSyncStoreName, itemKey: string): void {
  const count = incrementSuppressedEnqueueCount(store);
  const sessionKey = `${store}\u0000${itemKey}`;
  if (loggedSuppressedEnqueueKeys.has(sessionKey)) return;
  loggedSuppressedEnqueueKeys.add(sessionKey);
  recordRemoteSyncLog(
    'flush',
    'info',
    `Local write for ${store}/${itemKey} was suppressed: a recorded delete tombstone for this item is newer or equal. Run "Queue local library for sync" to recover it if this is unexpected.`,
    { [`suppressedEnqueue:${store}`]: count },
  );
}



export function getSuppressedRemoteSyncEnqueueCounts(): Partial<Record<RemoteSyncStoreName, number>> {
  const counts: Partial<Record<RemoteSyncStoreName, number>> = {};
  for (const store of REMOTE_SYNC_STORE_NAMES) {
    const count = readSuppressedEnqueueCount(store);
    if (count > 0) counts[store] = count;
  }
  return counts;
}














const SERVER_WINS_SILENT_STORES = new Set<RemoteSyncStoreName>(['settings', 'opening-session']);
const SERVER_WINS_CONFLICTS_KEY = 'chesspatzer.remoteSync.serverWinsConflicts';
const SERVER_WINS_CONFLICTS_MAX_KEYS = 5;

export interface RemoteSyncServerWinsConflictKey {
  store: string;
  itemKey: string;
  at: number;
}

export interface RemoteSyncServerWinsConflictRecord {
  count: number;
  lastKeys: RemoteSyncServerWinsConflictKey[];
  updatedAt: number;
}

function isVisibleServerWinsConflictStore(store: RemoteSyncStoreName): boolean {
  return !SERVER_WINS_SILENT_STORES.has(store);
}

function isServerWinsConflictKey(value: unknown): value is RemoteSyncServerWinsConflictKey {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.store === 'string' && typeof candidate.itemKey === 'string' && typeof candidate.at === 'number';
}

function readServerWinsConflictRecord(): RemoteSyncServerWinsConflictRecord | null {
  try {
    const raw = localStorage.getItem(SERVER_WINS_CONFLICTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RemoteSyncServerWinsConflictRecord>;
    if (typeof parsed.count !== 'number' || !Array.isArray(parsed.lastKeys)) return null;
    return {
      count: Math.max(0, Math.floor(parsed.count)),
      lastKeys: parsed.lastKeys.filter(isServerWinsConflictKey).slice(0, SERVER_WINS_CONFLICTS_MAX_KEYS),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function serverWinsConflictIssueMessage(record: RemoteSyncServerWinsConflictRecord): string {
  const named = record.lastKeys.map(key => `${key.store}/${key.itemKey}`).join(', ');
  return `${record.count} server-wins conflict${record.count === 1 ? '' : 's'} dropped local change${record.count === 1 ? '' : 's'}: ${named}.`;
}

function applyServerWinsConflictIssue(record: RemoteSyncServerWinsConflictRecord): void {
  remoteSyncProgressStore = addRemoteSyncIssue(remoteSyncProgressStore, {
    reason: 'server-wins-conflicts',
    message: serverWinsConflictIssueMessage(record),
    counts: { serverWins: record.count },
    at: record.updatedAt || Date.now(),
  });
  scheduleRemoteSyncProgressEmit();
}

/**
 * Records a server-wins conflict (P2c) when the affected store is visible per the audit's G-1
 * policy; a no-op for silent stores (settings, opening-session). Persists a small rolling
 * localStorage record (count + last 5 store/itemKeys + timestamp) and raises/updates the
 * server-wins-conflicts warning issue. Called from this module's conflictAdapter.applyCurrent
 * below — every call there is a server-wins resolution, never a reenqueue.
 */
function recordServerWinsConflictIfVisible(
  store: RemoteSyncStoreName,
  itemKey: string,
  now: number = Date.now(),
): void {
  if (!isVisibleServerWinsConflictStore(store)) return;
  const existing = readServerWinsConflictRecord();
  const record: RemoteSyncServerWinsConflictRecord = {
    count: (existing?.count ?? 0) + 1,
    lastKeys: [{ store, itemKey, at: now }, ...(existing?.lastKeys ?? [])].slice(0, SERVER_WINS_CONFLICTS_MAX_KEYS),
    updatedAt: now,
  };
  try {
    localStorage.setItem(SERVER_WINS_CONFLICTS_KEY, JSON.stringify(record));
  } catch {
    // Persisting the rolling record is best-effort; the issue is still raised in-memory below so
    // this tab still surfaces it even if the localStorage write failed (e.g. quota exceeded).
  }
  applyServerWinsConflictIssue(record);
}

/**
 * Menu "Dismiss" action (P2c): clears the persistent server-wins-conflicts record and its
 * progress issue. Purely a visibility reset — the server's version already won when the conflict
 * was resolved; this does not touch any sync data or re-enqueue anything.
 */
export function dismissServerWinsConflicts(): void {
  try {
    localStorage.removeItem(SERVER_WINS_CONFLICTS_KEY);
  } catch {
    // Best-effort; clearing the in-memory issue below still stops the menu from showing it.
  }
  clearRemoteSyncProgressIssue('server-wins-conflicts');
}

// Rehydrate the server-wins-conflicts issue from its persistent record at module load, mirroring
// the denominator-restore bootstrap above — the in-memory progress store is fresh on every
// reload, but the visibility record (and thus the issue) should survive until explicitly
// dismissed.
if (typeof localStorage !== 'undefined') {
  const persistedServerWinsConflicts = readServerWinsConflictRecord();
  if (persistedServerWinsConflicts && persistedServerWinsConflicts.count > 0) {
    applyServerWinsConflictIssue(persistedServerWinsConflicts);
  }
}









function localVersionForItem(
  spec: IdbStoreSpec,
  itemKey: string,
  existing: unknown | undefined,
): number {
  return Math.max(
    existing === undefined ? 0 : spec.updatedAt(existing),
    rememberedItemUpdatedAt(spec.store, itemKey),
    rememberedItemDeletedAt(spec.store, itemKey),
  );
}





function isTombstoneShadowedLocalSnapshotItem(
  store: RemoteSyncStoreName,
  itemKey: string,
  payloadUpdatedAt: number,
): boolean {



  const deletedAt = rememberedItemDeletedAt(store, itemKey);
  return deletedAt > 0 && payloadUpdatedAt <= deletedAt;
}

function shouldSuppressLocalSnapshotItem(
  store: RemoteSyncStoreName,
  itemKey: string,
  payloadUpdatedAt: number,
): boolean {
  if (isActiveDataManagementDeleteKey(store, itemKey)) return true;
  return isTombstoneShadowedLocalSnapshotItem(store, itemKey, payloadUpdatedAt);
}

export function shouldSuppressRemoteSyncUpsert(
  store: RemoteSyncStoreName,
  itemKey: string,
  updatedAt: number,
  identity?: string,
): boolean {
  if (isActiveDataManagementDeleteKey(store, itemKey)) return true;


  const deletedAt = rememberedItemDeletedAt(store, itemKey, identity);
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

/** Cheap key-only read: uses IDBObjectStore.getAllKeys() instead of a full cursor-over-values
 * scan. Only valid for stores whose IDB primary key already equals the sync itemKey (see
 * readLocalStoreItemKeys below for which keyModes qualify). */
function readAllKeysFromStore(db: IDBDatabase, storeName: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve([]);
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(key => String(key)));
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







  const payloadKey = spec.keyForRecord(payload, itemKey);
  if (!payloadKey || payloadKey !== itemKey) {
    throw new Error(`Remote sync payload key mismatch for ${spec.store}.`);
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





function readLocalSettingsItemKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isAllowedSettingKey(key) && localStorage.getItem(key) !== null) keys.push(key);
  }
  return keys;
}





function readLocalSettingsItems(options: { includeSuppressed?: boolean } = {}): RemoteSyncItem[] {
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
    if (isActiveDataManagementDeleteKey('settings', key)) continue;
    if (!options.includeSuppressed && isTombstoneShadowedLocalSnapshotItem('settings', key, updatedAt)) continue;
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

async function applySettingItem(item: RemoteSyncItem, applyIdentity: string): Promise<'applied' | RemoteSyncSkippedApplyResult> {
  if (!isAllowedSettingKey(item.itemKey)) return { skipped: 'disallowed-setting' };
  if (item.updatedAt < settingUpdatedAt(item.itemKey)) return { skipped: 'stale-remote' };
  if (!isDeletedItem(item) && shouldSuppressRemoteSyncUpsert('settings', item.itemKey, item.updatedAt, applyIdentity)) return { skipped: 'suppressed-upsert' };
  if (isDeletedItem(item)) {
    withSettingsRemoteApplySuppressed(() => {
      localStorage.removeItem(item.itemKey);
      setSettingUpdatedAt(item.itemKey, item.updatedAt);
    });


    await rememberItemDeletedAt('settings', item.itemKey, item.updatedAt, applyIdentity);
    return 'applied';
  }
  const value = payloadSettingValue(item.payload, item.itemKey);
  if (value === undefined) return { skipped: 'invalid-payload' };
  withSettingsRemoteApplySuppressed(() => {
    localStorage.setItem(item.itemKey, value);
    setSettingUpdatedAt(item.itemKey, item.updatedAt);
  });
  await clearItemDeletedAt('settings', item.itemKey, applyIdentity);
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
  if (activeDataManagementDelete) return;









  void pullFromRemoteSync({
    flushAfter: !isRemoteSyncFullPullRequired(),
    logNoop: false,
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


  inFlightRemoteSyncPull = null;
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
}

export function logoutRemoteSync(): void {
  clearRemoteSyncToken();
  stopRemoteSyncAutoSync();
  recordRemoteSyncLog('logout', 'info', 'Token session cleared for this browser.');
}

function clearRemoteSyncMarkers(options: { clearOutbox?: boolean; clearGeneration?: boolean; clearFullPull?: boolean } = {}): void {



  const clearingIdentity = storedServerIdentity();
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






  resetRemoteSyncItemState(clearingIdentity, { rebuildMarkers: buildMarkerRebuildCover })
    .catch(error => {
      recordRemoteSyncLog('logout', 'error', `Could not clear per-item sync state: ${error instanceof Error ? error.message : String(error)}`);
    });
  markerMigrationMemo.delete(clearingIdentity);
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







  resetCurrentIdentityVersionMetadata();
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

function writeOutboxSnapshot(items: RemoteSyncItem[], preservedInvalid: unknown[] = []): void {
  const next = [...preservedInvalid, ...items];
  if (next.length === 0) {
    removeLegacySyncStorageItem(OUTBOX_KEY, 'outbox snapshot');
    return;
  }
  setLegacySyncStorageItem(OUTBOX_KEY, JSON.stringify(next), 'outbox snapshot');
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



export async function waitForPendingRemoteSyncEnqueues(): Promise<void> {
  await waitForPendingVersionedOutboxWrites();
  await waitForRemoteSyncItemStateWrites();
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



let durableOutboxCountEpoch = 0;





let outboxCountChannel: BroadcastChannel | null = null;
let outboxCountChannelFailed = false;

function outboxCountPeerChannel(): BroadcastChannel | null {
  if (outboxCountChannel || outboxCountChannelFailed) return outboxCountChannel;
  if (typeof BroadcastChannel === 'undefined') {
    outboxCountChannelFailed = true;
    return null;
  }
  try {
    outboxCountChannel = new BroadcastChannel('patzer-remoteSync-outbox-count');
    outboxCountChannel.onmessage = () => {
      durableOutboxCountEpoch += 1;
      durableOutboxCountCache = null;
    };
    // Node test harnesses: the global BroadcastChannel would otherwise hold the event loop.
    (outboxCountChannel as { unref?: () => void }).unref?.();
  } catch {
    outboxCountChannelFailed = true;
    outboxCountChannel = null;
  }
  return outboxCountChannel;
}

function publishOutboxCountInvalidation(): void {
  try {
    outboxCountPeerChannel()?.postMessage({ type: 'outbox-count-invalidated' });
  } catch {
    // Best-effort: a failed broadcast only delays the peer tab's next re-prime.
  }
}

function invalidateDurableOutboxCount(): void {
  durableOutboxCountEpoch += 1;
  durableOutboxCountCache = null;
  publishOutboxCountInvalidation();
}

function setDurableOutboxCount(value: number): void {
  durableOutboxCountEpoch += 1;
  durableOutboxCountCache = value;
  // Peers cannot trust this tab's value (their epoch differs) — they invalidate and re-prime.
  publishOutboxCountInvalidation();
}

async function enqueueVersionedOutboxItem(item: RemoteSyncItem, operationIdentity?: string): Promise<void> {
  const deleted = isDeletedItem(item);
  const payload = deleted ? undefined : item.payload;




  const identity = operationIdentity ?? await ensureRemoteSyncItemStateActive(storedServerIdentity());
  const baseVersion = getRemoteSyncItemStateVersion(identity, item.store, item.itemKey);
  await enqueueDurableVersionedOutboxEntry(defaultDurableVersionedOutboxStorage(), {
    store: item.store,
    itemKey: item.itemKey,
    operation: deleted ? 'delete' : 'upsert',
    baseVersion,
    clientUpdatedAt: item.updatedAt,
    ...(deleted ? {} : { payload }),
  });
}

async function enqueueVersionedOutboxItemsBatch(items: readonly RemoteSyncItem[], operationIdentity?: string): Promise<void> {
  if (items.length === 0) return;
  const identity = operationIdentity ?? await ensureRemoteSyncItemStateActive(storedServerIdentity());
  const resolveVersion = createRemoteSyncItemStateResolver(identity);
  await enqueueDurableVersionedOutboxEntries(defaultDurableVersionedOutboxStorage(), items.map(item => {
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





  try {
    setDurableOutboxCount(await countDurableVersionedOutboxEntries(defaultDurableVersionedOutboxStorage()));
  } catch {
    invalidateDurableOutboxCount();
  }
}











function buildMarkerRebuildCover(rawEntries: readonly unknown[]): RemoteSyncItemMarkerMaxMutation[] {
  if (isRemoteSyncItemStateEphemeral()) return [];
  return collectOutboxMarkerCoverFromRaw(rawEntries);
}






const LEGACY_OUTBOX_MIRROR_SENTINEL_KEY = 'legacy-outbox-mirror';

async function migrateLegacyOutboxToVersioned(operationIdentity?: string): Promise<number> {
  // Ephemeral posture (no usable IDB): the mirror IS the queue — there is no durable
  // destination, so the pre-wave behavior stands untouched.
  if (isRemoteSyncItemStateEphemeral()) return 0;




  let raw: string | null;
  try {
    raw = localStorage.getItem(OUTBOX_KEY);
  } catch {
    raw = null;
  }
  if (raw === null || raw === '') return 0;
  const snapshot: OutboxSnapshot = { valid: [], preservedInvalid: [] };
  let topLevelMalformed: 'unparseable-json' | 'non-array-json' | null = null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    topLevelMalformed = 'unparseable-json';
  }
  if (topLevelMalformed === null && !Array.isArray(parsed)) topLevelMalformed = 'non-array-json';
  if (topLevelMalformed !== null) {
    snapshot.preservedInvalid.push({ legacyOutboxTopLevel: topLevelMalformed, raw });
  } else {
    for (const item of parsed as unknown[]) {
      const normalized = normalizeSyncItem(item, { logInvalid: true, logAction: 'system' });
      if (normalized) snapshot.valid.push(normalized);
      else snapshot.preservedInvalid.push(item);
    }
  }
  const identity = operationIdentity ?? await ensureRemoteSyncItemStateActive(storedServerIdentity());
  const result = await migrateDurableLegacyOutboxMirror(defaultDurableVersionedOutboxStorage(), {
    validInputs: snapshot.valid.map(item => {
      const deleted = isDeletedItem(item);
      return {
        store: item.store,
        itemKey: item.itemKey,
        operation: deleted ? 'delete' as const : 'upsert' as const,
        baseVersion: getRemoteSyncItemStateVersion(identity, item.store, item.itemKey),
        clientUpdatedAt: item.updatedAt,
        ...(deleted ? {} : { payload: item.payload }),
      };
    }),
    malformedValues: snapshot.preservedInvalid,
    sentinelRow: {
      key: LEGACY_OUTBOX_MIRROR_SENTINEL_KEY,
      migratedAt: Date.now(),
      migrated: snapshot.valid.length,
      recovered: snapshot.preservedInvalid.length,
    },
  });
  invalidateDurableOutboxCount();
  if (result.atomic) {




    let currentRaw: string | null;
    try {
      currentRaw = localStorage.getItem(OUTBOX_KEY);
    } catch {
      currentRaw = null;
    }
    if (currentRaw === raw) {
      removeLegacySyncStorageItem(OUTBOX_KEY, 'outbox snapshot');
    } else if (currentRaw !== null) {
      recordRemoteSyncLog('flush', 'info', 'The legacy outbox key changed during migration (another tab wrote it); the residue is retained for the next sweep.');
    }
  } else {
    // Non-atomic fallback: the malformed values have no recovery store, so the key stays as
    // their holding pen (exactly the pre-wave posture) — unless the top level itself was the
    // malformed value, which cannot round-trip through writeOutboxSnapshot; leave it in place.
    // Same compare-before-write guard as the atomic path: a concurrent tab write wins.
    let fallbackRaw: string | null;
    try {
      fallbackRaw = localStorage.getItem(OUTBOX_KEY);
    } catch {
      fallbackRaw = null;
    }
    if (topLevelMalformed === null && fallbackRaw === raw) writeOutboxSnapshot([], snapshot.preservedInvalid);
  }
  if (result.recovered > 0) {
    recordRemoteSyncLog('flush', 'info', `Preserved ${result.recovered} unreadable legacy outbox value(s) into the durable recovery store during mirror retirement.`);
  }
  return snapshot.valid.length;
}





async function removeOutboxItemsForCommittedDeletes(items: RemoteSyncItem[]): Promise<void> {
  const tombstones = items.filter(isDeletedItem);
  if (tombstones.length === 0) return;
  if (isRemoteSyncItemStateEphemeral()) {
    const ids = tombstones.map(item => ({ ...item, id: deleteKeyId(item.store, item.itemKey) }));
    const current = readOutboxSnapshot({ logInvalid: true });
    const valid = current.valid.filter(item => {
      const tombstone = ids.find(entry => entry.id === deleteKeyId(item.store, item.itemKey));
      return !tombstone || item.updatedAt > tombstone.updatedAt;
    });
    writeOutboxSnapshot(valid, current.preservedInvalid);
    return;
  }
  const removed = await removeDurableVersionedOutboxEntriesForCommittedDeletes(
    defaultDurableVersionedOutboxStorage(),
    tombstones.map(item => ({ store: item.store, itemKey: item.itemKey, updatedAt: item.updatedAt })),
  );
  if (removed > 0) invalidateDurableOutboxCount();
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
  invalidateDurableOutboxCount();




  queuePendingVersionedOutboxWrite((async () => {
    // ONE identity per attempt (round 5, Sol Critical-1): suppression, markers, and the CAS
    // base must never split accounts. If the stored identity moved during the marker awaits,
    // RESTART the whole attempt under the new identity before anything durable commits.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Chain drain FIRST (rule 6), gate LAST (round 4): no await sits between the stabilized
      // identity and the synchronous suppression read below.
      await waitForRemoteSyncItemStateWrites();
      const opIdentity = await ensureRemoteSyncItemStateActive(storedServerIdentity());
      if (!isDeletedItem(normalized) && shouldSuppressRemoteSyncUpsert(normalized.store, normalized.itemKey, normalized.updatedAt, opIdentity)) {
        recordSuppressedRemoteSyncEnqueue(normalized.store, normalized.itemKey);
        return;
      }
      const priorMarkers = isRemoteSyncItemStateEphemeral() ? null : getRemoteSyncItemMarkers(opIdentity, normalized.store, normalized.itemKey);
      const markerValue = Math.max(0, Math.floor(normalized.updatedAt));
      const produced = isDeletedItem(normalized)
        ? { updatedAt: markerValue, deletedAt: markerValue }
        : { updatedAt: markerValue, deletedAt: 0 };
      if (isDeletedItem(normalized)) await rememberItemDeletedAt(normalized.store, normalized.itemKey, normalized.updatedAt, opIdentity);
      else {
        await rememberItemUpdatedAt(normalized.store, normalized.itemKey, normalized.updatedAt, opIdentity);
        await clearItemDeletedAt(normalized.store, normalized.itemKey, opIdentity);
      }
      if (storedServerIdentity() !== opIdentity) {
        // Identity moved during the marker awaits: COMPENSATE before restarting (round 6),
        // CONDITIONALLY (round 8) — restore only while the durable row still holds exactly what
        // this abandoned attempt produced, so a legitimately-newer concurrent marker survives.
        // Failure is NOT best-effort (round 7): log and abort so the abandoned tombstone is
        // visible, never silently load-bearing.
        if (priorMarkers) {
          try {
            await restoreRemoteSyncItemMarkersIfUnchanged(opIdentity, [{
              store: normalized.store,
              itemKey: normalized.itemKey,
              expectedUpdatedAt: produced.updatedAt,
              expectedDeletedAt: produced.deletedAt,
              updatedAt: priorMarkers.updatedAt > 0 ? priorMarkers.updatedAt : null,
              deletedAt: priorMarkers.deletedAt > 0 ? priorMarkers.deletedAt : null,
            }]);
          } catch (error) {
            recordRemoteSyncLog('flush', 'error', `Could not restore markers for ${normalized.store}/${normalized.itemKey} after an identity change; the write was NOT queued: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
          }
        }
        continue;
      }




      if (isRemoteSyncItemStateEphemeral()) {
        const snapshot = readOutboxSnapshot({ logInvalid: true });
        writeOutboxSnapshot(mergeOutboxItem(snapshot.valid, normalized), snapshot.preservedInvalid);
      }
      await enqueueVersionedOutboxItem(normalized, opIdentity);



      invalidateDurableOutboxCount();
      return;
    }
    throw new Error('RemoteSync identity kept changing during enqueue; retry after login settles.');
  })().catch(error => {
    const message = error instanceof Error ? error.message : 'Could not persist versioned RemoteSync outbox entry.';
    recordRemoteSyncLog('flush', 'error', message);
  }));
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
  // Normalization stays synchronous (invalid items must still throw to the caller); the
  // suppression decisions move inside the queued work (Wave 6, design rule 5) where the
  // hydrated marker cache is guaranteed.
  const candidates: RemoteSyncItem[] = [];
  for (const item of items) {
    const entry = normalizeSyncItem(item);
    if (!entry) throw new Error('Invalid Remote sync item.');
    candidates.push(entry);
  }
  const normalized: RemoteSyncItem[] = [];
  const queueOpId = safeBeginProgress('queueing', { total: candidates.length });
  queuePendingVersionedOutboxWrite((async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await waitForRemoteSyncItemStateWrites();
      const opIdentity = await ensureRemoteSyncItemStateActive(storedServerIdentity());
      normalized.length = 0;
      for (const entry of candidates) {
        if (!isDeletedItem(entry) && shouldSuppressRemoteSyncUpsert(entry.store, entry.itemKey, entry.updatedAt, opIdentity)) {
          recordSuppressedRemoteSyncEnqueue(entry.store, entry.itemKey);
          continue;
        }
        normalized.push(entry);
      }
      if (normalized.length === 0) return;
      const priorByKey = new Map<string, { updatedAt: number; deletedAt: number }>();
      const producedByKey = new Map<string, { updatedAt: number; deletedAt: number }>();
      for (const entry of normalized) {
        // FIRST-SIGHT capture only (round 7, Sol Important-3): a duplicate key's second pass
        // must not overwrite the true pre-attempt prior with the first pass's fresh mutation.
        const priorKey = `${entry.store}\u0000${entry.itemKey}`;
        if (!isRemoteSyncItemStateEphemeral() && !priorByKey.has(priorKey)) {
          priorByKey.set(priorKey, getRemoteSyncItemMarkers(opIdentity, entry.store, entry.itemKey));
        }
        const entryValue = Math.max(0, Math.floor(entry.updatedAt));
        producedByKey.set(priorKey, isDeletedItem(entry)
          ? { updatedAt: entryValue, deletedAt: entryValue }
          : { updatedAt: entryValue, deletedAt: 0 });
        if (isDeletedItem(entry)) await rememberItemDeletedAt(entry.store, entry.itemKey, entry.updatedAt, opIdentity);
        else {
          await rememberItemUpdatedAt(entry.store, entry.itemKey, entry.updatedAt, opIdentity);
          await clearItemDeletedAt(entry.store, entry.itemKey, opIdentity);
        }
      }
      if (storedServerIdentity() !== opIdentity) {
        // Compensate the abandoned identity's marker mutations before restarting (round 6).
        const seenRestore = new Set<string>();
        const restores: RemoteSyncItemMarkerRestore[] = [];
        for (const entry of normalized) {
          const priorKey = `${entry.store}\u0000${entry.itemKey}`;
          if (!priorByKey.has(priorKey) || seenRestore.has(priorKey)) continue;
          seenRestore.add(priorKey);
          const prior = priorByKey.get(priorKey)!;
          const produced = producedByKey.get(priorKey)!;
          restores.push({
            store: entry.store,
            itemKey: entry.itemKey,
            expectedUpdatedAt: produced.updatedAt,
            expectedDeletedAt: produced.deletedAt,
            updatedAt: prior.updatedAt > 0 ? prior.updatedAt : null,
            deletedAt: prior.deletedAt > 0 ? prior.deletedAt : null,
          });
        }
        if (restores.length > 0) {
          try {
            await restoreRemoteSyncItemMarkersIfUnchanged(opIdentity, restores);
          } catch (error) {
            recordRemoteSyncLog('flush', 'error', `Could not restore ${restores.length} marker(s) after an identity change; the batch was NOT queued: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
          }
        }
        continue;
      }
      await enqueueVersionedOutboxItemsBatch(normalized, opIdentity);
      return;
    }
    throw new Error('RemoteSync identity kept changing during batch enqueue; retry after login settles.');
  })().then(() => {
    safeCompleteProgress(queueOpId);
    safeClearProgressIssue('durable-enqueue-failed');




    invalidateRemoteSyncUntrackedScanCache();
    void scanRemoteSyncUntrackedLocalItems();
  }).catch(error => {
    const message = error instanceof Error ? error.message : 'Could not persist versioned RemoteSync outbox entries.';
    recordRemoteSyncLog('flush', 'error', message);
    // BUG-2026-07-04-003: a durable-outbox write failure here previously vanished silently
    // (only a debug log entry, no user-visible signal). This issue must never go unraised again.
    safeFailProgress(queueOpId, {
      reason: 'durable-enqueue-failed',
      message,
      counts: { failedItems: normalized.length > 0 ? normalized.length : candidates.length },
    });
  }));
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





let durableOutboxCountPrime: Promise<void> | null = null;

function primeDurableOutboxCount(): void {
  if (durableOutboxCountPrime) return;
  durableOutboxCountPrime = (async () => {



    const epoch = durableOutboxCountEpoch;
    try {
      const count = await countDurableVersionedOutboxEntries(defaultDurableVersionedOutboxStorage());
      if (epoch === durableOutboxCountEpoch) durableOutboxCountCache = count;
    } catch {
      // Cache stays null; the next count call retries.
    } finally {
      durableOutboxCountPrime = null;
    }
  })();
}

export function getRemoteSyncOutboxCount(): number {
  // Ephemeral posture (no usable IDB): the legacy mirror is still the queue there — Wave 7
  // retired it only where a durable outbox exists.
  if (isRemoteSyncItemStateEphemeral()) {
    const snapshot = readOutboxSnapshot();
    return snapshot.valid.length + snapshot.preservedInvalid.length;
  }
  if (durableOutboxCountCache === null) primeDurableOutboxCount();
  return durableOutboxCountCache ?? 0;
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












type VersionedPullCursorMode = 'set' | 'advance' | 'none';
async function rememberVersionedPullMetadata(items: readonly unknown[], latestVersion: unknown, cursorMode: VersionedPullCursorMode): Promise<number> {
  const latest = typeof latestVersion === 'number' && Number.isFinite(latestVersion) && latestVersion >= 0
    ? Math.floor(latestVersion)
    : 0;
  // One metadata write for the whole pull: rewriting the blob per row froze the page at
  // pull completion once the library passed 10k rows (BUG-2026-07-04-006).
  const records: RemoteSyncItemVersionRecord[] = [];
  for (const raw of items) {
    const item = objectValue(raw);
    const store = typeof item?.store === 'string' ? item.store as RemoteSyncStoreName : null;
    const itemKey = typeof item?.itemKey === 'string' ? item.itemKey : null;
    const version = typeof item?.version === 'number' && Number.isFinite(item.version) && item.version >= 0
      ? Math.floor(item.version)
      : null;
    if (!store || !itemKey || version === null) continue;
    records.push({ store, itemKey, version });
  }




  const identity = await ensureRemoteSyncItemStateActive(storedServerIdentity());
  await recordRemoteSyncItemStateVersions(identity, records);
  const recordMax = records.reduce((max, record) => Math.max(max, record.version), latest);
  const latestRecorded = recordRemoteSyncItemVersions(localStorage, identity, [], recordMax);
  if (cursorMode === 'set') {
    setRemoteSyncPullCursor(localStorage, identity, latest);
  } else if (cursorMode === 'advance') {
    advanceRemoteSyncPullCursor(localStorage, identity, latest);
  }
  return latestRecorded;
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
  const cursor = forcedFullPull ? 0 : metadata.pullCursor;
  return {
    mode: 'cursor',
    path: `pull.php?cursor=${encodeURIComponent(String(cursor))}`,
    cursor,
    forcedFullPull,
  };
}

function planRevalidationPull(cursor: number): RemoteSyncCursorPullPlan {
  return {
    mode: 'cursor',
    path: `pull.php?cursor=${encodeURIComponent(String(cursor))}`,
    cursor,
    forcedFullPull: cursor === 0,
  };
}

// Debug-only label for a plan's effective strength ('since' | 'cursor' | 'full') -- used solely by
// the coordinator's quiet console.debug notes, never by any decision logic.
function describePullPlan(plan: RemoteSyncPullPlan): string {
  if (plan.mode === 'since') return 'since';
  return plan.forcedFullPull ? 'full' : 'cursor';
}





function pullSatisfiesRequest(inFlightPlan: RemoteSyncPullPlan, requestedPlan: RemoteSyncPullPlan): boolean {
  if (requestedPlan.mode === 'since') return false;
  if (inFlightPlan.mode === 'since') return false;
  if (inFlightPlan.forcedFullPull) return true;
  return !requestedPlan.forcedFullPull;
}





function registerInFlightPull(
  plan: RemoteSyncPullPlan,
  options: RemoteSyncPullOptions,
  execute: () => Promise<RemoteSyncPullOutcome>,
): Promise<RemoteSyncPullOutcome> {
  let record: InFlightRemoteSyncPull;
  const promise = execute().finally(() => {
    if (inFlightRemoteSyncPull === record) inFlightRemoteSyncPull = null;
  });
  record = { promise, plan, options };
  inFlightRemoteSyncPull = record;
  return promise;
}

// A coalesced requester that wanted flushAfter:true whose satisfying pull ran with flushAfter:false
// (or was flush-ineligible, e.g. a full pull) performs the flush step itself -- but never forces a
// flush the satisfying pull was not eligible for (a full pull never auto-flushes, matching a
// direct, uncoalesced call with the same plan).
async function applyTrailingFlushIfNeeded(outcome: RemoteSyncPullOutcome, options: RemoteSyncPullOptions): Promise<SyncResult> {
  if (!options.flushAfter || outcome.flushed || !outcome.flushEligible || !outcome.result.success) return outcome.result;
  const flush = await flushRemoteSyncOutbox();
  if (!flush.success) {
    return {
      success: false,
      error: flush.error || 'Remote sync flush failed.',
      counts: { ...(outcome.result.counts ?? {}), ...(flush.counts ?? {}) },
    };
  }
  const counts = { ...(outcome.result.counts ?? {}) };
  mergeCounts(counts, flush.counts);
  return { success: true, counts };
}

// Adapts a coordinator outcome to the pre-write gate's exact `{ ok, latestVersion, error }`
// contract. When the in-flight pull that satisfied this revalidation request was itself a
// revalidation run, `outcome.revalidation` is the original, non-reconstructed result. Otherwise
// (coalesced with a routine/boot/push pull) this re-derives the same contract from the SyncResult,
// preserving the generation-cancellation check applyVersionedRevalidationPull itself performs.
function revalidationResultFromOutcome(
  outcome: RemoteSyncPullOutcome,
  generation: number,
): { ok: boolean; latestVersion?: number; error?: string } {
  if (outcome.revalidation) return outcome.revalidation;
  if (!outcome.result.success) {
    return { ok: false, error: outcome.result.error || 'RemoteSync pre-write revalidation failed.' };
  }
  const counts = outcome.result.counts ?? {};
  if ((counts.cancelled ?? 0) > 0 || syncGeneration !== generation || !hasRemoteSyncToken()) {
    return { ok: false, error: 'RemoteSync pre-write revalidation was cancelled before cursor metadata advanced.' };
  }
  if ((counts.versionMetadataDeferred ?? 0) > 0) {
    return { ok: false, error: 'RemoteSync pre-write revalidation skipped remote rows; pull the token database before pushing.' };
  }
  return counts.latestVersion !== undefined ? { ok: true, latestVersion: counts.latestVersion } : { ok: true };
}

function canAdvancePullVersionMetadata(counts: Record<string, number>): boolean {
  return (counts.cancelled ?? 0) === 0
    && (counts.skipped ?? 0) === 0
    && (counts.skippedMalformedJson ?? 0) === 0;
}

async function applyVersionedRevalidationPull(
  result: PullResponse,
  generation: number,
  forcedFullPull = false,
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
    markVersionedPullUnsafeSkipped(counts);
    return { ok: false, error: 'RemoteSync pre-write revalidation skipped remote rows; pull the token database before pushing.' };
  }
  const latestVersion = await rememberVersionedPullMetadata(items, result.latestVersion, forcedFullPull ? 'set' : 'advance');
  clearVersionedPullUnsafeSkipped();
  return { ok: true, latestVersion };
}






async function executeRevalidationPull(plan: RemoteSyncCursorPullPlan, generation: number): Promise<RemoteSyncPullOutcome> {
  const initial = await remoteSyncFetch<PullResponse>(plan.path);
  let response = initial;
  let forcedFullPull = plan.forcedFullPull;
  if (!initial.ok && shouldRunFullVersionedPull(initial)) {
    recordRemoteSyncLog('pull', 'info', 'Version cursor was too old; running full versioned pull before write drain.');
    response = await remoteSyncFetch<PullResponse>('pull.php?cursor=0');
    forcedFullPull = true;
  }
  const revalidation = await applyVersionedRevalidationPull(response, generation, forcedFullPull);
  const result: SyncResult = revalidation.ok
    ? { success: true, counts: revalidation.latestVersion !== undefined ? { latestVersion: revalidation.latestVersion } : {} }
    : { success: false, error: revalidation.error ?? 'RemoteSync pre-write revalidation failed.' };
  return { result, flushEligible: false, flushed: false, revalidation };
}







async function revalidateBeforeVersionedDrain(cursor: number): Promise<{ ok: boolean; latestVersion?: number; error?: string }> {
  const generation = syncGeneration;
  const plan = planRevalidationPull(cursor);
  const current = inFlightRemoteSyncPull;

  if (current && pullSatisfiesRequest(current.plan, plan)) {
    console.debug('[remote-sync] pre-write revalidation coalesced into an in-flight pull', { cursor });
    const outcome = await current.promise;
    return revalidationResultFromOutcome(outcome, generation);
  }
  if (current) {
    console.debug('[remote-sync] pre-write revalidation chained after a weaker in-flight pull', { cursor });
    await current.promise.catch(() => {});
  }

  const outcome = await registerInFlightPull(plan, { flushAfter: false }, () => executeRevalidationPull(plan, generation));
  return revalidationResultFromOutcome(outcome, generation);
}






export function buildQuarantineRecordsFromPermanentRejection(
  entries: readonly DurableRetryOutboxEntry[],
  rejections: readonly VersionedRejectedItem[],
  now: number = Date.now(),
): DurableQuarantineRecord[] {
  return entries.map((entry, index) => {
    const rejection = rejections[index];
    return {
      ...entry,
      code: rejection?.code ?? 'unknown',
      message: rejection?.message || `Removed from the sync outbox (${rejection?.code ?? 'unknown'}).`,
      quarantinedAt: now,
    };
  });
}

async function drainVersionedRemoteSyncOutbox(
  progressOptions: { onBatchProgress?: (progress: VersionedOutboxDrainBatchProgress) => void } = {},
): Promise<Record<string, number>> {
  await ensureServerGenerationLoaded();




  const drainIdentity = await ensureRemoteSyncItemStateActive(storedServerIdentity());
  const migrated = await migrateLegacyOutboxToVersioned(drainIdentity);
  await waitForPendingVersionedOutboxWrites();
  const result = await runVersionedPreWriteGate({
    versionStorage: localStorage,
    identity: drainIdentity,
    cloudStateStale: isRemoteSyncCloudStateStale(),
    revalidate: async cursor => revalidateBeforeVersionedDrain(cursor),
    drain: () => drainDurableVersionedOutbox({
      outboxStorage: defaultDurableVersionedOutboxStorage(),
      versionStorage: localStorage,


      identity: drainIdentity,
      clientId: casClientId(),
      sendBatch: sendVersionedWriteBatch,
      ...(progressOptions.onBatchProgress ? { onBatchProgress: progressOptions.onBatchProgress } : {}),


      onMetadataPersistenceFailure: ({ entries, errorName }) => {
        recordRemoteSyncLog(
          'flush',
          'error',
          `SYNC_ITEM_VERSION_PERSISTENCE_FAILED: ${entries.length} queued write(s) could not persist per-item version state (${errorName}). The operations remain queued with backoff and retry automatically; if this repeats, browser storage for this site is failing (quota, private-mode eviction, or a corrupted database).`,
        );
      },
      onPermanentRejection: async (entries, rejections) => {






        try {
          await writeQuarantineRecords(buildQuarantineRecordsFromPermanentRejection(entries, rejections));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not persist quarantine records.';
          recordRemoteSyncLog('flush', 'error', `Failed to persist ${entries.length} quarantine record(s); the writes stay queued and will retry: ${message}`);
          throw error;
        }
        const detail = entries
          .slice(0, 10)
          .map((entry, index) => `${entry.store}/${entry.itemKey} (${rejections[index]?.code ?? 'unknown'})`)
          .join(', ');
        const suffix = entries.length > 10 ? `, and ${entries.length - 10} more` : '';


        recordRemoteSyncLog(
          'flush',
          'error',
          `Quarantined ${entries.length} queued write(s) (permanent rejection): ${detail}${suffix}. They are leaving the live sync outbox; local data is preserved — use the Quarantined writes section on the Sync page to re-queue after the cause is fixed.`,
        );
        invalidateDurableOutboxCount();
      },
      acceptedAdapter: {
        applyAccepted: async accepted => {
          if (accepted.store !== 'accounts') return;
          const counts = await applyRemoteSyncItems([accepted], { generation: syncGeneration });
          emitRemoteSyncApplied(counts, accepted.updatedAt);
        },
      },
      conflictAdapter: {
        applyCurrent: async (current, _conflict, entry) => {







          if (decideRecreateOverTombstone(entry, current)) return;
          const counts = await applyRemoteSyncItems([current], { generation: syncGeneration });
          applySettingsPullLiveIfNeeded(counts, current.updatedAt, [current]);
          emitRemoteSyncApplied(counts, current.updatedAt);






          recordServerWinsConflictIfVisible(current.store, current.itemKey);
        },
        shouldReenqueue: (entry, current) => decideRecreateOverTombstone(entry, current)?.nextWrite ?? null,
        reenqueue: async (op, previous) => {








          const replaced = await replaceDurableVersionedOutboxEntry(defaultDurableVersionedOutboxStorage(), previous.opId, {
            opId: op.opId,
            store: op.store,
            itemKey: op.itemKey,
            operation: op.operation,
            baseVersion: op.baseVersion,
            ...(op.payload !== undefined ? { payload: op.payload } : {}),
            ...(op.clientUpdatedAt !== undefined ? { clientUpdatedAt: op.clientUpdatedAt } : {}),
            ...(op.conflictIntent !== undefined ? { conflictIntent: op.conflictIntent } : {}),
          });
          invalidateDurableOutboxCount();
          if (replaced === null) {
            recordRemoteSyncLog('flush', 'info', `Recreation of ${op.store}/${op.itemKey} cancelled: a newer queued delete wins over the re-import.`);
            return;
          }
          recordRemoteSyncLog('flush', 'info', `Re-imported ${op.store}/${op.itemKey} recreates a deleted server row: rebased onto the tombstone version and re-queued (explicit import intent).`);
          // The rebased retry is due now — drain it through the normal debounced flush instead of
          // waiting out the periodic interval (review Minor).
          scheduleRemoteSyncFlush();
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
      // Accepted-write acknowledgment, not a pull: record tombstone versions for CAS bases but
      // never move the pull cursor (audit F-1 — advancing here skips rows other browsers wrote
      // between our last pull and this delete; the next routine pull re-pulls our own tombstones
      // idempotently and advances the cursor itself).
      const latestVersion = await rememberVersionedPullMetadata(result.items ?? [], result.latestVersion, 'none');
      for (const tombstone of tombstones) await rememberItemDeletedAt(tombstone.store, tombstone.itemKey, tombstone.updatedAt);
      await removeOutboxItemsForCommittedDeletes(tombstones);

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

function recordsToSyncItems(
  spec: IdbStoreSpec,
  records: IdbRecord[],
  options: { includeSuppressed?: boolean } = {},
): RemoteSyncItem[] {
  return records.flatMap(record => {
    const itemKey = spec.keyForRecord(record.value, record.primaryKey);
    if (!itemKey) return [];
    const payloadUpdatedAt = spec.updatedAt(record.value);
    if (isActiveDataManagementDeleteKey(spec.store, itemKey)) return [];
    if (!options.includeSuppressed && isTombstoneShadowedLocalSnapshotItem(spec.store, itemKey, payloadUpdatedAt)) return [];
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

async function readLocalStoreItems(
  spec: IdbStoreSpec,
  options: { includeSuppressed?: boolean } = {},
): Promise<RemoteSyncItem[]> {
  const db = await openIdb(spec.dbName, spec.dbVersion);
  try {
    const records = await readAllFromStore(db, spec.objectStore);
    if (spec.store === 'games' && records.length === 0) {
      const legacyGames = flattenLegacyGameLibrary(await readAllFromStore(db, 'game-library'));
      return legacyGames.flatMap(record => {
        const itemKey = stringField(record, 'id');
        const payloadUpdatedAt = genericUpdatedAt(record);
        if (itemKey && isActiveDataManagementDeleteKey('games', itemKey)) return [];
        if (itemKey && !options.includeSuppressed && isTombstoneShadowedLocalSnapshotItem('games', itemKey, payloadUpdatedAt)) return [];
        return itemKey
          ? [{ store: 'games' as const, itemKey, updatedAt: Math.max(payloadUpdatedAt, rememberedItemUpdatedAt('games', itemKey)), payload: record, operation: 'upsert' as const }]
          : [];
      });
    }
    return recordsToSyncItems(spec, records, options);
  } finally {
    db.close();
  }
}





























async function readLocalStoreItemKeys(spec: IdbStoreSpec): Promise<string[]> {
  const db = await openIdb(spec.dbName, spec.dbVersion);
  try {







    if (spec.keyMode === 'scan') {
      const records = await readAllFromStore(db, spec.objectStore);
      return records.flatMap(record => {
        const key = spec.keyForRecord(record.value, record.primaryKey);
        return key ? [key] : [];
      });
    }
    return await readAllKeysFromStore(db, spec.objectStore);
  } finally {
    db.close();
  }
}






export async function readLocalRemoteSyncItemKeysByStore(): Promise<Partial<Record<RemoteSyncStoreName, string[]>>> {
  const entries = await Promise.all(IDB_STORE_SPECS.map(async spec => [spec.store, await readLocalStoreItemKeys(spec)] as const));
  const result: Partial<Record<RemoteSyncStoreName, string[]>> = Object.fromEntries(entries);
  result.settings = readLocalSettingsItemKeys();
  return result;
}

export interface RemoteSyncUntrackedScanCounts {
  totalUntracked: number;
  byStore: Partial<Record<RemoteSyncStoreName, number>>;
  scannedAt: number;
}

async function computeRemoteSyncUntrackedScanCounts(): Promise<RemoteSyncUntrackedScanCounts> {
  const keysByStore = await readLocalRemoteSyncItemKeysByStore();
  const identity = await ensureRemoteSyncItemStateActive(storedServerIdentity());
  const resolveVersion = createRemoteSyncItemStateResolver(identity);
  const pendingKeys = new Set(
    (await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage()))
      .map(entry => `${entry.store}::${entry.itemKey}`),
  );
  const byStore: Partial<Record<RemoteSyncStoreName, number>> = {};
  let totalUntracked = 0;
  for (const [store, keys] of Object.entries(keysByStore) as [RemoteSyncStoreName, string[]][]) {
    let untrackedForStore = 0;



    const seenKeys = new Set<string>();
    for (const itemKey of keys) {
      if (seenKeys.has(itemKey)) continue;
      seenKeys.add(itemKey);
      if (resolveVersion(store, itemKey) !== null) continue;
      if (pendingKeys.has(`${store}::${itemKey}`)) continue;
      untrackedForStore += 1;
    }
    if (untrackedForStore > 0) byStore[store] = untrackedForStore;
    totalUntracked += untrackedForStore;
  }
  return { totalUntracked, byStore, scannedAt: Date.now() };
}

/** Debounce/coalesce for the expensive (IDB-touching) half of the scan: at most one real scan per
 * UNTRACKED_SCAN_DEBOUNCE_MS, and concurrent callers within that window share a single in-flight
 * promise rather than each starting their own IDB pass. Severity/issue decisions (see
 * applyUntrackedScanIssue) are always recomputed fresh from whatever counts this returns, so the
 * debounce only ever affects scan *cost*, never the correctness of a given caller's
 * postCleanCycle escalation decision. */
const UNTRACKED_SCAN_DEBOUNCE_MS = 5_000;
let untrackedScanCache: RemoteSyncUntrackedScanCounts | null = null;
let untrackedScanInFlight: Promise<RemoteSyncUntrackedScanCounts> | null = null;

/** Drops the cached scan result so the next call performs a fresh scan regardless of the debounce
 * window. Used right before a rescan that must reflect a just-completed state change (a reconcile
 * that just queued items, or a batch enqueue that just changed outbox membership). */
export function invalidateRemoteSyncUntrackedScanCache(): void {
  untrackedScanCache = null;
}

function getRemoteSyncUntrackedScanCounts(): Promise<RemoteSyncUntrackedScanCounts> {
  if (untrackedScanInFlight) return untrackedScanInFlight;
  const cached = untrackedScanCache;
  if (cached && Date.now() - cached.scannedAt < UNTRACKED_SCAN_DEBOUNCE_MS) return Promise.resolve(cached);
  const opId = safeBeginProgress('checking', { phase: 'Scanning local library for untracked items…' });
  const run = computeRemoteSyncUntrackedScanCounts()
    .then(result => {
      untrackedScanCache = result;
      safeCompleteProgress(opId);
      return result;
    })
    .catch(error => {
      safeFailProgress(opId);
      throw error;
    })
    .finally(() => {
      untrackedScanInFlight = null;
    });
  untrackedScanInFlight = run;
  return run;
}

function formatUntrackedStoreSummary(byStore: Partial<Record<RemoteSyncStoreName, number>>): string {
  return Object.entries(byStore)
    .map(([store, count]) => `${store}: ${count}`)
    .join(', ');
}








function applyUntrackedScanIssue(counts: RemoteSyncUntrackedScanCounts, postCleanCycle: boolean): void {
  if (counts.totalUntracked <= 0) {
    safeClearProgressIssue('untracked-local-items');
    return;
  }
  const severity: 'warning' | 'error' = postCleanCycle ? 'error' : 'warning';
  const storeSummary = formatUntrackedStoreSummary(counts.byStore);
  const message = postCleanCycle
    ? `Local data (${storeSummary}) is still not queued for sync after a clean pull and push. Use "Queue local library for sync".`
    : `Local data not yet queued for sync (${storeSummary}). Use "Queue local library for sync".`;
  safeAddProgressIssue({
    reason: 'untracked-local-items',
    message,
    counts: { totalUntracked: counts.totalUntracked, ...(counts.byStore as Record<string, number>) },
    severity,
  });
}

export interface RemoteSyncUntrackedScanOptions {
  /** True only when this scan runs immediately after a completed pull+flush cycle: sync ran
   * cleanly end-to-end and any untracked items found now represent real stranded data, not an
   * import/timing window. See applyUntrackedScanIssue for the taxonomy this drives. */
  postCleanCycle?: boolean;
}

/** Public scan entry point: resolves the (possibly cached/coalesced) untracked-item counts and
 * applies the resulting issue state. Never throws — detection must never break a real sync flow. */
export async function scanRemoteSyncUntrackedLocalItems(
  options: RemoteSyncUntrackedScanOptions = {},
): Promise<RemoteSyncUntrackedScanCounts | null> {
  try {
    const counts = await getRemoteSyncUntrackedScanCounts();
    applyUntrackedScanIssue(counts, options.postCleanCycle === true);
    return counts;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not scan local sync data for untracked items.';
    recordRemoteSyncLog('reconcile', 'error', `Untracked-item scan failed: ${message}`);
    return null;
  }
}

export async function readRemoteSyncUntrackedScanCountsForTest(): Promise<RemoteSyncUntrackedScanCounts> {
  return getRemoteSyncUntrackedScanCounts();
}





export async function readLocalRemoteSyncItems(
  options: { includeSuppressed?: boolean } = {},
): Promise<RemoteSyncItem[]> {
  const groups = await Promise.all(IDB_STORE_SPECS.map(spec => readLocalStoreItems(spec, options)));
  return [...groups.flat(), ...readLocalSettingsItems(options)];
}







export async function readLocalRemoteSyncItemsForKeys(
  neededByStore: Partial<Record<RemoteSyncStoreName, readonly string[]>>,
  options: { includeSuppressed?: boolean } = {},
): Promise<RemoteSyncItem[]> {
  const items: RemoteSyncItem[] = [];
  const dbConnections = new Map<string, IDBDatabase>();
  try {
    for (const spec of IDB_STORE_SPECS) {
      const keys = neededByStore[spec.store];
      if (!keys || keys.length === 0) continue;
      const connectionKey = `${spec.dbName}::${spec.dbVersion}`;
      let db = dbConnections.get(connectionKey);
      if (!db) {
        db = await openIdb(spec.dbName, spec.dbVersion);
        dbConnections.set(connectionKey, db);
      }
      if (spec.keyMode === 'scan') {




        const wanted = new Set(keys);
        const records = await readAllFromStore(db, spec.objectStore);
        items.push(...recordsToSyncItems(spec, records, options).filter(item => wanted.has(item.itemKey)));
        continue;
      }
      for (const itemKey of keys) {
        if (isActiveDataManagementDeleteKey(spec.store, itemKey)) continue;
        const value = await readRecordByItemKey(db, spec, itemKey);
        if (value === undefined) continue;





        const derivedKey = spec.keyForRecord(value, itemKey);
        if (!derivedKey) continue;
        if (derivedKey !== itemKey) {
          recordRemoteSyncLog('reconcile', 'error', `A ${spec.store} row's primary key (${itemKey}) does not match its payload-derived key (${derivedKey}); the row was skipped.`);
          continue;
        }
        const payloadUpdatedAt = spec.updatedAt(value);
        if (!options.includeSuppressed && isTombstoneShadowedLocalSnapshotItem(spec.store, derivedKey, payloadUpdatedAt)) continue;
        items.push({
          store: spec.store,
          itemKey: derivedKey,
          updatedAt: Math.max(payloadUpdatedAt, rememberedItemUpdatedAt(spec.store, derivedKey)),
          payload: value,
          operation: 'upsert' as const,
        });
      }
    }
  } finally {
    for (const db of dbConnections.values()) db.close();
  }
  const settingsKeys = neededByStore.settings;
  if (settingsKeys && settingsKeys.length > 0) {
    const wanted = new Set(settingsKeys);
    items.push(...readLocalSettingsItems(options).filter(item => wanted.has(item.itemKey)));
  }
  return items;
}






async function applyIdbItem(
  item: RemoteSyncItem,
  spec: IdbStoreSpec,
  db: IDBDatabase,
  applyIdentity: string,
): Promise<'applied' | 'deleted' | RemoteSyncSkippedApplyResult> {
  const existing = await readRecordByItemKey(db, spec, item.itemKey);
  if (!isDeletedItem(item) && shouldSuppressRemoteSyncUpsert(spec.store, item.itemKey, item.updatedAt, applyIdentity)) return { skipped: 'suppressed-upsert' };
  if (item.store === 'accounts' && !isDeletedItem(item)) {
    if (item.payload === undefined) return { skipped: 'missing-payload' };
    const merged = mergeRemoteSyncAccountPayload(existing, item.payload, item.itemKey);
    if (!merged) return { skipped: 'merge-failed' };
    await writeRecordByItemKey(db, spec, item.itemKey, merged);


    await rememberItemUpdatedAt(spec.store, item.itemKey, maxTimestamp(item.updatedAt, accountUpdatedAt(merged)), applyIdentity);
    await clearItemDeletedAt(spec.store, item.itemKey, applyIdentity);
    return 'applied';
  }

  const existingUpdatedAt = localVersionForItem(spec, item.itemKey, existing);
  if (item.updatedAt < existingUpdatedAt) return { skipped: 'stale-remote' };

  if (isDeletedItem(item)) {
    await deleteRecordByItemKey(db, spec, item.itemKey);
    if (spec.store === 'games') await deleteLegacyImportedGameById(db, item.itemKey);
    await rememberItemDeletedAt(spec.store, item.itemKey, item.updatedAt, applyIdentity);
    return 'deleted';
  }
  if (item.payload === undefined) return { skipped: 'missing-payload' };
  await writeRecordByItemKey(db, spec, item.itemKey, item.payload);
  await rememberItemUpdatedAt(spec.store, item.itemKey, item.updatedAt, applyIdentity);
  await clearItemDeletedAt(spec.store, item.itemKey, applyIdentity);
  return 'applied';
}

interface RemoteSyncApplyProgress {
  done: number;
  total: number;
  counts: Record<string, number>;
}



const APPLY_PROGRESS_REPORT_EVERY = 25;

export async function applyRemoteSyncItems(
  items: unknown[],
  options: { generation?: number; onProgress?: (progress: RemoteSyncApplyProgress) => void } = {},
): Promise<Record<string, number>> {




  const applyIdentity = await ensureRemoteSyncItemStateActive(storedServerIdentity());
  const counts: Record<string, number> = {};
  let analysisChanged = false;
  const total = items.length;
  const reportProgress = (done: number): void => {
    if (!options.onProgress) return;
    if (done < total && done % APPLY_PROGRESS_REPORT_EVERY !== 0) return;
    try {
      options.onProgress({ done, total, counts: { ...counts } });
    } catch {
      // Progress reporting must never interrupt the pull apply loop.
    }
  };





  const dbConnections = new Map<string, IDBDatabase>();
  const connectionForSpec = async (spec: IdbStoreSpec): Promise<IDBDatabase> => {
    const key = `${spec.dbName}::${spec.dbVersion}`;
    const existingConnection = dbConnections.get(key);
    if (existingConnection) return existingConnection;
    const db = await openIdb(spec.dbName, spec.dbVersion);
    dbConnections.set(key, db);
    return db;
  };
  applyingRemoteSync = true;
  try {
    let index = 0;
    for (const raw of items) {
      index += 1;
      if (options.generation !== undefined && (syncGeneration !== options.generation || !hasRemoteSyncToken())) {
        counts.cancelled = (counts.cancelled ?? 0) + 1;
        reportProgress(index);
        break;
      }
      const item = normalizeSyncItem(raw, { logInvalid: true, requireUpdatedAt: true });
      if (!item) {
        counts.skipped = (counts.skipped ?? 0) + 1;
        counts.skippedNormalizeFailed = (counts.skippedNormalizeFailed ?? 0) + 1;
        reportProgress(index);
        continue;
      }

      try {
        let result: 'applied' | 'deleted' | RemoteSyncSkippedApplyResult;
        if (item.store === 'settings') {
          result = await applySettingItem(item, applyIdentity);
        } else {
          const spec = IDB_SPECS_BY_STORE.get(item.store);
          if (!spec) {
            result = { skipped: 'unknown-store' };
          } else {
            const db = await connectionForSpec(spec);
            result = await applyIdbItem(item, spec, db, applyIdentity);
          }
        }
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
      reportProgress(index);
    }
  } finally {
    applyingRemoteSync = false;
    if (analysisChanged) emitAnalysisChanged();
    for (const db of dbConnections.values()) db.close();
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




  await migrateLegacyOutboxToVersioned();
  const pendingVersioned = await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage());
  setDurableOutboxCount(pendingVersioned.length);
  const queued = pendingVersioned.length + pendingVersionedOutboxEnqueues.length;
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
    const opId = safeBeginProgress('pushing', { total: queued });
    try {
      const counts = await drainVersionedRemoteSyncOutbox({
        onBatchProgress: progress => safeUpdateProgress(opId, {
          done: Math.max(0, Math.min(queued, queued - progress.remaining)),
          counts: {
            accepted: progress.accepted,
            conflicts: progress.conflicts,
            rejected: progress.rejected,
            backedOff: progress.backedOff,
          },
        }),
      });
      setDurableOutboxCount(counts.queued ?? 0);
      setRemoteSyncLastSyncedAt(Date.now());
      recordRemoteSyncLog('flush', 'success', 'Queued CAS changes flushed.', counts);
      safeCompleteProgress(opId);
      safeClearProgressIssue('push-failed');
      // P6b post-drain update (not a new refresh trigger): re-derive backoff/escalation right
      // after this real drain so the menu reflects the outcome without waiting for the next
      // sanctioned refresh.
      await refreshRemoteSyncBackoffAndEscalation();
      return { success: true, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote sync flush failed.';
      const remainingVersioned = await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage());
      setDurableOutboxCount(remainingVersioned.length);
      applyRemoteSyncBackoffAndEscalation(remainingVersioned);
      const counts = { queued: remainingVersioned.length };
      recordRemoteSyncLog('flush', 'error', message, counts);
      safeFailProgress(opId, { reason: 'push-failed', message, counts: { queuedRemaining: counts.queued } });
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






        const pull = await pullFromRemoteSync({ flushAfter: false, logNoop: false });
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








      if (!options.skipFreshPull) {
        invalidateRemoteSyncUntrackedScanCache();
        await scanRemoteSyncUntrackedLocalItems({ postCleanCycle: true });
      }
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
    const opId = safeBeginProgress('reconciling', { phase: 'Scanning local library…' });
    try {



      const activeIdentity = await ensureRemoteSyncItemStateActive(identity);





      const keysByStore = await readLocalRemoteSyncItemKeysByStore();
      // The legacy pre-migration game-library fallback (games store completely empty) has no
      // key-only path — replay it through the full reader, exactly like the pre-F-14 scan.
      let legacyGameItems: RemoteSyncItem[] = [];
      if ((keysByStore.games ?? []).length === 0) {
        const gamesSpec = IDB_SPECS_BY_STORE.get('games');
        if (gamesSpec) {
          legacyGameItems = await readLocalStoreItems(gamesSpec, { includeSuppressed: true });
          if (legacyGameItems.length > 0) keysByStore.games = legacyGameItems.map(item => item.itemKey);
        }
      }
      const legacyGameByKey = new Map(legacyGameItems.map(item => [item.itemKey, item]));
      const resolveVersion = createRemoteSyncItemStateResolver(activeIdentity);
      const pendingKeys = new Set(
        (await readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage()))
          .map(entry => `${entry.store}\u0000${entry.itemKey}`),
      );
      let scannedLocal = 0;
      let alreadyTracked = 0;
      let alreadyQueued = 0;
      const untrackedKeys: Partial<Record<RemoteSyncStoreName, string[]>> = {};
      const survivorKeys: Partial<Record<RemoteSyncStoreName, string[]>> = {};
      const seenIdentities = new Set<string>();
      for (const [store, keys] of Object.entries(keysByStore) as [RemoteSyncStoreName, string[]][]) {
        for (const itemKey of keys) {
          // Old-loop parity (Sol F-14 round-1 Minor-4): recordsToSyncItems excluded rows an
          // active Data Management delete is removing BEFORE they were ever counted.
          if (isActiveDataManagementDeleteKey(store, itemKey)) continue;
          // One classification per sync IDENTITY (Sol round-2 Important-3): duplicate derived
          // keys (two corrupt rows claiming one composite) collapse here, keeping every count
          // non-negative and each identity in exactly one bucket.
          const composite = `${store}\u0000${itemKey}`;
          if (seenIdentities.has(composite)) continue;
          seenIdentities.add(composite);
          scannedLocal += 1;
          const recordedVersion = resolveVersion(store, itemKey);
          if (recordedVersion !== null) {






            if (rememberedItemDeletedAt(store, itemKey, activeIdentity) > 0) {
              (survivorKeys[store] ??= []).push(itemKey);
              continue;
            }
            alreadyTracked += 1;
            continue;
          }
          if (pendingKeys.has(`${store}\u0000${itemKey}`)) {
            alreadyQueued += 1;
            continue;
          }
          (untrackedKeys[store] ??= []).push(itemKey);
        }
      }


      const loadForKeys = async (needed: Partial<Record<RemoteSyncStoreName, string[]>>): Promise<RemoteSyncItem[]> => {
        if (legacyGameByKey.size > 0 && needed.games) {
          const fromLegacy = needed.games.map(key => legacyGameByKey.get(key)).filter((item): item is RemoteSyncItem => item !== undefined);
          const rest = { ...needed, games: needed.games.filter(key => !legacyGameByKey.has(key)) };
          return [...fromLegacy, ...await readLocalRemoteSyncItemsForKeys(rest, { includeSuppressed: true })];
        }
        return readLocalRemoteSyncItemsForKeys(needed, { includeSuppressed: true });
      };







      const coalesceByIdentity = (loaded: RemoteSyncItem[]): RemoteSyncItem[] => {
        const byComposite = new Map<string, RemoteSyncItem>();
        for (const item of loaded) {
          const composite = `${item.store}\u0000${item.itemKey}`;
          const existing = byComposite.get(composite);
          if (!existing || item.updatedAt > existing.updatedAt) byComposite.set(composite, item);
        }
        return Array.from(byComposite.values());
      };
      const untracked = coalesceByIdentity(await loadForKeys(untrackedKeys));
      const requestedSurvivorTotal = Object.values(survivorKeys).reduce((total, keys) => total + keys.length, 0); // keys are identity-deduped above
      // Fulfilled composites are a SET (Sol round-2 Important-3): duplicate scan/explicit rows
      // deriving to one survivor composite must not drive the missing-key fallback negative.
      const fulfilledSurvivors = new Set<string>();
      const shadowedSurvivors: RemoteSyncItem[] = [];
      let requeuedTombstoneShadowed = 0;
      let survivorsNotNewer = 0;
      for (const item of coalesceByIdentity(await loadForKeys(survivorKeys))) {
        fulfilledSurvivors.add(`${item.store}\u0000${item.itemKey}`);
        // Requeue with the recorded version as the CAS base (resolved automatically by the
        // batch enqueue below): a genuinely newer server tombstone still wins through the
        // normal conflict path, otherwise this resurrects the row. The marker is cleared now
        // (not after the batch resolves) so the enqueue below does not immediately re-suppress
        // the very item this branch is recovering.
        if (item.updatedAt <= 0) {
          survivorsNotNewer += 1;
          continue;
        }
        requeuedTombstoneShadowed += 1;
        void clearItemDeletedAt(item.store, item.itemKey, activeIdentity).catch(() => { /* logged by the helper */ });
        shadowedSurvivors.push(item);
      }
      // Survivor-requested keys whose payload never came back (row gone or excluded) and loaded
      // survivors without a positive updatedAt keep their pre-F-14 classification: the recorded
      // version means the server has them.
      alreadyTracked += (requestedSurvivorTotal - fulfilledSurvivors.size) + survivorsNotNewer;
      const toEnqueue = [...untracked, ...shadowedSurvivors];
      const counts: Record<string, number> = {
        scannedLocal,
        alreadyTracked,
        alreadyQueued,
        queuedForSync: toEnqueue.length,
        requeuedTombstoneShadowed,
      };
      for (const item of toEnqueue) {
        counts[`queued:${item.store}`] = (counts[`queued:${item.store}`] ?? 0) + 1;
      }
      safeUpdateProgress(opId, {
        total: scannedLocal,
        done: scannedLocal,
        phase: 'Classifying local items…',
        counts: { scannedLocal, alreadyTracked, alreadyQueued, queuedForSync: toEnqueue.length, requeuedTombstoneShadowed },
      });
      if (toEnqueue.length > 0) {


        safeCompleteProgress(opId);
        enqueueRemoteSyncItemsBatch(toEnqueue);
        await waitForPendingVersionedOutboxWrites();
      }
      recordRemoteSyncLog('reconcile', 'success', 'Local items missing from the token database queued for sync.', counts);
      if (toEnqueue.length === 0) {
        safeCompleteProgress(opId);


        invalidateRemoteSyncUntrackedScanCache();
        await scanRemoteSyncUntrackedLocalItems();
        return { success: true, counts };
      }

      const flush = await flushRemoteSyncOutbox();
      if (!flush.success) {
        return {
          success: false,
          error: flush.error || 'Remote sync flush failed.',
          counts: { ...counts, ...(flush.counts ?? {}) },
        };
      }
      mergeCounts(counts, flush.counts);





      invalidateRemoteSyncUntrackedScanCache();
      await scanRemoteSyncUntrackedLocalItems();
      return { success: true, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not queue the local library for sync.';
      recordRemoteSyncLog('reconcile', 'error', message);
      safeFailProgress(opId, { message });
      return { success: false, error: message };
    }
  });
}







export async function getQuarantinedRemoteSyncWrites(): Promise<DurableQuarantineRecord[]> {
  return readQuarantineRecords();
}



async function readCurrentLocalRemoteSyncItem(
  store: RemoteSyncStoreName,
  itemKey: string,
): Promise<RemoteSyncItem | null> {
  if (store === 'settings') {
    return readLocalSettingsItems().find(item => item.itemKey === itemKey) ?? null;
  }
  const spec = IDB_SPECS_BY_STORE.get(store);
  if (!spec) return null;
  const items = await readLocalStoreItems(spec);
  return items.find(item => item.itemKey === itemKey) ?? null;
}






async function performRequeueQuarantineRecord(record: DurableQuarantineRecord): Promise<void> {


  const requeueActiveIdentity = await ensureRemoteSyncItemStateActive(storedServerIdentity());
  if (record.operation === 'delete') {
    enqueueRemoteSyncDelete(record.store, record.itemKey, Date.now());
  } else if (record.conflictIntent === 'recreate-over-tombstone') {





    const current = await readCurrentLocalRemoteSyncItem(record.store, record.itemKey);
    const useCurrent = current !== null && !isDeletedItem(current) ? { payload: current.payload, updatedAt: current.updatedAt } : null;
    const requeueInput = buildRecreateRequeueInput(
      record,
      useCurrent,
      getRemoteSyncItemStateVersion(requeueActiveIdentity, record.store, record.itemKey),
    );




    await rememberItemUpdatedAt(record.store, record.itemKey, requeueInput.clientUpdatedAt ?? Date.now(), requeueActiveIdentity);
    await clearItemDeletedAt(record.store, record.itemKey, requeueActiveIdentity);
    await enqueueDurableVersionedOutboxEntry(defaultDurableVersionedOutboxStorage(), requeueInput);
    invalidateDurableOutboxCount();
    scheduleRemoteSyncFlush();
  } else {
    const current = await readCurrentLocalRemoteSyncItem(record.store, record.itemKey);
    if (current && !isDeletedItem(current)) {
      enqueueRemoteSyncUpsert(record.store, record.itemKey, current.payload, current.updatedAt);
    } else {
      // Local row is gone: fall back to the quarantined payload so the re-queue can still restore
      // the historical write instead of silently dropping it a second time.
      enqueueRemoteSyncUpsert(record.store, record.itemKey, record.payload, record.clientUpdatedAt ?? Date.now());
    }
  }
  await removeQuarantineRecords([record.opId]);
}

export interface QuarantineActionResult {
  success: boolean;
  error?: string;
}

export async function requeueQuarantinedRemoteSyncWrite(opId: string): Promise<QuarantineActionResult> {
  const records = await readQuarantineRecords();
  const record = records.find(entry => entry.opId === opId);
  if (!record) return { success: false, error: 'Quarantine record was already removed.' };
  try {
    await performRequeueQuarantineRecord(record);
    recordRemoteSyncLog(
      'flush',
      'info',
      `Re-queued quarantined ${record.operation} for ${record.store}/${record.itemKey} (was: ${record.code}).`,
      { requeued: 1 },
    );
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not re-queue the quarantined write.';
    recordRemoteSyncLog('flush', 'error', `Failed to re-queue quarantined write for ${record.store}/${record.itemKey}: ${message}`);
    return { success: false, error: message };
  }
}

export async function requeueAllQuarantinedRemoteSyncWrites(): Promise<QuarantineActionResult & { counts: Record<string, number> }> {
  const records = await readQuarantineRecords();
  let requeued = 0;
  const failures: string[] = [];
  for (const record of records) {
    try {
      await performRequeueQuarantineRecord(record);
      requeued += 1;
    } catch {
      failures.push(`${record.store}/${record.itemKey}`);
    }
  }
  const counts = { requeued, failed: failures.length };
  if (failures.length > 0) {
    const detail = failures.slice(0, 10).join(', ');
    const suffix = failures.length > 10 ? `, and ${failures.length - 10} more` : '';
    recordRemoteSyncLog(
      'flush',
      'error',
      `Re-queued ${requeued} quarantined write(s); ${failures.length} failed: ${detail}${suffix}.`,
      counts,
    );
  } else if (requeued > 0) {
    recordRemoteSyncLog('flush', 'info', `Re-queued all ${requeued} quarantined write(s).`, counts);
  }
  return { success: failures.length === 0, counts };
}

export async function discardQuarantinedRemoteSyncWrite(opId: string): Promise<QuarantineActionResult> {
  const records = await readQuarantineRecords();
  const record = records.find(entry => entry.opId === opId);
  if (!record) return { success: false, error: 'Quarantine record was already removed.' };
  await removeQuarantineRecords([opId]);
  recordRemoteSyncLog(
    'flush',
    'info',
    `Discarded quarantined ${record.operation} for ${record.store}/${record.itemKey} (was: ${record.code}). Local data was left untouched.`,
    { discarded: 1 },
  );
  return { success: true };
}






async function runRemoteSyncPullOutcome(plan: RemoteSyncPullPlan, options: RemoteSyncPullOptions): Promise<RemoteSyncPullOutcome> {
  let opId = '';
  try {
    opId = safeBeginProgress('pulling', { phase: 'Fetching from server…' });
    await ensureServerGenerationLoaded();
    const generation = syncGeneration;
    const result = await remoteSyncFetch<PullResponse>(plan.path);
    if (!result.ok) throw new Error(result.error || 'Remote sync pull failed.');
    setRemoteSyncLastCheckedAt();
    if (syncGeneration !== generation || !hasRemoteSyncToken()) {



      markRemoteSyncCloudStateStale();
      safeCompleteProgress(opId);
      return { result: { success: true, counts: { cancelled: 1 } }, flushEligible: false, flushed: false };
    }

    const items = plan.mode === 'cursor'
      ? versionOrderedRawItems(result.items ?? [])
      : result.items ?? [];
    safeUpdateProgress(opId, { total: items.length, done: 0, phase: 'Applying pulled changes…' });
    const counts = await applyRemoteSyncItems(items, {
      generation,
      onProgress: progress => safeUpdateProgress(opId, { done: progress.done, counts: progress.counts }),
    });
    let versionMetadataAdvanced = plan.mode !== 'cursor';
    if ((result.skippedMalformedJson ?? 0) > 0) {
      counts.skippedMalformedJson = (counts.skippedMalformedJson ?? 0) + (result.skippedMalformedJson ?? 0);
      recordRemoteSyncLog('pull', 'error', `Skipped ${result.skippedMalformedJson} malformed database JSON row(s).`);
    }
    if (syncGeneration !== generation || !hasRemoteSyncToken()) {



      markRemoteSyncCloudStateStale();
      safeCompleteProgress(opId);
      return { result: { success: true, counts }, flushEligible: false, flushed: false };
    }
    if (plan.mode === 'cursor') {
      if (canAdvancePullVersionMetadata(counts)) {
        const latestVersion = await rememberVersionedPullMetadata(items, result.latestVersion, plan.forcedFullPull ? 'set' : 'advance');
        counts.latestVersion = latestVersion;
        if (plan.forcedFullPull) counts.fullVersionPull = 1;
        clearVersionedPullUnsafeSkipped();
        versionMetadataAdvanced = true;
      } else {
        markVersionedPullUnsafeSkipped(counts);
        counts.versionMetadataDeferred = 1;
      }
    }
    const latestUpdatedAt = result.latestUpdatedAt ?? maxRawItemUpdatedAt(items);
    if (latestUpdatedAt > 0 || items.length > 0) setRemoteSyncLastSyncedAt(latestUpdatedAt);
    applySettingsPullLiveIfNeeded(counts, latestUpdatedAt, items);
    emitRemoteSyncApplied(counts, latestUpdatedAt);
    safeCompleteProgress(opId);

    const flushEligible = !(plan.mode === 'cursor' && (plan.forcedFullPull || !versionMetadataAdvanced));
    let flushed = false;
    if (options.flushAfter && flushEligible) {
      flushed = true;
      const flush = await flushRemoteSyncOutbox();
      if (!flush.success) {
        return {
          result: {
            success: false,
            error: flush.error || 'Remote sync flush failed.',
            counts: { ...counts, ...(flush.counts ?? {}) },
          },
          flushEligible,
          flushed,
        };
      }
      mergeCounts(counts, flush.counts);
    }

    const shouldLog = options.logNoop !== false
      || Object.values(counts).some(value => value > 0)
      || items.length > 0;
    if (shouldLog) recordRemoteSyncLog('pull', 'success', 'Database changes pulled into local cache.', counts);
    return { result: { success: true, counts }, flushEligible, flushed };
  } catch (error) {


    markRemoteSyncCloudStateStale();
    const message = error instanceof Error ? error.message : 'Remote sync pull failed.';
    recordRemoteSyncLog('pull', 'error', message);
    safeFailProgress(opId, { message });
    return { result: { success: false, error: message }, flushEligible: false, flushed: false };
  }
}









async function coordinatedRemoteSyncPull(options: RemoteSyncPullOptions): Promise<SyncResult> {
  const requestedPlan = planRemoteSyncPull(options);
  const current = inFlightRemoteSyncPull;

  if (current && pullSatisfiesRequest(current.plan, requestedPlan)) {
    console.debug('[remote-sync] pull request coalesced into an in-flight pull', {
      requested: describePullPlan(requestedPlan),
      inFlight: describePullPlan(current.plan),
    });
    const outcome = await current.promise;
    return applyTrailingFlushIfNeeded(outcome, options);
  }

  if (current) {
    console.debug('[remote-sync] pull request chained after a weaker in-flight pull', {
      requested: describePullPlan(requestedPlan),
      inFlight: describePullPlan(current.plan),
    });
    await current.promise.catch(() => {});
  }

  // Re-plan after any chained wait: the awaited pull may have advanced the cursor or cleared
  // fullPullRequired, and this request's own fetch should reflect that current state.
  const plan = planRemoteSyncPull(options);
  const outcome = await registerInFlightPull(plan, options, () => runRemoteSyncPullOutcome(plan, options));
  return outcome.result;
}

export async function pullFromRemoteSync(options: RemoteSyncPullOptions = {}): Promise<SyncResult> {
  if (activeDataManagementDelete) return { success: true, counts: { paused: 1 } };
  return withRemoteSyncActivity(() => coordinatedRemoteSyncPull(options));
}

export async function hydrateFromRemoteSync(): Promise<SyncResult> {






  return pullFromRemoteSync({ flushAfter: true });
}

export const startupHydrateFromRemoteSync = hydrateFromRemoteSync;
