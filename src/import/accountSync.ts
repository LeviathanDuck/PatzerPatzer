import type { ChessAccount } from '../accounts';
import { recordAccountSync } from '../accounts';
import { loadGamesFromIdb, saveGamesToIdb } from '../idb';
import { chesscomGameTimestamp, fetchChesscomGames } from './chesscom';
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
