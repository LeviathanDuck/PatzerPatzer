import type { ChessAccount } from '../accounts';
import { getAccount, recordAccountSync, updateAccount } from '../accounts';
import { getExistingGameKeys, reduceGamesByAccountFromIdb, saveGamesDeltaToIdb } from '../idb';
import { chesscomGameTimestamp, fetchChesscomGames, fetchChesscomLifetimeBest } from './chesscom';
import { fetchChesscomImportedAccountStats } from './profiles';
import {
  archiveCutoffMonthFor,
  filterGamesByDateRange,
  importRangeStartMsFor,
  importSyncFilterKey,
  currentImportDateRangeConfig,
  type ImportDateRangeConfig,
  type ImportSpeed,
} from './filters';
import { fetchLichessGames, lichessGameTimestamp } from './lichess';
import type { ImportedGame } from './types';
import { accountRepertoireSourceId } from '../repertoire';
import { invalidateAccountRepertoireBuilds } from '../repertoire/accountSource';

const SYNC_OVERLAP_MS = 86_400_000;
const LICHESS_MAX_GAMES = 300;

export type AccountSyncMode = 'cursor' | 'wider-safety-fetch' | 'fallback-range' | 'missing-cursor';

export interface AccountSyncOptions {
  rated: boolean;
  speeds: ReadonlySet<ImportSpeed>;
  /**
   * Captures the date-range filter to record with the sync cursor key.
   * If omitted, the live import filter config is used.
   */
  syncDateRange?: ImportDateRangeConfig;
  /**
   * Required when the caller wants to run without a safe cursor, either
   * because the account has no cursor yet or because filters changed.
   */
  fallbackDateRange?: ImportDateRangeConfig;
  onProgress?: (count: number) => void;
}

export interface AccountSyncResult {
  accountId: string;
  mode: AccountSyncMode;
  fetchedGames: ImportedGame[];
  newGames: ImportedGame[];
  duplicateCount: number;
  fetchedCount: number;
  addedCount: number;
  usedCursor: boolean;
  needsFallbackRange: boolean;
  cursorTimestamp: number | null;
  widerSafetyFetch: boolean;
}

function emptyResult(account: ChessAccount, mode: AccountSyncMode): AccountSyncResult {
  return {
    accountId: account.id,
    mode,
    fetchedGames: [],
    newGames: [],
    duplicateCount: 0,
    fetchedCount: 0,
    addedCount: 0,
    usedCursor: false,
    needsFallbackRange: true,
    cursorTimestamp: account.newestGameTimestamp,
    widerSafetyFetch: false,
  };
}

/**
 * Dedupe account-sync fetched games against the ids already in the `games` store, using a bounded
 * incoming-id membership set (from getExistingGameKeys — only the incoming ids are probed, never a
 * whole-library load; Lane D R2 / D1b, BUG-2026-07-01-002). Drops any incoming game whose id already
 * exists, collapses duplicate ids within the batch, and stamps `importedAt` (Date.now()) on each
 * genuinely-new game — matching the stamp the prior full-library dedupe applied.
 *
 * Account-sync fetched games always carry a platform id (`chesscom:`/`lichess:`), so the id set is
 * the complete dedup key here. The prior dedupe's composite-key fallback (white/black/date/result)
 * existed only for NON-platform PGN-paste rows, which account sync never produces; preserving it
 * would require the whole-library load this slice exists to eliminate.
 */
function dedupeIncomingAgainstExisting(
  existingIds: ReadonlySet<string>,
  incoming: ImportedGame[],
): ImportedGame[] {
  const seenIds = new Set(existingIds);
  const importedAt = Date.now();
  const result: ImportedGame[] = [];
  for (const game of incoming) {
    if (seenIds.has(game.id)) continue;
    seenIds.add(game.id);
    result.push({ ...game, importedAt });
  }
  return result;
}

function gameTimestamp(account: ChessAccount, game: ImportedGame): number | undefined {
  return account.platform === 'chesscom'
    ? chesscomGameTimestamp(game.pgn)
    : lichessGameTimestamp(game.pgn);
}

