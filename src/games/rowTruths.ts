



























// The live per-platform import usernames come from src/import/types.ts, NOT from the adapter
// modules the previous copies read (`chesscom.username` / `lichess.username`). Those adapters
// transitively reach a renderer (adapter -> src/diagnostics -> reporting/reportPreview.ts ->
// snabbdom), which would break this module's data-only constraint; the adapters' `username` fields
// are now accessors over this same holder, so there is still exactly one copy of the state.
import { importPlatformUsernames, type ImportedGame } from '../import/types';
// Data-only import: the questionnaire model owns the option ids/labels/icon-slugs/hue-families a
// studied game's story chip renders. It is deliberately import-free itself (see its header), so it
// cannot drag a renderer in behind it.
import {
  questionnaireBranch, findQuestionnaireOption, STORY_OPTIONS, DECIDER_OPTIONS,
  type QuestionnaireOption,
} from '../analyse/questionnaire/model';
// TYPE-ONLY import (erased at build time): src/accounts/index.ts is a data module, but importing it
// for a value would pull the IDB layer into every consumer of this file for no benefit. Orientation
// takes the already-hydrated account lens as a parameter instead.
import type { AccountCategory } from '../accounts';

export type PlayerColor = 'white' | 'black';
export type RowResult = 'win' | 'loss' | 'draw';

