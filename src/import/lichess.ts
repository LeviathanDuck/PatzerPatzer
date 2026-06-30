// Lichess username import adapter.
// Lichess public API: GET /api/games/user/{username}?max=N&rated=true
// Returns multi-game PGN text when Accept: application/x-chess-pgn is sent.
// Lichess uses UTCDate rather than Date in PGN headers.
//
// Note on ChessAccount.lifetimeBest: Lichess's public API (GET /api/user/{username},
// perfs.{speed}.rating) only exposes the player's CURRENT Glicko rating, not a
// true all-time peak. There is no lifetime-best fetch in this file — do not
// add one that maps current rating into lifetimeBest, since that would
// mislabel a current value as a lifetime best. lifetimeBest stays unset for
// lichess accounts; only the chess.com adapter populates it (see chesscom.ts
// fetchChesscomLifetimeBest, which uses a true all-time best.rating field).

import {
  currentImportDateRangeConfig,
  filterGamesByDate,
  importFilters,
  importRangeStartMsFor,
  importSyncFilterKey,
  type ImportSpeed,
} from './filters';
import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating, timeClassFromTimeControl } from './types';
import { accountId, getAccount, recordAccountSync, registerAccount } from '../accounts';
import { pgnToTree } from '../tree/pgn';
import { classifyOpening } from '../openings/eco';
import { record, Severity } from '../diagnostics';

export const lichess = {
  username: 'Leviathan_Duck',
  loading:  false,
  error:    null as string | null,
  /** Count of games parsed so far during an active import. */
  gameCount: 0,
};

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function lichessRequestClass(since: number | undefined): string {
  return since === undefined ? 'date-range' : 'since-date-range';
}

function recordLichessImportEvent(
  message: string,
  severity: Severity,
  metadata: Record<string, string | number | boolean | null>,
): void {
  record({
    kind: 'api',
    severity,
    source: 'import.lichess',
    sourceTag: 'import',
    message,
    metadata: {
      platform: 'lichess',
      ...metadata,
    },
    redactionClass: 'safe',
  });
}

/**
 * Extract the canonical 8-character Lichess game id from the [Site] header.
 * Site URLs may carry a color suffix (https://lichess.org/abcd1234/black) or a
 * 12-character player-specific id whose first 8 characters are the game id.
 * Returns undefined when no id can be parsed.
 */
function lichessGameId(pgn: string): string | undefined {
  const site = parsePgnHeader(pgn, 'Site');
  // Exactly 8 chars (canonical) or 8+4 (player-specific); token lengths of
  // 9-11 have no valid interpretation and must not match.
  const match = site?.match(/lichess\.org\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?![A-Za-z0-9])/);
  return match?.[1];
}

/**
 * Parse a game's UTC start timestamp (epoch ms) from UTCDate + UTCTime PGN
 * headers. Returns undefined when either header is absent or unparseable.
 */
export function lichessGameTimestamp(pgn: string): number | undefined {
  const date = parsePgnHeader(pgn, 'UTCDate'); // YYYY.MM.DD
  const time = parsePgnHeader(pgn, 'UTCTime'); // HH:MM:SS
  if (!date || !time) return undefined;
  const ts = Date.parse(`${date.replace(/\./g, '-')}T${time}Z`);
  return Number.isNaN(ts) ? undefined : ts;
}

/**
 * Overlap margin subtracted from the sync cursor when fetching incrementally,
 * so games in progress during the previous import are not missed. Overlapping
 * re-fetches drop out via ID-based dedupe.
 */
const SYNC_OVERLAP_MS = 86_400_000; // one day

/** Lichess API page cap per request; fetches at this size may be truncated. */
const LICHESS_MAX_GAMES = 300;

/**
 * Epoch-ms lower bound of the currently requested import date range, or null
 * when unbounded ('all'). Mirrors the cutoff logic in filters.ts
 * filterGamesByDate(), like archiveCutoffMonth() does in the Chess.com adapter.
 */
