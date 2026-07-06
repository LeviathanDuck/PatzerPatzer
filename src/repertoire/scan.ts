import type { ImportedGame } from '../import/types';
import { parsePgnHeader, timeClassFromTimeControl } from '../import/types';
import { positionKeyFromFen, type PositionKey } from '../tree/fenKey';
import { pgnToTree } from '../tree/pgn';
import type { TreeNode, Uci } from '../tree/types';
import {
  buildRepertoireIndexFromSource,
  repertoireMatchRecordKey,
  type RepertoireDivergenceCategory,
  type RepertoireLinePrefixMove,
  type RepertoireMatchRecord,
  type RepertoirePositionIndex,
  type RepertoireSource,
} from './index';
import { repertoireScanSourceVersion } from './scanRun';

export type RepertoireScanOwnerColor = 'white' | 'black';

export interface ComputeRepertoireMatchRecordInput {
  game: ImportedGame;
  source: Pick<RepertoireSource, 'id' | 'contentVersion' | 'rawPgn' | 'side'>;
  sourceIndex?: RepertoirePositionIndex;
  ownerColor?: RepertoireScanOwnerColor;
  scannedAt?: number;
}

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const STANDARD_START_KEY = positionKeyFromFen(STANDARD_START_FEN);

function sideToMoveFromFen(fen: string): RepertoireScanOwnerColor | null {
  const side = fen.trim().split(/\s+/)[1];
  if (side === 'w') return 'white';
  if (side === 'b') return 'black';
  return null;
}

function normalizeIdentity(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function usernameFromAccountId(accountId: string | undefined): string | null {
  const normalized = normalizeIdentity(accountId);
  if (!normalized) return null;
  const colon = normalized.indexOf(':');
  return colon >= 0 ? normalizeIdentity(normalized.slice(colon + 1)) : normalized;
}

export function inferOwnerColorFromImportedGame(game: ImportedGame): RepertoireScanOwnerColor | null {
  const white = normalizeIdentity(game.white);
  const black = normalizeIdentity(game.black);
  const candidates = new Set<string>();
  const importedUsername = normalizeIdentity(game.importedUsername);
  const accountUsername = usernameFromAccountId(game.accountId);
  if (importedUsername) candidates.add(importedUsername);
  if (accountUsername) candidates.add(accountUsername);
  if (candidates.size === 0) return null;

  const matchesWhite = white !== null && candidates.has(white);
  const matchesBlack = black !== null && candidates.has(black);
  if (matchesWhite === matchesBlack) return null;
  return matchesWhite ? 'white' : 'black';
}

function ownerColorForSource(
  _source: Pick<RepertoireSource, 'side'>,
  game: ImportedGame,
  explicitOwnerColor?: RepertoireScanOwnerColor,
): RepertoireScanOwnerColor | null {
  return explicitOwnerColor ?? inferOwnerColorFromImportedGame(game);
}

function sourceAppliesToOwnerColor(
  source: Pick<RepertoireSource, 'side'>,
  ownerColor: RepertoireScanOwnerColor,
): boolean {
  return source.side === 'both' || source.side === ownerColor;
}

function gameResult(game: ImportedGame): string | null {
  return game.result ?? parsePgnHeader(game.pgn, 'Result') ?? null;
}

function gameDate(game: ImportedGame): string | null {
  return game.date
    ?? parsePgnHeader(game.pgn, 'UTCDate')?.replace(/\./g, '-')
    ?? parsePgnHeader(game.pgn, 'Date')?.replace(/\./g, '-')
    ?? parsePgnHeader(game.pgn, 'EndDate')?.replace(/\./g, '-')
    ?? null;
}

function gameTimeClass(game: ImportedGame): string | null {
  return game.timeClass ?? timeClassFromTimeControl(parsePgnHeader(game.pgn, 'TimeControl')) ?? null;
}

function safePositionKey(fen: string): PositionKey | null {
  try {
    return positionKeyFromFen(fen);
  } catch {
    return null;
  }
}

function safeSourceIndexForSource(
  source: Pick<RepertoireSource, 'rawPgn'>,
  sourceIndex?: RepertoirePositionIndex,
): RepertoirePositionIndex | null {
  if (sourceIndex) return sourceIndex;
  try {
    return buildRepertoireIndexFromSource(source);
  } catch {
    return null;
  }
}

function safeSourceIndex(input: ComputeRepertoireMatchRecordInput): RepertoirePositionIndex | null {
  return safeSourceIndexForSource(input.source, input.sourceIndex);
}

function baseRecord(
  input: ComputeRepertoireMatchRecordInput,
  ownerColor: RepertoireScanOwnerColor,
): Omit<RepertoireMatchRecord, 'status' | 'firstDivergencePly' | 'category' | 'playedUci' | 'missedUci' | 'matchedDepthPly' | 'divergencePositionKey'> {
  return {
    key:           repertoireMatchRecordKey(input.source.id, input.game.id),
    sourceId:      input.source.id,
    sourceVersion: repertoireScanSourceVersion(input.source),
    gameId:        input.game.id,
    ownerColor,
    gameResult:    gameResult(input.game),
    timeClass:     gameTimeClass(input.game),
    gameDate:      gameDate(input.game),
    accountId:     input.game.accountId ?? null,
    scannedAt:     input.scannedAt ?? Date.now(),
  };
}

function notApplicableRecord(
  input: ComputeRepertoireMatchRecordInput,
  ownerColor: RepertoireScanOwnerColor,
): RepertoireMatchRecord {
  return {
    ...baseRecord(input, ownerColor),
    status:             'not-applicable',
    firstDivergencePly: null,
    category:           null,
    playedUci:          null,
    missedUci:          null,
    matchedDepthPly:    0,
    divergencePositionKey: null,
  };
}

function maxEntryDepth(entries: readonly { depthPly: number }[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.depthPly), 0);
}

