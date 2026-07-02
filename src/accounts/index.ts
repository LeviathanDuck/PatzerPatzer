






import { saveAccountToIdb, getAccountFromIdb, listAccountsFromIdb } from '../idb';

export type AccountPlatform = 'lichess' | 'chesscom';

/**
 * Account category. Seeded with the three known categories; typed as an open
 * string set so future categories require no schema migration.
 */
export type AccountCategory = 'mine' | 'opponent' | 'study' | (string & {});

/**
 * Opponent card placement. Section is the single source of truth for where a
 * card sits on the Opponents page; `category` remains a separate, independent
 * classification (see `accountSection()` for the legacy-record fallback).
 */
export type AccountSection = 'research' | 'study' | 'archive';

export interface ChessAccount {
  /** Canonical id: `${platform}:${lowercased username}`. */
  id: string;
  platform: AccountPlatform;
  /** Lowercased canonical username, matching game-record `importedUsername`. */
  username: string;
  /** Username with original casing, for display. */
  displayName: string;
  category: AccountCategory;
  /**
   * Opponent card placement (research / study / archive). Authoritative for
   * the Opponents page once set; undefined on legacy records until migrated
   * or explicitly moved by the user — read via `accountSection()`, never
   * this field directly, so the UI never sees an undefined section.
   */
  section?: AccountSection;
  /**
   * Intra-section ascending sort key. New/legacy records default to a stable
   * value (their `addedAt`) so order is deterministic before the user
   * reorders cards by hand.
   */
  order?: number;
  /** User-applied tags: lowercased, trimmed, de-duped. Defaults to `[]`. */
  tags?: string[];
  /**
   * Cached platform all-time best rating per speed, populated by a later
   * prompt's lifetime-rating fetch. Declared here only — not yet populated.
   */
  lifetimeBest?: Partial<Record<'rapid' | 'blitz' | 'classical' | 'daily', number>>;
  /** Date.now() when profile fields such as displayName/category last changed. */
  profileUpdatedAt?: number;
  /** Date.now() when the account was first registered. */
  addedAt: number;
  /** Date.now() of the last successful import for this account, or null if never synced. */
  lastSyncedAt: number | null;
  /** Date.now() when import cursor fields last changed. */
  syncCursorUpdatedAt?: number;
  /**
   * Epoch ms of the newest imported game's end time for this account.
   * Incremental-sync cursor: imports only fetch games newer than this.
   * Null until the first successful import.
   */
  newestGameTimestamp: number | null;
  /**
   * Epoch ms lower bound of the contiguous range previous imports have
   * covered. The incremental cursor is only applied when a requested date
   * range is already covered down to its start — otherwise the full range is
   * fetched so a wider range can never be hidden by the cursor.
   * Null until the first successful import.
   */
  oldestGameTimestamp: number | null;
  /**
   * Rated/speed filter combination the coverage cursors were recorded under
   * (adapters derive the key from the import filters). The cursor is only
   * applied when the current filters match, so loosening a filter triggers a
   * full-range refetch instead of hiding games behind the cursor.
   * Null until the first successful import.
   */
  syncFilterKey: string | null;
}

export function accountId(platform: AccountPlatform, username: string): string {
  return `${platform}:${username.trim().toLowerCase()}`;
}

/**
 * Maps legacy `category` to a default `section` for accounts that have never
 * had a placement set. `opponent` -> research; `mine`/`study`/anything else
 * -> study. Mirrored (intentionally duplicated, not imported) by the IDB
 * upgrade backfill in `src/idb/index.ts` to keep the storage layer free of a
 * runtime dependency back on this module.
 */
function categoryToSection(category: AccountCategory): AccountSection {
  return category === 'opponent' ? 'research' : 'study';
}

/**
 * Resolves the section an account's card should render in. `section` is
 * authoritative once set; legacy records without it fall back to mapping
 * `category`, so this always returns a defined section.
 */
export function accountSection(account: Pick<ChessAccount, 'section' | 'category'>): AccountSection {
  if (account.section === 'research' || account.section === 'study' || account.section === 'archive') {
    return account.section;
  }
  return categoryToSection(account.category);
}

