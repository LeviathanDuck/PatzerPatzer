












// Ported from Notebook Navigator (GPL-3.0-only, Copyright (c) 2025-2026 Johan Sanneblad), per






































// ---------------------------------------------------------------------------------------------
// Diff calculator
// ---------------------------------------------------------------------------------------------

/** A source-of-truth item as seen by the caller's domain (e.g. a StudyItem or StudyFolder). */
export interface NavigationIndexSourceItem {
  id: string;
  /** Monotonic version marker (e.g. `updatedAt`); compared to a cached record's marker to detect changes. */
  version: number;
}

/** The minimal shape a cached record must carry so the diff calculator can detect changes. */
export interface NavigationIndexCachedRecord {
  version: number;
}

export interface NavigationIndexDiffResult<
  TSource extends NavigationIndexSourceItem,
  TCached extends NavigationIndexCachedRecord,
> {
  toAdd: TSource[];
  toUpdate: TSource[];
  toRemove: string[];
  cachedRecords: Map<string, TCached>;
}

/**
 * Calculate the difference between a cached record map and the caller's current source-of-truth
 * item list. Identifies items that need to be added, updated, or removed from the cache.
 *
 * Adapted from notebook-navigator: src/storage/diffCalculator.ts (calculateFileDiff). The
 * original compares `TFile[]` against a `Map<string, FileData>` by path/mtime; this generalizes
 * the same add/update/remove reconciliation to any `{ id, version }` source against any
 * `{ version }` cached record, keyed by `id` instead of a vault path.
 */
export function calculateNavigationIndexDiff<
  TSource extends NavigationIndexSourceItem,
  TCached extends NavigationIndexCachedRecord,
>(currentItems: TSource[], cachedRecords: Map<string, TCached>): NavigationIndexDiffResult<TSource, TCached> {
  const toAdd: TSource[] = [];
  const toUpdate: TSource[] = [];
  const toRemove: string[] = [];
  const currentIds = new Set<string>();

  for (const item of currentItems) {
    currentIds.add(item.id);
    const cached = cachedRecords.get(item.id);

    if (!cached) {
      toAdd.push(item);
    } else if (item.version !== cached.version) {
      toUpdate.push(item);
    }
  }

  for (const [id] of cachedRecords) {
    if (!currentIds.has(id)) {
      toRemove.push(id);
    }
  }

  return { toAdd, toUpdate, toRemove, cachedRecords };
}

// ---------------------------------------------------------------------------------------------
// Synchronous in-memory mirror
// ---------------------------------------------------------------------------------------------

/**
 * In-memory record cache for synchronous reads, keyed by item id.
 *
 * Adapted from notebook-navigator: src/storage/MemoryFileCache.ts. The original also owns a
 * bounded preview-text LRU (`PreviewTextCache`) alongside the main file map; that sub-cache is
 * content-specific (chess game "preview text" has no defined shape at this generic layer) and is
 * left for a concrete content provider to add on top, so only the main record map is ported here.
 */
export class NavigationIndexMemoryMirror<TRecord> {
  private recordsById = new Map<string, TRecord>();
  private ready = false;

  /** Mark the mirror as initialized after loading data. */
  markInitialized(): void {
    this.ready = true;
  }

  /** Clears any cached data but leaves the mirror marked as ready (used when IDB has zero rows). */
  resetToEmpty(): void {
    this.recordsById.clear();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  getRecord(id: string): TRecord | null {
    return this.recordsById.get(id) ?? null;
  }

  getRecords(ids: string[]): Map<string, TRecord> {
    const result = new Map<string, TRecord>();
    for (const id of ids) {
      const record = this.recordsById.get(id);
      if (record !== undefined) {
        result.set(id, record);
      }
    }
    return result;
  }

  hasRecord(id: string): boolean {
    return this.recordsById.has(id);
  }

  getAllRecords(): TRecord[] {
    return Array.from(this.recordsById.values());
  }

  getAllRecordsWithIds(): { id: string; data: TRecord }[] {
    const result: { id: string; data: TRecord }[] = [];
    for (const [id, data] of this.recordsById.entries()) {
      result.push({ id, data });
    }
    return result;
  }

  getRecordCount(): number {
    return this.recordsById.size;
  }

  forEachRecord(callback: (id: string, data: TRecord) => void): void {
    this.recordsById.forEach((data, id) => callback(id, data));
  }

  updateRecord(id: string, data: TRecord): void {
    this.recordsById.set(id, data);
  }

  batchUpdate(updates: { id: string; data: TRecord }[]): void {
    for (const { id, data } of updates) {
      this.recordsById.set(id, data);
    }
  }

  deleteRecord(id: string): void {
    this.recordsById.delete(id);
  }

  batchDelete(ids: string[]): void {
    for (const id of ids) {
      this.recordsById.delete(id);
    }
  }

  clear(): void {
    this.recordsById.clear();
    this.ready = false;
  }
}

// ---------------------------------------------------------------------------------------------
// IndexedDB error helpers
// ---------------------------------------------------------------------------------------------

// Adapted from notebook-navigator: src/storage/indexeddb/idbErrors.ts
function normalizeIdbError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

// Adapted from notebook-navigator: src/storage/indexeddb/idbErrors.ts
function rejectWithTransactionError(
  reject: (reason?: unknown) => void,
  transaction: IDBTransaction,
  lastRequestError: DOMException | Error | null,
  fallbackMessage: string,
): void {
  const combinedError = transaction.error || lastRequestError;
  reject(normalizeIdbError(combinedError, fallbackMessage));
}

// Adapted from notebook-navigator: src/storage/indexeddb/idbErrors.ts
function isVersionError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'VersionError';
}

