import type {
  GameFilterAnalysisState,
  GameFilterMissedTacticSeverity,
  GameFilterOwnerResult,
  GameFilterProjection,
  GameFilterReviewIssueState,
  GameFilterUserColor,
  ImportedGameLike,
  PersistedImportedGameLike,
  StudyGameFilterItem,
} from './types';

export interface ImportedGameProjectionOptions {
  ownerResult?: GameFilterOwnerResult | null | undefined;
  userColor?: GameFilterUserColor | null | undefined;
  opponentName?: string | null | undefined;
  opponentRating?: number | null | undefined;
  missedTacticSeverities?: readonly GameFilterMissedTacticSeverity[] | null | undefined;
  reviewIssueState?: GameFilterReviewIssueState | null | undefined;
  analysisState?: GameFilterAnalysisState | null | undefined;
  playedAt?: number | null | undefined;
  textAnyValues?: readonly string[] | null | undefined;
}

export interface StudyProjectionOptions {
  hidden?: boolean;
}

export function projectImportedGame(
  game: ImportedGameLike,
  options: ImportedGameProjectionOptions = {},
): GameFilterProjection {
  const playedAt = Object.prototype.hasOwnProperty.call(options, 'playedAt')
    ? numberOrUndefined(options.playedAt)
    : resolveImportedPlayedAt(game);
  return {
    id: game.id,
    family: 'imported-game',
    pgn: game.pgn,
    white: emptyToUndefined(game.white),
    black: emptyToUndefined(game.black),
    result: emptyToUndefined(game.result),
    ownerResult: valueOrUndefined(options.ownerResult),
    userColor: valueOrUndefined(options.userColor),
    playerNames: playerNames(game),
    opponentName: emptyToUndefined(options.opponentName),
    opponentRating: numberOrUndefined(options.opponentRating),
    source: emptyToUndefined(game.source),
    accountId: emptyToUndefined(game.accountId),
    importedUsername: emptyToUndefined(game.importedUsername),
    timeClass: emptyToUndefined(game.timeClass),
    opening: emptyToUndefined(game.opening),
    eco: emptyToUndefined(game.eco),
    playedAt,
    missedTacticSeverities: copyNonEmpty(options.missedTacticSeverities),
    reviewIssueState: valueOrUndefined(options.reviewIssueState),
    analysisState: valueOrUndefined(options.analysisState),
    textAnyValues: copyOptionalStrings(options.textAnyValues),
    addedAt: numberOrUndefined(game.importedAt),
  };
}

export function projectPersistedImportedGame(
  game: PersistedImportedGameLike,
  options: ImportedGameProjectionOptions = {},
): GameFilterProjection {
  const playedAt = Object.prototype.hasOwnProperty.call(options, 'playedAt')
    ? numberOrUndefined(options.playedAt)
    : resolveImportedPlayedAt(game);
  return {
    id: game.id,
    family: 'imported-game',
    pgn: game.pgn,
    white: emptyToUndefined(game.white),
    black: emptyToUndefined(game.black),
    result: emptyToUndefined(game.result),
    ownerResult: valueOrUndefined(options.ownerResult),
    userColor: valueOrUndefined(options.userColor),
    playerNames: playerNames(game),
    opponentName: emptyToUndefined(options.opponentName),
    opponentRating: numberOrUndefined(options.opponentRating),
    source: emptyToUndefined(game.source),
    accountId: emptyToUndefined(game.accountId),
    importedUsername: emptyToUndefined(game.importedUsername),
    timeClass: emptyToUndefined(game.timeClass),
    opening: emptyToUndefined(game.opening),
    eco: emptyToUndefined(game.eco),
    playedAt,
    missedTacticSeverities: copyNonEmpty(options.missedTacticSeverities),
    reviewIssueState: valueOrUndefined(options.reviewIssueState),
    analysisState: valueOrUndefined(options.analysisState),
    textAnyValues: copyOptionalStrings(options.textAnyValues),
    addedAt: numberOrUndefined(game.importedAt) ?? numberOrUndefined(game.createdAt),
    modifiedAt: numberOrUndefined(game.updatedAt),
  };
}

