// PGN paste import adapter.

import { type ImportCallbacks, type ImportedGame, nextGameId, parsePgnHeader, parseRating, timeClassFromTimeControl } from './types';
import { pgnToTree } from '../tree/pgn';
import { classifyOpening } from '../openings/eco';
import { record, Severity } from '../diagnostics';

export const pgnState = {
  input: '',
  error: null as string | null,
  key:   0,  // incremented on successful import to reset the textarea via Snabbdom key
};

function pgnEntries(raw: string): string[] {
  return raw.trim().split(/\n\n(?=\[Event )/).filter(entry => entry.trim().length > 0);
}

function recordPgnImportEvent(
  message: string,
  severity: Severity,
  metadata: Record<string, string | number | boolean | null>,
): void {
  record({
    kind: 'api',
    severity,
    source: 'import.pgn',
    sourceTag: 'import',
    message,
    metadata: {
      platform: 'pgn-file',
      ...metadata,
    },
    redactionClass: 'safe',
  });
}

function recordEncodingDiagnostics(input: string): void {
  if (input.charCodeAt(0) === 0xfeff) {
    recordPgnImportEvent('pgn-encoding-error', Severity.Warn, {
      encodingClass: 'bom-detected',
    });
  }
  if (input.includes('\ufffd')) {
    recordPgnImportEvent('pgn-encoding-error', Severity.Warn, {
      encodingClass: 'non-utf8',
    });
  }
}

function recordPgnBatchDiagnostics(entries: string[]): void {
  if (entries.length > 100) {
    recordPgnImportEvent('pgn-large-import', Severity.Warn, {
      gameCount: entries.length,
    });
  }

  for (let index = 0; index < entries.length; index++) {
    try {
      pgnToTree(entries[index]!);
    } catch (error) {
      recordPgnImportEvent('pgn-parse-failed', Severity.Warn, {
        errorClass: 'ParseError',
        gameIndex: index,
      });
    }
  }
}

export function importPgn(callbacks: ImportCallbacks): void {
  const input = pgnState.input;
  const raw = input.trim();
  if (!raw) {
    recordPgnImportEvent('PGN import failed', Severity.Warn, {
      errorClass: 'EmptyFile',
      gameIndex: 0,
    });
    return;
  }
  recordEncodingDiagnostics(input);
  recordPgnBatchDiagnostics(pgnEntries(raw));
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
      sourcePgn: raw, // write-once (src/import/types.ts) — the pasted text itself is the source
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
  } catch (err) {
    recordPgnImportEvent('PGN import failed', Severity.Error, {
      errorClass: 'ParseError',
      gameIndex: 0,
    });
    pgnState.error = 'Invalid PGN — could not parse.';
    callbacks.redraw();
  }
}
