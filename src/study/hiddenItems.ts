
























export type HiddenItemKind = 'folder' | 'game';

export interface HiddenItemEntry {
  kind: HiddenItemKind;
  id: string;
}

const HIDDEN_ITEMS_STORAGE_KEY = 'patzer.studyHiddenItems';

function isHiddenItemKind(value: unknown): value is HiddenItemKind {
  return value === 'folder' || value === 'game';
}

function loadHiddenItems(): HiddenItemEntry[] {
  try {
    const raw = localStorage.getItem(HIDDEN_ITEMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: HiddenItemEntry[] = [];
    for (const candidate of parsed) {
      if (
        candidate !== null && typeof candidate === 'object'
        && isHiddenItemKind((candidate as Record<string, unknown>).kind)
        && typeof (candidate as Record<string, unknown>).id === 'string'
      ) {
        entries.push({
          kind: (candidate as Record<string, unknown>).kind as HiddenItemKind,
          id: (candidate as Record<string, unknown>).id as string,
        });
      }
      // Malformed entries (missing/wrong-typed fields) are silently dropped -- same
      // graceful-degradation posture as shortcuts.ts's own corrupt-localStorage fallback.
    }
    return entries;
  } catch {
    return []; // corrupt/unavailable localStorage -- falls back to "nothing hidden".
  }
}

function persistHiddenItems(entries: readonly HiddenItemEntry[]): void {
  try {
    localStorage.setItem(HIDDEN_ITEMS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort only (private browsing, quota) -- hidden state simply resets next load.
  }
}

let _hiddenItems: HiddenItemEntry[] = loadHiddenItems();

/** Current hidden entries, in insertion order. A defensive copy -- callers mutate only through
 * `hideItem`/`unhideItem` below, never this array directly. */
export function hiddenItems(): readonly HiddenItemEntry[] {
  return _hiddenItems.slice();
}

export function isHidden(kind: HiddenItemKind, id: string): boolean {
  return _hiddenItems.some(entry => entry.kind === kind && entry.id === id);
}

/** Idempotent: a no-op when this exact (kind, id) is already hidden. */
export function hideItem(kind: HiddenItemKind, id: string): void {
  if (isHidden(kind, id)) return;
  _hiddenItems = [..._hiddenItems, { kind, id }];
  persistHiddenItems(_hiddenItems);
}

/** No-op (no redundant persist write) when this (kind, id) was not already hidden. */
export function unhideItem(kind: HiddenItemKind, id: string): void {
  const next = _hiddenItems.filter(entry => !(entry.kind === kind && entry.id === id));
  if (next.length === _hiddenItems.length) return;
  _hiddenItems = next;
  persistHiddenItems(_hiddenItems);
}

// ---------------------------------------------------------------------------------------------
// Eye-toggle state ("Show/Hide hidden folders, tags, and notes" -- inventory §1 row 2). A plain
// module-level boolean, mirroring `navigatorShellView.ts`'s own ephemeral per-session toggles
// (`_reorderMode`, `_itemSearchOpen`, `_sortMenuOpen`) -- NOT persisted to localStorage: every other
// toolbar toggle in that file resets to its default on reload, and the eye button is the same kind
// of transient view-state control, not a durable per-device preference like the hidden-id set
// itself (which DOES persist, above). Default false ("hidden stays hidden") matches NN's own default
// (`showHiddenItems: false`).
// ---------------------------------------------------------------------------------------------

let _showHiddenItems = false;

export function showHiddenItems(): boolean {
  return _showHiddenItems;
}

export function toggleShowHidden(): void {
  _showHiddenItems = !_showHiddenItems;
}