// ---------------------------------------------------------------------------------------------
// IndexedDB-backed storage (mirror + persistence)
// ---------------------------------------------------------------------------------------------

const DEFAULT_STORE_NAME = 'records';
const DEFAULT_SCHEMA_VERSION = 1;
const DEFAULT_CONTENT_VERSION = 1;
const DEFAULT_HYDRATION_BATCH_SIZE = 2000;

export interface NavigationIndexStorageOptions<TRecord> {
  /** Object store name within `dbName` (defaults to a single generic store). */
  storeName?: string;
  /** IndexedDB structure version. Bump when the object store shape itself must change. */
  schemaVersion?: number;
  /**
   * Data-format version, independent of `schemaVersion`. Bump when stored record *contents* must
   * be regenerated even though the object store shape is unchanged; a mismatch (or first run)
   * triggers a full clear so content providers rebuild from scratch. Mirrors NN's
   * `DB_SCHEMA_VERSION`/`DB_CONTENT_VERSION` split (src/storage/indexeddb/constants.ts).
   */
  contentVersion?: number;
  /** Batch size (keys+values per round trip) used to hydrate the mirror from IndexedDB on init. */
  hydrationBatchSize?: number;
  /** Inject a pre-built mirror (mainly for tests). Defaults to a fresh `NavigationIndexMemoryMirror`. */
  cache?: NavigationIndexMemoryMirror<TRecord>;
}

/**
 * IndexedDB-backed storage for an arbitrary record shape, with a synchronous in-memory mirror for
 * reads. Each instance owns exactly one IndexedDB database + one object store; a caller needing
 * more than one store should give each its own `dbName` (two independent `NavigationIndexStorage`
 * instances cannot safely add stores to a single shared database after the first has created it,
 * since IndexedDB only fires `onupgradeneeded` when the requested version increases).
 *
 * Adapted from notebook-navigator: src/storage/IndexedDBStorage.ts. The original also owns a
 * feature-image blob store and a preview-text store/LRU (`FeatureImageBlobStore`,
 * `PreviewTextCoordinator`) alongside the main file store; those are content-specific sub-caches
 * with no defined shape at this generic layer, so only the core single-store CRUD + versioned
 * rebuild-on-mismatch pattern is ported here.
 */
export class NavigationIndexStorage<TRecord> {
  private readonly cache: NavigationIndexMemoryMirror<TRecord>;
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly schemaVersion: number;
  private readonly contentVersion: number;
  private readonly hydrationBatchSize: number;
  private readonly schemaVersionKey: string;
  private readonly contentVersionKey: string;

  private db: IDBDatabase | null = null;
  private isClosing = false;
  private initPromise: Promise<void> | null = null;
  private changeListeners = new Set<(changes: { id: string; record: TRecord | null }[]) => void>();

