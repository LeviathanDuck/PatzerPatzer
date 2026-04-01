// PGN paste import adapter.

import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating, timeClassFromTimeControl } from './types';
import { pgnToTree } from '../tree/pgn';
import { classifyOpening } from '../openings/eco';

export const pgnState = {
  input: '',
  error: null as string | null,
  key:   0,  // incremented on successful import to reset the textarea via Snabbdom key
};

export function importPgn(callbacks: ImportCallbacks): void {
  const raw = pgnState.input.trim();
  if (!raw) return;
  try {
    pgnToTree(raw); // validate — throws on bad PGN
    const white = parsePgnHeader(raw, 'White');
    const black = parsePgnHeader(raw, 'Black');
    const result = parsePgnHeader(raw, 'Result');
    const date = parsePgnHeader(raw, 'Date')?.replace(/\./g, '-');
    const timeClass = timeClassFromTimeControl(parsePgnHeader(raw, 'TimeControl'));
    let opening = parsePgnHeader(raw, 'Opening');
    let eco = parsePgnHeader(raw, 'ECO');
    if (!opening || !eco) {
      const classified = classifyOpening(raw);
      if (classified) {
        if (!opening) opening = classified.name;
        if (!eco) eco = classified.eco;
      }
    }
    const whiteRating = parseRating(parsePgnHeader(raw, 'WhiteElo'));
    const blackRating = parseRating(parsePgnHeader(raw, 'BlackElo'));
    const game: ImportedGame = {
      id:  nextGameId(),
      pgn: raw,
      ...(white ? { white } : {}),
      ...(black ? { black } : {}),
      ...(result ? { result } : {}),
      ...(date ? { date } : {}),
      ...(timeClass ? { timeClass } : {}),
      ...(opening ? { opening } : {}),
      ...(eco ? { eco } : {}),
      ...(whiteRating !== undefined ? { whiteRating } : {}),
      ...(blackRating !== undefined ? { blackRating } : {}),
      // importedUsername not set: PGN paste has no reliable importing-user identity
    };
    pgnState.error = null;
    pgnState.input = '';
    pgnState.key++;  // new key causes Snabbdom to recreate the textarea (clears it)
    callbacks.addGames([game], game); // addGames calls loadGame which calls redraw
  } catch (_) {
    pgnState.error = 'Invalid PGN — could not parse.';
    callbacks.redraw();
  }
}
