import { parseRepertoirePgn, type ParsedRepertoireGame } from './parse';
import { positionKeyFromFen, type PositionKey } from '../tree/fenKey';
import type { GlyphId, TreeComment, TreeNode, Uci, San } from '../tree/types';

export type RepertoireSide = 'white' | 'black' | 'both';

export type RepertoireMatchStatus = 'in' | 'diverged' | 'not-applicable';

export type RepertoireDivergenceCategory =
  | 'owner-left'
  | 'opponent-left'
  | 'owner-missed-available'
  | null;

export type RepertoireScanLifecycleState = 'running' | 'paused' | 'complete' | 'stale';

export interface RepertoireSideInference {
  side: RepertoireSide;
  method: 'header-hint' | 'annotated-move-majority' | 'ambiguous';
  whiteAnnotatedMoves: number;
  blackAnnotatedMoves: number;
  hintText: string | null;
}

export interface RepertoireSource {
  id: string;
  name: string;
  rawPgn: string;
  side: RepertoireSide;
  inferredSide: RepertoireSide;
  sideOverride: RepertoireSide | null;
  sideInference: RepertoireSideInference;
  enabled: boolean;
  contentVersion: string;
  chapterCount: number;
  gameCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface RepertoireMatchRecord {
  key: string;
  sourceId: string;
  sourceVersion: string;
  gameId: string;
  status: RepertoireMatchStatus;
  firstDivergencePly: number | null;
  category: RepertoireDivergenceCategory;
  playedUci: Uci | null;
  missedUci: Uci | null;
  matchedDepthPly: number;
  ownerColor: 'white' | 'black';
  gameResult: string | null;
  timeClass: string | null;
  gameDate: string | null;
  accountId: string | null;
  scannedAt: number;
}

export interface RepertoireScanRun {
  runId: string;
  sourceVersions: Record<string, string>;
  scannedGameCount: number;
  lifecycleState: RepertoireScanLifecycleState;
  filtersAtRun: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface RepertoireEntry {
  uci: Uci;
  san: San;
  isMain: boolean;
  depthPly: number;
  chapterIndex: number;
  chapterTitle: string;
  sourceGameIndex: number;
  nodePathHint: string;
  comments: TreeComment[];
  nags: GlyphId[];
}

export type RepertoirePositionIndex = Map<PositionKey, RepertoireEntry[]>;

export const REPERTOIRE_SOURCE_STORE_NAME = 'repertoire-sources';
export const REPERTOIRE_MATCH_RECORD_STORE_NAME = 'repertoire-match-records';
export const REPERTOIRE_SCAN_RUN_STORE_NAME = 'repertoire-scan-runs';

export interface CreateRepertoireSourceInput {
  rawPgn: string;
  filename?: string;
  name?: string;
  sideOverride?: RepertoireSide | null;
  enabled?: boolean;
  now?: number;
}

export function repertoireMatchRecordKey(sourceId: string, gameId: string): string {
  return `${sourceId}::${gameId}`;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashRepertoirePgnContent(rawPgn: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SHA-256 hashing requires crypto.subtle');
  return hex(await subtle.digest('SHA-256', new TextEncoder().encode(rawPgn)));
}

export function repertoireSourceIdFromContentVersion(contentVersion: string): string {
  return `rep-${contentVersion}`;
}

function cleanSourceName(input: string | undefined, fallback: string): string {
  const trimmed = input?.trim();
  return trimmed ? trimmed : fallback;
}

function headerHintSide(text: string): RepertoireSide | null {
  const normalized = text.replace(/[-_]+/g, ' ');
  const hasWhiteHint =
    /\bwhite\s+repertoire\b/i.test(normalized) ||
    /\brepertoire\s+for\s+white\b/i.test(normalized) ||
    /\bfor\s+white\b/i.test(normalized) ||
    /\bas\s+white\b/i.test(normalized) ||
    /\bwhite\s+side\b/i.test(normalized) ||
    /\bwhite\s+course\b/i.test(normalized);
  const hasBlackHint =
    /\bblack\s+repertoire\b/i.test(normalized) ||
    /\brepertoire\s+for\s+black\b/i.test(normalized) ||
    /\bfor\s+black\b/i.test(normalized) ||
    /\bas\s+black\b/i.test(normalized) ||
    /\bblack\s+side\b/i.test(normalized) ||
    /\bblack\s+course\b/i.test(normalized);

  if (hasWhiteHint && !hasBlackHint) return 'white';
  if (hasBlackHint && !hasWhiteHint) return 'black';
  return null;
}

function sideMovedOnPly(ply: number): 'white' | 'black' {
  return ply % 2 === 1 ? 'white' : 'black';
}

function visitTree(node: TreeNode, visitor: (node: TreeNode, path: string) => void, path = ''): void {
  visitor(node, path);
  for (const child of node.children) {
    visitTree(child, visitor, path + child.id);
  }
}

function sideInferenceHintText(games: ParsedRepertoireGame[], sourceName: string | undefined): string {
  const headerValues = games.flatMap(game =>
    [
      game.title,
      game.headers.ChapterName,
      game.headers.Event,
      game.headers.Opening,
      game.headers.Variation,
      game.headers.Annotator,
    ].filter((value): value is string => Boolean(value?.trim())),
  );
  return [sourceName, ...headerValues].filter((value): value is string => Boolean(value?.trim())).join(' ');
}

export function inferRepertoireSide(
  games: ParsedRepertoireGame[],
  sourceName?: string,
): RepertoireSideInference {
  let whiteAnnotatedMoves = 0;
  let blackAnnotatedMoves = 0;

  for (const game of games) {
    visitTree(game.tree, node => {
      if (!node.uci) return;
      const annotationCount = (node.comments?.length ?? 0) + (node.nags?.length ?? 0);
      if (annotationCount === 0) return;
      if (sideMovedOnPly(node.ply) === 'white') whiteAnnotatedMoves += 1;
      else blackAnnotatedMoves += 1;
    });
  }

  const hintText = sideInferenceHintText(games, sourceName);
  const hintedSide = headerHintSide(hintText);
  if (hintedSide) {
    return {
      side: hintedSide,
      method: 'header-hint',
      whiteAnnotatedMoves,
      blackAnnotatedMoves,
      hintText,
    };
  }

  if (whiteAnnotatedMoves >= 2 && whiteAnnotatedMoves >= blackAnnotatedMoves * 2) {
    return {
      side: 'white',
      method: 'annotated-move-majority',
      whiteAnnotatedMoves,
      blackAnnotatedMoves,
      hintText: hintText || null,
    };
  }

  if (blackAnnotatedMoves >= 2 && blackAnnotatedMoves >= whiteAnnotatedMoves * 2) {
    return {
      side: 'black',
      method: 'annotated-move-majority',
      whiteAnnotatedMoves,
      blackAnnotatedMoves,
      hintText: hintText || null,
    };
  }

  return {
    side: 'both',
    method: 'ambiguous',
    whiteAnnotatedMoves,
    blackAnnotatedMoves,
    hintText: hintText || null,
  };
}

export async function createRepertoireSource(input: CreateRepertoireSourceInput): Promise<RepertoireSource> {
  const rawPgn = input.rawPgn;
  const contentVersion = await hashRepertoirePgnContent(rawPgn);
  const games = parseRepertoirePgn(rawPgn);
  const fallbackName = cleanSourceName(input.filename, 'Imported repertoire');
  const name = cleanSourceName(input.name, fallbackName);
  const sideInference = inferRepertoireSide(games, name);
  const sideOverride = input.sideOverride ?? null;
  const now = input.now ?? Date.now();

  return {
    id: repertoireSourceIdFromContentVersion(contentVersion),
    name,
    rawPgn,
    side: sideOverride ?? sideInference.side,
    inferredSide: sideInference.side,
    sideOverride,
    sideInference,
    enabled: input.enabled ?? true,
    contentVersion,
    chapterCount: games.length,
    gameCount: games.length,
    createdAt: now,
    updatedAt: now,
  };
}

export function withRepertoireSourceSideOverride(
  source: RepertoireSource,
  sideOverride: RepertoireSide | null,
  now = Date.now(),
): RepertoireSource {
  return {
    ...source,
    sideOverride,
    side: sideOverride ?? source.inferredSide,
    updatedAt: now,
  };
}

export async function withRepertoireSourceContent(
  source: RepertoireSource,
  rawPgn: string,
  now = Date.now(),
): Promise<RepertoireSource> {
  const contentVersion = await hashRepertoirePgnContent(rawPgn);
  const games = parseRepertoirePgn(rawPgn);
  const sideInference = inferRepertoireSide(games, source.name);
  return {
    ...source,
    rawPgn,
    contentVersion,
    sideInference,
    inferredSide: sideInference.side,
    side: source.sideOverride ?? sideInference.side,
    chapterCount: games.length,
    gameCount: games.length,
    updatedAt: now,
  };
}

function cloneComments(comments: TreeComment[] | undefined): TreeComment[] {
  return (comments ?? []).map(comment => ({
    ...comment,
    by: typeof comment.by === 'string' ? comment.by : { ...comment.by },
  }));
}

function entryForChild(
  child: TreeNode,
  isMain: boolean,
  rootPly: number,
  chapterIndex: number,
  game: ParsedRepertoireGame,
  nodePathHint: string,
): RepertoireEntry | null {
  if (!child.uci || !child.san) return null;
  return {
    uci: child.uci,
    san: child.san,
    isMain,
    depthPly: child.ply - rootPly,
    chapterIndex,
    chapterTitle: game.title,
    sourceGameIndex: game.sourceGameIndex,
    nodePathHint,
    comments: cloneComments(child.comments),
    nags: [...(child.nags ?? [])],
  };
}

function addEntriesForNode(
  index: RepertoirePositionIndex,
  game: ParsedRepertoireGame,
  chapterIndex: number,
  node: TreeNode,
  path: string,
  rootPly: number,
): void {
  if (node.children.length > 0) {
    const posKey = positionKeyFromFen(node.fen);
    const entries = index.get(posKey) ?? [];

    node.children.forEach((child, childIndex) => {
      const entry = entryForChild(
        child,
        childIndex === 0,
        rootPly,
        chapterIndex,
        game,
        path + child.id,
      );
      if (entry) entries.push(entry);
    });

    entries.sort((a, b) => Number(b.isMain) - Number(a.isMain));
    index.set(posKey, entries);
  }

  for (const child of node.children) {
    addEntriesForNode(index, game, chapterIndex, child, path + child.id, rootPly);
  }
}

export function buildRepertoireIndex(games: ParsedRepertoireGame[]): RepertoirePositionIndex {
  const index: RepertoirePositionIndex = new Map();
  games.forEach((game, chapterIndex) => {
    addEntriesForNode(index, game, chapterIndex, game.tree, '', game.tree.ply);
  });
  return index;
}

export function buildRepertoireIndexFromPgn(rawPgn: string): RepertoirePositionIndex {
  return buildRepertoireIndex(parseRepertoirePgn(rawPgn));
}

export function buildRepertoireIndexFromSource(source: Pick<RepertoireSource, 'rawPgn'>): RepertoirePositionIndex {
  return buildRepertoireIndexFromPgn(source.rawPgn);
}

export function lookupRepertoireEntriesByFen(
  index: RepertoirePositionIndex,
  fen: string,
): RepertoireEntry[] {
  return index.get(positionKeyFromFen(fen)) ?? [];
}

export { parseRepertoirePgn, type ParsedRepertoireGame };
