import { DB_NAME, DB_VERSION, putDiagnosticEvent, putDiagnosticSession } from '../idb';
import { Severity, type DiagnosticEvent, type DiagnosticSession } from './types';

export const DIAG_EVENTS_CAP = 2000;
export const DIAG_SESSIONS_CAP = 100;
export const DIAG_REPORTS_CAP = 500;
export const DIAG_OUTBOX_CAP = 200;

const FALLBACK_STORAGE_KEY = 'patzer:diag:fallback';
const FALLBACK_EVENTS_CAP = 50;

let idbAvailable = true;

export function isIdbAvailable(): boolean {
  return idbAvailable;
}

function setIdbUnavailable(): void {
  idbAvailable = false;
}

function shouldWriteFallbackEvent(event: DiagnosticEvent): boolean {
  return event.severity === Severity.Error || event.severity === Severity.Fatal;
}

function parseFallbackEvents(raw: string | null): DiagnosticEvent[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed as DiagnosticEvent[] : [];
}

function writeToLocalStorageFallback(event: DiagnosticEvent): void {
  try {
    if (!shouldWriteFallbackEvent(event)) return;

    const events = parseFallbackEvents(localStorage.getItem(FALLBACK_STORAGE_KEY));
    events.push(event);
    const cappedEvents = events.slice(-FALLBACK_EVENTS_CAP);
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(cappedEvents));
  } catch {
    // Diagnostics fallback writes must not throw into app code.
  }
}

function openDiagnosticsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function evictOldest(storeName: string, timestampIndex: string, cap: number): Promise<void> {
  try {
    if (cap < 0) return;

    const db = await openDiagnosticsDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const countReq = store.count();
        let remainingToDelete = 0;

        countReq.onsuccess = () => {
          remainingToDelete = countReq.result - cap;
          if (remainingToDelete <= 0) return;

          const cursorReq = store.index(timestampIndex).openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor || remainingToDelete <= 0) return;

            cursor.delete();
            remainingToDelete -= 1;
            cursor.continue();
          };
          cursorReq.onerror = () => reject(cursorReq.error);
        };

        countReq.onerror = () => reject(countReq.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // Diagnostics eviction must never make the write path fail.
  }
}

export async function putEventWithEviction(event: DiagnosticEvent): Promise<void> {
  if (!idbAvailable) {
    writeToLocalStorageFallback(event);
    return;
  }

  try {
    await putDiagnosticEvent(event);
  } catch {
    setIdbUnavailable();
    writeToLocalStorageFallback(event);
    return;
  }

  await evictOldest('diagnostic-events', 'timestamp', DIAG_EVENTS_CAP);
}

export async function putSessionWithEviction(session: DiagnosticSession): Promise<void> {
  await putDiagnosticSession(session);
  await evictOldest('diagnostic-sessions', 'startedAt', DIAG_SESSIONS_CAP);
}
