// Chess.com username import adapter.
// Adapted from docs/reference/api/chesscom.js

import { filterGamesByDate, importFilters, type ImportDateRange, type ImportSpeed } from './filters';
import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating } from './types';
import { pgnToTree } from '../tree/pgn';
import { classifyOpening } from '../openings/eco';

const CHESSCOM_BASE = 'https://api.chess.com/pub/player';

/**
 * Return the earliest YYYY-MM string that should be fetched for the current date filter,
 * or null when the filter is 'all' (fetch every archive month available).
 * Mirrors the cutoff logic in filters.ts filterGamesByDate().
 */
function archiveCutoffMonth(): string | null {
  const range: ImportDateRange = importFilters.dateRange;
  if (range === 'all') return null;
  if (range === 'custom') {
    // customFrom is YYYY-MM-DD; take the YYYY-MM prefix as the archive cutoff.
    return importFilters.customFrom ? importFilters.customFrom.slice(0, 7) : null;
  }
  const now = new Date();
  let cutoff: Date;
  switch (range) {
    case '24h':     cutoff = new Date(now.getTime() - 86_400_000);                          break;
    case '1week':   cutoff = new Date(now.getTime() - 7 * 86_400_000);                     break;
    case '1month':  cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);         break;
    case '3months': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);         break;
    case '1year':   cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1);   break;
    default: return null;
  }
  return cutoff.toISOString().slice(0, 7); // YYYY-MM
}

export const chesscom = {
  username: 'LeviathanDuck',
  loading:  false,
  error:    null as string | null,
  /** Live count of games parsed so far during an active import. */
  gameCount: 0,
};

function normalizeChesscomResult(whiteResult: string, blackResult: string): string {
  if (whiteResult === 'win') return '1-0';
  if (blackResult === 'win') return '0-1';
  return '1/2-1/2';
}

export async function fetchChesscomGames(
  username: string, rated: boolean, speeds: Set<ImportSpeed>,
  onProgress?: (count: number) => void,
): Promise<ImportedGame[]> {
  // 1. Fetch archive list (one URL per month the player has games)
  const archivesRes = await fetch(`${CHESSCOM_BASE}/${username.toLowerCase()}/games/archives`);
  if (!archivesRes.ok) {
    throw new Error(archivesRes.status === 404 ? 'Chess.com: user not found' : `Chess.com API error ${archivesRes.status}`);
  }
  const archivesData = await archivesRes.json() as { archives?: string[] };
  const archives = archivesData.archives ?? [];
  if (archives.length === 0) return [];

  // 2. Select archive months that fall within the current date-filter window.
  // Archive URLs end with /YYYY/MM — extract the month string and compare to cutoff.
  // Mirrors the cutoff logic in filters.ts filterGamesByDate(), applied to archive-month granularity.
  const cutoffMonth = archiveCutoffMonth();
  const relevantArchives = cutoffMonth === null
    ? archives
    : archives.filter(url => {
        const parts = url.split('/');
        const year  = parts[parts.length - 2];
        const month = parts[parts.length - 1];
        if (!year || !month) return false;
        return `${year}-${month.padStart(2, '0')}` >= cutoffMonth;
      });
  if (relevantArchives.length === 0) return [];

  // 3. Fetch all relevant archive months in parallel.
  const archiveResponses = await Promise.all(relevantArchives.map(url => fetch(url)));
  const rawGames: any[] = [];
  for (const res of archiveResponses) {
    if (!res.ok) throw new Error(`Chess.com API error ${res.status}`);
    const data = await res.json() as { games?: any[] };
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
    } catch {
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
    result.push({
      id:               nextGameId(),
      pgn,
      result:           normalizeChesscomResult(raw.white?.result ?? '', raw.black?.result ?? ''),
      source:           'chesscom',
      importedUsername: username.toLowerCase(),
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

export async function importChesscom(callbacks: ImportCallbacks): Promise<void> {
  const name = chesscom.username.trim();
  if (!name || chesscom.loading) return;
  chesscom.loading = true;
  chesscom.error = null;
  chesscom.gameCount = 0;
  callbacks.redraw();
  try {
    const games = filterGamesByDate(await fetchChesscomGames(name, importFilters.rated, importFilters.speeds,
      (partial) => { chesscom.gameCount = partial; callbacks.redraw(); },
    ));
    chesscom.gameCount = games.length;
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
