export const REVIEW_ERROR_PACKAGE_DB_NAME = 'patzer-review-error-diagnostics-v1';
export const REVIEW_ERROR_PACKAGE_DB_VERSION = 1;
export const REVIEW_ERROR_PACKAGE_STORE = 'review-error-packages';

export type ReviewErrorPackageStatus = 'new' | 'investigating' | 'exported' | 'archived';

export interface ReviewErrorPackageStorageRecord {
  packageId: string;
  createdAt: string;
  gameId: string;
  status: ReviewErrorPackageStatus;
}

export interface ReviewErrorPackageSummary {
  packageId: string;
  createdAt: string;
  gameId: string;
  status: ReviewErrorPackageStatus;
}

export interface ReviewErrorPackageStorage<TPackage extends ReviewErrorPackageStorageRecord = ReviewErrorPackageStorageRecord> {
  put(pkg: TPackage): Promise<void>;
  get(packageId: string): Promise<TPackage | undefined>;
  list(limit?: number): Promise<TPackage[]>;
  delete(packageId: string): Promise<void>;
  exportJson(packageId: string): Promise<string>;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string): void {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

function openReviewErrorPackageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REVIEW_ERROR_PACKAGE_DB_NAME, REVIEW_ERROR_PACKAGE_DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(REVIEW_ERROR_PACKAGE_STORE)
        ? req.transaction!.objectStore(REVIEW_ERROR_PACKAGE_STORE)
        : db.createObjectStore(REVIEW_ERROR_PACKAGE_STORE, { keyPath: 'packageId' });

      ensureIndex(store, 'createdAt', 'createdAt');
      ensureIndex(store, 'gameId', 'gameId');
      ensureIndex(store, 'status', 'status');
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('review-error-package-db-blocked'));
  });
}

async function withReviewErrorPackageStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openReviewErrorPackageDb();
  try {
    const tx = db.transaction(REVIEW_ERROR_PACKAGE_STORE, mode);
    const store = tx.objectStore(REVIEW_ERROR_PACKAGE_STORE);
    const result = await callback(store, tx);
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

function requirePackageId(packageId: string): string {
  const normalized = packageId.trim();
  if (!normalized) throw new Error('review-error-package-id-required');
  return normalized;
}

function validatePackageRecord<TPackage extends ReviewErrorPackageStorageRecord>(pkg: TPackage): TPackage {
  if (!pkg || typeof pkg !== 'object') throw new Error('review-error-package-required');
  requirePackageId(pkg.packageId);
  if (!pkg.createdAt) throw new Error('review-error-package-created-at-required');
  if (!pkg.gameId) throw new Error('review-error-package-game-id-required');
  if (!pkg.status) throw new Error('review-error-package-status-required');
  return pkg;
}

export function summarizeReviewErrorPackage(pkg: ReviewErrorPackageStorageRecord): ReviewErrorPackageSummary {
  return {
    packageId: pkg.packageId,
    createdAt: pkg.createdAt,
    gameId: pkg.gameId,
    status: pkg.status,
  };
}

export async function putReviewErrorPackage<TPackage extends ReviewErrorPackageStorageRecord>(pkg: TPackage): Promise<void> {
  const validated = validatePackageRecord(pkg);
  await withReviewErrorPackageStore('readwrite', store => {
    store.put(validated);
  });
}

export async function getReviewErrorPackage<TPackage extends ReviewErrorPackageStorageRecord = ReviewErrorPackageStorageRecord>(
  packageId: string,
): Promise<TPackage | undefined> {
  const id = requirePackageId(packageId);
  return withReviewErrorPackageStore('readonly', store => new Promise<TPackage | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as TPackage | undefined);
    req.onerror = () => reject(req.error);
  }));
}

export async function listReviewErrorPackages<TPackage extends ReviewErrorPackageStorageRecord = ReviewErrorPackageStorageRecord>(
  limit = 100,
): Promise<TPackage[]> {
  return withReviewErrorPackageStore('readonly', store => new Promise<TPackage[]>((resolve, reject) => {
    const out: TPackage[] = [];
    const max = Math.max(0, limit);
    const req = store.index('createdAt').openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || out.length >= max) {
        resolve(out);
        return;
      }
      out.push(cursor.value as TPackage);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  }));
}

export async function deleteReviewErrorPackage(packageId: string): Promise<void> {
  const id = requirePackageId(packageId);
  await withReviewErrorPackageStore('readwrite', store => {
    store.delete(id);
  });
}

export async function exportReviewErrorPackageJson(packageId: string): Promise<string> {
  const pkg = await getReviewErrorPackage(packageId);
  if (!pkg) throw new Error('review-error-package-not-found');
  return JSON.stringify(pkg, null, 2);
}

export function createMemoryReviewErrorPackageStorage<TPackage extends ReviewErrorPackageStorageRecord>(): ReviewErrorPackageStorage<TPackage> {
  const records = new Map<string, TPackage>();

  return {
    async put(pkg: TPackage): Promise<void> {
      const validated = validatePackageRecord(pkg);
      records.set(validated.packageId, structuredClone(validated));
    },

    async get(packageId: string): Promise<TPackage | undefined> {
      const record = records.get(requirePackageId(packageId));
      return record ? structuredClone(record) : undefined;
    },

    async list(limit = 100): Promise<TPackage[]> {
      return [...records.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.max(0, limit))
        .map(record => structuredClone(record));
    },

    async delete(packageId: string): Promise<void> {
      records.delete(requirePackageId(packageId));
    },

    async exportJson(packageId: string): Promise<string> {
      const record = records.get(requirePackageId(packageId));
      if (!record) throw new Error('review-error-package-not-found');
      return JSON.stringify(record, null, 2);
    },
  };
}
