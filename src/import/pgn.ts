// PGN paste import adapter.

import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating, timeClassFromTimeControl } from './types';
import { pgnToTree } from '../tree/pgn';

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
    const game: ImportedGame = {
      id:          nextGameId(),
      pgn:         raw,
      white:       parsePgnHeader(raw, 'White'),
      black:       parsePgnHeader(raw, 'Black'),
      result:      parsePgnHeader(raw, 'Result'),
      date:        parsePgnHeader(raw, 'Date')?.replace(/\./g, '-'),
      timeClass:   timeClassFromTimeControl(parsePgnHeader(raw, 'TimeControl')),
      opening:     parsePgnHeader(raw, 'Opening'),
      eco:         parsePgnHeader(raw, 'ECO'),
      whiteRating: parseRating(parsePgnHeader(raw, 'WhiteElo')),
      blackRating: parseRating(parsePgnHeader(raw, 'BlackElo')),
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
