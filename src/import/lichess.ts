// Lichess username import adapter.
// Lichess public API: GET /api/games/user/{username}?max=N&rated=true
// Returns multi-game PGN text when Accept: application/x-chess-pgn is sent.
// Lichess uses UTCDate rather than Date in PGN headers.

import { filterGamesByDate, importFilters, type ImportSpeed } from './filters';
import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating, timeClassFromTimeControl } from './types';
import { pgnToTree } from '../tree/pgn';

export const lichess = {
  username: 'Leviathan_Duck',
  loading:  false,
  error:    null as string | null,
};

export async function fetchLichessGames(
  username: string, rated: boolean, speeds: Set<ImportSpeed>,
): Promise<ImportedGame[]> {
  const params = new URLSearchParams({ max: '30' });
  if (rated) params.set('rated', 'true');
  if (speeds.size > 0) params.set('perfType', [...speeds].join(','));
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
    const opening = parsePgnHeader(pgn, 'Opening');
    const eco = parsePgnHeader(pgn, 'ECO');
    const whiteRating = parseRating(parsePgnHeader(pgn, 'WhiteElo'));
    const blackRating = parseRating(parsePgnHeader(pgn, 'BlackElo'));
    result.push({
      id:               nextGameId(),
      pgn,
      source:           'lichess',
      importedUsername: username.toLowerCase(),
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
  }
  return result;
}

export async function importLichess(callbacks: ImportCallbacks): Promise<void> {
  const name = lichess.username.trim();
  if (!name || lichess.loading) return;
  lichess.loading = true;
  lichess.error = null;
  callbacks.redraw();
  try {
    const games = filterGamesByDate(await fetchLichessGames(name, importFilters.rated, importFilters.speeds));
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
