// Chess.com username import adapter.
// Adapted from docs/reference/api/chesscom.js

import { filterGamesByDate, importFilters, type ImportSpeed } from './filters';
import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating } from './types';
import { pgnToTree } from '../tree/pgn';

const CHESSCOM_BASE = 'https://api.chess.com/pub/player';

export const chesscom = {
  username: 'LeviathanDuck',
  loading:  false,
  error:    null as string | null,
};

function normalizeChesscomResult(whiteResult: string, blackResult: string): string {
  if (whiteResult === 'win') return '1-0';
  if (blackResult === 'win') return '0-1';
  return '1/2-1/2';
}

export async function fetchChesscomGames(
  username: string, rated: boolean, speeds: Set<ImportSpeed>,
): Promise<ImportedGame[]> {
  // 1. Fetch archive list (one URL per month the player has games)
  const archivesRes = await fetch(`${CHESSCOM_BASE}/${username.toLowerCase()}/games/archives`);
  if (!archivesRes.ok) {
    throw new Error(archivesRes.status === 404 ? 'Chess.com: user not found' : `Chess.com API error ${archivesRes.status}`);
  }
  const archivesData = await archivesRes.json() as { archives?: string[] };
  const archives = archivesData.archives ?? [];
  if (archives.length === 0) return [];

  // 2. Fetch only the most recent archive month
  const latestUrl = archives[archives.length - 1]!;
  const gamesRes = await fetch(latestUrl);
  if (!gamesRes.ok) throw new Error(`Chess.com API error ${gamesRes.status}`);
  const gamesData = await gamesRes.json() as { games?: any[] };
  const rawGames: any[] = gamesData.games ?? [];

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
    result.push({
      id:               nextGameId(),
      pgn,
      white:            raw.white?.username ?? undefined,
      black:            raw.black?.username ?? undefined,
      result:           normalizeChesscomResult(raw.white?.result ?? '', raw.black?.result ?? ''),
      date:             parsePgnHeader(pgn, 'Date')?.replace(/\./g, '-'),
      timeClass:        raw.time_class as string | undefined,
      opening:          parsePgnHeader(pgn, 'Opening'),
      eco:              parsePgnHeader(pgn, 'ECO'),
      source:           'chesscom',
      // API field is a number; fall back to PGN header if absent
      whiteRating:      parseRating(raw.white?.rating) ?? parseRating(parsePgnHeader(pgn, 'WhiteElo')),
      blackRating:      parseRating(raw.black?.rating) ?? parseRating(parsePgnHeader(pgn, 'BlackElo')),
      importedUsername: username.toLowerCase(),
    });
  }
  return result;
}

export async function importChesscom(callbacks: ImportCallbacks): Promise<void> {
  const name = chesscom.username.trim();
  if (!name || chesscom.loading) return;
  chesscom.loading = true;
  chesscom.error = null;
  callbacks.redraw();
  try {
    const games = filterGamesByDate(await fetchChesscomGames(name, importFilters.rated, importFilters.speeds));
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
