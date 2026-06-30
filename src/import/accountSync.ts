import type { ChessAccount } from '../accounts';
import { recordAccountSync, updateAccount } from '../accounts';
import { loadGamesFromIdb, saveGamesToIdb } from '../idb';
import { chesscomGameTimestamp, fetchChesscomGames, fetchChesscomLifetimeBest } from './chesscom';
import {
  archiveCutoffMonthFor,
  filterGamesByDateRange,
  importRangeStartMsFor,
  importSyncFilterKey,
  type ImportDateRangeConfig,
  type ImportSpeed,
} from './filters';
import { fetchLichessGames, lichessGameTimestamp } from './lichess';
import type { ImportedGame } from './types';

const SYNC_OVERLAP_MS = 86_400_000;
const LICHESS_MAX_GAMES = 300;

export type AccountSyncMode = 'cursor' | 'wider-safety-fetch' | 'fallback-range' | 'missing-cursor';

export interface AccountSyncOptions {
  rated: boolean;
  speeds: ReadonlySet<ImportSpeed>;
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

function hasPlatformGameId(game: ImportedGame): boolean {
  return game.id.startsWith('chesscom:') || game.id.startsWith('lichess:');
}

function gameCompositeKey(game: ImportedGame): string {
  return [
    game.source ?? '',
    (game.white ?? '').toLowerCase(),
    (game.black ?? '').toLowerCase(),
    game.date ?? '',
    game.result ?? '',
  ].join('|');
}

function dedupeIncoming(existing: ImportedGame[], incoming: ImportedGame[]): ImportedGame[] {
  const seenIds = new Set(existing.map(g => g.id));
  const seenCompositeKeys = new Set(existing.filter(g => !hasPlatformGameId(g)).map(gameCompositeKey));
  const importedAt = Date.now();
  const result: ImportedGame[] = [];
  for (const game of incoming) {
    if (seenIds.has(game.id)) continue;
    if (!hasPlatformGameId(game)) {
      const key = gameCompositeKey(game);
      if (seenCompositeKeys.has(key)) continue;
      seenCompositeKeys.add(key);
    }
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

async function loadExistingGames(): Promise<ImportedGame[]> {
  return (await loadGamesFromIdb())?.games ?? [];
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

export async function syncAccountGames(account: ChessAccount, options: AccountSyncOptions): Promise<AccountSyncResult> {
  const cursor = account.newestGameTimestamp;
  const filterKey = importSyncFilterKey(options.rated, options.speeds);
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

  const existing = await loadExistingGames();
  const newGames = dedupeIncoming(existing, fetched);
  if (newGames.length > 0) {
    await saveGamesToIdb([...existing, ...newGames]);
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
  await syncChesscomLifetimeBest(account);

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
}

/**
 * Fetch games OLDER than the account's earliest imported game and merge them
 * into the same account. Uses account.oldestGameTimestamp as the exclusive
 * upper bound for the backward fetch. Dedupes via dedupeIncoming and lowers
 * the account's oldest cursor via recordAccountSync.
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

  const fetched: ImportedGame[] = [];
  let progressOffset = 0;
  const onBatchProgress = (count: number): void => {
    options.onProgress?.(progressOffset + count);
  };
  if (account.platform === 'lichess') {
    // Fetch games whose start time is strictly before the oldest-imported game.
    // The Lichess API returns games newest-first up to max=300; passing `until`
    // bounds the window so we get the 300 games immediately preceding the cursor.
    let batchUntil = oldest - 1;
    while (true) {
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

  const existing = await loadExistingGames();
  const newGames = dedupeIncoming(existing, fetched);
  if (newGames.length > 0) {
    await saveGamesToIdb([...existing, ...newGames]);
  }

  // Lower the oldest cursor based on what the API returned:
  // - Games received: cursor moves to the oldest game in this batch (may go further back next call)
  // - No games received: we've reached the beginning of history; record as 0
  const newOldest = minTimestamp(account, fetched);
  const oldestToRecord = hasTargetDate && reachedTargetDate
    ? Math.min(newOldest ?? targetDateStartMs, targetDateStartMs)
    : newOldest ?? 0;

  // Pass null for newestGameTimestamp and syncFilterKey — do not change the
  // forward cursor or filter key, only lower the oldest cursor.
  await recordAccountSync(account.id, null, oldestToRecord, null);

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
  };
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
  fetchedCount: number;
  cursorTimestamp: number | null;
  usedCursor: boolean;
}







export async function peekAccountSync(account: ChessAccount, options: AccountPeekOptions): Promise<AccountPeekResult> {
  const cursor = account.newestGameTimestamp;
  const base: AccountPeekResult = {
    accountId: account.id,
    supported: false,
    newGameCount: 0,
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

  // Count only: dedupe against existing games but never persist.
  const existing = await loadExistingGames();
  const newGames = dedupeIncoming(existing, fetched);
  return {
    accountId: account.id,
    supported: true,
    newGameCount: newGames.length,
    fetchedCount: fetched.length,
    cursorTimestamp: cursor,
    usedCursor: true,
  };
}