function timestamp(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function profileTimestamp(account: ChessAccount): number {
  return Math.max(timestamp(account.profileUpdatedAt), timestamp(account.addedAt));
}

function cursorTimestamp(account: ChessAccount): number {
  return Math.max(
    timestamp(account.syncCursorUpdatedAt),
    timestamp(account.lastSyncedAt),
    timestamp(account.newestGameTimestamp),
    timestamp(account.oldestGameTimestamp),
  );
}

function cursorPatchChanged(
  existing: ChessAccount,
  patch: Partial<Omit<ChessAccount, 'id' | 'platform' | 'username' | 'addedAt'>>,
): boolean {
  return ('lastSyncedAt' in patch && patch.lastSyncedAt !== existing.lastSyncedAt)
    || ('newestGameTimestamp' in patch && patch.newestGameTimestamp !== existing.newestGameTimestamp)
    || ('oldestGameTimestamp' in patch && patch.oldestGameTimestamp !== existing.oldestGameTimestamp)
    || ('syncFilterKey' in patch && patch.syncFilterKey !== existing.syncFilterKey);
}

function tagsPatchChanged(existing: readonly string[] | undefined, incoming: readonly string[] | undefined): boolean {
  const a = (existing ?? []).slice().sort();
  const b = (incoming ?? []).slice().sort();
  return a.length !== b.length || a.some((tag, i) => tag !== b[i]);
}







export function accountProfilePatchChanged(
  existing: ChessAccount,
  patch: Partial<Omit<ChessAccount, 'id' | 'platform' | 'username' | 'addedAt'>>,
): boolean {
  return ('displayName' in patch && patch.displayName !== existing.displayName)
    || ('category' in patch && patch.category !== existing.category)
    || ('section' in patch && patch.section !== existing.section)
    || ('order' in patch && patch.order !== existing.order)
    || ('tags' in patch && tagsPatchChanged(existing.tags, patch.tags));
}

/**
 * Pure merge logic for `registerAccount()`. First-time registration (no
 * `existing` record) sets `category` from the import input. On
 * re-registration of an existing account, the user-set `category` is
 * preserved — only `updateAccount()` (e.g. the Opponents page category
 * selector) may change it. This keeps a manual classification from being
 * silently reset by a later import/sync re-registration. Kept IDB-free so it
 * can be unit-tested directly.
 */
export function mergeRegisteredAccount(
  existing: ChessAccount | undefined,
  id: string,
  platform: AccountPlatform,
  category: AccountCategory,
  displayName: string,
  now: number,
): ChessAccount {
  if (existing) {
    return {
      ...existing,
      displayName,
      // order/tags may be absent on a record that bypassed the IDB upgrade
      // backfill (e.g. direct unit-test construction); default them here too
      // so re-registration never regresses a previously-backfilled record.
      order: existing.order ?? existing.addedAt,
      tags: existing.tags ?? [],
      profileUpdatedAt: existing.displayName !== displayName
        ? now
        : profileTimestamp(existing),
      syncCursorUpdatedAt: cursorTimestamp(existing),
    };
  }
  return {
    id,
    platform,
    username: displayName.toLowerCase(),
    displayName,
    category,
    order: now,
    tags: [],
    profileUpdatedAt: now,
    addedAt: now,
    lastSyncedAt: null,
    syncCursorUpdatedAt: now,
    newestGameTimestamp: null,
    oldestGameTimestamp: null,
    syncFilterKey: null,
  };
}

/**
 * Create an account, or refresh the display name of an existing one.
 * Preserves `addedAt` and sync cursors on re-registration. See
 * `mergeRegisteredAccount()` for the category-preservation rule.
 */
export async function registerAccount(
  platform: AccountPlatform,
  username: string,
  category: AccountCategory,
): Promise<ChessAccount> {
  const id = accountId(platform, username);
  const existing = await getAccountFromIdb(id);
  const now = Date.now();
  const displayName = username.trim();
  const account = mergeRegisteredAccount(existing, id, platform, category, displayName, now);
  await saveAccountToIdb(account);
  return account;
}

export async function getAccount(id: string): Promise<ChessAccount | undefined> {
  return getAccountFromIdb(id);
}

export async function listAccounts(): Promise<ChessAccount[]> {
  return listAccountsFromIdb();
}

/**
 * Record a successful import for an account: stamps `lastSyncedAt`, raises
 * `newestGameTimestamp` monotonically, and lowers `oldestGameTimestamp`
 * monotonically. Null inputs leave the respective cursor unchanged.
 * No-op when the account does not exist.
 */
export async function recordAccountSync(
  id: string,
  newestGameTimestamp: number | null,
  oldestGameTimestamp: number | null,
  syncFilterKey: string | null = null,
): Promise<void> {
  const existing = await getAccountFromIdb(id);
  if (!existing) return;
  const now = Date.now();
  const updated: ChessAccount = {
    ...existing,
    lastSyncedAt: now,
    profileUpdatedAt: profileTimestamp(existing),
    syncCursorUpdatedAt: now,
    newestGameTimestamp: newestGameTimestamp === null
      ? existing.newestGameTimestamp
      : Math.max(existing.newestGameTimestamp ?? 0, newestGameTimestamp),
    oldestGameTimestamp: oldestGameTimestamp === null
      ? existing.oldestGameTimestamp
      : Math.min(existing.oldestGameTimestamp ?? Number.MAX_SAFE_INTEGER, oldestGameTimestamp),
    syncFilterKey: syncFilterKey ?? existing.syncFilterKey,
  };
  await saveAccountToIdb(updated);
}

/**
 * Patch mutable fields of an existing account (category, displayName, sync
 * cursors). Identity fields are not patchable. Returns the updated account,
 * or undefined if no account exists for that id.
 */
export async function updateAccount(
  id: string,
  patch: Partial<Omit<ChessAccount, 'id' | 'platform' | 'username' | 'addedAt'>>,
): Promise<ChessAccount | undefined> {
  const existing = await getAccountFromIdb(id);
  if (!existing) return undefined;
  const now = Date.now();
  const profileChanged = accountProfilePatchChanged(existing, patch);
  const updated: ChessAccount = {
    ...existing,
    ...patch,
    profileUpdatedAt: profileChanged ? now : profileTimestamp(existing),
    syncCursorUpdatedAt: cursorPatchChanged(existing, patch) ? now : cursorTimestamp(existing),
  };
  await saveAccountToIdb(updated);
  return updated;
}