export async function fetchLichessGames(
  username: string, rated: boolean, speeds: Set<ImportSpeed>,
  onProgress?: (count: number) => void,
  since?: number,
  until?: number,
): Promise<ImportedGame[]> {
  const params = new URLSearchParams({ max: String(LICHESS_MAX_GAMES) });
  if (rated) params.set('rated', 'true');
  if (speeds.size > 0) params.set('perfType', [...speeds].join(','));
  params.set('clocks', 'true');
  if (since !== undefined) params.set('since', String(since));
  if (until !== undefined) params.set('until', String(until));
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
  const fetchStart = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'Accept': 'application/x-chess-pgn' } });
  } catch (error) {
    recordLichessImportEvent('Lichess games fetch failed', Severity.Error, {
      requestClass: lichessRequestClass(since),
      errorClass: errorClass(error),
      httpStatus: null,
      latencyMs: Date.now() - fetchStart,
    });
    throw error;
  }
  if (!res.ok) {
    recordLichessImportEvent('Lichess games fetch failed', Severity.Error, {
      requestClass: lichessRequestClass(since),
      errorClass: 'http-error',
      httpStatus: res.status,
      latencyMs: Date.now() - fetchStart,
    });
    throw new Error(res.status === 404 ? 'Lichess: user not found' : `Lichess API error ${res.status}`);
  }
  let text: string;
  try {
    text = await res.text();
  } catch (error) {
    recordLichessImportEvent('Lichess games stream failed', Severity.Error, {
      requestClass: lichessRequestClass(since),
      errorClass: errorClass(error),
      httpStatus: res.status,
      latencyMs: Date.now() - fetchStart,
    });
    throw error;
  }
  if (!text.trim()) {
    recordLichessImportEvent('lichess-import-empty', Severity.Info, {
      requestClass: lichessRequestClass(since),
      reason: 'empty-response',
    });
    return [];
  }

  // Split multi-game PGN: blank line followed by the next [Event header
  const gameTexts = text.trim().split(/\n\n(?=\[Event )/).filter(s => s.trim());

  const result: ImportedGame[] = [];
  for (let index = 0; index < gameTexts.length; index++) {
    const pgn = gameTexts[index]!;
    try {
      pgnToTree(pgn); // validate — skip games that fail to parse
    } catch (error) {
      recordLichessImportEvent('lichess-parse-failed', Severity.Warn, {
        requestClass: lichessRequestClass(since),
        errorClass: errorClass(error),
        batchIndex: index,
      });
      continue;
    }
    // Lichess uses UTCDate; fall back to Date if absent
    const date = (parsePgnHeader(pgn, 'UTCDate') ?? parsePgnHeader(pgn, 'Date'))?.replace(/\./g, '-');
    const white = parsePgnHeader(pgn, 'White');
    const black = parsePgnHeader(pgn, 'Black');
    const resultLabel = parsePgnHeader(pgn, 'Result');
    const timeClass = timeClassFromTimeControl(parsePgnHeader(pgn, 'TimeControl'));
    let opening = parsePgnHeader(pgn, 'Opening');
    let eco = parsePgnHeader(pgn, 'ECO');
    if (!opening || !eco) {
      const classified = classifyOpening(pgn);
      if (classified) {
        if (!opening) opening = classified.name;
        if (!eco) eco = classified.eco;
      }
    }
    const whiteRating = parseRating(parsePgnHeader(pgn, 'WhiteElo'));
    const blackRating = parseRating(parsePgnHeader(pgn, 'BlackElo'));
    // Canonical id: platform game id makes re-imports dedupe by construction.
    // Local-counter fallback keeps games importable when Site cannot be parsed.
    const gameId = lichessGameId(pgn);
    result.push({
      id:               gameId ? `lichess:${gameId}` : nextGameId(),
      pgn,
      source:           'lichess',
      importedUsername: username.toLowerCase(),
      accountId:        accountId('lichess', username),
      ...(white ? { white } : {}),
      ...(black ? { black } : {}),
      ...(resultLabel ? { result: resultLabel } : {}),
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

export async function importLichess(callbacks: ImportCallbacks): Promise<void> {
  const name = lichess.username.trim();
  if (!name || lichess.loading) return;

  const category = importFilters.importCategory;
  if (category === null) {
    recordLichessImportEvent('lichess-account-categorize-fail', Severity.Warn, {
      reasonClass: 'missing-category',
    });
    lichess.error = 'Choose a category (Mine / Opponent / Study) before importing.';
    callbacks.redraw();
    return;
  }
  lichess.loading = true;
  lichess.error = null;
  lichess.gameCount = 0;
  callbacks.redraw();
  try {
    const acctId = accountId('lichess', name);
    const account = await getAccount(acctId);
    const cursor = account?.newestGameTimestamp ?? null;
    const oldestCovered = account?.oldestGameTimestamp ?? null;
    const rangeStart = importRangeStartMsFor(currentImportDateRangeConfig());
    // Rated/speed filters shape what the API returns, so coverage recorded
    // under one filter combination must not suppress a broader fetch.
    const filterKey = importSyncFilterKey(importFilters.rated, importFilters.speeds);
    // Incremental sync: apply the cursor only when previous imports already
    // cover the requested range down to its start under the same filters.
    // Otherwise fetch the full requested range (ID dedupe absorbs overlap) so
    // a wider request can never be hidden behind the cursor.
    const useCursor = cursor !== null && oldestCovered !== null
      && rangeStart !== null && rangeStart >= oldestCovered - SYNC_OVERLAP_MS
      && account?.syncFilterKey === filterKey;
    const since = useCursor ? Math.max(0, cursor - SYNC_OVERLAP_MS) : rangeStart ?? undefined;
    const fetched = await fetchLichessGames(name, importFilters.rated, importFilters.speeds,
      (partial) => { lichess.gameCount = partial; callbacks.redraw(); },
      since,
    );
    const games = filterGamesByDate(fetched);
    lichess.gameCount = games.length;
    if (games.length === 0) {
      recordLichessImportEvent('lichess-import-empty', Severity.Info, {
        requestClass: lichessRequestClass(since),
        reason: fetched.length === 0 ? 'no-games-returned' : 'no-games-after-filters',
        useCursor,
      });
    }
    // Register before adding games: a registry write failure surfaces through
    // the catch below and must prevent uncategorized games from being added.
    try {
      await registerAccount('lichess', name, category);
    } catch (error) {
      recordLichessImportEvent('lichess-account-categorize-fail', Severity.Error, {
        reasonClass: errorClass(error),
      });
      throw error;
    }
    const timestamps = games.map(g => lichessGameTimestamp(g.pgn)).filter((t): t is number => t !== undefined);
    const newest = timestamps.length > 0 ? Math.max(...timestamps) : null;
    // Coverage extends down to the requested range start, unless the API page
    // cap truncated the fetch — then the oldest fetched game bounds coverage.
    const capped = fetched.length >= LICHESS_MAX_GAMES;
    let oldest: number | null = null;
    if (!useCursor) {
      oldest = capped
        ? (timestamps.length > 0 ? Math.min(...timestamps) : null)
        : rangeStart ?? 0;
    }
    await recordAccountSync(acctId, newest, oldest, filterKey);
    if (games.length === 0) {
      lichess.error = 'No games found matching current filters.';
    } else {
      callbacks.addGames(games, games[0]!); // addGames calls loadGame which calls redraw
    }
  } catch (err) {
    lichess.error = err instanceof Error ? err.message : 'Import failed.';
  } finally {
    lichess.loading = false;
    callbacks.redraw();
  }
}
