




import { DB_NAME as MAIN_DB_NAME, DB_VERSION as MAIN_DB_VERSION } from '../idb/index';
import type { SyncResult } from './client';

const API_BASE = '/api/patzer-sync';
const TOKEN_KEY = 'chesspatzer.remoteSync.adminSyncToken';
const LAST_SYNC_KEY = 'chesspatzer.remoteSync.lastSyncedAt';
const PUSH_BATCH_SIZE = 100;

type StoreName = 'games' | 'analysis';

interface SyncItem {
  store:     StoreName;
  itemKey:   string;
  updatedAt: number;
  payload:   unknown;
}

interface PullResponse {
  ok?:    boolean;
  items?: SyncItem[];
  error?: string;
}

interface StatusResponse {
  ok?:      boolean;
  userKey?: string;
  items?:   number;
  error?:   string;
}

function openIdb(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAllFromStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve([]);
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeRecords(
  db: IDBDatabase,
  storeName: string,
  records: unknown[],
  keyForRecord?: (record: unknown) => string | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const record of records) {
      const key = keyForRecord?.(record);
      if (key) store.put(record, key);
      else store.put(record);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: unknown, field: string): string | null {
  const obj = objectValue(record);
  const value = obj?.[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function updatedAt(record: unknown): number {
  const obj = objectValue(record);
  const value = obj?.updatedAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function storedToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? '';
}

export function getRemoteSyncToken(): string {
  return storedToken();
}

export function hasRemoteSyncToken(): boolean {
  return storedToken().trim().length > 0;
}

export function setRemoteSyncToken(token: string): void {
  const value = token.trim();
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function clearRemoteSyncToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getRemoteSyncLastSyncedAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function setRemoteSyncLastSyncedAt(): void {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
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

async function remoteSyncFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = storedToken().trim();
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

function gameRecordsToItems(records: unknown[]): SyncItem[] {
  return records.flatMap(record => {
    const id = stringField(record, 'id');
    return id ? [{ store: 'games' as const, itemKey: id, updatedAt: updatedAt(record), payload: record }] : [];
  });
}

function analysisRecordsToItems(records: unknown[]): SyncItem[] {
  return records.flatMap(record => {
    const gameId = stringField(record, 'gameId');
    return gameId ? [{ store: 'analysis' as const, itemKey: gameId, updatedAt: updatedAt(record), payload: record }] : [];
  });
}

function flattenLegacyGameLibrary(records: unknown[]): unknown[] {
  const games: unknown[] = [];
  for (const record of records) {
    const obj = objectValue(record);
    const value = obj?.games;
    if (Array.isArray(value)) games.push(...value);
  }
  return games;
}

async function readLocalSyncItems(): Promise<SyncItem[]> {
  const db = await openIdb(MAIN_DB_NAME, MAIN_DB_VERSION);
  try {
    let games = await readAllFromStore(db, 'games');
    if (games.length === 0) games = flattenLegacyGameLibrary(await readAllFromStore(db, 'game-library'));
    const analysis = await readAllFromStore(db, 'analysis-library');
    return [...gameRecordsToItems(games), ...analysisRecordsToItems(analysis)];
  } finally {
    db.close();
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function testRemoteSyncConnection(): Promise<SyncResult> {
  try {
    const status = await remoteSyncFetch<StatusResponse>('status.php');
    if (!status.ok) return { success: false, error: status.error || 'Remote sync status failed.' };
    return { success: true, counts: { items: status.items ?? 0 } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync status failed.' };
  }
}

export async function pushToRemoteSync(): Promise<SyncResult> {
  try {
    const items = await readLocalSyncItems();
    const counts: Record<string, number> = { games: 0, analysis: 0 };
    for (const batch of chunks(items, PUSH_BATCH_SIZE)) {
      const result = await postJson<{ ok?: boolean; counts?: Record<string, number>; error?: string }>('push.php', { items: batch });
      if (!result.ok) throw new Error(result.error || 'Remote sync push failed.');
      for (const [key, value] of Object.entries(result.counts ?? {})) {
        counts[key] = (counts[key] ?? 0) + value;
      }
    }
    setRemoteSyncLastSyncedAt();
    return { success: true, counts };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync push failed.' };
  }
}

export async function pullFromRemoteSync(): Promise<SyncResult> {
  try {
    const lastSync = getRemoteSyncLastSyncedAt();
    const since = lastSync ? new Date(lastSync).getTime() : undefined;
    const path = since ? `pull.php?since=${encodeURIComponent(String(since))}` : 'pull.php';
    const result = await remoteSyncFetch<PullResponse>(path);
    if (!result.ok) throw new Error(result.error || 'Remote sync pull failed.');

    const games = (result.items ?? []).filter(item => item.store === 'games').map(item => item.payload);
    const analysis = (result.items ?? []).filter(item => item.store === 'analysis').map(item => item.payload);

    const db = await openIdb(MAIN_DB_NAME, MAIN_DB_VERSION);
    try {
      if (games.length > 0) await writeRecords(db, 'games', games);
      if (analysis.length > 0) await writeRecords(db, 'analysis-library', analysis, record => stringField(record, 'gameId') ?? undefined);
    } finally {
      db.close();
    }

    setRemoteSyncLastSyncedAt();
    return { success: true, counts: { games: games.length, analysis: analysis.length } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Remote sync pull failed.' };
  }
}