function preferredMissedMove(entries: readonly { uci: Uci; san: string; isMain: boolean }[]): { uci: Uci; san: string } | null {
  const entry = entries.find(candidate => candidate.isMain) ?? entries[0];
  return entry ? { uci: entry.uci, san: entry.san } : null;
}

function divergenceCategory(
  mover: RepertoireScanOwnerColor,
  ownerColor: RepertoireScanOwnerColor,
  availableMoveCount: number,
): RepertoireDivergenceCategory {
  if (mover !== ownerColor) return 'opponent-left';
  return availableMoveCount > 0 ? 'owner-missed-available' : 'owner-left';
}

function linePrefixMove(node: TreeNode): RepertoireLinePrefixMove | null {
  if (!node.uci || !node.san) return null;
  return {
    ply: node.ply,
    san: node.san,
    uci: node.uci,
  };
}

function appendLinePrefixMove(
  linePrefix: readonly RepertoireLinePrefixMove[],
  node: TreeNode,
): RepertoireLinePrefixMove[] {
  const move = linePrefixMove(node);
  return move ? [...linePrefix, move] : [...linePrefix];
}

export function computeRepertoireMatchRecord(input: ComputeRepertoireMatchRecordInput): RepertoireMatchRecord {
  const resolvedOwnerColor = ownerColorForSource(input.source, input.game, input.ownerColor);
  const recordOwnerColor = resolvedOwnerColor ?? input.ownerColor ?? 'white';
  if (!resolvedOwnerColor) return notApplicableRecord(input, recordOwnerColor);
  if (!sourceAppliesToOwnerColor(input.source, resolvedOwnerColor)) {
    return notApplicableRecord(input, resolvedOwnerColor);
  }

  const index = safeSourceIndex(input);
  if (!index || index.size === 0) return notApplicableRecord(input, resolvedOwnerColor);

  let root: TreeNode;
  try {
    root = pgnToTree(input.game.pgn);
  } catch {
    return notApplicableRecord(input, resolvedOwnerColor);
  }

  const rootKey = safePositionKey(root.fen);
  if (!rootKey || rootKey !== STANDARD_START_KEY) return notApplicableRecord(input, resolvedOwnerColor);

  let node = root;
  let matchedDepthPly = 0;
  let enteredSource = false;
  let linePrefix: RepertoireLinePrefixMove[] = [];

  while (true) {
    const played = node.children[0];
    if (!played?.uci) break;
    const nextLinePrefix = appendLinePrefixMove(linePrefix, played);

    const mover = sideToMoveFromFen(node.fen);
    const key = safePositionKey(node.fen);
    if (!mover || !key) return notApplicableRecord(input, resolvedOwnerColor);

    const entries = index.get(key);
    if (entries) {
      enteredSource = true;
      matchedDepthPly = Math.max(matchedDepthPly, Math.max(0, maxEntryDepth(entries) - 1));

      const matchingEntries = entries.filter(entry => entry.uci === played.uci);
      if (matchingEntries.length > 0) {
        matchedDepthPly = Math.max(matchedDepthPly, maxEntryDepth(matchingEntries));
        linePrefix = nextLinePrefix;
        node = played;
        continue;
      }

      const missedMove = preferredMissedMove(entries);
      return {
        ...baseRecord(input, resolvedOwnerColor),
        status:             'diverged',
        firstDivergencePly: played.ply,
        category:           divergenceCategory(mover, resolvedOwnerColor, entries.length),
        playedUci:          played.uci,
        missedUci:          missedMove?.uci ?? null,
        missedSan:          missedMove?.san ?? null,
        linePrefix:         nextLinePrefix,
        matchedDepthPly,
        divergencePositionKey: key,
      };
    }

    linePrefix = nextLinePrefix;
    node = played;
  }

  return {
    ...baseRecord(input, resolvedOwnerColor),
    status:             enteredSource ? 'in' : 'not-applicable',
    firstDivergencePly: null,
    category:           null,
    playedUci:          null,
    missedUci:          null,
    matchedDepthPly,
    divergencePositionKey: null,
  };
}

export function computeRepertoireMatchRecords(params: {
  games: readonly ImportedGame[];
  sources: readonly Pick<RepertoireSource, 'id' | 'contentVersion' | 'rawPgn' | 'side'>[];
  ownerColorByGameId?: ReadonlyMap<string, RepertoireScanOwnerColor>;
  scannedAt?: number;
}): RepertoireMatchRecord[] {
  const records: RepertoireMatchRecord[] = [];
  for (const source of params.sources) {
    const sourceIndex: RepertoirePositionIndex = safeSourceIndexForSource(source) ?? new Map();
    for (const game of params.games) {
      const input: ComputeRepertoireMatchRecordInput = {
        game,
        source,
        sourceIndex,
      };
      const ownerColor = params.ownerColorByGameId?.get(game.id);
      if (ownerColor) input.ownerColor = ownerColor;
      if (params.scannedAt !== undefined) input.scannedAt = params.scannedAt;
      records.push(computeRepertoireMatchRecord(input));
    }
  }
  return records;
}
