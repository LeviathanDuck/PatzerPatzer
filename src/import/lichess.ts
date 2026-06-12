// Lichess username import adapter.
// Lichess public API: GET /api/games/user/{username}?max=N&rated=true
// Returns multi-game PGN text when Accept: application/x-chess-pgn is sent.
// Lichess uses UTCDate rather than Date in PGN headers.

import { filterGamesByDate, importFilters, type ImportSpeed } from './filters';
import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating, timeClassFromTimeControl } from './types';
import { accountId, getAccount, recordAccountSync, registerAccount } from '../accounts';
import { pgnToTree } from '../tree/pgn';
import { classifyOpening } from '../openings/eco';

export const lichess = {
  username: 'Leviathan_Duck',
  loading:  false,
  error:    null as string | null,
  /** Count of games parsed so far during an active import. */
  gameCount: 0,
};

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
function lichessGameTimestamp(pgn: string): number | undefined {
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
function importRangeStartMs(): number | null {
  const range = importFilters.dateRange;
  if (range === 'all') return null;
  if (range === 'custom') {
    if (!importFilters.customFrom) return null;
    const ts = Date.parse(`${importFilters.customFrom}T00:00:00Z`);
    return Number.isNaN(ts) ? null : ts;
  }
  const now = new Date();
  let cutoff: Date;
  switch (range) {
    case '24h':     cutoff = new Date(now.getTime() - 86_400_000);                        break;
    case '1week':   cutoff = new Date(now.getTime() - 7 * 86_400_000);                    break;
    case '1month':  cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);       break;
    case '3months': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);       break;
    case '1year':   cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    default: return null;
  }
  return cutoff.getTime();
}

export async function fetchLichessGames(
  username: string, rated: boolean, speeds: Set<ImportSpeed>,
  onProgress?: (count: number) => void,
  since?: number,
): Promise<ImportedGame[]> {
  const params = new URLSearchParams({ max: String(LICHESS_MAX_GAMES) });
  if (rated) params.set('rated', 'true');
  if (speeds.size > 0) params.set('perfType', [...speeds].join(','));
  params.set('clocks', 'true');
  if (since !== undefined) params.set('since', String(since));
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/x-chess-pgn' } });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Lichess: user not found' : `Lichess API error ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];

  // Split multi-game PGN: blank line followed by the next [Event header
  const gameTexts = text.trim().split(/\n\n(?=\[Event )/).filter(s => s.trim());

  const result: ImportedGame[] = [];
  for (const pgn of gameTexts) {
    try {
      pgnToTree(pgn); // validate — skip games that fail to parse
    } catch {
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
    const rangeStart = importRangeStartMs();
    // Rated/speed filters shape what the API returns, so coverage recorded
    // under one filter combination must not suppress a broader fetch.
    const filterKey = `${importFilters.rated ? 'rated' : 'any'}|${[...importFilters.speeds].sort().join(',')}`;
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
    // Register before adding games: a registry write failure surfaces through
    // the catch below and must prevent uncategorized games from being added.
    await registerAccount('lichess', name, category);
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
