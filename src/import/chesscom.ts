


import {
  archiveCutoffMonthFor,
  currentImportDateRangeConfig,
  filterGamesByDate,
  importFilters,
  importSyncFilterKey,
  type ImportSpeed,
} from './filters';
import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating } from './types';
import { accountId, getAccount, recordAccountSync, registerAccount } from '../accounts';
import { pgnToTree } from '../tree/pgn';
import { classifyOpening } from '../openings/eco';
import { record, Severity } from '../diagnostics';

const CHESSCOM_BASE = 'https://api.chess.com/pub/player';

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function recordChesscomImportEvent(
  message: string,
  severity: Severity,
  metadata: Record<string, string | number | boolean | null>,
): void {
  record({
    kind: 'api',
    severity,
    source: 'import.chesscom',
    sourceTag: 'import',
    message,
    metadata: {
      platform: 'chess-com',
      ...metadata,
    },
    redactionClass: 'safe',
  });
}

async function fetchChesscomResponse(
  url: string,
  requestClass: string,
  failureMessage: string,
  options: { recordHttpErrors?: boolean } = {},
): Promise<Response> {
  const startedAt = Date.now();
  try {
    const res = await fetch(url);
    if (!res.ok && options.recordHttpErrors !== false) {
      recordChesscomImportEvent(failureMessage, Severity.Error, {
        requestClass,
        errorClass: 'http-error',
        httpStatus: res.status,
        latencyMs: Date.now() - startedAt,
      });
    }
    return res;
  } catch (error) {
    recordChesscomImportEvent(failureMessage, Severity.Error, {
      requestClass,
      errorClass: errorClass(error),
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}

function archiveMonthFromUrl(url: string): string | null {
  const parts = url.split('/');
  const year = parts[parts.length - 2];
  const month = parts[parts.length - 1];
  if (!year || !month || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) return null;
  return `${year}-${month.padStart(2, '0')}`;
}

/**
 * Return the earliest YYYY-MM string that should be fetched for the current date filter,
 * or null when the filter is 'all' (fetch every archive month available).
 * Mirrors the cutoff logic in filters.ts filterGamesByDate().
 */
export const chesscom = {
  username: 'LeviathanDuck',
  loading:  false,
  error:    null as string | null,
  /** Live count of games parsed so far during an active import. */
  gameCount: 0,
};

/**
 * Extract the numeric Chess.com game id from the API game object's url
 * (preferred) or the [Link] PGN header. Returns undefined when neither parses.
 */
function chesscomGameId(raw: { url?: string }, pgn: string): string | undefined {
  const url = raw.url ?? parsePgnHeader(pgn, 'Link');
  // Daily games are filtered out before this is called, so only live URLs occur.
  const match = url?.match(/\/game\/live\/(\d+)/);
  return match?.[1];
}

/**
 * Parse a game's UTC end timestamp (epoch ms) from PGN headers, preferring
 * EndDate + EndTime and falling back to UTCDate + UTCTime. Returns undefined
 * when neither pair parses.
 */
export function chesscomGameTimestamp(pgn: string): number | undefined {
  const date = parsePgnHeader(pgn, 'EndDate') ?? parsePgnHeader(pgn, 'UTCDate'); // YYYY.MM.DD
  const time = parsePgnHeader(pgn, 'EndTime') ?? parsePgnHeader(pgn, 'UTCTime'); // HH:MM:SS
  if (!date || !time) return undefined;
  const ts = Date.parse(`${date.replace(/\./g, '-')}T${time}Z`);
  return Number.isNaN(ts) ? undefined : ts;
}

function normalizeChesscomResult(whiteResult: string, blackResult: string): string {
  if (whiteResult === 'win') return '1-0';
  if (blackResult === 'win') return '0-1';
  return '1/2-1/2';
}

export async function fetchChesscomGames(
  username: string, rated: boolean, speeds: Set<ImportSpeed>,
  onProgress?: (count: number) => void,
  sinceMonth?: string, // YYYY-MM sync cursor; only fetch this month and newer
  cutoffMonth: string | null = archiveCutoffMonthFor(currentImportDateRangeConfig()),
  beforeMonth?: string, // YYYY-MM exclusive upper bound; only fetch months strictly before this
): Promise<ImportedGame[]> {
  // 1. Fetch archive list (one URL per month the player has games)
  const archivesRes = await fetchChesscomResponse(
    `${CHESSCOM_BASE}/${username.toLowerCase()}/games/archives`,
    'archive-list',
    'Chess.com archive list fetch failed',
  );
  if (!archivesRes.ok) {
    throw new Error(archivesRes.status === 404 ? 'Chess.com: user not found' : `Chess.com API error ${archivesRes.status}`);
  }
  let archivesData: { archives?: string[] };
  try {
    archivesData = await archivesRes.json() as { archives?: string[] };
  } catch (error) {
    recordChesscomImportEvent('chesscom-parse-failed', Severity.Error, {
      requestClass: 'archive-list',
      errorClass: errorClass(error),
      batchGameCount: 0,
    });
    throw error;
  }
  const archives = archivesData.archives ?? [];
  if (archives.length === 0) {
    recordChesscomImportEvent('chesscom-import-empty', Severity.Info, {
      requestClass: 'archive-list',
      reason: 'no-archives',
    });
    return [];
  }

  // 2. Select archive months that fall within the current date-filter window.
  // Archive URLs end with /YYYY/MM — extract the month string and compare to cutoff.
  // Mirrors the cutoff logic in filters.ts filterGamesByDate(), applied to archive-month granularity.
  // Combine the date-filter cutoff with the incremental-sync cursor month:
  // fetch only months >= the later of the two. The cursor month itself is
  // refetched (a month is only partially imported mid-month); ID dedupe
  // absorbs the overlap.
  const effectiveCutoff = [cutoffMonth, sinceMonth ?? null]
    .filter((m): m is string => m !== null)
    .sort()
    .pop() ?? null;
  const archiveEntries = archives.map(url => ({
    url,
    archiveMonth: archiveMonthFromUrl(url),
  }));
  const relevantArchives = (effectiveCutoff === null && beforeMonth === undefined)
    ? archiveEntries
    : archiveEntries.filter(entry => {
        const { archiveMonth } = entry;
        if (archiveMonth === null) return false;
        if (effectiveCutoff !== null && archiveMonth < effectiveCutoff) return false;
        if (beforeMonth !== undefined && archiveMonth >= beforeMonth) return false;
        return true;
      });
  if (relevantArchives.length === 0) {
    recordChesscomImportEvent('chesscom-import-empty', Severity.Info, {
      requestClass: 'monthly-archive',
      reason: 'no-relevant-archives',
    });
    return [];
  }

  // 3. Fetch all relevant archive months in parallel.
  const archiveResponses = await Promise.all(relevantArchives.map(entry =>
    fetchChesscomResponse(
      entry.url,
      'monthly-archive',
      'Chess.com archive month fetch failed',
      { recordHttpErrors: false },
    ).then(res => ({ entry, res })),
  ));
  const rawGames: any[] = [];
  for (const { entry, res } of archiveResponses) {
    if (!res.ok) {
      if (res.status === 404) {
        recordChesscomImportEvent('chesscom-monthly-archive-skipped', Severity.Warn, {
          requestClass: 'monthly-archive',
          reason: 'monthly-archive-404',
          archiveMonth: entry.archiveMonth,
          httpStatus: res.status,
          skippedMonthly404: true,
        });
        continue;
      }
      recordChesscomImportEvent('Chess.com archive month fetch failed', Severity.Error, {
        requestClass: 'monthly-archive',
        archiveMonth: entry.archiveMonth,
        errorClass: 'http-error',
        httpStatus: res.status,
        latencyMs: null,
      });
      throw new Error(`Chess.com API error ${res.status}`);
    }
    let data: { games?: any[] };
    try {
      data = await res.json() as { games?: any[] };
    } catch (error) {
      recordChesscomImportEvent('chesscom-parse-failed', Severity.Error, {
        requestClass: 'monthly-archive',
        errorClass: errorClass(error),
        batchGameCount: rawGames.length,
      });
      throw error;
    }
    rawGames.push(...(data.games ?? []));
  }

  // 3. Normalize: standard, no daily, apply filters — newest first
  const result: ImportedGame[] = [];
  for (let i = rawGames.length - 1; i >= 0; i--) {
    const raw = rawGames[i];
    if (raw.rules !== 'chess' || raw.time_class === 'daily') continue;
    if (rated && !raw.rated) continue;
    if (speeds.size > 0 && !speeds.has(raw.time_class as ImportSpeed)) continue;
    const pgn: string = raw.pgn ?? '';
    if (!pgn) continue;
    try {
      pgnToTree(pgn); // validate — skip games that fail to parse
    } catch (error) {
      recordChesscomImportEvent('chesscom-parse-failed', Severity.Warn, {
        errorClass: errorClass(error),
        batchGameCount: rawGames.length,
      });
      continue;
    }
    const white = raw.white?.username;
    const black = raw.black?.username;
    const date = parsePgnHeader(pgn, 'Date')?.replace(/\./g, '-');
    const timeClass = raw.time_class as string | undefined;
    let opening = parsePgnHeader(pgn, 'Opening');
    let eco = parsePgnHeader(pgn, 'ECO');
    if (!opening || !eco) {
      const classified = classifyOpening(pgn);
      if (classified) {
        if (!opening) opening = classified.name;
        if (!eco) eco = classified.eco;
      }
    }
    const whiteRating = parseRating(raw.white?.rating) ?? parseRating(parsePgnHeader(pgn, 'WhiteElo'));
    const blackRating = parseRating(raw.black?.rating) ?? parseRating(parsePgnHeader(pgn, 'BlackElo'));
    // Canonical id: platform game id makes re-imports dedupe by construction.
    // Local-counter fallback keeps games importable when no game URL parses.
    const gameId = chesscomGameId(raw, pgn);
    result.push({
      id:               gameId ? `chesscom:${gameId}` : nextGameId(),
      pgn,
      result:           normalizeChesscomResult(raw.white?.result ?? '', raw.black?.result ?? ''),
      source:           'chesscom',
      importedUsername: username.toLowerCase(),
      accountId:        accountId('chesscom', username),
      ...(white ? { white } : {}),
      ...(black ? { black } : {}),
      ...(date ? { date } : {}),
      ...(timeClass ? { timeClass } : {}),
      ...(opening ? { opening } : {}),
      ...(eco ? { eco } : {}),
      ...(whiteRating !== undefined ? { whiteRating } : {}),
      ...(blackRating !== undefined ? { blackRating } : {}),
    });
    onProgress?.(result.length);
  }
  return result;
}

/** Speeds chess.com's /stats endpoint reports an all-time `best.rating` for. */
export type ChesscomLifetimeSpeed = 'rapid' | 'blitz' | 'classical' | 'daily';

const CHESSCOM_LIFETIME_STAT_KEYS: Record<string, ChesscomLifetimeSpeed> = {
  chess_rapid:     'rapid',
  chess_blitz:     'blitz',
  // chess.com has no classical time class today, but map it defensively in
  // case the API adds one — never fabricated, only read if present.
  chess_classical: 'classical',
  chess_daily:     'daily',
};

/**
 * Fetch the Chess.com player's all-time best rating per speed from the public
 * stats endpoint (a true lifetime peak, unlike Lichess's current-rating-only
 * API — see lichess.ts). Best-effort: returns null on any network, HTTP, or
 * parse failure so callers never overwrite a cached value with a fetch error.
 */
export async function fetchChesscomLifetimeBest(
  username: string,
): Promise<Partial<Record<ChesscomLifetimeSpeed, number>> | null> {
  let res: Response;
  try {
    res = await fetchChesscomResponse(
      `${CHESSCOM_BASE}/${username.toLowerCase()}/stats`,
      'lifetime-stats',
      'Chess.com lifetime stats fetch failed',
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: Record<string, { best?: { rating?: unknown } }>;
  try {
    data = await res.json() as Record<string, { best?: { rating?: unknown } }>;
  } catch {
    return null;
  }
  const lifetimeBest: Partial<Record<ChesscomLifetimeSpeed, number>> = {};
  for (const [statKey, speed] of Object.entries(CHESSCOM_LIFETIME_STAT_KEYS)) {
    const rating = data[statKey]?.best?.rating;
    if (typeof rating === 'number' && Number.isFinite(rating)) {
      lifetimeBest[speed] = rating;
    }
  }
  return Object.keys(lifetimeBest).length > 0 ? lifetimeBest : null;
}

export async function importChesscom(callbacks: ImportCallbacks): Promise<void> {
  const name = chesscom.username.trim();
  if (!name || chesscom.loading) return;

  const category = importFilters.importCategory;
  if (category === null) {
    chesscom.error = 'Choose a category (Mine / Opponent / Study) before importing.';
    callbacks.redraw();
    return;
  }
  chesscom.loading = true;
  chesscom.error = null;
  chesscom.gameCount = 0;
  callbacks.redraw();
  try {
    const acctId = accountId('chesscom', name);
    const account = await getAccount(acctId);
    const cursor = account?.newestGameTimestamp ?? null;
    const oldestCovered = account?.oldestGameTimestamp ?? null;
    const cutoffMonth = archiveCutoffMonthFor(currentImportDateRangeConfig());
    const parsedRangeStart = cutoffMonth !== null ? Date.parse(`${cutoffMonth}-01T00:00:00Z`) : NaN;
    const rangeStart = Number.isNaN(parsedRangeStart) ? null : parsedRangeStart;
    // Rated/speed filters shape which games are kept, so coverage recorded
    // under one filter combination must not suppress a broader fetch.
    const filterKey = importSyncFilterKey(importFilters.rated, importFilters.speeds);
    // Incremental sync: skip archive months older than the cursor, but only
    // when previous imports already cover the requested range down to its
    // start under the same filters. Otherwise fetch the full requested range
    // so a wider request can never be hidden behind the cursor.
    const useCursor = cursor !== null && oldestCovered !== null
      && rangeStart !== null && rangeStart >= oldestCovered - 86_400_000
      && account?.syncFilterKey === filterKey;
    const sinceMonth = useCursor ? new Date(cursor).toISOString().slice(0, 7) : undefined;
    const games = filterGamesByDate(await fetchChesscomGames(name, importFilters.rated, importFilters.speeds,
      (partial) => { chesscom.gameCount = partial; callbacks.redraw(); },
      sinceMonth,
    ));
    chesscom.gameCount = games.length;
    if (games.length === 0) {
      recordChesscomImportEvent('chesscom-import-empty', Severity.Info, {
        requestClass: 'monthly-archive',
        reason: 'no-games-after-filters',
        useCursor,
      });
    }
    // Register before adding games: a registry write failure surfaces through
    // the catch below and must prevent uncategorized games from being added.
    await registerAccount('chesscom', name, category);
    const timestamps = games.map(g => chesscomGameTimestamp(g.pgn)).filter((t): t is number => t !== undefined);
    const newest = timestamps.length > 0 ? Math.max(...timestamps) : null;
    // Archives are complete months, so an un-cursored fetch covers the whole
    // requested range ('all' covers the account's full history).
    const oldest = useCursor ? null : rangeStart ?? 0;
    await recordAccountSync(acctId, newest, oldest, filterKey);
    if (games.length === 0) {
      chesscom.error = 'No games found matching current filters.';
    } else {
      callbacks.addGames(games, games[0]!); // addGames calls loadGame which calls redraw
    }
  } catch (err) {
    chesscom.error = err instanceof Error ? err.message : 'Import failed.';
  } finally {
    chesscom.loading = false;
    callbacks.redraw();
  }
}
