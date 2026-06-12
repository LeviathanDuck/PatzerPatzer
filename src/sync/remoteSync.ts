






import { DB_NAME as MAIN_DB_NAME, DB_VERSION as MAIN_DB_VERSION, upgradeGameDbSchema } from '../idb/index';
import type { SyncResult } from './client';

const API_BASE = '/api/patzer-sync';
const PUZZLE_DB_NAME = 'patzer-puzzle-v1';
const PUZZLE_DB_VERSION = 3;
const TOKEN_KEY = 'chesspatzer.remoteSync.adminSyncToken';
const LAST_SYNC_KEY = 'chesspatzer.remoteSync.lastSyncedAt';
const OUTBOX_KEY = 'chesspatzer.remoteSync.outbox';
const SETTING_UPDATED_AT_PREFIX = 'chesspatzer.remoteSync.settingUpdatedAt.';
const ITEM_UPDATED_AT_PREFIX = 'chesspatzer.remoteSync.itemUpdatedAt.';
const PUSH_BATCH_SIZE = 100;
const FLUSH_DEBOUNCE_MS = 250;
const FLUSH_INTERVAL_MS = 15_000;

export type RemoteSyncStoreName =
  | 'games'
  | 'analysis'
  | 'game-summaries'
  | 'retro-results'
  | 'saved-review-puzzles'
  | 'studies'
  | 'practice-lines'
  | 'position-progress'
  | 'drill-attempts'
  | 'folders'
  | 'puzzle-definitions'
  | 'puzzle-attempts'
  | 'puzzle-user-meta'
  | 'puzzle-user-perf'
  | 'puzzle-rating-history'
  | 'opening-collections'
  | 'opening-session'
  | 'opening-training-variations'
  | 'settings';

export type RemoteSyncOperation = 'upsert' | 'delete';
export type RemoteStoreName = RemoteSyncStoreName;

export interface RemoteSyncPersistenceOperation {
  operation: 'put' | 'delete';
  dbName:    string;
  storeName: string;
  itemKey:   string;
  updatedAt: number;
  payload?:  unknown;
}

export interface RemoteSyncItem {
  store:     RemoteSyncStoreName;
  itemKey:   string;
  updatedAt: number;
  payload?:  unknown;
  deleted?:  boolean;
  operation?: RemoteSyncOperation;
}

interface PullResponse {
  ok?: boolean;
  items?: RemoteSyncItem[];
  latestUpdatedAt?: number;
  error?: string;
}

interface StatusStoreSummary {
  items: number;
  tombstones: number;
  latestUpdatedAt: number;
}

interface StatusResponse {
  ok?: boolean;
  userKey?: string;
  items?: number;
  tombstones?: number;
  latestUpdatedAt?: number;
  stores?: Record<string, StatusStoreSummary>;
  error?: string;
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
];

const IDB_SPECS_BY_STORE = new Map<RemoteSyncStoreName, IdbStoreSpec>(
  IDB_STORE_SPECS.map(spec => [spec.store, spec]),
);

const ALLOWED_STORES = new Set<RemoteSyncStoreName>([
  ...IDB_STORE_SPECS.map(spec => spec.store),
  'settings',
]);