export function projectStudyItem(
  item: StudyGameFilterItem,
  options: StudyProjectionOptions = {},
): GameFilterProjection {
  return {
    id: item.id,
    family: 'study-item',
    title: emptyToUndefined(item.title),
    pgn: item.pgn,
    white: emptyToUndefined(item.white),
    black: emptyToUndefined(item.black),
    result: emptyToUndefined(item.result),
    playerNames: playerNames(item),
    source: emptyToUndefined(item.source),
    opening: emptyToUndefined(item.opening),
    eco: emptyToUndefined(item.eco),
    addedAt: numberOrUndefined(item.createdAt),
    modifiedAt: numberOrUndefined(item.updatedAt),
    tags: [...item.tags],
    folderIds: [...item.folders],
    homeFolderId: item.homeFolderId,
    destination: emptyToUndefined(item.destination),
    favorite: item.favorite,
    hidden: Boolean(options.hidden),
    sourceGameId: emptyToUndefined(item.sourceGameId),








    textAnyValues: studyTextAnyValues(item),
  };
}

function studyTextAnyValues(item: StudyGameFilterItem): string[] {
  return [
    item.title,
    item.white ?? '',
    item.black ?? '',
    item.opening ?? '',
    item.eco ?? '',
    item.result ?? '',
    item.source,
    item.pgn,
    item.notes ?? '',
  ];
}

function resolveImportedPlayedAt(game: {
  pgn?: string | null;
  source?: string | null;
  date?: string | null;
  startTime?: number | null;
  endTime?: number | null;
}): number | undefined {
  const startTime = numberOrUndefined(game.startTime);
  if (startTime !== undefined) return normalizeEpochSeconds(startTime);

  const endTime = numberOrUndefined(game.endTime);
  if (endTime !== undefined) return normalizeEpochSeconds(endTime);

  const exactPgnTime = exactPgnPlayedAt(game);
  if (exactPgnTime !== undefined) return exactPgnTime;

  return parseGameDate(game.date);
}

function exactPgnPlayedAt(game: { pgn?: string | null; source?: string | null }): number | undefined {
  const chesscomEnd = parsePgnTimestamp(game.pgn, 'EndDate', 'EndTime');
  const utc = parsePgnTimestamp(game.pgn, 'UTCDate', 'UTCTime');
  if (game.source === 'chesscom') return chesscomEnd ?? utc;
  return utc ?? chesscomEnd;
}

function parsePgnTimestamp(pgn: string | null | undefined, dateTag: string, timeTag: string): number | undefined {
  const date = parsePgnHeader(pgn, dateTag);
  const time = parsePgnHeader(pgn, timeTag);
  if (!date || !time) return undefined;
  const timestamp = Date.parse(`${date.replace(/\./g, '-')}T${time}Z`);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function parsePgnHeader(pgn: string | null | undefined, tag: string): string | undefined {
  return pgn?.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))?.[1];
}

function parseGameDate(value: string | null | undefined): number | undefined {
  if (!value || value === '????.??.??') return undefined;
  const match = value.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  return Date.UTC(year, month - 1, day);
}

function normalizeEpochSeconds(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function emptyToUndefined<T extends string>(value: T | null | undefined): T | undefined {
  return value ? value : undefined;
}

function valueOrUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function copyNonEmpty<T>(values: readonly T[] | null | undefined): T[] | undefined {
  return values?.length ? [...values] : undefined;
}

function copyOptionalStrings(values: readonly string[] | null | undefined): string[] | undefined {
  return values == null ? undefined : values.filter(Boolean);
}

function playerNames(game: { white?: string | null; black?: string | null }): string[] | undefined {
  return copyNonEmpty([game.white, game.black].filter((value): value is string => Boolean(value)));
}