  constructor(dbName: string, options?: NavigationIndexStorageOptions<TRecord>) {
    this.dbName = dbName;
    this.storeName = options?.storeName ?? DEFAULT_STORE_NAME;
    this.schemaVersion = options?.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
    this.contentVersion = options?.contentVersion ?? DEFAULT_CONTENT_VERSION;
    this.hydrationBatchSize = Math.max(1, options?.hydrationBatchSize ?? DEFAULT_HYDRATION_BATCH_SIZE);
    this.cache = options?.cache ?? new NavigationIndexMemoryMirror<TRecord>();
    this.schemaVersionKey = `patzer.navigationIndex.${dbName}.schemaVersion`;
    this.contentVersionKey = `patzer.navigationIndex.${dbName}.contentVersion`;
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  /** Initialize the database connection. Safe to call multiple times (idempotent). */
  async init(): Promise<void> {
    if (this.isClosing) return;
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.checkVersionsAndInit().catch(error => {
      console.error(`[NavigationIndexStorage:${this.dbName}] Failed to initialize database:`, error);
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  private getStoredVersion(key: string): number | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private setStoredVersion(key: string, value: number): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, String(value));
  }

  // Adapted from notebook-navigator: src/storage/IndexedDBStorage.ts (checkSchemaAndInit)
  private async checkVersionsAndInit(): Promise<void> {
    const storedSchemaVersion = this.getStoredVersion(this.schemaVersionKey);
    const storedContentVersion = this.getStoredVersion(this.contentVersionKey);

    const schemaVersionUnknown = storedSchemaVersion === null;
    const contentVersionUnknown = storedContentVersion === null;
    const contentChanged = storedContentVersion !== null && storedContentVersion !== this.contentVersion;
    const schemaDowngrade = storedSchemaVersion !== null && storedSchemaVersion > this.schemaVersion;

    const needsRebuild = schemaDowngrade || contentChanged || schemaVersionUnknown || contentVersionUnknown;

    if (schemaDowngrade) {
      // Only downgrades require a manual recreate; upgrades are handled by onupgradeneeded.
      await this.deleteDatabase();
    }

    try {
      await this.openDatabase(needsRebuild);
    } catch (error: unknown) {
      if (isVersionError(error)) {
        console.error(`[NavigationIndexStorage:${this.dbName}] Database version mismatch detected. Recreating database.`);
      } else {
        console.error(`[NavigationIndexStorage:${this.dbName}] Database open failed. Recreating database.`, error);
      }
      await this.deleteDatabase();
      await this.openDatabase(true);
    }

    if (needsRebuild) {
      await this.clear();
    }

    this.setStoredVersion(this.schemaVersionKey, this.schemaVersion);
    this.setStoredVersion(this.contentVersionKey, this.contentVersion);
  }

  private async deleteDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(normalizeIdbError(request.error, 'Failed to delete navigation-index database'));
      request.onblocked = () => reject(new Error('Navigation-index database deletion blocked'));
    });
  }

  private async openDatabase(skipCacheLoad: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.schemaVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          // Out-of-line keys: the record's id is supplied as the external key on get/put/delete,
          // not stored as a field inside the record itself.
          db.createObjectStore(this.storeName);
        }
      };

      request.onerror = () => {
        reject(normalizeIdbError(request.error, 'Failed to open navigation-index database'));
      };

      request.onblocked = () => {
        reject(new Error('Navigation-index database open blocked'));
      };

      request.onsuccess = async () => {
        const openedDb = request.result;
        if (this.isClosing) {
          try {
            openedDb.close();
          } catch {
            // noop
          }
          this.db = null;
          resolve();
          return;
        }

        this.db = openedDb;
        this.db.onversionchange = () => {
          try {
            this.db?.close();
          } catch {
            // noop
          }
          this.db = null;
        };

        if (skipCacheLoad) {
          this.cache.resetToEmpty();
          resolve();
          return;
        }

        try {
          await this.hydrateCache();
        } catch (error: unknown) {
          console.error(`[NavigationIndexStorage:${this.dbName}] Cache hydration failed:`, error);
          this.cache.resetToEmpty();
        }

        resolve();
      };
    });
  }

  // Adapted from notebook-navigator: src/storage/indexeddb/cacheHydration.ts (hydrateCacheFromMainStore)
  private async hydrateCache(): Promise<void> {
    const db = this.db;
    if (!db) {
      this.cache.resetToEmpty();
      return;
    }

    this.cache.clear();

    const requestToPromise = <T>(request: IDBRequest<T>, fallbackMessage: string): Promise<T> =>
      new Promise((resolveRequest, rejectRequest) => {
        request.onsuccess = () => resolveRequest(request.result);
        request.onerror = () => rejectRequest(normalizeIdbError(request.error, fallbackMessage));
      });

    // Bulk-load the store in key-ordered batches to avoid per-row cursor callbacks while still
    // bounding peak memory for a large index.
    const batchSize = this.hydrationBatchSize;
    let lastKey: IDBValidKey | null = null;

    while (true) {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const range = lastKey === null ? undefined : IDBKeyRange.lowerBound(lastKey, true);

      const keysRequest = store.getAllKeys(range, batchSize);
      const valuesRequest = store.getAll(range, batchSize) as IDBRequest<TRecord[]>;
      const [keys, values] = await Promise.all([
        requestToPromise(keysRequest, 'getAllKeys failed'),
        requestToPromise(valuesRequest, 'getAll failed'),
      ]);

      if (keys.length === 0) break;

      const rowCount = Math.min(keys.length, values.length);
      for (let index = 0; index < rowCount; index += 1) {
        const key = keys[index];
        const value = values[index];
        if (typeof key !== 'string' || value === undefined) continue;
        this.cache.updateRecord(key, value);
      }

      const nextLastKey = keys[keys.length - 1];
      if (nextLastKey === undefined) break;
      lastKey = nextLastKey;

      if (keys.length < batchSize) break;
    }

    this.cache.markInitialized();
  }

  // --- Synchronous mirror reads ---

  getRecord(id: string): TRecord | null {
    if (!this.cache.isReady()) return null;
    return this.cache.getRecord(id);
  }

  getRecords(ids: string[]): Map<string, TRecord> {
    if (!this.cache.isReady()) return new Map();
    return this.cache.getRecords(ids);
  }

  hasRecord(id: string): boolean {
    return this.cache.isReady() && this.cache.hasRecord(id);
  }

  getAllRecords(): { id: string; data: TRecord }[] {
    if (!this.cache.isReady()) return [];
    return this.cache.getAllRecordsWithIds();
  }

  forEachRecord(callback: (id: string, data: TRecord) => void): void {
    if (!this.cache.isReady()) return;
    this.cache.forEachRecord(callback);
  }

  getRecordCount(): number {
    return this.cache.isReady() ? this.cache.getRecordCount() : 0;
  }

  // --- Persistence writes ---

  async setRecord(id: string, data: TRecord): Promise<void> {
    await this.setRecords([{ id, data }]);
  }

  async setRecords(records: { id: string; data: TRecord }[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Navigation-index database not initialized');
    if (records.length === 0) return;

    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      let lastRequestError: DOMException | Error | null = null;

      for (const { id, data } of records) {
        const request = store.put(data, id);
        request.onerror = () => {
          lastRequestError = request.error || null;
        };
      }

      transaction.oncomplete = () => {
        this.cache.batchUpdate(records);
        this.emitChanges(records.map(({ id, data }) => ({ id, record: data })));
        resolve();
      };
      transaction.onabort = () => rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
      transaction.onerror = () => rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
    });
  }

  async deleteRecord(id: string): Promise<void> {
    await this.deleteRecords([id]);
  }

  async deleteRecords(ids: string[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Navigation-index database not initialized');
    if (ids.length === 0) return;

    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      let lastRequestError: DOMException | Error | null = null;

      for (const id of ids) {
        const request = store.delete(id);
        request.onerror = () => {
          lastRequestError = request.error || null;
        };
      }

      transaction.oncomplete = () => {
        this.cache.batchDelete(ids);
        this.emitChanges(ids.map(id => ({ id, record: null })));
        resolve();
      };
      transaction.onabort = () => rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
      transaction.onerror = () => rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
    });
  }

  /** Clear all records. Preserves the database/object-store structure. */
  async clear(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Navigation-index database not initialized');

    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      let lastRequestError: DOMException | Error | null = null;
      const request = store.clear();
      request.onerror = () => {
        lastRequestError = request.error || null;
      };
      transaction.oncomplete = () => {
        this.cache.resetToEmpty();
        resolve();
      };
      transaction.onabort = () => rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
      transaction.onerror = () => rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
    });
  }

  /** Subscribe to change notifications (whole-record granularity: `record: null` means deleted). */
  onChange(listener: (changes: { id: string; record: TRecord | null }[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private emitChanges(changes: { id: string; record: TRecord | null }[]): void {
    if (changes.length === 0) return;
    this.changeListeners.forEach(listener => {
      try {
        listener(changes);
      } catch (error: unknown) {
        console.error('Error in navigation-index change listener:', error);
      }
    });
  }

  /** Close the database connection. Should be called when the owning surface is torn down. */
  close(): void {
    this.isClosing = true;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initPromise = null;
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Content-provider interface
// ---------------------------------------------------------------------------------------------

export type NavigationContentProviderClearContext<TSettings> = {
  oldSettings: TSettings;
  newSettings: TSettings;
};

/**
 * Interface for content providers that generate one specific derived content type for a stream of
 * items. Each provider is responsible for declaring which settings affect its content,
 * determining when content needs regeneration, and clearing/regenerating its own content.
 *
 * Adapted from notebook-navigator: src/interfaces/IContentProvider.ts. `ContentProviderType`
 * (a closed union of NN's own content kinds — thumbnails/metadata/tags/markdown pipeline) becomes
 * a plain `string` tag here, since the concrete content kinds are a future Study provider's
 * concern, not this generic core's; `FileContentType`'s per-field union has no equivalent at this
 * layer for the same reason. Method names are unchanged from the original interface.
 */
export interface INavigationContentProvider<TItem, TSettings> {
  getContentType(): string;
  getRelevantSettings(): (keyof TSettings)[];
  shouldRegenerate(oldSettings: TSettings, newSettings: TSettings): boolean;
  clearContent(context?: NavigationContentProviderClearContext<TSettings>): Promise<void>;
  queueFiles(items: TItem[]): void;
  startProcessing(settings: TSettings): void;
  stopProcessing(): void;
  waitForIdle(): Promise<void>;
  onSettingsChanged(settings: TSettings): void;
}

// ---------------------------------------------------------------------------------------------
// Content-provider registry
// ---------------------------------------------------------------------------------------------

/**
 * Registry for managing content providers. Centralizes registration and coordinates settings
 * changes / bulk queueing across independent content generators.
 *
 * Adapted from notebook-navigator: src/services/content/ContentProviderRegistry.ts — logic is
 * unchanged; `NotebookNavigatorSettings`/`TFile`/`ContentProviderType` are replaced by the
 * `TSettings`/`TItem`/`string` generics used throughout this module.
 */
export class NavigationIndexProviderRegistry<TItem, TSettings> {
  private providers = new Map<string, INavigationContentProvider<TItem, TSettings>>();

  registerProvider(provider: INavigationContentProvider<TItem, TSettings>): void {
    this.providers.set(provider.getContentType(), provider);
  }

  getAllProviders(): INavigationContentProvider<TItem, TSettings>[] {
    return Array.from(this.providers.values());
  }

  getProvider(type: string): INavigationContentProvider<TItem, TSettings> | undefined {
    return this.providers.get(type);
  }

  getAllRelevantSettings(): (keyof TSettings)[] {
    const allSettings = new Set<keyof TSettings>();
    for (const provider of this.providers.values()) {
      provider.getRelevantSettings().forEach(setting => allSettings.add(setting));
    }
    return Array.from(allSettings);
  }

  /**
   * Handles a settings change by notifying affected providers, stopping/waiting-idle for any
   * provider whose relevant settings changed (or that reports it should regenerate), then clearing
   * content for providers that need regeneration. Returns the content types that were cleared.
   */
  async handleSettingsChange(oldSettings: TSettings, newSettings: TSettings): Promise<string[]> {
    const stopPromises: Promise<void>[] = [];
    const providersToClear: { provider: INavigationContentProvider<TItem, TSettings>; context: NavigationContentProviderClearContext<TSettings> }[] = [];
    const affectedTypes: string[] = [];

    for (const provider of this.providers.values()) {
      const relevantSettings = provider.getRelevantSettings();
      const hasRelevantChanges = relevantSettings.some(settingKey => oldSettings[settingKey] !== newSettings[settingKey]);
      const shouldClear = provider.shouldRegenerate(oldSettings, newSettings);

      if (hasRelevantChanges || shouldClear) {
        // stopProcessing() cannot cancel in-flight persistence writes, so wait for idle too.
        provider.stopProcessing();
        stopPromises.push(provider.waitForIdle());
      }

      if (shouldClear) {
        providersToClear.push({ provider, context: { oldSettings, newSettings } });
        affectedTypes.push(provider.getContentType());
      }

      provider.onSettingsChanged(newSettings);
    }

    if (stopPromises.length > 0) {
      await Promise.all(stopPromises);
    }

    if (providersToClear.length > 0) {
      await Promise.all(providersToClear.map(({ provider, context }) => provider.clearContent(context)));
    }

    return affectedTypes;
  }

  /** Queues items for content generation across all (or a filtered subset of) registered providers. */
  queueFilesForAllProviders(items: TItem[], settings: TSettings, options?: { include?: string[]; exclude?: string[] }): void {
    const include = options?.include;
    const exclude = options?.exclude;

    for (const provider of this.providers.values()) {
      const type = provider.getContentType();

      if (include && !include.includes(type)) continue;
      if (exclude && exclude.includes(type)) continue;

      // Resume the provider before queuing so it accepts new work after a stop.
      provider.startProcessing(settings);
      provider.queueFiles(items);
    }
  }

  stopAllProcessing(): void {
    for (const provider of this.providers.values()) {
      provider.stopProcessing();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Base content-provider (queue/backoff/batch orchestration engine)
// ---------------------------------------------------------------------------------------------

const DEFAULT_QUEUE_BATCH_SIZE = 100;
const DEFAULT_PARALLEL_LIMIT = 10;
const DEFAULT_RETRY_INITIAL_DELAY_MS = 1000;
const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;
const DEFAULT_RETRY_MAX_ATTEMPTS = 5;
const WAIT_FOR_IDLE_RETRY_POLL_MS = 25;

export interface NavigationContentProcessResult<TRecord> {
  /** The new record to persist for this item, or null when no content field actually changed. */
  record: TRecord | null;
  /** Whether processing succeeded (false schedules a backoff retry; see `queueFiles`/retry state). */
  processed: boolean;
}

export interface BaseNavigationContentProviderDeps<TItem extends { id: string }, TRecord> {
  /** Synchronous lookup of the currently-cached record for an item, used by `needsProcessing`/`processItem`. */
  getRecord: (id: string) => TRecord | null;
  /**
   * Re-resolves an item by id at processing time, mirroring NN's `app.vault.getAbstractFileByPath`
   * re-resolution — an id that no longer resolves (deleted/moved out from under the queue) is
   * dropped instead of processed.
   */
  resolveItem: (id: string) => TItem | null;
  /** Persists a batch of processed updates (only items whose `processItem` returned a non-null record). */
  applyUpdates: (updates: { id: string; record: TRecord }[]) => Promise<void>;
}

export interface BaseNavigationContentProviderOptions {
  queueBatchSize?: number;
  parallelLimit?: number;
  retry?: { initialDelayMs?: number; maxDelayMs?: number; maxAttempts?: number };
}

/**
 * Base class for content providers: queue management, de-duplication, parallel batch processing,
 * and exponential-backoff retry-on-failure. Concrete subclasses supply the domain logic
 * (`processItem`/`needsProcessing`/`getContentType`/`getRelevantSettings`/`shouldRegenerate`/
 * `clearContent`); this class supplies the scheduling engine around them.
 *
 * Adapted from notebook-navigator: src/services/content/BaseContentProvider.ts. Logic (queueing,
 * de-duplication, parallel-batch processing, exponential backoff with capped attempts, "dirty
 * during processing" re-queueing, session-based stale-batch cancellation, idle-wait polling) is
 * unchanged; Obsidian-coupled pieces are translated: `this.app.vault.getAbstractFileByPath`
 * re-resolution and `getDBInstance()` reads/writes become the injected `deps.resolveItem`/
 * `deps.getRecord`/`deps.applyUpdates` hooks, `TFile`/`FileData` become the generic
 * `TItem`/`TRecord`, and the per-batch `AbortController` (used to cut short an in-progress
 * `app.vault.cachedRead`) is dropped — see the file-header translation notes.
 */
export abstract class BaseNavigationContentProvider<TItem extends { id: string }, TSettings, TRecord>
  implements INavigationContentProvider<TItem, TSettings>
{
  protected readonly queueBatchSize: number;
  protected readonly parallelLimit: number;

  private static readonly RETRY_UNSCHEDULED_AT = Number.MAX_SAFE_INTEGER;
  private readonly retryInitialDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly retryMaxAttempts: number;

  // Work queue of item ids; resolved back to `TItem` at processing time via `deps.resolveItem`.
  protected queue: string[] = [];
  protected isProcessing = false;
  protected currentBatchSettings: TSettings | null = null;
  // Track ids currently being processed to prevent duplicate processing when queued again quickly.
  protected processingIds: Set<string> = new Set();
  // Track ids already queued to avoid unbounded duplicate enqueues.
  protected queuedIds: Set<string> = new Set();
  // Ids queued while already processing, re-enqueued once the current batch finishes.
  protected dirtyIdsDuringProcessing: Set<string> = new Set();
  // Prevents any post-stop scheduling or enqueues.
  protected stopped = false;

  // Monotonic session counter; prevents a stale batch from writing/mutating state after stop/start.
  private processingSession = 0;
  private activeBatchPromise: Promise<void> | null = null;

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryState = new Map<string, { attempts: number; nextRetryAt: number }>();

  constructor(
    protected readonly deps: BaseNavigationContentProviderDeps<TItem, TRecord>,
    options?: BaseNavigationContentProviderOptions,
  ) {
    this.queueBatchSize = options?.queueBatchSize ?? DEFAULT_QUEUE_BATCH_SIZE;
    this.parallelLimit = options?.parallelLimit ?? DEFAULT_PARALLEL_LIMIT;
    this.retryInitialDelayMs = options?.retry?.initialDelayMs ?? DEFAULT_RETRY_INITIAL_DELAY_MS;
    this.retryMaxDelayMs = options?.retry?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
    this.retryMaxAttempts = options?.retry?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
  }

  abstract getContentType(): string;
  abstract getRelevantSettings(): (keyof TSettings)[];
  abstract shouldRegenerate(oldSettings: TSettings, newSettings: TSettings): boolean;
  abstract clearContent(context?: NavigationContentProviderClearContext<TSettings>): Promise<void>;

  /** Process a single item to generate its content. */
  protected abstract processItem(item: TItem, record: TRecord | null, settings: TSettings): Promise<NavigationContentProcessResult<TRecord>>;

  /** Checks if an item needs (re)processing given its current cached record. */
  protected abstract needsProcessing(record: TRecord | null, item: TItem, settings: TSettings): boolean;

  /** Runs after a provider session drains all queued and dirty-during-processing work. */
  protected onProcessingIdle(): void {}

  queueFiles(items: TItem[]): void {
    if (this.stopped) return;
    let queuedWork = false;
    for (const item of items) {
      const id = item.id;
      if (this.processingIds.has(id)) {
        this.dirtyIdsDuringProcessing.add(id);
        continue;
      }
      if (this.queuedIds.has(id)) continue;
      this.queue.push(id);
      this.queuedIds.add(id);
      queuedWork = true;
    }

    if (queuedWork && !this.isProcessing && this.currentBatchSettings) {
      // `NavigationIndexProviderRegistry` calls `startProcessing()` first, but direct callers can
      // enqueue while idle.
      this.runProcessNextBatch();
    }
  }

  startProcessing(settings: TSettings): void {
    // Allow restarting after a stop.
    this.stopped = false;
    this.currentBatchSettings = settings;

    if (!this.stopped && !this.isProcessing && this.queue.length > 0) {
      this.runProcessNextBatch();
    }
  }

  onSettingsChanged(settings: TSettings): void {
    this.currentBatchSettings = settings;
  }

  private hasPendingWork(): boolean {
    return (
      this.isProcessing ||
      this.activeBatchPromise !== null ||
      this.queue.length > 0 ||
      this.retryTimer !== null ||
      this.hasScheduledRetryWork()
    );
  }

  async waitForIdle(): Promise<void> {
    while (this.hasPendingWork()) {
      const promise = this.activeBatchPromise;
      if (promise) {
        try {
          await promise;
        } catch {
          // Errors are already logged where the batch promise is created.
        }
      } else if (this.retryTimer !== null || this.hasScheduledRetryWork()) {
        // Retry work advances on timers; poll until retries are flushed or cleared.
        await new Promise<void>(resolve => setTimeout(resolve, WAIT_FOR_IDLE_RETRY_POLL_MS));
      } else {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  }

  stopProcessing(): void {
    this.processingSession += 1;
    // Mark stopped first so any in-flight logic can observe it.
    this.stopped = true;

    this.clearRetryState();
    this.isProcessing = false;
    this.queue = [];
    this.processingIds.clear();
    this.queuedIds.clear();
    this.dirtyIdsDuringProcessing.clear();
  }

  private runProcessNextBatch(): void {
    const promise = this.processNextBatch().catch(error => {
      console.error(`[${this.getContentType()}] Error processing batch:`, error);
    });
    this.activeBatchPromise = promise;
    void promise.finally(() => {
      if (this.activeBatchPromise === promise) {
        this.activeBatchPromise = null;
      }
    });
  }

  private hasScheduledRetryWork(): boolean {
    for (const state of this.retryState.values()) {
      if (state.nextRetryAt !== BaseNavigationContentProvider.RETRY_UNSCHEDULED_AT) {
        return true;
      }
    }
    return false;
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private clearRetryState(): void {
    this.clearRetryTimer();
    this.retryState.clear();
  }

  private clearRetryForId(id: string): void {
    if (!this.retryState.delete(id)) return;
    this.scheduleRetryTimer(this.processingSession);
  }

  private scheduleRetry(id: string, session: number): void {
    if (this.stopped || this.processingSession !== session) return;

    const existing = this.retryState.get(id);
    const attempts = existing ? existing.attempts + 1 : 1;
    if (attempts > this.retryMaxAttempts) {
      if (existing) {
        console.error(`[${this.getContentType()}] dropped item after retry exhaustion`, { id, attempts });
        this.retryState.delete(id);
        this.scheduleRetryTimer(session);
      }
      return;
    }

    const delay = Math.min(this.retryInitialDelayMs * 2 ** (attempts - 1), this.retryMaxDelayMs);
    this.retryState.set(id, { attempts, nextRetryAt: Date.now() + delay });
    this.scheduleRetryTimer(session);
  }

  private scheduleRetryTimer(session: number): void {
    if (this.stopped || this.processingSession !== session || this.retryState.size === 0) {
      this.clearRetryTimer();
      return;
    }

    let nextRetryAt = BaseNavigationContentProvider.RETRY_UNSCHEDULED_AT;
    for (const state of this.retryState.values()) {
      if (state.nextRetryAt === BaseNavigationContentProvider.RETRY_UNSCHEDULED_AT) continue;
      if (state.nextRetryAt < nextRetryAt) nextRetryAt = state.nextRetryAt;
    }

    if (nextRetryAt === BaseNavigationContentProvider.RETRY_UNSCHEDULED_AT) {
      this.clearRetryTimer();
      return;
    }

    this.clearRetryTimer();
    const delay = Math.max(0, nextRetryAt - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flushRetries(session);
    }, delay);
  }

  private flushRetries(session: number): void {
    if (this.stopped || this.processingSession !== session || this.retryState.size === 0) {
      this.clearRetryState();
      return;
    }

    const now = Date.now();
    const itemsToRetry: TItem[] = [];

    for (const [id, state] of this.retryState) {
      if (state.nextRetryAt > now) continue;

      const item = this.deps.resolveItem(id);
      if (item) {
        itemsToRetry.push(item);
        this.retryState.set(id, { ...state, nextRetryAt: BaseNavigationContentProvider.RETRY_UNSCHEDULED_AT });
      } else {
        this.retryState.delete(id);
      }
    }

    if (itemsToRetry.length > 0) {
      this.queueFiles(itemsToRetry);
    }

    this.scheduleRetryTimer(session);
  }

  protected async processNextBatch(): Promise<void> {
    if (this.stopped || this.isProcessing || this.queue.length === 0 || !this.currentBatchSettings) {
      return;
    }

    this.isProcessing = true;
    const session = this.processingSession;
    const settings = this.currentBatchSettings;

    let activeJobs: { id: string; item: TItem; record: TRecord | null }[] = [];

    try {
      const batch = this.queue.splice(0, this.queueBatchSize);
      // Remove from the queued set now that these ids are moving to evaluation/processing.
      batch.forEach(id => this.queuedIds.delete(id));

      const jobsWithData: { id: string; item: TItem; record: TRecord | null; needsProcessing: boolean }[] = [];
      for (const id of batch) {
        // Re-resolve each id to pick up deletes/renames and avoid holding a stale item reference.
        const item = this.deps.resolveItem(id);
        if (!item) {
          // The item disappeared while waiting in the queue; a stale retry entry is no longer valid.
          this.clearRetryForId(id);
          continue;
        }
        const record = this.deps.getRecord(item.id);
        const needsProcessing = this.needsProcessing(record, item, settings);
        if (!needsProcessing) {
          this.clearRetryForId(item.id);
        }
        jobsWithData.push({ id: item.id, item, record, needsProcessing });
      }

      activeJobs = jobsWithData.filter(entry => entry.needsProcessing);

      if (activeJobs.length === 0) {
        return;
      }

      activeJobs.forEach(({ id }) => this.processingIds.add(id));

      const updates: { id: string; record: TRecord }[] = [];

      // Intentionally process parallel batches back-to-back; prioritizes throughput during bulk
      // settings-triggered regeneration.
      for (let i = 0; i < activeJobs.length; i += this.parallelLimit) {
        if (this.stopped || this.processingSession !== session) break;

        const parallelBatch = activeJobs.slice(i, i + this.parallelLimit);
        const results = await Promise.all(
          parallelBatch.map(async ({ id, item, record }) => {
            try {
              const result = await this.processItem(item, record, settings);
              return { id, result };
            } catch (error) {
              console.error(`[${this.getContentType()}] Error processing ${id}:`, error);
              return { id, result: { record: null, processed: false } as NavigationContentProcessResult<TRecord> };
            }
          }),
        );

        results.forEach(({ id, result }) => {
          if (this.processingSession === session && !this.stopped) {
            if (!result.processed) {
              this.scheduleRetry(id, session);
            } else {
              this.clearRetryForId(id);
            }
          }

          if (result.record !== null) {
            updates.push({ id, record: result.record });
          }
        });
      }

      if (!(this.stopped || this.processingSession !== session) && updates.length > 0) {
        await this.deps.applyUpdates(updates);
      }
    } finally {
      const isActiveSession = this.processingSession === session && !this.stopped;

      if (this.processingSession === session) {
        activeJobs.forEach(({ id }) => this.processingIds.delete(id));
      }

      if (isActiveSession) {
        const dirtyItems: TItem[] = [];
        for (const id of this.dirtyIdsDuringProcessing) {
          const item = this.deps.resolveItem(id);
          if (item) dirtyItems.push(item);
        }
        this.dirtyIdsDuringProcessing.clear();
        if (dirtyItems.length > 0) {
          this.queueFiles(dirtyItems);
        }
      } else if (this.processingSession === session) {
        this.dirtyIdsDuringProcessing.clear();
      }

      this.isProcessing = false;

      if (isActiveSession && this.queue.length === 0) {
        // Signals subclasses once queued and dirty-item work has drained for this session.
        this.onProcessingIdle();
      }

      if (this.queue.length > 0 && isActiveSession) {
        this.runProcessNextBatch();
      }
    }
  }
}