const SETTINGS_KEYS = new Set([
  'patzer.autoReview',
  'patzer.autoReviewConfirmed',
  'patzer.autoReviewDepth',
  'patzer.reviewDepth',
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
  'retroConfig',
  'boardWheelNavEnabled',
  'reviewDotsUserOnly',
  'boardZoom',
  'boardTheme',
  'pieceSet',
  'boardSoundEnabled',
  'boardSoundVolume',
  'puzzleSession',
  'puzzleSessionQueue',
  'puzzleAutoNext',
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
let visibilityFlushHandler: (() => void) | null = null;
let settingsObserverInstalled = false;
let applyingRemoteSync = false;
let syncGeneration = 0;

function specForPersistenceOperation(operation: RemoteSyncPersistenceOperation): IdbStoreSpec | undefined {
  const directStore = IDB_SPECS_BY_STORE.get(operation.storeName as RemoteSyncStoreName);
  if (directStore && directStore.dbName === operation.dbName) return directStore;
  return IDB_STORE_SPECS.find(spec => spec.dbName === operation.dbName && spec.objectStore === operation.storeName);
}

function scheduleRemoteSyncFlush(delayMs = FLUSH_DEBOUNCE_MS): void {
  if (!hasRemoteSyncToken()) return;
  if (flushDebounceTimer !== null) window.clearTimeout(flushDebounceTimer);
  flushDebounceTimer = window.setTimeout(() => {
    flushDebounceTimer = null;
    void flushRemoteSyncOutbox();
  }, delayMs);
}

function itemUpdatedAtKey(store: RemoteSyncStoreName, itemKey: string): string {
  return `${ITEM_UPDATED_AT_PREFIX}${store}.${itemKey}`;
}

function rememberedItemUpdatedAt(store: RemoteSyncStoreName, itemKey: string): number {
  const raw = localStorage.getItem(itemUpdatedAtKey(store, itemKey));
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

function rememberItemUpdatedAt(store: RemoteSyncStoreName, itemKey: string, updatedAt: number): void {
  localStorage.setItem(itemUpdatedAtKey(store, itemKey), String(Math.max(0, Math.floor(updatedAt))));
}

function pendingOutboxItem(store: RemoteSyncStoreName, itemKey: string): RemoteSyncItem | undefined {
  return readOutbox().find(item => item.store === store && item.itemKey === itemKey);
}

function localVersionForItem(spec: IdbStoreSpec, itemKey: string, existing: unknown | undefined): number {
  return Math.max(
    existing === undefined ? 0 : spec.updatedAt(existing),
    rememberedItemUpdatedAt(spec.store, itemKey),
    pendingOutboxItem(spec.store, itemKey)?.updatedAt ?? 0,
  );
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
    items.push({
      store: 'settings',
      itemKey: key,
      updatedAt: settingUpdatedAt(key),
      payload: { key, value },
    });
  }
  return items;
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

function applySettingItem(item: RemoteSyncItem): 'applied' | 'skipped' {
  if (!isAllowedSettingKey(item.itemKey)) return 'skipped';
  if (item.updatedAt < settingUpdatedAt(item.itemKey)) return 'skipped';
  if (isDeletedItem(item)) {
    localStorage.removeItem(item.itemKey);
    setSettingUpdatedAt(item.itemKey, item.updatedAt);
    return 'applied';
  }
  const value = payloadSettingValue(item.payload, item.itemKey);
  if (value === undefined) return 'skipped';
  localStorage.setItem(item.itemKey, value);
  setSettingUpdatedAt(item.itemKey, item.updatedAt);
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
    if (applyingRemoteSync || this !== localStorage || !isAllowedSettingKey(key)) return;
    const updatedAt = Date.now();
    originalSetItem.call(this, settingUpdatedAtKey(key), String(updatedAt));
    enqueueRemoteSyncUpsert('settings', key, { key, value }, updatedAt);
  };

  proto.removeItem = function removeItem(key: string): void {
    originalRemoveItem.call(this, key);
    if (applyingRemoteSync || this !== localStorage || !isAllowedSettingKey(key)) return;
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

export function startRemoteSyncAutoSync(): void {
  if (autoSyncStarted) return;
  autoSyncStarted = true;
  const generation = syncGeneration;
  installSettingsObserver();

  visibilityFlushHandler = () => {
    if (document.visibilityState === 'visible') void pullFromRemoteSync({ flushAfter: true });
  };
  window.addEventListener('visibilitychange', visibilityFlushHandler);

  flushIntervalTimer = window.setInterval(() => {
    void flushRemoteSyncOutbox();
  }, FLUSH_INTERVAL_MS);

  void hydrateFromRemoteSync()
    .then(() => {
      if (syncGeneration === generation && hasRemoteSyncToken()) return pushToRemoteSync();
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
  if (visibilityFlushHandler) {
    window.removeEventListener('visibilitychange', visibilityFlushHandler);
    visibilityFlushHandler = null;
  }
}

export function logoutRemoteSync(): void {
  clearRemoteSyncToken();
  stopRemoteSyncAutoSync();
}

export function clearRemoteSyncLocalSyncState(): void {
  logoutRemoteSync();
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem(OUTBOX_KEY);
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(ITEM_UPDATED_AT_PREFIX) || key.startsWith(SETTING_UPDATED_AT_PREFIX)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) localStorage.removeItem(key);
}

export function getRemoteSyncLastSyncedAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function getRemoteSyncLastSyncMs(): number | undefined {
  const value = getRemoteSyncLastSyncedAt();
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function setRemoteSyncLastSyncedAt(updatedAt?: number): void {
  const time = updatedAt && updatedAt > 0 ? updatedAt : Date.now();
  localStorage.setItem(LAST_SYNC_KEY, new Date(time).toISOString());
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

async function remoteSyncFetch<T>(path: string, init: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const token = (tokenOverride ?? storedToken()).trim();
  if (!token) throw new Error('Enter the admin sync token first.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const body = await readJsonResponse<{ error?: string } & T>(res);
  if (!res.ok) throw new Error(body.error || `Remote sync API failed: ${res.status}`);
  return body as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return remoteSyncFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function isDeletedItem(item: Pick<RemoteSyncItem, 'deleted' | 'operation'>): boolean {
  return item.deleted === true || item.operation === 'delete';
}

function normalizeSyncItem(item: Partial<RemoteSyncItem>): RemoteSyncItem | null {
  if (!item.store || !ALLOWED_STORES.has(item.store)) return null;
  if (typeof item.itemKey !== 'string' || item.itemKey.trim() === '') return null;
  const updatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
    ? Math.max(0, Math.floor(item.updatedAt))
    : Date.now();
  const deleted = item.deleted === true || item.operation === 'delete';
  if (!deleted && item.payload === undefined) return null;
  return {
    store: item.store,
    itemKey: item.itemKey,
    updatedAt,
    ...(deleted ? { deleted: true, operation: 'delete' as const } : { payload: item.payload, operation: 'upsert' as const }),
  };
}

function readOutbox(): RemoteSyncItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => normalizeSyncItem(item as Partial<RemoteSyncItem>))
      .filter((item): item is RemoteSyncItem => item !== null);
  } catch {
    return [];
  }
}

function writeOutbox(items: RemoteSyncItem[]): void {
  if (items.length === 0) {
    localStorage.removeItem(OUTBOX_KEY);
    return;
  }
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
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
  rememberItemUpdatedAt(normalized.store, normalized.itemKey, normalized.updatedAt);
  writeOutbox(mergeOutboxItem(readOutbox(), normalized));
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
  return readOutbox().length;
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

function maxItemUpdatedAt(items: RemoteSyncItem[]): number {
  return maxTimestamp(...items.map(item => item.updatedAt));
}

async function pushItems(items: RemoteSyncItem[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const batch of chunks(items, PUSH_BATCH_SIZE)) {
    const result = await postJson<{ ok?: boolean; counts?: Record<string, number>; error?: string }>('push.php', { items: batch });
    if (!result.ok) throw new Error(result.error || 'Remote sync push failed.');
    mergeCounts(counts, result.counts);
  }
  return counts;
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
    const updatedAt = Math.max(spec.updatedAt(record.value), rememberedItemUpdatedAt(spec.store, itemKey));
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
        return itemKey
          ? [{ store: 'games' as const, itemKey, updatedAt: genericUpdatedAt(record), payload: record, operation: 'upsert' as const }]
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

async function applyIdbItem(item: RemoteSyncItem): Promise<'applied' | 'deleted' | 'skipped'> {
  const spec = IDB_SPECS_BY_STORE.get(item.store);
  if (!spec) return 'skipped';

  const db = await openIdb(spec.dbName, spec.dbVersion);
  try {
    const existing = await readRecordByItemKey(db, spec, item.itemKey);
    const existingUpdatedAt = localVersionForItem(spec, item.itemKey, existing);
    if (item.updatedAt < existingUpdatedAt) return 'skipped';

    if (isDeletedItem(item)) {
      await deleteRecordByItemKey(db, spec, item.itemKey);
      rememberItemUpdatedAt(spec.store, item.itemKey, item.updatedAt);
      return 'deleted';
    }
    if (item.payload === undefined) return 'skipped';
    await writeRecordByItemKey(db, spec, item.itemKey, item.payload);
    rememberItemUpdatedAt(spec.store, item.itemKey, item.updatedAt);
    return 'applied';
  } finally {
    db.close();
  }
}

export async function applyRemoteSyncItems(
  items: RemoteSyncItem[],
  options: { generation?: number } = {},
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  applyingRemoteSync = true;
  try {
    for (const raw of items) {
      if (options.generation !== undefined && (syncGeneration !== options.generation || !hasRemoteSyncToken())) {
        counts.cancelled = (counts.cancelled ?? 0) + 1;
        break;
      }
      const item = normalizeSyncItem(raw);
      if (!item) {
        counts.skipped = (counts.skipped ?? 0) + 1;
        continue;
      }

      const result = item.store === 'settings'
        ? applySettingItem(item)
        : await applyIdbItem(item);
      if (result === 'applied') counts[item.store] = (counts[item.store] ?? 0) + 1;
      else if (result === 'deleted') counts[`${item.store}:deleted`] = (counts[`${item.store}:deleted`] ?? 0) + 1;
      else counts.skipped = (counts.skipped ?? 0) + 1;
    }
  } finally {
    applyingRemoteSync = false;
  }
  return counts;
}

export async function validateRemoteSyncToken(token: string): Promise<SyncResult> {
  try {
    const value = token.trim();
    if (!value) return { success: false, error: 'Enter the admin sync token first.' };
    const status = await remoteSyncFetch<StatusResponse>('status.php', {}, value);
    if (!status.ok) return { success: false, error: status.error || 'Remote sync status failed.' };
    return {
      success: true,
      counts: {
        items: status.items ?? 0,
        tombstones: status.tombstones ?? 0,
        latestUpdatedAt: status.latestUpdatedAt ?? 0,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync status failed.' };
  }
}

export async function rememberRemoteSyncToken(token: string): Promise<SyncResult> {
  const result = await validateRemoteSyncToken(token);
  if (result.success) setRemoteSyncToken(token);
  return result;
}

export async function testRemoteSyncConnection(): Promise<SyncResult> {
  try {
    const status = await remoteSyncFetch<StatusResponse>('status.php');
    if (!status.ok) return { success: false, error: status.error || 'Remote sync status failed.' };
    return {
      success: true,
      counts: {
        items: status.items ?? 0,
        tombstones: status.tombstones ?? 0,
        latestUpdatedAt: status.latestUpdatedAt ?? 0,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync status failed.' };
  }
}

export async function flushRemoteSyncOutbox(): Promise<SyncResult> {
  const outbox = readOutbox();
  if (outbox.length === 0) return { success: true, counts: {} };
  if (!hasRemoteSyncToken()) return { success: false, error: 'Enter the admin sync token first.', counts: { queued: outbox.length } };

  try {
    const counts = await pushItems(outbox);
    writeOutbox([]);
    setRemoteSyncLastSyncedAt(maxItemUpdatedAt(outbox));
    return { success: true, counts };
  } catch (error) {
    writeOutbox(outbox);
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync flush failed.', counts: { queued: outbox.length } };
  }
}

export async function pushToRemoteSync(): Promise<SyncResult> {
  try {
    const flush = await flushRemoteSyncOutbox();
    if (!flush.success) return flush;

    const items = await readLocalRemoteSyncItems();
    const counts = await pushItems(items);
    setRemoteSyncLastSyncedAt(maxItemUpdatedAt(items));
    return { success: true, counts };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync push failed.' };
  }
}

export async function pullFromRemoteSync(options: { since?: number | null; flushAfter?: boolean } = {}): Promise<SyncResult> {
  try {
    const generation = syncGeneration;
    const since = options.since === null ? undefined : options.since ?? getRemoteSyncLastSyncMs();
    const path = since !== undefined ? `pull.php?since=${encodeURIComponent(String(since))}` : 'pull.php';
    const result = await remoteSyncFetch<PullResponse>(path);
    if (!result.ok) throw new Error(result.error || 'Remote sync pull failed.');
    if (syncGeneration !== generation || !hasRemoteSyncToken()) return { success: true, counts: { skipped: 1 } };

    const items = result.items ?? [];
    const counts = await applyRemoteSyncItems(items, { generation });
    if (syncGeneration !== generation || !hasRemoteSyncToken()) return { success: true, counts };
    const latestUpdatedAt = result.latestUpdatedAt ?? maxItemUpdatedAt(items);
    if (latestUpdatedAt > 0 || items.length > 0) setRemoteSyncLastSyncedAt(latestUpdatedAt);

    if (options.flushAfter) {
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

    return { success: true, counts };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync pull failed.' };
  }
}

export async function hydrateFromRemoteSync(): Promise<SyncResult> {
  return pullFromRemoteSync({ since: null, flushAfter: true });
}

export const startupHydrateFromRemoteSync = hydrateFromRemoteSync;