function maxTimestamp(account: ChessAccount, games: ImportedGame[]): number | null {
  const timestamps = games
    .map(g => gameTimestamp(account, g))
    .filter((timestamp): timestamp is number => timestamp !== undefined);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function minTimestamp(account: ChessAccount, games: ImportedGame[]): number | null {
  const timestamps = games
    .map(g => gameTimestamp(account, g))
    .filter((timestamp): timestamp is number => timestamp !== undefined);
  return timestamps.length > 0 ? Math.min(...timestamps) : null;
}
















async function recordSyncFilterMemory(
  account: ChessAccount,
  rated: boolean,
  speeds: ReadonlySet<ImportSpeed>,
): Promise<void> {
  try {
    await updateAccount(account.id, {
      lastSyncSpeeds: [...speeds].sort(),
      lastSyncRated: rated,
    });
  } catch {
    // Swallow: filter memory is a UI preference, not sync state.
  }
}

async function syncChesscomLifetimeBest(account: ChessAccount): Promise<void> {
  if (account.platform !== 'chesscom') return;
  try {
    const fetched = await fetchChesscomLifetimeBest(account.displayName);
    if (!fetched) return;
    const merged = { ...(account.lifetimeBest ?? {}), ...fetched };
    await updateAccount(account.id, { lifetimeBest: merged });
  } catch {
    // Swallow: a failed lifetime-stats fetch must never break account sync.
  }
}

/**
 * Best-effort refresh of a chess.com account's cached per-speed current/best
 * ratings and W/L/D record (spec item 16 — imported accounts ONLY, never
 * opponents; this only ever runs for the account being synced here, which is
 * always an imported account by construction of this call site). Same
 * failure/merge contract as syncChesscomLifetimeBest: swallows errors, a
 * fetch returning nothing leaves the prior cached value untouched, and
 * existing per-speed entries are merged (not replaced wholesale) so a
 * response missing a speed never erases a previously cached one. No-op for
 * lichess: fetchChesscomImportedAccountStats is a chess.com-only endpoint.
 */
async function syncChesscomImportedAccountStats(account: ChessAccount): Promise<void> {
  if (account.platform !== 'chesscom') return;
  try {
    const fetched = await fetchChesscomImportedAccountStats(account.displayName);
    if (!fetched) return;
    const merged = { ...(account.speedStats ?? {}), ...fetched };
    await updateAccount(account.id, { speedStats: merged });
  } catch {
    // Swallow: a failed account-stats fetch must never break account sync.
  }
}

export async function syncAccountGames(account: ChessAccount, options: AccountSyncOptions): Promise<AccountSyncResult> {
  const cursor = account.newestGameTimestamp;
  const syncFilter = options.syncDateRange ?? options.fallbackDateRange ?? currentImportDateRangeConfig();
  const filterKey = importSyncFilterKey(options.rated, options.speeds, syncFilter);
  const filterMatches = account.syncFilterKey === filterKey;

  if (cursor === null && options.fallbackDateRange === undefined) {
    return emptyResult(account, 'missing-cursor');
  }
  if (cursor !== null && !filterMatches && options.fallbackDateRange === undefined) {
    return {
      ...emptyResult(account, 'wider-safety-fetch'),
      widerSafetyFetch: true,
    };
  }

  const useCursor = cursor !== null && filterMatches;
  const widerSafetyFetch = cursor !== null && !filterMatches;
  const fallbackDateRange = useCursor ? undefined : options.fallbackDateRange;
  const rangeStart = fallbackDateRange ? importRangeStartMsFor(fallbackDateRange) : null;
  const speedSet = new Set(options.speeds);

  let fetched: ImportedGame[];
  if (account.platform === 'lichess') {
    const since = useCursor ? Math.max(0, cursor - SYNC_OVERLAP_MS) : rangeStart ?? undefined;
    fetched = await fetchLichessGames(account.displayName, options.rated, speedSet, options.onProgress, since);
    if (fallbackDateRange) fetched = filterGamesByDateRange(fetched, fallbackDateRange);
  } else if (account.platform === 'chesscom') {
    const sinceMonth = useCursor ? new Date(cursor).toISOString().slice(0, 7) : undefined;
    const cutoffMonth = fallbackDateRange ? archiveCutoffMonthFor(fallbackDateRange) : null;
    fetched = await fetchChesscomGames(
      account.displayName,
      options.rated,
      speedSet,
      options.onProgress,
      sinceMonth,
      cutoffMonth,
    );
    if (fallbackDateRange) fetched = filterGamesByDateRange(fetched, fallbackDateRange);
  } else {
    throw new Error(`Unsupported account platform: ${account.platform}`);
  }

  // Delta-only persistence (Lane D R2 / D1b, BUG-2026-07-01-002): membership-check ONLY the incoming
  // ids (bounded — never the whole library), then write & enqueue ONLY the genuinely-new rows.
  const existingIds = await getExistingGameKeys(fetched.map(g => g.id));
  const newGames = dedupeIncomingAgainstExisting(existingIds, fetched);
  if (newGames.length > 0) {




    await saveGamesDeltaToIdb(newGames);
    invalidateAccountRepertoireBuilds(accountRepertoireSourceId(account.id));
  }

  const newest = maxTimestamp(account, fetched);
  let oldest: number | null = null;
  if (!useCursor) {
    if (account.platform === 'lichess' && fetched.length >= LICHESS_MAX_GAMES) {
      oldest = minTimestamp(account, fetched);
    } else {
      oldest = rangeStart ?? 0;
    }
  }
  await recordAccountSync(account.id, newest, oldest, filterKey);
  await recordSyncFilterMemory(account, options.rated, options.speeds);
  await syncChesscomLifetimeBest(account);
  await syncChesscomImportedAccountStats(account);

  return {
    accountId: account.id,
    mode: useCursor ? 'cursor' : widerSafetyFetch ? 'wider-safety-fetch' : 'fallback-range',
    fetchedGames: fetched,
    newGames,
    duplicateCount: Math.max(0, fetched.length - newGames.length),
    fetchedCount: fetched.length,
    addedCount: newGames.length,
    usedCursor: useCursor,
    needsFallbackRange: false,
    cursorTimestamp: cursor,
    widerSafetyFetch,
  };
}

export interface AccountSyncOlderOptions {
  rated: boolean;
  speeds: ReadonlySet<ImportSpeed>;
  /** Optional epoch-ms start of the target day to fetch back to. */
  targetDateStartMs?: number;
  onProgress?: (count: number) => void;






  signal?: AbortSignal;
}

export interface AccountSyncOlderResult {
  accountId: string;
  /** False when the account has no oldest cursor to go back from. */
  hadCursor: boolean;
  /** True when the oldest cursor was already 0 (full history already covered). */
  alreadyAtStart: boolean;
  fetchedCount: number;
  addedCount: number;
  newGames: ImportedGame[];
  duplicateCount: number;
  /** Epoch ms of the oldest game in the fetched batch, or null when no games returned. */
  newOldestTimestamp: number | null;
  /** True when a target-date request covered the requested lower bound. */
  reachedTargetDate: boolean;

  aborted: boolean;
}

/**
 * Fetch games OLDER than the account's earliest imported game and merge them
 * into the same account. Uses account.oldestGameTimestamp as the exclusive
 * upper bound for the backward fetch. Dedupes incoming ids against the stored
 * games (bounded) and lowers the account's oldest cursor via recordAccountSync.
 *
 * Does NOT touch the forward sync cursor (newestGameTimestamp).
 */
export async function syncAccountGamesOlder(
  account: ChessAccount,
  options: AccountSyncOlderOptions,
): Promise<AccountSyncOlderResult> {
  const oldest = account.oldestGameTimestamp;

  const noOpResult = (hadCursor: boolean, alreadyAtStart: boolean): AccountSyncOlderResult => ({
    accountId: account.id,
    hadCursor,
    alreadyAtStart,
    fetchedCount: 0,
    addedCount: 0,
    newGames: [],
    duplicateCount: 0,
    newOldestTimestamp: oldest,
    reachedTargetDate: false,
    aborted: options.signal?.aborted ?? false,
  });

  // No oldest cursor means we have no boundary to go back from — must run
  // a forward sync first to establish the cursor.
  if (oldest === null) return noOpResult(false, false);

  // oldest === 0 means coverage already extends to the beginning; nothing to fetch.
  if (oldest <= 0) return noOpResult(true, true);

  const speedSet = new Set(options.speeds);
  const targetDateStartMs = options.targetDateStartMs !== undefined
    ? Math.max(0, options.targetDateStartMs)
    : null;
  const hasTargetDate = targetDateStartMs !== null && targetDateStartMs < oldest;
  let reachedTargetDate = false;
  let aborted = false;

  const fetched: ImportedGame[] = [];
  let progressOffset = 0;
  const onBatchProgress = (count: number): void => {
    options.onProgress?.(progressOffset + count);
  };
  if (options.signal?.aborted) return noOpResult(true, false);
  if (account.platform === 'lichess') {
    // Fetch games whose start time is strictly before the oldest-imported game.
    // The Lichess API returns games newest-first up to max=300; passing `until`
    // bounds the window so we get the 300 games immediately preceding the cursor.
    let batchUntil = oldest - 1;
    while (true) {


      if (options.signal?.aborted) { aborted = true; break; }
      const batch = await fetchLichessGames(
        account.displayName,
        options.rated,
        speedSet,
        onBatchProgress,
        hasTargetDate ? targetDateStartMs : undefined,
        batchUntil,
      );
      fetched.push(...batch);
      progressOffset = fetched.length;
      const batchOldest = minTimestamp(account, batch);
      if (!hasTargetDate || batch.length < LICHESS_MAX_GAMES || batchOldest === null) {
        reachedTargetDate = hasTargetDate;
        break;
      }
      if (batchOldest <= targetDateStartMs) {
        reachedTargetDate = true;
        break;
      }
      const nextUntil = batchOldest - 1;
      if (nextUntil >= batchUntil) break;
      batchUntil = nextUntil;
    }
  } else if (account.platform === 'chesscom') {
    // For Chess.com, beforeMonth is an exclusive upper bound on archive months.
    // Fetches all archive months strictly before the month of the oldest cursor.
    const beforeMonth = new Date(oldest).toISOString().slice(0, 7);
    const cutoffMonth = hasTargetDate ? new Date(targetDateStartMs).toISOString().slice(0, 7) : null;
    fetched.push(...await fetchChesscomGames(
      account.displayName,
      options.rated,
      speedSet,
      onBatchProgress,
      undefined,       // no sinceMonth: no lower bound (fetch all older months)
      cutoffMonth,     // target month lower bound, or no lower bound for one-batch older fetch
      beforeMonth,     // exclusive upper bound on archive months
    ));
    progressOffset = fetched.length;
    reachedTargetDate = hasTargetDate;
  } else {
    throw new Error(`Unsupported account platform: ${account.platform}`);
  }

  // Delta-only persistence (Lane D R2 / D1b): see syncAccountGames. On a cooperative abort, `fetched`
  // holds only the batches actually pulled, so only committed coverage is persisted here and recorded
  // below. saveGamesDeltaToIdb REJECTS on storage failure, so the cursor is never lowered over rows
  // that did not persist.
  const existingIds = await getExistingGameKeys(fetched.map(g => g.id));
  const newGames = dedupeIncomingAgainstExisting(existingIds, fetched);
  if (newGames.length > 0) {
    await saveGamesDeltaToIdb(newGames);
    invalidateAccountRepertoireBuilds(accountRepertoireSourceId(account.id));
  }






  const newOldest = minTimestamp(account, fetched);
  const oldestToRecord = aborted
    ? newOldest
    : hasTargetDate && reachedTargetDate
    ? Math.min(newOldest ?? targetDateStartMs, targetDateStartMs)
    : newOldest ?? 0;

  // Pass null for newestGameTimestamp and syncFilterKey — do not change the
  // forward cursor or filter key, only lower the oldest cursor.
  if (oldestToRecord !== null) {
    await recordAccountSync(account.id, null, oldestToRecord, null);
  }

  return {
    accountId: account.id,
    hadCursor: true,
    alreadyAtStart: false,
    fetchedCount: fetched.length,
    addedCount: newGames.length,
    newGames,
    duplicateCount: Math.max(0, fetched.length - newGames.length),
    newOldestTimestamp: newOldest,
    reachedTargetDate,
    aborted,
  };
}

export interface AccountSyncBackfillOptions extends AccountSyncOptions {
  /**
   * Epoch-ms lower bound of the coverage the caller wants after this sync;
   * 0 means full history. Omit to skip the backward phase entirely (plain
   * forward sync).
   */
  backfillTargetStartMs?: number;





  signal?: AbortSignal;
}

export interface AccountSyncWithBackfillResult {
  forward: AccountSyncResult;
  /** Null when no backward phase ran (no target, or coverage already reached it). */
  older: AccountSyncOlderResult | null;
  fetchedCount: number;
  addedCount: number;
  newGames: ImportedGame[];

  aborted: boolean;
}









export async function syncAccountGamesWithBackfill(
  account: ChessAccount,
  options: AccountSyncBackfillOptions,
): Promise<AccountSyncWithBackfillResult> {
  const { backfillTargetStartMs, onProgress, signal, ...forwardOptions } = options;
  const forward = await syncAccountGames(account, {
    ...forwardOptions,
    ...(onProgress ? { onProgress } : {}),
  });

  const result = (older: AccountSyncOlderResult | null): AccountSyncWithBackfillResult => ({
    forward,
    older,
    fetchedCount: forward.fetchedCount + (older?.fetchedCount ?? 0),
    addedCount: forward.addedCount + (older?.addedCount ?? 0),
    newGames: older ? [...forward.newGames, ...older.newGames] : forward.newGames,
    aborted: older?.aborted ?? (signal?.aborted ?? false),
  });

  if (backfillTargetStartMs === undefined || signal?.aborted) return result(null);
  const target = Math.max(0, backfillTargetStartMs);

  // The forward phase updated the cursors on disk; the in-memory account is stale.
  let refreshed = await getAccount(account.id) ?? account;

  // Accounts imported before the oldest-cursor bookkeeping existed have games
  // but no backward boundary. Derive it from the already-imported games so the
  // backfill has a cursor to page back from.
  if (refreshed.oldestGameTimestamp === null) {





    const derivedOldest = await reduceGamesByAccountFromIdb<number | null>(
      account.id,
      (oldestSoFar, record) => {
        const ts = gameTimestamp(refreshed, { id: record.id, pgn: record.pgn });
        if (ts === undefined) return oldestSoFar;
        return oldestSoFar === null ? ts : Math.min(oldestSoFar, ts);
      },
      null,
    );
    if (derivedOldest !== null) {
      await recordAccountSync(account.id, null, derivedOldest, null);
      refreshed = await getAccount(account.id) ?? refreshed;
    }
  }

  const oldest = refreshed.oldestGameTimestamp;
  if (oldest === null || oldest <= target) return result(null);

  // Continue the caller's progress stream across both phases.
  const forwardCount = forward.fetchedCount;
  const older = await syncAccountGamesOlder(refreshed, {
    rated: options.rated,
    speeds: options.speeds,
    targetDateStartMs: target,
    onProgress: count => onProgress?.(forwardCount + count),
    ...(signal ? { signal } : {}),
  });
  return result(older);
}

function peekAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export interface AccountPeekOptions {
  rated: boolean;
  speeds: ReadonlySet<ImportSpeed>;
  signal?: AbortSignal;
}

export interface AccountPeekResult {
  accountId: string;
  /** False when there is no cursor to do a cheap incremental peek. */
  supported: boolean;
  /** New (deduped) games available to sync for the requested speeds. */
  newGameCount: number;




  newGameCountBySpeed: Partial<Record<ImportSpeed, number>>;
  fetchedCount: number;
  cursorTimestamp: number | null;
  usedCursor: boolean;
}

const PEEK_SPEED_CLASSES: readonly ImportSpeed[] = ['bullet', 'blitz', 'rapid'];

function countBySpeed(games: readonly ImportedGame[]): Partial<Record<ImportSpeed, number>> {
  const counts: Partial<Record<ImportSpeed, number>> = {};
  for (const game of games) {
    const speed = PEEK_SPEED_CLASSES.find(s => s === game.timeClass);
    if (speed) counts[speed] = (counts[speed] ?? 0) + 1;
  }
  return counts;
}







export async function peekAccountSync(account: ChessAccount, options: AccountPeekOptions): Promise<AccountPeekResult> {
  const cursor = account.newestGameTimestamp;
  const base: AccountPeekResult = {
    accountId: account.id,
    supported: false,
    newGameCount: 0,
    newGameCountBySpeed: {},
    fetchedCount: 0,
    cursorTimestamp: cursor,
    usedCursor: false,
  };

  // A cheap incremental peek needs a baseline cursor; without one we would have
  // to fetch the whole history, which is too heavy for a silent background check.
  if (cursor === null) return base;
  if (options.signal?.aborted) throw peekAbortError();

  const speedSet = new Set(options.speeds);
  let fetched: ImportedGame[];
  if (account.platform === 'lichess') {
    const since = Math.max(0, cursor - SYNC_OVERLAP_MS);
    fetched = await fetchLichessGames(account.displayName, options.rated, speedSet, undefined, since);
  } else if (account.platform === 'chesscom') {
    const sinceMonth = new Date(cursor).toISOString().slice(0, 7);
    fetched = await fetchChesscomGames(account.displayName, options.rated, speedSet, undefined, sinceMonth, null);
  } else {
    return base;
  }
  if (options.signal?.aborted) throw peekAbortError();

  // Count only: dedupe incoming ids against the stored games (bounded incoming-id probe — never a
  // whole-library load; Lane D R2 / D1b) but never persist.
  const existingIds = await getExistingGameKeys(fetched.map(g => g.id));
  const newGames = dedupeIncomingAgainstExisting(existingIds, fetched);
  return {
    accountId: account.id,
    supported: true,
    newGameCount: newGames.length,
    newGameCountBySpeed: countBySpeed(newGames),
    fetchedCount: fetched.length,
    cursorTimestamp: cursor,
    usedCursor: true,
  };
}
