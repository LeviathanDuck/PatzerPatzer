




















export type ShortcutKind = 'game' | 'folder';

export interface ShortcutEntry {
  kind: ShortcutKind;
  id: string;
}

const SHORTCUTS_STORAGE_KEY = 'patzer.studyShortcuts';

function isShortcutKind(value: unknown): value is ShortcutKind {
  return value === 'game' || value === 'folder';
}

function loadShortcuts(): ShortcutEntry[] {
  try {
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: ShortcutEntry[] = [];
    for (const candidate of parsed) {
      if (
        candidate !== null && typeof candidate === 'object'
        && isShortcutKind((candidate as Record<string, unknown>).kind)
        && typeof (candidate as Record<string, unknown>).id === 'string'
      ) {
        entries.push({
          kind: (candidate as Record<string, unknown>).kind as ShortcutKind,
          id: (candidate as Record<string, unknown>).id as string,
        });
      }
      // Malformed entries (missing/wrong-typed fields) are silently dropped -- same graceful-
      // degradation posture as loadPinnedIds' own corrupt-localStorage fallback.
    }
    return entries;
  } catch {
    return []; // corrupt/unavailable localStorage -- falls back to "no shortcuts".
  }
}

function persistShortcuts(entries: readonly ShortcutEntry[]): void {
  try {
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort only (private browsing, quota) -- shortcuts simply reset to none next load.
  }
}

let _shortcuts: ShortcutEntry[] = loadShortcuts();

/** Current shortcuts, in insertion order. A defensive copy -- callers mutate only through
 * `addShortcut`/`removeShortcut` below, never this array directly. */
export function shortcuts(): readonly ShortcutEntry[] {
  return _shortcuts.slice();
}

export function isShortcut(kind: ShortcutKind, id: string): boolean {
  return _shortcuts.some(entry => entry.kind === kind && entry.id === id);
}

/** Idempotent: a no-op when this exact (kind, id) is already a shortcut -- appends at the end
 * (insertion order) otherwise. */
export function addShortcut(kind: ShortcutKind, id: string): void {
  if (isShortcut(kind, id)) return;
  _shortcuts = [..._shortcuts, { kind, id }];
  persistShortcuts(_shortcuts);
}

/** No-op (no redundant persist write) when this (kind, id) was not already a shortcut. */
export function removeShortcut(kind: ShortcutKind, id: string): void {
  const next = _shortcuts.filter(entry => !(entry.kind === kind && entry.id === id));
  if (next.length === _shortcuts.length) return;
  _shortcuts = next;
  persistShortcuts(_shortcuts);
}