function normalize(name: string | undefined | null): string | null {
  const trimmed = name?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Which side the importing user played in a given game.
 *
 * Prefers `importedUsername` stored at import time (reliable after IDB restore) and falls back to
 * the current adapter usernames for games imported before that field existed. Returns null when no
 * known name matches either side — callers must handle that, never invent a side.
 */
export function getUserColor(game: ImportedGame): PlayerColor | null {
  const knownNames = [game.importedUsername, importPlatformUsernames.chesscom, importPlatformUsernames.lichess]
    .map(normalize)
    .filter((n): n is string => n !== null);
  if (knownNames.length === 0) return null;
  // Both sides are normalized, not just the known names: the compact row's retired
  // `importedAccountColor()` trimmed the player names too, and dropping that would have quietly
  // stopped matching a PGN name stored with surrounding whitespace.
  const white = normalize(game.white);
  const black = normalize(game.black);
  if (white !== null && knownNames.includes(white)) return 'white';
  if (black !== null && knownNames.includes(black)) return 'black';
  return null;
}

/** Win/loss/draw RELATIVE TO THE USER. Null when the user's side cannot be determined. */
export function gameResult(game: ImportedGame): RowResult | null {
  const color = getUserColor(game);
  if (!game.result) return null;
  if (game.result.includes('1/2')) return 'draw';
  if (!color) return null;
  if (color === 'white') return game.result === '1-0' ? 'win' : 'loss';
  return game.result === '0-1' ? 'win' : 'loss';
}










export function opponentLabel(game: ImportedGame, userColor: PlayerColor | null): string | null {
  if (userColor === 'white') return game.black ?? null;
  if (userColor === 'black') return game.white ?? null;
  return game.white && game.black ? `${game.white} vs ${game.black}` : null;
}

/**
 * The ACCOUNT slot's display label — the account SIDE's real player name, falling back to the
 * imported account username. Null when neither is available (see opponentLabel on why this is not
 * `game.id`). This is the implementation that was already correct in richRow.ts before the drift.
 */
export function accountLabel(game: ImportedGame, userColor: PlayerColor | null): string | null {
  if (userColor === 'white') return game.white ?? game.importedUsername ?? null;
  if (userColor === 'black') return game.black ?? game.importedUsername ?? null;
  return game.importedUsername ?? null;
}










export interface RowSides {
  userColor: PlayerColor | null;
  /** The side facing the account (null when the account side is unknown). */
  opponentColor: PlayerColor | null;
  opponentName: string | null;
  accountName: string | null;
  opponentRating: number | undefined;
  accountRating: number | undefined;
  result: RowResult | null;
}

export function rowSides(game: ImportedGame): RowSides {
  const userColor = getUserColor(game);
  return {
    userColor,
    opponentColor: userColor === 'white' ? 'black' : userColor === 'black' ? 'white' : null,
    opponentName: opponentLabel(game, userColor),
    accountName: accountLabel(game, userColor),
    opponentRating: userColor === 'white' ? game.blackRating : userColor === 'black' ? game.whiteRating : undefined,
    accountRating: userColor === 'white' ? game.whiteRating : userColor === 'black' ? game.blackRating : undefined,
    result: gameResult(game),
  };
}

/**
 * The story chip's option (P2-QST-7): the PRIMARY decider (`deciders[0]`; ranks 2-3 never chip —
 * left-column-only per the v2 lookbook §03/§08) when one was picked, falling back to the Game story
 * pick otherwise. Undefined for an unstudied game or one whose recorded ids no longer resolve, so a
 * broken chip can never render. Derivation only — the chip's markup stays in richRow.ts.
 */
export function primaryStoryChipOption(game: ImportedGame): QuestionnaireOption | undefined {
  const q = game.questionnaire;
  if (!q) return undefined;
  const branch = questionnaireBranch(q);
  const primary = q.deciders[0] ? findQuestionnaireOption(DECIDER_OPTIONS[branch], q.deciders[0]) : undefined;
  return primary ?? findQuestionnaireOption(STORY_OPTIONS[branch], q.story);
}





/**
 * The minimum an account registry record must expose for orientation. Structurally satisfied by
 * `ChessAccount` (src/accounts/index.ts), so call sites pass their already-hydrated account list
 * directly; this module never reads IDB.
 */
export interface OrientationAccountLens {
  /** Canonical `${platform}:${username}` id, matching `ImportedGame.accountId`. Optional only so
   *  callers/tests can pass a bare username lens; supply it whenever it exists. */
  id?: string;
  username: string;
  category: AccountCategory;
}

/**
 * The `chesscom:` / `lichess:` prefix identifying which platform a game belongs to — from its
 * platform-qualified `accountId` when present, else from its `source` tag (legacy rows imported
 * before `accountId` existed still carry `source`). Null only when the game names no platform at
 * all (e.g. a pasted PGN or a Study item), in which case no platform filtering is possible.
 */
function gamePlatformPrefix(game: ImportedGame): string | null {
  const separator = game.accountId?.indexOf(':') ?? -1;
  if (separator > 0) return game.accountId!.slice(0, separator + 1);
  return game.source ? `${game.source}:` : null;
}


















export function resolveRowOrientation(
  game: ImportedGame,
  accounts: readonly OrientationAccountLens[],
): PlayerColor {
  const white = normalize(game.white);
  const black = normalize(game.black);
  // A game that names its platform may only be classified by accounts from THAT platform: the same
  // username can be registered on both platforms under different categories, and a username-only
  // match would let the wrong record decide. FAIL-CLOSED: when the game's platform is known, an
  // account that cannot prove its own platform (no canonical id) is skipped rather than trusted.
  const platformPrefix = gamePlatformPrefix(game);

  let opponentMatch: PlayerColor | null = null;
  let studyMatch: PlayerColor | null = null;

  for (const account of accounts) {
    if (platformPrefix !== null && !(account.id?.startsWith(platformPrefix) ?? false)) continue;
    const name = normalize(account.username);
    if (name === null) continue;
    const side: PlayerColor | null = name === white ? 'white' : name === black ? 'black' : null;
    if (side === null) continue;
    if (account.category === 'mine') return side;
    if (account.category === 'opponent' && opponentMatch === null) opponentMatch = side;
    else if (account.category === 'study' && studyMatch === null) studyMatch = side;
  }

  // Play AGAINST an opponent-category account: face the side opposing them.
  if (opponentMatch !== null) return opponentMatch === 'white' ? 'black' : 'white';
  // Play AS a study-category account: take their side.
  if (studyMatch !== null) return studyMatch;

  return getUserColor(game) ?? 'white';
}
