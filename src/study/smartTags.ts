
























import type { StudyRouteState } from './routeState';

/**
 * A saved user smart tag — a persisted advanced-search query (NOT a persisted list of matched
 * item ids), rendered as a computed lens in the nav pane's tags area (design §5).
 */
export interface UserSmartTag {
  /** Stable unique id (crypto.randomUUID() when available, else a time+random fallback). */
  id: string;
  /** User-authored label — trimmed and length-bounded (see NAME_MAX_LENGTH); never empty. */
  name: string;
  /** The saved advanced-search query — the T5-D14 `StudyRouteState`, stored verbatim. */
  query: StudyRouteState;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

const SMART_TAGS_STORAGE_KEY = 'patzer.study.smartTags.v1';

// Mirrors routeState.ts's own (non-exported) LABEL_MAX_LENGTH bound — kept as a local const here
// because routeState.ts does not export it (read-only file this slice may not edit to add an
// export). A user smart-tag name is a label, so it shares the label bound.
const NAME_MAX_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

// A persisted entry is accepted only when it carries the four required fields with valid shapes,
// and is then RECONSTRUCTED to EXACTLY `{ id, name, query, createdAt }` — never spread/kept
// wholesale. This is the structural guarantee that any extra field a tampered/corrupt record might
// carry (e.g. a `memberIds` membership array) can NEVER survive a load→save round-trip, satisfying
// design §5 ("a persisted query, not a persisted membership list") even against hand-edited storage.
//
// The `query` must at least expose the string `q` field that `serializeStudyRouteState` dereferences
// first (`routeState.ts` `state.q.trim()`), so a `{ query: {} }` record is DROPPED here rather than
// accepted-then-throwing when its row is applied. The full StudyRouteState is re-validated by
// routeState's own parser whenever it is applied, exactly as a URL query would be — this guard only
// covers the one field that would otherwise crash at serialize time. `name` is clamped to the same
// bound the write path enforces; a garbage `createdAt` (not a parseable date) drops the record.
function sanitizeSmartTag(value: unknown): UserSmartTag | null {
  if (!isRecord(value)) return null;
  const { id, name, query, createdAt } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (!isRecord(query) || typeof query.q !== 'string') return null;
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return null;
  const trimmed = name.trim();
  const bounded = trimmed.length > NAME_MAX_LENGTH ? trimmed.slice(0, NAME_MAX_LENGTH) : trimmed;
  // Reconstruct to exactly the four fields — `query`'s own internal route fields are preserved
  // verbatim (only the TOP-LEVEL record is whitelisted; the saved query object is stored as-is).
  return { id, name: bounded, query: query as unknown as StudyRouteState, createdAt };
}

function loadSmartTags(): UserSmartTag[] {
  try {
    const raw = localStorage.getItem(SMART_TAGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Malformed individual entries are silently dropped while valid entries in the same array
    // survive (and are reconstructed) — same graceful-degradation posture as hiddenItems.ts's
    // corrupt-localStorage handling.
    return parsed
      .map(sanitizeSmartTag)
      .filter((tag): tag is UserSmartTag => tag !== null);
  } catch {
    return []; // corrupt/unavailable localStorage — falls back to "no saved smart tags".
  }
}

function persistSmartTags(tags: readonly UserSmartTag[]): void {
  try {
    localStorage.setItem(SMART_TAGS_STORAGE_KEY, JSON.stringify(tags));
  } catch {
    // Best-effort only (private browsing, quota) — the saved list simply resets next load.
  }
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let _smartTags: UserSmartTag[] = loadSmartTags();

/**
 * Current saved smart tags, in insertion order. A defensive copy — callers mutate only through
 * `saveSmartTag`/`deleteSmartTag` below, never this array directly. Read-once-then-cache: the
 * backing array is read from localStorage once at module load and thereafter kept in memory,
 * re-persisted on every write.
 */
export function listSmartTags(): UserSmartTag[] {
  return _smartTags.slice();
}

/**
 * Append a new smart tag for the given query and persist it. Returns the created record.
 *
 * Contract: the `name` is trimmed and bounded to NAME_MAX_LENGTH; an empty or whitespace-only name
 * is REJECTED by throwing a `TypeError` (chosen over returning null so a blank name is a hard error
 * the caller must guard, matching controlExplainer's own blank-label posture). The `query` is
 * stored VERBATIM as a `StudyRouteState` — no membership is computed, no matched ids are stored.
 */
export function saveSmartTag(name: string, query: StudyRouteState): UserSmartTag {
  const trimmed = name.trim();
  if (!trimmed) throw new TypeError('A smart-tag name must not be blank.');
  const bounded = trimmed.length > NAME_MAX_LENGTH ? trimmed.slice(0, NAME_MAX_LENGTH) : trimmed;
  const tag: UserSmartTag = {
    id: newId(),
    name: bounded,
    query,
    createdAt: new Date().toISOString(),
  };
  _smartTags = [..._smartTags, tag];
  persistSmartTags(_smartTags);
  return tag;
}

/** Remove the smart tag with this id and persist. No-op (no redundant write) when not present. */
export function deleteSmartTag(id: string): void {
  const next = _smartTags.filter(tag => tag.id !== id);
  if (next.length === _smartTags.length) return;
  _smartTags = next;
  persistSmartTags(_smartTags);
}
